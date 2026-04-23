const RateLimiter = require('../../services/RateLimiter');

// Enforces the per-tenant daily chat limit before any LLM work is done.
// Runs early in the pipeline so a 429 can still be returned as a normal
// JSON response (SSE headers have not been written yet).
// consume() throws ThrottleError directly when the limit is exceeded.
class RateLimitHandler {
  async handle(ctx) {
    await RateLimiter.consume(ctx.tenantId, ctx.tenantPlan);
  }
}

module.exports = RateLimitHandler;
