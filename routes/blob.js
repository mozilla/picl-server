var Hapi = require('hapi');
var config = require('../lib/config.js');
var kvstore = require('../lib/kvstore.js');

// Example of a simple blob data type

exports.routes = [
  {
    method: 'PUT',
    path: '/blob',
    handler: put,
    config: {
      description: 'Generic data-type set',
      validate: {
        schema: {
          data: Hapi.Types.String().required(),
          casid: Hapi.Types.Number()
        }
      },
      response: {
        schema: {
          success: Hapi.Types.Boolean().required()
        }
      }
    }
  },
  {
    method: 'GET',
    path: '/blob',
    handler: get,
    config: {
      description: 'Generic data-type get',
      response: {
        schema: {
          success: Hapi.Types.Boolean().required(),
          data: Hapi.Types.String().required(),
          casid: Hapi.Types.Number().required()
        }
      }
    }
  }
];

function put(request) {
  // The authentication module will set the session id
  var id = request.session.id;

  kvstore.connect(config.get('kvstore'), function(err, db) {
    var data = blob(db, id);

    data.write(request.payload.data, request.payload.casid || 0, function(err) {
      if (err) {
        request.reply(Hapi.Error.badRequest(err));
      } else {
        request.reply({ success: true });
      }
    });
  });
}

function get(request) {
  // The authentication module will set the session id
  var id = request.session.id;

  kvstore.connect(config.get('kvstore'), function(err, db) {
    var data = blob(db, id);

    data.read(function(err, result) {
      if (err) {
        request.reply(Hapi.Error.badRequest(err));
      } else if (!result) {
        request.reply(Hapi.Error.badRequest('UnknownToken'));
      } else {
        request.reply({ success: true, data: result.value.data, casid: result.casid });
      }
    });
  });
}

// return an object for reading/writing blobs
function blob(db, id) {
  function read(cb) {
    db.get(id, cb);
  }

  // naive data write, requires reading first
  function write(payload, casid, cb) {
    db.get(id, function(err, result) {
      result.value.data = payload;

      db.cas(id, result.value, casid, cb);
    });
  }

  return { read: read, write: write };
}

