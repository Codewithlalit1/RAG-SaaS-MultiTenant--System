// Express middleware wrapper around services/RateLimiter.js.
// Attaches usage info to res headers (X-RateLimit-Remaining, X-RateLimit-Reset).
// On limit breach, responds 429 with Retry-After header.

// TODO: import RateLimiter service once implemented.

module.exports = function rateLimiter(req, res, next) {
  try {
    // const rl = new RateLimiter(redis);
    // const { used, limit, remaining } = await rl.consume(req.tenantId, req.tenantConfig.plan);
    // res.setHeader('X-RateLimit-Remaining', remaining);
    next();
  } catch (err) {
    if (err.statusCode === 429) {
      res.setHeader('Retry-After', err.retryAfter);
      return res.status(429).json({ error: err.message, retryAfter: err.retryAfter });
    }
    next(err);
  }
};
