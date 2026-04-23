// upsertSession — creates the session row on first message; refreshes
// last_active_at on every subsequent message so sessions stay queryable.
async function upsertSession(client, { id, tenantId, visitorId }) {
  const { rows } = await client.query(
    `INSERT INTO chat_sessions (id, tenant_id, visitor_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (id) DO UPDATE SET last_active_at = now()
     RETURNING id`,
    [id, tenantId, visitorId]
  );
  return rows[0];
}

module.exports = { upsertSession };
