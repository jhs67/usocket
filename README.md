#USocket

## Overview

The native node.js socket supports creating unix domain sockets, but
they do not support passing file descriptors. This module includes
replacements for net.Server and net.Socket that extend the API
to allow passing file descriptors.

### Table of Contents

 * [Quick Start](#quick-start)
 * [UServer](#class-usocketuserver)
 * [USocket](#class-usocketusocket)

## Quick Start

#### Installation

```shell
npm install usocket
```

#### Quick Usage.

```js
var fs = require('fs');
var usocket = require('usocket');

var server = new usocket.UServer();
var client = new usocket.USocket();

server.listen(__dirname + "/socket", function() {
  client.connect(__dirname + "/socket");
});

server.on('connection', function(connection) {
  var msg = Buffer.from("message");
  var fd = fs.openSync(__filename, "r");
  setTimeout(function() {
  	connection.end({ data: msg, fds: [fd], callback: function() { fs.close(fd); } });
  }, 500);
});

client.on('connected', function() { client.read(0); });

client.on('readable', function() {
  var msg = client.read(7, 1);
  if (!msg) return;
  fs.close(msg.fds[0]);
  server.close();
  client.end();
})
```

## Class: usocket.UServer

The UServer class largely mimics the behavior of the native net.Server, but
the `'connection'` event will create [`usocket.USockets`](#class-usocketusocket).

### Event: 'connection'

 * USocket object - the newly connected socket

Emitted on receipt of a new connection. The only argument is a new instance
of usocket.USocket.

### Event: 'error'

Emitted when there is an error on the socket.

### Event: 'listening'

Emitted when the socket is ready to accept connections.

### server.listen(path[, backlog][, callback])

Start a local socket server listening for connection on the supplied path.
The optional callback will be set as a listener of the `'listening'` event.

### server.listen(options[, callback])

 * options Object:
  * path: the file system path to listen on
  * backlog: the accept backlog

Start a local socket server listening for connection on the supplied path.
The optional callback will be installed as a listener of the `'listening'` event.

### server.pause

Causes the server to pause accepting new connections. No more `'connection'` events
will be emitted until `resume` is called.

### server.resume

Resumes accepting connections on a paused server.

### server.close

Closes the connection. No further events will be emitted. Unlike the native
net.Server there is no `'close'` event and the accepted connections are not
tracked.

## Class: usocket.USocket

The USocket class mirrors the net.Socket class but extends the API of several
methods. A USocket implements the Duplex stream interface.

### new usocket.USocket([options][, callback])

Constructs a new USocket object. If the options object is provided, the
[`connect`](#socketconnect) method will be called immeditately.

### Event: 'connected'

The event is emitted without arguments when the socket is connected.

### Event: 'error'

This event indicates an error occurred on the socket. The 'close' event will
follow.

### Event: 'close'

This event is emitted when the socket is completely closed and no more
events will be generated and no more data may be sent.

### Event: 'readable'

This event is emitted as a readable stream and when there
are new file descriptors available for reading.

### socket.connect(path[, callback])

Connect to the unix domain server at the supplied path. The optional `callback`
will be set as a listener of the `'connected'` event.

### socket.read([length])

Implements the readable stream API.

### socket.read(length, count)

When an optional second argument is provided to the read method its operation
is modified. The `length` argument indicates the amount of data to be read from
the stream. If `length` is null then all the available data will be returned.

The `count` argument indicates the number of file descriptors to be read from
the stream. If `count` is null all available descriptors will be read. `count`
is allowed to be zero.

If either the data or descriptors isn't available, the call will return
null. Otherwise the two argument read returns an object instead of a buffer.
 * return Object:
  * data: the data read from the stream (as per the readable stream API)
  * fds: an array of file descriptors read from the stream

### socket.unshift(buffer, fds)

The `buffer` will put back on the the data read stream as per the readable
stream interface. The optional `fds` is an array of file descriptors that
will be put back onto the stream for subsequent reads.

### socket.write(buffer)

Implements the writable stream API.

### socket.write(array)

Writing an array of integers will send file descriptors across the socket.
The file descriptors must be kept open until the data is sent.

### socket.write(options)

Passing an options object to write allows simultaneously writing data and
file descriptors.
It also provides a means to know when the data has been sent and it is safe
to close the file descriptors.
 * options Object
  * data: (optional) a buffer of data to send.
  * fds: (optional) an array of file descriptors to send.
  * callback: (optional) called when the data has been sent.

### socket.destroy()

Closes the socket. No further events will be emitted.
