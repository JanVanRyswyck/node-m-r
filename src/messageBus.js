'use strict';

var messageBus = (function() {
	var _this = {},
		_eventHandlers = [];

	_this.registerEventHandler = function(eventHandler) {
		_eventHandlers.push(eventHandler);
	};

	_this.publish = function(domainEvent) {
		_eventHandlers.forEach(function(eventHandler) {
			process.nextTick(function() {
				eventHandler.write(domainEvent);	
			});
		});
	};

	return _this;
})();

module.exports = messageBus;