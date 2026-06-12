-- Shipment Module V2 operational profile storage.
-- Additive only: legacy shipment detail, Kootaj Daily, documents, workflow, and archive flows stay unchanged.

CREATE TABLE IF NOT EXISTS shipment_v2_profiles (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  shipment_id TEXT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  flow_code TEXT NOT NULL,
  sections_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  updated_by_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT shipment_v2_profiles_unique_shipment UNIQUE (organization_id, shipment_id),
  CONSTRAINT shipment_v2_profiles_flow_code_check CHECK (flow_code IN ('IMPORT_LANJ', 'IMPORT_SHIP')),
  CONSTRAINT shipment_v2_profiles_sections_object_check CHECK (jsonb_typeof(sections_json) = 'object')
);

CREATE INDEX IF NOT EXISTS shipment_v2_profiles_org_updated_idx
  ON shipment_v2_profiles (organization_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS shipment_v2_profiles_org_flow_idx
  ON shipment_v2_profiles (organization_id, flow_code, updated_at DESC);

CREATE INDEX IF NOT EXISTS shipment_v2_profiles_sections_gin_idx
  ON shipment_v2_profiles USING GIN (sections_json);
