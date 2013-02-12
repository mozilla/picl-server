var Hapi = require('hapi');
var verify = require('../lib/verify.js');
var config = require('../lib/config.js');
var kvstore = require('../lib/kvstore.js');
var accounts = require('../lib/account.js');

const VERIFIER_URL = config.get('verifier_url');

exports.config = {
  scheme: 'ext:token',
  implementation: {
    authenticate: authenticate
  }
};

exports.routes = [
  {
    method: 'PUT',
    path: '/update_token',
    handler: updateToken,
    config: {
      auth: {
        mode: 'none'
      },
      description: 'Log in using an assertion from Persona',
      validate: {
        schema: {
          assertion: Hapi.Types.String().required(),
          token: Hapi.Types.String().required(),
          oldTokens: Hapi.Types.Array()
        }
      },
      response: {
        schema: {
          success: Hapi.Types.Boolean().required(),
          email: Hapi.Types.String()
        }
      }
    }
  }
];

// First, attempt to update any outdated token with current token and return success
// Second, if tokens were unknown, validate assertion and check to see if email is known
// Third, if email is known, return failure (incorrect tokens for user)
// Fourth, email is new so create account and return success
function updateToken(request) {

  var currentToken = request.payload.token;
  var oldTokens = request.payload.oldTokens;

  kvstore.connect(config.get('kvstore'), function(err, db) {
    var account = accounts(db);

    // update tokens
    account.updateTokens(currentToken, oldTokens, function(err, result) {

      // tokens were unknown, check if the email from the assertion is known
      if (err) {

        // verify the assertion on a hosted verifier
        verify(request.payload.assertion, audience, VERIFIER_URL,
          function(err, result) {
            if (err) {
              console.log('err', err);
              request.reply(Hapi.Error.unauthorized(err));
            } else {
              // assertion is valid, check if email is known
              account.knownEmail(result.email, function(err, known) {
                if (known) {
                  // user is known, but token is incorrect
                  request.reply(Hapi.Error.unauthorized('KnownUserUnknownToken'));
                } else {
                  // otherwise, create a new account
                  account.create(currentToken, result.email, function(err) {
                    request.reply({ success: true, email: result.email });
                  });
                }
              });
            }
          });
      } else {
        // tokens updated, return success
        request.reply({ success: true, email: result.email });
      }
    });
  });

  // assume audience is the current datatype server
  var audience = request.server.settings.uri;

}

function authenticate(request, cb) {
  // attempt to read row with token
  var token = request.raw.req.headers.Authorization;
  kvstore.connect(config.get('kvstore'), function(err, db) {
    db.get(token, function(err, doc) {
      if (err) return cb(err);
      if (!doc) return cb('UnknownToken');

      cb(null, {
        id: token,
        user: token
      });
    });

  });
}
