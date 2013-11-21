var stream = require('stream'),
    ConcurrencyViolationError = require('./errors').ConcurrencyViolationError;

var eventStore = (function() {
	var _this = {},
		_store = [];

	_this.createDump = function() {
		return _store;
	};

	_this.getAllEventsFor = function(aggregateRootId, callback) {
		findStoredDomainEvents(aggregateRootId, function(error, storedDocument) {
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

	_this.save = function(domainEvents, aggregateRootId, expectedAggregateRootVersion, callback) {
		findStoredDomainEvents(aggregateRootId, function(error, storedDocument) {
			if(error)
				return callback(error);

			if(!storedDocument) {
				var storedDocument = {
					id: aggregateRootId,
					events: domainEvents
				};

				_store.push(storedDocument);
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
	};

	function findStoredDomainEvents(aggregateRootId, callback) {
		process.nextTick(function() {
			var storedDocument = _.find(_store, function(document) {
				return document.id === aggregateRootId;
			});

			callback(null, storedDocument);
		});
	}

	return _this;
})();


module.exports = eventStore;