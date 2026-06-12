-- Secure company chat foundation.
-- Additive only: preserves existing legacy chat rows while enabling tenant-scoped V1 chat.

ALTER TABLE chat_threads
  ADD COLUMN IF NOT EXISTS direct_key TEXT,
  ADD COLUMN IF NOT EXISTS last_message_id TEXT,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

ALTER TABLE chat_thread_members
  ADD COLUMN IF NOT EXISTS organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'member',
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS added_by_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS removed_by_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS removed_at TIMESTAMPTZ;

UPDATE chat_thread_members m
SET organization_id = t.organization_id
FROM chat_threads t
WHERE m.thread_id = t.id
  AND m.organization_id IS NULL
  AND t.organization_id IS NOT NULL;

ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS body TEXT,
  ADD COLUMN IF NOT EXISTS body_format TEXT NOT NULL DEFAULT 'plain_text',
  ADD COLUMN IF NOT EXISTS client_message_id TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'sent',
  ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

UPDATE chat_messages
SET body = content
WHERE body IS NULL;

CREATE TABLE IF NOT EXISTS chat_message_read_receipts (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  thread_id TEXT NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  message_id TEXT NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (message_id, user_id)
);

CREATE TABLE IF NOT EXISTS chat_message_events (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  thread_id TEXT NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  message_id TEXT REFERENCES chat_messages(id) ON DELETE CASCADE,
  actor_user_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS chat_threads_org_direct_key_uidx
  ON chat_threads (organization_id, direct_key)
  WHERE direct_key IS NOT NULL AND archived_at IS NULL;

CREATE INDEX IF NOT EXISTS chat_threads_org_updated_idx
  ON chat_threads (organization_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS chat_thread_members_org_user_status_idx
  ON chat_thread_members (organization_id, user_id, status);

CREATE INDEX IF NOT EXISTS chat_thread_members_thread_status_idx
  ON chat_thread_members (thread_id, status);

CREATE INDEX IF NOT EXISTS chat_messages_org_thread_created_idx
  ON chat_messages (organization_id, thread_id, created_at DESC);

CREATE INDEX IF NOT EXISTS chat_read_receipts_org_thread_user_idx
  ON chat_message_read_receipts (organization_id, thread_id, user_id);

CREATE INDEX IF NOT EXISTS chat_message_events_org_thread_created_idx
  ON chat_message_events (organization_id, thread_id, created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chat_threads_type_check'
  ) THEN
    ALTER TABLE chat_threads
      ADD CONSTRAINT chat_threads_type_check CHECK (type IN ('DM', 'GROUP', 'CHANNEL'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chat_thread_members_role_check'
  ) THEN
    ALTER TABLE chat_thread_members
      ADD CONSTRAINT chat_thread_members_role_check CHECK (role IN ('owner', 'admin', 'member'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chat_thread_members_status_check'
  ) THEN
    ALTER TABLE chat_thread_members
      ADD CONSTRAINT chat_thread_members_status_check CHECK (status IN ('active', 'removed'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chat_messages_body_length_check'
  ) THEN
    ALTER TABLE chat_messages
      ADD CONSTRAINT chat_messages_body_length_check CHECK (body IS NULL OR (char_length(body) BETWEEN 1 AND 4000));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chat_messages_body_format_check'
  ) THEN
    ALTER TABLE chat_messages
      ADD CONSTRAINT chat_messages_body_format_check CHECK (body_format = 'plain_text');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chat_messages_status_check'
  ) THEN
    ALTER TABLE chat_messages
      ADD CONSTRAINT chat_messages_status_check CHECK (status IN ('sent', 'deleted'));
  END IF;
END $$;
