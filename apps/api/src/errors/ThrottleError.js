class ThrottleError extends Error {
  constructor(retryAfter = 86400) {
    super('Daily chat limit reached. Please upgrade your plan or try again tomorrow.');
    this.name       = 'ThrottleError';
    this.statusCode = 429;
    this.code       = 'RATE_LIMIT_EXCEEDED';
    this.retryAfter = retryAfter;
  }
}

module.exports = ThrottleError;
// Throllting to add daily chat limit
