var assert = require('assert');
var helpers = require('../helpers');

var server = helpers.server;
var makeRequest = helpers.makeRequest.bind(server);

var TEST_EMAIL = 'blob@example.com';
var TEST_TOKEN = 'blobtoken';

describe('set up account', function() {
  it('creates a new account', function(done) {
    makeRequest('PUT', '/update_token', {
      payload: { email: TEST_EMAIL, token: TEST_TOKEN, oldTokens: [ 'not', 'used' ] }
    }, function(res) {
      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.result, { success: true, email: TEST_EMAIL });
      done();
    });
  });
});

describe('blob', function() {
  it('should store a blob', function(done) {
    makeRequest('PUT', '/blob', {
      payload: { data: 'my awesome data', casid: 1 },
      headers: { Authorization: TEST_TOKEN }
    }, function(res) {
      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.result, { success: true });
      done();
    });
  });

  it('should get a blob', function(done) {
    makeRequest('GET', '/blob', {
      headers: { Authorization: TEST_TOKEN }
    }, function(res) {
      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.result, { success: true, data: 'my awesome data', casid: 2 });
      done();
    });
  });

  it('should fail on bad Authorization header', function(done) {
    makeRequest('GET', '/blob', {
      headers: { Authorization: 'bad' }
    }, function(res) {
      assert.equal(res.statusCode, 401);
      done();
    });
  });
});

