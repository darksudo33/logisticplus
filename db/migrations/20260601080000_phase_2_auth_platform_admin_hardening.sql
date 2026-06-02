-- Phase 2 auth/platform-admin hardening.
-- Additive only: creates explicit user permission grants and session revocation.

ALTER TABLE app_sessions
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS app_sessions_active_token_hash_idx
  ON app_sessions (token_hash)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS user_permissions (
  user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  permission_id TEXT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  granted_by_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, permission_id)
);

CREATE INDEX IF NOT EXISTS user_permissions_permission_idx
  ON user_permissions (permission_id);

INSERT INTO permissions (id, key, description)
VALUES ('perm-platform-admin', 'platform.admin', 'Access platform-wide administration APIs')
ON CONFLICT (key) DO UPDATE SET
  description = EXCLUDED.description;

INSERT INTO user_permissions (user_id, permission_id, reason)
SELECT u.id, p.id, 'Phase 2 migration: existing platform owner explicit grant'
FROM app_users u
CROSS JOIN permissions p
WHERE p.key = 'platform.admin'
  AND (u.id = 'u1' OR lower(u.email) = 'darksudo22@gmail.com')
ON CONFLICT (user_id, permission_id) DO NOTHING;
