var server = require('../server.js');
var should = require('should');

var request = require('supertest');

describe('Status', function() {
	describe('GET /grid/api/proxy', function() {
		it('responds with an unknown node if the node is polling this without registering first', function(done) {
		  request(server)
			.get('/grid/api/proxy?id=http://10.0.0.1:5554')
			.end(function(err, res) {
				var body = res.body;
				res.body.should.be.an.instanceOf(Object)
				res.body.success.should.be.false
				done();
			});
		});
	});

	describe('GET /grid/api/proxy register', function() {
		var postData = '{"class":"org.openqa.grid.common.RegistrationRequest","capabilities":[{"platform":"WINDOWS","seleniumProtocol":"Selenium","browserName":"iexplore","maxInstances":1,"version":"9"}],"configuration":{"port":5560,"nodeConfig":"config.json","host":"10.0.1.15","cleanUpCycle":10000,"browserTimeout":20000,"hubHost":"10.0.1.6","registerCycle":5000,"debug":"","hub":"http://10.0.1.6:4444/grid/register","log":"test.log","url":"http://10.0.1.15:5560","remoteHost":"http://10.0.1.15:5560","register":true,"proxy":"org.openqa.grid.selenium.proxy.DefaultRemoteProxy","maxSession":1,"role":"node","hubPort":4444}}';

		beforeEach(function(d) {
			request(server)
				.post('/grid/register')
				.send(postData)
				.end(function(err, res) {
					res.statusCode.should.equal(200);
					res.text.should.equal("OK - Welcome");
					d();
				});
		});

		it('responds with an ok if the node polling has been registered before', function(done) {
		  	request(server)
				.get('/grid/api/proxy?id=http://10.0.1.15:5560')
				.end(function(err, res) {
					var body = res.body;
					res.body.should.be.an.instanceOf(Object)
					res.body.success.should.be.true
					done();
				});
		});
	});

	describe('GET /grid/api/proxy timeout', function() {
		var postData = '{"class":"org.openqa.grid.common.RegistrationRequest","capabilities":[{"platform":"WINDOWS","seleniumProtocol":"Selenium","browserName":"iexplore","maxInstances":1,"version":"9"}],"configuration":{"port":5560,"nodeConfig":"config.json","host":"10.0.1.16","cleanUpCycle":10000,"browserTimeout":20000,"hubHost":"10.0.1.6","registerCycle":5000,"debug":"","hub":"http://10.0.1.6:4444/grid/register","log":"test.log","url":"http://10.0.1.16:5560","remoteHost":"http://10.0.1.16:5560","register":true,"proxy":"org.openqa.grid.selenium.proxy.DefaultRemoteProxy","maxSession":1,"role":"node","hubPort":4444}}';

		beforeEach(function(d) {
			request(server)
				.post('/grid/register')
				.send(postData)
				.end(function(err, res) {
					res.statusCode.should.equal(200);
					res.text.should.equal("OK - Welcome");
					d();
				});
		});

		it('should return a not found response if the node has not responded in the nodeTimeout time', function(done) {
			this.timeout(20000);
			setTimeout(function() {
				request(server)
				.get('/grid/api/proxy?id=http://10.0.1.16:5560')
				.end(function(err, res) {
					var body = res.body;
					res.body.should.be.an.instanceOf(Object)
					res.body.success.should.be.false
					done();
				});
			}, 16000);
		});

		it('should be possible to register the node again after it has failed to respond in nodeTimeout time', function(done) {
			this.timeout(20000);
			setTimeout(function() {
				request(server)
				.get('/grid/api/proxy?id=http://10.0.1.16:5560')
				.end(function(err, res) {
					var body = res.body;
					res.body.should.be.an.instanceOf(Object)
					res.body.success.should.be.false
					request(server)
						.post('/grid/register')
						.send(postData)
						.end(function(err, res) {
							res.statusCode.should.equal(200);
							res.text.should.equal("OK - Welcome");
							done();
						});
				});
			}, 16000);
		});
	});
});