const redis        = require('../config/redis');
const logger       = require('../config/logger');
const ThrottleError = require('../errors/ThrottleError');

// Plan limits mirror PLAN_LIMITS in db/queries/tenants.js.
const PLAN_LIMITS = {
  starter:  50,
  growth:   2000,
  business: 999999,
};

// consume(tenantId, plan)
//
// Atomically increments the daily counter via MULTI and sets a 24-hour expiry
// only on the first call (NX flag prevents resetting the window on each hit).
// Throws ThrottleError with the actual TTL as retryAfter when the limit is
// exceeded so the client knows exactly when the window resets.
async function consume(tenantId, plan) {
  const limit = PLAN_LIMITS[plan] ?? PLAN_LIMITS.starter;
  const key   = `rate:${tenantId}:daily`;

  const [[, count]] = await redis.multi()
    .incr(key)
    .expire(key, 86400, 'NX')
    .exec();

  if (count > limit) {
    logger.warn('RateLimiter: daily limit exceeded', { tenantId, plan, count, limit });
    const retryAfter = await redis.ttl(key);
    throw new ThrottleError(retryAfter > 0 ? retryAfter : 86400);
  }
}

// check(tenantId, plan) → { used, limit, remaining, resetAt }
//
// Non-destructive read — does not increment the counter.
// Used by GET /api/tenant/usage.
async function check(tenantId, plan) {
  const limit = PLAN_LIMITS[plan] ?? PLAN_LIMITS.starter;
  const key   = `rate:${tenantId}:daily`;

  const [rawCount, ttl] = await Promise.all([
    redis.get(key),
    redis.ttl(key),
  ]);

  const used     = rawCount ? parseInt(rawCount, 10) : 0;
  const ttlSecs  = ttl > 0 ? ttl : 86400;

  return {
    used,
    limit,
    remaining: Math.max(0, limit - used),
    resetAt:   new Date(Date.now() + ttlSecs * 1000).toISOString(),
  };
}

module.exports = { consume, check };
