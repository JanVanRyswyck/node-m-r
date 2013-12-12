'use strict';

var AggregateRoot = require('./aggregateRoot'),
    InvalidOperationError = require('./errors').InvalidOperationError,
	util = require('util'),
	eventStore = require('./eventStore'),
	messageBus = require('./messageBus');

exports.create = function create(id, name) {
	return new InventoryItem(id, name);
};

exports.Repository = InventoryItemRepository;

//
// InventoryItem
//
function InventoryItem(id, name) {
	var _this = this;	

	this._activated = true;
	this._name = '';
	this._number = 0;

	AggregateRoot.call(this, id);
	subscribeToDomainEvents(this);

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

function subscribeToDomainEvents(inventoryItem) {
	var _this = inventoryItem;

	inventoryItem.onEvent('InventoryItemCreated', function(inventoryItemCreated) {
		_this._activated = true;
		_this._name = inventoryItemCreated.name;
	});

	inventoryItem.onEvent('InventoryItemRenamed', function(inventoryItemRenamed) {
		_this._name = inventoryItemRenamed.name;
	});

	inventoryItem.onEvent('ItemsCheckedInToInventory', function(itemsCheckedInToInventory) {
		_this._number += itemsCheckedInToInventory.numberOfItems;
	});

	inventoryItem.onEvent('ItemsCheckedOutFromInventory', function(itemsCheckedOutFromInventory) {
		_this._number -= itemsCheckedOutFromInventory.numberOfItems;
	});

	inventoryItem.onEvent('InventoryItemDeactivated', function(inventoryItemDeactivated) {
		_this._activated = false;
	});
}


//
// InventoryItemRepository
//
function InventoryItemRepository() { 
};

InventoryItemRepository.prototype.save = function(inventoryItem, callback) {
	var transientEvents = inventoryItem.getTransientEvents();

	eventStore.save(transientEvents, inventoryItem.getId(), inventoryItem.getVersion(), function(error) {
		if(error)
			return callback(error);

		transientEvents.forEach(function(domainEvent) {
			messageBus.publish(domainEvent);
		});
		
		callback();	
	});
}

InventoryItemRepository.prototype.get = function(inventoryItemId, callback) {
	eventStore.getAllEventsFor(inventoryItemId, function(error, eventStream) {
		if(error)
			return callback(error);

		if(!eventStream)
			return callback();

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