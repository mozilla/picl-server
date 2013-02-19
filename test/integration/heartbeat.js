var assert = require('assert');
var helpers = require('../helpers');
var server = helpers.server;
var makeRequest = helpers.makeRequest.bind(server);

describe('heartbeat', function() {
  it('returns ok', function(done) {
    makeRequest('GET', '/__heartbeat__', function(res) {
      assert.equal(res.statusCode, 200);
      assert.equal(res.result, 'ok');
      done();
    });
  });
});
