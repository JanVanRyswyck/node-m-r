'use strict';

var reporting = require('./reportAggregators'),
	messageBus = require('./messageBus');

exports.bootstrap = function() {
	var inventoryReportAggregator = new reporting.InventoryReportAggregator();
	messageBus.registerEventHandler(inventoryReportAggregator);

	var inventoryDetailsReportAggregator = new reporting.InventoryDetailsReportAggregator();
	messageBus.registerEventHandler(inventoryDetailsReportAggregator);
};