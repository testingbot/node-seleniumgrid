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

var rcServlet = require('./rcservlet');
var webdriverServlet = require('./webdriverservlet');
var forwarder = require('./forwarderservlet');
var log = require('./log');
var registry = require('./registry');
var models = require('./models');
var store = require('./store');
var url = require('url');

var prepare = function(body, request, cb, retries, res) {
	var type;
	if (exports.determineProtocol(request.url) === 'RC') {
		type = rcServlet.getType(request, body);
	} else {
		type = webdriverServlet.getType(request);
	}

	handleRequest(body, request, cb, retries, res);
};

var handleRequest = function(body, request, cb, retries, res) {
   	if (exports.determineProtocol(request.url) === 'RC') {
   		// RC protocol
   		rcServlet.handleRequest(request, body, function(type, node, protocolCallback, body, request) {
   			if (type === 'ERROR') {
   				log.warn("Returning error message: " + node);
   				// in this case, node is an error message, dirty
   				return cb(new models.Response(404, node));
   			}
   			process(request, node, body, type, protocolCallback, cb, retries, 'RC', res);
   		});
   	} else {
   		// WebDriver protocol
   		webdriverServlet.handleRequest(request, body, function(type, node, protocolCallback, body, request) {
   			if (type === 'ERROR') {
   				log.warn("Returning error message: " + node);
   				// in this case, node is an error message, dirty
   				return cb(new models.Response(500, node));
   			}

   			process(request, node, body, type, protocolCallback, cb, retries, 'WebDriver', res);
   		});
   	}
};

var process = function(request, node, body, type, protocolCallback, cb, retries, protocol, res) {
	var parameters = {};
	// post data
	if (body.length > 0) {
		var args = body.split('&');
		for (var i = 0, len = args.length; i < len; i++) {
			var d = args[i].split('=');
			parameters[d[0]] = d[1];
		}
	}

	var urlData = url.parse(request.url.toString(), true);
	for (var key in urlData.query) {
		parameters[key] = urlData.query[key];
	}

	if (type === 'NEW_SESSION') {
		var startTime = (new Date());
		forwardRequest(request, node, body, type, protocolCallback, function(response, session, desired_capabilities) {
			var test = {};

			if (parameters['2']) {
				test.url = decodeURIComponent(parameters['2'].replace(/\+/g, '%20'));
			}

			test.startTime = startTime;

			session.startTime = session.lastSentTime = (new Date()).getTime();
			session.lastSentBody = request.url + ", " + JSON.stringify(parameters);
			store.updateSession(session, function() {
				cb(response, session);
			});
		}, retries, cb);
	} else {
		if (protocol === 'RC') {
			registry.getSessionById(parameters['sessionId'], function(session) {
				session.lastSentTime = (new Date()).getTime();
				session.lastSentBody = request.url + ", " + JSON.stringify(parameters);
				session.response = res;
				store.updateSession(session, function() {
					forwardRequest(request, node, body, type, protocolCallback, cb, retries, cb);
				});
			});
		} else {
			registry.getSessionById(webdriverServlet.extractSessionId(request.url), function(session) {
				session.lastSentTime = (new Date()).getTime();
				session.lastSentBody = request.method + ": " + request.url + ", " + JSON.stringify(parameters);
				session.response = res;
				
				store.updateSession(session, function() {
					forwardRequest(request, node, body, type, protocolCallback, cb, retries, cb);
				});
			});
		}
	}
};

var forwardRequest = function(request, node, body, type, protocolCallback, callback, retries, cb) {
	forwarder.forwardRequest(request, node, body, function(responseForwarded) {

		protocolCallback(responseForwarded, function(response, session, desired_capabilities) {
			if (session === null) {
				if (retries < 5) {
					// something went wrong
					log.warn("Failed to start session, try again");
					retries += 1;
					return setTimeout(function() {
						prepare(body, request, cb, retries);
					}, (2000 + (retries * 500)));
				} else {
					log.warn("Giving up retrying");
					return registry.removeNode(node.host, node.port, function() {
						cb(new models.Response(500, response.body));
					});
				}
			}

			// handle error when the proxy forwarding returns a bad response code
	    	if (responseForwarded.statusCode === 404) {
	    		log.warn("Received bad status code from node (" + node.host + ":" + node.port + "): for " + session.sessionID + " " + responseForwarded.statusCode);
	    		responseForwarded.body = "Session is gone, most likely a timeout occurred! " + responseForwarded.body;
	    		registry.removeSession(session.sessionID, function() {
		    		return registry.removeNode(node.host, node.port, function() {
		    			callback(responseForwarded);
		    		});
		    	});
	    	}
			
			// if the forwarder encountered an error, immediately execute callback
			// this happens when communication with the node failed
			if (response.error === true) {
				return callback(response, session, desired_capabilities);
			}

			var cmdParams = [];
			var urlData;

			if (exports.determineProtocol(request.url) === 'RC') {
				urlData = url.parse(request.url.toString(), true).query;

				if (body.length > 0) {
					var args = body.split('&');
					for (var i = 0, len = args.length; i < len; i++) {
						var d = args[i].split('=');
						urlData[d[0]] = d[1];
					}
				}

				for (var i = 0; i < 5; i++) {
					if (urlData[i]) {
						cmdParams.push("\"" + urlData[i].toString() + "\"");
					}
				}
			}

			session.lastResponseBody = response.statusCode + " - " + response.body;
			session.lastUsed = (new Date()).getTime();
			session.lastResponseTime = (new Date()).getTime();

			store.updateSession(session, function() {
				if (type === 'STOP_SESSION') {
					registry.removeSession(session.sessionID, function() {
						callback(response, session, desired_capabilities);
					});
				} else {
					callback(response, session, desired_capabilities);
				}
			});

		});
	});
};

exports.determineProtocol = function(url) {
	return (url.indexOf('/selenium-server/driver') > -1) ? 'RC' : 'WebDriver';
};

exports.handleRequest = function(request, cb, res) {
	var body = '';

	request.addListener('data', function(chunk) {
		body += chunk;
	});

	request.addListener('error', function(e) { log.warn(e); });

	request.addListener('end', function() {
		prepare(body, request, cb, 0, res);
	});
};