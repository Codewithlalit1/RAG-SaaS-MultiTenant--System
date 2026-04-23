// All functions take a pg client acquired via db.withTenant(tenantId, cb).
// RLS on the documents table ensures queries are scoped to the current tenant
// even without an explicit WHERE tenant_id = ... clause.

// insert a new document row — status starts as 'processing'
async function create(client, { tenantId, docId, filename, s3Key, mimeType }) {
  const { rows } = await client.query(
    `INSERT INTO documents (id, tenant_id, filename, s3_key, mime_type, status)
     VALUES ($1, $2, $3, $4, $5, 'processing')
     RETURNING *`,
    [docId, tenantId, filename, s3Key, mimeType]
  );
  return rows[0];
}

// Update status and optionally chunk/token counts after ingestion
async function updateStatus(client, { id, status, chunkCount, tokenCount }) {
  const { rows } = await client.query(
    `UPDATE documents
     SET status      = $2,
         chunk_count = COALESCE($3, chunk_count),
         token_count = COALESCE($4, token_count)
     WHERE id = $1
     RETURNING *`,
    [id, status, chunkCount ?? null, tokenCount ?? null]
  );
  return rows[0] || null;
}

// Cursor-paginated list, newest first.
// cursor = ISO timestamp of the last item seen (null for first page).
// Returns limit+1 rows — caller checks hasMore and slices.
async function findByTenant(client, { tenantId, cursor = null, limit = 20 } = {}) {
  const { rows } = await client.query(
    `SELECT id, filename, chunk_count, token_count, status, mime_type, s3_key, created_at
     FROM   documents
     WHERE  tenant_id = $1
     AND    ($2::timestamptz IS NULL OR created_at < $2)
     ORDER  BY created_at DESC
     LIMIT  $3`,
    [tenantId, cursor, limit + 1]
  );
  return rows;
}

async function findById(client, { id, tenantId }) {
  const { rows } = await client.query(
    `SELECT * FROM documents WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );
  return rows[0] || null;
}

async function remove(client, { id, tenantId }) {
  const { rows } = await client.query(
    `DELETE FROM documents WHERE id = $1 AND tenant_id = $2 RETURNING *`,
    [id, tenantId]
  );
  return rows[0] || null;
}

module.exports = { create, updateStatus, findByTenant, findById, remove };
