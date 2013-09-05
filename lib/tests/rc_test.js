var server = require('../server');
var registry = require('../registry');

var http = require('http');
var should = require('should');
var request = require('supertest');
var assert = require('assert');
var models = require('../models');
var store = require('../store');
var nodeServerMock;
var testData = require('./testdata');

describe('RC', function() {

	describe('Correctly forward to a node', function() {

		beforeEach(function(d) {
			// mimick an RC node
			nodeServerMock = http.createServer(function(req, res) {
			  var url = req.url.toString();
			  var sessionID = testData.getSessionID();

			  if (url.indexOf('getNewBrowserSession') > -1) {
			  	res.writeHead(200, {'Content-Type': 'text/plain'});
	  			res.end("OK," + sessionID);
			  } else if (url.indexOf('testComplete') > -1) {
			  	res.writeHead(200, {'Content-Type': 'text/plain'});
	  			res.end("OK");
			  }
			}).listen(5570, '127.0.0.1');

			var postData = '{"class":"org.openqa.grid.common.RegistrationRequest","capabilities":[{"platform":"WINDOWS","seleniumProtocol":"Selenium","browserName":"iexplore","maxInstances":1,"version":"9","alias":"FF9"}],"configuration":{"port":5570,"nodeConfig":"config.json","host":"127.0.0.1","cleanUpCycle":10000,"browserTimeout":20000,"hubHost":"10.0.1.6","registerCycle":5000,"debug":"","hub":"http://10.0.1.6:4444/grid/register","log":"test.log","url":"http://127.0.0.1:5570","remoteHost":"http://127.0.0.1:5570","register":true,"proxy":"org.openqa.grid.selenium.proxy.DefaultRemoteProxy","maxSession":1,"role":"node","hubPort":4444}}';

			store.removeAllSessions(function() {
				request(server)
					.post('/grid/register')
					.send(postData)
					.end(function(err, res) {
						res.statusCode.should.equal(200);
						res.text.should.equal("OK - Welcome");
						d();
					});
			});
		});

		afterEach(function(d) {
			this.timeout(30000);
			request(server)
				.get('/grid/unregister?id=http://127.0.0.1:5570')
				.end(function(err, res) {
					res.statusCode.should.equal(200);
					res.text.should.equal("OK - Bye");
					nodeServerMock.close();
					d();
				});
		});

		it('can open a new browser session on a remote RC node', function(done) {
			this.timeout(30000);

			request(server)
			.get('/selenium-server/driver?cmd=getNewBrowserSession&1=iexplore&client_key=' + testData.CLIENT_KEY + "&client_secret=" + testData.CLIENT_SECRET)
			.end(function(err, res) {
				res.statusCode.should.equal(200);
				var sessionID = res.text.replace("OK,", "");
				// should be in the registry

				registry.getSessionById(sessionID, function(session) {
					session.should.be.an.instanceof(models.Session);
					done();
				});
			});
		});

		it('should clean up registry when sending the complete command', function(done) {
			this.timeout(30000);
			request(server)
				.get('/selenium-server/driver?cmd=getNewBrowserSession&1=iexplore&client_key=' + testData.CLIENT_KEY + "&client_secret=" + testData.CLIENT_SECRET)
				.end(function(err, res) {
					res.statusCode.should.equal(200);
					var sessionID = res.text.replace("OK,", "");
					// should be in the registry
					registry.getSessionById(sessionID, function(session) {
						session.should.be.an.instanceof(models.Session);
						// send a stop command now
						request(server)
							.get('/selenium-server/driver?cmd=testComplete&sessionId=' + sessionID)
							.end(function(err, res) {
								res.statusCode.should.equal(200);
								registry.getSessionById(sessionID, function(session) {
									assert.equal(session, undefined);
									done();
								});
							});
					});
				});
		});

		it('should fail when specifying an unknown sessionId', function(done) {
			this.timeout(30000);
			// send a stop command with invalid sessionId
			request(server)
				.get('/selenium-server/driver?cmd=open&sessionId=4354353453&client_key=' + testData.CLIENT_KEY + "&client_secret=" + testData.CLIENT_SECRET)
				.end(function(err, res) {
					res.statusCode.should.equal(404);
					res.text.should.equal("Unknown sessionId: 4354353453");
					registry.getSessionById("4354353453", function(session) {
						assert.equal(session, undefined);
						done();
					});
				});
		});

		it('should be possible to end a test twice (double teardown bug)', function(done) {
			request(server)
				.get('/selenium-server/driver?cmd=getNewBrowserSession&1=iexplore&client_key=' + testData.CLIENT_KEY + "&client_secret=" + testData.CLIENT_SECRET)
				.end(function(err, res) {
					res.statusCode.should.equal(200);
					var sessionID = res.text.replace("OK,", "");
					// should be in the registry
					registry.getSessionById(sessionID, function(session) {
						session.should.be.an.instanceof(models.Session);
					
						// send a stop command now
						request(server)
							.get('/selenium-server/driver?cmd=testComplete&sessionId=' + sessionID)
							.end(function(err, res) {
								res.statusCode.should.equal(200);
								registry.getSessionById(sessionID, function(session) {
									assert.equal(session, undefined);
									request(server)
										.get('/selenium-server/driver?cmd=testComplete&sessionId=' + sessionID)
										.end(function(err, res) {
											res.statusCode.should.equal(404);
											registry.getSessionById(sessionID, function(session) {
												assert.equal(session, undefined);
												done();
											});
										});
								});
							});
					});
				});
		});
	});

	describe('handle timeouts during test', function() {
		beforeEach(function(d) {
			// mimick an RC node

			registry.TEST_TIMEOUT = 6000;
			registry.NODE_TIMEOUT = 40000;

			nodeServerMock = http.createServer(function(req, res) {
			  var url = req.url.toString();
			  if (url.indexOf('getNewBrowserSession') > -1) {
			  	res.writeHead(200, {'Content-Type': 'text/plain'});
	  			res.end("OK," + testData.getSessionID());
			  } else if (url.indexOf('testComplete') > -1) {
			  	res.writeHead(200, {'Content-Type': 'text/plain'});
	  			res.end("OK");
			  }
			}).listen(5571, '127.0.0.1');

			var postData = '{"class":"org.openqa.grid.common.RegistrationRequest","capabilities":[{"platform":"WINDOWS","seleniumProtocol":"Selenium","browserName":"iexplore","maxInstances":1,"version":"9","alias":"FF9"}],"configuration":{"port":5571,"nodeConfig":"config.json","host":"127.0.0.1","cleanUpCycle":10000,"browserTimeout":20000,"hubHost":"10.0.1.6","registerCycle":5000,"debug":"","hub":"http://10.0.1.6:4444/grid/register","log":"test.log","url":"http://127.0.0.1:5571","remoteHost":"http://127.0.0.1:5571","register":true,"proxy":"org.openqa.grid.selenium.proxy.DefaultRemoteProxy","maxSession":1,"role":"node","hubPort":4444}}';

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
			registry.TEST_TIMEOUT = 90000;
			this.timeout(30000);
			request(server)
				.get('/grid/unregister?id=http://127.0.0.1:5571')
				.end(function(err, res) {
					res.statusCode.should.equal(200);
					res.text.should.equal("OK - Bye");
					nodeServerMock.close();
					d();
				});
		});

		it("should not timeout when a test is behaving", function(done) {
			this.timeout(30000);
			request(server)
				.get('/selenium-server/driver?cmd=getNewBrowserSession&1=iexplore&client_key=' + testData.CLIENT_KEY + "&client_secret=" + testData.CLIENT_SECRET)
				.end(function(err, res) {
					res.statusCode.should.equal(200);
					var sessionID = res.text.replace("OK,", "");
					// should be in the registry
					registry.getSessionById(sessionID, function(session) {
						session.should.be.an.instanceof(models.Session);

						var node = store.getNode(session.nodeHost, session.nodePort);
						assert.equal(node.available, false);
						// now wait for the next command
						setTimeout(function() {
							request(server)
							.get('/selenium-server/driver?cmd=testComplete&sessionId=' + sessionID)
							.end(function(err, res) {
								res.statusCode.should.equal(200);
								registry.getSessionById(sessionID, function(session) {
									assert.equal(session, undefined);
									done();
								});
							});
						}, 3000);	
					});
				});
		});
	});

	describe("extracting parameters", function() {
		it("should correctly extract desired capabilities from a GET request", function(done) {
			nodeServerMock = http.createServer(function(req, res) {
			  var url = req.url.toString();
			  if (url.indexOf('getNewBrowserSession') > -1) {
			  	// this node should receive the command
			  	assert.ok(true);

			  	request(server)
					.get('/grid/unregister?id=http://127.0.0.1:5572')
					.end(function(err, res) {
						res.statusCode.should.equal(200);
						res.text.should.equal("OK - Bye");
						nodeServerMock.close();
			  			done();
					});
			  }
			}).listen(5572, '127.0.0.1');

			var postData = '{"class":"org.openqa.grid.common.RegistrationRequest","capabilities":[{"platform":"LINUX","seleniumProtocol":"Selenium","browserName":"firefox","maxInstances":1,"version":"14","alias":"FF14"}],"configuration":{"port":5572,"nodeConfig":"config.json","host":"127.0.0.1","cleanUpCycle":10000,"browserTimeout":20000,"hubHost":"10.0.1.6","registerCycle":5000,"debug":"","hub":"http://10.0.1.6:4444/grid/register","log":"test.log","url":"http://127.0.0.1:5572","remoteHost":"http://127.0.0.1:5572","register":true,"proxy":"org.openqa.grid.selenium.proxy.DefaultRemoteProxy","maxSession":1,"role":"node","hubPort":4444}}';

			request(server)
				.post('/grid/register')
				.send(postData)
				.end(function(err, res) {
					res.statusCode.should.equal(200);
					res.text.should.equal("OK - Welcome");
					
					request(server)
						.get('/selenium-server/driver?cmd=getNewBrowserSession&1=firefox&4=' + encodeURIComponent('PLATFORM=LINUX;version=14') + '&client_key=' + testData.CLIENT_KEY + "&client_secret=" + testData.CLIENT_SECRET)
						.end(function(err, res) {

						});
				});
		});

		it("should correctly extract desired capabilities from a POST request", function(done) {
			nodeServerMock = http.createServer(function(req, res) {
			  var url = req.url.toString();
			  if (url.indexOf('getNewBrowserSession') > -1) {
			  	// this node should receive the command
			  	assert.ok(true);
			  	request(server)
					.get('/grid/unregister?id=http://127.0.0.1:5573')
					.end(function(err, res) {
						res.statusCode.should.equal(200);
						res.text.should.equal("OK - Bye");
						nodeServerMock.close();
			  			done();
					});
			  }
			}).listen(5573, '127.0.0.1');

			var postData = '{"class":"org.openqa.grid.common.RegistrationRequest","capabilities":[{"platform":"LINUX","seleniumProtocol":"Selenium","browserName":"firefox","maxInstances":1,"version":"14","alias":"FF14"}],"configuration":{"port":5573,"nodeConfig":"config.json","host":"127.0.0.1","cleanUpCycle":10000,"browserTimeout":20000,"hubHost":"10.0.1.6","registerCycle":5000,"debug":"","hub":"http://10.0.1.6:4444/grid/register","log":"test.log","url":"http://127.0.0.1:5573","remoteHost":"http://127.0.0.1:5573","register":true,"proxy":"org.openqa.grid.selenium.proxy.DefaultRemoteProxy","maxSession":1,"role":"node","hubPort":4444}}';

			request(server)
				.post('/grid/register')
				.send(postData)
				.end(function(err, res) {
					res.statusCode.should.equal(200);
					res.text.should.equal("OK - Welcome");
					
					request(server)
						.post('/selenium-server/driver?cmd=getNewBrowserSession&client_key=' + testData.CLIENT_KEY + "&client_secret=" + testData.CLIENT_SECRET)
						.send('1=firefox&4=' + encodeURIComponent('PLATFORM=LINUX;version=14'))
						.end(function(err, res) {

						});
				});
		});

		it('should add a request as pending when the desired capabilities can not currently be satisified', function(done) {
			this.timeout(9000);
			nodeServerMock = http.createServer(function(req, res) {
			}).listen(5574, '127.0.0.1');

			var postData = '{"class":"org.openqa.grid.common.RegistrationRequest","capabilities":[{"platform":"WINDOWS","seleniumProtocol":"Selenium","browserName":"firefox","maxInstances":1,"version":"14","alias":"FF14"}],"configuration":{"port":5574,"nodeConfig":"config.json","host":"127.0.0.1","cleanUpCycle":10000,"browserTimeout":20000,"hubHost":"10.0.1.6","registerCycle":5000,"debug":"","hub":"http://10.0.1.6:4444/grid/register","log":"test.log","url":"http://127.0.0.1:5574","remoteHost":"http://127.0.0.1:5574","register":true,"proxy":"org.openqa.grid.selenium.proxy.DefaultRemoteProxy","maxSession":1,"role":"node","hubPort":4444}}';

			request(server)
				.post('/grid/register')
				.send(postData)
				.end(function(err, res) {
					res.statusCode.should.equal(200);
					res.text.should.equal("OK - Welcome");
					registry.pendingRequests.should.be.empty

					setTimeout(function() {
						registry.pendingRequests.should.not.be.empty
						request(server)
							.get('/grid/unregister?id=http://127.0.0.1:5574')
							.end(function(err, res) {
								res.statusCode.should.equal(200);
								res.text.should.equal("OK - Bye");
								nodeServerMock.close();
					  			done();
							});
					}, 4000);

					request(server)
						.post('/selenium-server/driver?cmd=getNewBrowserSession&client_key=' + testData.CLIENT_KEY + "&client_secret=" + testData.CLIENT_SECRET)
						.send('1=firefox&4=' + encodeURIComponent('PLATFORM=LINUX;version=14'))
						.end(function(err, res) {

						});
				});
		});
	});
});