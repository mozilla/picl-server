var assert = require('assert');
var helpers = require('../helpers');
var testClient = new helpers.TestClient();

describe('hello', function () {
  it('returns custom error response', function (done) {
    testClient.makeRequest('GET', '/hello', function (res) {
      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.result, { greeting: 'it works' });
      done();
    });
  });
});
