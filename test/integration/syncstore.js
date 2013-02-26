const assert = require('assert');
const helpers = require('../helpers');

const server = helpers.server;

const TEST_TOKEN = 'faketoken';

describe('syncstore web api', function() {

  // Request helper that automatically prepands endpoint to the url
  // and adds authorization headers.
  function makeRequest(method, url, options, cb) {
    url = '/' + TEST_TOKEN + url;
    if (typeof options === 'function') {
      cb = options;
      options = {};
    }
    if (!options.headers) {
      options.headers = {};
    }
    if (!options.headers.Authorization) {
      options.headers.Authorization = TEST_TOKEN;
    }
    return helpers.makeRequest.call(server, method, url, options, cb);
  }

  // Map a list of BSOs into an object keyed by item id.
  function collectBSOs(itemList) {
    var items = {};
    for (var i=0; i<itemList.length; i++) {
      items[itemList[i].id] = itemList[i];
    }
    return items;
  }

  it('allows basic writing and reading of a BSO', function(done) {
    makeRequest('POST', '/storage/col1', {
      payload: [{ id: 'one', payload: 'TESTONE' }],
    }, function(res) {
      assert.equal(res.statusCode, 200);
      makeRequest('GET', '/storage/col1', function(res) {
        assert.equal(res.statusCode, 200);
        assert.ok(res.result.version > 0);
        var items = collectBSOs(res.result.items);
        assert.equal(items.one.payload, 'TESTONE');
        done();
      });
    });
  });

  it('allows writing several items at once', function(done) {
    makeRequest('POST', '/storage/col1', {
      payload: [{ id: 'two', payload: 'TESTTWO' },
                { id: 'three', payload: 'TESTTHREE' }],
    }, function(res) {
      assert.equal(res.statusCode, 200);
      makeRequest('GET', '/storage/col1', function(res) {
        assert.equal(res.statusCode, 200);
        assert.ok(res.result.version > 0);
        var items = collectBSOs(res.result.items);
        assert.equal(items.one.payload, 'TESTONE');
        assert.equal(items.two.payload, 'TESTTWO');
        assert.equal(items.three.payload, 'TESTTHREE');
        assert.ok(items.one.version < items.two.version);
        assert.equal(items.two.version, items.three.version);
        done();
      });
    });
  });

  it('reflects version changes in the info document', function(done) {
    makeRequest('GET', '/info/collections', function(res) {
      assert.equal(res.statusCode, 200);
      var info1 = res.result;
      assert.deepEqual(Object.keys(info1.collections).sort(), ['col1']);
      makeRequest('POST', '/storage/col2', {
        payload: [{ id: 'tester' }],
      }, function(res) {
        assert.equal(res.statusCode, 200);
        makeRequest('GET', '/info/collections', function(res) {
          assert.equal(res.statusCode, 200);
          var info2 = res.result;
          assert.deepEqual(Object.keys(info2.collections).sort(),
                           ['col1', 'col2']);
          assert.ok(info1.version < info2.version);
          assert.equal(info1.version, info2.collections.col1);
          assert.equal(info2.version, info2.collections.col2);
          done();
        });
      });
    });
  });

  it('can filter BSOs by id', function(done) {
    makeRequest('GET', '/storage/col1?ids=one,three', function(res) {
      assert.equal(res.statusCode, 200);
      var items = collectBSOs(res.result.items);
      assert.deepEqual(Object.keys(items).sort(), ['one', 'three']);
      done();
    });
  });

  it('can filter BSOs by last-modified version', function(done) {
    makeRequest('GET', '/storage/col1?newer=0', function(res) {
      assert.equal(res.statusCode, 200);
      var items = collectBSOs(res.result.items);
      assert.deepEqual(Object.keys(items).sort(), ['one', 'three', 'two']);
      var v = items.one.version;
      makeRequest('GET', '/storage/col1?newer='+v, function(res) {
        assert.equal(res.statusCode, 200);
        var items = collectBSOs(res.result.items);
        assert.deepEqual(Object.keys(items).sort(), ['three', 'two']);
        var v = items.two.version;
        makeRequest('GET', '/storage/col1?newer='+v, function(res) {
          assert.equal(res.statusCode, 200);
          var items = collectBSOs(res.result.items);
          assert.deepEqual(Object.keys(items).sort(), []);
          done();
        });
      });
    });
  });

  it('sends a last-modified header with GET responses', function(done) {
    makeRequest('GET', '/storage/col1', function(res) {
      assert.equal(res.statusCode, 200);
      assert.equal(res.result.version, res.headers['X-Last-Modified-Version']);
      done();
    });
  });

  it('supports 304-Not-Modified for info and collections', function(done) {
    makeRequest('GET', '/info/collections', function(res) {
      assert.equal(res.statusCode, 200);
      var info = res.result;
      var opts = {
        headers: { 'X-If-Modified-Since-Version': ''+info.version }
      };
      makeRequest('GET', '/info/collections', opts, function(res) {
        assert.equal(res.statusCode, 304);
        var col1Version = info.collections.col1;
        opts.headers['X-If-Modified-Since-Version'] = ''+col1Version;
        makeRequest('GET', '/storage/col1', opts, function(res) {
          assert.equal(res.statusCode, 304);
          opts.headers['X-If-Modified-Since-Version'] = ''+(col1Version - 1);
          makeRequest('GET', '/storage/col1', opts, function(res) {
            assert.equal(res.statusCode, 200);
            done();
          });
        });
      });
    });
  });

  it('supports 412-Precondition-Failed for writes', function(done) {
    makeRequest('GET', '/info/collections', function(res) {
      assert.equal(res.statusCode, 200);
      var col1Version = res.result.collections.col1;
      var opts = {
        payload: [{ id: 'five' }],
        headers: { 'X-If-Unmodified-Since-Version': ''+(col1Version - 1) }
      };
      makeRequest('POST', '/storage/col1', opts, function(res) {
        assert.equal(res.statusCode, 412);
        done();
      });
    });
  });

  it('prevents other users from accessing my data', function(done) {
    makeRequest('GET', '/info/collections', {
      headers: { Authorization: TEST_TOKEN + "BAD" }
    }, function(res) {
      assert.equal(res.statusCode, 401);
      makeRequest('GET', '/storage/col1', {
        headers: { Authorization: TEST_TOKEN + "BAD" }
      }, function(res) {
        assert.equal(res.statusCode, 401);
        done();
      });
    });
  });

  it('errors if client sends a not-yet-used version number', function(done) {
    makeRequest('GET', '/storage/col1', function(res) {
      assert.equal(res.statusCode, 200);
      var newer = res.result.version + 1;
      makeRequest('GET', '/storage/col1?newer='+newer, function(res) {
        assert.equal(res.statusCode, 400);
        assert.equal(res.result.message, 'unseen version number');
        done();
      });
    });
  });

});

