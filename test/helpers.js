exports.server = require('../server');

exports.makeRequest = function (method, path, callback) {
  var next = function (res) {
    return callback(res);
  };

  this.inject({
    method: method,
    url: path
  }, next);
};
