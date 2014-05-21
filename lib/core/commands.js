'use strict';

var optimist = require('optimist'),
	_ = require('lodash');

module.exports = function () {

	var self = this,
		args = optimist.argv,
		cli = /cli.js/.test(args.$0),
		cloneArgs = _.clone(args) || {},
		cmd = args._[0] || undefined,
		cmds = [
			'start',
			'create',
			'new',
			'run',
			'info',
			'help'
		];

	// save the called command.
	cmd = cmd === 'run' ? 'start' : cmd;
	this.cmd = cmd;

	// save reference to whether Stukko was
	// started using the cli or locally.
	this.cli = cli;

	// update instance with arg obj.
	this.args = args;

	// save all commands to instance.
	this.commands = args._;

	// delete unneeded args.
	delete cloneArgs._;
	delete cloneArgs.$0;

	// save all the flags to instance.
	this.flags = cloneArgs;

	//make sure we have a valid command.
	if(cli && !_.contains(cmds, cmd))
		throw new Error('Stukko could not process command ' + cmd + '. Try stukko help for list of commands.');

	// initialize Stukko.
	this.init();

	// start the application.
	if(_.contains(['start', 'run'], cmd))
		this.listen();

	// create a new application.
	if(_.contains(['create', 'new'], cmd))
		this.create();

	// get application information.
	if(_.contains(['info'], cmd))
		this.info();

	// get application help.
	if(_.contains(['help'], cmd))
		this.help();


};