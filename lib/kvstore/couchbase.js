/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * KVStore implementation backed by couchbase.
 *
 */

var couchbase = require('couchbase');
var config = require('../config');
var Hapi = require('hapi');


module.exports = {

  connect: function(options, cb) {
    options = Hapi.utils.merge(options, config.get('couchbase'));
    // Enable debugging by default, since we're still in development mode.
    if (options.debug !== false) options.debug = true;

    // Following the lead of couchbase node module, this is using closures
    // and simple objects rather than instantiating a prototype connection.

    function get(key, cb) {
      couchbase.connect(options, function(err, bucket) {
        if (err) return cb(err);
        bucket.get(key, function(err, value, meta) {
          if (err) {
            if (err.code === couchbase.errors.keyNotFound) {
              return cb(null, null);
            }
            return cb(err);
          }
          return cb(null, { value: value, casid: meta.cas });
        });
      });
    }

    function set(key, value, cb) {
      couchbase.connect(options, function(err, bucket) {
        if (err) return cb(err);
        bucket.set(key, value, function(err) {
          cb(err);
        });
      });
    }

    function cas(key, value, casid, cb) {
      couchbase.connect(options, function(err, bucket) {
        if (err) return cb(err);
        // Couchbase has different methods for "set if not exists" and
        // "set if not modified".  This function is the common callback
        // logic to be aplied after either.
        function handler(err) {
          if (err && err.code === couchbase.errors.keyAlreadyExists) {
            return cb('cas mismatch');
          }
          cb(err);
        }
        if (casid === null) {
          bucket.add(key, value, handler);
        } else {
          bucket.set(key, value, {cas: casid}, handler);
        }
      });
    }

    function del(key, cb) {
      couchbase.connect(options, function(err, bucket) {
        if (err) return cb(err);
        bucket.remove(key, function(err) {
          if (err) {
            if (err.code === couchbase.errors.keyNotFound) {
              err = null;
            }
          }
          cb(err);
        });
      });
    }

    cb(null, {get: get, set: set, cas: cas, delete: del});
  }

};
