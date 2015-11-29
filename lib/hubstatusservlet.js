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
var models = require('./models');
var log = require('./log');

exports.handleRequest = function(request, cb) {
	var body = '';
    request.addListener('data', function(chunk) { body += chunk; });
    request.addListener('error', function(e) { log.warn(e); });
    request.addListener('end', function() {
		registry.getHubConfiguration(function(err, hubConfig) {
			if (err) {
				cb(err, new models.Response(500, JSON.stringify({ 'error': err })));
			} else {
				cb(err, new models.Response(200, hubConfig));
			}
		});
    });
};