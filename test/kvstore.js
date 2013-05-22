var assert = require('assert');
var db = require('../lib/kv');
var config = require('../lib/config');
var kvstore = require('kvstore')(config.root());

describe('kvstore', function () {

  it('can set and retrieve keys', function (done) {
    db.set("test-key", "VALUE", function(err) {
      assert.equal(err, null);
      db.get("test-key", function(err, info) {
        assert.equal(err, null);
        assert.equal(info.value, "VALUE");
        done();
      });
    });
  });

  it('supports atomic check-and-set', function (done) {
    db.set("test-key", "VALUE", function(err) {
      assert.equal(err, null);
      db.get("test-key", function(err, info) {
        assert.equal(info.value, "VALUE");
        db.cas("test-key", "OTHER-VALUE-ONE", info.casid, function(err) {
          assert.equal(err, null);
          db.cas("test-key", "OTHER-VALUE-TWO", info.casid, function(err) {
            assert.equal(err, kvstore.ERROR_CAS_MISMATCH);
            db.get("test-key", function(err, info) {
              assert.equal(err, null);
              assert.equal(info.value, "OTHER-VALUE-ONE");
              done();
            });
          });
        });
      });
    });
  });

  it('cleans up', function(done) {
    cleanUp(function(err) {
      assert.equal(err, null);
      done();
    });
  });

});

function cleanUp(cb) {
  if (config.get('kvstore.backend') === 'mysql') {
    db.connection.closeAndRemove(cb);
  } else {
    cb(null);
  }
}
