var server = require('../server.js');
var should = require('should');

var request = require('supertest');

describe('Register', function() {

	describe('GET /grid/api/proxy register', function() {

		it('receives a 400 bad request when sending invalid data during registration', function(done) {
		  	request(server)
				.post('/grid/register')
				.send("nothing")
				.end(function(err, res) {
					res.statusCode.should.equal(400);
					res.text.should.equal("Invalid parameters");
					done();
				});
		});

		it('should be possible to register the same node twice', function(done) {
			var postData = '{"class":"org.openqa.grid.common.RegistrationRequest","capabilities":[{"platform":"WINDOWS","seleniumProtocol":"Selenium","browserName":"iexplore","maxInstances":1,"version":"9","alias":"FF9"}],"configuration":{"port":5559,"nodeConfig":"config.json","host":"10.0.1.15","cleanUpCycle":10000,"browserTimeout":20000,"hubHost":"10.0.1.6","registerCycle":5000,"debug":"","hub":"http://10.0.1.6:4444/grid/register","log":"test.log","url":"http://10.0.1.15:5559","remoteHost":"http://10.0.1.15:5559","register":true,"proxy":"org.openqa.grid.selenium.proxy.DefaultRemoteProxy","maxSession":1,"role":"node","hubPort":4444}}';

			request(server)
				.post('/grid/register')
				.send(postData)
				.end(function(err, res) {
					res.statusCode.should.equal(200);
					res.text.should.equal("OK - Welcome");
					
					request(server)
						.post('/grid/register')
						.send(postData)
						.end(function(err, res) {
							res.statusCode.should.equal(200);
							res.text.should.equal("OK - Welcome");
							done();
						});
				});
		});
	});
});