var https = require('https');
var http = require('http');
var url = require('url');

var protocols = {
  'http:': http,
  'https:': https
};

// sends an assertion to a verification server
module.exports = function verify(assertion, audience, verifier_url, cb) {
  assertion = JSON.stringify({
    assertion: assertion,
    audience: audience
  });

  var verifier = url.parse(verifier_url);

  var vreq = protocols[verifier.protocol].request({
    host: verifier.hostname,
    port: verifier.port,
    path: verifier.path,
    method: 'POST',
    headers: {
      'Content-Length': assertion.length,
      'Content-Type': 'application/json'
    }
  }, function (vres) {
    var result = "";
    vres.on('data', function(chunk) { result += chunk; });
    vres.on('end', function() {
      try {
        var data = JSON.parse(result);
        if (data.status === 'okay') {
          cb(null, data);
        } else {
          cb(data.reason);
        }
      } catch(e) {
        cb(e);
      }
    });
  });

  vreq.on('error', function(e) {
    console.error('problem with request: ' + e.message, e.stack);
  });
  vreq.write(assertion);
  vreq.end();
};
