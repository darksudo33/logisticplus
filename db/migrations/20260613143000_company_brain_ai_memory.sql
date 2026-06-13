CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS organization_ai_memory (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  memory_type TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  facts JSONB NOT NULL DEFAULT '{}'::jsonb,
  search_text TEXT NOT NULL,
  source_version TEXT,
  source_hash TEXT,
  source_updated_at TIMESTAMPTZ,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  stale_after TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  search_vector TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('simple', COALESCE(title, '') || ' ' || COALESCE(summary, '') || ' ' || COALESCE(search_text, ''))
  ) STORED,
  CONSTRAINT organization_ai_memory_type_check CHECK (
    memory_type IN ('company_summary', 'daily_summary', 'operational_snapshot')
  ),
  CONSTRAINT organization_ai_memory_org_type_unique UNIQUE (organization_id, memory_type)
);

CREATE INDEX IF NOT EXISTS organization_ai_memory_org_idx
  ON organization_ai_memory (organization_id);

CREATE INDEX IF NOT EXISTS organization_ai_memory_org_type_idx
  ON organization_ai_memory (organization_id, memory_type);

CREATE INDEX IF NOT EXISTS organization_ai_memory_updated_idx
  ON organization_ai_memory (organization_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS organization_ai_memory_generated_idx
  ON organization_ai_memory (organization_id, generated_at DESC);

CREATE INDEX IF NOT EXISTS organization_ai_memory_vector_idx
  ON organization_ai_memory USING GIN (search_vector);

CREATE INDEX IF NOT EXISTS organization_ai_memory_search_text_trgm_idx
  ON organization_ai_memory USING GIN (search_text gin_trgm_ops);

CREATE INDEX IF NOT EXISTS organization_ai_memory_title_trgm_idx
  ON organization_ai_memory USING GIN (title gin_trgm_ops);

CREATE TABLE IF NOT EXISTS organization_ai_memory_items (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  entity_code TEXT,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  facts JSONB NOT NULL DEFAULT '{}'::jsonb,
  search_text TEXT NOT NULL,
  source_updated_at TIMESTAMPTZ,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source_hash TEXT,
  stale_after TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  search_vector TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('simple', COALESCE(title, '') || ' ' || COALESCE(summary, '') || ' ' || COALESCE(search_text, ''))
  ) STORED,
  CONSTRAINT organization_ai_memory_items_entity_type_check CHECK (
    entity_type IN ('shipment', 'customer', 'commercial_card', 'document', 'workflow_item', 'task', 'cheque')
  ),
  CONSTRAINT organization_ai_memory_items_entity_unique UNIQUE (organization_id, entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS organization_ai_memory_items_org_idx
  ON organization_ai_memory_items (organization_id);

CREATE INDEX IF NOT EXISTS organization_ai_memory_items_org_type_idx
  ON organization_ai_memory_items (organization_id, entity_type);

CREATE INDEX IF NOT EXISTS organization_ai_memory_items_org_entity_idx
  ON organization_ai_memory_items (organization_id, entity_type, entity_id);

CREATE INDEX IF NOT EXISTS organization_ai_memory_items_org_type_updated_idx
  ON organization_ai_memory_items (organization_id, entity_type, source_updated_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS organization_ai_memory_items_updated_idx
  ON organization_ai_memory_items (organization_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS organization_ai_memory_items_generated_idx
  ON organization_ai_memory_items (organization_id, generated_at DESC);

CREATE INDEX IF NOT EXISTS organization_ai_memory_items_vector_idx
  ON organization_ai_memory_items USING GIN (search_vector);

CREATE INDEX IF NOT EXISTS organization_ai_memory_items_search_text_trgm_idx
  ON organization_ai_memory_items USING GIN (search_text gin_trgm_ops);

CREATE INDEX IF NOT EXISTS organization_ai_memory_items_title_trgm_idx
  ON organization_ai_memory_items USING GIN (title gin_trgm_ops);
