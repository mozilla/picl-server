const async = require('async');
const config = require('../lib/config.js');

const kv = require('./kv');

/* Account management module
 *
 * Each account is stored in the bucket
 * with this schema:
 *
 *  bucket[<token>] = {
 *    email: <email>
 *    data: <data>
 *  }
 *
 *  bucket[<email>] = <token>
 *
 * */


/*
 * This function ensures that the data in storage is using the
 * most up to date token.
 * It checks to see if the current token is in use and if not,
 * iterates over the old tokens to see if they should be
 * updated.
 * */
function updateTokens(currentToken, oldTokens, cb) {
  tokenExists_(currentToken, function(err, exists, email) {
    if (err) return cb(err);

    // if the current token is in use, we're done
    if (exists) {
      cb(null, { status: 'Success', email: email });
    } else if (oldTokens && oldTokens.length) {
      // copy token array
      var tokens = [].concat(oldTokens);
      var found = false;

      // Iterate through the old tokens to see if
      // any one is in use, then update it.
      async.until(
        function() {
          // condition
          return found || !tokens.length;
        },
        function(callback) {
          // work
          var token = tokens.shift();
          updateToken_(currentToken, token, function (err, result) {
            if (result && result.status === 'Success') {
              found = result;
            }
            callback(null);
          });
        },
        function(err) {
          // done
          if (err) return cb(err);
          cb(!found ? 'UnknownToken' : null, found);
        }
      );
    } else {
      // current token not found and no old tokens supplied means
      // we give up
      cb('UnknownToken');
    }
  });
}

/* Utility function used by updateTokens
 *
 * Checks to see if a record exists for a given token
 * */
function tokenExists_(token, cb) {
  kv.get(token, function(err, result) {
    if (err) return cb(err);

    cb(null, !!result, result && result.value.email);
  });
}

/* Utility function used by updateTokens
 *
 * Check if the old token is being used and update any records to
 * use the current token if so.
 * Either returns 'Success' if the records exist or 'UnknownToken' otherwise
 * */
function updateToken_(currentToken, oldToken, cb) {
  // get records for the old token
  kv.get(oldToken, function(err, result) {
    if (err) return cb(err);

    if (result) {
      // move records to new token
      kv.set(currentToken, result.value, function(err) {
        if (err) return cb(err);
        // update token of email
        kv.set(result.value.email, currentToken, function(err) {
          if (err) return cb(err);
          // delete the records for the old token if they exist
          kv.delete(oldToken, function(err) {
            if (err) return cb(err);
            cb(null, { status: 'Success', email: result.value.email });
          });
        });
      });
    } else {
      // records not found for token
      cb('UnknownToken');
    }
  });

}

// checks if an email address is known
function knownEmail(email, cb) {
  kv.get(email, function(err, result) {
    cb(null, !!result);
  });
}

// creates a new account record
function create(token, email, cb) {
  kv.set(token, { email: email, data: null }, function(err) {
    if (err) return cb(err);
    // mark email as known
    kv.set(email, token, function(err) {
      if (err) return cb(err);
      cb(null, { status: 'SlotCreated' });
    });
  });
}

function del(email, cb) {
  async.waterfall([
    // get the token associated with the email
    function(callback) {
      kv.get(email, callback);
    },
    // delete token and data
    function(tokenRes, callback) {
      kv.delete(tokenRes.value, callback);
    },
    // make email unknown
    function(callback) {
      kv.delete(email, callback);
    }
  ], function(err) {
    if (err) return cb(err);
    cb(null, { status: 'Okay' });
  });
}

module.exports = {
  updateTokens: updateTokens,
  create: create,
  delete: del,
  knownEmail: knownEmail
};
