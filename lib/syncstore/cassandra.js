/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Syncstore implementation backed by cassandra and memcached.
 *
 * This implemenation uses cassandra for the bulk data storage, and memcached
 * for a simple locking mechanism to enforce strong consistency.  There's
 * one table for collection-level metadata, and another storing the items
 * for each collection.
 *
 */

const util = require('util');
const events = require('events');
const async = require('async');
const memcached = require('memcached');
const helenus = require('helenus');
const Hapi = require('hapi');

const config = require('../config');
const syncstore = require('../syncstore.js');

const CREATE_TABLE_COLLECTIONS =
  "CREATE TABLE collections ( " +
    "userid text, " +
    "collection text, " +
    "version varint, " +
    "PRIMARY KEY (userid, collection) " +
  ");"
;

const CREATE_TABLE_ITEMS =
  "CREATE TABLE items (" +
    "userid ascii, " +
    "collection ascii, " +
    "id ascii, " +
    "version varint, " +
    "timestamp bigint, " +
    "payload text, " +
    "deleted int, " +
    "PRIMARY KEY (userid, collection, id) " +
  ")"
;

const SELECT_COLLECTIONS =
  "SELECT collection, version FROM collections " +
  "WHERE userid = ?"
;

const SELECT_ITEMS =
  "SELECT id, version, timestamp, payload, deleted FROM items " +
  "WHERE userid = ? AND collection = ?"
;

const SET_COLLECTION_VERSION =
  "INSERT INTO collections (userid, collection, version) " +
  "VALUES (?, ?, ?)"
;

const SET_ITEM_DETAILS =
  "INSERT INTO items " +
  " (userid, collection, id, version, timestamp, payload, deleted) " +
  "VALUES (?, ?, ?, ?, ?, ?, ?)"
;

const DELETE_ALL_DATA =
  "BEGIN BATCH " +
  " DELETE FROM items WHERE userid = ?; " +
  " DELETE FROM collections WHERE userid = ?; " +
  "APPLY BATCH"
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
  options = Hapi.utils.merge(options, config.get('cassandra'));
  options.memcached = Hapi.utils.merge(options.memcached,
                                       config.get('memcached'));
  // XXX TODO: have convict parse this into a list for us automatically.
  if (typeof options.hosts === 'string') {
    options.hosts = options.hosts.split(',');
  }
  if (typeof options.memcached.hosts === 'string') {
    options.memcached.hosts = options.memcached.hosts.split(',');
  }
  options.cqlVersion = "3.0.0";
  async.series([

    // Establish a long-lived connection to cassandra.
    function connectToCassandra(cb) {
      self.pool = new helenus.ConnectionPool(options);
      self.pool.on('error', function(err) {
        self.emit('error', err);
      });
      self.pool.connect(function(err) {
        // This might fail if the keyspace does not exist.
        // We can create it and try again.
        if (!err) return cb();
        if (!options.create_schema) return cb(err);
        var missingKeyspaceRE = /Could Not Connect To Any Nodes/;
        if (!missingKeyspaceRE.exec(err.toString())) return cb(err);
        // Use a fresh pool for the keyspace creation.
        // There may be a way to reuse self.pool, but it escapes me...
        var createOptions = {hosts: options.hosts};
        var createPool = new helenus.ConnectionPool(createOptions);
        createPool.once('error', cb);
        createPool.connect(function(err) {
          if (err) return cb(err);
          createPool.createKeyspace(options.keyspace, function(err) {
            if (err) return cb(err);
            createPool.once('close', function() {
              self.pool.connect(cb);
            });
            createPool.close();
          });
        });
      });
    },

    // Create the necessary tables, if they don't exist.
    function createSchemaIfRequired(cb) {
      if (!options.create_schema) return cb();
      // XXX TODO: how do we introspect details of the error?
      var alreadyExistsRE = /Cannot add already existing column family/;
      var queries = [CREATE_TABLE_COLLECTIONS, CREATE_TABLE_ITEMS];
      async.eachSeries(queries, function(query, cb) {
        self.pool.cql(query, [], function(err) {
          if (err && alreadyExistsRE.exec(err.toString())) err = null;
          return cb(err);
        });
      }, cb);
    },

    // Establish a long-lived connection to memcached.
    function connectToMemcached(cb) {
      var hosts = options.memcached.hosts;
      self.memcached = new memcached(hosts, options.memcached);
      return cb();
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
  this.memcached.end();
  this.client.once('close', function() {
    cb();
  });
  this.client.close();
};


// Get the set of collections and their correpsonding version numbers.
//
Store.prototype.getCollections = function getCollections(userid, cb) {
  var client = this.pool;
  client.cql(SELECT_COLLECTIONS, [userid], function(err, rows) {
    if (err) return cb(err);
    var version = 0;
    var collections = {};
    rows.forEach(function(row) {
      var c = row.get('collection').value;
      var v = row.get('version').value;
      collections[c] = v;
      if (v > version) {
        version = v;
      }
    });
    return cb(null, {version: version, collections: collections});
  });
};


// Get all items in a collection.
//
//
Store.prototype.getItems = function getItems(userid, collection, cb) {
  var client = this.pool;
  client.cql(SELECT_ITEMS, [userid, collection], function(err, rows) {
    if (err) return cb(err);
    var items = {};
    var version = 0;
    rows.forEach(function(row) {
      var item = {};
      row.forEach(function(name, value) {
        item[name] = value;
      });
      item.deleted = !!item.deleted;
      items[item.id] = item;
      if (item.version > version) {
        version = item.version;
      }
    });
    return cb(null, { version: version, items: items });
  });
};


// Update some items in a collection.
//
//
Store.prototype.setItems = function setItems(userid, collection, items, ver, cb) {
  var self = this;
  if (typeof ver === 'function' && typeof cb === 'undefined') {
    cb = ver;
    ver = undefined;
  }

  this.withWriteLock(userid, function(client, cb) {
    async.waterfall([

      function allocateNewVersionNumber(cb) {
        client.cql(SELECT_COLLECTIONS, [userid], function(err, rows) {
          if (err) return cb(err);
          // Find the max version number currently in use.
          // Also check the version precondition if necessary.
          var maxVersion = 0;
          var preConditionOK = true;
          rows.forEach(function(row) {
            var v = row.get('version').value;
            if (v > maxVersion) {
              maxVersion = v;
            }
            if (row.get('collection').value === collection) {
              if (typeof ver !== 'undefined' && ver < v) {
                preConditionOK = false;
              }
            }
          });
          if (!preConditionOK) return cb(syncstore.ERROR_VERSION_MISMATCH);
          return cb(null, maxVersion + 1);
        });
      },

      function allocateBatchOfCommands(newVersion, cb) {
        var batch = [];
        return cb(null, newVersion, batch);
      },

      function writeCollectionVersion(newVersion, batch, cb) {
        batch.push([SET_COLLECTION_VERSION, [userid, collection, newVersion]]);
        return cb(null, newVersion, batch);
      },

      function writeItems(newVersion, batch, cb) {
        var now = +new Date();
        for(var k in items) {
          if(items.hasOwnProperty(k)) {
            var item = items[k];
            var payload = (item.payload && !item.deleted) ? item.payload : '';
            var deleted = item.deleted ? 1 : 0;
            batch.push([
              SET_ITEM_DETAILS,
              [userid, collection, k, newVersion, now, payload, deleted],
            ]);
          }
        }
        return cb(null, newVersion, batch);
      },

      function flushBatchToDatabase(newVersion, batch, cb) {
        // XXX TODO: can we stream individual commands in a batch?
        // Doing it all as one big string puts an upper bound on write size.
        var query = "BEGIN BATCH ";
        var params = [];
        batch.forEach(function(item) {
          query += item[0] + "; ";
          params = params.concat(item[1]);
        });
        query += "APPLY BATCH";
        client.cql(query, params, function(err) {
          if (err) return cb(err);
          self.emit('change', userid, collection, newVersion);
          return cb(null, {version: newVersion});
        });
      }

    ], cb);
  }, cb);
};



// Delete the data stored for the given userid.
//
Store.prototype.deleteUserData = function deleteUserData(userid, cb) {
  var self = this;
  var client = this.pool;
  client.cql(DELETE_ALL_DATA, [userid, userid], function(err) {
    if (err) return cb(err);
    self.emit('change', userid, null, null);
    return cb();
  });
};


// Helper method to execute code while holding the write lock.
// This does a simple atomic-add in memcached to obtain the lock.
//
Store.prototype.withWriteLock = function withWriteLock(userid, body, cb) {
  var self = this;
  var lockKey = "syncstorage/cassandra/lock/" + userid;
  var lifetime = 5 * 60;  // 5 minute ttl, then the lock expires.
  this.memcached.add(lockKey, '', lifetime, function(err) {
    if (err) {
      if (err.notStored) return cb(syncstore.ERROR_WRITE_CONFLICT);
      return cb(err);
    }

    var done = function done() {
      var doneArgs = arguments;
      // XXX TODO: should check to be sure the lock has not expired.
      self.memcached.del(lockKey, function() {
        return cb.apply(null, doneArgs);
      });
    };

    try {
      body(self.pool, done);
    } catch (err) {
      cb(done);
    }
  });
};
