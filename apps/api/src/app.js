const path     = require('path');
const express  = require('express');
const helmet   = require('helmet');
const cors     = require('cors');
const cookieParser = require('cookie-parser');

const authRoutes = require('./routes/auth');
const chatRoutes = require('./routes/chat');
const documentsRoutes = require('./routes/documents');
const analyticsRoutes = require('./routes/analytics');
const tenantRoutes = require('./routes/tenant');

const jwtAuth = require('./middleware/jwtAuth');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// ─── Global middleware ────────────────────────────────────────────────────────

app.use(helmet());

// /api/chat/message must accept requests from any domain (widget is embedded everywhere)
const widgetCors = cors({ origin: '*' });
app.options('/api/chat/message', widgetCors);
app.use('/api/chat/message', widgetCors);

app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,          // needed for httpOnly refresh cookie
}));
app.use(cookieParser());      // populates req.cookies — required by POST /auth/refresh
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));

// ─── Public routes ────────────────────────────────────────────────────────────

// Serve widget.js with permissive CORS so any customer domain can load it
app.get('/widget.js', (_req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.sendFile(path.join(__dirname, '../public/widget.js'));
});

app.get('/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// Auth: register, login, refresh — no auth middleware required
app.use('/auth', authRoutes);

// ─── Widget-facing chat endpoint (api-key auth) ───────────────────────────────
// POST /api/chat/message uses x-api-key header auth (embedded in the widget).
// GET  /api/chat/sessions and GET /api/chat/sessions/:id/messages use JWT.
// The chat router applies the correct middleware per-route internally.
app.use('/api/chat', chatRoutes);

// ─── Dashboard routes (JWT required) ─────────────────────────────────────────

// POST /api/documents/upload uses apiKeyAuth; all other doc routes use jwtAuth.
// Auth is applied per-route inside the documents router.
app.use('/api/documents', documentsRoutes);
app.use('/api/analytics', jwtAuth, analyticsRoutes);
app.use('/api/tenant',    jwtAuth, tenantRoutes);

// ─── Error handler (must be last) ────────────────────────────────────────────

app.use(errorHandler);

module.exports = app;
