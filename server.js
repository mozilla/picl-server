const Hapi = require('hapi');

// load array of routes
var routes = require('./routes');

// server settings
var settings = {};

// Create a server with a host and port
var port = parseInt(process.env.PORT || 8000, 10);
var server = new Hapi.Server('localhost', port, settings);
server.addRoutes(routes);

module.exports = server;
