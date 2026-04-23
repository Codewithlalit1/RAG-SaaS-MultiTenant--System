// Analytics routes — protected by jwtAuth (applied globally in app.js).
//   GET /api/analytics/overview — real-time today stats from Redis hash
//   GET /api/analytics/daily    — 30-day historical data from analytics_daily table
const router = require('express').Router();
const redis  = require('../config/redis');
const db     = require('../config/db');

// Returns today's running totals for the tenant.
// The hash is written by the Kafka chat_events consumer (future worker).
// Until the consumer is live, all values default to zero.
router.get('/overview', async (req, res, next) => {
  try {
    const raw = await redis.hgetall(`tenant:stats:${req.tenantId}:today`);

    res.json({
      overview: {
        messages:     parseInt(raw?.messages     ?? '0', 10),
        tokens:       parseInt(raw?.tokens       ?? '0', 10),
        sessions:     parseInt(raw?.sessions     ?? '0', 10),
        fallbacks:    parseInt(raw?.fallbacks    ?? '0', 10),
        avgLatencyMs: parseFloat(raw?.avgLatencyMs ?? '0'),
      },
    });
  } catch (err) { next(err); }
});

// Returns one row per day for the last 30 days, ordered chronologically.
// Rows are created/upserted by the Kafka consumer aggregation job.
router.get('/daily', async (req, res, next) => {
  try {
    let rows;
    await db.withTenant(req.tenantId, async (client) => {
      const result = await client.query(
        `SELECT date, chat_count, message_count, tokens_used,
                avg_latency_ms, avg_retrieval_score, fallback_count
         FROM analytics_daily
         WHERE tenant_id = $1
           AND date >= CURRENT_DATE - INTERVAL '30 days'
         ORDER BY date ASC`,
        [req.tenantId]
      );
      rows = result.rows;
    });

    res.json({ daily: rows });
  } catch (err) { next(err); }
});

module.exports = router;
