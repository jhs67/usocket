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
	opts = opts || {};

	var duplexOpts = {};
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
	debug("USocket._write", chunk.length);
	if (!this._wrap)
		return callback(new Error("USocket not connected"));

	if (this._wrap.write(chunk, null))
		return callback();

	this._wrap.once('drain', this._write.bind(this, chunk, encoding, callback));
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
		if (a0) {
			if (!this.push(a0))
				this._wrap.pause();
		}
		if (!a0 && !a1 && !this._wrap.endReceived) {
			debug("USocket end of stream received");
			this._wrap.endReceived = true;
			this._wrap.pause();
			this.push(null);
			this.maybeClose();
		}
	}
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
