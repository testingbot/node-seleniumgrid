#!/usr/bin/env node
"use strict";

var server  = require('../server.js');
var parser  = require('./parser.js');


var args = parser.parseArgs();
server.run(args);