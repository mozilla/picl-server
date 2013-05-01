const assert = require('assert');
const helpers = require('../helpers');

const server = helpers.server;

const TEST_TOKEN = 'faketoken';

describe('syncstore web api', function() {

  // Test client that includes auth information by default.
  var testClient = new helpers.TestClient({
    basePath: '/' + TEST_TOKEN,
    defaultHeaders: { Authorization: TEST_TOKEN },
  });

  it('allows creation of a new endpoint', function(done) {
    testClient.makeRequest('POST', '/endpoint', {
      payload: { endpoint: 'http://pushserver.org/notify/testendpoint' },
    }, function(res) {
      assert.equal(res.statusCode, 204);
      done();
    });
  });

  it('allows deletion of an endpoint', function(done) {
    testClient.makeRequest('DELETE', '/endpoint', {
      payload: { endpoint: 'http://pushserver.org/notify/testendpoint' }
    }, function(res) {
      assert.equal(res.statusCode, 204);
      done();
    });
  });

});
