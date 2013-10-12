var util = require('util');
var stream = require('stream');
var EventEmitter = require('eventemitter2').EventEmitter2;
var _ = require('lodash');



// TODO: Apply Class pattern from Mathias !!
var AggregateRoot = exports.AggregateRoot = function(id) {
	this._id = id;
	this._version = this._eventVersion = 0;
	this._transientEvents = [];

	this._eventEmitter = new EventEmitter();
	stream.Readable.call(this, { objectMode: true });
};

util.inherits(AggregateRoot, stream.Readable);

AggregateRoot.prototype.apply = function(eventName, eventBody) {
	var domainEvent;
	var originalEventBody = _.clone(eventBody);

	this._eventVersion += 1;
	domainEvent = createDomainEvent(this, eventName, this._eventVersion, eventBody);

	this._transientEvents.push(domainEvent);
	this._eventEmitter.emit(eventName, originalEventBody);
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

	this.push(this._transientEvents[0]);
	this._transientEvents.shift();
};

function createDomainEvent(aggregateRoot, eventName, eventVersion, eventBody) {
	eventBody.__name = eventName;
	eventBody.__version = eventVersion;

	return {
		aggregateRootId: aggregateRoot._id,
		aggregateRootVersion: aggregateRoot._version,
		eventBody: eventBody
	};
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

	this._activated;
	this._name;

	AggregateRoot.call(this, id);

	this.onEvent('InventoryItemCreated', function(inventoryItemCreated) {
		self._activated = true;
		self._name = inventoryItemCreated.name;
	});

	this.onEvent('InventoryItemDeactivated', function(inventoryItemDeactivated) {
		self._activated = false;
	});

	this.apply('InventoryItemCreated', {
		id: id,
		name: name
	});
};

util.inherits(InventoryItem, AggregateRoot);

InventoryItem.prototype.deactivate = function() {
	if(!this._activated)
		throw new InvalidOperationError('This inventory item has already been deactivated.');

	this.apply('InventoryItemDeactivated', {
		id: this._id
	});
};

// This function should be exported
var create = function(id, name) {
	return new InventoryItem(id, name);
};









//
// TODO Jan: Remove !!
//
var InventoryItemRepository = function() {
	var self = this;

	stream.Writable.call(this, { objectMode: true });

	this.on('finish', function() {
		console.log('Finished writing events, now flush!!');
	});
};

util.inherits(InventoryItemRepository, stream.Writable);


InventoryItemRepository.prototype._write = function(chunk, encoding, next) {
	console.log(chunk);
	next();
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
var eventStore = new (function() {
	var _store = [];

	this.Save = function(domainEvents, aggregateRootId, aggregateRootVersion) {
		// TODO Jan: Replace with function !!
		var aggregateRoot = _.find(store, { 'aggregateRootId': aggregateRootId });

		if(!aggregateRoot) {
			aggregateRoot = {
				id: aggregateRootId,
				version: aggregateRootVersion,
				events: []
			};

			_store.Add(aggregateRoot);
		}

		// TODO Jan: Make sure that next(error) is called for the write stream !!
		if(aggregateRoot.version !== aggregateRootVersion)
			throw new ConcurrencyViolationError('An operation has been performed on an aggregate root that is out of date.');

		domainEvents.foreach(function(domainEvent) {
			aggregateRoot.events.push(domainEvent);
		});
	}
})();






// Command handler code
var repository = new InventoryItemRepository();

var inventoryItem = create(121, 'Something');	// TODO Jan: GUID!!
inventoryItem.deactivate();

inventoryItem.pipe(repository);


