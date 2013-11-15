var AggregateRoot = require('./aggregateRoot'),
    InvalidOperationError = require('./errors').InvalidOperationError,
	util = require('util');

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

//
// InventoryItemRepository
//
function InventoryItemRepository(messageBus) {
	this._eventStore = new EventStore();   
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