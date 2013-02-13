var assert = require('assert');
var config = require('../../lib/config');
var helpers = require('../helpers');

var server = helpers.server;
var makeRequest = helpers.makeRequest.bind(server);

var TEST_AUDIENCE = config.get('public_url');
var TEST_EMAIL;
var TEST_ASSERTION;
var TEST_TOKEN = 'foobar';
var TEST_NEW_TOKEN = 'shabushabu';

describe('get user', function() {
  it('can get user email and assertion', function(done) {
    helpers.getUser(TEST_AUDIENCE, function(err, user) {

      TEST_EMAIL = user.email;
      TEST_ASSERTION = user.assertion;

      assert.ok(TEST_EMAIL);
      assert.ok(TEST_ASSERTION);

      done();
    });
  });
});

describe('auth', function() {
  it('creates a new account', function(done) {
    makeRequest('PUT', '/update_token', {
      payload: { assertion: TEST_ASSERTION, token: TEST_TOKEN, oldTokens: [ 'not', 'used' ] }
    }, function(res) {
      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.result, { success: true, email: TEST_EMAIL });
      done();
    });
  });

  it('fails to update new token when old token is invalid', function(done) {
    makeRequest('PUT', '/update_token', {
      payload: { assertion: TEST_ASSERTION, token: TEST_NEW_TOKEN, oldTokens: [ 'bad' ] }
    }, function(res) {
      assert.equal(res.statusCode, 401);
      assert.equal(res.result.message, 'KnownUserUnknownToken');
      done();
    });
  });

  it('updates new token when an old token is valid', function(done) {
    makeRequest('PUT', '/update_token', {
      payload: { assertion: TEST_ASSERTION, token: TEST_NEW_TOKEN, oldTokens: [ 'bad', TEST_TOKEN ] }
    }, function(res) {
      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.result, { success: true, email: TEST_EMAIL });
      done();
    });
  });

  it('succeeds using the current token', function(done) {
    makeRequest('PUT', '/update_token', {
      payload: { assertion: TEST_ASSERTION, token: TEST_NEW_TOKEN }
    }, function(res) {
      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.result, { success: true, email: TEST_EMAIL });
      done();
    });
  });

  it('deletes the account', function(done) {
    makeRequest('DELETE', '/account', {
      payload: { assertion: TEST_ASSERTION }
    }, function(res) {
      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.result, { success: true });
      done();
    });
  });

  it('creates a new account with a new token', function(done) {
    makeRequest('PUT', '/update_token', {
      payload: { assertion: TEST_ASSERTION, token: 'new token' }
    }, function(res) {
      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.result, { success: true, email: TEST_EMAIL });
      done();
    });
  });
});

