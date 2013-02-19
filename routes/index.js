var heartbeat = require('./heartbeat.js');
var auth = require('./token-auth.js');
var blob = require('./blob.js');

var routes = [
    {
      method: 'GET',
      path: '/hello',
      config: {
        auth: {
          mode: 'none'
        },
        handler: hello
      }
    }
  ]
  .concat(
    heartbeat.routes,
    auth.routes,
    blob.routes
  );

// Define the route
function hello(request) {
  request.reply({ greeting: 'it works' });
}

module.exports = routes;

