const db            = require('../../config/db');
const { upsertSession } = require('../../db/queries/sessions');
const { save: saveMessage } = require('../../db/queries/messages');
const kafkaProducer = require('../../services/KafkaProducer');
const logger        = require('../../config/logger');

// Persists the completed chat exchange:
//   1. Upserts the chat session row (create or touch last_active_at).
//   2. Saves user and assistant messages to PostgreSQL (inside withTenant for RLS).
//   3. Appends both turns to the Redis context window.
//   4. Fires a chat_events Kafka message for analytics (fire-and-forget).
class PersistHandler {
  constructor({ contextWindow }) {
    this.contextWindow = contextWindow;
  }

  async handle(ctx) {
    const {
      tenantId, sessionId, message,
      responseText = '', chunks = [], latencyMs,
    } = ctx;

    const visitorId    = ctx.req.body.visitorId ?? 'anonymous';
    const tokensUsed   = Math.ceil((message.length + responseText.length) / 4);
    const sourceChunks = chunks.map(({ docId, filename, chunkIndex, score }) => ({
      docId, filename, chunkIndex, score,
    }));

    // ── DB writes (RLS-scoped transaction) ───────────────────────────────────
    await db.withTenant(tenantId, async (client) => {
      await upsertSession(client, { id: sessionId, tenantId, visitorId });
      await saveMessage(client, { sessionId, tenantId, role: 'user',      content: message });
      await saveMessage(client, {
        sessionId, tenantId, role: 'assistant',
        content: responseText, sourceChunks, tokensUsed, latencyMs,
      });
    });

    // ── Redis context window ─────────────────────────────────────────────────
    await this.contextWindow.append(sessionId, 'user',      message);
    await this.contextWindow.append(sessionId, 'assistant', responseText);

    // ── Kafka analytics event (non-critical) ─────────────────────────────────
    kafkaProducer.publish('chat_events', {
      tenantId, sessionId, tokensUsed, latencyMs,
      chunksUsed: sourceChunks.length,
      timestamp:  new Date().toISOString(),
    }).catch((err) =>
      logger.warn('PersistHandler: Kafka publish failed', { message: err.message })
    );
  }
}

module.exports = PersistHandler;
