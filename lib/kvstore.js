/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Very lightly abstracted key-value storage for MyFirefox projects.
 *
 * This module provides a simple key-value storage API that abstracts away
 * the details of the underlying storage server.  It explicitly mirrors the
 * model used by the memcache protocol.  In production it's currently intended
 * to be couchbase; for local development you can use an in-memory store.
 *
 * To obtain a database connection, call the connect function like this:
 *
 *    kvstore = require("lib/kvstore")
 *    kvstore.connect({<options>}, function(err, db) {
 *        ...do stuff with the db...
 *    }
 *
 * Default options for the connection will be filled in at runtime, either
 * from the environment or configuration file.
 *
 * The resulting db object has the following methods:
 *
 *    get(key, cb(<err>, <info>))
 *    set(key, value, cb(<err>))
 *    cas(key, value, casid, cb(<err>))
 *
 * Here's an example of how they might be used:
 *
 *  db.get("mydata", function(err, info) {
 *      if(err) throw err;
 *      console.log("My data is currently: " + info.value);
 *      db.cas("mydata", info.value + "newdata", info.casid, function(err) {
 *          if(err) throw "oh noes there was a write conflict";
 *      });
 *  });
 *
 */

var config = require('./config');

// The set of default options to use for new db connections in this process.
var DEFAULT_OPTIONS = config.get('kvstore');


// The set of available backend names.
// This will be populated with the loaded sub-modules on demand.
var AVAILABLE_BACKENDS = {
  "memory": null,
  "couchbase": null
}


// XXX TODO: this must exist in a utility method or library somewhere...?
// XXX TODO: also hasOwnProperty may be a client-side idiom that's not
//           relevant in node-js...
var mergeObjects = function() {
  var result = {}
  for(var i=0; i<arguments.length; i++) {
    for(var key in arguments[i]) {
      if(!result.hasOwnProperty(key)) {
        result[key] = arguments[i][key];
      }
    }
  }
  return result;
}


module.exports = {

  connect: function(options, cb) {
    options = mergeObjects(options, DEFAULT_OPTIONS);
    // Load the specified backend implementation, and just pass things on
    // to its own connect() method.
    var backend = AVAILABLE_BACKENDS[options.backend];
    if(backend === undefined) {
        cb("invalid kvstore backend: " + backend);
        return;
    }
    if(backend === null) {
        backend = require("./kvstore/" + options.backend + ".js");
        AVAILABLE_BACKENDS[options.backend] = backend;
    }
    backend.connect(options, cb);
  }

}
