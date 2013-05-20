/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * kvstore-backend implementation of the syncstore api.
 *
 * Data storage is currently implemented in top of the kvstore API, which
 * means we have to be careful with how we manage concurrency.  The data is
 * stored in a manner which makes concurrent reads and writes safe, at the
 * cost of some complexity.
 *
 * First, the top-level info about each user's collections is stored under
 * the key 'syncstore/<userid>' in exactly the format returned by the
 * getCollections() method.  This is the main control point for coordinating
 * concurrency and is the authoritative source on what data should be read.
 *
 * For each collection, its entire contents are stored under the key
 * 'syncstore/<userid>/<collection>'.  This key maintans a primitive kind of
 * rollback journal, by storing each write as a base version plus a diff.
 * The format is as follows:
 *
 *    { diff: {
 *        ts: <timestamp at which this write was done>,
 *        version: <new version number corresponding to this write>,
 *        items: <list of items written in this version>
 *      },
 *      base: {
 *        version: <previous version number before the write was done>,
 *        items: <full list of items as they were before the write>
 *      }
 *    }
 *
 * This format allows both the new version and the old version to be read at
 * any time.  Readers are expected to check the info document to see which
 * version is currently active, then either apply the diff or use the base
 * as appropriate to read that version.  The write is only "committed" when
 * the info document is updated with the new version number.
 *
 * There are a number of problems with this scheme:
 *
 *    - It's highly complex
 *    - It limits the feasible max size of a collection
 *    - It requires a retry-loop in the face of write conflicts
 *
 * But it's an interesting start...
 *
 */

const util = require('util');
const events = require('events');
const async = require('async');
const Hapi = require('hapi');
const kvstore = require('../kvstore');


// The number of milliseconds after which we can safely assume that a
// partially-completed write attempt has failed.  Currently 1 minute,
// which is extremely generous.
const WRITE_TIMEOUT = 1 * 60 * 1000;


module.exports = function connect(options, cb) {
  var store = new module.exports.Store(options);
  if (cb) {
    store.once('error', cb);
    store.once('connect', cb);
  }
  return store;
};


module.exports.Store = Store;
util.inherits(Store, events.EventEmitter);
function Store(options) {
  var self = this;
  events.EventEmitter.call(this);
  process.nextTick(function() {
    self.kv = kvstore.connect(options.kvstore || {}, function(err) {
      if (err) {
        self.emit('error', err);
      } else {
        self.emit('connect');
      }
    });
  });
}

// Get the set of collections and their correpsonding version numbers.
//
// This information is stored directly in the kvstore, so it's a simple
// matter of reading it back out.
//
Store.prototype.getCollections = function getCollections(userid, cb) {
  var infoKey = 'syncstore/' + userid;
  this.kv.get(infoKey, function(err, res) {
    if (err) return cb(err);
    if (!res) {
      cb(null, { version: 0, collections: {} });
    } else {
      cb(null, res.value);
    }
  });
};


// Get the set of all items in a collection.
//
// The contents of each collection are stored as a base/diff pair in order
// to support concurrent reads and writes.  We first have to read the info
// doc to see which version to use, then reconstruct that version from the
// stored data.
//
Store.prototype.getItems = function getItems(userid, collection, cb) {
  var self = this;
  var infoKey = 'syncstore/' + userid;
  var infoDoc = null;
  var collectionKey = 'syncstore/' + userid + '/' + collection;
  var collectionDoc = null;

  // Get the current info document, to know the most recent committed
  // version number for this collection.
  this.kv.get(infoKey, function(err, res) {
    if (err) return cb(err);
    if(!res) {
      infoDoc = { version: 0, collections: {} };
    } else {
      infoDoc = res.value;
    } 

    // If the collection doesn't exist, return empty data.
    var collectionVersion = infoDoc.collections[collection];
    if (!collectionVersion) {
      return cb(null, { version: 0, items: {}});
    }

    // Fetch the collection document.
    // It's referenced in the info doc, so it must exist.
    self.kv.get(collectionKey, function(err, res) {
      if (err) return cb(err);
      if (!res) {
          err = 'data corruption detected, ruh-roh!';
          self.emit('error', err);
          return cb(err);
      }
      collectionDoc = res.value;

      // Reconstruct the state of the collection as at the active version.
      // If collectionDoc.diff.version == the active version, then the
      // write was successfully completed and we should apply the diff.
      // If not, there's a write in progress and we should not apply it.
      var items = collectionDoc.base.items;
      if (collectionDoc.diff.version === collectionVersion) {
        items = applyDiffItems(items, collectionDoc.diff.items);
      }

      // Return the reconstructed items.
      cb(null, {
        version: collectionVersion,
        items: items
      });
    });
  });
};


// Store a set of items in the collection.
//
// To support concurrent reads and writes without conflict, this function
// keeps a primitive "rollback journal" by writing each change as a base
// version plus a diff.  The sequence of operations is as follows:
//
//   * read the info doc, to get the collection's current version number.
//   * read the collection doc and re-construct its current state.
//   * build the new state of the collection doc usin its current state as
//     the base, and the new items as the diff.
//   * cas-write the updated collection doc.
//   * build the new info doc, recording a new version number for the
//     collection.
//   * cas-write the updated info doc.
//
// Any readers entering before the info doc is updated will be able to read
// the old version of the collection, while any readers entering after it's
// updated will be able to read the new version.
//
// XXX TODO: this function is stupendously long, split it up a little!
//
Store.prototype.setItems = function setItems(userid, collection, items, ver, cb) {
  var self = this;
  if (typeof ver === 'function' && typeof cb === 'undefined') {
    cb = ver;
    ver = undefined;
  }

  var infoKey = 'syncstore/' + userid;
  var infoDoc = null;
  var collectionKey = 'syncstore/' + userid + '/' + collection;
  var collectionDoc = null;

  // Get the current info document, to know the most recent committed
  // version number for this collection.
  this.kv.get(infoKey, function(err, infoRes) {
    if (err) return cb(err);
    if(!infoRes) {
      infoDoc = { version: 0, collections: {} };
    } else {
      infoDoc = infoRes.value;
    } 

    var collectionVersion = infoDoc.collections[collection] || 0;
    var newVersion = infoDoc.version + 1;
    var newTS = Date.now();

    // If this is a conditional write, check the version number.
    if (typeof ver !== 'undefined') {
      if (ver < collectionVersion) {
        return cb('syncstore.versionMismatch');
      }
    }

    // Fetch the current collection document.
    // If it doesn't exist, fill in empty data as default.
    self.kv.get(collectionKey, function(err, colRes) {
      if (err) return cb(err);
      if (colRes) {
        collectionDoc = colRes.value;
      } else {
        collectionDoc = {
          base: { version: 0, items: {} },
          diff: { version: 0, items: {}, ts: 0 }
        };
      }

      // Reconstruct the state of the collection as at the active version.
      // If there's diff data for a newer version, this indicates that
      // a write is already in progress.  Check the timestamp and overwrite
      // if it seems to have died, otherwise error out.
      var oldItems = collectionDoc.base.items;
      if (collectionDoc.diff.version === collectionVersion) {
        oldItems = applyDiffItems(oldItems, collectionDoc.diff.items);
      } else if (collectionDoc.base.version === collectionVersion) {
        if (collectionDoc.diff.ts + WRITE_TIMEOUT >= Date.now()) {
          return cb('syncstore.writeConflict');
        }
      } else {
        // The data in the collection does not match the version from
        // the info doc!  Either we're in the middle of doing a delete,
        // or something has gone horribly wrong...
        if (collectionVersion > 0)  {
          err = 'data corruption detected, ruh-roh!';
          this.emit('error', err);
          return cb(err);
        }
        oldItems = {};
      }

      // Normalize the set of new items, merging in any existing ones
      // as appropriate.
      var newItems = {};
      for (var id in items) {
        var newItem = Hapi.Utils.clone(items[id]);
        newItem.version = newVersion;
        newItem.timestamp = newTS;
        if (oldItems.hasOwnProperty(id)) {
          newItems[id] = mergeItemFields(newItem, oldItems[id]);
        } else {
          newItems[id] = setDefaultFields(newItem);
        }
      }

      // Write the collection back out with the new items as a diff.
      // If this fails, there was a concurrent write from someone else.
      var newCollectionDoc = {
        base: { version: collectionVersion, items: oldItems },
        diff: { version: newVersion, items: newItems }
      };
      var casid = colRes ? colRes.casid : null;
      self.kv.cas(collectionKey, newCollectionDoc, casid, function(err) {
        if (err) {
          if (err !== 'cas mismatch' ) return cb(err);
          return cb('syncstore.writeConflict');
        }

        // Write the info doc with the new verison num for the collection.
        // If this fails, there was a concurrent write to another 
        // collection.  If it succeeds, the write will be committed.
        infoDoc.version = newVersion;
        infoDoc.collections[collection] = newVersion;
        var casid = infoRes ? infoRes.casid : null;
        self.kv.cas(infoKey, infoDoc, casid, function(err) {
          if (err) {
            if (err !== 'cas mismatch' ) return cb(err);

            // We can't leave the half-completed write in place, or
            // the calling code won't be able to retry it.  It's safe
            // to just overwrite it with the old value, because any
            // concurrent write attempts would have detected the
            // in-progress write and aborted.
            if (collectionDoc.diff.version === 0) {
              self.kv.delete(collectionKey, function(err) {
                if (err) return cb(err);
                return cb('syncstore.writeConflict');
              });
            } else {
              self.kv.set(collectionKey, collectionDoc, function(err) {
                if (err) return cb(err);
                return cb('syncstore.writeConflict');
              });
            }
            return;
          }

          // Success!  Return the updated version number to the caller.
          self.emit('change', userid, collection, newVersion);
          return cb(null, { version: newVersion });
        });
      });
    });
  });
};


// Delete the data stored for the given userid.
//
//
Store.prototype.deleteUserData = function deleteUserData(userid, cb) {
  var self = this;

  // Get the current info document, to know the list of collections.
  var infoKey = 'syncstore/' + userid;
  this.kv.get(infoKey, function(err, info) {
    if (err) return cb(err);
    if(!info) return cb(null);

    // Delete the info document first.
    // This will allow any concurrent clients to see the deletion
    // and avoid using mismatched, undeleted collection data..
    self.kv.delete(infoKey, function(err) {
      if (err) return cb(err);

      // Now delete the stored data for each collection.
      // Unfortunately there's no atomic "delete if unmodified" so
      // there's a race condition here if a concurrent writer is trying
      // to re-create these collections.
      var collections = Object.keys(info.value.collections);
      async.each(collections, function(collection, cb) {
        var collectionKey = 'syncstore/' + userid + '/' + collection;
        self.kv.delete(collectionKey, function(err) {
          return cb(err);
        });
      }, function(err) {
        self.emit('change', userid, null, null);
        return cb(err);
      });
    });
  });
};


// Helper function to apply a differential set of items to a base set.
// This is needed when reading our base/diff storage format.
//
function applyDiffItems(baseItems, diffItems) {
  for (var id in diffItems) {
    if (diffItems.hasOwnProperty(id)) {
      baseItems[id] = diffItems[id];
    }
  }
  return baseItems;
}


// Helper function to merge field updates into an existing item.
//
function mergeItemFields(newItem, oldItem) {
  for (var key in oldItem) {
    if (oldItem.hasOwnProperty(key) && !newItem.hasOwnProperty(key)) {
      newItem[key] = oldItem[key];
    }
  }
  setDefaultFields(newItem);
  return newItem;
}

// Helper function to set default field values on an item.
//
function setDefaultFields(item) {
  if (!item.payload || item.deleted) item.payload = '';
  if (!item.deleted) item.deleted = false;
  return item;
}
