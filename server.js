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

var url = require('url');
var net = require('net');
var repl = require("repl");

// servlets
var registerServlet = require('./registerservlet');
var statusServlet = require('./statusservlet');
var requestHandler = require('./requesthandler');
var hubStatusServlet = require('./hubstatusservlet');
var unregisterServlet = require('./unregisterservlet');
var welcomeServlet = require('./welcomeservlet');

registry = require('./registry');
var models = require('./models');
var log = require('./log');
store = require('./store');
var domain = require('domain');

// process.setgid("node");
// process.setuid("node");

var servletRoutes = {
	"/grid/api/proxy" : statusServlet,
	"/grid/register" : registerServlet,
	"/grid/unregister" : unregisterServlet,
	"/selenium-server/driver" : requestHandler,
	"/wd/hub/session" : requestHandler,
	"/grid/api/hub" : hubStatusServlet
};

var parseIncoming = function(req, res, cb) {
	var srvUrl = url.parse(req.url.toString(), true);
	if (servletRoutes[srvUrl.pathname]) {
		var servlet = servletRoutes[srvUrl.pathname];
		return servlet.handleRequest(req, cb, res);
	} else {
		// slower lookup of routes
		var servlet;
		for (var route in servletRoutes) {
			if (route === srvUrl.pathname.substring(0, route.length)) {
				servlet = servletRoutes[route];
				return servlet.handleRequest(req, cb, res);
			}
		}
	}

	if (srvUrl.pathname === '/') {
		return welcomeServlet.handleRequest(req, cb, res);
	}
	
	return cb(new models.Response(400, "Unable to handle request - Invalid endpoint or request."));
};

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


setInterval(function() {
	// garbage collection
	store.gc();
	
}, 30 * 60 * 1000);

process.on('uncaughtException', function(err) {
	log.warn("! Uncaught Exception occurred");
	log.warn(err);
	log.warn(err.stack);
});

server.on('close', function () {
	store.quit();
	process.exit();
});

module.exports = server;

log.info("Server booting up... Listening on " + (parseInt(process.argv[2], 10) || 4444));