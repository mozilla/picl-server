const Hapi = require('hapi');

// load array of routes
var routes = require('./routes');

// server settings
var settings = {};

// Create a server with a host and port
var server = new Hapi.Server('localhost', process.env.PORT || 8000, settings);
server.addRoutes(routes);

module.exports = server;
