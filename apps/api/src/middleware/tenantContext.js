// tenantContext middleware — enforces PostgreSQL Row-Level Security.
// Must run AFTER apiKeyAuth or jwtAuth have populated req.tenantId.
// Opens a DB transaction and runs: SET LOCAL app.tenant_id = $1
// so that every subsequent query in this request is scoped by the RLS policy.
//
// See Section 6 of the blueprint — this is the DB-layer half of defence in depth.

const db = require('../config/db');

module.exports = function tenantContext(req, res, next) {
  if (!req.tenantId) {
    return res.status(401).json({ error: 'Tenant context missing' });
  }

  // TODO: consider whether to open a transaction per request here, or let
  // individual handlers use db.withTenant(tenantId, cb) where needed.
  // Pattern-A (transaction per request) is simpler; Pattern-B (explicit)
  // avoids long-held connections for streaming endpoints.
  next();
};
