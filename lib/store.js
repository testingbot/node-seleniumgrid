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

var log = require('./log');
var registry = require('./registry');
var EventEmitter = require( "events" ).EventEmitter;
exports.events = new EventEmitter();
var async = require('async');
var models = require('./models');
exports.nodes = {};
exports.availableNodes = [];
exports.activeSessions = {};
exports.blockedNodes = {};
var loggedRequests = [];


exports.quit = function() {
	
};

exports.flushdb = function(cb) {
	exports.nodes = {};
	exports.activeSessions = {};
	exports.blockedNodes = {};

	if (cb) {
		cb();
	}
};

exports.getRequests = function() {
	return loggedRequests;
};

exports.purgeRequests = function() {
	loggedRequests = [];
};

exports.addSession = function(sessionID, session, cb) {
	exports.activeSessions[sessionID] = session;
	cb();
};

exports.getSession = function(sessionID, cb) {
	var session = exports.activeSessions[sessionID];
	return cb(session);
};

exports.getAllSessions = function(cb) {
	var sessions = [];
	var included = [];
	for (var key in exports.activeSessions) {
		included[exports.activeSessions[key].sessionID] = true;
		sessions.push(exports.activeSessions[key]);
	}

	cb(sessions);
};

exports.gc = function() {
	var now = (new Date()).getTime();
	for (var key in exports.blockedNodes) {
		var time = exports.blockedNodes[key];
		if ((now - time) > 180 * 60 * 1000) {
			delete exports.blockedNodes[key];
		}
	}
};

exports.removeSession = function(sessionID, cb) {
	var session = exports.activeSessions[sessionID];
	delete exports.activeSessions[sessionID];
	cb();
};

exports.removeAllSessions = function(cb) {
	exports.activeSessions = {};
	cb();
};

exports.removeSessionsForNode = function(host, port, cb) {
	var sessionIDs = [];
	var node = exports.nodes[host + "_" + port];
	if (node) {
		for (var key in exports.activeSessions) {
			var session = exports.activeSessions[key];
			if (session && !exports.getNode(session.nodeHost, session.nodePort)) {
				log.warn("This session does not contain a node?!");
				log.warn(session);
				sessionIDs.push(session.sessionID);
				continue;
			}

			if (session && (session.nodeHost === host)) {
				sessionIDs.push(session.sessionID);
			}
		}
	}

	var emptyCb = function() {};

	for (var i = 0; i < sessionIDs.length; i++) {
		log.info("removeSessionsForNode " + host + " , " + sessionIDs[i]);
		registry.removeSession(sessionIDs[i], emptyCb);
	}

	cb(null, true);
};

exports.updateSession = function(session, cb) {
	exports.activeSessions[session.sessionID] = session;
	cb();
};

exports.removeNode = function(host, port, cb) {
	var key = host + "_" + port;
	for (var i = 0; i < exports.availableNodes.length; i++) {
		if ((exports.availableNodes[i].host === host) && (exports.availableNodes[i].port === port)) {
			exports.availableNodes.splice(i, 1);
		}
	}
	delete exports.nodes[key];
	cb(null, true);
	log.info("Remove node: " + key);
};

exports.addNode = function(host, port, node, cb) {
	var key = host + "_" + port;
	exports.nodes[key] = node;
	cb();
};

exports.getNode = function(host, port) {
	var key = host + "_" + port;
	return exports.nodes[key];
};

exports.updateNode = function(node, cb) {
	var key = node.host + "_" + node.port;
	exports.nodes[key] = node;
	cb();
};

exports.getAllNodes = function() {
	return exports.nodes;
};

exports.getAvailableNodes = function(cb) {
	var nodes = [];

	for (var k in exports.availableNodes) {
		var key = exports.availableNodes[k];
		var node = exports.getNode(key.host, key.port);
		
		if (node && (node.available === true)) {
			nodes.push(node);
		}
	}

	cb(nodes);
};

exports.removeAvailableNode = function(host, port, cb) {
	var node = exports.nodes[host + "_" + port];
	if (node) {
		node.available = false;
	} else {
		log.warn("Could not remove available node " + host);
		log.info(exports.nodes);
	}

	for (var i = 0; i < exports.availableNodes.length; i++) {
		if ((exports.availableNodes[i].host === host) && (exports.availableNodes[i].port === port)) {
			exports.availableNodes.splice(i, 1);
		}
	}

	exports.updateNode(node, cb);
	log.info("Remove available node: " + host + ":" + port);
};

exports.blockNode = function(host, port, duration, cb) {
	var key = host + "_" + port;
	exports.blockedNodes[key] = (new Date()).getTime() + duration;
	cb();
};

exports.purgeBlockedNodes = function(cb) {
	exports.blockedNodes = {};
	cb();
};

exports.getIsBlocked = function(host, port, cb) {
	var key = host + "_" + port;
	var blocked = exports.blockedNodes[key];
	if (blocked) {
		if ((new Date()).getTime() > blocked) {
			delete exports.blockedNodes[key];
			log.info("Expering block, allow again");
			return cb(false);
		}
	}

	cb(blocked !== undefined);
};

exports.removeAllAvailableNodes = function(cb) {
	exports.availableNodes = [];
	cb();
};

exports.addAvailableNode = function(node, cb) {
	node.available = true;
	exports.availableNodes.push({ host: node.host, port: node.port });
	exports.updateNode(node, cb);
};

exports.existsNode = function(host, port, cb) {
	var key = host + "_" + port;
	var exists = (exports.nodes[key] !== undefined);
	return cb(exists);
};