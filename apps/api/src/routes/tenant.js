// Tenant routes — protected by jwtAuth (applied globally in app.js).
//   GET /api/tenant/config — widget configuration
//   PUT /api/tenant/config — update config + invalidate Redis cache
//   GET /api/tenant/usage  — daily used vs plan limit
const router = require('express').Router();
const { updateConfig } = require('../db/queries/tenants');
const TenantConfigService = require('../services/TenantConfigService');
const RateLimiter         = require('../services/RateLimiter');

// Allowed keys in widget_config.  Rejects unknown keys to prevent arbitrary
// data being stored in the JSONB column.
const ALLOWED_WIDGET_KEYS = new Set([
  'tone', 'language', 'greeting', 'fallbackMessage', 'primaryColor', 'position',
]);

function validateWidgetConfig(cfg) {
  if (typeof cfg !== 'object' || cfg === null || Array.isArray(cfg)) {
    return 'widget_config must be a JSON object';
  }
  const unknown = Object.keys(cfg).filter((k) => !ALLOWED_WIDGET_KEYS.has(k));
  if (unknown.length) return `Unknown widget_config fields: ${unknown.join(', ')}`;
  if (cfg.tone     && typeof cfg.tone     !== 'string') return 'tone must be a string';
  if (cfg.language && typeof cfg.language !== 'string') return 'language must be a string';
  if (cfg.greeting && typeof cfg.greeting !== 'string') return 'greeting must be a string';
  return null;
}

// Returns the tenant's name, vertical, and widget_config from the cache-aside layer.
router.get('/config', async (req, res, next) => {
  try {
    const tenant = await TenantConfigService.getConfig(req.tenantId);
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

    res.json({
      name:          tenant.name,
      vertical:      tenant.vertical,
      widget_config: tenant.widget_config ?? {},
    });
  } catch (err) { next(err); }
});

// Replaces widget_config, then invalidates the Redis cache so the next read
// re-fetches from Postgres.
router.put('/config', async (req, res, next) => {
  try {
    const { widget_config } = req.body;

    const validationError = validateWidgetConfig(widget_config);
    if (validationError) return res.status(400).json({ error: validationError });

    await updateConfig(req.tenantId, widget_config);
    await TenantConfigService.invalidateCache(req.tenantId);

    res.json({ ok: true, widget_config });
  } catch (err) { next(err); }
});

// Returns the current usage counters without incrementing them.
router.get('/usage', async (req, res, next) => {
  try {
    const usage = await RateLimiter.check(req.tenantId, req.tenantPlan);
    res.json(usage);
  } catch (err) { next(err); }
});

module.exports = router;
