/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var convict = require('convict');

const AVAILABLE_BACKENDS = ["memory", "couchbase"];


var conf = module.exports = convict({
  env: {
    doc: "The current node.js environment",
    default: "production",
    format: [ "production", "local", "test" ],
    env: 'NODE_ENV'
  },
  public_url: {
    format: "url",
    // the real url is set by awsbox
    default: "http://127.0.0.1:8080"
  },
  kvstore: {
    backend: {
      format: AVAILABLE_BACKENDS,
      default: "memory",
      env: 'KVSTORE_BACKEND'
    },
    available_backends: {
      doc: "List of available key-value stores",
      default: AVAILABLE_BACKENDS
    }
  },
  couchbase: {
    user: {
      default: 'Administrator',
      env: 'KVSTORE_USERNAME'
    },
    password: {
      default: 'password',
      env: 'KVSTORE_PASSWORD'
    },
    bucket: {
      default: 'picl',
      env: 'KVSTORE_BUCKET'
    },
    hosts: [ "localhost:8091" ]
  },
  bind_to: {
    host: {
      doc: "The ip address the server should bind",
      default: '127.0.0.1',
      format: 'ipaddress',
      env: 'IP_ADDRESS'
    },
    port: {
      doc: "The port the server should bind",
      default: 8080,
      format: 'port',
      env: 'PORT'
    }
  }
});

// handle configuration files.  you can specify a CSV list of configuration
// files to process, which will be overlayed in order, in the CONFIG_FILES
// environment variable
if (process.env.CONFIG_FILES) {
  var files = process.env.CONFIG_FILES.split(',');
  files.forEach(function(file) {
    conf.loadFile(file);
  });
}

if (conf.get('env') === 'test'
    && conf.get('kvstore.backend') === 'couchbase') {
  conf.set('couchbase.bucket', 'default');
}

conf.validate();

console.log('configuration: ', conf.toString());
