-- Strict Shamsi shipment code support.
-- Additive for legacy shipment rows: metadata columns are nullable until a row
-- is created or explicitly edited through the strict shipment-code service.

ALTER TABLE shipments
  ADD COLUMN IF NOT EXISTS shamsi_year INTEGER,
  ADD COLUMN IF NOT EXISTS shamsi_date TEXT,
  ADD COLUMN IF NOT EXISTS shamsi_sequence INTEGER;

CREATE TABLE IF NOT EXISTS shipment_code_counters (
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  shamsi_year INTEGER NOT NULL,
  last_sequence INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (organization_id, shamsi_year),
  CONSTRAINT shipment_code_counters_year_check CHECK (shamsi_year BETWEEN 1200 AND 1600),
  CONSTRAINT shipment_code_counters_sequence_check CHECK (last_sequence BETWEEN 0 AND 999)
);

ALTER TABLE shipments
  DROP CONSTRAINT IF EXISTS shipments_shipment_code_key;

CREATE UNIQUE INDEX IF NOT EXISTS shipments_org_shipment_code_unique_idx
  ON shipments (organization_id, shipment_code)
  WHERE organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS shipments_org_shamsi_year_idx
  ON shipments (organization_id, shamsi_year);

CREATE INDEX IF NOT EXISTS shipments_org_shamsi_date_idx
  ON shipments (organization_id, shamsi_date);
