/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const Hapi = require('hapi');
const request = require('request');

const config = require('../lib/config.js');
const kvstore = require('../lib/kvstore.js');
const prereqs = require('../lib/prereqs.js');

const store = require('./syncstore.js').store;
const kv = kvstore.connect();

exports.routes = [
  {
    method: 'POST',
    path: '/{userid}/endpoint',
    handler: addEndpoint,
    config: {
      description: 'Add a push notification endpoint',
      pre: [prereqs.checkUserId],
      payload: 'parse'
    }
  },
  {
    method: 'DELETE',
    path: '/{userid}/endpoint',
    handler: deleteEndpoint,
    config: {
      description: 'Remove a push notification endpoint',
      pre: [prereqs.checkUserId],
      payload: 'parse'
    }
  }
];


function addEndpoint(request) {
  var userid = request.params.userid;
  var endpoint = request.payload.endpoint;

  var infoKey = 'endpoints/' + userid;
  retryLoop('cas mismatch', 10, function(cb) {
    kv.get(infoKey, function(err, eps) {
      var endpoints = {};
      if (err) return cb(err);
      if (eps) endpoints = eps.value;
      endpoints[endpoint] = +new Date();
      var casid = eps ? eps.casid : null;
      kv.cas(infoKey, endpoints, casid,  cb);
    });
  },  function(err) {
    if (err) return request.reply(Hapi.Error.internal(err));
    var response = new Hapi.Response.Raw(request).code(204);
    return request.reply(response);
  });
}


function deleteEndpoint(request) {
  var userid = request.params.userid;
  var endpoint = request.payload.endpoint;

  var infoKey = 'endpoints/' + userid;
  retryLoop('cas mismatch', 10, function(cb) {
    kv.get(infoKey, function(err, endpoints) {
      if (err) return cb(err);
      if (!endpoints || !endpoints.value[endpoint]) {
        return cb('unknownEndpoint');
      }
      delete endpoints.value[endpoint];
      var casid = endpoints ? endpoints.casid : null;
      kv.cas(infoKey, endpoints.value, casid, cb);
    });
  }, function(err) {
    if (err) return request.reply(Hapi.Error.internal(err));
    var response = new Hapi.Response.Raw(request).code(204);
    return request.reply(response);
  });
}


// Listen for change events, and send notifications to matching endpoints.
//
store.on('change', function(userid, collection, version) {
  if(!collection || !version) return;
  var infoKey = 'endpoints/' + userid;
  kv.get(infoKey, function(err, endpoints) {
    if (!endpoints || err) return;
    Object.keys(endpoints.value).forEach(function(ep) {
      request.put(ep, { form: { version: version } }, function(err, res) {
        console.log('notified endpoint', ep, res.statusCode, err);
      });
    });
  });
});


// Helper function to retry execution in case of errors.
// 'fn' should be the function to execute, with its arguments bound
// except for the callback.
//
function retryLoop(errType, maxAttempts, fn, cb) {
  var numRetries = 0;
  var attempt = function() {
    fn(function(err) {
      if (!err) return cb(null);
      if (err !== errType) return cb(err);
      if (numRetries > maxAttempts) return cb('too many conflicts');
      numRetries++;
      process.nextTick(attempt);
    });
  };
  attempt();
}
