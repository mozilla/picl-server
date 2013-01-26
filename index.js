#!/usr/bin/env node

var server = require('./server.js');

// Start the server
server.start(function() {
  console.log("running on http://" + server.settings.host + ":" + server.settings.port);
});
