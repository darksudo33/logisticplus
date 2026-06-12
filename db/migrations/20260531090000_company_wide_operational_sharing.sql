-- Company-wide operational sharing for internal company members.
-- Additive only: does not grant platform-admin, user-management, or cheque permissions.

UPDATE user_records ur
SET organization_id = u.organization_id
FROM app_users u
WHERE ur.owner_user_id = u.id
  AND ur.organization_id IS NULL
  AND u.organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS user_records_org_collection_updated_idx
  ON user_records (organization_id, collection, updated_at DESC);

INSERT INTO roles (id, name, description, updated_at)
VALUES
  ('role-ceo', 'CEO', 'Full system access', NOW()),
  ('role-manager', 'MANAGER', 'Operational management access', NOW()),
  ('role-operations', 'OPERATIONS', 'Shipment operations access', NOW()),
  ('role-customer-service', 'CUSTOMER_SERVICE', 'Customer service access', NOW()),
  ('role-finance', 'FINANCE', 'Finance and cheque access', NOW()),
  ('role-quotation-manager', 'QUOTATION_MANAGER', 'Quotation management access', NOW()),
  ('role-compliance-staff', 'COMPLIANCE_STAFF', 'Compliance meeting access', NOW()),
  ('role-employee', 'EMPLOYEE', 'Company employee access', NOW())
ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description,
  updated_at = NOW();

INSERT INTO permissions (id, key, description)
VALUES
  ('perm-archive-view', 'archive.view', 'View company archive'),
  ('perm-changes-view', 'changes.view', 'View company change log'),
  ('perm-chat-use', 'chat.use', 'Use company chat'),
  ('perm-compliance-manage', 'compliance.manage', 'Manage compliance meetings'),
  ('perm-customer-access-manage', 'customer_access.manage', 'Manage customer tracking access'),
  ('perm-customers-create', 'customers.create', 'Create customers'),
  ('perm-customers-update', 'customers.update', 'Update customers'),
  ('perm-customers-view', 'customers.view', 'View customers'),
  ('perm-documents-archive', 'documents.archive', 'Archive documents'),
  ('perm-documents-upload', 'documents.upload', 'Upload documents'),
  ('perm-documents-view-all', 'documents.view_all', 'View company documents'),
  ('perm-documents-view-related', 'documents.view_related', 'View related documents'),
  ('perm-quotations-manage', 'quotations.manage', 'Manage quotations'),
  ('perm-shipment-steps-update', 'shipment_steps.update', 'Update shipment steps'),
  ('perm-shipments-archive', 'shipments.archive', 'Archive shipments'),
  ('perm-shipments-create', 'shipments.create', 'Create shipments'),
  ('perm-shipments-update', 'shipments.update', 'Update shipments'),
  ('perm-shipments-view-all', 'shipments.view_all', 'View company shipments'),
  ('perm-shipments-view-assigned', 'shipments.view_assigned', 'View assigned shipments'),
  ('perm-tasks-assign', 'tasks.assign', 'Assign tasks'),
  ('perm-tasks-create', 'tasks.create', 'Create tasks'),
  ('perm-tasks-view-all', 'tasks.view_all', 'View company tasks'),
  ('perm-tasks-view-own', 'tasks.view_own', 'View own tasks')
ON CONFLICT (key) DO UPDATE SET description = EXCLUDED.description;

WITH internal_roles AS (
  SELECT id
  FROM roles
  WHERE name IN (
    'CEO',
    'MANAGER',
    'OPERATIONS',
    'CUSTOMER_SERVICE',
    'FINANCE',
    'QUOTATION_MANAGER',
    'COMPLIANCE_STAFF',
    'EMPLOYEE'
  )
),
operational_permissions AS (
  SELECT id
  FROM permissions
  WHERE key IN (
    'archive.view',
    'changes.view',
    'chat.use',
    'compliance.manage',
    'customer_access.manage',
    'customers.create',
    'customers.update',
    'customers.view',
    'documents.archive',
    'documents.upload',
    'documents.view_all',
    'documents.view_related',
    'quotations.manage',
    'shipment_steps.update',
    'shipments.archive',
    'shipments.create',
    'shipments.update',
    'shipments.view_all',
    'shipments.view_assigned',
    'tasks.assign',
    'tasks.create',
    'tasks.view_all',
    'tasks.view_own'
  )
)
INSERT INTO role_permissions (role_id, permission_id)
SELECT internal_roles.id, operational_permissions.id
FROM internal_roles
CROSS JOIN operational_permissions
ON CONFLICT (role_id, permission_id) DO NOTHING;
