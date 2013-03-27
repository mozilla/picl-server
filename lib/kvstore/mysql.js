/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * KVStore implementation backed by couchbase.
 *
 */

const mysql = require('mysql');
const config = require('../config');
const Hapi = require('hapi');


module.exports = {

  connect: function(options, cb) {
    options = Hapi.utils.merge(options, config.get('mysql'));

    // Helper function for connecting to MySQL.
    //
    // XXX TODO: Lots of stuff: connection pooling, auto-reconnect, etc.
    // We should pinch all the good stuff from browserid's db backend.
    //
    function takeConnection(handler, cb) {
      var client = mysql.createClient(options);
      client.on('error', function(err) {
        if(cb) {
          cb(err);
          cb = null;
        }
      });
      handler(client, function(err) {
        client.end();
        if(cb) {
          cb(err);
          cb = null;
        }
      });
    };

    function get(key, cb) {
      takeConnection(function(client, cb) {
        var query = "SELECT value, casid FROM kvstore WHERE key = ?"
        client.query(query, [key], function(err, results, fields) {
          if(err) return cb(err);
          if(!results.length) return cb(null, null);
          return cb(null, {
            value: results[0].value,
            casid: results[0].casid
          });
        });
      }, cb);
    }

    function set(key, value, cb) {
      takeConnection(function(client, cb) {
        var query = "INSERT INTO kvstore (key, value, casid)" +
                    " VALUES (?, ?, 0)" +
                    " ON DUPLICATE KEY UPDATE" +
                    " value=VALUES(value), casid = casid + 1";
        client.query(query, [key, value], function(err) {
          return cb(err);
        });
      }, cb);
    }

    function cas(key, value, casid, cb) {
      var query;
      if(casid === null) {
        query = "INSERT INTO kvstore (value, key, casid)" +
                " VALUES (?, ? 0)";
      } else {
        query = "UPDATE kvstore SET value=?, casid=casid+1" +
                " WHERE key = ? and casid = ?";
      }
      takeConnection(function(client, cb) {
        client.query(query, [value, key, casid], function(err) {
          // XXX TODO: check for a constraint violation if casid == null.
          // XXX TODO: check for num rows updated if casid != null.
          console.log(err);
          return cb(err);
        });
      }, cb);
    }

    function del(key, cb) {
      var query = "DELETE FROM kvstore WHERE key=?";
      takeConnection(function(client, cb) {
        client.query(query, [key], function(err) {
          return cb(err);
        });
      }, cb);
    }

    takeConnection(function(client, cb) {
      var query = "CREATE TABLE IF NOT EXISTS kvstore " +
                  "(key VARCHAR(255) NOT NULL UNIQUE, " +
                  " value TEXT NOT NULL, casid INTEGER NOT NULL)";
      client.query(query, function(err) {
        return cb(err);
      });
    }, function(err) {
      if(err) return cb(err);
      process.nextTick(function() {
        cb(null, {get: get, set: set, cas: cas, delete: del});
      });
    });
  }

};
