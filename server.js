const Hapi = require('hapi');

var config = require('./lib/config');

// load array of routes
var routes = require('./routes');
var authConfig = require('./routes/token-auth.js').config;

// server settings
var settings = {
  monitor: true,
  auth: authConfig
};

// Create a server with a host and port
var port = config.get('bind_to.port');
var host = config.get('bind_to.host');
var server = new Hapi.Server(host, port, settings);
server.addRoutes(routes);

module.exports = server;
