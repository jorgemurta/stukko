'use strict';

var fs = require('fs-extra'),
	_ = require('lodash'),
	p = require('path');

module.exports = {

	exists: function exists(path, cb){
		if(cb) {
			fs.exists(path, function (exists) {
				cb(exists);
			});
		} else {
			return fs.existsSync(path);
		}
	},

	resolve: function resolve(path) {
		return p.resolve(path);
	},

	read: function read(path, options, cb) {

		if(!path || !this.exists(path))
			throw new Error ('The requested path could not be found.');

		if(typeof(options) == 'function'){
			cb = options;
			options = undefined;
		}

		options = options || 'utf8';

		if(cb) {
			fs.readFile(path, options, function (err, data) {
				if(err) cb(err);
				else cb(null, data);
			});
		} else {
			return fs.readFileSync(path, options);
		}

	},

	write: function write (path, data, options, cb){

		if(typeof(options) == 'function'){
			cb = options;
			options = undefined;
		}

		options = options || 'utf8';

		if(cb) {
			fs.writeFile(path, data, options, function (err) {
				if(err) cb(err);
				else cb(null);
			});
		} else {
			fs.writeFileSync(path, data, options);
			return true;
		}
	},

	copy: function copy(path, dest, filter, cb) {

		if(_.isFunction(filter)){
			cb = filter;
			filter = undefined;
		}

		//if(!this.exists(path) || !this.exists(dest))
			//throw new Error ('The requested path or destination could not be found.');

		fs.copy(path, dest, filter, cb);
	},

	mkdir: function mkdir(path, mode, cb) {

		if(typeof(mode) == 'function'){
			cb = mode;
			mode = undefined;
		}

		mode = mode || '0777';

		if(cb) {
			fs.mkdir(path, mode, function (err) {
				if(err) cb(err);
				else cb(null, true);
			});
		} else {
			fs.mkdirSync(path, mode);
			return true;
		}
	},

	rename: function rename(path, dest, cb){
		cb = cb || null;

		if(cb) {
			fs.rename(path, dest, function (err) {
				if(err) cb(err);
				else cb(null, true);
			});
		} else {
			fs.rename(path, dest);
			return true;
		}
	},

	require: function require(obj, options) {

		var result = {};

		options = options || {};

		if(_.isString(obj)){
			options.dirname = obj;
			return reqeach(options);
		}

		_.forEach(obj, function(v, k){
			if(_.isString(v)){
				v = dir + v;
				options.dirname = v;
				result[k] = reqeach(options);
			}
		});

		return result;

	}



};