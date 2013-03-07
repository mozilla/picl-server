var assert = require('assert');
var helpers = require('../helpers');

var testClient = new helpers.TestClient();

var TEST_EMAIL = helpers.uniqueID() + '@example.com';
var TEST_TOKEN = helpers.uniqueID();

describe('set up account', function() {
  it('creates a new account', function(done) {
    testClient.makeRequest('PUT', '/update_token', {
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
    testClient.makeRequest('PUT', '/blob', {
      payload: { data: 'my awesome data', casid: 1 },
      headers: { Authorization: TEST_TOKEN }
    }, function(res) {
      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.result, { success: true });
      done();
    });
  });

  it('should get a blob', function(done) {
    testClient.makeRequest('GET', '/blob', {
      headers: { Authorization: TEST_TOKEN }
    }, function(res) {
      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.result, { success: true, data: 'my awesome data', casid: 2 });
      done();
    });
  });

  // This test doesn't make sense under the NULL security model, since
  // there's not such thing as a "bad token".
  // XXX TODO: re-enable this as security model grows.
  //
  //it('should fail on bad Authorization header', function(done) {
  //  testClient.makeRequest('GET', '/blob', {
  //    headers: { Authorization: 'bad' }
  //  }, function(res) {
  //    assert.equal(res.statusCode, 401);
  //    done();
  //  });
  //});
});

