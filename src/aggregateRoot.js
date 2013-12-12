'use strict';

var EventEmitter = require('eventemitter2').EventEmitter2,
    util = require('util'),
    stream = require('stream'),
    uuidGenerator = require('node-uuid');

module.exports = AggregateRoot;

function AggregateRoot(id) {
	this._id = id;
	this._version = this._eventVersion = 0;
	this._transientEvents = [];

	this._eventEmitter = new EventEmitter();
	stream.Writable.call(this, { objectMode: true });	
};

util.inherits(AggregateRoot, stream.Writable);

AggregateRoot.prototype.apply = function(eventName, domainEvent) {
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