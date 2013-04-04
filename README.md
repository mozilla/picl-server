# PiCL Storage Server

The is the PICL Storage server, you can read up some [architecture
discussion][architecture] and have a look at [the API documentation] [api]

[architecture]: https://id.etherpad.mozilla.org/picl-backend
[api]: https://wiki.mozilla.org/Identity/AttachedServices/StorageProtocolZero

## How to install and run it

PiCL is using [Node.js](http://nodejs.org) internally, so you'll need to have
this installed. It's also using the *npm* package manager.

To have this up and running, you can do the following:

    $ git clone git://github.com/mozilla/picl-server.git
    $ npm install

And you should be fine.

To make it run, just run `npm start` and you'll be all set!

## Testing

You can run the tests yourself using the `npm test` command. In case you want
to run the tests on a remote server, you can set the `TEST_REMOTE`
variable to the address of the server you want to test:

    $ export TEST_REMOTE=http://127.0.0.1:8080
    $ npm test
    
## Storage Backends
By default, all data is stored in memory. To use the mysql backend, set the environmental variable `KVSTORE_BACKEND=mysql`. E.g.:

    $ KVSTORE_BACKEND=mysql npm start
    
Or, to run tests against the mysql backend:

    $ KVSTORE_BACKEND=mysql npm test
