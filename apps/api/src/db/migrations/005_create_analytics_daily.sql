-- One row per tenant per day — upserted by the analytics Kafka consumer.
CREATE TABLE IF NOT EXISTS analytics_daily (
  id                   UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID    NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  date                 DATE    NOT NULL,
  chat_count           INTEGER NOT NULL DEFAULT 0,
  message_count        INTEGER NOT NULL DEFAULT 0,
  tokens_used          INTEGER NOT NULL DEFAULT 0,
  avg_latency_ms       FLOAT   NOT NULL DEFAULT 0,
  avg_retrieval_score  FLOAT   NOT NULL DEFAULT 0,
  fallback_count       INTEGER NOT NULL DEFAULT 0
);

-- Dashboard chart queries (last 30 days per tenant)
CREATE INDEX IF NOT EXISTS idx_analytics_tenant_date
  ON analytics_daily (tenant_id, date DESC);

-- Ensures the Kafka consumer upsert never creates duplicate daily rows
CREATE UNIQUE INDEX IF NOT EXISTS idx_analytics_unique
  ON analytics_daily (tenant_id, date);

-- Append-only log for per-action usage tracking and daily aggregation jobs.
CREATE TABLE IF NOT EXISTS tenant_usage_log (
  id         BIGSERIAL    PRIMARY KEY,
  tenant_id  UUID         NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  action     VARCHAR(50)  NOT NULL
             CHECK (action IN ('chat.message', 'doc.upload', 'doc.delete')),
  tokens     INTEGER,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Range scans for daily aggregation
CREATE INDEX IF NOT EXISTS idx_usage_log_tenant_date
  ON tenant_usage_log (tenant_id, created_at DESC);
