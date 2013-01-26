const Hapi = require('hapi');
const routes = require('./routes.js');

// Create a server with a host and port
var server = new Hapi.Server('localhost', process.env.PORT || 8000);

// add routes
server.addRoutes(routes);

module.exports = server;
