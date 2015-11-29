/*
Copyright TestingBot

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


var registry = require('./registry');
var log = require('./log');
var store = require('./store');
var async = require('async');
var models = require('./models');

var _matches = function(requestedCapability, nodeCapability) {

	for (var key in requestedCapability) {
		if (!requestedCapability[key]) {
			continue;
		}
		var value = requestedCapability[key].toString().toLowerCase();

		if ((value === 'any') || (value === '') || (value === '*')) {
			continue;
		}

		var lowerKey = key.toLowerCase();

		if ((lowerKey !== 'browsername') && (lowerKey !== 'version') && (lowerKey !== 'platform')) {
			continue;
		}

		if (lowerKey === 'platform') {
			var platformLowerCase = nodeCapability['platform'].toString().toLowerCase();
			if (platformFamily[platformLowerCase] && (requestedCapability['platform'].toString().toLowerCase() === platformFamily[platformLowerCase])) {
				continue;
			}
		}

		if (!nodeCapability[lowerKey] || (nodeCapability[lowerKey].toString().toLowerCase() !== value)) {
			return false;
		}
	}

	return true;
};

exports.findNode = function(desiredCapabilities, cb, blockPending) {
	if (!desiredCapabilities) {
		log.warn("No desired capabilities");
	}

	store.getAvailableNodes(function(sortedNodes) {
		var nodeCaps = null;

		async.detect(sortedNodes, function(node, callback) {
			async.detect(node.capabilities, function(capability, c) {
				c(_matches(desiredCapabilities, capability));
			}, function(result) {
				if (!result) {
					return callback(false);
				}

				nodeCaps = result;
				callback(true);
			});
		}, function(foundNode) {
			if (!foundNode) {
				log.info("No local nodes current available for these desired capabilities, forwarding to TestingBot.com");
				
				
				var config = store.getConfig();
				if (config && config['key'] && config['key'] !== null) {
					desiredCapabilities.client_key = config['key'];
					desiredCapabilities.client_secret = config['secret'];
					var testingbot = new models.Node("hub.testingbot.com", 80, [desiredCapabilities], "");
					return store.addNode(testingbot.host, testingbot.port, testingbot, function() {
						cb(testingbot, desiredCapabilities);
					});
				} else {
					return registry.addPendingRequest(desiredCapabilities, cb);
				}
			}

			return store.updateNode(foundNode, function() {
				cb(foundNode, nodeCaps);
			});
		});
	});
};