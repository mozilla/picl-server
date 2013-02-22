var http = require('http');

exports.server = require('../server');

exports.makeRequest = function (method, path, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }

  var next = function (res) {
    return callback(res);
  };

  // nodejs lowercases headers, so simulate that behaviour here.
  var rawHeaders = options.headers || {};
  var headers = {};
  for (var key in rawHeaders) {
    if(rawHeaders.hasOwnProperty(key)) {
      headers[key.toLowerCase()] = rawHeaders[key];
    }
  }

  this.inject({
    method: method,
    url: path,
    payload: JSON.stringify(options.payload),
    headers: headers
  }, next);
};

exports.getUser = function(audience, cb) {
  console.log('getting aud', encodeURIComponent(audience));

  var req = http.request({
    host: 'personatestuser.org',
    path: '/email_with_assertion/' + encodeURIComponent(audience) + '/prod',
    method: 'GET'
  }, function (res) {
    var result = '';
    res.on('data', function(chunk) { result += chunk; });
    res.on('end', function() {
      var data;
      try {
        data = JSON.parse(result);
      } catch (e) {
        return cb(e);
      }
      cb(null, data);
    });
  });
  req.on('error', function(e) {
    console.error('get user error:', e);
    cb(e);
  });
  req.end();
};
