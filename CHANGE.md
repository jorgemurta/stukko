#Change Log

### August 7, 2014
- move assets.framework to assets.bundle.framework to better support general concatenation & browserify.
- moved browserify support from within "framework" to bundle.
- removed backup/restore just not needed as anticipated.
- all assets other than link now support enable/disable of watch rather than globally.
- update gulp file change "framework" task to generic "bundle".

### August 3, 2014
- add browserify support.

###July 17, 2014
- resolve issue where all defaults were not merged.
- ensure that seeds run only when models are present. Excludes Redis and Dirty.

###July 16, 2014
- fix issue where model associations were not created when using Sequelize.
- add ability to seed data after model creation during development.
- update several README.md files.
- add feature where any flag passed on start can temporarily overwrite running config.
- change model creation for Sequelize.
- simplified initial config options.
- add feature where any config option can be toggled, saved on start from command line.

###July 3, 2014 
- Add hook to allow user app to create own command line methods.
- Change assets builder to use Node spawn instead of fork.
- Set assets when debugging to use different port so debugging works properly.
- Change commands to object over simple array for filtering.
- Change order of events on boot to make db connection accessible to user CLI.
- Make Lodash global its used everywhere.
- Remote upgrade features and updates folder, need to revisit at another time.
- Add feature to pull updates directly from git master. see "stukko checkout".

###June 31, 2014
- Remove upgrade until future release.
- Temporarily remove version checking. Will be added back in next version.
- Remove setpath feature. Too many options per distro etc.
- Remove gulp-watch. Does not pipe stream correctly for html compression. Use regular gulp.watch for now.
- Updated server.js to support .on('ready') listener that is now required before calling .listen().

###June 30, 2014
- Fix bug where node_modules were not installed to create directory.
- Add "setPath" method to set NODE_PATH variable for resolving Global modules.
- Fix issue where debugging failed when gulp/assets build.
- Change bootstrap to Event Emitter & listeners.
- Add --all flag to remove all files in application ex: "stukko uninstall --all".
- Add method to backup project (excludes node_modules folder) ex: "stukko backup" (uses backup property in config)
or "stukko backup /path/to/dir"
- Add restore method to restore backup. ex: "stukko restore" or "stukko restore /path/to/backup"
- Fixed issue where deprecated warning was shown for express-session. For existing apps please update your
development.json file within the session options with "resave": true, "saveUninitialized": true.

###June 22, 2014
- Moved management to external module stukko-manage.
- Remove all management dependencies from project.
- Update README.md
- Change version-ing for more consistency.
- Add npm wrappers for install, uninstall and update.

###June 21, 2014
- Removed support for MySQL directly in favor of succinct solution using [Sequelize](http://sequelizejs.com/)
- Add connect-session-sequelize for supporting sessions.
- Removed regexp from inject.js which was improperly filtering certain routes, need to revisit. Caused errors not to be handled correctly.
- Change Gulp logging to only report "Finished" tasks only showing start also was merely taking up console space with little benefit.
- Remove connect-mongo, connect-redis, connect-mysql and connect-sequelize. Must be installed by user in project.