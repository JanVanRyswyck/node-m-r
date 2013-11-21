var util = require('util'),
	stream = require('stream'),
	EventEmitter = require('eventemitter2').EventEmitter2,
	uuidGenerator = require('node-uuid'),
	either = require('./either');
	_ = require('lodash');


var MessageBus = require('./messageBus');
var createInventoryItem = require('./inventoryItem').create;
var InventoryItemRepository = require('./inventoryItem').Repository;
var eventStore = require('./eventStore');



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

			if(!inventoryReport) 
				return reportNotFound(inventoryReport, callback);

			inventoryReport.name = message.name;
			callback(null);
		}
	);
};

InventoryReportAggregator.prototype.handleInventoryItemDeactivated = function(message, callback) {
	reportDatabase.removeReport(INVENTORY_REPORTS, message.aggregateRootId, callback);
};

function reportNotFound(inventoryReport, callback) {
	var errorMesage = util.format('The report with identifier "%d" could not be found in the data store.', message.aggregateRootId);
	return callback(new ReportNotFoundError(errorMessage));
}


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

			if(!inventoryReport)
				return reportNotFound(inventoryReport, callback);

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

			if(!inventoryReport)
				return reportNotFound(inventoryReport, callback);

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

			if(!inventoryReport)
				return reportNotFound(inventoryReport, callback);
			
			inventoryReport.currentNumber -= message.numberOfItems;
			callback(null);
		}
	);
};

InventoryDetailsReportAggregator.prototype.handleInventoryItemDeactivated = function(message, callback) {
	reportDatabase.removeReport(INVENTORY_DETAILS_REPORTS, message.aggregateRootId, callback);
};

function reportNotFound(inventoryReport, callback) {
	var errorMesage = util.format('The report with identifier "%d" could not be found in the data store.', message.aggregateRootId);
	callback(new ReportNotFoundError(errorMessage));
}



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
console.log('CreateInventoryItem command handler');
console.log('======================================================');

var inventoryItemId = uuidGenerator.v1();
var inventoryItem = createInventoryItem(inventoryItemId, 'Something');
inventoryItem.checkIn(15);		// TODO: Also make a separate command handler for this, but leave this within the create command handler to demonstrate 2 cmds!!

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
	console.log('RenameInventoryItem command handler');
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
	console.log('CheckoutItemsFromInventory command handler');
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
	console.log('DeactivateInventoryItem command handler');
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
	_.forEach(eventStore.createDump(), function(document) { console.log(document.events); });
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