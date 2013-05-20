/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const fs = require('fs');
const convict = require('convict');

const KVSTORE_AVAILABLE_BACKENDS = ["memory", "mysql"];
const SYNCSTORE_AVAILABLE_BACKENDS = ["kvstore", "mysql"];


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
  persona_url: {
    doc: "Persona service",
    format: "url",
    default: "https://firefoxos.persona.org",
    env: 'PERSONA_URL'
  },
  verifier_url: {
    doc: "Service used to verify Persona assertions",
    format: "url",
    default: "https://firefoxos.persona.org/verify",
    env: 'VERIFIER_URL'
  },
  kvstore: {
    backend: {
      format: KVSTORE_AVAILABLE_BACKENDS,
      default: "memory",
      env: 'KVSTORE_BACKEND'
    },
    available_backends: {
      doc: "List of available key-value stores",
      default: KVSTORE_AVAILABLE_BACKENDS
    }
  },
  syncstore: {
    backend: {
      format: SYNCSTORE_AVAILABLE_BACKENDS,
      default: "kvstore",
      env: 'SYNCSTORE_BACKEND'
    },
    available_backends: {
      doc: "List of available syncstore implementations",
      default: SYNCSTORE_AVAILABLE_BACKENDS
    }
  },
  mysql: {
    user: {
      default: 'root',
      env: 'MYSQL_USERNAME'
    },
    password: {
      default: '',
      env: 'MYSQL_PASSWORD'
    },
    database: {
      default: 'picl',
      env: 'MYSQL_DATABASE'
    },
    host: {
      default: '127.0.0.1',
      env: 'MYSQL_HOST'
    },
    port: {
      default: '3306',
      env: 'MYSQL_PORT'
    },
    create_schema: {
      default: true,
      env: 'CREATE_MYSQL_SCHEMA'
    },
    max_query_time_ms: {
      doc: "The maximum amount of time we'll allow a query to run before considering the database to be sick",
      default: 5000,
      format: 'duration',
      env: 'MAX_QUERY_TIME_MS'
    },
    max_reconnect_attempts: {
      doc: "The maximum number of times we'll attempt to reconnect to the database before failing all outstanding queries",
      default: 3,
      format: 'nat'
    }
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
    if(fs.existsSync(file)) {
      conf.loadFile(file);
    }
  });
}

if (conf.get('env') === 'test') {
  if (conf.get('kvstore.backend') === 'mysql') {
    conf.set('mysql.database', 'test');
  }
}

conf.validate();

console.log('configuration: ', conf.toString());
