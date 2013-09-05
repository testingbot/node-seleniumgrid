var server = require('../server');
var matcher = require('../capabilitymatcher');

var http = require('http');
var should = require('should');
var request = require('supertest');
var assert = require('assert');
var models = require('../models');
var registry = require('../registry');
var store = require('../store');

describe('CapabilityMatcher', function() {

	describe('Correctly find a match', function() {
		beforeEach(function(d) {
			store.removeAllAvailableNodes(d);
		});

		it("should correctly find a full match", function(done) {
			store.addAvailableNode(new models.Node("127.0.0.1", 5556, [{'browsername' : 'firefox', 'version' : 14, 'platform' : 'WINDOWS' }]), function() {
				matcher.findNode({'browserName' : 'firefox', 'version' : 14, 'platform' : 'WINDOWS' }, function(node) {
					node.host.should.equal("127.0.0.1");
					done();
				}, true);
			});
		});

		it("should find a version even if it's a string", function(done) {
			store.addAvailableNode(new models.Node("127.0.0.2", 5556, [{'browsername' : 'firefox', 'version' : '14', 'platform' : 'WINDOWS' }]), function() {
				matcher.findNode({'browserName' : 'firefox', 'version' : 14, 'platform' : 'WINDOWS' }, function(node) {
					node.host.should.equal("127.0.0.2");
					done();
				}, true);
			});
		});

		it("should be case-insensitive", function(done) {
			store.addAvailableNode(new models.Node("127.0.0.2", 5556, [{'browsername' : 'firefox', 'version' : 14, 'platform' : 'WINDOWS' }]), function() {
				matcher.findNode({'browserName' : 'FIREFOX', 'Version' : '14', 'platform' : 'windows' }, function(node) {
					node.host.should.equal("127.0.0.2");
					done();
				}, true);
			});
		});

		it("should not crash when the user asks for a permission which is not registered on the node", function(done) {
			store.addAvailableNode(new models.Node("127.0.0.2", 5556, [{'browsername' : 'firefox', 'version' : 14, 'platform' : 'WINDOWS' }]), function() {
				matcher.findNode({'browserName' : 'FIREFOX', 'Version' : '14', 'platform' : 'windows', 'cherries' : 'ontop' }, function(node) {
					node.host.should.equal("127.0.0.2");
					done();
				}, true);
			});
		});

		it("should be able to handle empty desired capabilities", function(done) {
			store.addAvailableNode(new models.Node("127.0.0.2", 5556, [{'browsername' : 'firefox', 'version' : 14, 'platform' : 'WINDOWS' }]), function() {
				matcher.findNode({}, function(node) {
					node.host.should.equal("127.0.0.2");
					done();
				}, true);
			});
		});

		it('should be able to handle incorrect capabilities', function(done) {
			store.addAvailableNode(new models.Node("127.0.0.2", 5556, [{'browsername' : 'firefox', 'version' : 14, 'platform' : 'WINDOWS' }]), function() {
				matcher.findNode({'nothing':'else'}, function(node) {
					node.host.should.equal("127.0.0.2");
					done();
				}, true);
			});
		});

		it("should correctly find a node when the user asks for ANY OS", function(done) {
			store.addAvailableNode(new models.Node("127.0.0.2", 5556, [{'browsername' : 'firefox', 'version' : '14', 'platform' : 'WINDOWS' }]), function() {
				matcher.findNode({'browserName' : 'firefox', 'version' : 14, 'platform' : 'ANY' }, function(node) {
					node.host.should.equal("127.0.0.2");
					done();
				}, true);
			});
		});

		it("should correctly find a node when the user asks for ANY OS", function(done) {
			store.addAvailableNode(new models.Node("127.0.0.2", 5556, [{'browsername' : 'firefox', 'version' : '14', 'platform' : 'WINDOWS' }]), function() {
				matcher.findNode({'browserName' : 'firefox', 'version' : 14, 'platform' : '*' }, function(node) {
					node.host.should.equal("127.0.0.2");
					done();
				}, true);
			});
		});

		it("should correctly find a node with just one desired capability", function(done) {
			store.addAvailableNode(new models.Node("127.0.0.2", 5556, [{'browsername' : 'firefox', 'version' : '14', 'platform' : 'WINDOWS' }]), function() {
				matcher.findNode({'browserName' : 'firefox' }, function(node) {
					node.host.should.equal("127.0.0.2");
					done();
				}, true);
			});
		});

		it("should pick the correct node that corresponds to our desired_capabilities", function(done) {
			store.addAvailableNode(new models.Node("127.0.0.2", 5556, [{'browsername' : 'firefox', 'version' : '14', 'platform' : 'WINDOWS' }]), function() {
				store.addAvailableNode(new models.Node("127.0.0.3", 5556, [{'browsername' : 'firefox', 'version' : '13', 'platform' : 'LINUX' }]), function() {
					matcher.findNode({'browserName' : 'firefox', 'platform' : 'LINUX' }, function(node) {
						node.host.should.equal("127.0.0.3");
						done();
					}, true);
				});
			});
		});
	});
});