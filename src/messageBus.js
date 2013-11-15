module.exports = MessageBus;

function MessageBus() {
	this._eventHandlers = [];
};

MessageBus.prototype.registerEventHandler = function(eventHandler) {
	this._eventHandlers.push(eventHandler);
};

MessageBus.prototype.publish = function(domainEvent) {
	this._eventHandlers.forEach(function(eventHandler) {
		process.nextTick(function() {
			eventHandler.write(domainEvent);	
		});
	});
};