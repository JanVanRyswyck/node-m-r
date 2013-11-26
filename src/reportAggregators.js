var stream = require('stream'),
	util = require('util'),
	reportDatabase = require('./reportDatabase'),
	ReportNotFoundError = require('./errors.js');

exports.InventoryReportAggregator = InventoryReportAggregator;
exports.InventoryDetailsReportAggregator = InventoryDetailsReportAggregator;

//
// ReportAggregator
//
function ReportAggregator() {
	stream.Writable.call(this, { objectMode: true });
};

util.inherits(ReportAggregator, stream.Writable);

ReportAggregator.prototype._write = function(domainEvent, encoding, next) {
	var eventHandlerName = 'handle' + domainEvent.eventName;
	var eventHandler = this[eventHandlerName] || dummyEventHandler;

	eventHandler(domainEvent, function(error) {
		if(error) {
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
// InventoryReportAggregator
//
var INVENTORY_REPORTS = 'InventoryReports';

function InventoryReportAggregator() {
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
				return reportNotFound(message.aggregateRootId, callback);

			inventoryReport.name = message.name;
			callback();
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

function InventoryDetailsReportAggregator() {
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
				return reportNotFound(message.aggregateRootId, callback);

			inventoryReport.name = message.name;
			callback();
		}
	);
};

InventoryDetailsReportAggregator.prototype.handleItemsCheckedInToInventory = function(message, callback) {
	reportDatabase.getReport(INVENTORY_DETAILS_REPORTS, message.aggregateRootId, 
		function(error, inventoryReport) {
			if(error)
				return callback(error);

			if(!inventoryReport)
				return reportNotFound(message.aggregateRootId, callback);

			inventoryReport.currentNumber += message.numberOfItems;
			callback();
		}
	);
};

InventoryDetailsReportAggregator.prototype.handleItemsCheckedOutFromInventory = function(message, callback) {
	reportDatabase.getReport(INVENTORY_DETAILS_REPORTS, message.aggregateRootId, 
		function(error, inventoryReport) {
			if(error)
				return callback(error);

			if(!inventoryReport)
				return reportNotFound(message.aggregateRootId, callback);
			
			inventoryReport.currentNumber -= message.numberOfItems;
			callback();
		}
	);
};

InventoryDetailsReportAggregator.prototype.handleInventoryItemDeactivated = function(message, callback) {
	reportDatabase.removeReport(INVENTORY_DETAILS_REPORTS, message.aggregateRootId, callback);
};


//
// Helper functions
//
function reportNotFound(aggregateRootId, callback) {
	var errorMesage = util.format('The report with identifier "%d" could not be found in the data store.', aggregateRootId);
	callback(new ReportNotFoundError(errorMessage));
}