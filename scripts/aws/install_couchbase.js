#!/usr/bin/env node

var fs = require('fs');
var path = require('path');
var child_process = require('child_process');

function uploadScript (host, cb) {
  var args = [ path.join(__dirname, 'install_couchbase.sh'),
              'ec2-user@' + host + ':install_couchbase.sh' ];
              console.log(args);
  var p = child_process.spawn('scp', args, {'stdio': 'inherit'});

  p.on('exit', function(code, signal) {
    var err = code || signal;
    if (err && cb) return cb(err);
    ssh('sh install_couchbase.sh');
  });

  function ssh(cmd) {
    var args = ['-o', 'StrictHostKeyChecking=no',
                'ec2-user@' + host, cmd];
    var p = child_process.spawn('ssh', args, {'stdio': 'inherit'});
    p.on('exit', function(code, signal) {
      if (cb) cb(code || signal);
    });
  }
}

module.exports = uploadScript;

if (require.main === module)
  uploadScript(process.argv[2]);

