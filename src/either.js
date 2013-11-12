var util = require('util');

//
// InvalidOptionError
//
var InvalidOptionError = exports.InvalidOptionError = function(message, error) {
	this.error = error;
	this.name = 'InvalidOptionError';

	Error.call(this, message);
	Error.captureStackTrace(this, arguments.callee);
};

util.inherits(InvalidOptionError, Error);

//
// Either
//
var Either = function(left, right) {
	this._left = left;
	this._right = right;
};

Either.prototype.left = function() {
	return this._left;
};

Either.prototype.hasLeft = function() {
	return !this._left;
};

Either.prototype.right = function() {
	return this._right;
};

Either.prototype.hasRight = function() {
	return !this._right;
};

Either.prototype.fold = function(leftOption, rightOption) {
	if(typeof leftOption !== 'function')
		throw new InvalidOptionError('The specified left option parameter should be a function.');

	if(typeof rightOption !== 'function')
		throw new InvalidOptionError('The specified right option parameter should be a function.');

	(this._left) ? leftOption(this._left) : rightOption(this._right);
};

exports.left = function(left) {
	return new Either(left, null);
};

exports.right = function(right) {
	return new Either(null, right);
};