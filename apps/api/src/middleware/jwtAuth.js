const jwt = require('jsonwebtoken');
const config = require('../config/env');

module.exports = function jwtAuth(req, res, next) {
  try {
    const header = req.header('authorization');
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or malformed Authorization header' });
    }

    const token = header.slice(7); // strip "Bearer "
    const payload = jwt.verify(token, config.jwt.secret);

    req.tenantId = payload.tenantId;
    req.tenantPlan = payload.plan;
    req.user = payload;

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token', code: 'TOKEN_INVALID' });
    }
    next(err);
  }
};
