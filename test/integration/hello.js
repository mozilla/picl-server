var assert = require('assert');
var helpers = require('../helpers');
var server = helpers.server;
var makeRequest = helpers.bindMakeRequest(server);

describe('hello', function () {
  it('returns custom error response', function (done) {
    makeRequest('GET', '/hello', function (res) {
      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.result, { greeting: 'it works' });
      done();
    });
  });
});
