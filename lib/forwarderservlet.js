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

var http = require('http');
http.globalAgent.maxSockets = Infinity;
var models = require('./models');
var log = require('./log');
var registry = require('./registry');

exports.forwardRequest = function(request, node, body, cb, retries) {
	if (!retries) {
		retries = 0;
	}

	var responseBody = '';

	request.headers['content-type'] = "application/x-www-form-urlencoded; charset=utf-8";
	var options = {
		method: request.method,
		path: request.url,
		headers: request.headers,
		host: node.host,
		port: node.port
	};

	log.info("Forward to node " + node.host + " : " + options.path + " (" + options.method + ")");
	
	if (body && body.length > 0) {
		log.info(body);
	}

	var proxy_request = http.request(options, function(res) {
		res.setEncoding('utf8');
		res.on('data', function(chunk) {
		   responseBody += chunk;
		});
		res.on('error', function(e) { log.warn(e); });
		res.on('end', function() {
			var response = new models.Response();
			response.statusCode = res.statusCode;
		    response.headers = res.headers;
	    	response.body = responseBody;
	    	log.info("Node " + node.host + ":" + node.port + " responded");
	    	log.info(responseBody);
	        cb(response);
		});
	});

	proxy_request.on('error', function(error) {
		log.warn("Proxy to node (" + node.host + ":" + node.port + ") failure: " + error.message);

		setTimeout(function() {
			retries += 1;
			if (retries < 6) {
				log.warn("retrying request to " + node.host + ":" + node.port);
		 		exports.forwardRequest(request, node, body, cb, retries);
		 	} else {
		 		var response = new models.Response();
		 		response.statusCode = 500;
		 		response.body = 'FORWARDING_ERROR: ' + error.message;
		 		response.error = true;

		 		proxy_request.end();

		 		log.warn("Giving up retrying, error is: " + response.body);

		 		registry.removeNode(node.host, node.port, function() {
					cb(response);
				});
		 	}
		}, 2000);
	});

	proxy_request.write(body, 'binary');
	proxy_request.end();
};