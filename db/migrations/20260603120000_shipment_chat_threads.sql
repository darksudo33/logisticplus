-- Shipment-specific company chat threads.
-- Additive only: keeps existing direct/group chat rows and adds canonical shipment threads.

ALTER TABLE chat_threads
  ADD COLUMN IF NOT EXISTS shipment_id TEXT REFERENCES shipments(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chat_threads_type_check'
  ) THEN
    ALTER TABLE chat_threads DROP CONSTRAINT chat_threads_type_check;
  END IF;

  ALTER TABLE chat_threads
    ADD CONSTRAINT chat_threads_type_check CHECK (type IN ('DM', 'GROUP', 'CHANNEL', 'SHIPMENT'));
END $$;

CREATE INDEX IF NOT EXISTS chat_threads_org_shipment_idx
  ON chat_threads (organization_id, shipment_id)
  WHERE shipment_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS chat_threads_org_shipment_active_uidx
  ON chat_threads (organization_id, shipment_id)
  WHERE shipment_id IS NOT NULL
    AND type = 'SHIPMENT'
    AND archived_at IS NULL;
