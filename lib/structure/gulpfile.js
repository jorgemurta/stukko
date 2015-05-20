'use strict';

// base requires
var argv = require('yargs').argv,
    p = require('path'),
    es = require('event-stream'),
    del = require('del'),
    pkg = require('./package.json'),

// gulp modules.
    gulp = require('gulp'),
    plugins = require('gulp-load-plugins')(),
    gutil = plugins.util,
    PluginError = gutil.PluginError,
    loaded = false,

// vars.
    config,
    src,
    bundles,
    links,
    cleanDests,
    deploy,
    noWatch;

// require module if fails return false.
function tryRequire(moduleName) {
    try{
        return require(moduleName);
    } catch (ex){
        return false;
    }
}

// normalizes to any array.
function normalizeArray(obj, alt){
    if(obj instanceof Array) return obj;
    if(typeof obj === 'string' || obj instanceof String)
        return [obj];
    if(typeof obj === 'boolean')
        return normalizeArray(alt);
    return [];
}

// appends string to glob/paths in array.
function appendPath(arr, append) {
    var tmpArr = [];
    append = normalizeArray(append);
    arr.forEach(function (v) {
        append.forEach(function (a) {
            tmpArr.push(v + a);
        });
    });
    return tmpArr;
}

// iterates array of elements
// removing any duplicates.
function unique(arr, excludes) {
    var prims = {"boolean":{}, "number":{}, "string":{}}, objs = [];
    excludes = excludes || false;
    return arr.filter(function(item) {
        var type = typeof item;
        if(excludes && item.charAt(0) === '!') return false;
        if(type in prims)
            return prims[type].hasOwnProperty(item) ? false : (prims[type][item] = true);
        else
            return objs.indexOf(item) >= 0 ? false : objs.push(item);
    });
}

// iterates bundles and prepares cleaning paths.
function getCleanDests() {
    var bundleKeys = Object.keys(bundles),
        globs = [];
    bundleKeys.forEach(function (k) {
        var bundle = bundles[k],
            arr;
        if(bundle && bundle.clean !== false) {
            if(bundle.clean === undefined) bundle.clean = true;
            arr = normalizeArray(bundle.clean, bundle.dest);
            if(bundle.cleanAppend)
                arr = appendPath(arr, bundle.cleanAppend);
            globs = globs.concat(arr);
        }
    });
    return unique(globs);
}

// get bower main files.
function getBowerMains(jsonPath, compPath, preserve) {
    var deps, arr;
    arr = [];
    jsonPath = jsonPath || 'bower.json';
    compPath = compPath || 'bower_components';
    preserve = preserve === true ? '**' : '';
    function normalizePath(path) {
        return path.replace(/\\/g, '/');
    }
    // if object assume dependencies passed.
    if((jsonPath instanceof Array)) {
        deps = jsonPath;
    } else {
        jsonPath = p.join(process.cwd(), jsonPath);
        var json = tryRequire(jsonPath);
        if(!json || !json.dependencies)
            throw new PluginError('Gulp-Build', 'Unable to load bower dependencies using path ' + jsonPath);
        deps = Object.keys(json.dependencies);
    }
    // iterate and run the paths.
    deps.forEach(function (v) {
        var bowerModule = p.join(process.cwd(), compPath, v, 'bower.json'),
            moduleMain;
        moduleMain = tryRequire(bowerModule).main;
        if((moduleMain instanceof Array)){
            var tmpArr = [];
            moduleMain.forEach(function (m) {
                tmpArr.push('./' + normalizePath(p.join(compPath, preserve, v, m)));
            });
            arr = arr.concat(tmpArr);
        } else {
            arr.push('./' + normalizePath(p.join(compPath, preserve, v, moduleMain)));
        }
    });
    return arr;
}

// Stukko must be run at least once
// before running gulp manually.
// parse the active configuration.
config = tryRequire(p.join(process.cwd(), '/config/active.json'));

// support legacy path.
config = config || tryRequire(p.join(process.cwd(), '/server/configuration/active.json'));

if(!config)
    throw new PluginError('Gulp-Build', 'Active configuration not found. Be sure you run ' +
        'your (run stukko start) app once before running Gulp manually.');
// set assets to var
src = config.assets || config.src;
deploy = src ? src.deploy : undefined;

// make sure we have assets to process.
if(!src || src.enabled === false)
    return console.warn('Asset building is disabled for this application.');

//viewExt = config.express['view engine'] || 'html';
bundles = src.bundle || {};
links = src.link || {};

// bug make sure filter exists.
if(!plugins.filter)
    plugins.filter = require('gulp-filter');

// if watch is suppressed.
noWatch = argv.n || argv.nowatch;

// set clean locations
cleanDests = getCleanDests();

// cleans output paths prior to bundling.
gulp.task('clean', function (cb) {
    // prevent cleaning of main layout.
    var layout = '!.' + config.express.views + '/' + config.express.layout +
        '.' + config.express['view engine'];
    cleanDests = [layout].concat(cleanDests);
    del(cleanDests, cb);
});

// bundles various assets for application.
gulp.task('bundle', ['clean'], function () {

    var keys = Object.keys(bundles),
        tasks = [];

    // nothing to process.
    if(!keys.length) return;

    // transform for Browserify
    function transformify(bundle) {

        var transform = tryRequire('vinyl-transform'),
            source = tryRequire('vinyl-source-stream'),
            buffer = tryRequire('vinyl-buffer');

        if(!transform)
            throw new PluginError('Gulp-Build', 'Plugin not installed, run "npm install vinyl-transform" from console.');

        if(!source)
            throw new PluginError('Gulp-Build', 'Plugin not installed, run "npm install vinyl-source-stream" from console.');

        if(!buffer)
            throw new PluginError('Gulp-Build', 'Plugin not installed, run "npm install vinyl-buffer" from console.');

        bundle.options = bundle.options || {};

        var browserify = tryRequire('browserify');
        if(!browserify)
            throw new PluginError('Gulp-Build', 'Plugin not installed, run "npm install browserify" from console.');

        bundle.options.debug = true;

        return transform(function (filename) {
            var b = browserify(filename);
            if(bundle.transform)
                b.transform(plugins[bundle.transform || 'babel']);
            return b.bundle()
                .pipe(source(bundle.as || 'app.js'))
                .pipe(buffer());
        });

    }

    // iterate keys and run tasks.
    keys.forEach(function(k) {

        var bundle = bundles[k],
            jsFilter,
            cssFilter,
            lessFilter,
            sassFilter,
            htmlFilter,
            srcMaps,
            srcMapsPath,
            task;

        // strategy is required.
        if(!bundle.strategy) return;

        // set some defaults.
        bundle.options = bundle.options || {};

        // predefined filters.
        jsFilter    =  plugins.filter (bundle.filter || '**/*.js');
        cssFilter   =  plugins.filter (bundle.filter || '**/*.css');
        lessFilter  =  plugins.filter (bundle.filter || '**/*.less');
        sassFilter  =  plugins.filter (bundle.filter || '**/*.scss');
        htmlFilter  =  plugins.filter (bundle.filter || '**/*.html');

        // check for valid sourcemap config.
        if(bundle.src && bundle.src[0]) {
            srcMaps = (bundle.src[0].indexOf('.js') !== 1) && bundle.sourcemaps;
            if(srcMaps)
                srcMapsPath = bundle.sourcemaps === true ? '' : bundle.sourcemaps;
        }

        // NOTE: following are required plugins even if
        // not using each of them as it simplifies logic.

        // make sure sourcemaps plugin installed if required.
        if(!plugins.sourcemaps)
            throw new PluginError('Gulp-Build', 'Plugin not installed, run "npm install gulp-sourcemaps" from console.');

        if(!plugins.less)
            throw new PluginError('Gulp-Build', 'Plugin not installed, run "npm install gulp-less" from console.');

        if(!plugins.sass)
            throw new PluginError('Gulp-Build', 'Plugin not installed, run "npm install gulp-sass" from console.');

        if(!plugins.htmlMinifier)
            throw new PluginError('Gulp-Build', 'Plugin not installed, run "npm install gulp-html-minifier" from console.');

        // copy action.
        if(bundle.strategy === 'copy' || bundle.strategy === 'bower') {

            if(bundle.strategy === 'bower'){
                // preserve orig. src.
                var origSrc = bundle.src || [],
                    bowerConf,
                    bowerComps,
                    mains;
                bowerConf = bundle.bowerPath || bundle.jsonPath;
                bowerComps = bundle.componentPath || bundle.bowerComponentsPath;
                bundle.preserveStructure = bundle.preserveStructure !== false;
                mains = getBowerMains(bowerConf, bowerComps, bundle.preserveStructure);
                bundle.src = origSrc.concat(mains || []);
            }

            if(bundle.minify) {

                // ensures that html is minified.
                bundle.options.env = bundle.options.env || 'production';

                task = gulp.src(normalizeArray(bundle.src))

                    // js
                    .pipe(jsFilter)
                    .pipe(plugins.if(srcMaps, plugins.sourcemaps.init()))
                    .pipe(plugins.uglify(bundle.options))
                    .pipe(plugins.if(srcMaps, plugins.sourcemaps.write(srcMapsPath)))
                    .pipe(jsFilter.restore())

                    // css
                    .pipe(cssFilter)
                    .pipe(plugins.cssmin(bundle.options))
                    .pipe(cssFilter.restore())

                    // less
                    .pipe(lessFilter)
                    .pipe(plugins.less(bundle.options))
                    .pipe(plugins.cssmin(bundle.options))
                    .pipe(lessFilter.restore())

                    // sass
                    .pipe(sassFilter)
                    .pipe(plugins.sass(bundle.options))
                    .pipe(plugins.cssmin(bundle.options))
                    .pipe(sassFilter.restore())

                    // html
                    .pipe(htmlFilter)
                    .pipe(plugins.htmlMinifier(bundle.options))
                    .pipe(htmlFilter.restore())

                    .pipe(gulp.dest(bundle.dest));

            }

            else {

                task = gulp.src(normalizeArray(bundle.src))

                    // less
                    .pipe(lessFilter)
                    .pipe(plugins.less(bundle.options))
                    .pipe(lessFilter.restore())

                    // sass
                    .pipe(sassFilter)
                    .pipe(plugins.sass(bundle.options))
                    .pipe(sassFilter.restore())

                    // html
                    .pipe(htmlFilter)
                    .pipe(plugins.htmlMinifier(bundle.options))
                    .pipe(htmlFilter.restore())

                    .pipe(gulp.dest(bundle.dest));

            }
        }

        // concat action.
        if(bundle.strategy === 'concat'){

            // minification only supported by
            // css and js.
            if(bundle.minify) {

                task = gulp.src(normalizeArray(bundle.src))

                    .pipe(plugins.concat(bundle.as, bundle.options))

                    // css.
                    .pipe(cssFilter)
                    .pipe(plugins.cssmin(bundle.options))
                    .pipe(cssFilter.restore())

                    // js.
                    .pipe(jsFilter)
                    .pipe(plugins.uglify(bundle.options))
                    .pipe(jsFilter.restore())

                    .pipe(gulp.dest(bundle.dest));
            } else {

                task = gulp.src(normalizeArray(bundle.src))
                    .pipe(plugins.concat(bundle.as, bundle.options))
                    .pipe(gulp.dest(bundle.dest));
            }
        }

        // browserify action.
        if(bundle.strategy === 'browserify'){

            var browserified = transformify(bundle);

            if(bundle.minify){

                task = gulp.src(normalizeArray(bundle.src))
                    .pipe(browserified)
                    .pipe(plugins.if(srcMaps, plugins.sourcemaps.init({loadMaps: true})))
                    .pipe(plugins.uglify())
                    .pipe(plugins.if(srcMaps, plugins.sourcemaps.write(srcMapsPath)))
                    .pipe(gulp.dest(bundle.dest));

            } else {

                task = gulp.src(normalizeArray(bundle.src))
                    .pipe(browserified)
                    .pipe(plugins.if(srcMaps, plugins.sourcemaps.init({loadMaps: true})))
                    .pipe(plugins.if(srcMaps, plugins.sourcemaps.write(srcMapsPath)))
                    .pipe(gulp.dest(bundle.dest));

            }
        }

        // es6 compile using babel or traceur
        if(bundle.strategy === 'babel' || bundle.strategy === 'traceur'){

            if(!plugins[bundle.strategy])
                throw new PluginError('Gulp-Build', 'Plugin not installed, run "npm install gulp-' +
                    bundle.strategy + '" from console.');

            var compiler = plugins[bundle.strategy];

            if(bundle.minify){

                task = gulp.src(normalizeArray(bundle.src))
                    .pipe(plugins.if(srcMaps, plugins.sourcemaps.init()))
                    .pipe(compiler(bundle.options))
                    .pipe(plugins.uglify())
                    .pipe(plugins.if(srcMaps, plugins.sourcemaps.write(srcMapsPath)))
                    .pipe(gulp.dest(bundle.dest));

            } else {

                task = gulp.src(normalizeArray(bundle.src))
                    .pipe(plugins.if(srcMaps, plugins.sourcemaps.init()))
                    .pipe(compiler(bundle.options))
                    .pipe(plugins.if(srcMaps, plugins.sourcemaps.write(srcMapsPath)))
                    .pipe(gulp.dest(bundle.dest));

            }

        }

        if(bundle.strategy === 'systemjs') {

            var Builder = tryRequire('systemjs-builder');
            var through = require('through2');
            var jspm = pkg.jspm;

            if(!Builder)
                throw new PluginError('Gulp-Build',
                    'Plugin not installed, run "npm install systemjs-builder" from terminal.');

            if(!jspm || !bundle.options)
                throw new PluginError('Gulp-Build', 'jspm configuration invalid ensure jspm property in package.json and valid' +
                    'options in your bundle configuration.');

            var builder = new Builder();
            var buildType = 'build';
            var configFile = jspm.configFile || 'config.js';

            // self executing build.
            if(bundle.sfx)
                buildType = 'buildSFX';

            // get src from either bundle.src or from expression
            // options key within bundle.options.
            var src = bundle.src,
                exp;
            if(bundle.options.expression){
                exp = bundle.options.expression;
                delete bundle.options.expression;
            } else {
                // need to strip out chars for valid expression.
                exp = p.relative(jspm.directories.baseURL, src);
                exp = exp.replace(/\.(js|es6|ts)$/i, '');
                exp = exp.replace(/^[\.]?[\/]?/i, '');
            }
            task = gulp.src(src)
                .pipe(through.obj(function (file, enc, cb) {
                    var self = this;
                    builder.loadConfig(configFile)
                        .then(function() {
                            builder.config({baseURL: p.resolve(jspm.directories.baseURL)});
                            builder[buildType](exp, bundle.options)
                                .then(function (output) {
                                    file.contents = new Buffer(output.source);
                                    self.push(file);
                                    cb();
                                })
                                .catch(function(ex){
                                    console.log(ex);
                                });
                        })
                        .catch(function(ex) {
                            console.log(ex);
                        });
                }))
                .pipe(gulp.dest(bundle.dest));

        }

        // add the tasks to the collection.
        if(task)
            tasks.push(task);

    });

    // concat the event stream and return.
    return es.concat.apply(null, tasks);

});

// links assets after bundling.
gulp.task('link', ['clean', 'bundle'], function () {

    var keys = Object.keys(links),
        tasks = [];

    // nothing to process.
    if(!keys.length) return;

    var layoutRoot = '.' + config.express.views + '/' +	config.express.layout;

    // iterate keys and run tasks.
    keys.forEach(function(k) {

        var link = links[k],
            task,
            layoutDest,
            layout;

        // when to is not specified
        // defaults to layout defined is Express.
        if(!link.to){
            layout = layoutRoot +  '.' + config.express['view engine'];
            link.to = layout;
        }

        // when is not specified specified
        // defaults to views default from Express.
        if(!link.dest){
            layoutDest = layoutRoot.split('/');
            layoutDest = layoutDest.splice(0, layoutDest.length - 1).join('/');
            link.dest = layoutDest;
        }

        // create the task.
        task = gulp.src(link.to)
            .pipe(plugins.inject(gulp.src(normalizeArray(link.src), { read: false }), link.options))
            .pipe(gulp.dest(link.dest));

        tasks.push(task);

    });

    // concat the event stream and return.
    return es.concat.apply(null, tasks);

});

// primary run task
gulp.task('build', ['clean', 'bundle', 'link'], function () {

    // add watches.
    var keys = Object.keys(bundles);

    loaded = true;

    keys.forEach(function (k) {

        var bundle = bundles[k],
            interval = src.livereloadInterval,
            globs;

        if(interval === undefined)
            interval = src.livereloadTimeout !== undefined ? src.livereloadTimeout : 300;

        if(bundle && bundle.watch !== false && !noWatch){
            if(bundle.watch === undefined) bundle.watch = true;
            // just use src if true.
            if(typeof bundle.watch === 'boolean')
                globs = normalizeArray(bundle.src);

            // if string or array normalize and use it.
            if(typeof bundle.watch === 'string' || (bundle.watch instanceof Array))
                globs = normalizeArray(bundle.watch);

            // make sure we actually have globs to be safe.
            if(globs){
                var watcher = gulp.watch(
                    globs,
                    {debounceDelay: 150},
                    ['clean', 'bundle', 'link']
                );
                watcher.on('change', function (changed) {
                    if(!src.livereload) return;
                    var changedPath = p.relative(process.cwd(), changed.path);
                    // start interval only if loaded.
                    if(!loaded) return;
                    var reloadInterval = setInterval(function () {
                        if(gulp.tasks.link.done){
                            clearInterval(reloadInterval);
                            plugins.livereload.changed(changedPath);
                        }
                    }, interval);
                });

            }
        }
    });

    if(!noWatch){
        if(src.livereload)
            plugins.livereload.listen();
    }


});

// bump version
gulp.task('bump', function () {
    gulp.src(['./package.json'])
        .pipe(plugins.bump())
        .pipe(gulp.dest('./'));
});
