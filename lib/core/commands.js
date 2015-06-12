'use strict';

var optimist = require('optimist');

/**
 * Parses command arguments using optimist.
 * @constructor
 */
function Commands() {

	var self = this,
		args = optimist.argv,
		cli = /cli.js/.test(args.$0) || /stukko/.test(args.$0),
		cloneArgs = _.clone(args) || {},
		cmd = args._[0] || undefined,
        cmds = {
            start: ['run', 'start'],                    // starts/runs Stukko
            generate: ['new', 'create'],                // create a new Stukko app.
            diagnostics: ['diag'],                      // display diagnostic info.
            help: [],                                   // display help file.
            processes: ['proc', 'process'],             // displays running processes [FUTURE]
            seed: ['populate'],                         // populates data into your db engine's tables.
            git: [                                      // runs git commands from within Stukko.
                'git-commit', 'git-pull',
                'git-credentials', 'git-cred',
                'git-login', 'git-help'
            ],
            
            test: [],                                   // runs test located in "scripts" of package.json
            kill: []                                    // kills a process or all processes (handy for EADDRESS IN USE).

        };
    // save the original command passed
    // before its alias is looked up.
    this.ocmd = cmd;

    // store valid git commands.
    this.gitCommands = cmds.git;

    /**
     * Looks up a command by alias.
     * @param {string} alias - the command to check.
     * @private
     * @returns {string}
     */
    function lookup(alias) {
        var key = undefined;
        _.forEach(cmds, function(v,k) {
            if(!key)
                key = v.indexOf(alias) !== -1 ? k : alias === k ? k : undefined;
        });
        return key;
    }

    // save the called command.
	this.cmd = lookup(cmd);

	// save reference to whether Stukko was
	// started using the cli or locally.
	this.cli = cli;

	// update instance with arg obj.
	this.args = args;

    // indicate we are starting Stukko
    // or simply initializing for command helpers.
    this.start = (this.cmd === 'start' || !this.cli);

	// save all commands to instance.
	this.commands = args._ || [];

	// delete unneeded args.
	delete cloneArgs._;
	delete cloneArgs.$0;

	// save all the flags to instance.
	this.flags = cloneArgs || {};

	// check for additional packages to install.
	if(cmd === 'create' && this.flags.packages) {
		if(this.flags.packages.indexOf('|') !== -1)
			this.flags.packages = this.flags.packages.split('|');
		else
			this.flags.packages = this.flags.packages.split(',');
	}

    // initialize Stukko.
	this.emit('init');

}

module.exports = Commands;