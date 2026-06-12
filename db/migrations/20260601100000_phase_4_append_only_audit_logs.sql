CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  organization_id TEXT REFERENCES organizations(id) ON DELETE SET NULL,
  actor_user_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  actor_type TEXT NOT NULL DEFAULT 'system',
  event_type TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  request_id TEXT,
  ip TEXT,
  user_agent TEXT,
  before_json JSONB,
  after_json JSONB,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_logs_organization_idx
  ON audit_logs (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS audit_logs_actor_user_idx
  ON audit_logs (actor_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS audit_logs_event_type_idx
  ON audit_logs (event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS audit_logs_resource_idx
  ON audit_logs (resource_type, resource_id, created_at DESC);

CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx
  ON audit_logs (created_at DESC);

CREATE OR REPLACE FUNCTION prevent_audit_logs_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only';
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'audit_logs_prevent_update'
      AND tgrelid = 'audit_logs'::regclass
  ) THEN
    CREATE TRIGGER audit_logs_prevent_update
    BEFORE UPDATE ON audit_logs
    FOR EACH ROW
    EXECUTE FUNCTION prevent_audit_logs_mutation();
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'audit_logs_prevent_delete'
      AND tgrelid = 'audit_logs'::regclass
  ) THEN
    CREATE TRIGGER audit_logs_prevent_delete
    BEFORE DELETE ON audit_logs
    FOR EACH ROW
    EXECUTE FUNCTION prevent_audit_logs_mutation();
  END IF;
END $$;
