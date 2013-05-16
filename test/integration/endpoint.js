const assert = require('assert');
const helpers = require('../helpers');
const nock = require('nock');


const server = helpers.server;

const TEST_TOKEN = 'fakepushtoken';

const PUSH_HOST = 'http://pushserver.org';
const ENDPOINT_1 = '/notify/testendpoint1';
const ENDPOINT_2 = '/notify/testendpoint2';

describe('syncstore web api', function() {

  // Test client that includes auth information by default.
  var testClient = new helpers.TestClient({
    basePath: '/' + TEST_TOKEN,
    defaultHeaders: { Authorization: TEST_TOKEN },
  });

  it('allows creation of a new endpoint', function(done) {
    testClient.makeRequest('POST', '/endpoint', {
      payload: { endpoint: PUSH_HOST + ENDPOINT_1},
    }, function(res) {
      assert.equal(res.statusCode, 204);
      done();
    });
  });

  it('allows creation of a second endpoint', function(done) {
    testClient.makeRequest('POST', '/endpoint', {
      payload: { endpoint: PUSH_HOST + ENDPOINT_2},
    }, function(res) {
      assert.equal(res.statusCode, 204);
      done();
    });
  });

  it('sends new version to endpoint after updates', function(done) {
    // Skip this test for remote servers since we cannot easily
    // intercept requests to the remote push sever it communicates with
    if (process.env.TEST_REMOTE) return done();

    // set up a mock server at the endpoint url
    // check to make sure it receives a put request with version 1
    nock(PUSH_HOST)
      .put(ENDPOINT_1)
      .reply(200, function (uri, body) {
        assert.equal(body, 'version=1');
        return;
      })
      .put(ENDPOINT_2)
      .reply(200, function (uri, body) {
        assert.equal(body, 'version=1');
        done();
        return;
      });

    testClient.makeRequest('POST', '/storage/col1', {
      payload: [{ id: 'one', payload: 'TESTONE' }],
    }, function(res) {
      assert.equal(res.statusCode, 200);
    });
  });

  it('allows deletion of an endpoint', function(done) {
    testClient.makeRequest('DELETE', '/endpoint', {
      payload: { endpoint: PUSH_HOST + ENDPOINT_1}
    }, function(res) {
      assert.equal(res.statusCode, 204);
      done();
    });
  });

  it('allows deletion of a second endpoint', function(done) {
    testClient.makeRequest('DELETE', '/endpoint', {
      payload: { endpoint: PUSH_HOST + ENDPOINT_2}
    }, function(res) {
      assert.equal(res.statusCode, 204);
      done();
    });
  });

  it('lets me delete all of my data', function(done) {
    testClient.makeRequest('DELETE', '', function(res) {
      assert.equal(res.statusCode, 204);
      testClient.makeRequest('GET', '/info/collections', function(res) {
        assert.equal(res.statusCode, 200);
        assert.equal(res.result.version, 0);
        done();
      });
    });
  });

});
