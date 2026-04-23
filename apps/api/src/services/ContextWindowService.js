const redis  = require('../config/redis');
const config = require('../config/env');

// How many messages to keep in the sliding window.
// contextWindowTurns = 6 turns × 2 roles = 12 messages max.
const MAX_MESSAGES = config.rag.contextWindowTurns * 2;
const SESSION_TTL  = 3600; // 1 hour of inactivity before expiry

function sessionKey(sessionId) {
  return `session:ctx:${sessionId}`;
}

// Returns ordered array of { role, content } objects for the session.
// Empty array for unknown or expired sessions.
async function getHistory(sessionId) {
  const raw = await redis.lrange(sessionKey(sessionId), 0, -1);
  return raw.map((item) => JSON.parse(item));
}

// Appends one message turn, trims to MAX_MESSAGES, and refreshes the TTL.
async function push(sessionId, role, content) {
  const key = sessionKey(sessionId);
  await redis.rpush(key, JSON.stringify({ role, content }));
  await redis.ltrim(key, -MAX_MESSAGES, -1);
  await redis.expire(key, SESSION_TTL);
}

// Alias kept for pipeline handler compatibility.
const append = push;

module.exports = { getHistory, push, append };
