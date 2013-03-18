var heartbeat = require('./heartbeat.js');
var auth = require('./token-auth.js');
var syncstore = require('./syncstore.js');

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
    syncstore.routes
  );

// Define the route
function hello(request) {
  request.reply({ greeting: 'it works' });
}

module.exports = routes;

