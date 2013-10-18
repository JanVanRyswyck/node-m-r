var util = require('util'),
	stream = require('stream'),
	EventEmitter = require('eventemitter2').EventEmitter2,
	uuidGenerator = require('node-uuid'),
	_ = require('lodash');

// TODO: Apply Class pattern from Mathias !!
var AggregateRoot = exports.AggregateRoot = function(id) {
	this._id = id;
	this._version = this._eventVersion = 0;
	this._transientEvents = [];

	this._eventEmitter = new EventEmitter();
	stream.Readable.call(this, { objectMode: true });
};

util.inherits(AggregateRoot, stream.Readable);

AggregateRoot.prototype.apply = function(eventName, domainEvent) {
	var domainEvent;

	this._eventVersion += 1;
	enhanceDomainEvent(this, eventName, this._eventVersion, domainEvent);

	this._transientEvents.push(domainEvent);
	this._eventEmitter.emit(eventName, domainEvent);
};

AggregateRoot.prototype.loadFrom = function(history) {
	var indexOfLastDomainEvent = history.length - 1;

	history.forEach(function(domainEvent) {
		this._eventEmitter.emit(domainEvent.name, domainEvent.body);
	});

	_version = _eventVersion = history[indexOfLastDomainEvent].version;
}

AggregateRoot.prototype.onEvent = function(type, listener) {
	return this._eventEmitter.on(type, listener);
};

AggregateRoot.prototype._read = function() {
	if(0 === this._transientEvents.length) {
		this.push(null);
		return;
	}

	var eventStreamObject = {
		aggregateRootId: this._id,
		aggregateRootVersion: this._version,
		domainEvent: this._transientEvents[0]
	}

	this.push(eventStreamObject);
	this._transientEvents.shift();
};

function enhanceDomainEvent(aggregateRoot, eventName, eventVersion, domainEvent) {
	domainEvent.aggregateRootId = aggregateRoot._id;
	domainEvent.eventId = uuidGenerator.v1();
	domainEvent.eventName = eventName;
	domainEvent.eventVersion = eventVersion;
}



//
// InvalidOperationError
//
var InvalidOperationError = exports.InvalidOperationError = function(message, error) {
	this.error = error;
	this.name = 'InvalidOperationError';

	Error.call(this, message);
	Error.captureStackTrace(this, arguments.callee);
};

util.inherits(InvalidOperationError, Error);



var InventoryItem = function(id, name) {
	var self = this;	

	this._activated = true;
	this._name = '';

	AggregateRoot.call(this, id);

	this.onEvent('InventoryItemCreated', function(inventoryItemCreated) {
		self._activated = true;
		self._name = inventoryItemCreated.name;
	});

	this.onEvent('InventoryItemDeactivated', function(inventoryItemDeactivated) {
		self._activated = false;
	});

	this.apply('InventoryItemCreated', {
		name: name
	});
};

util.inherits(InventoryItem, AggregateRoot);

InventoryItem.prototype.deactivate = function() {
	if(!this._activated)
		throw new InvalidOperationError('This inventory item has already been deactivated.');

	this.apply('InventoryItemDeactivated', {});
};

// This function should be exported
var create = function(id, name) {
	return new InventoryItem(id, name);
};



//
// ConcurrencyError
//
var ConcurrencyViolationError = exports.ConcurrencyError = function(message, error) {
	this.error = error;
	this.name = 'ConcurrencyViolationError';

	Error.call(this, message);
	Error.captureStackTrace(this, arguments.callee);
};

util.inherits(ConcurrencyViolationError, Error);


//
// EventStore
//
var EventStore = function() {
	var self = this;

	this._store = [];
	this._transientCache = [];

	stream.Writable.call(this, { objectMode: true });

	this.on('finish', function() {
		self.flushBuffer();
	});

	this.flushBuffer = function() {
		this._transientCache.forEach(function(transientAggregateRoot) {
			self.save(transientAggregateRoot);
		});

		// Clear the transient cache
		this._transientCache.length = 0;
	};

	this.save = function(transientAggregateRoot) {
		var storedAggregateRoot = _.find(this._store, function(ar) {
			return ar.id === transientAggregateRoot.id;
		});

		if(!storedAggregateRoot) {
			incrementVersionOf(transientAggregateRoot, transientAggregateRoot.events.length);
			this._store.push(transientAggregateRoot);
			return;
		} 

		if(storedAggregateRoot.version !== transientAggregateRoot.version)
			throw new ConcurrencyViolationError('An operation has been performed on an aggregate root that is out of date.');

		incrementVersionOf(storedAggregateRoot, transientAggregateRoot.events.length);

		transientAggregateRoot.events.forEach(function(domainEvent) {
			storedAggregateRoot.events.push(domainEvent);
		});
	};

	function incrementVersionOf(aggregateRoot, delta) {
		aggregateRoot.version += delta;
	}
};

util.inherits(EventStore, stream.Writable);

EventStore.prototype._write = function(eventStreamObject, encoding, next) {
	var transientAggregateRoot = _.find(this._transientCache, function(buffered) {
		return buffered.id === eventStreamObject.aggregateRootId;
	});	

	if(!transientAggregateRoot) {
		transientAggregateRoot = {
			id: eventStreamObject.aggregateRootId,
			version: eventStreamObject.aggregateRootVersion,
			events: []
		};

		this._transientCache.push(transientAggregateRoot);
	}

	transientAggregateRoot.events.push(eventStreamObject.domainEvent);
	next();
};




// Command handler code
var eventStore = new EventStore();

var inventoryItem = create(uuidGenerator.v1(), 'Something');
inventoryItem.deactivate();

inventoryItem.pipe(eventStore);

setTimeout(function() {
	_.forEach(eventStore._store, function(ar) { console.log(ar); });
}, 5000);



