CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS ai_business_search_index (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  title TEXT NOT NULL,
  search_text TEXT NOT NULL,
  safe_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  action_url TEXT,
  source_updated_at TIMESTAMPTZ,
  indexed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  search_vector TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('simple', COALESCE(title, '') || ' ' || COALESCE(search_text, ''))
  ) STORED,
  CONSTRAINT ai_business_search_index_entity_type_check CHECK (
    entity_type IN ('shipment', 'customer', 'commercial_card', 'document', 'workflow_item', 'cheque')
  ),
  CONSTRAINT ai_business_search_index_entity_unique UNIQUE (organization_id, entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS ai_business_search_index_org_type_updated_idx
  ON ai_business_search_index (organization_id, entity_type, source_updated_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS ai_business_search_index_org_entity_idx
  ON ai_business_search_index (organization_id, entity_type, entity_id);

CREATE INDEX IF NOT EXISTS ai_business_search_index_vector_idx
  ON ai_business_search_index USING GIN (search_vector);

CREATE INDEX IF NOT EXISTS ai_business_search_index_search_text_trgm_idx
  ON ai_business_search_index USING GIN (search_text gin_trgm_ops);

CREATE INDEX IF NOT EXISTS ai_business_search_index_title_trgm_idx
  ON ai_business_search_index USING GIN (title gin_trgm_ops);
