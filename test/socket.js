/*global describe, before, after, it */
"use strict";

var fs = require('fs');
var assert = require('assert');
var usocket = require('../index');

describe('socket', function() {
	var server, csocket, ssocket;
	var socketpath = __dirname + "/test_socket";

	var filepath = __dirname + "/test_file";
	var filecontents = new Buffer("USocket test file\n");

	function hookErrors(done) {
		var hook = function(err) {
			if (server) server.removeListener('error', hook);
			if (csocket) csocket.removeListener('error', hook);
			if (ssocket) ssocket.removeListener('error', hook);
			done(err);
		};
		if (server) server.on('error', hook);
		if (csocket) csocket.on('error', hook);
		if (ssocket) ssocket.on('error', hook);
		return hook;
	}

	before(function() {
		fs.writeFileSync(filepath, filecontents);
	});

	it("can create a UServer", function() {
		server = new usocket.UServer();
	});

	it("can listen on a path", function(done) {
		done = hookErrors(done);
		server.listen(socketpath, function() {
			server.removeListener('error', done);
			done();
		});
	});

	it("can create a USocket", function() {
		csocket = new usocket.USocket();
	});

	it("can connect the client and server", function(done) {
		done = hookErrors(done);

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
		done = hookErrors(done);

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
		done = hookErrors(done);

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

	it("can send a fd from server to client", function(done) {
		done = hookErrors(done);

		var msg = new Buffer("Here you go");

		fs.open(filepath, "r", function(err, fd) {
			if (err) return done(err);
			ssocket.write({ data: msg, fds: [ fd ], callback: function() { fs.closeSync(fd); } });
		});

		var chandle;
		csocket.on('readable', chandle = function() {
			var m = csocket.read(msg.length, 1);
			if (!m) return;
			assert.deepEqual(m.data, msg);

			assert.notEqual(m.fds, null);
			assert.equal(m.fds.length, 1);
			csocket.removeListener('readable', chandle);

			var c = new Buffer(1024);
			fs.read(m.fds[0], c, 0, c.length, 0, function(err, len) {
				if (err) return done(err);
				assert.deepEqual(c.slice(0, len), filecontents);
				fs.closeSync(m.fds[0]);
				done();
			});
		});
	});

	it("can orderly shut down", function(done) {
		ssocket.on('error', done);
		csocket.on('error', done);

		var send = new Buffer("Hello There"), handle;

		ssocket.on('readable', function() {
			ssocket.read(0);
		});
		ssocket.on('end', function() {
			ssocket.end(send);
		});
		ssocket.on('close', function() {
			ssocket = null;
			if (!csocket)
				done();
		});

		var b;
		csocket.on('readable', function() {
			var l = csocket.read(send.length);
			assert.notEqual(!l, !b);
			if (l) b = l;
		});
		csocket.on('close', function() {
			csocket = null;
			if (!ssocket)
				done();
		});

		csocket.end();
	});

	after(function() {
		if (server) {
			server.close();
			fs.unlinkSync(socketpath);
			fs.unlinkSync(filepath);
		}
	});

});
