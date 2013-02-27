var assert = require('assert');
var helpers = require('../helpers');

var server = helpers.server;
var makeRequest = helpers.bindMakeRequest(server);

var TEST_EMAIL = 'foo@example.com';
var TEST_TOKEN = 'fake';
var TEST_NEW_TOKEN = 'fakenew';

describe('fake auth', function() {
  it('creates a new account', function(done) {
    makeRequest('PUT', '/update_token', {
      payload: { email: TEST_EMAIL, token: TEST_TOKEN, oldTokens: [ 'not', 'used' ] }
    }, function(res) {
      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.result, { success: true, email: TEST_EMAIL });
      done();
    });
  });

  it('fails to update new token when old token is invalid', function(done) {
    makeRequest('PUT', '/update_token', {
      payload: { email: TEST_EMAIL, token: TEST_NEW_TOKEN, oldTokens: [ 'bad' ] }
    }, function(res) {
      assert.equal(res.statusCode, 401);
      assert.equal(res.result.message, 'KnownUserUnknownToken');
      done();
    });
  });

  it('updates new token when an old token is valid', function(done) {
    makeRequest('PUT', '/update_token', {
      payload: { email: TEST_EMAIL, token: TEST_NEW_TOKEN, oldTokens: [ 'bad', TEST_TOKEN ] }
    }, function(res) {
      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.result, { success: true, email: TEST_EMAIL });
      done();
    });
  });

  it('succeeds using the current token', function(done) {
    makeRequest('PUT', '/update_token', {
      payload: { email: TEST_EMAIL, token: TEST_NEW_TOKEN }
    }, function(res) {
      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.result, { success: true, email: TEST_EMAIL });
      done();
    });
  });

  it('deletes the account', function(done) {
    makeRequest('DELETE', '/account', {
      payload: { email: TEST_EMAIL }
    }, function(res) {
      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.result, { success: true });
      done();
    });
  });

  it('creates a new account with a new token', function(done) {
    makeRequest('PUT', '/update_token', {
      payload: { email: TEST_EMAIL, token: 'fake new token' }
    }, function(res) {
      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.result, { success: true, email: TEST_EMAIL });
      done();
    });
  });
});

