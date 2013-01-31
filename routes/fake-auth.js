var Hapi = require('hapi');
var verify = require('../lib/verify.js');

const VERIFIER_URL = process.env.VERIFIER_URL || 'https://verifier.login.persona.org/verify';

exports.routes = [
  {
    method: 'PUT',
    path: '/login',
    handler: login,
    config: {
      description: 'Log in using an assertion from Persona',
      validate: {
        schema: {
          assertion: Hapi.Types.String().required()
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

function login(request) {
  // assume audience is the current datatype server
  var audience = request.server.settings.uri;
  console.log(audience);

  // verify the assertion on a hosted verifier
  verify(request.payload.assertion, audience, VERIFIER_URL,
    function(err, result) {
      if (err) {
        console.log('err', err);
        request.reply(Hapi.Error.unauthorized(err));
      } else {
        // assertion is valid, great success
        var res = request.payload({ success: true });

        // establish a session cookie
        // TODO determine a reasonable ttl
        res.state('id', result.email, { isSecure: true, isHttpOnly: true });
        res.send();
      }
    });
}

