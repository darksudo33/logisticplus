-- Safe exited-shipment archive metadata for long-term post-exit follow-up.
-- Additive/idempotent: shipments, documents, chat, workflow, and audit history remain in place.

ALTER TABLE shipments
  ADD COLUMN IF NOT EXISTS exited_archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS exited_archived_by_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS exited_archive_reason TEXT,
  ADD COLUMN IF NOT EXISTS post_exit_status TEXT,
  ADD COLUMN IF NOT EXISTS post_exit_note TEXT,
  ADD COLUMN IF NOT EXISTS post_exit_follow_up_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS post_exit_closed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS post_exit_closed_by_id TEXT REFERENCES app_users(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'shipments_post_exit_status_check'
  ) THEN
    ALTER TABLE shipments
      ADD CONSTRAINT shipments_post_exit_status_check
      CHECK (
        post_exit_status IS NULL OR post_exit_status IN (
          'needs_follow_up',
          'in_progress',
          'settled',
          'closed'
        )
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS shipments_org_exited_archive_idx
  ON shipments (organization_id, exited_archived_at DESC, updated_at DESC)
  WHERE exited_archived_at IS NOT NULL AND archived_at IS NULL;

CREATE INDEX IF NOT EXISTS shipments_org_active_not_exited_idx
  ON shipments (organization_id, updated_at DESC)
  WHERE archived_at IS NULL AND exited_archived_at IS NULL;

CREATE INDEX IF NOT EXISTS shipments_org_post_exit_follow_up_idx
  ON shipments (organization_id, post_exit_status, post_exit_follow_up_at)
  WHERE exited_archived_at IS NOT NULL AND archived_at IS NULL;
