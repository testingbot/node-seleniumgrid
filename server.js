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

var http = require('http');

var url = require('url');
var net = require('net');
var repl = require("repl");

// servlets
var registerServlet = require('./lib/registerservlet');
var statusServlet = require('./lib/statusservlet');
var requestHandler = require('./lib/requesthandler');
var hubStatusServlet = require('./lib/hubstatusservlet');
var unregisterServlet = require('./lib/unregisterservlet');
var welcomeServlet = require('./lib/welcomeservlet');

registry = require('./lib/registry');
var models = require('./lib/models');
var parser = require('./lib/parser');
var log = require('./lib/log');
store = require('./lib/store');
var domain = require('domain');

var servletRoutes = {
	"/selenium-server/driver" : rcRequestHandler,
	"/grid/api/proxy" : statusServlet,
	"/grid/register" : registerServlet,
	"/grid/unregister" : unregisterServlet,
	"/grid/api/hub" : hubStatusServlet,
	"/wd/hub/session" : webdriverRequestHandler
};

var parseIncoming = function(req, res, cb) {
	req.setEncoding('utf8');
	var srvUrl = url.parse(req.url.toString(), true);
	var servlet, route, common;

	if (servletRoutes[srvUrl.pathname]) {
		servlet = servletRoutes[srvUrl.pathname];
		return servlet.handleRequest(req, cb, res);
	} else if (common = servletRoutes[srvUrl.pathname.substring(0, 15)]) {
		// webdriver and grid/register have the same 15 char base path
		// this should be faster than the stuff below
		return common.handleRequest(req, cb, res);
	} else {
		// slower lookup of routes
		for (route in servletRoutes) {
			if (route === srvUrl.pathname.substring(0, route.length)) {
				servlet = servletRoutes[route];
				return servlet.handleRequest(req, cb, res);
			}
		}
	}

	if (srvUrl.pathname === '/') {
		return welcomeServlet.handleRequest(req, cb, res);
	} else if (srvUrl.pathname === '/robots.txt') {
		return welcomeServlet.robots(req, cb, res);
	} else if (srvUrl.pathname === '/wd/hub/status') {
		return welcomeServlet.status(req, cb, res);
	}
	
	return cb("Invalid endpoint: " + req.url.toString(), new models.Response(400, "ERROR Unable to handle request - Invalid endpoint or request. (" + req.url.toString() + ")", {'Content-Type': 'text/plain'}));
};

function main(args) {
	store.setConfig(args);
	
	var serverDomain = domain.create();
	var server;

	serverDomain.on('error', function(e) {
	    log.warn(e);
	    log.warn(e.stack);
	});

	serverDomain.run(function() {
		server = http.createServer(function(req, res) {
		  var url = req.url.toString();
		  
		  req.on("close", function(err) {
		  	log.warn("!error: on close");
		  });

		  res.on("close", function() {
		  	log.warn("!error: response socket closed before we could send");
		  });

		  var reqd = domain.create();
		  reqd.add(req);
		  reqd.add(res);

		  res.socket.setTimeout(6 * 60 * 1000);
		  res.socket.removeAllListeners('timeout');
		  req.on('error', function(e) {
		  	log.warn(e);
		  });

		  reqd.on('error', function(er) {
		      log.warn(er);
		      log.warn(er.stack);
		      log.warn(req.url);
		      try {
		        res.writeHead(500);
		        res.end('Error - Something went wrong: ' + er.message);
		      } catch (er) {
		        log.warn('Error sending 500');
		        log.warn(er);
		      }
		    });

		  res.on('error', function(e) { log.warn(e); });
		  
		  res.socket.once('timeout', function() {
		  	try {
			    res.writeHead(500, {'Content-Type': 'text/plain'});
		    	res.end('Error - Socket timed out after 6 minutes');
		    } catch (e) {

		    }
		    try {
		    	res.socket.destroy();
			} catch (e) {

			}
		  });

		  parseIncoming(req, res, function(response) {
			  res.writeHead(response.statusCode, response.headers);
			  res.end(response.body);
		  });

		}).listen(4444, '0.0.0.0');
	});
	server.httpAllowHalfOpen = true;

	var manager = net.createServer(function(socket) {
	repl.start({
	    prompt: "node via TCP socket> ",
	    input: socket,
	    output: socket,
	    useGlobal: true
	  }).on('exit', function() {
	    socket.end();
	  });
	}).listen(4446, '127.0.0.1');

	server.on('clientError', function(exception, socket) {
	    try {
	    	if (socket.parser.incoming.url === "/grid/register") {
	    		return;
	    	}
	    } catch (e) {}
	    if (exception.message.indexOf('ECONNRESET') > -1) {
	    	log.debug(exception);
	    	return;
	    }
	    
	    log.warn('!error: client error');
	    log.warn(exception);
	    log.warn(exception.stack);
	    log.warn(socket);
	});

	process.on('SIGTERM', function() {
		if (registry.pendingRequests.length > 0) {
			log.warn("Can't stop hub just yet, pending requests!");
			// try now
			registry.processPendingRequest();

			return;
		}

		log.info("Stopping hub");
		server.close();
	});

	process.on('uncaughtException', function(err) {
		log.warn("! Uncaught Exception occurred");
		log.warn(err);
		log.warn(err.stack);
	});

	server.on('close', function () {
		store.quit();
		process.exit();
	});

	log.info("Server booting up... Listening on " + (parseInt(process.argv[2], 10) || 4444));
}

if (require.main === module) {
	var args = parser.parseArgs();
	main(args);
}

module.exports.run = main;