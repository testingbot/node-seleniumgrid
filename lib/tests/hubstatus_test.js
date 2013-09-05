var server = require('../server.js');
var should = require('should');
var fs = require('fs');

var request = require('supertest');
describe('Server', function() {
	describe('GET /grid/api/hub', function() {
		it('responds with the hub configuration', function(done) {
			fs.readFile('../config.json', function(err, data) {
			  request(server)
				.get('/grid/api/hub/')
				.end(function(err, res) {
					var config = JSON.parse(data.toString());
					res.statusCode.should.equal(200);
					
					res.body.should.be.an.instanceOf(Object)
					res.body.port.should.equal(config.port);
					res.body.host.should.equal(config.host);

					done();
				});
			});
		});
	});
});