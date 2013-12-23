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

var colors = require('colors');
var logger = require('tracer').colorConsole({
	level: "info",
	format : "{{timestamp}} {{file}}:{{line}} {{title}}: {{message}}",
                    dateformat : "HH:MM:ss.L",
    filters : [
               //the last item can be custom filter. here is "warn" and "error" filter
               {
                   warn : colors.red,
                   debug: colors.blue,
                   error : [colors.red, colors.bold ]
               }
    ]
});

var logFile = fs.createWriteStream('./file_' + process.pid + '.log', {
    "flags": "a"
});

var fileLogger = require('tracer').console({
	 transport : function(data) {
          try {
            logFile.write(data.output+"\n");
          } catch (e) {
            console.log("Error logging");
            console.log(e.message);
            console.trace("error logging");
          }
    }
});


exports.info = function(e) { logger.info(e); fileLogger.info(e); };
exports.debug = function(e) { logger.debug(e); fileLogger.debug(e); };
exports.warn = function(e) { logger.warn(e); fileLogger.warn(e); };