var uuidGenerator = require('node-uuid'),
	_ = require('lodash'),
	eventStore = require('./eventStore'),
	reportDatabase = require('./reportDatabase'),
	commandHandlers = require('./commandHandlers');

require('./bootstrapper').bootstrap();

var inventoryItemId = uuidGenerator.v1();

(function step01() {
	console.log('======================================================');
	console.log('Run the CreateInventoryItem command handler');
	console.log('======================================================');

	var command = {
		inventoryItemId: inventoryItemId,
		name: 'Something'
	};

	commandHandlers.createInventoryItem(command, function(error) {
		if(error) {
			console.log(error);
			return;
		}

		printCurrentStateOfTheApplication();
		setTimeout(function() { step02(); }, 5000);
	});
})();

function step02() {
	console.log('======================================================');
	console.log('Run the RenameInventoryItem command handler');
	console.log('======================================================');

	var command = {
		inventoryItemId: inventoryItemId,
		name: 'Something entirely different'
	};

	commandHandlers.renameInventoryItem(command, function(error) {
		if(error) {
			console.log(error);
			return;
		}

		printCurrentStateOfTheApplication();
		setTimeout(function() { step03(); }, 5000);
	});
}

function step03() {
	console.log('======================================================');
	console.log('Run the CheckoutItemsFromInventory command handler');
	console.log('======================================================');

	var command = {
		inventoryItemId: inventoryItemId,
		numberOfItems: 7
	};

	commandHandlers.checkoutItemsFromInventory(command, function(error) {
		if(error) {
			console.log(error);
			return;
		}

		printCurrentStateOfTheApplication();
		setTimeout(function() { step04(); }, 5000);
	});
}

function step04() {
	console.log('======================================================');
	console.log('Run the DeactivateInventoryItem command handler');
	console.log('======================================================');

	var command = {
		inventoryItemId: inventoryItemId
	};

	commandHandlers.deactivateInventoryItem(command, function(error) {
		if(error) {
			console.log(error);
			return;
		}

		printCurrentStateOfTheApplication();
	});
}

function printCurrentStateOfTheApplication() {
	printEventStoreContent();

	// Give the report database some time to catch up
	setTimeout(function() {
		printReportDatabaseContent();
	}, 2000);
}

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