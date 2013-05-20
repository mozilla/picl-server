/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * API for storing generic syncable data.
 *
 * This module provides a storage implementation to support the PiCL v0
 * storage API documented here:
 *
 * https://wiki.mozilla.org/Identity/AttachedServices/StorageProtocolZero
 *
 * The store consists of named "collections" into which are stored individual
 * "items".  Each collection has a last-modified version number, and writes
 * to the store cause this version number to increment.
 *
 * Connect to a store like this:
 *
 *     var syncstore = require('lib/syncstore');
 *     var store = syncstore.connect({<options>});
 *
 * This function takes an options hash to specify details of the underlying
 * storage backend, and will fill in default options from runtime configuration
 * data.  It returns a store object with the following methods:
 *
 *     getCollections(userid, cb(err, res)):
 *
 *         Get the set of collection names and their corresponding version
 *         number.  The result object has the form:
 *             { version:  42,   // last-modified version for the whole store
 *               collections: {
 *                 my_collection: 37,  // version for a specific collection
 *                 ...
 *             }}
 *
 *     getItems(userid, collection, cb(err, res)):
 *
 *         Get the set of all items in the named collection.  The result
 *         object has the form:
 *             { version: 42,  // last-modified version for the collection
 *               items: {
 *                item-id: { <item data> },  // data for a specific item
 *                ...
 *             }}
 *
 *     setItems(userid, collection, items, <version>, cb(err, res)):
 *
 *         Write the given set of items into the store.  New items will appear
 *         as-is, while existing items will be merged with the current value
 *         in the store.  The result object has the form:
 *             { version: 43 }  // new last-modified version for the collection
 *
 *         If the optional <version> argument is given, this method will fail
 *         if it is less than the collection's last-modified version.  The
 *         error message in this case will be 'syncstore.versionMismatch'.
 *
 *         This method can fail if concurrent writes are attempted.  The error
 *         message in this case will be 'syncstore.writeConflict'.
 *
 *    deleteUserData(userid, cb(<err>)):
 *
 *         Delete all data stored for the given user.  This resets them back
 *         to an empty data store with version number zero.
 *
 *  This store object is also an EventEmitter, with the following events:
 *
 *    connect: emitted when the connection is successfully established
 *    error:   emitted when there's an error connecting to the backend
 *    change:  emitted when the stored data changes
 *
 */

const async = require('async');
const Hapi = require('hapi');

const config = require('./config');


module.exports = {

  ERROR_WRITE_CONFLICT: 'syncstore.writeConflict',
  ERROR_VERSION_MISMATCH: 'syncstore.versionMismatch',
  connect: connect

};


var SYNCSTORE_BACKENDS = {};
var DEFAULT_OPTIONS = config.get('syncstore');


function connect(options, cb) {

  if (typeof options === 'function' && !cb) {
    cb = options;
    options = {};
  }

  options = Hapi.utils.applyToDefaults(DEFAULT_OPTIONS, options || {});

  // Load the specified backend implementation.
  if (!/^[a-zA-Z0-9_]+$/.exec(options.backend)) {
    return cb("invalid syncstore backend: " + backend);
  }
  var backend = SYNCSTORE_BACKENDS[options.backend];
  if (!backend) {
    try {
      backend = require("./syncstore/" + options.backend + ".js");
    } catch (e) { 
      if (cb) return cb(e);
      else throw e;
     }
    SYNCSTORE_BACKENDS[options.backend] = backend;
  }

  // Create an instance, using the callback as a listener.
  return backend(options, cb);
}
