DROP INDEX IF EXISTS shipments_org_shipment_code_unique_idx;

CREATE UNIQUE INDEX shipments_org_shipment_code_unique_idx
  ON shipments (organization_id, shipment_code)
  WHERE organization_id IS NOT NULL
    AND archived_at IS NULL;
