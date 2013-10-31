var util = require('util'),
	stream = require('stream'),
	EventEmitter = require('eventemitter2').EventEmitter2,
	uuidGenerator = require('node-uuid'),
	_ = require('lodash');

//
// DomainEventStream
//
var DomainEventStream = function(aggregateRootId) {
	var self = this;

	this._aggregateRootId = aggregateRootId;
	this._domainEvents = [];	// Do not rename to _events (there be dragons) !!
	this._streamReadIndex = 0;
	
	stream.Duplex.call(this, { objectMode: true });
};

util.inherits(DomainEventStream, stream.Duplex);

DomainEventStream.prototype.getAggregateRootId = function() {
	return this._aggregateRootId;
};

DomainEventStream.prototype.getVersion = function() {
	var indexOfLastEvent = this._domainEvents.length - 1;
	return this._domainEvents[indexOfLastEvent].eventVersion;
};

DomainEventStream.prototype._read = function() {
	if(this._streamReadIndex === this._domainEvents.length) {
		this._streamReadIndex = 0;
		return this.push(null);
	}
		
	this.push(this._domainEvents[this._streamReadIndex]);
	this._streamReadIndex += 1;
};

DomainEventStream.prototype._write = function(event, encoding, next) {
	this._domainEvents.push(event);
	next();
};




//
// AggregateRoot
//

// TODO: Apply Class pattern from Mathias !!
var AggregateRoot = exports.AggregateRoot = function(id) {
	this._id = id;
	this._version = this._eventVersion = 0;
	this._transientEvents = [];

	this._eventEmitter = new EventEmitter();
	stream.Writable.call(this, { objectMode: true });	
};

util.inherits(AggregateRoot, stream.Writable);

AggregateRoot.prototype.apply = function(eventName, domainEvent) {
	var domainEvent;

	this._eventVersion += 1;
	enhanceDomainEvent(this, eventName, this._eventVersion, domainEvent);

	this._transientEvents.push(domainEvent);
	this._eventEmitter.emit(eventName, domainEvent);
};

AggregateRoot.prototype.getTransientEvents = function() {
	var transientEventStream = new DomainEventStream(this._id);

	this._transientEvents.forEach(function(transientEvent) {
		transientEventStream.write(transientEvent);
	});

	return transientEventStream;
};

AggregateRoot.prototype.getVersion = function() {
	return this._version;
};

AggregateRoot.prototype.onEvent = function(type, listener) {
	return this._eventEmitter.on(type, listener);
};

AggregateRoot.prototype._write = function(domainEvent, encoding, next) {
	this._eventEmitter.emit(domainEvent.eventName, domainEvent);
	this._version = this._eventVersion += 1;
	next();
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

	this.onEvent('InventoryItemRenamed', function(inventoryItemRenamed) {
		self._name = inventoryItemRenamed.name;
	});

	// TODO Jan: Move this to some sort of initialize method on the prototype and get rid of the create factory method => see class impl CoffeeScript??
	if(name) {
		this.apply('InventoryItemCreated', {
			name: name
		});	
	}
};

util.inherits(InventoryItem, AggregateRoot);

InventoryItem.prototype.deactivate = function() {
	if(!this._activated)
		throw new InvalidOperationError('This inventory item has already been deactivated.');

	this.apply('InventoryItemDeactivated', {});
};

InventoryItem.prototype.rename = function(name) {
	this.apply('InventoryItemRenamed', {
		name: name
	});
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
	this._store = [];
};

EventStore.prototype.getAllEventsFor = function(aggregateRootId) {
	return findStoredEventStream(this, aggregateRootId);
};

EventStore.prototype.save = function(eventStream, expectedAggregateRootVersion, callback) {
	var storedEventStream = findStoredEventStream(this, eventStream.getAggregateRootId());
	if(!storedEventStream) {
		this._store.push(eventStream);
		
		process.nextTick(function() {
			callback(null);
		});

		return;
	}

	if(storedEventStream.getVersion() !== expectedAggregateRootVersion)
		throw new ConcurrencyViolationError('An operation has been performed on an aggregate root that is out of date.');

	eventStream.pipe(storedEventStream)
		.on('error', function(error) {
			callback(error);
		})
		.on('finish', function() {
			callback(null);
		});
};

function findStoredEventStream(eventStore, aggregateRootId) {
	return _.find(eventStore._store, function(storedEventStream) {
		return storedEventStream.getAggregateRootId() === aggregateRootId;
	});	
}



// TODO: In the same module as InventoryItem
//
// InventoryItemRepository
//
var InventoryItemRepository = function() {
	this._eventStore = new EventStore();
};

InventoryItemRepository.prototype.save2000 = function(inventoryItem, callback) {
	var eventStream = inventoryItem.getTransientEvents();
	this._eventStore.save(eventStream, inventoryItem.getVersion(), callback);
}

InventoryItemRepository.prototype.get = function(inventoryItemId, callback) {
	var eventStream = this._eventStore.getAllEventsFor(inventoryItemId);
	if(!eventStream)
		return null;

	var inventoryItem = new InventoryItem(inventoryItemId);

	eventStream.pipe(inventoryItem)
		.on('error', function(error) {
			callback(error);
		})
		.on('finish', function() {
			callback(null, inventoryItem);
		});
};





console.log('======================================================');
console.log('Begin first command handler');
console.log('======================================================');

// Command handler code
var repository = new InventoryItemRepository();

var inventoryItemId = uuidGenerator.v1();
var inventoryItem = create(inventoryItemId, 'Something');
inventoryItem.deactivate();

repository.save2000(inventoryItem, function(error) {
	// TODO: Handle error + test error scenario!!
	_.forEach(repository._eventStore._store, function(es) { console.log(es._domainEvents); });
});

setTimeout(function() {
	secondCommandHandler();
}, 4000);

function secondCommandHandler() {
	console.log('======================================================');
	console.log('Begin second command handler');
	console.log('======================================================');

	repository.get(inventoryItemId, function(error, inventoryItem) {
		inventoryItem.rename('Something entirely different');

		repository.save2000(inventoryItem, function(error) {
			// TODO: Handle error + test error scenario!!
			_.forEach(repository._eventStore._store, function(es) { console.log(es._domainEvents); });
		});
	});
};