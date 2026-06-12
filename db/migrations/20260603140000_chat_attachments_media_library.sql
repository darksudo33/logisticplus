-- Additive only: secure internal chat attachments and CEO-only media library permissions.

CREATE TABLE IF NOT EXISTS chat_message_attachments (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  thread_id TEXT NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  message_id TEXT NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  uploaded_by_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  storage_provider TEXT NOT NULL DEFAULT 'local',
  storage_bucket TEXT,
  storage_region TEXT,
  storage_key TEXT,
  object_key TEXT,
  local_path TEXT,
  checksum_sha256 TEXT,
  original_filename TEXT NOT NULL,
  file_name TEXT,
  content_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL DEFAULT 0,
  attachment_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  deleted_by_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  deleted_reason TEXT,
  storage_deleted_at TIMESTAMPTZ,
  storage_delete_error TEXT,
  CONSTRAINT chat_message_attachments_type_check CHECK (attachment_type IN ('image', 'document')),
  CONSTRAINT chat_message_attachments_size_check CHECK (size_bytes >= 0)
);

CREATE INDEX IF NOT EXISTS chat_message_attachments_org_created_idx
  ON chat_message_attachments (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS chat_message_attachments_message_idx
  ON chat_message_attachments (message_id);

CREATE INDEX IF NOT EXISTS chat_message_attachments_thread_idx
  ON chat_message_attachments (organization_id, thread_id, created_at DESC);

CREATE INDEX IF NOT EXISTS chat_message_attachments_active_idx
  ON chat_message_attachments (organization_id, attachment_type, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS chat_message_attachments_deleted_idx
  ON chat_message_attachments (organization_id, deleted_at DESC)
  WHERE deleted_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS chat_message_attachments_object_key_idx
  ON chat_message_attachments (object_key)
  WHERE object_key IS NOT NULL;

INSERT INTO permissions (id, key, description)
VALUES
  ('perm-chat-media-view', 'chat.media.view', 'View company chat media library'),
  ('perm-chat-media-delete', 'chat.media.delete', 'Delete company chat media files')
ON CONFLICT (key) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'CEO'
  AND p.key IN ('chat.media.view', 'chat.media.delete')
ON CONFLICT (role_id, permission_id) DO NOTHING;
