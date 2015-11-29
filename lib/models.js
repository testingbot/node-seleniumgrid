exports.Node = function(host, port, capabilities, json, hostname, hypervisor) {
	this.host = null;
	this.port = 5556;
	this.available = true;
	this.lastSeen = 0;
	this.lastUsed = 0;
	this.capabilities = [];
	this.selectedCapabilities = null;
	this.lastTestID = null;
	this.platform = "";
	this.hypervisor = null;
	this.hostname = null;
	this.destroyTimer = null;
	this.skipTimeout = false;

	this._construct = function(host, port, capabilities, json, hostname, hypervisor) {
		this.host = host;
		this.port = parseInt(port, 10);
		this.capabilities = capabilities;

		this.lastSeen = (new Date()).getTime();
		this.json = json;
		this.platform = this.capabilities[0].platform;
		this.hostname = hostname;
		this.hypervisor = hypervisor;
	};

	this._construct(host, port, capabilities, json, hostname, hypervisor);
};

exports.Capability = function(cap) {
	this.platform = null;
	this.seleniumprotocol = null;
	this.browsername = null;
	this.maxinstances = 1;
	this.version = null;
	
	this._construct = function(cap) {
		this.platform = cap.platform;
		this.seleniumprotocol = cap.seleniumProtocol;
		this.browsername = cap.browserName;
		this.maxinstances = cap.maxInstances;
		this.version = cap.version;
		for (var key in cap) {
			this[key] = cap[key];
		}
	};

	this._construct(cap);
};

exports.Response = function(statusCode, body, headers) {
	this.statusCode = statusCode || 200;
	this.headers = headers || {'Content-Type': 'application/json'};
	this.body = body || "";
};

exports.ManualSession = function(response) {
	this.diff = null;
	this._response = [];

	this._construct = function(response) {
		this._response = response;
		this.diff = response['diff'];
	};

	this._construct(response);
};

exports.Session = function(type, nodeHost, nodePort, sessionID) {
	this.nodeHost = null;
	this.nodePort = 0;
	this.type = null;
	this.sessionID = null;
	this.lastUsed = 0;
	this.startTime = 0;
	this.timeoutIntervalID = null;
	this.platform = "";
	this.alias = "";
	this.user = null;
	this.isManualStop = false;
	this.hasError = false;
	this.desiredCapabilities = null;
	this.response = null;
	this.forceClosed = false;
	this.manual = false;
	this.test = {};
	this.hasBreakpoint = false;

	// diagnostics
	this.lastResponseTime = 0;
	this.lastSentTime = 0;

	this.lastResponseBody = "";
	this.lastSentBody = "";

	this._construct = function(type, nodeHost, nodePort, sessionID) {
		this.type = type;
		this.nodeHost = nodeHost;
		this.nodePort = nodePort;
		this.sessionID = sessionID;
		this.lastUsed = (new Date()).getTime();
	};

	this._construct(type, nodeHost, nodePort, sessionID);
};