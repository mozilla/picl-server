/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const Hapi = require('hapi');
const config = require('../lib/config.js');
const syncstore = require('../lib/syncstore.js');
const prereqs = require('../lib/prereqs.js');

const store = syncstore.connect();

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

  store.addEndpoint(userid, endpoint, function(err) {
    if (err) return request.reply(Hapi.Error.internal(err));
    var response = new Hapi.Response.Raw(request).code(204);
    return request.reply(response);
  });
}

function deleteEndpoint(request) {
  var userid = request.params.userid;
  var endpoint = request.payload.endpoint;

  store.deleteEndpoint(userid, endpoint, function(err) {
    if (err) return request.reply(Hapi.Error.internal(err));
    var response = new Hapi.Response.Raw(request).code(204);
    return request.reply(response);
  });
}
