CREATE TABLE IF NOT EXISTS messages (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID         NOT NULL REFERENCES chat_sessions (id) ON DELETE CASCADE,
  -- Denormalised: allows fast tenant-scoped queries and is required by RLS policy
  tenant_id     UUID         NOT NULL REFERENCES tenants (id),
  role          VARCHAR(10)  NOT NULL CHECK (role IN ('user', 'assistant')),
  content       TEXT         NOT NULL,
  source_chunks JSONB        NOT NULL DEFAULT '[]',
  tokens_used   INTEGER,
  latency_ms    INTEGER,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Primary cursor for paginated message history within a session
CREATE INDEX IF NOT EXISTS idx_messages_session
  ON messages (session_id, created_at DESC);

-- Tenant-scoped history queries and RLS filter
CREATE INDEX IF NOT EXISTS idx_messages_tenant
  ON messages (tenant_id, created_at DESC);
