// Central Express error handler.
// Converts AppError subclasses (see utils/errors.js) to clean JSON responses,
// logs unexpected errors, and hides stack traces in production.

const logger = require('../config/logger');

module.exports = function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  const status = err.statusCode || 500;
  const isExpected = status < 500;

  if (!isExpected) {
    logger.error({ err, path: req.path, tenantId: req.tenantId }, 'unhandled.error');
  }

  res.status(status).json({
    error: err.publicMessage || err.message || 'Internal server error',
    code: err.code,
    ...(err.retryAfter && { retryAfter: err.retryAfter }),
  });
};
