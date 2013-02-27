const request = require('request');
const crypto = require('crypto');

exports.server = require('../server');


// Generate a unique, randomly-generated ID.
// Handy for testing auth tokens and the like..
//
exports.uniqueID = function() {
  return crypto.randomBytes(10).toString('hex');
};


// Construct a request-making function bound either to a local Hapi server
// instance, or a remote server.
//
// Individual testcases can call this function to generate a makeRequest()
// helper that's bound to their specific server of interest.  Said function
// will also respect the TEST_REMOTE environment variable to redirect requests
// against a remote server.
//
// XXX TODO: there must be a better name for this function...?
//
exports.bindMakeRequest = function(server) {
  if (process.env.TEST_REMOTE) {
    return exports.makeLiveRequest.bind({base_url: process.env.TEST_REMOTE});
  } else {
    return exports.makeInjectRequest.bind(server);
  }
};


// Make a HTTP request by injecting calls directly into a Hapi server.
// This bypasses all networking and node layers and just exercises the
// application code, making it faster and better for debugging.
//
exports.makeInjectRequest = function (method, path, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }

  var next = function (res) {
    // nodejs lowercases response headers, so simulate that behaviour here.
    var normalizedHeaders = {};
    for (var key in res.headers) {
      if (res.headers.hasOwnProperty(key)) {
        normalizedHeaders[key.toLowerCase()] = res.headers[key];
      }
    }
    res.headers = normalizedHeaders;
    return callback(res);
  };

  // nodejs lowercases request headers, so simulate that behaviour here.
  var rawHeaders = options.headers || {};
  var headers = {};
  for (var key in rawHeaders) {
    if (rawHeaders.hasOwnProperty(key)) {
      headers[key.toLowerCase()] = rawHeaders[key];
    }
  }

  this.inject({
    method: method,
    url: path,
    payload: JSON.stringify(options.payload),
    headers: headers
  }, next);
};


// Make a HTTP request by actually sending it out over the network.
// This uses the same API as makeInjectRequest above, but sends it to
// a live server.  This lets you easily re-use unittests to acceptance
// test a live server.
//
exports.makeLiveRequest = function (method, path, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }

  var body = "";
  if (options.payload !== undefined) {
    body = JSON.stringify(options.payload);
  }

  request({
    url: this.base_url + path,
    method: method,
    headers: options.headers || {},
    body: body
  }, function (err, res, body) {
    if (err) return callback({statusCode: 599, error: err});
    if (body && res.headers['content-type'] === 'application/json') {
      res.result = JSON.parse(body);
    } else {
      res.result = body;
    }
    return callback(res);
  });
};


// Get an email and assert for a new unique test user.
//
exports.getUser = function(audience, cb) {
  var url = 'http://personatestuser.org/email_with_assertion/';
  url += encodeURIComponent(audience) + '/prod',
  request.get(url, function(err, res, body) {
    if (err) {
      console.log('get user error:', err);
      return cb(err);
    }
    try {
      return cb(null, JSON.parse(body));
    } catch (e) {
      return cb(e);
    }
  });
};
