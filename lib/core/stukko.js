'use strict';

var util = require('util'),
	express = require('express'),
	http = require('http'),
	p = require('path'),
	childProc = require('child_process'),
  conf = require('./configuration'),
  Events = require('events'),
	configure = conf.configure,
	utils = require('../utils'),
	commands = require('./commands'),
	readline = require('readline'),
	diag = utils.diag,
	Db = require('./configuration/db'),
	defaults = require('./configuration/defaults');

module.exports = Stukko;

/**
 * Stukko instance, options passed overwrite options.json options.
 * @class Stukko
 * @param {object|string} [options] - options for initializing server see constructor source for options.
 * @param {string} [config] - the directory of the config to load. default is used if not specified.
 * @constructor
 */
function Stukko(options, config) {

	Events.EventEmitter.call(this);

	var self = this,
		cwd = process.cwd();

	// make lodash globally accessible.
	var _ = GLOBAL._ = require('lodash');

	// patch contains.
	// TODO: convert _.contains to _.includes.
	_.contains = _.includes.bind(_);

    // make io and helpers global.
    GLOBAL.$$UTILS = {
        io: utils.io,
        helpers: utils.helpers,
        reqeach: utils.reqeach
    };

    // make key paths global.
    GLOBAL.$$PATHS = {
        cwd: cwd,
        root: p.join(__dirname, '../../')
    };

	if(!this)
		throw new Error('Stukko must be instantiated with new Stukko()');

	// set to handle uncaughtExceptions.
	process.on('uncaughtException', function (err) {
		if(GLOBAL && GLOBAL.$$LOG)
			$$LOG.error(err.stack || ((err.name || 'Unknown Exception') && err.message) ||
				'An unknown exception occurred.');
		else
			console.log(err.stack || (err.name + '\n' + err.message) || 'Unknown exception halted the application.');

		self.shutdown();

	});


	this.inspect = util.inspect;
	this.format = util.format;
	this.pid = process.pid;                                             // get the process id for the current process.
	this.directory = p.basename(cwd);                                   // working directory name.
	this.debug = typeof(v8debug) === 'object';                          // application is debugging.
	this.utils = utils;                                                 // make utilities accessible in instance.
	this.rootdir = p.join(__dirname, '../../');                         // the root execution directory of stukko.
	this.cwd = cwd;                                                     // the current working directory.
	this.pkg = undefined;                                               // stukko package.json
	this.pkgapp = undefined;                                            // the application package.json.
	this.platform = process.platform;                                   // the platform stukko is running on.
	this.diag = diag.call(this);                                        // calling .get() returns current diagnostics.
	this.log = {};                                                      // winston loggers.
	this.configPath = p.join(this.cwd, '/config');						// the path to Stukko's configuration file.
	this.config = 'development';                                        // the loaded config name.
	this.start = false;													// When true start has been requested.
	this.listening = false;                                             // Stukko's listening state.
	this.exiting = false;                                               // Stukko's exit state.
  this.running = false;                                               // indicates Stukko is processing a command.

	this.express = express;                                             // express lib for creating routers etc.
	this.app = express();                                               // the express instance.
	this.server = undefined;                                            // express server populated on listen.
	this.sessionStore = undefined;                                      // the store for web sessions.
	this.origins = undefined;                                           // whitelisted array of origins. ignored if cors is disabled or origins is undefined. ex: ['http://mydomain.com'].
	this.connections = [];                                              // stores http connections to server.
	this.maxConnections = 50;                                           // maximum allowed connections.
	this.modules = {};                                                  // container for required modules.
	this.children = [];                                                 // child workers e.g. gulp.
	this.options = {};                                                  // store config options.

	this.onListening = undefined;                                       // called after server is ready & listening if provided.

	// get Stukko defaults.
	this.defaults = defaults.call(this);

	// call configure applying context.
	this.configure = configure.apply(this, arguments);

	// parse any command line args.
	commands.call(this);

	// return for chaining.
	return this;

}
// inherit Node Events/Emitter.
util.inherits(Stukko, Events.EventEmitter);

Stukko.prototype.userCommands = {};

/**
 * Expose database client, connection, destroy publicly.
 * @returns {database}
 */
Stukko.prototype.database = function database() {
	return Db.call(this);
};

/**
 * Creates the http server and listens at the specified host/port.
 * @memberOf Stukko
 * @param {string} [port] - the optional port.
 * @param {string} [host] - the optional host directory.
 * @param {function} [cb] - callback upon listening.
 * @returns {stukko}
 */
Stukko.prototype.listen = function listen(port, host, cb) {

	if (_.isFunction(port)) {
		cb = port;
		port = undefined;
		host = undefined;
	}

	if (_.isFunction(host)) {
		cb = host;
		host = undefined;
	}

	this.options.host = host || this.options.host;
	this.options.port = port || this.options.port;

	if(cb)
		this.onListening = cb;

	$$DEBUG('Starting server to listen for connections.');

		// start the server.
	this.server.listen(this.options.port, this.options.host);

};

/**
 * Shutsdown the Stukko server.
 * @param {number} [code] - the exit code to supply for process exit, defaults to 0.
 * @param {string} [msg] - an additional message to log/display.
 */
Stukko.prototype.shutdown = function shutdown(code, msg) {

	var self = this,
		server = this.server,
		exit = process.exit,
		msgType = 'info';

	if(this.exiting)
		return;

	this.exiting = true;
	this.emit('shutdown');
	console.log(' ');

	$$DEBUG('Server shutdown emitted.');

	if(typeof code === 'string'){
		msg = code;
		code = 0;
	}

	code = code === undefined || code === null ? 0 : code;

	if(msg) {
		if(/^(error|info|debug|warn|verbose):/.test(msg)){
			msg = msg.split(':');
			msgType = msg[0];
			msg = msg[1];
		}
	}

	/* if there's no server exit */
	if (!server) {
		exit(1);
	}
	else {



		// unref server
		server.unref();

		// iterate connections and destroy them.
		// otherwise server may delay in closing.
		_.forEach(this.connections, function (c) {
			c.destroy();
		});

		// kill child processes.
		_.forEach(this.children, function (c) {
			c.kill();
		});

		// Flush & Close Cache.
		if (this.cache) {
			this.cache.flushAll();
			this.cache.close();
		}


		// close database connection.
		if(this.db) {
			$$LOG.console.info('Disconnecting ' + self.options.db.module + ' database ' + (self.options.db.options.storage || self.options.db.options.database) || '');
			self.db.destroy(function(err) {
				if(err)
					$$LOG.error(err);
			});
		}

		// slight timeout can prevent minor errors when closing.
		setTimeout(function () {
			server.close(function () {
				$$LOG.info(self.directory + ' shutdown successfully.');
				if(msg)
					$$LOG[msgType](msg);
				exit(code);
			});
		},500);

	}
};

/**
 * Used to pass message & code for exiting process.
 * @memberof Stukko
 * @param {string} [msg] - the message to display on exit.
 * @param {string} [type] - the message type to display.
 * @param {number} [code] - the process exit code, defaults to 0.
 */
Stukko.prototype.exit = function exit(msg, type, code) {

    code = code || 0;
    type = type || 'info';

    // log message if supplied.
    if(msg)
        $$LOG[type](msg);

    // exit the application.
    process.exit(code);

};

/**
 * Creates a new Stukko application.
 */
Stukko.prototype.generate = function generate() {

	var self = this,
		npm = utils.npm.call(this),
		packages = [],
		npmConfig = this.flags || {},
		pkg, name, appPath, structure, manage, force;

	// get the app name, the path and the dir for the new app file structure.
	name = this.commands[1] || undefined;
	appPath = this.flags.path || this.flags.p || p.join(this.cwd, name);
	structure = p.join(this.rootdir, '/lib/structure');
	npmConfig.save = true;
    npmConfig.prefix = appPath;
    force = this.flags.force || this.flags.f;

	// get the default app package.
	pkg = utils.helpers.tryParseJson(utils.io.read(p.join(structure,'/package.json')));
    pkg = _.clone(pkg);
	if(!name)
		this.exit('Stukko was unable to generate the application with name: undefined. ex: stukko generate todos', 'error');

	if(!pkg)
		this.exit('Unable to load template package.json. Verify the template exists. You may need to reinstall Stukko.', 'error');

	if(utils.io.exists(appPath) && !force)
		this.exit('Application path already exists. Backup and delete the directory or use the --overwrite option.', 'error');

	// set platform tools if windows.
	if(this.platform === 'win32')
		npmConfig.msvs_version = (this.flags.msvs_version || 2012);

	// set dependencies and name.
	pkg.name = name;
    pkg.displayName = name;

    // make sure stukko is listed as a dependency.
    pkg.dependencies['stukko'] = 'origin1tech/stukko';

	_.forEach(pkg.dependencies, function (v,k) {
        k = k.replace("'", '');
		packages.push(k + '@' + (v || '*'));
	});

    // if custom packages specified
    // add to install packages.
    if(self.flags.packages){
        var custPackages = self.flags.packages.split(',')
        packages.concat(custPackages);
    }

    // copy file app structure.
	$$LOG.info('Installing file structure.')
	utils.io.copy(structure, appPath, function (err) {

        // throw error if fails to install.
        if(err){
            $$LOG.error(err.stack || (err.name && err.message))
            self.exit(1);
        }

		if(!err){

			// install npm packages.
			$$LOG.info('Please be patient installing application packages via npm.');
			npm.install(packages, npmConfig, function (err, data) {
				if(err) {
					$$LOG.error(err.message, err.stack);
					$$LOG.console.error('Stukko was unable to auto install npm packages.' +
						'\n       Option 1: run npm cache clean then run generate again with the --overwrite flag.' +
						'\n       Option: 2: Install manually by cd /to/your/app/path then run npm install.' +
						'\n       Windows Users: you may need to specify the --msvs_version flag for packages requiring node-gyp.' +
						'\n       ex: stukko generate appName --msvs_version=<version> where <version> is your version of Visual Stuido.\n');
				} else {

                    // save the updated package.
                    utils.io.write(p.join(appPath,'/package.json'), JSON.stringify(pkg, null, '\t'));

                    // show success message.
                    $$LOG.info('[' + name + '] was successfully created.');
                    self.emit('created');

                }

			});
		}
	});

};

/**
 * Populates database with seed data.
 */
Stukko.prototype.seed = function seed() {

    var self = this,
        Chance = require('chance'),
        Promise = require('bluebird'),
		//Promise = require('rsvp').Promise,
        promises = [],
        force = this.flags.f || this.flags.force,
        chance;

    // can't seed without db and connection.
    if(!self.db || !self.db.connection) return;

    // try to load seeds if not already.
    if(!this.modules.seeds)
        this.modules.seeds =  utils.reqeach(
            {
                dirname: self.options.modules.seeds,
                filter: self.options.modulesFilter
            });

    if(this.options.env === 'production')
       return $$LOG.console.info('Seeding is disabled in production mode. Use --force or -f to force seeding.');

    // check for seeds when in development environment.
    if(this.modules.seeds && Object.keys(this.modules.seeds).length) {

        // create instance of chance.
        chance = new Chance();

        // iterate each seed and update table.
        _.forEach(this.modules.seeds, function(v,k) {

            var _module = self.options.db.module,
                promise;
            if(_.isFunction(v)){
                if(_module === 'sequelize'&&
                    self.db.connection.models && Object.keys(self.db.connection.models).length){
                    promise = new Promise(_.bind(v, self, self.db.connection, self.db.client, chance));
                }
                if(_module === 'mongoose' && self.db.connection.models && Object.keys(self.db.connection.models).length){
                    promise = new Promise(_.bind(v, self, self.db.connection, chance));
                }
                if(/(mongodb|dirty|redis)/.test(_module)){
                    promise = new Promise(_.bind(v, self, self.db.connection, chance));
                }
                // add the promise to the collection.
                promises.push(promise);

            }
        });

        // apply promise and call seeds.
        if(promises.length && self.options.db.seed)
            $$LOG.console.info('Checking for seed data please be patient!');

        Promise.all(promises).then(
            function () {
                if(!self.start)
                    self.exit('Succesfully processed (' + promises.length + ') seed actions.\n');
                else
                    $$LOG.console.info('Succesfully processed (' + promises.length + ') seed actions.\n');
            }
        );
    }
};

/**
 * Returns information about the Stukko instance and application loaded.
 * @param {string} [key] - when key is passed returns only that key of the info object.
 */
Stukko.prototype.diagnostics = function diagnostics(key) {

	var	self = this,
		ver = utils.helpers.getVersion(this.pkgapp.dependencies.stukko),
		info = '',
		newline = '\n',
		spacer = '   ',
		proc,
		oper;

	if(!this.pkgapp)
		throw new Error('Unable to load application package. Try cd /path/to/your/application then run stukko info again.');

	proc = this.diag.get(null).process;
	oper = this.diag.get(null, ['cpus', 'network']).os;
	ver = ver === 'master'? 'git master' : ver || 'Unknown';

	info += '\nSTUKKO DIAGNOSTICS\n===============================================================\n\n';
	info += 'Application';
	info += newline + spacer + 'Stukko: ver ' + this.pkg.version;
	info += newline + spacer + 'Application: ' + this.pkgapp.name;
	info += '\n\nProcess';

	_.forEach(proc, function (v,k){
		if(_.contains(['memory', 'heap total', 'heap used'], k))
			v = self.diag.format(v);
		info += newline + spacer + k + ': ' + v;
	});

	info += '\n\nSystem';
	_.forEach(oper, function (v,k){
		if(_.contains(['total memory', 'free memory', 'used memory'], k))
			v = self.diag.format(v);
		info += newline + spacer + k + ': ' + v;
	});

	console.log(info);
    process.exit(0);

};

/**
 * Displays Stukko help.
 */
Stukko.prototype.help = function help() {

    var	helpStr = '',
        nl = '\n',
        spacer = '   ';
    require('colors');
    helpStr += '\nSTUKKO HELP\n===============================================================\n\n';
    helpStr += 'Usage: stukko <command>\n';
    helpStr += nl + 'where <command> is listed below:\n';
    helpStr += nl + spacer + 'start:     '.green + ' starts an application. (alias: run)';
    helpStr += nl + spacer + 'create:    '.green + ' creates a new application. (alias: new)';
    helpStr += nl + spacer + 'seed:      '.green + ' runs seed data against your database. (alias: populate)';
    helpStr += nl + spacer + 'template:  '.green + ' copies boilerpalate to area in application (alias: boiler, boilerplate, area)';
    helpStr += nl + spacer + 'install:   '.green + ' convenience wrapper to npm (same as npm install).';
    helpStr += nl + spacer + 'uninstall: '.green + ' convenience wrapper to npm (same as npm uninstall).\n';
    //helpStr += nl + spacer + 'upgrade:   '.green + ' upgrades an application to latest version.\n';
    //helpStr += nl + spacer + 'backup:    '.green + ' backs up application by specified location.';
    //helpStr += nl + spacer + 'restore:   '.green + ' restores application by specified location.';
    helpStr += nl + spacer + 'checkout:  '.green + ' checkout master or release from source repository.\n';
    helpStr += nl + spacer + 'diag:      '.green + ' returns application information and diagnostics.';
    helpStr += nl + spacer + 'processes: '.green + ' lists all Node processes, hand for ADDRESS IN USE error.\n';
    helpStr += nl + spacer + 'kill:      '.red +   ' kills a node process or all processes.';
    helpStr += '\n\nVisit http://www.stukkojs.com. for additional documentation.';
    helpStr += '\nControl C to shutdown your application.';
    console.log(helpStr);
    process.exit(0);
};

/**
 * Kill the current process or all if true is passed.
 * Use caution with this command.
 * @params {boolean|number} pid - if true kills all node processes.
 */
Stukko.prototype.kill = function kill(pid) {

    var child,
        hasErr = false;
    pid = pid || this.flags.pid || this.flags.all;


	// if no pid kill the current process.
    function handleChild(err, stdout, stderr) {
        if(err || stderr){
            var msg = err ? err.message || 'Unknown exception' : stderr.message || 'Unknown exception.';
            hasErr = true;
            $$LOG.error(msg);
        }
    }

	if(!pid){
		$$LOG.info('Killing process: ' + process.pid);
		process.kill(process.pid, 'SIGINT');

	} else {

		if(pid === true) {
			$$LOG.console.info('Killing all node processes.');
			if(this.platform === 'win32')
				child = childProc.exec('taskkill /F /IM node.exe', handleChild);
			else
				child = childProc.exec('killall node', handleChild);
		} else {
			$$LOG.info('Killing process: ' + process.pid);
			process.kill(pid, 'SIGINT');
		}
	}

    // make sure the child is killed.
	child.on('close', function () {
		child.kill();
	});
};

/**
 * Displays active node processes.
 */
Stukko.prototype.processes = function processes() {

	var self = this,
        hasErr = false,
		child;
    function handleChild(err, stdout, stderr) {
        if(err || stderr){
            var msg = err ? err.message || 'Unknown exception' : stderr.message || 'Unknown exception.';
            hasErr = true;
            $$LOG.error(msg);
        }
    }

	if(self.platform === 'win32'){
		child = childProc.exec('tasklist /fi "imagename eq node.exe"', handleChild);
	} else {
		child = childProc.exec('ps aux | grep node', handleChild);
	}
	child.on('close', function () {
		child.kill();
	});
};

/**
 * Wrapper for Git.
 * @param {string} cmd - the git command ex: 'commit', 'push', 'pull' etc.
 * @param {array|string} args - the additional flags and arguments.
 */
Stukko.prototype.git = function git(cmd, args) {
    var git = utils.git.call(this),
        validCmds = this.gitCommands,
        gitCmd,
        isGeneric;

    if(cmd && cmd === 'git') isGeneric = true;
    gitCmd = cmd || this.ocmd;

    // if command passed was "git"
    // the next command is the git command.
    if(gitCmd === 'git'){
        // if calling from cli could
        // already be set as generic.
        if(isGeneric)
            gitCmd = 'generic';
        else
            gitCmd = this.commands[1];
        gitCmd = 'git-' + gitCmd;
        isGeneric = true;
    }

    // just prevents unhandled error.
    gitCmd = gitCmd || 'git-invalid';

    if(_.contains(['git-cred', 'git-login'], gitCmd))
        gitCmd = 'git-credentials';

    if(gitCmd !== 'git-generic' && validCmds.indexOf(gitCmd) === -1){
        $$LOG.warn('Unable to process git command ' + cmd + '.\nSee git docs for commands at ' +
            'http://git-scm.com/docs.\nStukko command ex git-<command>.' +
            '\n\nThe following commands are supported:\n\n' + validCmds.join(', '));
        process.exit(0);
    }

    // strip out 'git-' from gitCmd;
    gitCmd = gitCmd.split('-')[1];

    if(!_.contains(['commit', 'pull', 'credentials', 'help', 'generic'], gitCmd)){
        return $$LOG.console.warn(gitCmd + ' is a future implementation.');
        self.exit(0);
    }


    // if generic pass cmd and args.
    if(isGeneric){
        $$LOG.console.warn('Git generic has been deprecated please use git directly.');
        //if(gitCmd === 'generic')
            //gitCmd = undefined;
        //git.generic(gitCmd, args);
    } else {
        git[gitCmd](args);
    }

};
