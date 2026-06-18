-- Five-pillar shipment statuses and user-managed shipment timers.
-- Forward-safe/idempotent: existing shipment, workflow, kootaj, document, and archive data stays in place.

ALTER TABLE shipments
  ADD COLUMN IF NOT EXISTS timer_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS timer_deadline_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS timer_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS timer_removed_at TIMESTAMPTZ;

UPDATE shipment_v2_profiles
SET sections_json = (sections_json - 'base') || jsonb_build_object(
      'base',
      COALESCE(sections_json->'base', '{}'::jsonb) || jsonb_build_object(
        'currentStage',
        COALESCE(
          NULLIF(sections_json #>> '{base,currentStage}', ''),
          NULLIF(sections_json #>> '{base,statusText}', ''),
          ''
        ),
        'statusText',
        ''
      )
    ),
    updated_at = NOW()
WHERE COALESCE(sections_json #>> '{base,statusText}', '') <> '';

UPDATE shipments
SET status = CASE UPPER(COALESCE(status, ''))
    WHEN 'LOADING' THEN 'LOADING'
    WHEN 'PENDING' THEN 'LOADING'
    WHEN 'BOOKED' THEN 'LOADING'
    WHEN 'IN_TRANSIT' THEN 'IN_TRANSIT'
    WHEN 'ARRIVED' THEN 'ARRIVED'
    WHEN 'KOOTAJ_DONE' THEN 'KOOTAJ_DONE'
    WHEN 'CUSTOMS' THEN 'KOOTAJ_DONE'
    WHEN 'CLEARED' THEN 'KOOTAJ_DONE'
    WHEN 'EXITED' THEN 'EXITED'
    WHEN 'DELIVERED' THEN 'EXITED'
    WHEN 'CLOSED' THEN 'EXITED'
    ELSE 'LOADING'
  END,
  updated_at = NOW()
WHERE status IS NULL
   OR UPPER(status) NOT IN ('LOADING', 'IN_TRANSIT', 'ARRIVED', 'KOOTAJ_DONE', 'EXITED');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'shipments_status_pillar_check'
  ) THEN
    ALTER TABLE shipments
      ADD CONSTRAINT shipments_status_pillar_check
      CHECK (status IN ('LOADING', 'IN_TRANSIT', 'ARRIVED', 'KOOTAJ_DONE', 'EXITED'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS shipments_org_status_active_idx
  ON shipments (organization_id, status, updated_at DESC)
  WHERE archived_at IS NULL AND exited_archived_at IS NULL;

CREATE INDEX IF NOT EXISTS shipments_org_timer_deadline_idx
  ON shipments (organization_id, timer_deadline_at)
  WHERE timer_deadline_at IS NOT NULL AND archived_at IS NULL;
