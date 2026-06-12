CREATE TABLE IF NOT EXISTS malvani_profiles (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  display_name TEXT NOT NULL,
  captain_name TEXT NOT NULL DEFAULT '',
  lenj_name TEXT NOT NULL DEFAULT '',
  lenj_registration_number TEXT NOT NULL DEFAULT '',
  lenj_type TEXT,
  home_port TEXT,
  active_status TEXT NOT NULL DEFAULT 'ACTIVE',
  note TEXT NOT NULL DEFAULT '',
  created_by_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  updated_by_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ,
  CONSTRAINT malvani_profiles_active_status_check CHECK (active_status IN ('ACTIVE', 'INACTIVE', 'NEEDS_REVIEW'))
);

CREATE INDEX IF NOT EXISTS malvani_profiles_org_active_idx
  ON malvani_profiles (organization_id, active_status, updated_at DESC)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS malvani_profiles_org_archived_idx
  ON malvani_profiles (organization_id, archived_at, updated_at DESC);

CREATE TABLE IF NOT EXISTS business_entity_contacts (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  role_title TEXT NOT NULL DEFAULT '',
  phone_number TEXT NOT NULL,
  phone_label TEXT,
  note TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  updated_by_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ,
  CONSTRAINT business_entity_contacts_entity_type_check CHECK (entity_type IN ('commercial_card', 'malvani')),
  CONSTRAINT business_entity_contacts_sort_order_check CHECK (sort_order >= 0)
);

CREATE INDEX IF NOT EXISTS business_entity_contacts_entity_idx
  ON business_entity_contacts (organization_id, entity_type, entity_id, sort_order ASC, created_at ASC)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS business_entity_contacts_org_archived_idx
  ON business_entity_contacts (organization_id, archived_at, updated_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS business_entity_contacts_primary_idx
  ON business_entity_contacts (organization_id, entity_type, entity_id)
  WHERE is_primary IS TRUE AND archived_at IS NULL;
