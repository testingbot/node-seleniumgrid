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

describe('WebDriver', function() {
	describe('Correctly forward to a node', function() {
		beforeEach(function(d) {
			// mimick a WebDriver node
			nodeServerMock = http.createServer(function(req, res) {
			  var url = req.url.toString();
			  var sessionID = testData.getSessionID();
			  if ((url.indexOf('/session') > -1) && (req.method.toUpperCase() !== "DELETE")) {
			  	res.writeHead(302, {
			  		'Location' : '/wd/hub/session/' + sessionID
			  	});
			  	res.end();
			  } else if (req.method.toUpperCase() === "DELETE") {
			  	res.writeHead(200, {'Content-Type': 'text/plain'});
	  			res.end("");
			  }
			}).listen(5590, '127.0.0.1');

			var postData = '{"class":"org.openqa.grid.common.RegistrationRequest","capabilities":[{"platform":"WINDOWS","seleniumProtocol":"Selenium","browserName":"firefox","maxInstances":1,"version":"9","alias":"FF9"}],"configuration":{"port":5590,"nodeConfig":"config.json","host":"127.0.0.1","cleanUpCycle":10000,"browserTimeout":20000,"hubHost":"10.0.1.6","registerCycle":5000,"debug":"","hub":"http://10.0.1.6:4444/grid/register","log":"test.log","url":"http://127.0.0.1:5590","remoteHost":"http://127.0.0.1:5590","register":true,"proxy":"org.openqa.grid.selenium.proxy.DefaultRemoteProxy","maxSession":1,"role":"node","hubPort":4444}}';

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
				.get('/grid/unregister?id=http://127.0.0.1:5590')
				.end(function(err, res) {
					res.statusCode.should.equal(200);
					res.text.should.equal("OK - Bye");
					nodeServerMock.close();
					d();
				});
		});

		it('can open a new browser session on a remote WebDriver node', function(done) {
			this.timeout(30000);

		  	request(server)
				.post('/wd/hub/session')
				.send({ desiredCapabilities: { browserName: "firefox", api_key: testData.CLIENT_KEY, api_secret: testData.CLIENT_SECRET }})
				.end(function(err, res) {
					res.statusCode.should.equal(302);
					done();
				});
		});

		it('should correctly redirect if the desired version is not a string but an int', function(done) {
			this.timeout(30000);

		  	request(server)
				.post('/wd/hub/session')
				.send({ desiredCapabilities: { browserName: "firefox", api_key: testData.CLIENT_KEY, api_secret: testData.CLIENT_SECRET, version: 9 }})
				.end(function(err, res) {
					res.statusCode.should.equal(302);
					done();
				});
		});

		it('should clean up registry when sending the delete command', function(done) {
		  	this.timeout(30000);
			
			request(server)
				.post('/wd/hub/session')
				.send({ desiredCapabilities: { browserName: "firefox", api_key: testData.CLIENT_KEY, api_secret: testData.CLIENT_SECRET }})
				.end(function(err, res) {
					res.statusCode.should.equal(302);
					var sessionID = res.headers.location.replace("/wd/hub/session/", "");
					// should be in the registry

					registry.getSessionById(sessionID, function(session) {
						session.should.be.an.instanceof(models.Session);

						request(server)
							.del('/wd/hub/session/' + sessionID)
							.send({ desiredCapabilities: { browserName: "firefox" }})
							.end(function(err, res) {

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

			// send a command with invalid sessionId
			request(server)
				.post('/wd/hub/session/4354353453/url')
				.send({ url: "http://testingbot.com" })
				.end(function(err, res) {
					res.statusCode.should.equal(500);
					res.text.should.equal("Unknown sessionId: 4354353453");
					registry.getSessionById("4354353453", function(session) {
						assert.equal(session, undefined);
						done();
					});
				});
		});

		it('should correctly unlock a findNode', function(done) {
			this.timeout(10000);
			request(server)
				.post('/wd/hub/session')
				.send({ desiredCapabilities: { browserName: "firefox", api_key: testData.CLIENT_KEY, api_secret: testData.CLIENT_SECRET }})
				.end(function(err, res) {
					res.statusCode.should.equal(302);
					var sessionID = res.headers.location.replace("/wd/hub/session/", "");
					request(server)
						.del('/wd/hub/session/' + sessionID)
						.end(function(err, res) {
							request(server)
								.post('/wd/hub/session')
								.send({ desiredCapabilities: { browserName: "firefox", api_key: testData.CLIENT_KEY, api_secret: testData.CLIENT_SECRET }})
								.end(function(err, res) {
									done();
								});
						});
				});
		});

		it('should be possible to end a test twice (double teardown bug)', function(done) {
			request(server)
				.post('/wd/hub/session')
				.send({ desiredCapabilities: { browserName: "firefox", api_key: testData.CLIENT_KEY, api_secret: testData.CLIENT_SECRET }})
				.end(function(err, res) {
					res.statusCode.should.equal(302);
					var sessionID = res.headers.location.replace("/wd/hub/session/", "");
					// should be in the registry

					registry.getSessionById(sessionID, function(session) {
						session.should.be.an.instanceof(models.Session);

						request(server)
							.del('/wd/hub/session/' + sessionID)
							.end(function(err, res) {
								request(server)
									.del('/wd/hub/session/' + sessionID)
									.end(function(err, res) {
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

	describe('handle timeouts during test', function() {
		beforeEach(function(d) {
			// mimick a webdriver node

			registry.TEST_TIMEOUT = 6000;
			registry.NODE_TIMEOUT = 40000;

			nodeServerMock = http.createServer(function(req, res) {
			  var url = req.url.toString();
			  var sessionID = testData.getSessionID();
			  if ((url.indexOf('/session') > -1) && (req.method.toUpperCase() !== "DELETE")) {
			  	res.writeHead(302, {
			  		'Location' : '/wd/hub/session/' + sessionID
			  	});
			  	res.end();
			  } else if (req.method.toUpperCase() === "DELETE") {
			  	res.writeHead(200, {'Content-Type': 'text/plain'});
	  			res.end("");
			  }
			}).listen(5591, '127.0.0.1');

			var postData = '{"class":"org.openqa.grid.common.RegistrationRequest","capabilities":[{"platform":"WINDOWS","seleniumProtocol":"Selenium","browserName":"firefox","maxInstances":1,"version":"9","alias":"FF9"}],"configuration":{"port":5591,"nodeConfig":"config.json","host":"127.0.0.1","cleanUpCycle":10000,"browserTimeout":20000,"hubHost":"10.0.1.6","registerCycle":5000,"debug":"","hub":"http://10.0.1.6:4444/grid/register","log":"test.log","url":"http://127.0.0.1:5591","remoteHost":"http://127.0.0.1:5591","register":true,"proxy":"org.openqa.grid.selenium.proxy.DefaultRemoteProxy","maxSession":1,"role":"node","hubPort":4444}}';

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
				.get('/grid/unregister?id=http://127.0.0.1:5591')
				.end(function(err, res) {
					res.statusCode.should.equal(200);
					res.text.should.equal("OK - Bye");
					nodeServerMock.close();
					d();
				});
		});

		it('should correctly handle timeouts during tests. If it takes xx seconds before a new command is received, the test should time out and resources should be cleaned', function(done) {
			this.timeout(40000);

			request(server)
				.post('/wd/hub/session')
				.send({ desiredCapabilities: { browserName: "firefox", api_key: testData.CLIENT_KEY, api_secret: testData.CLIENT_SECRET }})
				.end(function(err, res) {
					res.statusCode.should.equal(302);
					var sessionID = res.headers.location.replace("/wd/hub/session/", "");
					// should be in the registry

					registry.getSessionById(sessionID, function(session) {
						session.should.be.an.instanceof(models.Session);
						// now wait for the next command
						setTimeout(function() {
							request(server)
							.post('/wd/hub/session/' + sessionID + '/url')
							.send({ url: "http://testingbot.com" })
							.end(function(err, res) {
								res.statusCode.should.equal(500);
								res.text.should.match(/Unknown sessionId/);
								registry.getSessionById(sessionID, function(session) {
									assert.equal(session, undefined);
									done();
								});
							});
						}, 30000);
					});
				});
		});

		it("should not timeout when a test is behaving", function(done) {
			this.timeout(30000);
			request(server)
				.post('/wd/hub/session')
				.send({ desiredCapabilities: { browserName: "firefox", api_key: testData.CLIENT_KEY, api_secret: testData.CLIENT_SECRET }})
				.end(function(err, res) {
					res.statusCode.should.equal(302);
					var sessionID = res.headers.location.replace("/wd/hub/session/", "");
					// should be in the registry

					registry.getSessionById(sessionID, function(session) {
						session.should.be.an.instanceof(models.Session);
					
						// now wait for the next command
						setTimeout(function() {
							request(server)
							.del('/wd/hub/session/' + sessionID)
							.end(function(err, res) {
								res.statusCode.should.equal(200);
								done();
							});
						}, 3000);	
					});
				});
		});
	});

	describe("extracting parameters", function() {
		it("should correctly extract desired capabilities from a request", function(done) {
			nodeServerMock = http.createServer(function(req, res) {
			  var url = req.url.toString();
			  if ((url.indexOf('/session') > -1) && (req.method.toUpperCase() !== "DELETE")) {
			  	assert.ok(true);

			  	request(server)
					.get('/grid/unregister?id=http://127.0.0.1:5592')
					.end(function(err, res) {
						res.statusCode.should.equal(200);
						res.text.should.equal("OK - Bye");
						nodeServerMock.close();
			  			done();
					});
			  }
			}).listen(5592, '127.0.0.1');

			var postData = '{"class":"org.openqa.grid.common.RegistrationRequest","capabilities":[{"platform":"LINUX","seleniumProtocol":"Selenium","browserName":"firefox","maxInstances":1,"version":"14","alias":"FF14"}],"configuration":{"port":5592,"nodeConfig":"config.json","host":"127.0.0.1","cleanUpCycle":10000,"browserTimeout":20000,"hubHost":"10.0.1.6","registerCycle":5000,"debug":"","hub":"http://10.0.1.6:4444/grid/register","log":"test.log","url":"http://127.0.0.1:5592","remoteHost":"http://127.0.0.1:5592","register":true,"proxy":"org.openqa.grid.selenium.proxy.DefaultRemoteProxy","maxSession":1,"role":"node","hubPort":4444}}';

			request(server)
				.post('/grid/register')
				.send(postData)
				.end(function(err, res) {
					res.statusCode.should.equal(200);
					res.text.should.equal("OK - Welcome");
					request(server)
						.post('/wd/hub/session')
						.send({ desiredCapabilities: { browserName: "firefox", platform: "LiNux", "version" : 14, api_key: testData.CLIENT_KEY, api_secret: testData.CLIENT_SECRET }})
						.end(function(err, res) {

						});
				});
		});

		it('should add a request as pending when the desired capabilities can not currently be satisified', function(done) {
			this.timeout(9000);
			nodeServerMock = http.createServer(function(req, res) {
			}).listen(5593, '127.0.0.1');

			var postData = '{"class":"org.openqa.grid.common.RegistrationRequest","capabilities":[{"platform":"WINDOWS","seleniumProtocol":"Selenium","browserName":"firefox","maxInstances":1,"version":"3","alias":"FF14"}],"configuration":{"port":5560,"nodeConfig":"config.json","host":"127.0.0.1","cleanUpCycle":10000,"browserTimeout":20000,"hubHost":"10.0.1.6","registerCycle":5000,"debug":"","hub":"http://10.0.1.6:4444/grid/register","log":"test.log","url":"http://127.0.0.1:5593","remoteHost":"http://127.0.0.1:5593","register":true,"proxy":"org.openqa.grid.selenium.proxy.DefaultRemoteProxy","maxSession":1,"role":"node","hubPort":4444}}';

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
							.get('/grid/unregister?id=http://127.0.0.1:5593')
							.end(function(err, res) {
								res.statusCode.should.equal(200);
								res.text.should.equal("OK - Bye");
								nodeServerMock.close();
					  			done();
							});
					}, 4000);

					request(server)
						.post('/wd/hub/session')
						.send({ desiredCapabilities: { browserName: "firefox", platform: "LINUX", "version" : 3, api_key: testData.CLIENT_KEY, api_secret: testData.CLIENT_SECRET }})
						.end(function(err, res) {

						});
				});
		});
	});
});