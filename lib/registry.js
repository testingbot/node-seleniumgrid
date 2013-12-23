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

var fs = require('fs');
var http = require('http');
http.globalAgent.maxSockets = Infinity;
var models = require('./models');
var log = require('./log');
var capabilityMatcher = require('./capabilitymatcher');
var store = require('./store');
var async = require('async');

exports.pendingRequests = [];

exports.NODE_TIMEOUT = 10000;
exports.TEST_TIMEOUT = 120000;
exports.MAX_DURATION = 1800000;
exports.timeouts = {};
exports.busyProcessingPendingRequests = false;

var _hubConfiguration = null;

String.prototype.endsWith = function(suffix) {
    return this.indexOf(suffix, this.length - suffix.length) !== -1;
};

setInterval(function() {
	var nodes = store.getAllNodes();
	async.each(Object.keys(nodes), function(key, callback) {
		var node = nodes[key];
		if (node) {
			if (((new Date()).getTime() - node.lastSeen) > exports.NODE_TIMEOUT) {
				// node no longer available?
				if (node.host.indexOf('testingbot') === -1) {
					exports.removeNode(node.host, node.port, function() {
						log.info("Node " + node.host + " removed from pool");
					});
				}
			}
		}

		callback();
	}, function(err) {});
		
}, 5000);

exports.processPendingRequest = function() {
	var len = exports.pendingRequests.length;

	if (len === 0) {
		return;
	}

	log.info("Processing pending requests, " + len);
	var now = (new Date()).getTime();
	async.eachSeries(exports.pendingRequests, function(request, callback) {
		if ((now - request.since) > 600000) {
			for (var i = 0, len = exports.pendingRequests.length; i < len; i++) {
				if (exports.pendingRequests[i] === request) {
					exports.pendingRequests.splice(i, 1);
				}
			}
			callback();
		}
		capabilityMatcher.findNode(request.desiredCapabilities, function(node, nodeCapabilities) {
			for (var i = 0, len = exports.pendingRequests.length; i < len; i++) {
				if (exports.pendingRequests[i] === request) {
					exports.pendingRequests.splice(i, 1);
				}
			}
			log.info("Found pending match");
			// run the actual callback
			if (request) {
				request.callback(node, nodeCapabilities);
			}
			log.info("Callback pending match for ", request);
			// remove the pending request, since we are processing it
			callback();
		}, true);
	}, function(err) {
		exports.pendingRequests = [];
		log.info("Done processing pending requests");
	});
};

exports.sendDeleteRequest = function(sessionID, type, nodeHost, nodePort, cb, retries) {
	var path, method;

	log.info("Sending Delete request");
	if (type === 'RC') {
		path = '/selenium-server/driver?cmd=testComplete&sessionId=' + sessionID;
		method = 'POST';
	} else {
		path = "/wd/hub/session/" + sessionID;
		method = 'DELETE';
	}

	var options = {
	  host: nodeHost,
	  port: nodePort,
	  path: path,
	  method: method
	};
	var req = http.request(options, function(res) {
	    res.on('data', function(chunk) {
	     
	    });
	    
		log.info("Delete request done, node response: " + res.statusCode);
		cb();
	});

	req.on('error', function(e) {
	  log.warn("error sending delete request", e);
	  // try sending it again
	  if (retries < 3) {
	  	log.warn("trying to send delete request again");
	  	setTimeout(function() {
	  		retries += 1;
	  		exports.sendDeleteRequest(sessionID, type, nodeHost, nodePort, cb, retries);
	  	}, 2000);
	  } else {
	  	// couldn't clean up, still run the callback to cleanup server side
	  	log.warn("failed to send delete requests, cleaning up server side");
	  	cb();
	  }
	});

	req.end();
};

exports.getHubConfiguration = function(cb) {
	if (_hubConfiguration !== null) {
		return cb(_hubConfiguration);
	}

	fs.readFile('config.json', function(err, data) {
		if (err) {
			log.warn("Unable to read config.json");
			throw err;
		}
		_hubConfiguration = data.toString();
		data.success = true;
		cb(_hubConfiguration);
	});
};

exports.addNode = function(json, cb) {
	var hostParts = json['configuration']['remoteHost'].replace('http://', '').split(':')
	var host = hostParts[0];
	var port = hostParts[1];

	store.existsNode(host, port, function(exists) {
		if (exists === true)
		{
			return cb(true);
		}

		var capabilities = [];

		// make sure this proxy is not blocked
		if (json.capabilities) {
			for (var i = 0, len = json.capabilities.length; i < len; i++) {
				capabilities.push(new models.Capability(json.capabilities[i]));
			}

			var node = new models.Node(host, port, capabilities, json);

			store.addNode(host, port, node, function() {
				store.addAvailableNode(node, function() {
					cb(true);

					exports.processPendingRequest();
				});
			});
		} else {
			log.warn("Trying to add a node without any available capabilities");
			cb(false);
		}
	});
};

exports.removeNode = function(host, port, cb) {
	// when removing a node, make sure no activesessions are left with this node
	async.waterfall(
	[
		function(callback) {
			log.info("Removing node " + (host + "_" + port));
			store.removeSessionsForNode(host, port, callback);
		},
		function(success, callback) {
			store.removeNode(host, port, callback);
		}
	], function(err, result) {
			log.info("Node removed successfully");
			cb(true);
	});
};

var _sessionCheck = function(sessionID) {
	exports.timeouts[sessionID] = setInterval(function() {
		var that = this;

		store.getSession(sessionID, function(session) {
			if (!session) {
				log.info("Can not find session " + sessionID);
				clearInterval(that);
				delete exports.timeouts[sessionID];
				return;
			}

			var now = (new Date()).getTime();
			var diff = (now - session.lastUsed);

			var timeRunning = (now - session.startTime);

			var idleTimeout = exports.TEST_TIMEOUT;
			var maxDuration = exports.MAX_DURATION;


			if (session.desiredCapabilities.idletimeout) {
				idleTimeout = parseInt(session.desiredCapabilities.idletimeout, 10) * 1000;
			}

			// the hub should give the node the chance to do a timeout
			idleTimeout += 15000;

			var node = store.getNode(session.nodeHost, session.nodePort);

			if (session.desiredCapabilities.maxduration) {
				maxDuration = parseInt(session.desiredCapabilities.maxduration, 10) * 1000;
			}

			if (diff > 5000) {
				log.info("checking for timeouts during test: " + (node.host + ":" + node.port) + " (" + sessionID + ")\n" + diff + " vs " + idleTimeout);
			}

			if ((timeRunning > maxDuration) || (diff > maxDuration)) {
				log.info("Test has exceeded max duration of " + maxDuration);
				clearInterval(that);
				delete exports.timeouts[session.sessionID];
				exports.sendDeleteRequest(sessionID, session.type, session.nodeHost, session.nodePort, function() {}, 0);
				if (session.response) {
					var response = new models.Response(500, '[' + sessionID + '] Test has timed out after ' + secs + " seconds");
					session.response.writeHead(response.statusCode, response.headers);
					session.response.end(response.body);
				}
				// remove the session from the registry
				exports.removeSession(sessionID, function() { log.debug("Session removed"); });
			} else if (diff > idleTimeout) {
				log.info("Timeout occurred: " + diff + " , " + (node.host + "_" + node.port));
				var secs = Math.round(((new Date()).getTime() - session.lastUsed) / 1000);
				clearInterval(that);
				delete exports.timeouts[session.sessionID];

				// when a test times out, it's important to clear resources on the node.
				// send a delete/testComplete command to the node
				log.info("Charge for timeout " + sessionID);
				exports.sendDeleteRequest(sessionID, session.type, session.nodeHost, session.nodePort, function() {}, 0);
				if (session.response) {
					var response = new models.Response(500, '[' + sessionID + '] Test has timed out after ' + secs + " seconds");
					session.response.writeHead(response.statusCode, response.headers);
					session.response.end(response.body);
				}
				// last used in future, don't immediately use this node
				store.updateNode(node, function() {
					// remove the session from the registry
					exports.removeSession(sessionID, function() { log.debug("Session removed"); });
				});
			}
		});

	}, 5000);
};

exports.addSession = function(sessionID, session, desiredCapabilities, cb) {
	store.addSession(sessionID, session, function() {
		cb();
		_sessionCheck(sessionID);
	});
};

exports.removeSession = function(sessionID, cb) {
	log.info("Remove session: " + sessionID);

	store.getSession(sessionID, function(session) {
		if (session === undefined) {
			log.warn("Trying to remove a session that is not active: " + sessionID);
			cb();
		} else {
			if (exports.timeouts[sessionID] !== null) {
				clearInterval(exports.timeouts[sessionID]);
				delete exports.timeouts[sessionID];
			}

			// node is available again
			store.removeSession(sessionID, function() {
				var node = store.getNode(session.nodeHost, session.nodePort);

				store.addAvailableNode(node, function() {
					log.info("Session " + sessionID + " has been removed");
					// when stopping a test, immediately execute callback
					cb();

					// and have the node check for pending requests
					exports.processPendingRequest();
				});
			});
		}
	});
};

exports.getSessionById = function(sessionID, cb) {
	store.getSession(sessionID, cb);
};

exports.addPendingRequest = function(desiredCapabilities, cb) {
	var uniqueID = Math.round(Math.random() * 100000000);
	exports.pendingRequests.push({ 'desiredCapabilities' : desiredCapabilities, 'callback' : cb, 'uniqueID' : uniqueID, 'since' : (new Date()).getTime() });
};