-- Tenants are the root entity — one row per business that signed up.
-- No RLS here: this table is queried during API key resolution before
-- a tenant context is established.

CREATE TABLE IF NOT EXISTS tenants (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  name             VARCHAR(255)  NOT NULL,
  plan             VARCHAR(30)   NOT NULL DEFAULT 'starter'
                                 CHECK (plan IN ('starter', 'growth', 'business')),
  api_key          VARCHAR(64)   NOT NULL UNIQUE,
  widget_config    JSONB         NOT NULL DEFAULT '{}',
  vertical         VARCHAR(50)   NOT NULL DEFAULT 'generic'
                                 CHECK (vertical IN ('ecommerce', 'tech', 'healthcare', 'generic')),
  daily_chat_limit INTEGER       NOT NULL DEFAULT 50,
  doc_limit        INTEGER       NOT NULL DEFAULT 5,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenants_api_key ON tenants (api_key);
