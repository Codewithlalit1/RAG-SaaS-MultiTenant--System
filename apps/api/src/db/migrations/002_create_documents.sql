CREATE TABLE IF NOT EXISTS documents (
  id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID          NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  filename     VARCHAR(500)  NOT NULL,
  s3_key       TEXT          NOT NULL,
  mime_type    VARCHAR(100)  NOT NULL,
  chunk_count  INTEGER       NOT NULL DEFAULT 0,
  token_count  INTEGER       NOT NULL DEFAULT 0,
  status       VARCHAR(20)   NOT NULL DEFAULT 'uploading'
               CHECK (status IN ('uploading', 'processing', 'indexed', 'failed')),
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- Used by paginated document list (cursor on created_at) and RLS filter
CREATE INDEX IF NOT EXISTS idx_documents_tenant
  ON documents (tenant_id, created_at DESC);
