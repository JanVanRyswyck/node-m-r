var util = require('util');
var EventEmitter = require('eventemitter2').EventEmitter2;

var AggregateRoot = exports.AggregateRoot = function(id) {
	this._id = id;
	this._eventVersion = 0;
	this._transientEvents = [];

	EventEmitter.call(this);
};

util.inherits(AggregateRoot, EventEmitter);

AggregateRoot.prototype.apply = function(eventName, eventBody) {
	var domainEvent;

	this._eventVersion += 1;
	domainEvent = createDomainEvent(eventName, this._eventVersion, eventBody);

	this._transientEvents.push(domainEvent);
	this.emit(domainEvent.__name, domainEvent.__body);
};

AggregateRoot.prototype.loadFrom = function(domainEvents) {
	var indexOfLastDomainEvent = domainEvents.length - 1;

	domainEvents.forEach(function(domainEvent) {
		this.Emit(domainEvent.__name, domainEvent.__body);
	});

	_eventVersion = domainEvents[indexOfLastDomainEvent].__version;
}

function createDomainEvent(name, version, body) {
	return {
		__body: body,
		__name: name,
		__version: version
	};
}




var InventoryItem = function(id, name) {
	var _name;

	AggregateRoot.call(this, id);

	this.on('InventoryItemCreated', function(inventoryItemCreated) {
		_name = inventoryItemCreated.name;
	});

	this.apply('InventoryItemCreated', {
		id: id,
		name: name
	});
};

util.inherits(InventoryItem, AggregateRoot);

// This function should be exported
var create = function(id, name) {
	return new InventoryItem(id, name);
};

// Command handler code
var inventoryItem = create(121, 'Something');	// TODO Jan: GUID!!