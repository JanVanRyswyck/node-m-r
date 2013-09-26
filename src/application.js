var util = require('util');
var EventEmitter = require('eventemitter2').EventEmitter2;

var AggregateRoot = exports.AggregateRoot = function(id) {
	this._id = id;
	this._eventVersion = 0;
	this._transientEvents = [];

	EventEmitter.call(this);
};

util.inherits(AggregateRoot, EventEmitter);

// TODO: Create factory method for creating event objects (or at least review/simplify the signature of the apply function)

AggregateRoot.prototype.apply = function(domainEventName, domainEvent) {
	this._eventVersion += 1;
	domainEvent.__version = this._eventVersion;
	domainEvent.__name = domainEventName;

	this._transientEvents.push(domainEvent);
	this.emit(domainEvent.__name, domainEvent);
};

AggregateRoot.prototype.loadFrom = function(domainEvents) {
	var indexOfLastDomainEvent = domainEvents.length - 1;

	domainEvents.forEach(function(domainEvent) {
		this.Emit(domainEvent.__name, domainEvent);
	});

	_eventVersion = domainEvents[indexOfLastDomainEvent].__version;
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