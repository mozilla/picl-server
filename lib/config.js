var convict = require('convict');

const AVAILABLE_BACKENDS = ["memory", "couchbase"];


var conf = module.exports = convict({
  public_url: {
    format: "url",
    // the real url is set by awsbox
    default: "http://127.0.0.1:8080"
  },
  kvstore: {
    backend: {
      format: AVAILABLE_BACKENDS,
      default: "memory"
    },
    available_backends: {
      doc: "List of available key-value stores",
      default: AVAILABLE_BACKENDS
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
    conf.loadFile(file);
  });
}

conf.validate();
