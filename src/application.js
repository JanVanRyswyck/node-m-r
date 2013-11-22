var uuidGenerator = require('node-uuid'),
	_ = require('lodash');

var MessageBus = require('./messageBus'),
	inventoryItem = require('./inventoryItem'),
	eventStore = require('./eventStore'),
	reportDatabase = require('./reportDatabase'),
	reporting = require('./reportAggregators');

var domain = {
	createInventoryItem: inventoryItem.create,
	InventoryItemRepository: inventoryItem.Repository
};

//
// Bootstrapping code
//
var messageBus = new MessageBus();
var repository = new domain.InventoryItemRepository(messageBus);

var inventoryReportAggregator = new reporting.InventoryReportAggregator();
messageBus.registerEventHandler(inventoryReportAggregator);

var inventoryDetailsReportAggregator = new reporting.InventoryDetailsReportAggregator();
messageBus.registerEventHandler(inventoryDetailsReportAggregator);


console.log('======================================================');
console.log('CreateInventoryItem command handler');
console.log('======================================================');

var inventoryItemId = uuidGenerator.v1();
var inventoryItem = domain.createInventoryItem(inventoryItemId, 'Something');
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
	console.log('******************************************************');
	console.log('Event store');
	console.log('******************************************************');
	_.forEach(eventStore.createDump(), function(document) { console.log(document.events); });
}

function printReportDatabaseContent() {
	console.log('******************************************************');
	console.log('Report database');
	console.log('******************************************************');
	console.log(reportDatabase.createDump());
}