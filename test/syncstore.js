const assert = require('assert');
const syncstore = require('../lib/syncstore');
const config = require('../lib/config');

const TEST_USERID = 'fakeuser';
const TEST_COL1 = 'collection1';
const TEST_COL2 = 'collection2';

describe('syncstore', function () {

  var store = syncstore.connect(config.get('kvstore'));

  it('starts off with no collections', function (done) {
    store.getCollections(TEST_USERID, function(err, info) {
      assert.equal(err, null);
      assert.equal(info.version, 0);
      assert.deepEqual(info.collections, {});
      done();
    });
  });

  it('stores some items, creating the collection on demand', function (done) {
    var items = {
      one: { payload: "one" },
      two: { payload: "two" }
    };
    store.setItems(TEST_USERID, TEST_COL1, items, function(err, res) {
      assert.equal(err, null);
      assert.ok(res.version > 0);
      store.getCollections(TEST_USERID, function(err, info) {
        assert.equal(err, null);
        assert.ok(info.version > 0);
        var expected = {};
        expected[TEST_COL1] = info.version;
        assert.deepEqual(info.collections, expected);
        done();
      });
    });
  });

  it('allows those items to be read back out', function (done) {
    store.getItems(TEST_USERID, TEST_COL1, function(err, res) {
      assert.equal(err, null);
      assert.ok(res.version > 0);
      assert.deepEqual(Object.keys(res.items).sort(), ['one', 'two']);
      assert.equal(res.items.one.version, res.items.two.version);
      assert.equal(res.items.one.timestamp, res.items.two.timestamp);
      assert.equal(res.items.one.payload, 'one');
      assert.equal(res.items.two.payload, 'two');
      assert.equal(res.items.one.deleted, false);
      assert.equal(res.items.two.deleted, false);
      done();
    });
  });

  it("doesn't clobber one collection's data with another's", function (done) {
    var items = {
      eight: { payload: "eight" },
      nine: { payload: "nine" }
    };
    store.setItems(TEST_USERID, TEST_COL2, items, function(err, res) {
      assert.equal(err, null);
      assert.ok(res.version > 0);
      store.getCollections(TEST_USERID, function(err, info) {
        assert.equal(err, null);
        assert.ok(info.version > 0);
        assert.deepEqual(Object.keys(info.collections).sort(),
                         [TEST_COL1, TEST_COL2]);
        assert.ok(info.collections[TEST_COL1] < info.collections[TEST_COL2]);
        store.getItems(TEST_USERID, TEST_COL1, function(err, res) {
          assert.equal(err, null);
          assert.ok(res.version > 0);
          assert.deepEqual(Object.keys(res.items).sort(), ['one', 'two']);
          assert.equal(res.items.one.payload, 'one');
          assert.equal(res.items.two.payload, 'two');
          done();
        });
      });
    });
  });

  it('can write new items and replace existing items', function (done) {
    var items = {
      two: { payload: "TWO" },
      three: { payload: "THREE" }
    };
    store.setItems(TEST_USERID, TEST_COL1, items, function(err, resW) {
      assert.equal(err, null);
      assert.ok(resW.version > 0);
      store.getItems(TEST_USERID, TEST_COL1, function(err, resR) {
        assert.equal(err, null);
        assert.equal(resW.version, resR.version);
        assert.deepEqual(Object.keys(resR.items).sort(),
                         ['one', 'three', 'two']);
        assert.equal(resR.items.one.payload, 'one');
        assert.equal(resR.items.two.payload, 'TWO');
        assert.equal(resR.items.three.payload, 'THREE');
        done();
      });
    });
  });

  it('will reject writes if conditional on an old version', function (done) {
    var items = {
      four: { payload: "four" },
    };
    store.getCollections(TEST_USERID, function(err, info) {
      assert.equal(err, null);
      store.setItems(TEST_USERID, TEST_COL1, items, 0, function(err) {
        assert.equal(err, 'syncstore.versionMismatch');
        var preVer = info.version - 1;
        store.setItems(TEST_USERID, TEST_COL1, items, preVer, function(err) {
          assert.equal(err, 'syncstore.versionMismatch');
          var ver = info.version;
          store.setItems(TEST_USERID, TEST_COL1, items, ver, function(err) {
            assert.equal(err, null);
            done();
          });
        });
      });
    });
  });

  it('can mark items as deleted', function (done) {
    var items = {
      two: { deleted: true }
    };
    store.setItems(TEST_USERID, TEST_COL1, items, function(err, res) {
      assert.equal(err, null);
      assert.ok(res.version > 0);
      store.getItems(TEST_USERID, TEST_COL1, function(err, res) {
        assert.equal(err, null);
        assert.deepEqual(Object.keys(res.items).sort(),
                         ['four', 'one', 'three', 'two']);
        assert.equal(res.items.one.deleted, false);
        assert.equal(res.items.two.deleted, true);
        assert.equal(res.items.three.deleted, false);
        assert.equal(res.items.four.deleted, false);
        done();
      });
    });
  });

});
