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

var registry = require('./registry');
var models = require('./models');
var log = require('./log');


exports.handleRequest = function(request, cb) {
	var body = '';
    request.addListener('data', function(chunk) { body += chunk; });
    request.addListener('error', function(e) { log.warn(e); });
    request.addListener('end', function() {
        try {
            var json = JSON.parse(body);
            registry.addNode(json, function(status) {
                if (status === true) {
                    log.info("Register new node: " + body);
                    cb(new models.Response(200, "OK - Welcome"));
                } else {
                    cb(new models.Response(400, "Invalid parameters"));
                }
            });
        } catch (e) {
            log.warn("Error registering node");
            log.warn(e);
            cb(new models.Response(400, "Invalid parameters"));
        }
    });
};