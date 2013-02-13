var assert = require('assert');
var config = require('../../lib/config');
var helpers = require('../helpers');

var server = helpers.server;
var makeRequest = helpers.makeRequest.bind(server);

var TEST_AUDIENCE = config.get('public_url');
var TEST_EMAIL;
var TEST_ASSERTION;
var TEST_TOKEN = 'foobar';

describe('set up account', function() {
  it('can get user email and assertion', function(done) {
    helpers.getUser(TEST_AUDIENCE, function(err, user) {

      TEST_EMAIL = user.email;
      TEST_ASSERTION = user.assertion;

      assert.ok(TEST_EMAIL);
      assert.ok(TEST_ASSERTION);

      done();
    });
  });

  it('creates a new account', function(done) {
    makeRequest('PUT', '/update_token', {
      payload: { assertion: TEST_ASSERTION, token: TEST_TOKEN, oldTokens: [ 'not', 'used' ] }
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
      console.log(res);
      assert.equal(res.statusCode, 401);
      //assert.deepEqual(res.result, { success: true, data: 'my awesome data', casid: 2 });
      done();
    });
  });
});
