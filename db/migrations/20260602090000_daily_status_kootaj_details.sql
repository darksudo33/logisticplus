-- Protected daily customs status board extension.
-- Additive only: each board row remains sourced from a real shipment.

CREATE TABLE IF NOT EXISTS shipment_kootaj_details (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  shipment_id TEXT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  commercial_card_id TEXT,
  cotage_number TEXT,
  customs_status TEXT,
  customs_route TEXT,
  customs_office TEXT,
  declaration_reference TEXT,
  container_summary TEXT,
  goods_summary TEXT,
  tax_payment_status TEXT,
  release_status TEXT,
  exit_date TEXT,
  internal_note TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT shipment_kootaj_details_unique_shipment UNIQUE (organization_id, shipment_id),
  CONSTRAINT shipment_kootaj_details_customs_route_check CHECK (customs_route IS NULL OR customs_route IN ('green', 'yellow', 'red')),
  CONSTRAINT shipment_kootaj_details_customs_status_check CHECK (
    customs_status IS NULL OR customs_status IN (
      'not_started',
      'declaration_registered',
      'in_customs_review',
      'documents_required',
      'inspection',
      'duties_pending',
      'ready_for_release',
      'released',
      'exited',
      'blocked'
    )
  ),
  CONSTRAINT shipment_kootaj_details_tax_payment_status_check CHECK (
    tax_payment_status IS NULL OR tax_payment_status IN ('not_started', 'pending', 'in_progress', 'completed', 'blocked', 'not_required', 'paid')
  ),
  CONSTRAINT shipment_kootaj_details_release_status_check CHECK (
    release_status IS NULL OR release_status IN ('not_released', 'ready', 'released', 'exited', 'blocked')
  ),
  CONSTRAINT shipment_kootaj_details_exit_date_check CHECK (
    exit_date IS NULL OR exit_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  )
);

CREATE INDEX IF NOT EXISTS shipment_kootaj_details_org_shipment_idx
  ON shipment_kootaj_details (organization_id, shipment_id);

CREATE INDEX IF NOT EXISTS shipment_kootaj_details_org_updated_idx
  ON shipment_kootaj_details (organization_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS shipment_kootaj_details_org_cotage_idx
  ON shipment_kootaj_details (organization_id, cotage_number)
  WHERE cotage_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS shipment_kootaj_details_org_commercial_card_idx
  ON shipment_kootaj_details (organization_id, commercial_card_id)
  WHERE commercial_card_id IS NOT NULL;
