'use strict';

var express = require('express'),
	http = require('http'),
	path = require('path'),
	_ = require('lodash'),
	configure = require('./configure'),
	utils = require('../utils/index'),
	commands = require('./commands'),
	readline = require('readline'),
	mware = require('./middleware'),
	diag = require('./diag'),
	Db = require('./db');

module.exports = Stukko;

/**
 * Stukko instance, options passed overwrite options.json options.
 * @class Stukko
 * @param {object|string} [options] - options for initializing server see constructor source for options.
 * @param {string} [config] - the directory of the config to load. default is used if not specified.
 * @constructor
 */
function Stukko(options, config) {

	if(Stukko.instance)
		return Stukko.instance;

	var self = this,
		cwd = process.cwd();
	if(!this)
		throw new Error('Stukko must be instantiated with new Stukko()');
    this.pid = process.pid;                                             // get the process id for the current process.
	this.directory = path.basename(cwd);                                // working directory name.
	this.debug = typeof(v8debug) === 'object';                          // application is debugging.
	this.utils = utils;                                                 // make utilities accessible in instance.
	this.rootdir = path.join(__dirname, '../../');                      // the root directory of stukko.
	this.cwd = cwd;                                                     // the current working directory.
	this.pkg = undefined;                                               // stukko package.json
	this.pkgapp = undefined;                                            // the application package.json.
	this.platform = process.platform;                                   // the platform stukko is running on.
	this.diag = diag.call(this);                                        // calling .get() returns current diagnostics.
	this.log = {};                                                      // winston loggers.
	this.config = 'development';                                        // the loaded config name.
	this.listening = false;                                             // Stukko's listening state.
	this.exiting = false;                                               // Stukko's exit state.

	this.app = express();                                               // the express instance.
	this.server = undefined;                                            // express server populated on listen.
	this.express = express;                                             // express lib for creating routers etc.
	this.router = express.Router();                                     // the express router.
	this.sessionStore = undefined;                                      // the store for web sessions.
	this.origins = undefined;                                           // whitelisted array of origins. ignored if cors is disabled or origins is undefined. ex: ['http://mydomain.com'].
	this.connections = [];                                              // stores http connections to server.
	this.maxConnections = 50;                                           // maximum allowed connections.
	this.modules = {};                                                  // container for required modules.
	this.children = [];                                                 // child workers e.g. gulp.

	this.options = {
		version: undefined,
		env: process.env.NODE_ENV || 'development',                     // the environment to load.
		browser: false,                                                 // on start/listen opens browser.
		host: process.env.IP || process.env.HOSTNAME || 'localhost',    // the host for the server. some common env vars are provided remove in config as desired.
		port: process.env.PORT || process.env.VCAP_APP_PORT || 1337,    // the port the server is to listen on. some common env vars are provided remove in config as desired.
		ssl: undefined,                                                 // ssl is an object consisting of { '/key: 'path/to/key', cert: '/path/to/cert' }
		statusErrors: true,                                             // when true handlers are added to the stack to catch errors that are thrown and catch 404 when pages not found.
		manage: false,
		sync: {                                                         // this only used in the development of stukko.
			dest: '../stukko/lib/structure',
			paths: [
				'!./server/configuration**/*.*',
				'!./web/**/*.*',
				'./server/**/*.*',
				'./manage/**/*.*',
				'./nodemon.json',
				'./server.js',
				'./gulpfile.js'
			]
		},
		db: {
			module: 'dirty',                                            // the module to use for database.
			modelCase: 'capitalize',                                    // the casing of the get name options are 'capitalize, upper, lower, camel, pascal'.
			connect: true                                               // when true creates/opens default connection otherwise only returns db client for custom connections or multiple connections.
		},
		assets: {                                                       // if defined manages assets, compiles less, concat, minify etc.
			clean: {                                                    // cleans destination directories prior to build.
				exclude: []
			},
			watch: true,                                                // enables watching files for rebuild.
			backup: true,                                               // when true will backup css and js public directories prior to processing.
			html: {                                                     // set to false to disable. set to object with options see:https://www.npmjs.org/package/html-minifier
				exclude: [                                              // markup wrapped with <!-- htmlmin:ignore --> will be ignored by html minification.
				],
				src: ['./web/assets/views/**/*.html'],
				dest: './web/views',
				ignorePath: ['/views'],
				collapseWhitespace: true
			},
			link: {                                                     // see https://github.com/klei/gulp-inject for full options including starttag, endtag & transform if not using.
				common: {
					exclude: [
						"!./web/public/css/errors.css",
						"!./web/public/css/default.css",
						"!./web/public/js/app.js"
					],
					ignorePath: [
						"/web/public"
					],
					files: [
						"./web/public/css/mixin.css",
						"./web/public/js/mixin.js",
						"./web/public/css/**/*.css",
						"./web/public/js/**/*.js"
					],
					starttag: "<!-- inject:common:{{ext}} -->",
					endtag: "<!-- endinject -->"
				},
				application:{
					exclude: [],
					ignorePath: [
						"/web/public"
					],
					files: [
						"./web/public/css/default.css",
						"./web/public/js/app.js"
					],
					starttag: "<!-- inject:application:{{ext}} -->",
					endtag: "<!-- endinject -->"
				}
			},
			mixin: {
				src: ['./web/assets/mixin/**/*.css', './web/assets/mixin/**/*.js'],
				concat: ['mixin.css', 'mixin.js'],
				dest: ['./web/public/css', './web/public/js']
			},
			minify: {
				src: ['./web/assets/minify/**/*.css', './web/assets/minify/**/*.js'],
				dest: ['./web/public/css', './web/public/js']
			},
			preprocess: {
				src: ['./web/assets/preprocess/*.less', './web/assets/preprocess/*.sass'],
				dest: ['./web/public/css', './web/public/css']
			},
			framework: {
				src: ['./web/assets/framework/**/*.js'],
				concat: ['app.js'],
				dest: ['./web/public/js'],
				minify: false
			}
		},
		logs: {
			path: '/logs',                                              // the directory for logs
			level: 'info',                                              // the default level for logging.
			transports: undefined                                       // transports are passed as object ex: file: { level: 'info', prettyPrint: true }.
		},
		express: {
			layout: 'layout',                                           // the directory of the default html layout, usually 'layout' or 'index'.
			engine: 'hogan',                                            // the consolidate engine to use for rendering.
			'view engine': 'html',                                      // the engine extension for views.
			views: '/web/views',                                        // location for views.
			'jsonp callback name': 'callback'                           // the directory for jsonp callbacks.
		},
		modules: {
			security: '/server/security',
			middleware: '/server/middleware',
			handlers: '/server/handlers',
			models: '/server/models',
			controllers: '/server/controllers',
			routes: '/server/routes',
			services: '/server/services'
		},
		middleware: {
			logger: { use: 'morgan' },
			bodyParser: { use: 'body-parser' },
			cookieParser: { use: 'cookie-parser' },
			session: { use: 'express-session', options: { name: 'memory'} },
			methodOverride: { use: 'method-override' },
			csrf: { use: 'csurf', enabled: false },
			cors: { use: 'cors', enabled: false },
			i18n: { use: 'i18n', enabled: false },
			"public": { use: express.static, options: '/web/public' },    // NOTE: changing path will require changing asset paths above to match!!
			views: { use: express.static, options: '/web/views' },
			favicon: { use: 'serve-favicon', options: '/web/public/img/shared/favicon.ico' },
			inject: { use: '{{internal}}/middleware/inject' }
		}
	};

	// call configure applying context.
	this.configure = configure.apply(this, arguments);
	// parse any command line args.
	this.commands = commands.call(this);
	// return for chaining.
	// set instance.
	Stukko.instance = this;
	return this;
}

/**
 * Initialize Stukko.
 * @params {function} cb - callback once initialized.
 */
Stukko.prototype.init = function init(cb) {

	var self = this,
		configure = this.configure,
		verCompare;
		if(this.cli && this.cmd !== 'start'){
			// get our logger
			configure.loggers();
			// catch uncaught exceptions;
			configure.uncaughtException();
			// get our packages.
			configure.packages();
			if(cb) cb();

	} else {

		// get our packages.
		configure.packages();
		// before continuing make sure we have a valid app/version
		if(!this.pkgapp && !this.options.test)
			throw new Error('Please verify ' + this.cwd + ' contains a package.json file and that it is valid.');
		if (!this.options.test){
			var ver;
			if(!this.pkgapp.dependencies || !this.pkgapp.dependencies.stukko)
				throw new Error('Invalid Stukko application. The package.json loaded does not contain a "Stukko" dependency.');
			ver = utils.helpers.getVersion(this.pkgapp.dependencies.stukko);
			// if stukko is pulled from git master don't version check.
			if(ver !== 'master'){
				if(!ver)
					throw new Error('Stukko version could not be obtained from package. Verify your dependencies include stukko: "version" ');
				verCompare = utils.helpers.compareVersions(this.pkg.version, ver);
				// there is a version mismatch.
				if(verCompare !== 0){
					if(verCompare < 0)
						throw new Error('Stukko attempted to start using version ' + ver + ' but ' + this.pkg.version + ' is required. The application must be upgraded to run using this version of Stukko.');
					if(verCompare > 0)
						throw new Error('The application requires version ' + ver + '. Update Stukko to the required version to run this application.');
				}
			}

		}

		// merge default options, stukko.json and any options passed.
		configure.options();
		// normalize all urls prefixing with cwd.
		// must be called after merge.
		configure.paths();
		// configure our loggers.
		configure.loggers();
		// now that we have our options/log handle uncaught exceptions.
		configure.uncaughtException();
		// initialize database configuration.
		configure.database(function () {
			// use require to load module exports.
			configure.modules();
			// update application settings.
			configure.express();
			// configures management app.
			// TODO work on managment interface later, tabled for now, remove packages (cap, windows-cpu, ip & usage).
			if(self.options.manage)
				configure.management();
			// add middleware
			configure.middleware();
			// add routes.
			configure.routes();
			log.debug('Configuration complete starting the server.');
			configure.assets(function () {
				if(cb) cb();
			});
		});
	}
};

/**
 * Expose database client, connection events publicly.
 * @returns {*}
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
 */
Stukko.prototype.listen = function listen(port, host, cb) {
	var self = this,
		options = this.options,
		ssl = options.ssl,
		server,
		logo;
	if(this.starting) return;
	this.starting = true;
	// get the ascii logo.
	logo = utils.io.read(this.rootdir + '/lib/core/icon.txt');
	// allow passing callback as first arg.
	if(_.isFunction(port)){
		cb = port;
		port = undefined;
	}
	if(_.isFunction(host)){
		cb = host;
		host = undefined;
	}
	options.host = host || options.host;
	options.port = port || options.port;
	log.debug('Creating http/https server.');
	if(ssl){
		if(!ssl.cert || !ssl.secret)
			throw new Error('Invalid ssl configuration. SSL requires both certificate and secret.');
		ssl.cert = utils.io.read(ssl.cert);
		ssl.secret = utils.io.read(ssl.secret);
		var https = require('https');
		server = https.createServer(ssl, this.app);
	} else {
		server = http.createServer(this.app);
	}

	// set maxConnections
	server.maxConnections = this.maxConnections;
	// when server is listening listen for shutdown/termination.
	server.on('listening', function () {

		self.listening = true;
		log.debug('\nConfiguring listeners for process signals.');
		if(self.platform === 'win32'){
			var line = readline.createInterface({
				input: process.stdin,
				output: process.stdout
			});
			line.on ("SIGINT", function (){
				process.emit('SIGINT');
			});
		}
		process.on('SIGINT', function() {
			self.shutdown();
		});
		process.on('SIGTERM', function() {
			self.shutdown();
		});

	});
	
	server.on('connection', function (connection){

		// too many connections destroy.
		// although express is also set to maxConnections
		// handle warnings/monitor connections manually.
		if(self.connections.length + 1 > self.maxConnections){
			log.warn(connection.remoteAddress || 'Unknown' + ' - connection was destroyed. Maximum connections exceeded.');
		} else {
			// save the connection to get.
			self.connections.push(connection);
			log.debug('Connections: ' + self.connections.length + ' Max Connections: ' + self.maxConnections);
			connection.on('close', function () {
				self.connections.splice(self.connections.indexOf(connection), 1);
			});
		}

	});

	log.debug('Listen for server connections.');
	server.listen(this.options.port, this.options.host, function () {

		var session = self.options.middleware.session,
			ver = utils.helpers.getVersion(self.pkgapp.dependencies.stukko);
		if(ver === 'master')
			ver = 'git master';
		console.log(logo);
		log.console.info('Stukko: ver ' + ver);
		log.console.info('Application [' + self.pkgapp.name + '] has started successfully.');
		if((session.enabled || undefined === session.enabled) && session.options.name)
			log.console.info('Session Store: ' + self.options.middleware.session.options.name);
		log.console.info('Database Engine: ' + self.options.db.module);
		log.console.info('Visit http://' + options.host + ':' + options.port + ' in your browser.\n');

		if(self.db && self.db.connected)
			log.info(utils.helpers.stringToCase(self.options.db.module) + ' database [' + self.options.db.options.database + '] ' +
				'has successfully connected.');

		// log to file only that app started.
		log.file.info('Application [' + self.pkgapp.name + '] started at http:// ' + options.host + ':' + options.port );

		if(self.options.browser)
			utils.goto('http://' + options.host + ':' + options.port);

		self.starting = false;
		if(_.isFunction (cb)){
			cb.call(self);
		}

	});

	// save to obj instance.
	this.server = server;
	return this;

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
	if(this.exiting) return;
	this.exiting = true;
	console.log(' ');
	log.debug('Server shutdown emitted.');
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
	} else {
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
		// close database connection.
		if(this.db) {
			log.console.info('Disconnecting ' + self.options.db.module + ' database ' + self.options.db.options.database || '');
			self.db.destroy(function(err) {
				if(err)
					log.error(err);
			});
		}
		// slight timeout can prevent minor errors when closing.
		setTimeout(function () {
			server.close(function (arg) {
				log.info('[' + self.directory + '] shutdown successfully.');
				if(msg)
					log[msgType](msg);
				exit(code);
			});
		},500);
	}
};

/**
 * Kill the current process or all if true is passed.
 * Use caution with this command.
 * @params {boolean} all - if true kills all node processes.
 */
Stukko.prototype.kill = function kill(all) {
	if(!all){
		log.info('Killing process: ' + process.pid + ' for application [' + this.directory + '].\n      This will ' +
			'immediately halt the application. A restart will be required.');
		process.kill(process.pid, 'SIGINT');
	} else {
		var childProc = require('child_process');
		log.console.info('Killing all node processes.');
		if(this.platform === 'win32')
			childProc.exec('taskkill /F /IM node.exe');
		else
			childProc.exec('killall node');
	}
};

/**
 * Wrapper to npm to better facilitate install, update, uninstall with Stukko.
 * @param {string} cmd - the name of the npm command. (install, update, uninstall).
 */
Stukko.prototype.npm = function (cmd) {
	var self = this,
		npm = utils.npm.call(this),
		npmConfig = this.flags,
		commands = _.clone(this.commands).slice(1, this.commands.length),
		modules = [];
	if(cmd === 'uninstall' || cmd === 'update')
		npmConfig.save = true;
	if(!this.pkgapp){
		log.warn('Oops doesn\'t look like there\'s anything to do. Are you sure this is a Stukko application?');
		return;
	}
	_.forEach(this.pkgapp.dependencies || [], function (v,k) {
		if(cmd === 'install')
			modules.push(k + '@' + v);
		else
			modules.push(k);
	});
	// if specific modules were passed use instead of all listed dependencies.
	if(commands.length)
		modules = commands;
	function removeAll() {
		log.info('Removing directory files.');
		utils.io.removeFiles(self.cwd);
		log.warn('All files in the directory have been removed! \n      However the directory folder must be ' +
			'removed manually.');
	}
	npm[cmd](modules, npmConfig, function (err, data) {
		if(err) {
			log.error(err.message, err.stack);
		} else {
			log.info(cmd + ' of (' + modules.length + ') module(s) was successfull.');
			if(self.flags.all && cmd === 'uninstall'){
				removeAll();
			}
		}
	});
};

/**
 * Creates a new Stukko application.
 */
Stukko.prototype.create = function create() {

	var self = this,
		npm = utils.npm.call(this),
		packages = [],
		dependencies = [
			'gulp',
			'gulp-if',
			'gulp-watch',
			'yargs',
			'event-stream',
			'gulp-clean',
			'gulp-concat',
			'gulp-inject',
			'gulp-uglify',
			'gulp-cssmin',
			'gulp-less',
			'gulp-sass',
			'gulp-html-minifier'
		],
		npmConfig = this.flags || {},
		pkg, name, appPath, structure, manage;

	// get the app name, the path and the dir for the new app file structure.
	name = this.commands[1] || undefined;
	appPath = this.flags.path || this.cwd + '/' + name;
	structure = this.rootdir + '/lib/structure';
	manage = this.flags.manage;
	npmConfig.save = true;

	// get the default app package.
	pkg = utils.helpers.tryParseJson(utils.io.read(structure + '/package.json'));
	if(!name)
		throw new Error('Stukko was unable to create the application with name: undefined. ex: stukko create todos');
	if(!pkg)
		throw new Error('Unable to load template package.json. Verify the template exists or reinstall Stukko.');
	if(utils.io.exists(appPath) && !this.flags.overwrite)
		throw new Error('Application path already exists. Backup and delete the directory or use the --overwrite option.');
	// set platform tools if windows.
	if(this.platform === 'win32')
		npmConfig.msvs_version = (this.flags.msvs_version || 2012);
	// set dependencies and name.
	pkg.name = name;
	_.forEach(dependencies, function (d) {
		var dependency = self.pkg.devDependencies[d] || self.pkg.dependencies[d];
		pkg.dependencies[d] = dependency;
		packages.push(d + '@' + dependency);
	});
	// copy file app structure.
	utils.io.copy(structure, appPath, function (err) {
		var gitPath = 'https://origin1dev:dev4origin1@github.com/origin1tech/stukko/archive/' + self.pkg.version + '.tar.gz';
		delete pkg.dependencies.stukko; // shouldn't exist but in case.
		packages.push(gitPath);
		pkg.dependencies.stukko = gitPath;
		if(!err){

			if(!manage && utils.io.exists(appPath + '/manage'))
				utils.io.remove(appPath+  '/manage', function(err) {
					if(err)
						log.error(err);
				});
			// save the updated package.
			utils.io.write(appPath + '/package.json', JSON.stringify(pkg, null, '\t'));
			// install npm packages.
			npm.install(packages, npmConfig, function (err, data) {
				if(err) {
					log.error(err);
					throw new Error('Stukko was unable to auto install npm packages.' +
						'\n       Option 1: run npm cache clean then run create again with the --overwrite flag.' +
						'\n       Option: 2: Install manually by cd /to/your/app/path then run npm install.' +
						'\n       Windows Users: you may need to specify the --msvs_version=2012 for packages requiring node-gyp.' +
						'\n       ex: stukko create appName --msvs_version=2012 where 2012 is your version of Visual Stuido.\n');
				}
				// show success message.
				log.info('\n[' + name + '] was successfully created.');

			});
		}
	});

};

/**
 * Returns information about the Stukko instance and application loaded.
 * @param {string} [key] - when key is passed returns only that key of the info object.
 */
Stukko.prototype.info = function info(key) {

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

	info += '\nINFO\n===============================================================\n\n';
	info += 'Application';
	info += newline + spacer + 'Stukko: ver ' + ver;
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
};

/**
 * Displays Stukko help.
 */
Stukko.prototype.help = function help() {

	var	help = '',
		newline = '\n',
		spacer = '   ';
	help += '\nHELP\n===============================================================\n\n';
	help += 'Usage: stukko <command>\n';
	help += newline + 'where <command> is listed below:';
	help += newline + spacer + 'start: starts an application. (alias: run)';
	help += newline + spacer + 'create: creates a new application. (alias: new)';
	help += newline + spacer + 'info: returns application information and diagnostics.';
	help += newline + spacer + 'help: shows help information and commands.';
	help += '\n\nOptions: to view further command options visit http://www.stukkojs.com.';
	help += '\n\nTo shutdown an application use ctrl C on your keyboard.';
	console.log(help);
};

