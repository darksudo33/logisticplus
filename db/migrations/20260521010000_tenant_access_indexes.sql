-- Tenant access-path indexes for common lookup, list, and active-record queries.
-- The public tracking token hash is unique when present; nulls remain allowed.

ALTER TABLE IF EXISTS document_versions
  ADD COLUMN IF NOT EXISTS organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM shipments
    WHERE customer_access_token_hash IS NOT NULL
    GROUP BY customer_access_token_hash
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate shipment customer_access_token_hash values must be resolved before adding the unique public tracking index.';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS app_users_org_id_idx ON app_users (organization_id, id);
CREATE INDEX IF NOT EXISTS customers_org_id_idx ON customers (organization_id, id);
CREATE INDEX IF NOT EXISTS shipments_org_id_idx ON shipments (organization_id, id);
CREATE INDEX IF NOT EXISTS tasks_org_id_idx ON tasks (organization_id, id);
CREATE INDEX IF NOT EXISTS documents_org_id_idx ON documents (organization_id, id);
CREATE INDEX IF NOT EXISTS document_versions_org_document_idx ON document_versions (organization_id, document_id);
CREATE INDEX IF NOT EXISTS cheques_org_id_idx ON cheques (organization_id, id);
CREATE INDEX IF NOT EXISTS compliance_meetings_org_id_idx ON compliance_meetings (organization_id, id);
CREATE INDEX IF NOT EXISTS quotations_org_id_idx ON quotations (organization_id, id);
CREATE INDEX IF NOT EXISTS archive_records_org_entity_lookup_idx ON archive_records (organization_id, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS billing_payments_org_id_idx ON billing_payments (organization_id, id);
CREATE INDEX IF NOT EXISTS billing_invoices_org_id_idx ON billing_invoices (organization_id, id);

CREATE INDEX IF NOT EXISTS app_users_org_created_idx ON app_users (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS customers_org_created_idx ON customers (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS shipments_org_created_idx ON shipments (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS tasks_org_created_idx ON tasks (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS documents_org_created_idx ON documents (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS cheques_org_created_idx ON cheques (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS compliance_meetings_org_created_idx ON compliance_meetings (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS quotations_org_created_idx ON quotations (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS customers_org_active_updated_idx
  ON customers (organization_id, updated_at DESC)
  WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS shipments_org_active_updated_idx
  ON shipments (organization_id, updated_at DESC)
  WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS documents_org_active_updated_idx
  ON documents (organization_id, updated_at DESC)
  WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS cheques_org_active_updated_idx
  ON cheques (organization_id, updated_at DESC)
  WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS compliance_meetings_org_active_updated_idx
  ON compliance_meetings (organization_id, updated_at DESC)
  WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS quotations_org_active_updated_idx
  ON quotations (organization_id, updated_at DESC)
  WHERE archived_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS shipments_customer_access_token_hash_unique_idx
  ON shipments (customer_access_token_hash)
  WHERE customer_access_token_hash IS NOT NULL;
