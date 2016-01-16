/*global describe, before, after, it */
"use strict";

var fs = require('fs');
var assert = require('assert');
var usocket = require('../index');

describe('socket', function() {
	var server, csocket, ssocket;
	var socketpath = __dirname + "/test_socket";

	it("can create a UServer", function() {
		server = new usocket.UServer();
	});

	it("can listen on a path", function(done) {
		server.on('error', done);
		server.listen(socketpath, function() {
			server.removeListener('error', done);
			done();
		});
	});

	it("can create a USocket", function() {
		csocket = new usocket.USocket();
	});

	it("can connect the client and server", function(done) {
		server.on('error', done);
		csocket.on('error', done);

		var connected;
		server.on('connection', function(sock) {
			ssocket = sock;
			if (connected) return done();
		});

		csocket.connect(socketpath, function() {
			connected = true;
			if (ssocket) return done();
		});
	});

	it("can send data from client to server", function(done) {
		ssocket.on('error', done);
		csocket.on('error', done);

		var send = new Buffer("Hello There"), handle;
		ssocket.on('readable', handle = function() {
			var b = ssocket.read(send.length);
			if (b) {
				ssocket.removeListener('readable', handle);
				assert.deepEqual(b, send);
				done();
			}
		});

		csocket.write(send);
	});

	it("can send data from server to client", function(done) {
		ssocket.on('error', done);
		csocket.on('error', done);

		var send = new Buffer("Hello There"), handle;
		csocket.on('readable', handle = function() {
			var b = csocket.read(send.length);
			if (b) {
				csocket.removeListener('readable', handle);
				assert.deepEqual(b, send);
				done();
			}
		});

		ssocket.write(send);
	});

	after(function() {
		if (server) {
			server.close();
			fs.unlink(socketpath);
		}
	});

});
