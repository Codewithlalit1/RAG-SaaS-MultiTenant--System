// Analytics Kafka consumer — runs as a standalone process.
// Start: node src/workers/analyticsWorker.js
//
// Consumes:
//   chat_events  — upserts analytics_daily row + updates Redis today-hash
//   doc_ingested — acknowledged, reserved for future document analytics
//
// Manual offset commit: offsets are committed only after a successful DB write
// so no event is silently dropped on crash/restart.

const kafka  = require('../config/kafka');
const db     = require('../config/db');
const redis  = require('../config/redis');
const logger = require('../config/logger');

const GROUP_ID = 'analytics-group';
const TOPICS   = ['chat_events', 'doc_ingested'];

const consumer = kafka.consumer({ groupId: GROUP_ID });

// ── chat_events handler ────────────────────────────────────────────────────────
//
// Payload shape (from PersistHandler):
//   { tenantId, sessionId, tokensUsed, latencyMs, chunksUsed, timestamp }
//
// analytics_daily upsert uses EXCLUDED aliases for the inserted values so the
// running-average formula reads the pre-update count from the existing row.
async function handleChatEvent(payload) {
  const {
    tenantId,
    tokensUsed   = 0,
    latencyMs    = 0,
    timestamp,
  } = payload;

  if (!tenantId) {
    logger.warn('analyticsWorker: chat_events message missing tenantId — skipping');
    return;
  }

  // Use the event timestamp's calendar date so late-arriving messages land on
  // the correct day rather than the worker's processing date.
  const date = (timestamp ?? new Date().toISOString()).slice(0, 10);

  // ── Postgres upsert (inside withTenant for RLS) ────────────────────────────
  await db.withTenant(tenantId, async (client) => {
    await client.query(
      `INSERT INTO analytics_daily
         (tenant_id, date, chat_count, message_count, tokens_used, avg_latency_ms)
       VALUES ($1, $2, 1, 1, $3, $4)
       ON CONFLICT (tenant_id, date) DO UPDATE SET
         chat_count     = analytics_daily.chat_count    + 1,
         message_count  = analytics_daily.message_count + 1,
         tokens_used    = analytics_daily.tokens_used   + EXCLUDED.tokens_used,
         avg_latency_ms = (
           analytics_daily.avg_latency_ms * analytics_daily.chat_count
           + EXCLUDED.avg_latency_ms
         ) / (analytics_daily.chat_count + 1)`,
      [tenantId, date, tokensUsed, latencyMs]
    );
  });

  // ── Redis real-time hash (today's running counters for the dashboard) ──────
  // Key expires after 24 h from the first write of the day (NX flag).
  const statsKey = `tenant:stats:${tenantId}:today`;
  await redis.multi()
    .hincrby(statsKey, 'messages', 1)
    .hincrby(statsKey, 'tokens',   tokensUsed)
    .expire(statsKey, 86400, 'NX')
    .exec();

  logger.debug('analyticsWorker: chat_event processed', { tenantId, date, tokensUsed });
}

// ── doc_ingested handler ───────────────────────────────────────────────────────
// Consumed so the topic offset advances; document-level analytics can be added here later.
async function handleDocIngested(payload) {
  logger.debug('analyticsWorker: doc_ingested acknowledged', {
    docId:    payload.docId,
    tenantId: payload.tenantId,
  });
}

// ── Message dispatch ───────────────────────────────────────────────────────────
const HANDLERS = {
  chat_events:  handleChatEvent,
  doc_ingested: handleDocIngested,
};

// ── Main ───────────────────────────────────────────────────────────────────────
async function start() {
  await consumer.connect();
  logger.info('analyticsWorker: consumer connected', { group: GROUP_ID, topics: TOPICS });

  await consumer.subscribe({ topics: TOPICS, fromBeginning: false });

  await consumer.run({
    // autoCommit: false — we commit after a successful DB write so a crash
    // before commit causes the message to be redelivered, not silently lost.
    autoCommit: false,

    eachMessage: async ({ topic, partition, message }) => {
      const rawValue = message.value?.toString();
      const offset   = message.offset;

      // ── Parse ──────────────────────────────────────────────────────────────
      let payload;
      try {
        payload = JSON.parse(rawValue);
      } catch (err) {
        logger.error('analyticsWorker: unparseable message — committing to skip', {
          topic, partition, offset, error: err.message,
        });
        // Commit past the bad message so the consumer doesn't get stuck.
        await commitOffset(topic, partition, offset);
        return;
      }

      // ── Process ────────────────────────────────────────────────────────────
      try {
        const handler = HANDLERS[topic];
        if (handler) await handler(payload);

        // Commit only after the handler completes without throwing.
        await commitOffset(topic, partition, offset);
      } catch (err) {
        // Do NOT commit — the message will be redelivered on restart.
        logger.error('analyticsWorker: handler failed — offset not committed', {
          topic, partition, offset,
          tenantId: payload?.tenantId,
          error: err.message,
        });
      }
    },
  });
}

// KafkaJS offsets are committed as (current offset + 1) — the position of the
// next message to fetch, not the one just processed.
async function commitOffset(topic, partition, offset) {
  await consumer.commitOffsets([
    { topic, partition, offset: String(Number(offset) + 1) },
  ]);
}

// ── Graceful shutdown ─────────────────────────────────────────────────────────
async function shutdown(signal) {
  logger.info(`analyticsWorker: ${signal} received — shutting down`);
  try {
    await consumer.disconnect();
    await redis.client.quit();
    await db.pool.end();
    logger.info('analyticsWorker: all connections closed');
    process.exit(0);
  } catch (err) {
    logger.error('analyticsWorker: error during shutdown', { message: err.message });
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

start().catch((err) => {
  logger.error('analyticsWorker: fatal startup error', { message: err.message });
  process.exit(1);
});
