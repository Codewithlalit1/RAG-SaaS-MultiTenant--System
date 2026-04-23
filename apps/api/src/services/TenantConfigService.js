const redis      = require('../config/redis');
const { findById } = require('../db/queries/tenants');
const logger     = require('../config/logger');

const CACHE_TTL = 300; // 5 minutes

const cacheKey = (tenantId) => `tenant:config:${tenantId}`;

// getConfig(tenantId) — returns the full tenant row.
// Cache-aside: Redis hit returns immediately; on miss queries Postgres and
// writes the result back to Redis for subsequent calls.
async function getConfig(tenantId) {
  const cached = await redis.get(cacheKey(tenantId));
  if (cached) {
    logger.debug('TenantConfigService: cache hit', { tenantId });
    return JSON.parse(cached);
  }

  const tenant = await findById(tenantId);
  if (tenant) {
    await redis.setex(cacheKey(tenantId), CACHE_TTL, JSON.stringify(tenant));
  }
  return tenant ?? null;
}

// invalidateCache(tenantId) — must be called after any widget_config update
// so the next getConfig() re-reads from Postgres.
async function invalidateCache(tenantId) {
  await redis.del(cacheKey(tenantId));
  logger.debug('TenantConfigService: cache invalidated', { tenantId });
}

module.exports = { getConfig, invalidateCache };
