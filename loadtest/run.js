#!/usr/bin/env node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Proof-of-concept script for automated running of loadtests in AWS.
 * 
 * Running this script will automatically spin up an AWS VM running the
 * current HEAD version of the code, then throw a bunch of load at it
 * and monitor its performance.  You then get a nice HTML report with
 * graphs and numbers and whatnot.
 *
 * It needs some serious refactoring, but it's a handy start...
 *
 */


var fs = require('fs');
var path = require('path');
var async = require('async');
var child_process = require('child_process');
var couchbaseInstaller = require('../scripts/aws/install_couchbase.js');

// The SHA1 of the current git commit is used throughout for naming purposes.
var currentCommit = null;
var testName = null;

// Details of the server to be tested in AWS.
var serverInstanceId = null;
var serverDNSName = null;

// Details of the client running the tests in AWS.
var clientInstanceId = null;
var clientDNSName = null;

// We're going to do lots of sequential tasks.
// Use an async waterfall to avoid the Indentation Pyramid of Doom.
//
async.waterfall([

// Find the SHA1 of the current git commit.
//
function(cb) {
  child_process.exec('git log --pretty=%h -1', function(err, stdout, stderr) {
    currentCommit = stdout.trim();
    if (!currentCommit || currentCommit.length !== 7) cb(err);
    else {
      testName = "picl-loadtest-" + currentCommit;
      console.log('Beginning loadtest ' + testName);
      cb();
    }
  });
},

// Launch an awsbox running the current version of the application.
//
function(cb) {
  console.log('Launching awsbox for server');
  var serverName = testName + '-server';
  var output = '';
  // Spawn awsbox as a sub-process.
  // We capture stdout trough a pipe, but also buffer it in
  // memory so that we can grab info out of it.
  var p = child_process.spawn('awsbox', ['create', '-n', serverName, '-t', 'm1.large'],
                              {'stdio': [0, 'pipe', 2]})
  p.stdout.on('data', function(d) {
    process.stdout.write(d);
    output += d
  });
  p.on('exit', function(code, signal) {
    var err = code || signal;
    if (err) return cb(err);

    // Parse out the instance details from the awsbox output.
    // This is...err...a little suboptimal...
    serverInstanceId = output.match(/"instanceId": "([a-z0-9\-]+)",/)[1];
    serverDNSName = output.match(/"dnsName": "([a-z0-9\-\.]+)",/)[1];
    if (!serverInstanceId || !serverDNSName) return cb('awsbox failure');

    // install couchbase
    couchbaseInstaller(serverDNSName, function(err) {
      if (err) return cb(err);

      // Push the current commit up to the awsbox.
      var p = child_process.spawn('git', ['push', serverName, 'HEAD:master'],
                                  {'stdio': 'inherit'});
      p.on('exit', function(code, signal) {
        cb(code || signal);
      });
    });
  });
},

// Launch a second awsbox to run the loadtest client.
// The whole awsbox setup is overkill for this, but helps get started quickly.
// XXX TODO: refactor awsbox-spawning code into utility function.
//
// We could launch both client and server in parallel, but we'll likely move
// to something like marteau which maintains a pool of available workers, so
// the time spent on doing that may not be worth it.
//
function(cb) {
  console.log('Launching awsbox for client');
  serverName = testName + '-client';
  var output = '';
  // Spawn awsbox as a sub-process.
  // We capture stdout trough a pipe, but also buffer it in
  // memory so that we can grab info out of it.
  var p = child_process.spawn('awsbox', ['create', '-n', serverName, '-t', 'm1.large'],
                              {'stdio': [0, 'pipe', 2]});
  p.stdout.on('data', function(d) {
    process.stdout.write(d);
    output += d
  });
  p.on('exit', function(code, signal) {
    var err = code || signal;
    if (err) return cb(err);

    // Parse out the instance details from the awsbox output.
    // This is...err...a little suboptimal...
    clientInstanceId = output.match(/"instanceId": "([a-z0-9\-]+)",/)[1];
    clientDNSName = output.match(/"dnsName": "([a-z0-9\-\.]+)",/)[1];
    if (!clientInstanceId || !clientDNSName) return cb('awsbox failure');

    // Push the current commit up to the awsbox.
    var p = child_process.spawn('git', ['push', serverName, 'HEAD:master'],
                                {'stdio': 'inherit'});
    p.on('exit', function(code, signal) {
      cb(code || signal);
    });
  });
},

// Install and run funkload from the client machine.
//
function(cb) {
  console.log("Running funkload tests");
  var doSSH = function(cmd, username) {
    var args = ['-o', 'StrictHostKeyChecking=no',
                (username || 'app') + '@' + clientDNSName, cmd];
    return function(cb) {
      console.log("SSH: " + cmd);
      var p = child_process.spawn('ssh', args, {'stdio': 'inherit'});
      p.on('exit', function(code, signal) {
        cb(code || signal);
      });
    };
  };
  async.series([
    // Install dependencies for running funkload.
    doSSH('sudo yum --assumeyes install gnuplot', 'ec2-user'),
    doSSH('sudo easy_install funkload', 'ec2-user'),
    // Write the target URL into the config file.
    doSSH('echo "[main]" >> ./code/loadtest/StressTest.conf'),
    doSSH('echo "url = https://' + serverDNSName + '" >> ./code/loadtest/StressTest.conf'),
    // Check that the tests can successfully run.
    doSSH('cd ./code/loadtest && fl-run-test stress.py'),
    // Run the full bench suite.
    doSSH('cd ./code/loadtest && fl-run-bench stress.py StressTest.test_hello_world'),
    // Generate the nice report into "report" subdirectory.
    // XXX TODO: funkload is buggy when used with the -r option?
    //doSSH('cd ./code/loadtest && mkdir ./report/ && fl-build-report -r /home/app/code/loadtest/report/' + testName + ' --html loadtest.xml'),
    doSSH('cd ./code/loadtest && fl-build-report -o ./report/ --html loadtest.xml'),
    // Copy it down to the local machine
    function(cb) {
      var rsync_args = ['-e', 'ssh -o StrictHostKeyChecking=no', '-avzr',
                        'app@'+clientDNSName+':code/loadtest/report/',
                        path.join(__dirname, 'report')]
      var p = child_process.spawn('rsync', rsync_args, {'stdio': 'inherit'});
      p.on('exit', function(code, signal) {
        console.log('SUCCESS!');
        var reportDir = path.join(__dirname, 'report');
        console.log('Reports are in ' + reportDir);
        console.log('Reports are in file:///' + reportDir);
        cb(code || signal);
      });
    }
  ], cb);
}


// Cleanup and error handler.
// If anything goes wrong, control jumps straight to this callback.
//
], function(err, result) {
  console.log("cleaning up...");
  async.series([
    // Tear down the client VM.
    function(cb) {
      if (!clientInstanceId) return cb();
      child_process.exec('awsbox destroy ' + testName + '-client', cb);
    },
    // Tear down the server VM.
    function(cb) {
      if (!serverInstanceId) return cb();
      child_process.exec('awsbox destroy ' + testName + '-server', cb);
    },
    // Finalize the process and exit success or failure.
    function(cb) {
      if (err) {
        process.stderr.write('fatal error: ' + err + '\n');
        process.exit(1);
      } else {
        process.exit(0);
      }
    }
  ]);
});
