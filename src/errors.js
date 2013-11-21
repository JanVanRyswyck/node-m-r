var util = require('util');

//
// InvalidOperationError
//
var InvalidOperationError = exports.InvalidOperationError = function(message, error) {
	this.error = error;
	this.name = 'InvalidOperationError';

	Error.call(this, message);
	Error.captureStackTrace(this, arguments.callee);
};

util.inherits(InvalidOperationError, Error);


//
// ConcurrencyError
//
var ConcurrencyViolationError = exports.ConcurrencyError = function(message, error) {
	this.error = error;
	this.name = 'ConcurrencyViolationError';

	Error.call(this, message);
	Error.captureStackTrace(this, arguments.callee);
};

util.inherits(ConcurrencyViolationError, Error);


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