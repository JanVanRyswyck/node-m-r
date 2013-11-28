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





// module.exports = MessageBus;
// function MessageBus() {
// 	this._eventHandlers = [];
// };

// MessageBus.prototype.registerEventHandler = function(eventHandler) {
// 	this._eventHandlers.push(eventHandler);
// };

// MessageBus.prototype.publish = function(domainEvent) {
// 	this._eventHandlers.forEach(function(eventHandler) {
// 		process.nextTick(function() {
// 			eventHandler.write(domainEvent);	
// 		});
// 	});
// };