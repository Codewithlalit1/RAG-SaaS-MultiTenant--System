const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const router = require('express').Router();

const { create, findByApiKey } = require('../db/queries/tenants');
const config = require('../config/env');
const logger = require('../config/logger');

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Generates a cryptographically random API key.
// Format: rsk_{48 hex chars} — 52 chars total, well within VARCHAR(64).
function generateApiKey() {
  return `rsk_${crypto.randomBytes(24).toString('hex')}`;
}

// SHA-256 hash stored in DB — see apiKeyAuth.js for rationale.
function hashApiKey(plainKey) {
  return crypto.createHash('sha256').update(plainKey).digest('hex');
}

function signAccess(tenantId, plan) {
  return jwt.sign({ tenantId, plan }, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  });
}

function signRefresh(tenantId) {
  return jwt.sign({ tenantId, type: 'refresh' }, config.jwt.secret, {
    expiresIn: config.jwt.refreshExpiresIn,
  });
}

const REFRESH_COOKIE = 'rsk_refresh';
const COOKIE_OPTS = {
  httpOnly: true,
  secure: config.nodeEnv === 'production',
  sameSite: 'strict',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
  path: '/auth/refresh',            // limit cookie scope
};

// ─── Routes ───────────────────────────────────────────────────────────────────

// POST /auth/register
// Body: { name, plan?, vertical? }
// Creates a tenant, generates an API key, returns it ONCE (not stored in plaintext).
router.post('/register', async (req, res, next) => {
  try {
    const { name, plan = 'starter', vertical = 'generic' } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'name is required' });
    }

    const validPlans = ['starter', 'growth', 'business'];
    if (!validPlans.includes(plan)) {
      return res.status(400).json({ error: `plan must be one of: ${validPlans.join(', ')}` });
    }

    const validVerticals = ['ecommerce', 'tech', 'healthcare', 'generic'];
    if (!validVerticals.includes(vertical)) {
      return res.status(400).json({ error: `vertical must be one of: ${validVerticals.join(', ')}` });
    }

    const plainApiKey = generateApiKey();
    const apiKeyHash = hashApiKey(plainApiKey);

    const tenant = await create({
      name: name.trim(),
      plan,
      vertical,
      apiKeyHash,
    });

    const accessToken = signAccess(tenant.id, tenant.plan);
    const refreshToken = signRefresh(tenant.id);

    res.cookie(REFRESH_COOKIE, refreshToken, COOKIE_OPTS);

    logger.info('Tenant registered', { tenantId: tenant.id, plan: tenant.plan });

    // plainApiKey is shown ONCE — the tenant must store it securely.
    // It cannot be recovered after this response.
    return res.status(201).json({
      tenant: {
        id: tenant.id,
        name: tenant.name,
        plan: tenant.plan,
        vertical: tenant.vertical,
      },
      apiKey: plainApiKey,
      accessToken,
    });
  } catch (err) {
    next(err);
  }
});

// POST /auth/login
// Body: { apiKey }
// The API key is the tenant's credential — it doubles as widget embed key and dashboard password.
router.post('/login', async (req, res, next) => {
  try {
    const { apiKey } = req.body;

    if (!apiKey || typeof apiKey !== 'string') {
      return res.status(400).json({ error: 'apiKey is required' });
    }

    const hash = hashApiKey(apiKey);
    const tenant = await findByApiKey(hash);

    if (!tenant) {
      // Uniform message — do not reveal whether the tenant exists
      return res.status(401).json({ error: 'Invalid API key' });
    }

    const accessToken = signAccess(tenant.id, tenant.plan);
    const refreshToken = signRefresh(tenant.id);

    res.cookie(REFRESH_COOKIE, refreshToken, COOKIE_OPTS);

    logger.info('Tenant logged in', { tenantId: tenant.id });

    return res.json({
      tenant: {
        id: tenant.id,
        name: tenant.name,
        plan: tenant.plan,
        vertical: tenant.vertical,
      },
      accessToken,
    });
  } catch (err) {
    next(err);
  }
});

// POST /auth/refresh
// Reads the httpOnly refresh cookie, verifies it, returns a new access token.
// Does NOT rotate the refresh token — rotation would require server-side storage.
router.post('/refresh', async (req, res, next) => {
  try {
    const refreshToken = req.cookies?.[REFRESH_COOKIE];

    if (!refreshToken) {
      return res.status(401).json({ error: 'No refresh token', code: 'NO_REFRESH_TOKEN' });
    }

    let payload;
    try {
      payload = jwt.verify(refreshToken, config.jwt.secret);
    } catch (err) {
      res.clearCookie(REFRESH_COOKIE, { path: COOKIE_OPTS.path });
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Refresh token expired', code: 'REFRESH_EXPIRED' });
      }
      return res.status(401).json({ error: 'Invalid refresh token', code: 'REFRESH_INVALID' });
    }

    if (payload.type !== 'refresh') {
      return res.status(401).json({ error: 'Invalid token type', code: 'REFRESH_INVALID' });
    }

    const accessToken = signAccess(payload.tenantId, payload.plan);

    return res.json({ accessToken });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
