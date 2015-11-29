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

var models = require('./models');
var store = require('./store');
var url = require('url');

exports.handleRequest = function(req, cb) {
	var srvUrl = url.parse(req.url.toString(), true);
	
	if (!srvUrl.query['id']) {
		return cb("Invalid request", new models.Response(404, JSON.stringify({ 'success': false, msg: "Invalid request" })));
	}

	var host, port;
    var parts = srvUrl.query['id'].replace('http://', '').split(':');
    port = parts[1];
    host = parts[0];

	store.getNode(host, 5556, function(err, node) {
		if (!node) {
			var err = 'Cannot find proxy with ID=http://' + host + ':' + port + ' in the registry.';
			// needs to be a 200 statuscode for Selenium
			cb(null, new models.Response(200, JSON.stringify({ 'success': false, msg: err })));
		} else {
			node.lastSeen = (new Date()).getTime();
			store.updateNode(node, function() {
				cb(null, new models.Response(200, JSON.stringify({ 'success': true, msg: "Proxy found!" })));
			});
		}
	});
};