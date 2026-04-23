-- Enable Row-Level Security on every table that holds tenant data.
-- The API sets SET LOCAL app.tenant_id = $tenantId at the start of each
-- transaction (see db.withTenant). Even if a query omits a WHERE clause,
-- PostgreSQL enforces isolation at the engine level.

ALTER TABLE documents       ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_sessions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages        ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_usage_log ENABLE ROW LEVEL SECURITY;

-- FORCE RLS applies the policy even to the table owner (superuser bypass off).
ALTER TABLE documents       FORCE ROW LEVEL SECURITY;
ALTER TABLE chat_sessions   FORCE ROW LEVEL SECURITY;
ALTER TABLE messages        FORCE ROW LEVEL SECURITY;
ALTER TABLE analytics_daily FORCE ROW LEVEL SECURITY;
ALTER TABLE tenant_usage_log FORCE ROW LEVEL SECURITY;

-- Isolation policies — one policy per table, same predicate everywhere.
CREATE POLICY tenant_isolation ON documents
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

CREATE POLICY tenant_isolation ON chat_sessions
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

CREATE POLICY tenant_isolation ON messages
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

CREATE POLICY tenant_isolation ON analytics_daily
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

CREATE POLICY tenant_isolation ON tenant_usage_log
  USING (tenant_id = current_setting('app.tenant_id')::uuid);
