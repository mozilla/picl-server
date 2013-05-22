var config = require('./config');
var kvstore = require('kvstore')(config.root());

module.exports = kvstore.connect(config.get('kvstore'));

