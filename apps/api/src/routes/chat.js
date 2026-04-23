const router   = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const apiKeyAuth = require('../middleware/apiKeyAuth');
const jwtAuth  = require('../middleware/jwtAuth');
const pipeline = require('../pipeline/chatPipeline');
const logger   = require('../config/logger');

// POST /api/chat/message — widget-facing, api-key auth, SSE response
router.post('/message', apiKeyAuth, async (req, res, next) => {
  try {
    const ctx = {
      req, res,
      message:   req.body.message,
      sessionId: req.body.sessionId ?? uuidv4(),
      startedAt: Date.now(),
    };
    await pipeline.run(ctx);
    res.end();
  } catch (err) {
    // If streaming already started, headers are sent — log and close gracefully.
    if (res.headersSent) {
      logger.error('Pipeline error after SSE stream started', { message: err.message });
      res.end();
    } else {
      next(err);
    }
  }
});

// GET /api/chat/sessions — dashboard, JWT auth
router.get('/sessions', jwtAuth, async (req, res, next) => {
  try {
    const { pool } = require('../config/db');
    const tenantId = req.tenantId;
    const limit    = 20;
    const cursor   = req.query.cursor;

    const params = cursor ? [tenantId, limit + 1, cursor] : [tenantId, limit + 1];
    const cursorClause = cursor ? `AND last_active_at < $3` : '';

    const { rows } = await pool.query(
      `SELECT id, visitor_id, last_active_at, created_at
       FROM chat_sessions
       WHERE tenant_id = $1 ${cursorClause}
       ORDER BY last_active_at DESC
       LIMIT $2`,
      params
    );

    const hasMore = rows.length > limit;
    const sessions = rows.slice(0, limit);

    res.json({
      sessions,
      pagination: {
        hasMore,
        nextCursor: hasMore ? sessions[sessions.length - 1].last_active_at : null,
      },
    });
  } catch (err) { next(err); }
});

// GET /api/chat/sessions/:id/messages — dashboard, JWT auth
router.get('/sessions/:id/messages', jwtAuth, async (req, res, next) => {
  try {
    const { pool } = require('../config/db');
    const tenantId = req.tenantId;
    const { id }   = req.params;

    const { rows: session } = await pool.query(
      `SELECT id FROM chat_sessions WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );
    if (!session.length) return res.status(404).json({ error: 'Session not found' });

    const { rows: messages } = await pool.query(
      `SELECT id, role, content, created_at
       FROM messages
       WHERE session_id = $1
       ORDER BY created_at ASC`,
      [id]
    );

    res.json({ messages });
  } catch (err) { next(err); }
});

module.exports = router;
