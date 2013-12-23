/*
Copyright 2013 TestingBot

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

     http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

exports.Node = function(host, port, capabilities, json) {
	this.host = null;
	this.port = 5556;
	this.available = true;
	this.lastSeen = 0;
	this.capabilities = [];
	this.platform = "";

	this._construct = function(host, port, capabilities, json) {
		this.host = host;
		this.port = parseInt(port, 10);
		this.capabilities = capabilities;

		this.lastSeen = (new Date()).getTime();
		this.json = json;
		this.platform = this.capabilities[0].platform;
	};

	this._construct(host, port, capabilities, json);
};

exports.Capability = function(cap) {
	this.platform = null;
	this.seleniumprotocol = null;
	this.browsername = null;
	this.maxinstances = 1;
	this.version = null;
	
	this._construct = function(cap) {
		this.platform = cap.platform;
		this.seleniumprotocol = cap.seleniumProtocol;
		this.browsername = cap.browserName;
		this.maxinstances = cap.maxInstances;
		this.version = cap.version;
		for (var key in cap) {
			this[key] = cap[key];
		}
	};

	this._construct(cap);
};

exports.Response = function(statusCode, body) {
	this.statusCode = 200;
	this.headers = {'Content-Type': 'text/plain'};
	this.body = "";

	this._construct = function(statusCode, body) {
		this.statusCode = statusCode;
		this.body = body;
	};

	this._construct(statusCode, body);
};

exports.Session = function(type, nodeHost, nodePort, sessionID) {
	this.nodeHost = null;
	this.nodePort = 0;
	this.type = null;
	this.sessionID = null;
	this.lastUsed = 0;
	this.startTime = 0;
	this.timeoutIntervalID = null;
	this.platform = "";
	this.desiredCapabilities = null;
	this.response = null;

	// diagnostics
	this.lastResponseTime = 0;
	this.lastSentTime = 0;

	this.lastResponseBody = "";
	this.lastSentBody = "";

	this._construct = function(type, nodeHost, nodePort, sessionID) {
		this.type = type;
		this.nodeHost = nodeHost;
		this.nodePort = nodePort;
		this.sessionID = sessionID;
		this.lastUsed = (new Date()).getTime();
	};

	this._construct(type, nodeHost, nodePort, sessionID);
};