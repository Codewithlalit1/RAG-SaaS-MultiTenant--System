CREATE TABLE IF NOT EXISTS chat_sessions (
  id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID          NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  visitor_id     VARCHAR(255)  NOT NULL,
  metadata       JSONB         NOT NULL DEFAULT '{}',
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT now(),
  last_active_at TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- Used by session list sorted by last activity (cursor on last_active_at)
CREATE INDEX IF NOT EXISTS idx_sessions_tenant
  ON chat_sessions (tenant_id, last_active_at DESC);
