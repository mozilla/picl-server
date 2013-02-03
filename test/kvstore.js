var assert = require('assert');
var kvstore = require('../lib/kvstore');

describe('kvstore', function () {

  it('can set and retrieve keys', function (done) {
    kvstore.connect(null, function(err, db) {
      db.set("test-key", "VALUE", function(err) {
        assert.equal(err, null);
        db.get("test-key", function(err, info) {
          assert.equal(err, null);
          assert.equal(info.value, "VALUE");
          done();
        });
      });
    });
  });

  it('supports atomic check-and-set', function (done) {
    kvstore.connect(null, function(err, db) {
      db.set("test-key", "VALUE", function(err) {
        db.get("test-key", function(err, info) {
          assert.equal(info.value, "VALUE");
          db.cas("test-key", "OTHER-VALUE-ONE", info.casid, function(err) {
            assert.equal(err, null);
            db.cas("test-key", "OTHER-VALUE-TWO", info.casid, function(err) {
              assert.notEqual(err, null);
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
  });

});
