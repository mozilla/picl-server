var assert = require('assert');
var kvstore = require('../lib/kvstore');
var config = require('../lib/config');

describe('kvstore', function () {

  it('can set and retrieve keys', function (done) {
    var db = kvstore.connect(config.get('kvstore'));
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
    var db = kvstore.connect(config.get('kvstore'));
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
    var mysql = require('../lib/kvstore/mysql.js');
    mysql.closeAndRemove(cb);
  } else {
    cb(null);
  }
}
