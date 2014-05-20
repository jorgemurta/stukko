'use strict';

var express = require('express'),
	http = require('http'),
	path = require('path'),
	_ = require('lodash'),
	configure = require('./configure'),
	utils = require('../utils/index'),
	commands = require('./commands'),
	readline = require('readline'),
	inject = require('./middleware/inject'),
	os = require('os'),
	diag = require('./diag');

module.exports = Stukko;

/**
 * Stukko instance, options passed overwrite options.json options.
 * @class Stukko
 * @param {object|string} [options] - options for initializing server see constructor source for options. you may also pass a string config directory to load.
 * @param {string} [config] - the directory of the config to load. default is used if not specified.
 * @constructor
 */
function Stukko(options, config) {

	var self = this,
		cwd = process.cwd();

	if(!this)
		throw new Error('Stukko must be instantiated with new stukko(options)');

	this.directory = path.basename(cwd);                                // working directory name.
	this.debug = typeof(v8debug) === 'object';                          // application is debugging.
	this.utils = utils;                                                 // make utilities accessible in instance.
	this.rootdir = path.join(__dirname, '../../');                      // the root directory of stukko.
	this.cwd = cwd;                                                     // the current working directory.
	this.pkg = undefined;                                               // stukko package.json
	this.pkgapp = undefined;                                            // the application package.json.
	this.platform = os.platform();                                      // the platform stukko is running on.
	this.log = {};                                                      // winston loggers.
	this.config = 'development';                                        // the loaded config name.
	this.exiting = false;

	this.app = express();                                               // the express instance.
	this.server = undefined;                                            // express server populated on listen.
	this.express = express;                                             // express lib for creating routers etc.
	this.sessionStore = undefined;                                      // the store for web sessions.
	this.origins = undefined;                                           // whitelisted array of origins. ignored if cors is disabled or origins is undefined. ex: ['http://mydomain.com'].
	this.connections = [];                                              // stores http connections to server.
	this.maxConnections = 50;                                           // maximum allowed connections.
	this.modules = {};                                                  // container for required modules.
	this.children = [];                                                 // child workers e.g. gulp.

	this.options = {
		version: undefined,
		env: process.env.NODE_ENV || 'development',                     // the environment to load.
		browser: true,                                                  // on start/listen opens browser.
		host: 'localhost',                                              // the host for the server.
		port: 9000,                                                     // the port the server is to listen on.
		ssl: undefined,                                                 // ssl is an object consisting of { '/key: 'path/to/key', cert: '/path/to/cert' }
		ignore: [ '^\/.+$' ],                                           // used to build regex for ignoring routes ex: /css/theme.css.
		assets: {                                                       // if defined manages assets, compiles less, concat, minify etc.
			clean: true,                                                // cleans destination directories prior to build.
			test: [],
			link: {                                                     // see https://github.com/klei/gulp-inject for full options including starttag, endtag and transform if not using .html files. set to false to disable linking.
				ignorePath: ['/public']                                 // include any static route prefixes here so they are stripped from your assets.
			},                                                          // the file extension types to link, without the extension.
			watch: true,                                                // enables watching files for rebuild.
			mixin: {
				src: ['./assets/mixin/**/*.css', './assets/mixin/**/*.js'],
				concat: ['mixin.css', 'mixin.js'],
				dest: ['./public/css', './public/js']
			},
			minify: {
				src: ['./assets/minify/**/*.css', './assets/minify/**/*.js'],
				dest: ['./public/css', './public/js']
			},
			preprocess: {
				src: ['./assets/preprocess/*.less', './assets/preprocess/*.sass'],
				dest: ['./public/css', './public/css']
			},
			framework: {
				src: ['./assets/framework/**/*.js'],
				concat: ['app.js'],
				dest: ['./public/js'],
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
			views: '/views',                                            // location for views.
			'jsonp callback name': 'callback'                           // the directory for jsonp callbacks.
		},
		modules: {
			security: '/app/security',
			routes: '/app/routes',
			middleware: '/app/middleware',
			controllers: '/app/controllers',
			helpers: '/app/helpers',
			models: '/app/models'
		},
		middleware: {
			bodyParser: { use: 'body-parser' },
			cookieParser: { use: 'cookie-parser' },
			session: { use: 'express-session', options: { store: 'memory'} },
			methodOverride: { use: 'method-override' },
			csrf: { use: 'csurf', enabled: false },
			cors: { use: 'cors', enabled: false },
			inject: { use: inject },
			staticPublic: { use: express.static, options: '/public' },
			favicon: { use: 'serve-favicon', options: '/public/img/favicon.ico' }
		}
	};

	// call configure applying context.
	this.configure = configure.apply(this, arguments);

	// parse any command line args.
	this.commands = commands.call(this);

	// return for chaining.
	return this;

}

Stukko.prototype.init = function init(cb) {


	var verCompare, configure;
	configure = this.configure;

	if(this.cmd !== 'start'){

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
		if(!this.pkgapp){
			throw new Error('Invalid Stukko application. Please verify ' + this.cwd + ' contains a valid package.json file.');
		} else{
			if(!this.pkgapp.dependencies || !this.pkgapp.dependencies.stukko)
				throw new Error('Invalid Stukko application. The package.json loaded does not contain a "Stukko" dependency.');
			verCompare = utils.helpers.compareVersions(this.pkg.version, this.pkgapp.dependencies.stukko);

			// there is a version mismatch.
			if(verCompare !== 0){
				if(verCompare < 0)
					throw new Error('Stukko attempted to start using version ' + this.pkgapp.dependencies.stukko + ' but ' + this.pkg.version + ' is required. The application must be upgraded to run using this version of Stukko.');
				if(verCompare > 0)
					throw new Error('The application requires version ' + this.pkgapp.dependencies.stukko + '. Update Stukko to the required version to run this application.');
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

		// use require to load module exports.
		configure.modules();

		// update application settings.
		configure.express();

		// add middleware
		configure.middleware();

		// add routes.
		configure.routes();

		// run gulp
		configure.assets();

		debug('Configuration complete start the server.');

		if(cb) cb();

	}

};

/**
 * Creates the http server and listens at the specified host/port.
 * @memberOf Stukko
 * @param {string} [host] - the optional host directory.
 * @param {string} [port] - the optional port.
 * @param {function} [cb] - callback upon listening.
 */
Stukko.prototype.listen = function listen(host, port, cb) {

	var self = this,
		options = this.options,
		ssl = options.ssl,
		server,
		logo;

	// get the ascii logo.
	logo = utils.io.read(this.rootdir + '/lib/core/icon.txt');

	// allow passing callback as first arg.
	if(_.isFunction(host)){
		cb = host;
		host = undefined;
	}

	options.host = host || options.host;
	options.port = port || options.port;

	debug('Creating http/https server.');

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

		if(process.platform === 'win32'){
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
		if(self.connections.length + 1 > self.maxConnections){
			log.warn(connection.remoteAddress || 'Unknown' + ' - connection was destroyed. Maximum connections exceeded.');
		} else {
			// save the connection to collection.
			self.connections.push(connection);
			debug('Connections: ' + self.connections.length + ' Max Connections: ' + self.maxConnections);
			connection.on('close', function () {
				self.connections.splice(self.connections.indexOf(connection), 1);
			});
		}

	});

	debug('Listen for server connections.');

	server.listen(this.options.port, this.options.host, function () {

		console.log(logo);
		log.console.info('Stukko: ver ' + self.pkgapp.dependencies.stukko);
		log.console.info('Application [' + self.pkgapp.name + '] has started successfully.');
		log.console.info('Visit http://' + options.host + ':' + options.port + ' in your browser.\n');

		// log to file only that app started.
		log.file.info('Application [' + self.pkgapp.name + '] started at http:// ' + options.host + ':' + options.port );

		if(self.options.browser)
			utils.goto('http://' + options.host + ':' + options.port);

		if(_.isFunction (cb))
			cb.call(self);

	});

	// save to obj instance.
	this.server = server;

	return this;

};

/**
 * Shutsdown the Stukko server.
 */
Stukko.prototype.shutdown = function shutdown() {

	var self = this,
		server = this.server,
		exit = process.exit;

	if(this.exiting) return;
	this.exiting = true;

	console.log(' ');
	debug('Server shutdown emitted.');

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
		// slight timeout can prevent minor errors when closing.
		setTimeout(function () {
			server.close(function (arg) {
				log.info('[' + self.directory + '] shutdown successfully.');
				exit(0);
			});
		},500);
	}
};

Stukko.prototype.kill = function kill() {
	log.info('Killing process: ' + process.pid + ' for application [' + this.directory + ']. This will immediately halt the application. A restart will be required.');
	process.kill(process.pid, 'SIGINT');
};

/**
 * Creates a new Stukko application.
 */
Stukko.prototype.create = function create() {

	var self = this,
		packages = [],
		dependencies = [
			'gulp',
			'gulp-if',
			'yargs',
			'event-stream',
			'gulp-clean',
			'gulp-concat',
			'gulp-inject',
			'gulp-load-plugins',
			'gulp-uglify',
			'gulp-cssmin',
			'gulp-less',
			'gulp-sass',
			'gulp-ngmin',
			'gulp-rename'
		],
		npmConfig = {},
		pkg, name, appPath, structure;

	// get the app name, the path and the dir for the new app file structure.
	name = this.commands[1] || undefined;
	appPath = this.flags.path || this.cwd + '/' + name;
	structure = this.rootdir + '/lib/structure';

	// get the default app package.
	pkg = utils.helpers.tryParseJson(utils.io.read(structure + '/package.json'));

	if(!name)
		throw new Error('Stukko was unable to create the application with name: undefined. ex: stukko create todos');

	if(!pkg)
		throw new Error('Unable to load template package.json. Verify the template exists or reinstall Stukko.');

	if(utils.io.exists(appPath) && !this.flags.overwrite)
		throw new Error('Application path already exists. Backup and delete the directory or use the --overwrite option.');

	// set platform tools if windows.
	if(os.platform() === 'win32')
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
		// only add stukko if to be installed locally.
		// otherrwise remove it and add to package later.
		if(self.flags.local)
			packages.push('stukko@' + self.pgk.version);
		else
			delete pkg.dependencies.stukko; // shouldn't exist but in case.
		if(!err){

			// save the updated package.
			pkg.dependencies.stukko = self.pkg.version;
			utils.io.write(structure + '/package.json', JSON.stringify(pkg, null, 4));

			// install npm packages.
			utils.npm(packages, appPath, function (err) {

				if(err) {
					log.error(err);
					throw new Error('Stukko was unable to auto install npm packages.' +
						'\nTry installing manually by cd /to/your/app/path then running npm install.' +
						'\nFor Windows users you may need to specify the --msvs_version=2012 ' +
						'\nwhere 2012 is the version of Visual Studio you have installed.' +
						'\nex: stukko create appName --msvs_version=2010.');
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

	var	info = '',
		newline = '\n',
		spacer = '   ',
		d;

	if(!this.pkgapp)
		throw new Error('Unable to load application package. Try cd /path/to/your/application then run stukko info again.');

	d = diag().get();

	info += '\nINFO\n===============================================================\n\n';
	info += 'Application';
	info += newline + spacer + 'Stukko: ver ' + this.pkgapp.dependencies.stukko;
	info += newline + spacer + 'Application: ' + this.pkgapp.name;
	info += '\n\nDiagnostics';

	_.forEach(d, function (v,k){
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


// boolean or object.
// if object (jade example)
// {
//      starttag: '// inject:css',
//      endtag: '// endinject',
//      css: 'link(rel="stylesheet", href="{{file}}")'
// }
// likewise do same for js files.

