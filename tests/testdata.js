exports.CLIENT_KEY = "key";
exports.CLIENT_SECRET = "secret";

exports.getSessionID = function() {
	return Math.round(Math.random()*1000003420) + Math.round(Math.random()*1000023400);
};