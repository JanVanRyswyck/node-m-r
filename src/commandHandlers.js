'use strict';

var inventoryItemDomain = require('./inventoryItem'),
	MessageBus = require('./messageBus');

var repository = new inventoryItemDomain.Repository();
var DEFAULT_NUMBER_OF_ITEMS_IN_INVENTORY = 15;

exports.createInventoryItem = function(command, callback) {
	var inventoryItem = inventoryItemDomain.create(command.inventoryItemId, command.name);	
	inventoryItem.checkIn(DEFAULT_NUMBER_OF_ITEMS_IN_INVENTORY); 

	repository.save(inventoryItem, callback);
};

exports.renameInventoryItem = function(command, callback) {
	repository.get(command.inventoryItemId, function(error, inventoryItem) {
		if(error) {
			callback(error);
			return;
		}

		inventoryItem.rename(command.name);
		repository.save(inventoryItem, callback);
	});
};

exports.checkinItemsInToInventory = function(command, callback) {
	repository.get(command.inventoryItemId, function(error, inventoryItem) {
		if(error) {
			callback(error);
			return;
		}

		inventoryItem.checkIn(command.numberOfItems);
		repository.save(inventoryItem, callback);
	});	
};

exports.checkoutItemsFromInventory = function(command, callback) {
	repository.get(command.inventoryItemId, function(error, inventoryItem) {
		if(error) {
			callback(error);
			return;
		}

		try {
			inventoryItem.checkOut(command.numberOfItems);
		} 
		catch(error) {
			callback(error);
			return;
		}
	
		repository.save(inventoryItem, callback);
	});
};

exports.deactivateInventoryItem = function(command, callback) {
	repository.get(command.inventoryItemId, function(error, inventoryItem) {
		if(error) {
			callback(error);
			return;
		}

		try {
			inventoryItem.deactivate();
		} 
		catch(error) {
			callback(error);
			return;
		}
		
		repository.save(inventoryItem, callback);
	});
};