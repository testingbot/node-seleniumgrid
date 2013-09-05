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

var registry = require('./registry.js');
var models = require('./models.js');
var url = require('url');
var log = require('./log');

exports.handleRequest = function(request, cb) {
	var srvUrl = url.parse(request.url.toString(), true);
	var host, port;
	if (!srvUrl.query.id) {
		return cb(new models.Response(400, "Invalid parameters"));
	}

	var parts = srvUrl.query.id.replace('http://', '').split(':');
	port = parts[1];
	host = parts[0];

	log.info("Unregister servlet " + host);
	registry.removeNode(host, port, function(status) {
		if (status === true) {
			cb(new models.Response(200, "OK - Bye"));
		} else {
			cb(new models.Response(400, "Invalid parameters"));
		}
	});
};