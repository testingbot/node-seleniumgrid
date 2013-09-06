var server = require('../server');
var should = require('should');
var http = require('http');
var registry = require('../registry');
var assert = require('assert');
var request = require('supertest');
var requestHandler = require('../requesthandler');
var models = require('../models');
var store = require('../store');

var nodes = [];
var nodeServerMock;
var badNode, goodNode;
var testData = require('./testdata');

describe('RequestHandler', function() {

	describe('It should correctly distinguish between the two protocols', function() {

		it('receives an RC request', function(done) {
		  	requestHandler.determineProtocol('/selenium-server/driver/?cmd=getNewBrowserSession&client_key=' + testData.CLIENT_KEY + "&client_secret=" + testData.CLIENT_SECRET).should.equal('RC');
		  	done();
		});

		it('receives an WebDriver request', function(done) {
		  	requestHandler.determineProtocol('/session').should.equal('WebDriver');
		  	done();
		});
	});

	describe("cleanup when a test has started but does not receive any additional steps", function() {

		beforeEach(function(d) {
			store.flushdb();
			registry.TEST_TIMEOUT = 6000;
			registry.NODE_TIMEOUT = 40000;
			d();
		});

		afterEach(function(d) {
			registry.TEST_TIMEOUT = 90000;
			this.timeout(30000);
			request(server)
				.get('/grid/unregister?id=http://127.0.0.1:5580')
				.end(function(err, res) {
					res.statusCode.should.equal(200);
					res.text.should.equal("OK - Bye");
					nodeServerMock.close();
					d();
				});
		});

		it('should cleanup the node when a test has started but no other steps have been received', function(done) {
			this.timeout(30000);

			nodeServerMock = http.createServer(function(req, res) {
			  var url = req.url.toString();
			  var sessionID = testData.getSessionID();
			  if (url.indexOf('getNewBrowserSession') > -1) {
			  	res.writeHead(200, {'Content-Type': 'text/plain'});
	  			res.end("OK," + sessionID);
			  } else if (url.indexOf('testComplete') > -1) {
			  	registry.getSessionById(sessionID, function(session) {
			  		assert.equal(session, null);
				  	// testComplete should be received for this test to succeed
				  	done();
			  	});
			  }
			}).listen(5580, '127.0.0.1');

			var postData = '{"class":"org.openqa.grid.common.RegistrationRequest","capabilities":[{"platform":"WINDOWS","seleniumProtocol":"Selenium","browserName":"iexplore","maxInstances":1,"version":"9","alias":"FF9"}],"configuration":{"port":5580,"nodeConfig":"config.json","host":"127.0.0.1","cleanUpCycle":10000,"browserTimeout":20000,"hubHost":"10.0.1.6","registerCycle":5000,"debug":"","hub":"http://10.0.1.6:4444/grid/register","log":"test.log","url":"http://127.0.0.1:5580","remoteHost":"http://127.0.0.1:5580","register":true,"proxy":"org.openqa.grid.selenium.proxy.DefaultRemoteProxy","maxSession":1,"role":"node","hubPort":4444}}';


			request(server)
				.post('/grid/register')
				.send(postData)
				.end(function(err, res) {
					res.statusCode.should.equal(200);
					res.text.should.equal("OK - Welcome");
					
					// start a new session, but don't do anything after that
					request(server)
						.get('/selenium-server/driver?cmd=getNewBrowserSession&1=iexplore&client_key=' + testData.CLIENT_KEY + "&client_secret=" + testData.CLIENT_SECRET)
						.end(function(err, res) {
							res.statusCode.should.equal(200);
							var sessionID = res.text.replace("OK,", "");
							// should be in the registry
							registry.getSessionById(sessionID, function(session) {
								session.should.be.an.instanceof(models.Session);
							});
						});
				});
		});
	});

	describe("encoding test", function() {

		beforeEach(function(d) {
			// mimick an RC node
			store.flushdb();
			nodeServerMock = http.createServer(function(req, res) {
			  var url = req.url.toString();
			  var sessionID = testData.getSessionID();
			  if (url.indexOf('getNewBrowserSession') > -1) {
			  	res.writeHead(200, {'Content-Type': 'text/plain'});
	  			res.end("OK," + sessionID);
			  } else if (url.indexOf('testComplete') > -1) {
			  	res.writeHead(200, {'Content-Type': 'text/plain'});
	  			res.end("OK");
			  } else if (url.indexOf('title') > -1) {
			  	res.writeHead(200, {'Content-Type': 'text/plain'});
	  			res.end("éñy!");
			  }
			}).listen(5581, '127.0.0.1');

			var postData = '{"class":"org.openqa.grid.common.RegistrationRequest","capabilities":[{"platform":"WINDOWS","seleniumProtocol":"Selenium","browserName":"iexplore","maxInstances":1,"version":"9","alias":"IE9"}],"configuration":{"port":5581,"nodeConfig":"config.json","host":"127.0.0.1","cleanUpCycle":10000,"browserTimeout":20000,"hubHost":"10.0.1.6","registerCycle":5000,"debug":"","hub":"http://10.0.1.6:4444/grid/register","log":"test.log","url":"http://127.0.0.1:5581","remoteHost":"http://127.0.0.1:5581","register":true,"proxy":"org.openqa.grid.selenium.proxy.DefaultRemoteProxy","maxSession":1,"role":"node","hubPort":4444}}';

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
				.get('/grid/unregister?id=http://127.0.0.1:5581')
				.end(function(err, res) {
					res.statusCode.should.equal(200);
					res.text.should.equal("OK - Bye");
					nodeServerMock.close();
					d();
				});
		});

		it("should be possible to send and receive weird characters", function(done) {
			request(server)
				.get('/selenium-server/driver?cmd=getNewBrowserSession&1=iexplore&2=' + encodeURIComponent('http://www.google.com') + '&client_key=' + testData.CLIENT_KEY + "&client_secret=" + testData.CLIENT_SECRET)
				.end(function(err, res) {
					res.statusCode.should.equal(200);
					var sessionID = res.text.replace("OK,", "");

					request(server)
						.get('/selenium-server/driver?cmd=title&sessionId=' + sessionID + '&1=' + encodeURIComponent('когда'))
						.end(function(err, res) {
							res.statusCode.should.equal(200);
							res.text.should.equal("éñy!");
							done();
						});
				});
		});
	});

	describe("Retry a test when the start of the test fails", function() {
		beforeEach(function(d) {
			// mimick an RC node
			store.flushdb();
			badNode = http.createServer(function(req, res) {
			  var url = req.url.toString();
			  if (url.indexOf('getNewBrowserSession') > -1) {
			  	res.writeHead(200, {'Content-Type': 'text/plain'});
	  			res.end("Error: I am a bad node");
			  } else if (url.indexOf('testComplete') > -1) {
			  	res.writeHead(200, {'Content-Type': 'text/plain'});
	  			res.end("OK");
			  }
			}).listen(5583, '127.0.0.1');

			var postData = '{"class":"org.openqa.grid.common.RegistrationRequest","capabilities":[{"platform":"WINDOWS","seleniumProtocol":"Selenium","browserName":"firefox","maxInstances":1,"version":"9","alias":"FF9"}],"configuration":{"port":5583,"nodeConfig":"config.json","host":"127.0.0.1","cleanUpCycle":10000,"browserTimeout":20000,"hubHost":"10.0.1.6","registerCycle":5000,"debug":"","hub":"http://10.0.1.6:4444/grid/register","log":"test.log","url":"http://127.0.0.1:5583","remoteHost":"http://127.0.0.1:5583","register":true,"proxy":"org.openqa.grid.selenium.proxy.DefaultRemoteProxy","maxSession":1,"role":"node","hubPort":4444}}';

			request(server)
				.post('/grid/register')
				.send(postData)
				.end(function(err, res) {
					res.statusCode.should.equal(200);
					res.text.should.equal("OK - Welcome");

						goodNode = http.createServer(function(req, res) {
						  var url = req.url.toString();
						  var sessionID = testData.getSessionID();
						  if (url.indexOf('getNewBrowserSession') > -1) {
						  	res.writeHead(200, {'Content-Type': 'text/plain'});
				  			res.end("OK," + sessionID);
						  } else if (url.indexOf('testComplete') > -1) {
						  	res.writeHead(200, {'Content-Type': 'text/plain'});
				  			res.end("OK");
						  }
						}).listen(5584, '127.0.0.1');

						var postData = '{"class":"org.openqa.grid.common.RegistrationRequest","capabilities":[{"platform":"WINDOWS","seleniumProtocol":"Selenium","browserName":"firefox","maxInstances":1,"version":"9","alias":"FF9"}],"configuration":{"port":5584,"nodeConfig":"config.json","host":"127.0.0.1","cleanUpCycle":10000,"browserTimeout":20000,"hubHost":"10.0.1.6","registerCycle":5000,"debug":"","hub":"http://10.0.1.6:4444/grid/register","log":"test.log","url":"http://127.0.0.1:5584","remoteHost":"http://127.0.0.1:5584","register":true,"proxy":"org.openqa.grid.selenium.proxy.DefaultRemoteProxy","maxSession":1,"role":"node","hubPort":4444}}';

						request(server)
							.post('/grid/register')
							.send(postData)
							.end(function(err, res) {
								res.statusCode.should.equal(200);
								res.text.should.equal("OK - Welcome");

								// force the registry to use the badNode first
								// the goodNode has been used recently
								var node = store.getNode('127.0.0.1', 5584);
								node.lastUsed = (new Date()).getTime();
								store.updateNode(node, d);
							});
				});
			
		});

		afterEach(function(d) {
			this.timeout(30000);
			request(server)
				.get('/grid/unregister?id=http://127.0.0.1:5583')
				.end(function(err, res) {
					res.statusCode.should.equal(200);
					res.text.should.equal("OK - Bye");
					badNode.close();
					request(server)
						.get('/grid/unregister?id=http://127.0.0.1:5584')
						.end(function(err, res) {
							res.statusCode.should.equal(200);
							res.text.should.equal("OK - Bye");
							goodNode.close();
							d();
						});
				});
		});

		it('should retry a test when the test fails starting a browser', function(done) {
			this.timeout(30000);
			request(server)
				.get('/selenium-server/driver?cmd=getNewBrowserSession&1=firefox&client_key=' + testData.CLIENT_KEY + "&client_secret=" + testData.CLIENT_SECRET)
				.end(function(err, res) {
					res.statusCode.should.equal(200);
					done();
				});
		});
	});
});