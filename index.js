"use strict";

var util = require('util');
var stream = require('stream');
var EventEmitter = require('events');
var uwrap = require('bindings')('uwrap');
var debug = require('debug')("usocket");


//-----+-----+-----+-----+-----+-----+-----+-----+-----+-----+-----+-----+-----+-----+-----+-----+-----+-----+-----+-----
//--

exports.USocket = USocket;
function USocket(opts, cb) {
	if (!opts || typeof opts !== 'object')
		opts = { path: opts };

	var duplexOpts = { writableObjectMode: true };
	if ("allowHalfOpen" in opts)
		duplexOpts = opts.allowHalfOpen;
	stream.Duplex.call(this, duplexOpts);

	debug("new USocket", opts);
	if (opts.fd || opts.path)
		this.connect(opts, cb);
}

util.inherits(USocket, stream.Duplex);

USocket.prototype._read = function(size) {
	debug("USocket._read", size);
	if (this._wrap)
		this._wrap.resume();
};

USocket.prototype._write = function(chunk, encoding, callback) {
	if (!this._wrap)
		return callback(new Error("USocket not connected"));

	var data, fds, cb;
	if (Buffer.isBuffer(chunk)) {
		data = chunk;
	}
	else if (Array.isArray(chunk)) {
		fds = chunk;
	}
	else {
		cb = chunk.callback;
		data = chunk.data;
		fds = chunk.fds;
	}

	if (data && !Buffer.isBuffer(data))
		return callback(new Error("USocket data needs to be a buffer"));
	if (fds && !Array.isArray(fds))
		return callback(new Error("USocket fds needs to be an array"));
	if (cb && typeof cb !== 'function')
		return callback(new Error("USocket write callback needs to be a function"));
	if (!data && !fds)
		return callback(new Error("USocket write needs a data or array"));

	debug("USocket._write", data && data.length, fds);
	var r = this._wrap.write(data, fds);
	if (util.isError(r)) {
		debug("USocket._write error", r);
		return callback(r);
	}
	else if (r) {
		if (cb) cb(chunk);
		return callback();
	}

	debug("USocket._write wating");
	this._wrap.drain = this._write.bind(this, chunk, encoding, callback);
};

USocket.prototype.connect = function(opts, cb) {
	if (this._wrap)
		throw new Error("connect on already connected USocket");

	if (typeof opts === 'string') {
		opts = { path: opts };
	}

	if (typeof cb === 'function')
		this.once('connected', cb);

	debug("USocket connect", opts);

	this._wrap = new uwrap.USocketWrap(this._wrapEvent.bind(this));
	this._wrap.shutdownCalled = false;
	this._wrap.endReceived = false;
	this._wrap.drain = null;
	this._wrap.fds = [];

	if (typeof opts.fd === 'number') {
		this._wrap.adopt(opts.fd);
		this.fd = opts.fd;
		return;
	}

	if (typeof opts.path !== 'string')
		throw new Error("USocket#connect expects string path");
	this._wrap.connect(opts.path);
};

USocket.prototype._wrapEvent = function(event, a0, a1) {
	if (event === "connect") {
		this.fd = a0;
		debug("USocket connected on " + this.fd);
		this.emit('connected');
	}

	if (event === "error") {
		debug("USocket error", a0);
		this._wrap.close();
		this._wrap = null;
		this.emit("error", a0);
		this.emit('close', a0);
	}

	if (event === "data") {
		if (a1 && a1.length > 0) {
			debug("USocket received file descriptors", a1);
			this._wrap.fds = this._wrap.fds.concat(a1);
			this.emit('fds', a1);
		}

		if (a0) {
			if (!this.push(a0))
				this._wrap.pause();
		}

		if (a1 && !a0) {
			this.emit('readable');
		}

		if (!a0 && !a1 && !this._wrap.endReceived) {
			debug("USocket end of stream received");
			this._wrap.endReceived = true;
			this._wrap.pause();
			this.push(null);
			this.maybeClose();
		}
	}

	if (event === "drain") {
		var d = this._wrap.drain;
		this._wrap.drain = null;
		if (d) d();
	}
};

USocket.prototype.read = function(size, fdSize) {
	if (!this._wrap) return null;

	if (typeof fdSize === 'undefined')
		return stream.Duplex.prototype.read.apply(this, arguments);

	if (fdSize === null)
		fdSize = this._wrap.fds.length;
	else if (this._wrap.fds.length < fdSize)
		return null;

	var data = stream.Duplex.prototype.read.call(this, size);
	if (size && !data) return data;

	var fds = this._wrap.fds.splice(0, fdSize);
	return { data: data, fds: fds };
};

USocket.prototype.write = function(chunk, encoding, callback) {
	if (typeof encoding === 'function') {
		callback = encoding;
		encoding = null;
	}

	if (typeof chunk === 'string') {
		chunk = new Buffer(chunk);
	}

	if (Buffer.isBuffer(chunk)) {
		chunk = { data: chunk };
	}

	stream.Duplex.prototype.write.call(this, chunk, null, callback);
};

USocket.prototype.end = function(data, encoding, callback) {
	stream.Duplex.prototype.end.call(this, data, encoding, callback);
	if (this._wrap) {
		debug("USocket shutdown");
		this._wrap.shutdownCalled = true;
		this._wrap.shutdown();
		this.read(0);
		this.maybeClose();
	}
};

USocket.prototype.destroy = function() {
	if (!this._wrap)
		return;
	this._wrap.close();
	this._wrap = null;
};

USocket.prototype.maybeClose = function() {
	if (!this._wrap || !this._wrap.shutdownCalled || !this._wrap.endReceived)
		return;
	debug("USocket closing socket at end");
	this.destroy();
	this.emit('close');
};

//-----+-----+-----+-----+-----+-----+-----+-----+-----+-----+-----+-----+-----+-----+-----+-----+-----+-----+-----+-----
//--

exports.UServer = UServer;
function UServer() {
	this.paused = false;
	this.listening = false;
	EventEmitter.call(this);
}

util.inherits(UServer, EventEmitter);

UServer.prototype.listen = function(path, backlog, cb) {
	if (this._wrap || this.listening)
		throw new Error("listen on already listened UServer");

	if (typeof path === 'object') {
		backlog = path.backlog;
		path = path.path;
		cb = backlog;
	}
	else if (typeof backlog === 'function') {
		cb = backlog;
		backlog = 0;
	}

	backlog = backlog || 16;

	if (typeof path !== 'string')
		throw new Error("UServer expects valid path");

	if (typeof backlog !== 'number')
		throw new Error("UServer expects valid path");

	if (typeof cb === 'function')
		this.once('listening', cb);

	debug("creating UServerWrap");
	this._wrap = new uwrap.UServerWrap(this._wrapEvent.bind(this));
	debug("start UServerWrap#listen");
	this._wrap.listen(path, backlog);
};

UServer.prototype.pause = function() {
	this.paused = true;
	if (this.listening && this._wrap)
		this._wrap.pause();
};

UServer.prototype.resume = function() {
	this.paused = false;
	if (this.listening && this._wrap)
		this._wrap.resume();
};

UServer.prototype.close = function() {
	if (!this._wrap)
		return;
	this._wrap.close();
	this._wrap = undefined;
};

UServer.prototype._wrapEvent = function(event, a0, a1) {
	if (event === "listening") {
		this.fd = a0;
		debug("UServer listening on " + this.fd);
		this.emit('listening');
		this.listening = true;
		if (!this.paused)
			this._wrap.resume();
	}

	if (event === "error") {
		debug("UServer error", a0);
		this._wrap.close();
		this._wrap = null;
		this.emit("error", a0);
	}

	if (event === "accept") {
		debug("UServer accepted socket " + a0);
		var n = new USocket({ fd: a0 });
		this.emit('connection', n);
	}
};
