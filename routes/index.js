var auth = require('./fake-auth.js');

var routes = [
    {
      method: 'GET',
      path: '/hello',
      config: {
        handler: hello
      }
    }
  ]
  .concat(auth.routes);

// Define the route
function hello(request) {
  request.reply({ greeting: 'it works' });
}

module.exports = routes;

