const Hapi = require('hapi');

var config = require('./lib/config');

// load array of routes
var routes = require('./routes');

// server settings
var settings = {};

// Create a server with a host and port
var port = config.get('bind_to.port');
var host = config.get('bind_to.host');
var server = new Hapi.Server(host, port, settings);
server.addRoutes(routes);

module.exports = server;
