var util = require('util'),
	stream = require('stream'),
	EventEmitter = require('eventemitter2').EventEmitter2,
	uuidGenerator = require('node-uuid'),
	either = require('./either');
	_ = require('lodash');


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
	return this._transientEvents;
};

AggregateRoot.prototype.getId = function() {
	return this._id;
};

AggregateRoot.prototype.getVersion = function() {
	return this._version;
};

AggregateRoot.prototype.onEvent = function(type, listener) {
	return this._eventEmitter.on(type, listener);
};

AggregateRoot.prototype._write = function(domainEvent, encoding, next) {
	this._eventEmitter.emit(domainEvent.eventName, domainEvent);
	
	this._eventVersion += 1;
	this._version += 1;
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



//
// InventoryItem
//
var InventoryItem = function(id, name) {
	var _this = this;	

	this._activated = true;
	this._name = '';
	this._number = 0;

	AggregateRoot.call(this, id);

	this.onEvent('InventoryItemCreated', function(inventoryItemCreated) {
		_this._activated = true;
		_this._name = inventoryItemCreated.name;
	});

	this.onEvent('InventoryItemRenamed', function(inventoryItemRenamed) {
		_this._name = inventoryItemRenamed.name;
	});

	this.onEvent('ItemsCheckedInToInventory', function(itemsCheckedInToInventory) {
		_this._number += itemsCheckedInToInventory.numberOfItems;
	});

	this.onEvent('ItemsCheckedOutFromInventory', function(itemsCheckedOutFromInventory) {
		_this._number -= itemsCheckedOutFromInventory.numberOfItems;
	});

	this.onEvent('InventoryItemDeactivated', function(inventoryItemDeactivated) {
		_this._activated = false;
	});

	// TODO Jan: Move this to some sort of initialize method on the prototype and get rid of the create factory method => see class impl CoffeeScript??
	if(name) {
		this.apply('InventoryItemCreated', {
			name: name
		});	
	}
};

util.inherits(InventoryItem, AggregateRoot);

InventoryItem.prototype.checkIn = function(numberOfItems) {
	this.apply('ItemsCheckedInToInventory', {
		numberOfItems: numberOfItems
	});
};

InventoryItem.prototype.checkOut = function(numberOfItems) {
	if((this._number - numberOfItems) < 0) {
		var errorMesage = util.format('The inventory needs to replenished in order to checkout %d items.', numberOfItems);
		throw new InvalidOperationError(errorMesage);
	}

	this.apply('ItemsCheckedOutFromInventory', {
		numberOfItems: numberOfItems
	});
};

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

EventStore.prototype.getAllEventsFor = function(aggregateRootId, callback) {
	findStoredDomainEvents(this, aggregateRootId, function(error, storedDocument) {
		var eventStream;

		if(error)
			return callback(error);
					
		if(!storedDocument)
			return callback(null);

		eventStream = new stream.PassThrough({ objectMode: true });

		storedDocument.events.forEach(function(domainEvent) {
			eventStream.write(domainEvent);
		});

		eventStream.end();
		callback(null, eventStream);
	});
};

EventStore.prototype.save = function(domainEvents, aggregateRootId, expectedAggregateRootVersion, callback) {
	var self = this;

	findStoredDomainEvents(this, aggregateRootId, function(error, storedDocument) {
		if(error)
			return callback(error);

		if(!storedDocument) {
			var storedDocument = {
				id: aggregateRootId,
				events: domainEvents
			};

			self._store.push(storedDocument);
			return callback(null);
		}

		if(_.last(storedDocument.events).eventVersion !== expectedAggregateRootVersion) {
			var concurrencyViolation = new ConcurrencyViolationError('An operation has been performed on an aggregate root that is out of date.');
			return callback(concurrencyViolation);
		}

		domainEvents.forEach(function(domainEvent) {
			storedDocument.events.push(domainEvent);
		});

		callback(null);
	});
}

function findStoredDomainEvents(eventStore, aggregateRootId, callback) {
	process.nextTick(function() {
		var storedDocument = _.find(eventStore._store, function(document) {
			return document.id === aggregateRootId;
		});

		callback(null, storedDocument);
	});
}



// TODO: In the same module as InventoryItem
//
// InventoryItemRepository
//
var InventoryItemRepository = function(messageBus) {
	this._eventStore = new EventStore();   // TODO: Make EventStore a singleton!!
	this._messageBus = messageBus;
};

InventoryItemRepository.prototype.save = function(inventoryItem, callback) {
	var self = this;
	var transientEvents = inventoryItem.getTransientEvents();

	this._eventStore.save(transientEvents, inventoryItem.getId(), inventoryItem.getVersion(), function(error) {
		if(error)
			return callback(error);

		transientEvents.forEach(function(domainEvent) {
			self._messageBus.publish(domainEvent);
		});
		
		callback(null);	// TODO: Do some serious error handling	
	});
}

InventoryItemRepository.prototype.get = function(inventoryItemId, callback) {
	this._eventStore.getAllEventsFor(inventoryItemId, function(error, eventStream) {
		if(error)
			return callback(error);

		if(!eventStream)
			return callback(null);

		var inventoryItem = new InventoryItem(inventoryItemId);

		eventStream.pipe(inventoryItem)
			.on('error', function(error) {
				callback(error);
			})
			.on('finish', function() {
				eventStream.unpipe();
				callback(null, inventoryItem);
			});
	});
};





//
// InvalidDataAreaError
//
var InvalidDataAreaError = exports.InvalidDataAreaError = function(message, error) {
	this.error = error;
	this.name = 'InvalidDataAreaError';

	Error.call(this, message);
	Error.captureStackTrace(this, arguments.callee);
};

util.inherits(InvalidDataAreaError, Error);

//
// ReportDatabase
//

var reportDatabase = (function() {
	var _this = {};

	var _dataAreas = {
		InventoryReports: [],
		InventoryDetailsReports: []
	};

	_this.getReport = function(dataArea, id, callback) {
		simulateAsynchronousIO(function() {
			getReportsCollectionFor(dataArea).fold(
				function left(error) {
					callback(error);
				},
				function right(reportsCollection) {
					var requestedReport = _.find(reportsCollection, function(report) {
						return report.id === id;
					});

					callback(null, requestedReport);
				}
			);
		});
	};

	_this.getAllReports = function(dataArea, callback) {
		simulateAsynchronousIO(function() {
			getReportsCollectionFor(dataArea).fold(
				function left(error) {
					callback(error);
				},
				function right(reportsCollection) {
					callback(null, reportsCollection);
				}
			);
		});
	};

	_this.insertReport = function(dataArea, inventoryReport, callback) {
		simulateAsynchronousIO(function() {
			getReportsCollectionFor(dataArea).fold(
				function left(error) { 
					callback(error); 
				},
				function right(reportsCollection) {
					reportsCollection.push(inventoryReport);
					callback(null);		
				}
			);
		});
	};

	_this.removeReport = function(dataArea, id, callback) {
		simulateAsynchronousIO(function() {
			getReportsCollectionFor(dataArea).fold(
				function left(error) {
					callback(error);
				},
				function right(reportsCollection) {
					_.remove(reportsCollection, function(report) {
						return report.id === id;
					});

					callback(null);
				}
			);
		});
	};

	function simulateAsynchronousIO(asynchronousAction) {
		process.nextTick(asynchronousAction);
	}

	function getReportsCollectionFor(dataArea) {
		reportsCollection = _dataAreas[dataArea];

		if(reportsCollection)
			return either.right(reportsCollection);
		else
			return either.left(new InvalidDataAreaError('The specified data area is unknown.'));
	}

	return _this;
})();



//
// ReportAggregator
//
var ReportAggregator = function() {
	stream.Writable.call(this, { objectMode: true });
};

util.inherits(ReportAggregator, stream.Writable);

ReportAggregator.prototype._write = function(domainEvent, encoding, next) {
	var eventHandlerName = 'handle' + domainEvent.eventName;
	var eventHandler = this[eventHandlerName] || dummyEventHandler;

	eventHandler(domainEvent, function(error) {
		if(error) {
			// TODO Jan: setup decent logging (log error + domain event)
			console.log(error);	
			return;
		}
			
		next();
	});
};

function dummyEventHandler(domainEvent, callback) {
	process.nextTick(callback);
};


//
// ReportNotFoundError
//
var ReportNotFoundError = exports.ReportNotFoundError = function(message, error) {
	this.error = error;
	this.name = 'ReportNotFoundError';

	Error.call(this, message);
	Error.captureStackTrace(this, arguments.callee);
};

util.inherits(ReportNotFoundError, Error);


//
// InventoryReportAggregator
//
var INVENTORY_REPORTS = 'InventoryReports';

var InventoryReportAggregator = function() {
	ReportAggregator.call(this, { objectMode: true });
};

util.inherits(InventoryReportAggregator, ReportAggregator);

InventoryReportAggregator.prototype.handleInventoryItemCreated = function(message, callback) {
	var inventoryReport = {
		id: message.aggregateRootId,
		name: message.name
	};

	reportDatabase.insertReport(INVENTORY_REPORTS, inventoryReport, callback);
};

InventoryReportAggregator.prototype.handleInventoryItemRenamed = function(message, callback) {
	reportDatabase.getReport(INVENTORY_REPORTS, message.aggregateRootId, 
		function(error, inventoryReport) {
			if(error)
				return callback(error);

			if(!inventoryReport) {
				var errorMesage = util.format('The report for identifier "%d" could not be found in the data store.', message.aggregateRootId);
				return callback(new ReportNotFoundError(errorMessage));
			}

			inventoryReport.name = message.name;
			callback(null);
		}
	);
};

InventoryReportAggregator.prototype.handleInventoryItemDeactivated = function(message, callback) {
	reportDatabase.removeReport(INVENTORY_REPORTS, message.aggregateRootId, callback);
};


//
// InventoryDetailsReportAggregator
//
var INVENTORY_DETAILS_REPORTS = 'InventoryDetailsReports';

var InventoryDetailsReportAggregator = function() {
	ReportAggregator.call(this, { objectMode: true });
};

util.inherits(InventoryDetailsReportAggregator, ReportAggregator);

InventoryDetailsReportAggregator.prototype.handleInventoryItemCreated = function(message, callback) {
	var inventoryDetailsReport = {
		currentNumber: 0,
		id: message.aggregateRootId,
		name: message.name
	};

	reportDatabase.insertReport(INVENTORY_DETAILS_REPORTS, inventoryDetailsReport, callback);
};

InventoryDetailsReportAggregator.prototype.handleInventoryItemRenamed = function(message, callback) {
	reportDatabase.getReport(INVENTORY_DETAILS_REPORTS, message.aggregateRootId, 
		function(error, inventoryReport) {
			if(error)
				return callback(error);

			if(!inventoryReport) {
				var errorMesage = util.format('The report for identifier "%d" could not be found in the data store.', message.aggregateRootId);
				return callback(new ReportNotFoundError(errorMessage));
			}

			inventoryReport.name = message.name;
			callback(null);
		}
	);
};

InventoryDetailsReportAggregator.prototype.handleItemsCheckedInToInventory = function(message, callback) {
	reportDatabase.getReport(INVENTORY_DETAILS_REPORTS, message.aggregateRootId, 
		function(error, inventoryReport) {
			if(error)
				return callback(error);

			if(!inventoryReport) {
				var errorMesage = util.format('The report for identifier "%d" could not be found in the data store.', message.aggregateRootId);
				return callback(new ReportNotFoundError(errorMessage));
			}

			inventoryReport.currentNumber += message.numberOfItems;
			callback(null);
		}
	);
};

InventoryDetailsReportAggregator.prototype.handleItemsCheckedOutFromInventory = function(message, callback) {
	reportDatabase.getReport(INVENTORY_DETAILS_REPORTS, message.aggregateRootId, 
		function(error, inventoryReport) {
			if(error)
				return callback(error);

			if(!inventoryReport) {
				var errorMesage = util.format('The report for identifier "%d" could not be found in the data store.', message.aggregateRootId);
				return callback(new ReportNotFoundError(errorMessage));
			}

			inventoryReport.currentNumber -= message.numberOfItems;
			callback(null);
		}
	);
};

InventoryDetailsReportAggregator.prototype.handleInventoryItemDeactivated = function(message, callback) {
	reportDatabase.removeReport(INVENTORY_DETAILS_REPORTS, message.aggregateRootId, callback);
};

//
// MessageBus
//
var MessageBus = function() {
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






//
// Bootstrapping code
//
var messageBus = new MessageBus();
var repository = new InventoryItemRepository(messageBus);

var inventoryReportAggregator = new InventoryReportAggregator();
messageBus.registerEventHandler(inventoryReportAggregator);

var inventoryDetailsReportAggregator = new InventoryDetailsReportAggregator();
messageBus.registerEventHandler(inventoryDetailsReportAggregator);


console.log('======================================================');
console.log('Begin first command handler');
console.log('======================================================');

var inventoryItemId = uuidGenerator.v1();
var inventoryItem = create(inventoryItemId, 'Something');
inventoryItem.checkIn(15);

repository.save(inventoryItem, function(error) {
	// TODO: Handle error + test error scenario!!
	printEventStoreContent();

	setTimeout(function() {
		printReportDatabaseContent();
	}, 2000);
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

		repository.save(inventoryItem, function(error) {
			// TODO: Handle error + test error scenario!!
			printEventStoreContent();

			setTimeout(function() {
				printReportDatabaseContent();
			}, 2000);
		});
	});

	setTimeout(function() {
		thirdCommandHandler();
	}, 4000);
};

function thirdCommandHandler() {
	console.log('======================================================');
	console.log('Begin third command handler');
	console.log('======================================================');

	repository.get(inventoryItemId, function(error, inventoryItem) {
		inventoryItem.checkOut(7);

		repository.save(inventoryItem, function(error) {
			// TODO: Handle error + test error scenario!!
			printEventStoreContent();

			setTimeout(function() {
				printReportDatabaseContent();
			}, 2000);
		});
	});

	setTimeout(function() {
		fourthCommandHandler();
	}, 4000);
};

function fourthCommandHandler() {
	console.log('======================================================');
	console.log('Begin fourth command handler');
	console.log('======================================================');

	repository.get(inventoryItemId, function(error, inventoryItem) {
		inventoryItem.deactivate();

		repository.save(inventoryItem, function(error) {
			// TODO: Handle error + test error scenario!!
			printEventStoreContent();

			setTimeout(function() {
				printReportDatabaseContent();
			}, 2000);
		});
	});
};

function printEventStoreContent() {
	_.forEach(repository._eventStore._store, function(document) { console.log(document.events); });
}

function printReportDatabaseContent() {
	// console.log('******************************************************');
	// console.log('Inventory reports');
	// console.log('******************************************************');
	// reportDatabase.getAllReports('InventoryReports', function(error, inventoryReports) {
	// 	console.log(inventoryReports);
	// });

	console.log('******************************************************');
	console.log('Inventory details reports');
	console.log('******************************************************');
	reportDatabase.getAllReports('InventoryDetailsReports', function(error, inventoryDetailsReports) {
		console.log(inventoryDetailsReports);
	});
}