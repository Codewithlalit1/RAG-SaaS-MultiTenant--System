const { query } = require('../../config/db');

// Plan limits mirror the subscription table in the blueprint (Section 2).
const PLAN_LIMITS = {
  starter:  { daily_chat_limit: 50,     doc_limit: 5   },
  growth:   { daily_chat_limit: 2000,   doc_limit: 100 },
  business: { daily_chat_limit: 999999, doc_limit: 999999 },
};

// Looks up a tenant by the SHA-256 hash of their API key.
// O(1) — api_key column is indexed (see migration 001).
// hashedKey must be crypto.createHash('sha256').update(plainKey).digest('hex').
async function findByApiKey(hashedKey) {
  const { rows } = await query(
    `SELECT id, name, plan, widget_config, vertical, daily_chat_limit, doc_limit
     FROM tenants
     WHERE api_key = $1`,
    [hashedKey]
  );
  return rows[0] || null;
}

async function findById(id) {
  const { rows } = await query(
    `SELECT id, name, plan, widget_config, vertical, daily_chat_limit, doc_limit, created_at
     FROM tenants
     WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
}

// data: { name, plan, vertical, apiKeyHash}
// Limits are set from PLAN_LIMITS based on plan — caller must not pass them.
async function create({ name, plan = 'starter', vertical = 'generic', apiKeyHash }) {
  const limits = PLAN_LIMITS[plan] ?? PLAN_LIMITS.starter;
  const { rows } = await query(
    `INSERT INTO tenants (name, plan, vertical, api_key, daily_chat_limit, doc_limit)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, name, plan, vertical, widget_config, daily_chat_limit, doc_limit, created_at`,
    [name, plan, vertical, apiKeyHash, limits.daily_chat_limit, limits.doc_limit]
  );
  return rows[0];
}

// Replaces the entire widget_config JSONB blob.
// TenantConfigService.invalidateCache(id) must be called after this.
async function updateConfig(id, widgetConfig) {
  const { rows } = await query(
    `UPDATE tenants
     SET widget_config = $1
     WHERE id = $2
     RETURNING id, name, plan, widget_config, vertical`,
    [JSON.stringify(widgetConfig), id]
  );
  return rows[0] || null;
}

module.exports = { findByApiKey, findById, create, updateConfig };
