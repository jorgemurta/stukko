'use strict';

var app = angular.module('app', [
	'ngRoute',
	'ngSanitize',
	'app.controllers',
	'app.factories'
]);

app.config(function ($routeProvider, $locationProvider) {
	$routeProvider
		.when('/manage/dashboard', { templateUrl: '/manage/dashboard.html', controller: 'DashCtrl' })
		.when('/manage/config/wizard', { templateUrl: '/manage/wizard.html', controller: 'WizardCtrl' })
		.when('/manage/config/editor', { templateUrl: '/manage/editor.html', controller: 'EditorCtrl' })
		.otherwise({ redirectTo: '/'});
	$locationProvider.html5Mode(true);
});

app.run(function ($rootScope) {

//	angular.element(document).ready(function () {
//		$rootScope.confirmModal = new ModalFact({
//			title: 'Confirm Delete',
//			content: 'Are you sure you want to delete this record?',
//			okClass: 'btn btn-danger',
//			okText: 'Delete',
//			closeText: 'Cancel',
//			closeIcon: '<i class="glyphicon glyphicon-remove"></i>'
//		});
//	});

	/* on location change */
	$rootScope.$on('$locationChangeStart', function (event, next, current) {

	});

	/* on location change success */
	$rootScope.$on('$locationChangeSuccess', function (event, next, current) {

	});

	/* on route change */
	$rootScope.$on('$routeChangeStart', function (event, next, current) {

	});

	/* on route success */
	$rootScope.$on('$routeChangeSuccess', function (event, next, current) {

	});

});


angular.element(document).ready(function () {
	angular.bootstrap(document, ['app']);
});
angular.module('app.controllers', [
	'app.controllers.dash',
	'app.controllers.wizard',
	'app.controllers.editor'
]);
var dash = angular.module('app.controllers.dash', []);
dash.controller('DashCtrl', function ($scope) {
});
var editor = angular.module('app.controllers.editor', []);
editor.controller('EditorCtrl', function ($scope) {

});
var wizard = angular.module('app.controllers.wizard', []);
wizard.controller('WizardCtrl', function ($scope) {

});
angular.module('app.factories', [
	'app.factories.menu'
]);
var menu = angular.module('app.factories.menu', []);

menu.factory('MenuFact', function () {
	var factory = {},
		items;
	items = [
		{ name: 'Dashboard' },
		{ name: 'Overview', link: '/manage/dashboard', glyphicon: 'glyphicon-dashboard', active: true },
		{ name: 'Configurator', link: '/manage/config/wizard', glyphicon: 'glyphicon-cog' },
		{ name: 'Editor', link: '/manage/config/editor', glyphicon: 'glyphicon-pencil' }
	];
	factory.get = function (item) {
		if(!item)
			return items;
		if(angular.isNumber(item))
			return items[item];
		return items[items.indexOf(item)];
	};
	return factory;
});

menu.controller('MenuCtrl', function ($scope, MenuFact) {
	$scope.menu = MenuFact.get();
});