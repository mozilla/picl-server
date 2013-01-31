/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * KVStore implementation backed by couchbase.
 *
 */

var couchbase = require('couchbase');


module.exports = {

  connect: function(options, cb) {
    couchbase.connect(options, function(err, bucket) {
      if(err) { return cb(err); }

      // Following the lead of couchbase node module, this is using closures
      // and simple objects rather than instantiating a prototype connection.

      function get(key, cb) {
        bucket.get(key, function(err, value, meta) {
          if(err) { return cb(err); }
          cb(null, {value: value, casid: meta.cas});
        }
      }

      function set(key, value, cb) {
        bucket.set(key, value, null, function(err) {
          cb(err);
        });
      }

      function cas(key, value, casid, cb) {
        bucket.set(key, value, {cas: casid}, function(err) {
          cb(err);
        });
      }

      cb(null, {get:get, set:set, cas:cas});
    });
  }

};
