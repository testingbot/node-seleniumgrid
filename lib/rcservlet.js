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

var url = require('url');
var capabilityMatcher = require('./capabilitymatcher');
var registry = require('./registry');
var log = require('./log');
var models = require('./models');
var store = require('./store');

var extractParams = function(request, body) {
	var srvUrl = url.parse(request.url.toString(), true);
	var params = srvUrl.query;
	if (body.length > 0) {
		var postParams = body.split('&');
		for (var i = 0, len = postParams.length; i < len; i++) {
			var p = postParams[i].split('=');
			if (p.length === 2) {
				params[p[0]] = p[1];
			}
		}
	}

	return params;
};

var processCapabilities = function(requestedCapability) {
	for (var key in requestedCapability) {
		var lowerKey = key.toLowerCase();
		if ((lowerKey !== 'browsername') && (lowerKey !== 'version') && (lowerKey !== 'platform')) {
			continue;
		}

		if (key !== lowerKey) {
			requestedCapability[lowerKey] = requestedCapability[key];
			delete requestedCapability[key];
		}
	}

	var desiredCapabilities = new models.Capability(requestedCapability);

	return desiredCapabilities;
};

var newSession = function(desired_capabilities, body, request, cb) {	
	capabilityMatcher.findNode(desired_capabilities, function(node, nodeCapabilities) {
		if (!node) {
			return cb('ERROR', "Something went wrong processing your request", function() {});
		}

		store.removeAvailableNode(node.host, node.port, function() {
			node.available = false;

			cb('NEW_SESSION', node, function(response, resCb) {
				log.info("New session response for " + node.host + "_" + node.port + ": " + response.body);

				if (response.body.substring(0, 2) !== "OK") {
					log.warn("Error starting new browser: " + response.body);
					log.warn(desired_capabilities);
					response.statusCode = 500;
					resCb(response, null, desired_capabilities);
				} else {
					var responseData = response.body.split(',');
					var sessionID = responseData[1];

					var session = new models.Session('RC', node.host, node.port, sessionID);
					session.platform = nodeCapabilities.platform;
					session.alias = nodeCapabilities.alias;
					session.desiredCapabilities = desired_capabilities;

					registry.addSession(sessionID, session, desired_capabilities, function() {
						resCb(response, session, desired_capabilities);
					});
				}
			}, body, request);
		});
	});
};

exports.getType = function(request, body) {
	var params = extractParams(request, body);

	if (params.cmd === 'getNewBrowserSession') {
		return 'NEW_SESSION';
	} else if (params.cmd === 'testComplete') {
		return 'STOP_SESSION';
	} else {
		return 'REGULAR';
	}
};

exports.handleRequest = function(request, body, cb) {
	var params = extractParams(request, body);
	if (params.cmd === 'getNewBrowserSession') {
		var desired_capabilities = {};

		if (params['1'] !== undefined) {
			desired_capabilities.browsername = params['1'];
		}
		if (params['4'] !== undefined) {
			var extraCapabilities = decodeURIComponent(params['4'].replace(/\+/g, '%20')).split(';');
			for (var i = 0, len = extraCapabilities.length; i < len; i++) {
				var d = extraCapabilities[i].split('=');
				if (d.length === 2) {
					desired_capabilities[d[0]] = d[1];
				}
			}
		}

		desired_capabilities = processCapabilities(desired_capabilities);

		var allowedBrowsers = ['any', 'chrome', 'googlechrome', 'firefox', 'iexplore', 'safari', 'opera'];

		if (allowedBrowsers.indexOf(params['1']) === -1) {
			var bodyStr = [];
			params['1'] = desired_capabilities.browsername;

			if (params['4'] === undefined) {
				params['4'] = "";
				for (var cap in desired_capabilities) {
					params['4'] += cap + "=" + desired_capabilities[cap] + ";";
				}
			}
			params['4'] = encodeURIComponent(params['4']);
			
			for (var key in params) {
				bodyStr.push(key + "=" + params[key]);
			}

			body = bodyStr.join("&");
			request.headers['content-length'] = body.length;
			
			request.url = "/selenium-server/driver/?" + body;

			newSession(desired_capabilities, body, request, cb);
		} else {
			newSession(desired_capabilities, body, request, cb);
		}
	} else {

		if (!params['sessionId']) {
			return cb('ERROR', "Missing sessionId", function() {});
		}

		registry.getSessionById(params['sessionId'], function(session) {
			if (!session) {
				// wrong session, or session has ended already?
				return cb('ERROR', "Unknown sessionId: " + params['sessionId'], function() {});
			} else {
				var node = store.getNode(session.nodeHost, session.nodePort);
				if (params.cmd === 'testComplete') {
					cb('STOP_SESSION', node, function(response, cb) { cb(response, session); }, body, request);
				} else {
					cb('REGULAR', node, function(response, cb) {
						if (response.body.substring(0, 5).toUpperCase() === 'ERROR') {
							if (response.body.indexOf('session was already stopped') > - 1) {
								log.warn("Session stopped");
							} else {
								cb(response, session);
							}
						} else {
							cb(response, session);
						}

					}, body, request);
				}
			}
		});
	}
};