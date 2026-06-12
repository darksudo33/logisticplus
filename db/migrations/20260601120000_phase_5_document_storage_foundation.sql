-- Phase 5 document storage foundation.
-- Additive metadata only: keeps existing local storage_key values and does not
-- delete or rewrite document bytes.

ALTER TABLE IF EXISTS documents
  ADD COLUMN IF NOT EXISTS storage_provider TEXT NOT NULL DEFAULT 'local',
  ADD COLUMN IF NOT EXISTS object_key TEXT,
  ADD COLUMN IF NOT EXISTS storage_bucket TEXT,
  ADD COLUMN IF NOT EXISTS storage_region TEXT,
  ADD COLUMN IF NOT EXISTS local_path TEXT,
  ADD COLUMN IF NOT EXISTS checksum_sha256 TEXT,
  ADD COLUMN IF NOT EXISTS size_bytes BIGINT,
  ADD COLUMN IF NOT EXISTS content_type TEXT,
  ADD COLUMN IF NOT EXISTS storage_migrated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS storage_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS storage_migration_status TEXT NOT NULL DEFAULT 'local',
  ADD COLUMN IF NOT EXISTS storage_migration_error TEXT;

ALTER TABLE IF EXISTS document_versions
  ADD COLUMN IF NOT EXISTS storage_provider TEXT NOT NULL DEFAULT 'local',
  ADD COLUMN IF NOT EXISTS object_key TEXT,
  ADD COLUMN IF NOT EXISTS storage_bucket TEXT,
  ADD COLUMN IF NOT EXISTS storage_region TEXT,
  ADD COLUMN IF NOT EXISTS local_path TEXT,
  ADD COLUMN IF NOT EXISTS checksum_sha256 TEXT,
  ADD COLUMN IF NOT EXISTS size_bytes BIGINT,
  ADD COLUMN IF NOT EXISTS content_type TEXT,
  ADD COLUMN IF NOT EXISTS storage_migrated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS storage_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS storage_migration_status TEXT NOT NULL DEFAULT 'local',
  ADD COLUMN IF NOT EXISTS storage_migration_error TEXT;

UPDATE documents
SET
  storage_provider = COALESCE(NULLIF(storage_provider, ''), 'local'),
  local_path = COALESCE(local_path, storage_key),
  checksum_sha256 = COALESCE(checksum_sha256, checksum),
  content_type = COALESCE(content_type, mime_type),
  storage_migration_status = COALESCE(NULLIF(storage_migration_status, ''), 'local')
WHERE storage_provider IS NULL
   OR storage_provider = ''
   OR local_path IS NULL
   OR checksum_sha256 IS NULL
   OR content_type IS NULL
   OR storage_migration_status IS NULL
   OR storage_migration_status = '';

UPDATE document_versions v
SET
  storage_provider = COALESCE(NULLIF(v.storage_provider, ''), d.storage_provider, 'local'),
  local_path = COALESCE(v.local_path, v.storage_key),
  checksum_sha256 = COALESCE(v.checksum_sha256, d.checksum_sha256, d.checksum),
  size_bytes = COALESCE(v.size_bytes, d.size_bytes),
  content_type = COALESCE(v.content_type, d.content_type, d.mime_type),
  storage_migration_status = COALESCE(NULLIF(v.storage_migration_status, ''), 'local')
FROM documents d
WHERE d.id = v.document_id
  AND (
    v.storage_provider IS NULL
    OR v.storage_provider = ''
    OR v.local_path IS NULL
    OR v.checksum_sha256 IS NULL
    OR v.size_bytes IS NULL
    OR v.content_type IS NULL
    OR v.storage_migration_status IS NULL
    OR v.storage_migration_status = ''
  );

CREATE INDEX IF NOT EXISTS documents_storage_migration_status_idx
  ON documents (storage_migration_status, updated_at DESC);

CREATE INDEX IF NOT EXISTS documents_object_key_idx
  ON documents (object_key)
  WHERE object_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS document_versions_storage_migration_status_idx
  ON document_versions (storage_migration_status, created_at DESC);

CREATE INDEX IF NOT EXISTS document_versions_object_key_idx
  ON document_versions (object_key)
  WHERE object_key IS NOT NULL;
