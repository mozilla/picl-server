var routes = [
  {
    method: 'GET',
    path: '/',
    config: {
      handler: hello
    }
  }
];

// Define the route
function hello(request) {
  request.reply({ greeting: 'it works' });
};

module.exports = routes;
