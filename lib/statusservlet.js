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

var models = require('./models');
var store = require('./store');

exports.handleRequest = function(req, cb) {
	var srvUrl = url.parse(req.url.toString(), true);
	var host, port, response;
	var parts = srvUrl.query['id'].replace('http://', '').split(':');
	port = parts[1];
	host = parts[0];
	
	var node = store.getNode(host, port);
	if (!node) {
		response = new models.Response(200, '{"msg":"Cannot find proxy with ID=http://' + host + ':' + port + ' in the registry.", "success":false}');
		response.headers = {'Content-type': 'application/json'};
		cb(response);
	} else {
		node.lastSeen = (new Date()).getTime();
		store.updateNode(node, function() {
			response = new models.Response(200, '{"msg":"Proxy found!","success":true}');
			response.headers = {'Content-type': 'application/json'};
			cb(response);
		});
	}
};