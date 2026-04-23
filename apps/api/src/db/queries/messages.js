// save — inserts one message row.  Must be called inside db.withTenant() so
// the RLS policy (tenant_id = current_setting('app.tenant_id')) allows the write.
async function save(client, {
  sessionId,
  tenantId,
  role,
  content,
  sourceChunks = [],
  tokensUsed   = null,
  latencyMs    = null,
}) {
  const { rows } = await client.query(
    `INSERT INTO messages
       (session_id, tenant_id, role, content, source_chunks, tokens_used, latency_ms)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, created_at`,
    [sessionId, tenantId, role, content, JSON.stringify(sourceChunks), tokensUsed, latencyMs]
  );
  return rows[0];
}

// listBySession — paginated  message history for a session (newest-first).
// cursor is the ISO timestamp of the last item from the previous page.
async function listBySession(client, sessionId, { cursor, limit = 50 } = {}) {
  const params = [sessionId, limit + 1];
  let sql = `SELECT id, role, content, source_chunks, tokens_used, latency_ms, created_at
             FROM messages
             WHERE session_id = $1`;

  if (cursor) {
    params.push(cursor);
    sql += ` AND created_at < $${params.length}`;
  }

  sql += ` ORDER BY created_at DESC LIMIT $2`;

  const { rows } = await client.query(sql, params);
  const hasMore  = rows.length > limit;

  return {
    messages:   hasMore ? rows.slice(0, limit) : rows,
    hasMore,
    nextCursor: hasMore ? rows[limit - 1].created_at.toISOString() : null,
  };
}

module.exports = { save, listBySession };
