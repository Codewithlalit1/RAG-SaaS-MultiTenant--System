const crypto = require('crypto');
const { findByApiKey } = require('../db/queries/tenants');
const logger = require('../config/logger');

// Deterministic SHA-256 hash of the plaintext key.
// bcrypt is unsuitable for API key lookup — it is non-deterministic (random salt),
// so you cannot find the DB row without knowing the tenantId first.
// SHA-256 is the industry-standard choice for API key storage and lookup.
function hashApiKey(plainKey) {
  return crypto.createHash('sha256').update(plainKey).digest('hex');
}

module.exports = async function apiKeyAuth(req, res, next) {
  try {
    const apiKey = req.header('x-api-key');
    if (!apiKey) {
      return res.status(401).json({ error: 'Missing x-api-key header' });
    }

    const hash = hashApiKey(apiKey);
    const tenant = await findByApiKey(hash);

    if (!tenant) {
      // Log the IP but never the key itself — even a partial key is sensitive
      logger.warn('API key auth failed — unknown key', { ip: req.ip });
      return res.status(401).json({ error: 'Invalid API key' });
    }

    req.tenantId = tenant.id;
    req.tenantPlan = tenant.plan;
    req.tenantConfig = tenant;

    // RLS enforcement: route handlers that query the DB must use
    // db.withTenant(req.tenantId, callback), which runs
    //   SET LOCAL app.tenant_id = $1
    // inside a transaction before executing queries.

    next();
  } catch (err) {
    next(err);
  }
};
