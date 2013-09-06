"use strict";

var ArgumentParser = require('argparse').ArgumentParser;
var parser = new ArgumentParser({
  version: '0.1.0',
  addHelp:true,
  description: 'node-seleniumgrid'
});

parser.addArgument(
  [ '-k', '--key' ],
  {
    help: 'specify your TestingBot key',
    required: false,
    example: "12okfoi"
  }
);

parser.addArgument(
  [ '-s', '--secret' ],
  {
    help: 'specify your TestingBot secret',
    required: false,
    example: "fsdf322"
  }
);

module.exports = parser;