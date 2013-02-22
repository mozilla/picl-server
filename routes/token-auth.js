const Hapi = require('hapi');
const verify = require('../lib/verify.js');
const config = require('../lib/config.js');
const kvstore = require('../lib/kvstore.js');
const account = require('../lib/account.js');

const kv = kvstore.connect();

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
          // For fake auth, allow an email in place of an assertion
          email: Hapi.Types.String().without('assertion'),
          assertion: Hapi.Types.String().without('email'),
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
  },
  {
    method: 'DELETE',
    path: '/account',
    handler: deleteAccount,
    config: {
      auth: {
        mode: 'none'
      },
      description: 'Delete the account associated with the assertion',
      validate: {
        schema: {
          email: Hapi.Types.String().without('assertion'),
          assertion: Hapi.Types.String().without('email')
        }
      },
      response: {
        schema: {
          success: Hapi.Types.Boolean().required()
        }
      }
    }
  }
];

/*
 * Token Authentication implementation for Hapi
 *
 * Authentication occurs before each request unless disabled (per route)
 * Expects the client to provide a valid token in the Authorization header
 * */
function authenticate(request, cb) {
  // attempt to read row with token
  var token = request.raw.req.headers.Authorization;

  // For the NULL security protocol, the token is the userid.
  // There's no checking or lookup, you just have to provide a token.
  if (!token) return cb(Hapi.Error.unauthorized('NoToken'));

  cb(null, { 
    id: token,
    user: token
  });

  //kv.get(token, function(err, doc) {
  //  if (err) return cb(err);
  //  if (!doc) return cb(Hapi.Error.unauthorized('UnknownToken'));
  //
  //  cb(null, {
  //    id: token,
  //    user: doc.value.email
  //  });
  //});
}

/* Update Token handler
 *
 * First, attempt to update any outdated token with current token and return success
 * Second, if tokens were unknown, validate assertion and check to see if email is known
 * Third, if email is known, return failure (incorrect tokens for user)
 * Fourth, email is new so create account and return success
 * */

function updateToken(request) {

  var currentToken = request.payload.token;
  var oldTokens = request.payload.oldTokens;

  // update tokens
  account.updateTokens(currentToken, oldTokens, function(err, result) {

    // tokens were unknown, check if the email from the assertion is known
    if (err) {

      // assume audience is the current datatype server
      var audience = request.server.settings.uri;

      // verify the assertion on a hosted verifier
      fakeVerify(request.payload.email, request.payload.assertion, audience, VERIFIER_URL,
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

}


/* Delete account handler
 *
 * A valid assertion for an email address is enough
 * to delete all data associated with that email address
 * */
function deleteAccount(request) {
  var assertion = request.payload.assertion;

  // assume audience is the current datatype server
  var audience = request.server.settings.uri;

  fakeVerify(request.payload.email, request.payload.assertion, audience, VERIFIER_URL,
    function(err, result) {
      if (err) {
        console.log('err', err);
        request.reply(Hapi.Error.badRequest(err));
      } else {
        account.delete(result.email, function(err, result) {
          if (err) {
            request.reply(Hapi.Error.badRequest(err));
          } else {
            request.reply({ success: true });
          }
        });
      }
    });
}

// For testing purposes, we allow clients to send an email address
// or a full assertion. We skip verification if they send an email.
function fakeVerify(email, assertion, audience, verifier_url, cb) {
  if (email) {
    process.nextTick(function() { cb(null, { email: email }); });
  } else {
    verify(assertion, audience, VERIFIER_URL, cb);
  }
}
