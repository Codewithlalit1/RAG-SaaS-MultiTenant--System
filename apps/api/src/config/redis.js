// Redis singleton (ioredis).
// Key patterns used across the codebase:
//   rate:{tenantId}:daily           INTEGER  TTL 86400s  — daily chat counter
//   tenant:config:{tenantId}        JSON     TTL 300s    — cached tenant config
//   session:ctx:{sessionId}         LIST     TTL 3600s   — conversation history
//   embed:cache:{sha256(query)}     JSON     TTL 300s    — cached query embedding
//   doc:status:{docId}              STRING   TTL 3600s   — ingestion progress
//   tenant:stats:{tenantId}:today   HASH     TTL 86400s  — real-time daily stats

const Redis = require('ioredis');
const config = require('./env');
const logger = require('./logger');

const client = new Redis(config.redisUrl, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: false,
  retryStrategy: (times) => Math.min(times * 200, 2000),
});

client.on('ready', () => {
  logger.info('Redis connected', { url: config.redisUrl });
});

client.on('error', (err) => {
  logger.error('Redis error', { message: err.message });
});

client.on('reconnecting', (ms) => {
  logger.warn('Redis reconnecting', { retryIn: `${ms}ms` });
});

// ─── String operations ────────────────────────────────────────────────────────

async function get(key) {
  try {
    return await client.get(key);
  } catch (err) {
    logger.error('Redis GET failed', { key, message: err.message });
    throw err;
  }
}

// set(key, value) — persists with no expiry
async function set(key, value) {
  try {
    return await client.set(key, value);
  } catch (err) {
    logger.error('Redis SET failed', { key, message: err.message });
    throw err;
  }
}

// setex(key, ttlSeconds, value) — persists with TTL
async function setex(key, ttlSeconds, value) {
  try {
    return await client.setex(key, ttlSeconds, value);
  } catch (err) {
    logger.error('Redis SETEX failed', { key, ttlSeconds, message: err.message });
    throw err;
  }
}

async function del(key) {
  try {
    return await client.del(key);
  } catch (err) {
    logger.error('Redis DEL failed', { key, message: err.message });
    throw err;
  }
}

// ─── Counter / TTL operations ─────────────────────────────────────────────────

async function incr(key) {
  try {
    return await client.incr(key);
  } catch (err) {
    logger.error('Redis INCR failed', { key, message: err.message });
    throw err;
  }
}

// expire(key, ttlSeconds, mode?) — mode is optional NX/XX/GT/LT flag
async function expire(key, ttlSeconds, mode) {
  try {
    return mode
      ? await client.expire(key, ttlSeconds, mode)
      : await client.expire(key, ttlSeconds);
  } catch (err) {
    logger.error('Redis EXPIRE failed', { key, ttlSeconds, message: err.message });
    throw err;
  }
}

async function ttl(key) {
  try {
    return await client.ttl(key);
  } catch (err) {
    logger.error('Redis TTL failed', { key, message: err.message });
    throw err;
  }
}

// ─── List operations (session context window) ─────────────────────────────────

// lrange(key, start, stop) — fetches slice of list; use (key, 0, -1) for all
async function lrange(key, start, stop) {
  try {
    return await client.lrange(key, start, stop);
  } catch (err) {
    logger.error('Redis LRANGE failed', { key, message: err.message });
    throw err;
  }
}

async function rpush(key, ...values) {
  try {
    return await client.rpush(key, ...values);
  } catch (err) {
    logger.error('Redis RPUSH failed', { key, message: err.message });
    throw err;
  }
}

// ltrim(key, start, stop) — trims list to [start, stop] in place
async function ltrim(key, start, stop) {
  try {
    return await client.ltrim(key, start, stop);
  } catch (err) {
    logger.error('Redis LTRIM failed', { key, message: err.message });
    throw err;
  }
}

// ─── Hash operations (tenant daily stats) ─────────────────────────────────────

async function hget(key, field) {
  try {
    return await client.hget(key, field);
  } catch (err) {
    logger.error('Redis HGET failed', { key, field, message: err.message });
    throw err;
  }
}

async function hgetall(key) {
  try {
    return await client.hgetall(key);
  } catch (err) {
    logger.error('Redis HGETALL failed', { key, message: err.message });
    throw err;
  }
}

async function hincrby(key, field, increment) {
  try {
    return await client.hincrby(key, field, increment);
  } catch (err) {
    logger.error('Redis HINCRBY failed', { key, field, message: err.message });
    throw err;
  }
}

// ─── Pipeline (atomic multi-command) ─────────────────────────────────────────
// Returns a raw ioredis pipeline. Chain commands then call .exec().
// Example: redis.multi().incr(key).expire(key, 86400, 'NX').exec()
function multi() {
  return client.multi();
}

module.exports = {
  // Raw client — use only when a wrapper above doesn't cover the command
  client,
  // Wrappers
  get,
  set,
  setex,
  del,
  incr,
  expire,
  ttl,
  lrange,
  rpush,
  ltrim,
  hget,
  hgetall,
  hincrby,
  multi,
};
