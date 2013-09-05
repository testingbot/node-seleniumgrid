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

var capabilityMatcher = require('./capabilitymatcher');
var registry = require('./registry.js');
var log = require('./log');
var models = require('./models');
var store = require('./store');

exports.extractSessionId = function(url) {
	if (!url) {
		return null;
	}

	var matches = url.match(/\/wd\/hub\/session\/([^\/]+)/i);
	if (matches && matches[1]) {
		return matches[1];
	} else {
		return null;
	}
};

var translateDesiredCapabilities = function(requestedCapability) {
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

var newSession = function(desiredCapabilities, body, request, cb) {	
	capabilityMatcher.findNode(desiredCapabilities, function(node, nodeCapabilities) {
		if (!node) {
			return cb('ERROR', "Something went wrong processing your request", function() {});
		}

		// remove the node from the availableNodes pool
		store.removeAvailableNode(node.host, node.port, function() {
			node.available = false;

			var newCaps = merge(desiredCapabilities, nodeCapabilities);
			if (newCaps.browsername) {
				delete newCaps.browsername;
			}
			
			var json = JSON.parse(body);
			json.desiredCapabilities = newCaps;

			body = JSON.stringify(json);
			request.headers['content-length'] = body.length;

			cb('NEW_SESSION', node, function(response, resCb) {
				var sessionID;
				try {
					var json = JSON.parse(response.body);
					sessionID = json.sessionId;
				} catch (ex) {
					sessionID = exports.extractSessionId(response.headers.location);
				}
				if (!sessionID) {
					log.warn("Could not extract sessionID!");
					log.warn(response.headers.location);
					log.info(response);

					store.addAvailableNode(node, function() {});
					
					// corrupt location header?
					return resCb(response, null);
				}

				var session = new models.Session('WebDriver', node.host, node.port, sessionID);
				session.platform = nodeCapabilities.platform;
				session.desiredCapabilities = desiredCapabilities;

				registry.addSession(sessionID, session, desiredCapabilities, function() {
					resCb(response, session, desiredCapabilities);
				});
			}, body, request);
		});
	});
};

var merge = function(desiredCapabilities, nodeCapabilities) {
	var newCaps = desiredCapabilities;
	for (var k in nodeCapabilities) {
		var lowerK = k.toLowerCase();
		if ((lowerK === 'platform') || (lowerK === 'version') || (lowerK === 'browsername')) {
			newCaps[lowerK] = nodeCapabilities[k];
		}
	}

	return newCaps;
};

exports.getType = function(request) {
	if (request.url === '/wd/hub/session') {
		return 'NEW_SESSION';
	} else if (request.method.toUpperCase() === 'DELETE') {
		return 'STOP_SESSION';
	} else {
		return 'REGULAR';
	}
};

exports.handleRequest = function(request, body, cb) {
	if (request.url === '/wd/hub/session') {
		// new session
		var json = JSON.parse(body);
		if (json.desiredCapabilities) {
			// version always needs to be string
			if (json.desiredCapabilities.version) {
				json.desiredCapabilities.version = json.desiredCapabilities.version.toString();
				body = JSON.stringify(json);
				request.headers['content-length'] = body.length;
			}

			var desiredCapabilities = translateDesiredCapabilities(json.desiredCapabilities);
			var allowedBrowsers = ['any', 'chrome', 'googlechrome', 'firefox', 'internet explorer', 'safari', 'opera', 'iphone', 'ipad', 'ios', 'android', 'galaxytab', 'nexuss', 'nexusone', 'htcdesire', 'phantomjs'];

			json.desiredCapabilities = desiredCapabilities;

			if (json.desiredCapabilities.browsername) {
				json.desiredCapabilities.browserName = json.desiredCapabilities.browsername;
				delete json.desiredCapabilities.browsername;
			}
			
			body = JSON.stringify(json);
			request.headers['content-length'] = body.length;
			newSession(desiredCapabilities, body, request, cb);
		}
	} else {
		request.headers['content-length'] = body.length;
		var sessionID = exports.extractSessionId(request.url);
		
		if (!sessionID) {
			return cb('ERROR', "Missing sessionId", function() {});
		}
		
		registry.getSessionById(sessionID, function(session) {
			if (!session) {
				// wrong session, or session has ended already?
				return cb('ERROR', "Unknown sessionId: " + sessionID, function() {});
			}

			var node = store.getNode(session.nodeHost, session.nodePort);

			if ((request.method.toUpperCase() === 'DELETE') && request.url.endsWith("/session/" + session.sessionID)) {
				cb('STOP_SESSION', node, function(response, cb) { cb(response, session); }, body, request);
			} else {
				cb('REGULAR', node, function(response, cb) { cb(response, session); }, body, request);
			}
		});
	}
};