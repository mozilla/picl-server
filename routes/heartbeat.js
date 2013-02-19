const Hapi = require('hapi');

exports.routes = [
  {
    method: 'GET',
    path: '/__heartbeat__',
    config: {
      auth: {
        mode: 'none'
      },
      handler: heartbeat
    }
  }
];

// heartbeat
function heartbeat(request) {
  request.reply.payload('ok').type('text/plain').send();
}
