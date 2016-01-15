/*global describe, before, after, it */
"use strict";

var usocket = require('../index');

describe('socket', function() {
	var socket;
	it("can create a USocket", function() {
		socket = new usocket.USocket();
	});
});
