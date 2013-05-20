/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Syncstore implementation backed by mysql.
 *
 * This implemenation uses one table to hold collection-level metadata,
 * and another to hold the contents of each collection:
 *
 *    collections:
 *      id, userid, collection, version
 *
 *    items:
 *      collectionid, item, version, body
 *
 * Concurrency control is achieved by taking read/write locks against the
 * user's rows of the collections table.
 *
 */

const util = require('util');
const events = require('events');
const async = require('async');
const mysql = require('../mysql/wrapper.js');
const config = require('../config');
const Hapi = require('hapi');
const syncstore = require('../syncstore.js');

const CREATE_TABLE_COLLECTIONS =
  "CREATE TABLE IF NOT EXISTS collections (" +
    "collectionid INTEGER AUTO_INCREMENT PRIMARY KEY, " +
    "userid VARCHAR(255) NOT NULL, " +
    "collection VARCHAR(255) NOT NULL, " +
    "version INTEGER NOT NULL, " +
    "UNIQUE idx_user_collection (userid, collection) " +
    ") ENGINE=InnoDB;"
;

const CREATE_TABLE_ITEMS =
  "CREATE TABLE IF NOT EXISTS items (" +
    "collectionid INTEGER NOT NULL, " +
    "id VARCHAR(64) NOT NULL, " +
    "version INTEGER NOT NULL, " +
    "timestamp INTEGER NOT NULL, " +
    "payload MEDIUMTEXT NOT NULL, " +
    "deleted TINYINT NOT NULL DEFAULT 0, " +
    "UNIQUE idx_collection_item (collectionid, id) " +
    ") ENGINE=InnoDB;"
;

const SELECT_COLLECTIONS_FOR_READ =
  "SELECT collectionid, collection, version FROM collections " +
  "WHERE userid = ? " +
  "LOCK IN SHARE MODE"
;

const SELECT_COLLECTIONS_FOR_WRITE =
  "SELECT collectionid, collection, version FROM collections " +
  "WHERE userid = ? " +
  "FOR UPDATE"
;

const CREATE_COLLECTION =
  "INSERT INTO collections (userid, collection, version) " +
  "VALUES (?, ?, 0)"
;

const UPDATE_COLLECTION_VERSION =
  "UPDATE collections SET version = ? " +
  "WHERE userid = ? AND collection = ?"
;

const SELECT_ALL_ITEMS =
  "SELECT id, version, timestamp, payload, deleted FROM items " +
  "WHERE collectionid = ?"
;

const UPSERT_ITEMS =
  "INSERT INTO items " +
  "  (collectionid, id, version, timestamp, payload, deleted) " +
  "VALUES ? ON DUPLICATE KEY UPDATE "+
  "  version = VALUES(version), " +
  "  timestamp = VALUES(timestamp), " +
  "  payload = VALUES(payload), " +
  "  deleted = VALUES(deleted)"
;

const DELETE_ALL_DATA = 
  "DELETE i, c FROM items AS i INNER JOIN collections AS c " +
  "ON i.collectionid = c.collectionid " +
  "WHERE c.userid = ?"
;


module.exports = function (options, cb) {
  var store = new module.exports.Store(options);
  if (cb) {
    store.once('error', cb);
    store.once('connect', function(store) {
      cb(null, store);
    });
  }
  return store;
};


module.exports.Store = Store;
util.inherits(Store, events.EventEmitter);

function Store(options) {
  var self = this;
  events.EventEmitter.call(this);
  options = Hapi.utils.merge(options, config.get('mysql'));
  async.series([

    // Create the database and tables, if necessary.
    function createSchemaIfRequired(cb) {
      if (!options.create_schema) return cb();
      // Fudge the options object to avoid connecting to a nonexistent db.
      var database = options.database;
      delete options.database;
      var client = mysql.createConnection(options);
      client.query('CREATE DATABASE IF NOT EXISTS ' + database, function(err) {
        if (err) return cb(err);
        client.query('USE ' + database, function(err) {
          if (err) return cb(err);
          // Create each table in turn.
          client.query(CREATE_TABLE_COLLECTIONS, function(err) {
            if (err) return cb(err);
            client.query(CREATE_TABLE_ITEMS, function(err) {
              if (err) return cb(err);
              // Reset the database name for future connections.
              options.database = database;
              cb();
            });
          });
        });
      });
    },

    // Establish a long-lived connection pool.
    function connectToTheDatabase(cb) {
      self.pool = mysql.createPool(options);
      cb();
    }

  ], function(err) {
    if (err) {
      self.emit('error', err);
    } else {
      self.emit('connect', self);
    }
  });
}


Store.prototype.close = function close(cb) {
  this.pool.end(cb);
};


// Get the set of collections and their correpsonding version numbers.
//
// This information can be read straight out of the 'collections' table.
//
Store.prototype.getCollections = function getCollections(userid, cb) {
  this.withTransaction(function(client, cb) {
    client.query(SELECT_COLLECTIONS_FOR_READ, [userid], function(err, res) {
      if (err) return cb(err);
      var version = 0;
      var collections = {};
      for(var i=0; i<res.length; i++) {
        collections[res[i].collection] = res[i].version;
        if (res[i].version > version) {
          version = res[i].version;
        }
      }
      return cb(null, {version: version, collections: collections});
    });
  }, cb);
};


// Get all items in a collection.
//
// This can be read straight out of the 'items' table, but we first
// have to look up the collection id and take the read lock.
//
Store.prototype.getItems = function getItems(userid, collection, cb) {
  this.withTransaction(function(client, cb) {
    client.query(SELECT_COLLECTIONS_FOR_READ, [userid], function(err, res) {
        if (err) return cb(err);
        // We selected all collection rows for locking purposes.
        // Find the particular collection of interest by looping through.
        var c = null;
        for (var i=0; i<res.length; i++) {
          if (res[i].collection === collection) {
            c = res[i];
            break;
          }
        }
        if (!c) return cb(null, { version: 0, items: {} });
        client.query(SELECT_ALL_ITEMS, [c.collectionid], function(err, res) {
          if (err) return cb(err);
          var items = {};
          for(var i=0; i<res.length; i++) {
            var id = res[i].id;
            items[id] = res[i];
            items[id].deleted = !!items[id].deleted;
          }
          return cb(null, { version: c.version, items: items });
        });
      }
    );
  }, cb);
};


// Update some items in a collection.
//
// First we find the collectionid, taking an exclusive lock to prevent
// races.  Then we upsert into the 'items' table.
//
Store.prototype.setItems = function setItems(userid, collection, items, ver, cb) {
  var self = this;
  if (typeof ver === 'function' && typeof cb === 'undefined') {
    cb = ver;
    ver = undefined;
  }

  this.withTransaction(function(client, cb) {
    async.waterfall([

      function selectOrCreateCollection(cb) {
        var params = [userid];
        client.query(SELECT_COLLECTIONS_FOR_WRITE, params, function(err, res) {
          if (err) return cb(err);
          // We selected all collection rows for locking purposes.
          // Find the particular collection of interest by looping through.
          var c = null;
          var maxVersion = 0;
          for (var i=0; i<res.length; i++) {
            if (res[i].collection === collection) {
              c = res[i];
            }
            if (res[i].version > maxVersion) {
              maxVersion = res[i].version;
            }
          }
          if (c) return cb(null, c, maxVersion + 1);
          // No such collection, let's create it now.
          // The range lock should prevent races on this creation. I think.
          // Regardless, there's no danger of data corruption from a race.
          var params = [userid, collection];
          client.query(CREATE_COLLECTION, params, function(err, res) {
            if (err) return cb(err);
            c = {collectionid: res.insertId, version: 0};
            return cb(null, c, maxVersion + 1);
          });
        });
      },

      function checkVersionPrecondition(c, newVersion, cb) {
        if (typeof ver !== 'undefined' && ver < c.version) {
          return cb(syncstore.ERROR_VERSION_MISMATCH);
        }
        return cb(null, c, newVersion);
      },

      function upsertItems(c, newVersion, cb) {
        var now = +new Date();
        var values = [];
        for(var k in items) {
          if(items.hasOwnProperty(k)) {
            var item = items[k];
            values.push([
              c.collectionid, k, newVersion, now,
              (item.payload && !item.deleted) ? item.payload : '',
              item.deleted ? 1 : 0
            ]);
          }
        }
        client.query(UPSERT_ITEMS, [values], function(err) {
          return cb(err, newVersion);
        });
      },

      function updateCollectionVersion(newVersion, cb) {
        var params = [newVersion, userid, collection];
        client.query(UPDATE_COLLECTION_VERSION, params, function(err) {
          self.emit('change', userid, collection, newVersion);
          return cb(err, {version: newVersion});
        });
      },

    ], cb);
  }, cb);
};



// Delete the data stored for the given userid.
//
Store.prototype.deleteUserData = function deleteUserData(userid, cb) {
  var self = this;
  this.withTransaction(function(client, cb) {
    client.query(DELETE_ALL_DATA, [userid], function(err) {
      if (err) return cb(err);
      self.emit('change', userid, null, null);
      return cb();
    });
  }, cb);
};



// Helper method to execute a complete transaction.
//
Store.prototype.withTransaction = function withTransaction(body, cb) {
  this.pool.getConnection(function(err, client) {
    if (err) return cb(err);
    client.query("BEGIN", function(err) {
      if (err) return cb(err);

      // "Finally" callback, which commits or rolls back depending
      // on whether an error occurred.
      var done = function done(err) {
        var doneArgs = arguments;
        if (err) {
          client.query("ROLLBACK", function(err) {
            client.end();
            if (err) return cb(err);
            cb.apply(null, doneArgs);
          });
        } else {
          client.query("COMMIT", function(err) {
            client.end();
            if (err) return cb(err);
            cb.apply(null, doneArgs);
          });
        }
      };

      // Execute the body, ensuring that we always clean up after error.
      try {
        body(client, done);
      } catch (err) {
        done(err);
      }
    });
  });
};
