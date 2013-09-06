var server = require('../server');
var registry = require('../registry');

var http = require('http');
var should = require('should');
var request = require('supertest');
var assert = require('assert');
var models = require('../models');
var store = require('../store');

var testData = require('./testdata');
var nodeServerMock;
var nodes = [];
var counter = 0;
describe('ForwarderServlet', function() {

	describe("requesting a capability not currently on the grid", function() {
		beforeEach(function(d) {
			store.flushdb(d);
		});
		
		afterEach(function(d) {
			this.timeout(30000);
			request(server)
				.get('/grid/unregister?id=http://127.0.0.1:5558')
				.end(function(err, res) {
					res.statusCode.should.equal(200);
					res.text.should.equal("OK - Bye");
					nodeServerMock.close();
					d();
				});
		});

		it("should put a request with a capability we currently do not have in a pending state, once a node is available, the request should use the node", function(done) {
			this.timeout(30000);
			var sessionID = testData.getSessionID();
			request(server)
				.get('/selenium-server/driver?cmd=getNewBrowserSession&1=firefox&client_key=' + testData.CLIENT_KEY + "&client_secret=" + testData.CLIENT_SECRET)
				.end(function(err, res) {
					// this should be triggered after the settimeout below.
					// we simulate a request, and a new node coming online after the request
					res.statusCode.should.equal(200);
					res.text.should.equal("OK," + sessionID);
					done();
				});
			setTimeout(function() {
				nodeServerMock = http.createServer(function(req, res) {
				  var url = req.url.toString();
				  if (url.indexOf('getNewBrowserSession') > -1) {
				  	res.writeHead(200, {'Content-Type': 'text/plain'});
		  			res.end("OK," + sessionID);
				  }
				}).listen(5558, '127.0.0.1');

				var postData = '{"class":"org.openqa.grid.common.RegistrationRequest","capabilities":[{"platform":"WINDOWS","seleniumProtocol":"Selenium","browserName":"firefox","maxInstances":1,"version":"9","alias":"FF9"}],"configuration":{"port":5558,"nodeConfig":"config.json","host":"127.0.0.1","cleanUpCycle":10000,"browserTimeout":20000,"hubHost":"10.0.1.6","registerCycle":5000,"debug":"","hub":"http://10.0.1.6:4444/grid/register","log":"test.log","url":"http://127.0.0.1:5558","remoteHost":"http://127.0.0.1:5558","register":true,"proxy":"org.openqa.grid.selenium.proxy.DefaultRemoteProxy","maxSession":1,"role":"node","hubPort":4444}}';

				request(server)
					.post('/grid/register')
					.send(postData)
					.end(function(err, res) {
						res.statusCode.should.equal(200);
						res.text.should.equal("OK - Welcome");
					});
			}, 5000);
		});
	});

	describe("make sure available nodes are correctly registered", function() {
		beforeEach(function(d) {
			nodes = [];
			for (var i = 0; i < 10; i++) {
				(function(i) {
					var node = http.createServer(function(req, res) {
					  var url = req.url.toString();
					  if (url.indexOf('getNewBrowserSession') > -1) {
					  	res.writeHead(200, {'Content-Type': 'text/plain'});
			  			res.end("OK," + testData.getSessionID());
					  } else if (url.indexOf('testComplete') > -1) {
					  	res.writeHead(200, {'Content-Type': 'text/plain'});
			  			res.end("OK");
					  }
					}).listen((5656 + i), '127.0.0.1');

					var port = (5656 + i);
					var postData = '{"class":"org.openqa.grid.common.RegistrationRequest","capabilities":[{"platform":"WINDOWS","seleniumProtocol":"Selenium","browserName":"firefox","maxInstances":1,"version":"9","alias":"FF9"}],"configuration":{"port":' + port + ',"nodeConfig":"config.json","host":"127.0.0.1","cleanUpCycle":10000,"browserTimeout":20000,"hubHost":"10.0.1.6","registerCycle":5000,"debug":"","hub":"http://10.0.1.6:4444/grid/register","log":"test.log","url":"http://127.0.0.1:' + port + '","remoteHost":"http://127.0.0.1:' + port + '","register":true,"proxy":"org.openqa.grid.selenium.proxy.DefaultRemoteProxy","maxSession":1,"role":"node","hubPort":4444}}';

					request(server)
						.post('/grid/register')
						.send(postData)
						.end(function(err, res) {
							res.statusCode.should.equal(200);
							res.text.should.equal("OK - Welcome");
							nodes.push(node);
							if (nodes.length == 10) {
								d();
							}
						});
				})(i);
			}
		});

		afterEach(function(d) {
			this.timeout(30000);
			var processed = 0;
			for (var j = 0; j < nodes.length; j++) {
				(function(j) {
					request(server)
						.get('/grid/unregister?id=http://127.0.0.1:' + (5656 + j))
						.end(function(err, res) {
							res.statusCode.should.equal(200);
							res.text.should.equal("OK - Bye");
							nodes[j].close();
							processed += 1;
							if (processed >= nodes.length) {
								d();
							}
						});
				})(j);
			}
		});

		it('should correctly indicate nodes as available or unavailable', function(done) {
			this.timeout(10000);
			var processed = 0;
				for (var i = 0; i < nodes.length; i++) {
				(function(i) {
					store.getAvailableNodes(function(nodes) {
						var nodeLength = nodes.length;
						request(server)
							.get('/selenium-server/driver?cmd=getNewBrowserSession&1=firefox&client_key=' + testData.CLIENT_KEY + "&client_secret=" + testData.CLIENT_SECRET)
							.end(function(err, res) {
								var sessionID = res.text.replace("OK,", "");
								store.getAvailableNodes(function(nodes) {
									assert.ok(nodes.length < nodeLength);

								});
								// stop session, the next one should start
								request(server)
								.get('/selenium-server/driver?cmd=testComplete&sessionId=' + sessionID)
								.end(function(err, res) {
									processed += 1;
									if (processed >= 10) {
										return done();
									}
								});
							});
					});
				})(i)
			}
			
		});
	});

	describe("start two tests in parallel with only one node to handle the requests", function() {
		beforeEach(function(d) {
			store.flushdb();
			// mimick an RC node
			nodeServerMock = http.createServer(function(req, res) {
			  var url = req.url.toString();
			  if (url.indexOf('getNewBrowserSession') > -1) {
			  	res.writeHead(200, {'Content-Type': 'text/plain'});
			  	var sid = testData.getSessionID();
	  			res.end("OK," + sid);
			  } else if (url.indexOf('testComplete') > -1) {
			  	res.writeHead(200, {'Content-Type': 'text/plain'});
	  			res.end("OK");
			  }
			}).listen(5560, '127.0.0.1');

			var postData = '{"class":"org.openqa.grid.common.RegistrationRequest","capabilities":[{"platform":"WINDOWS","seleniumProtocol":"Selenium","browserName":"firefox","maxInstances":1,"version":"9","alias":"FF9"}],"configuration":{"port":5560,"nodeConfig":"config.json","host":"127.0.0.1","cleanUpCycle":10000,"browserTimeout":20000,"hubHost":"10.0.1.6","registerCycle":5000,"debug":"","hub":"http://10.0.1.6:4444/grid/register","log":"test.log","url":"http://127.0.0.1:5560","remoteHost":"http://127.0.0.1:5560","register":true,"proxy":"org.openqa.grid.selenium.proxy.DefaultRemoteProxy","maxSession":1,"role":"node","hubPort":4444}}';

			request(server)
				.post('/grid/register')
				.send(postData)
				.end(function(err, res) {
					res.statusCode.should.equal(200);
					res.text.should.equal("OK - Welcome");
					d();
				});
		});

		afterEach(function(d) {
			this.timeout(30000);
			request(server)
				.get('/grid/unregister?id=http://127.0.0.1:5560')
				.end(function(err, res) {
					res.statusCode.should.equal(200);
					res.text.should.equal("OK - Bye");
					nodeServerMock.close();
					d();
				});
		});

		it("should handle both requests successfully, one after the other. the second request will be pending until the first one is processed", function(done) {
			// launch two requests at the same time
			this.timeout(30000);
			setTimeout(function() {
				request(server)
					.get('/selenium-server/driver?cmd=getNewBrowserSession&1=firefox&client_key=' + testData.CLIENT_KEY + "&client_secret=" + testData.CLIENT_SECRET)
					.end(function(err, res) {
						var sid = res.text.replace("OK,", "");
						// stop session, the next one should start
						request(server)
						.get('/selenium-server/driver?cmd=testComplete&sessionId=' + sid)
						.end(function(err, res) { });
					});
			}, 1);

			setTimeout(function() {
				request(server)
					.get('/selenium-server/driver?cmd=getNewBrowserSession&1=firefox&client_key=' + testData.CLIENT_KEY + "&client_secret=" + testData.CLIENT_SECRET)
					.end(function(err, res) {
						done();
					});
			}, 4);
		});
	});

	describe('it should retry forwarding to the node when at some point a forward fails due to a connection failure', function() {

		beforeEach(function(d) {
			store.flushdb();
			// mimick an RC node
			nodeServerMock = http.createServer(function(req, res) {
			  var url = req.url.toString();
			  if (url.indexOf('getNewBrowserSession') > -1) {
			  	res.writeHead(200, {'Content-Type': 'text/plain'});
			  	var sid = testData.getSessionID();
	  			res.end("OK," + sid);
			  } else if (url.indexOf('testComplete') > -1) {
			  	res.writeHead(200, {'Content-Type': 'text/plain'});
	  			res.end("OK");
			  }
			}).listen(5561, '127.0.0.1');

			var postData = '{"class":"org.openqa.grid.common.RegistrationRequest","capabilities":[{"platform":"WINDOWS","seleniumProtocol":"Selenium","browserName":"firefox","maxInstances":1,"version":"9","alias":"FF9"}],"configuration":{"port":5561,"nodeConfig":"config.json","host":"127.0.0.1","cleanUpCycle":10000,"browserTimeout":20000,"hubHost":"10.0.1.6","registerCycle":5000,"debug":"","hub":"http://10.0.1.6:4444/grid/register","log":"test.log","url":"http://127.0.0.1:5561","remoteHost":"http://127.0.0.1:5561","register":true,"proxy":"org.openqa.grid.selenium.proxy.DefaultRemoteProxy","maxSession":1,"role":"node","hubPort":4444}}';

			request(server)
				.post('/grid/register')
				.send(postData)
				.end(function(err, res) {
					res.statusCode.should.equal(200);
					res.text.should.equal("OK - Welcome");
					d();
				});
		});

		afterEach(function(d) {
			this.timeout(30000);
			request(server)
				.get('/grid/unregister?id=http://127.0.0.1:5561')
				.end(function(err, res) {
					res.statusCode.should.equal(200);
					res.text.should.equal("OK - Bye");
					try {
						nodeServerMock.close();
					} catch (e) {}
					d();
				});
		});

		it('should end gracefully when a bad connection occurs and the xx retries did not help', function(done) {
			this.timeout(30000);

			request(server)
				.get('/selenium-server/driver?cmd=getNewBrowserSession&1=firefox&client_key=' + testData.CLIENT_KEY + "&client_secret=" + testData.CLIENT_SECRET)
				.end(function(err, res) {
					res.statusCode.should.equal(200);
					var sessionID = res.text.replace("OK,", "");
					// should be in the registry

					registry.getSessionById(sessionID, function(session) {
						session.should.be.an.instanceof(models.Session);

						// the node is suddenly unreachable
						nodeServerMock.close();

						// send a command now
						request(server)
							.get('/selenium-server/driver?cmd=open&1=/&sessionId=' + sessionID)
							.end(function(err, res) {
								res.statusCode.should.equal(500);
								res.text.should.equal("FORWARDING_ERROR: connect ECONNREFUSED");
								done();
							});
					});
				});
		});

		it('should retry a connection, this simulates bad connection between hub and node', function(done) {
			this.timeout(30000);

		  	request(server)
				.get('/selenium-server/driver?cmd=getNewBrowserSession&1=firefox&client_key=' + testData.CLIENT_KEY + "&client_secret=" + testData.CLIENT_SECRET)
				.end(function(err, res) {
					res.statusCode.should.equal(200);
					var sessionID = res.text.replace("OK,", "");
					// should be in the registry

					registry.getSessionById(sessionID, function(session) {
						session.should.be.an.instanceof(models.Session);

						// the node is suddenly unreachable
						nodeServerMock.close();

						// the node will be reachable again in 5 seconds
						setTimeout(function() {
							nodeServerMock = http.createServer(function(req, res) {
							  var url = req.url.toString();
							  if (url.indexOf('getNewBrowserSession') > -1) {
							  	res.writeHead(200, {'Content-Type': 'text/plain'});
					  			res.end("OK," + sessionID);
							  } else if (url.indexOf('cmd=open') > -1) {
							  	res.writeHead(200, {'Content-Type': 'text/plain'});
					  			res.end("OK,CONNECTION");
							  }
							}).listen(5561, '127.0.0.1');

							var postData = '{"class":"org.openqa.grid.common.RegistrationRequest","capabilities":[{"platform":"WINDOWS","seleniumProtocol":"Selenium","browserName":"firefox","maxInstances":1,"version":"9","alias":"FF9"}],"configuration":{"port":5561,"nodeConfig":"config.json","host":"127.0.0.1","cleanUpCycle":10000,"browserTimeout":20000,"hubHost":"10.0.1.6","registerCycle":5000,"debug":"","hub":"http://10.0.1.6:4444/grid/register","log":"test.log","url":"http://127.0.0.1:5561","remoteHost":"http://127.0.0.1:5561","register":true,"proxy":"org.openqa.grid.selenium.proxy.DefaultRemoteProxy","maxSession":1,"role":"node","hubPort":4444}}';

							request(server)
								.post('/grid/register')
								.send(postData)
								.end(function(err, res) {
									res.statusCode.should.equal(200);
									res.text.should.equal("OK - Welcome");
								});
						}, 3000);

						request(server)
							.get('/selenium-server/driver?cmd=open&1=/&sessionId=' + sessionID)
							.end(function(err, res) {
								res.statusCode.should.equal(200);
								res.text.should.equal("OK,CONNECTION");
								done();
							});
					});
			});
		});
	});
});