/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Basic web API for exposing a user's syncstore data.
 *
 * This is the "version zero" storage protocol for PiCL, a stripped-down
 * version of the Mozilla Sync2.0 protocol.  It's currently documented in
 * a Google Doc but will be moved onto the wiki shortly:
 *
 *  https://docs.google.com/a/mozilla.com/document/d/1aU0Gdga-JBr6f4eqPF5YHkXyGYXtWCP7lTLJThjG3KE/edit#
 *
 */

const Hapi = require('hapi');
const config = require('../lib/config.js');
const syncstore = require('../lib/syncstore.js');
const prereqs = require('../lib/prereqs.js');

const store = syncstore.connect();


// The maximum number of items that can be included in a POST.
const MAX_ITEMS_PER_BATCH = 100;


exports.store = store;
exports.routes = [
  {
    method: 'GET',
    path: '/{userid}/info/collections',
    handler: getCollections,
    config: {
      description: 'Get information about all collections',
      pre: [prereqs.checkUserId, prereqs.ifModifiedSinceVersion],
      // XXX TODO: figure out how to exclude 304 responses from this check,
      //           then re-enable the validation.
      //response: {
      //  schema: {
      //    version: Hapi.Types.Number().required(),
      //    collections: Hapi.Types.Object().required()
      //  }
      //}
    }
  },
  {
    method: 'GET',
    path: '/{userid}/storage/{collection}',
    handler: getItems,
    config: {
      description: 'Get items from a collection',
      pre: [prereqs.checkUserId, prereqs.ifModifiedSinceVersion],
      validate: {
        query: {
          ids: Hapi.Types.String(),
          newer: Hapi.Types.Number()
        }
      },
      // XXX TODO: figure out how to exclude 304 responses from this check,
      //           then re-enable the validation.
      //response: {
      //  schema: {
      //    version: Hapi.Types.Number().required(),
      //    items: Hapi.Types.Object().required()
      //  }
      //}
    }
  },
  {
    method: 'POST',
    path: '/{userid}/storage/{collection}',
    handler: setItems,
    config: {
      description: 'Store items in a collection',
      pre: [prereqs.checkUserId, prereqs.ifUnmodifiedSinceVersion],
      payload: 'parse',
      response: {
        schema: {
          version: Hapi.Types.Number().required()
        }
      }
    }
  },
  {
    method: 'DELETE',
    path: '/{userid}',
    handler: deleteUserData,
    config: {
      description: 'Delete all data for the user',
      pre: [prereqs.checkUserId]
    }
  }
];


//  Handler function for getting info on all collections.
//
//  The syncstore returns the data into the correct format, so all this
//  really has to do is dump it out to the client.
//
function getCollections(request) {
  var userid = request.params.userid;

  store.getCollections(userid, function(err, info) {
    var response;
    if (err) return request.reply(Hapi.Error.internal(err));

    if (request.pre.ifModifiedSinceVersion !== undefined) {
      if (info.version <= request.pre.ifModifiedSinceVersion) {
        response = new Hapi.Response.Raw(request).code(304);
        return request.reply(response);
      }
    }

    response = new Hapi.Response.Obj(info);
    response.header('X-Last-Modified-Version', info.version);
    request.reply(info);
  });
}


// Handler function for getting the items in a collection.
//
// This fetches the whole list of items from the syncstore backend, filters
// then based on the "ids" and/or "newer" query parameters, and returns the
// filtered list to the client.
//
function getItems(request) {
  var userid = request.params.userid;
  var collection = request.params.collection;

  store.getItems(userid, collection, function(err, res) {
    var response;
    if (err) return request.reply(Hapi.Error.internal(err));
    if (res.version === 0) return request.reply(Hapi.Error.notFound());

    // If they sent an If-Modified-Since, we can avoid sending the body.
    // It would be useful to push this check down into the store API to
    // avoid loading the items at all.
    if (request.pre.ifModifiedSinceVersion !== undefined) {
      if (res.version <= request.pre.ifModifiedSinceVersion) {
        response = new Hapi.Response.Raw(request).code(304);
        return request.reply(response);
      }
    }

    // If they sent a 'newer' param that's ahead of the current state
    // of the server, they're likely doing something wrong.  Error out.
    if (request.query.newer && request.query.newer > res.version) {
      return request.reply(Hapi.Error.badRequest('unseen version number'));
    }

    // The list of ids to fetch is given as a comma-separated string.
    // Split it into a proper list if present.
    var targetIds = request.query.ids;
    if (typeof targetIds !== 'undefined') {
      targetIds = targetIds.split(',');
    }

    // The store API always returns all the items.
    // Filter them according to the query parameters.
    var items = [];
    for (var id in res.items) {
      var item = res.items[id];
      if (typeof targetIds !== 'undefined' ) {
        if (targetIds.indexOf(id) === -1) {
          continue;
        }
      }
      if (typeof request.query.newer !== 'undefined' ) {
        if (item.version <= request.query.newer) {
          continue;
        }
      }
      item.id = id;
      items.push(item);
    }

    response = new Hapi.Response.Obj({ version: res.version, items: items });
    response.header('X-Last-Modified-Version', res.version);
    return request.reply(response);
  });
}


// Handler function to write items into a collection.
//
// The syncstore backend does most of the heavy-lifting here, we just have
// to intercept its various error conditions and respond appropriately.
//
// XXX TODO: validation of BSO fields
//
function setItems(request) {
  var userid = request.params.userid;
  var collection = request.params.collection;

  // Convert the incoming list of items into a hash mapping
  // item ids to item bodies.  Should we just change the API
  // to input such a hash?
  var itemsList = request.payload;
  if (!itemsList || itemsList.length === undefined) {
    return request.reply(Hapi.Error.badRequest('no items'));
  }
  if (itemsList.length > MAX_ITEMS_PER_BATCH) {
    return request.reply(Hapi.Error.badRequest('too many items'));
  }
  var items = {};
  for (var i=0; i<itemsList.length; i++) {
    items[itemsList[i].id] = itemsList[i];
  }

  // The syncstore concurrency model means that writes might temporarily
  // fail due to other writes happening at the same time.  We use a little
  // retry loop to make several attempts before erroring out.
  var if_ver = request.pre.ifUnmodifiedSinceVersion;
  var numRetries = 0;
  function doSetItems() {
    store.setItems(userid, collection, items, if_ver, function(err, res) {
      var response;
      if (err) {
        if (err === 'syncstore.versionMismatch') {
          response = new Hapi.Error(412, 'Precondition Failed');
          return request.reply(response);
        }
        if (err === 'syncstore.writeConflict' && numRetries < 10) {
          numRetries++;
          return process.nextTick(doSetItems);
        }
        return request.reply(Hapi.Error.internal(err));
      }

      response = new Hapi.Response.Obj({ version: res.version });
      response.header('X-Last-Modified-Version', res.version);
      return request.reply(response);
    });
  }
  doSetItems();
}


//  Handler function for deleting all of the user's data.
//
function deleteUserData(request) {
  var userid = request.params.userid;

  store.deleteUserData(userid, function(err) {
    if (err) return request.reply(Hapi.Error.internal(err));
    var response = new Hapi.Response.Raw(request).code(204);
    return request.reply(response);
  });
}
