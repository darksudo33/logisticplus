-- Canonical Iran import customs workflow and task assignment history.
-- Additive only: existing shipment steps in user_records remain untouched.

CREATE TABLE IF NOT EXISTS shipment_workflow_instances (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  shipment_id TEXT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  workflow_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  current_step_code TEXT,
  customs_route TEXT,
  started_by_user_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT shipment_workflow_instances_workflow_key_nonempty CHECK (length(trim(workflow_key)) > 0),
  CONSTRAINT shipment_workflow_instances_status_check CHECK (status IN ('active', 'completed', 'cancelled')),
  CONSTRAINT shipment_workflow_instances_customs_route_check CHECK (customs_route IS NULL OR customs_route IN ('green', 'yellow', 'red')),
  CONSTRAINT shipment_workflow_instances_unique_workflow UNIQUE (organization_id, shipment_id, workflow_key)
);

CREATE TABLE IF NOT EXISTS shipment_workflow_step_states (
  workflow_instance_id TEXT NOT NULL REFERENCES shipment_workflow_instances(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  shipment_id TEXT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  step_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  is_visible BOOLEAN NOT NULL DEFAULT TRUE,
  is_exceptional BOOLEAN NOT NULL DEFAULT FALSE,
  internal_note TEXT,
  public_note TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  completed_by_user_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workflow_instance_id, step_code),
  CONSTRAINT shipment_workflow_step_states_status_check CHECK (status IN ('pending', 'active', 'completed', 'skipped'))
);

CREATE TABLE IF NOT EXISTS shipment_workflow_blockers (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workflow_instance_id TEXT NOT NULL REFERENCES shipment_workflow_instances(id) ON DELETE CASCADE,
  shipment_id TEXT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  step_code TEXT,
  blocker_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  internal_note TEXT,
  public_note TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_by_user_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT shipment_workflow_blockers_status_check CHECK (status IN ('open', 'resolved', 'cancelled')),
  CONSTRAINT shipment_workflow_blockers_code_check CHECK (blocker_code ~ '^B(0[1-9]|[12][0-9]|30)$')
);

CREATE TABLE IF NOT EXISTS shipment_workflow_events (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workflow_instance_id TEXT NOT NULL REFERENCES shipment_workflow_instances(id) ON DELETE CASCADE,
  shipment_id TEXT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  step_code TEXT,
  blocker_id TEXT REFERENCES shipment_workflow_blockers(id) ON DELETE SET NULL,
  blocker_code TEXT,
  actor_user_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  internal_note TEXT,
  public_note TEXT,
  public_visible BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE IF EXISTS tasks
  ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS assignment_note TEXT,
  ADD COLUMN IF NOT EXISTS completed_by_user_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS workflow_instance_id TEXT REFERENCES shipment_workflow_instances(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS workflow_step_code TEXT,
  ADD COLUMN IF NOT EXISTS workflow_blocker_id TEXT REFERENCES shipment_workflow_blockers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS blocker_code TEXT;

UPDATE tasks
SET assigned_at = COALESCE(assigned_at, created_at)
WHERE assigned_to_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS task_events (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  shipment_id TEXT REFERENCES shipments(id) ON DELETE SET NULL,
  workflow_instance_id TEXT REFERENCES shipment_workflow_instances(id) ON DELETE SET NULL,
  workflow_step_code TEXT,
  workflow_blocker_id TEXT REFERENCES shipment_workflow_blockers(id) ON DELETE SET NULL,
  blocker_code TEXT,
  actor_user_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  from_assignee_user_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  to_assignee_user_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  from_status TEXT,
  to_status TEXT,
  note TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS shipment_workflow_instances_org_shipment_idx
  ON shipment_workflow_instances (organization_id, shipment_id);
CREATE INDEX IF NOT EXISTS shipment_workflow_instances_org_updated_idx
  ON shipment_workflow_instances (organization_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS shipment_workflow_step_states_org_shipment_idx
  ON shipment_workflow_step_states (organization_id, shipment_id);
CREATE INDEX IF NOT EXISTS shipment_workflow_step_states_instance_status_idx
  ON shipment_workflow_step_states (workflow_instance_id, status);
CREATE INDEX IF NOT EXISTS shipment_workflow_step_states_visible_idx
  ON shipment_workflow_step_states (workflow_instance_id, is_visible, step_code);
CREATE INDEX IF NOT EXISTS shipment_workflow_blockers_org_shipment_idx
  ON shipment_workflow_blockers (organization_id, shipment_id, created_at DESC);
CREATE INDEX IF NOT EXISTS shipment_workflow_blockers_open_idx
  ON shipment_workflow_blockers (organization_id, shipment_id, workflow_instance_id)
  WHERE status = 'open';
CREATE INDEX IF NOT EXISTS shipment_workflow_events_instance_created_idx
  ON shipment_workflow_events (workflow_instance_id, created_at DESC);
CREATE INDEX IF NOT EXISTS shipment_workflow_events_org_shipment_idx
  ON shipment_workflow_events (organization_id, shipment_id, created_at DESC);

CREATE INDEX IF NOT EXISTS tasks_org_assigned_status_idx
  ON tasks (organization_id, assigned_to_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS tasks_org_assigned_by_idx
  ON tasks (organization_id, assigned_by_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS tasks_org_shipment_idx
  ON tasks (organization_id, shipment_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS tasks_workflow_step_idx
  ON tasks (organization_id, workflow_instance_id, workflow_step_code);
CREATE INDEX IF NOT EXISTS tasks_workflow_blocker_idx
  ON tasks (organization_id, workflow_blocker_id);
CREATE INDEX IF NOT EXISTS task_events_task_created_idx
  ON task_events (task_id, created_at DESC);
CREATE INDEX IF NOT EXISTS task_events_org_created_idx
  ON task_events (organization_id, created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tasks_workflow_instance_id_fkey') THEN
    ALTER TABLE tasks
      ADD CONSTRAINT tasks_workflow_instance_id_fkey
      FOREIGN KEY (workflow_instance_id) REFERENCES shipment_workflow_instances(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tasks_workflow_blocker_id_fkey') THEN
    ALTER TABLE tasks
      ADD CONSTRAINT tasks_workflow_blocker_id_fkey
      FOREIGN KEY (workflow_blocker_id) REFERENCES shipment_workflow_blockers(id) ON DELETE SET NULL;
  END IF;
END $$;
