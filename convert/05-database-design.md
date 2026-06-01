# Database Design

## Database Recommendation

Use PostgreSQL with Drizzle ORM and SQL-first migrations.

Why Drizzle:

- The current app already uses PostgreSQL-specific behavior, partial indexes, JSONB, and raw SQL migrations.
- Logistics/search/reporting workflows benefit from explicit SQL control.
- Future PostGIS support is cleaner when advanced SQL remains first-class.
- Generated TypeScript types improve safety without hiding SQL.

Prisma alternative:

- Prisma is acceptable for faster CRUD scaffolding and a more familiar generated client.
- If Prisma is chosen, keep raw SQL migration review and expect raw SQL for PostGIS, partial indexes, and complex reports.

## Schema Conventions

- Primary keys: `uuid` with `gen_random_uuid()`.
- Tenant key: `organization_id uuid not null` on every tenant-owned table.
- Timestamps: `created_at`, `updated_at`, `archived_at`.
- Actors: `created_by_id`, `updated_by_id`, `archived_by_id` where relevant.
- Status fields: controlled enum types or checked text values.
- Currency amounts: store integer minor units where possible, for IRR use `bigint` amount in rials.
- Core queryable fields should be columns, not JSON.
- Metadata extension fields can use `jsonb`.
- Public/customer responses are built from views/DTO queries, never raw rows.

## Suggested PostgreSQL Extensions

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
-- Enable when location/map features are added:
-- CREATE EXTENSION IF NOT EXISTS postgis;
```

## Suggested Tables

### Identity And Tenancy

| Table | Key columns | Notes |
| --- | --- | --- |
| `users` | `id`, `email`, `phone`, `password_hash`, `status` | Global identity |
| `refresh_tokens` | `id`, `user_id`, `token_hash`, `family_id`, `expires_at`, `revoked_at` | Refresh token rotation |
| `organizations` | `id`, `name`, `slug`, `status`, `owner_user_id`, `plan_id` | Tenant boundary |
| `organization_memberships` | `id`, `organization_id`, `user_id`, `role_id`, `status` | Tenant access |
| `roles` | `id`, `organization_id`, `name`, `is_system` | Global or tenant custom roles |
| `permissions` | `id`, `key`, `category` | Atomic capabilities |
| `role_permissions` | `role_id`, `permission_id` | Permission assignment |

Example:

```sql
CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug citext NOT NULL UNIQUE,
  status text NOT NULL CHECK (status IN ('pending_review', 'active', 'suspended', 'cancelled')),
  owner_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  contact_name text,
  contact_email citext,
  contact_phone text,
  locale text NOT NULL DEFAULT 'fa-IR',
  timezone text NOT NULL DEFAULT 'Asia/Tehran',
  branding jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);
```

### SaaS And Billing

| Table | Key columns | Notes |
| --- | --- | --- |
| `subscription_plans` | `id`, `name`, `monthly_price_irr`, `annual_price_irr`, `limits`, `features` | Public plan config |
| `subscriptions` | `id`, `organization_id`, `plan_id`, `status`, `billing_cycle` | Tenant subscription |
| `signup_requests` | `id`, `organization_id`, `owner_user_id`, `status`, `payment_id` | Public onboarding |
| `payments` | `id`, `organization_id`, `provider`, `status`, `gateway_authority` | Zarinpal/manual payments |
| `invoices` | `id`, `organization_id`, `invoice_number`, `status`, `total_irr` | Billing invoices |
| `invoice_items` | `id`, `invoice_id`, `description`, `quantity`, `total_irr` | Invoice rows |
| `receipts` | `id`, `organization_id`, `invoice_id`, `payment_id`, `receipt_number` | Payment receipts |
| `subscription_events` | `id`, `organization_id`, `event_type`, `before_json`, `after_json` | Subscription audit |

Important constraints:

- `payments.gateway_authority` unique when not null.
- `invoices.invoice_number` globally unique or tenant-prefixed unique.
- `receipts.invoice_id` unique.

### Operations

| Table | Key columns | Notes |
| --- | --- | --- |
| `customers` | `id`, `organization_id`, `company_name`, `contact_name`, `email`, `phone` | Tenant customers |
| `shipments` | `id`, `organization_id`, `shipment_code`, `customer_id`, `status` | Core shipment |
| `shipment_status_events` | `id`, `organization_id`, `shipment_id`, `public_label`, `is_customer_visible` | Public status history |
| `tracking_access` | `id`, `organization_id`, `shipment_id`, `token_hash`, `enabled` | Public link access |
| `tasks` | `id`, `organization_id`, `assigned_to_id`, `status`, `priority`, `shipment_id` | Work items |
| `task_events` | `id`, `organization_id`, `task_id`, `event_type` | Task history |

Example shipment:

```sql
CREATE TABLE shipments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  shipment_code text NOT NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  customer_name_snapshot text,
  status text NOT NULL CHECK (status IN ('PENDING','BOOKED','IN_TRANSIT','ARRIVED','CUSTOMS','CLEARED','DELIVERED','CLOSED')),
  priority text NOT NULL DEFAULT 'normal',
  origin text,
  destination text,
  estimated_delivery_at timestamptz,
  actual_delivery_at timestamptz,
  free_time_ends_at timestamptz,
  assigned_manager_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  UNIQUE (organization_id, shipment_code)
);

CREATE INDEX shipments_org_active_updated_idx
  ON shipments (organization_id, updated_at DESC)
  WHERE archived_at IS NULL;
```

### Workflow

| Table | Key columns | Notes |
| --- | --- | --- |
| `workflow_templates` | `id`, `key`, `version`, `definition_json`, `status` | Versioned definitions |
| `workflow_instances` | `id`, `organization_id`, `shipment_id`, `workflow_template_id`, `status` | Shipment workflow |
| `workflow_step_states` | `workflow_instance_id`, `step_code`, `status`, `public_note` | Current step state |
| `workflow_blockers` | `id`, `organization_id`, `workflow_instance_id`, `blocker_code`, `status` | Exceptions |
| `workflow_events` | `id`, `organization_id`, `workflow_instance_id`, `event_type` | History |

Constraints:

- Unique `(organization_id, shipment_id, workflow_template_id)` for active workflow type.
- Step state primary key `(workflow_instance_id, step_code)`.
- Blocker status check: `open`, `resolved`, `cancelled`.

### Documents

| Table | Key columns | Notes |
| --- | --- | --- |
| `documents` | `id`, `organization_id`, `title`, `visibility`, `current_version`, `storage_object_key` | Current document |
| `document_versions` | `id`, `organization_id`, `document_id`, `version`, `storage_object_key` | Version history |
| `document_links` optional | `document_id`, `entity_type`, `entity_id` | Use if polymorphic attachment grows |

MVP can keep nullable foreign keys on `documents` for shipment/customer/meeting/cheque/quotation. For enterprise extensibility, consider `document_links`.

### Office Workflows

| Table | Key columns | Notes |
| --- | --- | --- |
| `cheques` | `id`, `organization_id`, `cheque_number`, `amount_irr`, `status` | Finance |
| `compliance_meetings` | `id`, `organization_id`, `meeting_at`, `status`, `outcome` | Compliance |
| `meeting_required_documents` | `id`, `organization_id`, `meeting_id`, `document_id` | Checklist |
| `quotations` | `id`, `organization_id`, `quotation_number`, `status`, `total_price_irr` | Quotes |

### Notifications, SMS, Audit, Archive

| Table | Key columns | Notes |
| --- | --- | --- |
| `notifications` | `id`, `organization_id`, `user_id`, `read_at` | In-app notifications |
| `sms_templates` | `key`, `body`, `enabled` | Platform-managed templates |
| `sms_deliveries` | `id`, `organization_id`, `event_key`, `status`, `attempt_count` | Queue/audit |
| `audit_logs` | `id`, `organization_id`, `actor_user_id`, `action`, `entity_type` | Append-only |
| `archive_records` | `id`, `organization_id`, `entity_type`, `entity_id`, `archived_at` | Archive projection |
| `error_logs` | `id`, `organization_id`, `source`, `severity`, `message`, `resolved_at` | Internal support |
| `contact_requests` | `id`, `company_name`, `contact_name`, `status` | Public leads |
| `rate_limit_buckets` | `key`, `count`, `reset_at` | Optional Postgres fallback if Redis unavailable |

## Index Strategy

Create indexes for:

- Every foreign key used in joins.
- `(organization_id, id)` on tenant-owned tables.
- `(organization_id, updated_at desc)` on tenant-owned lists.
- Partial active indexes where `archived_at is null`.
- Search fields using `pg_trgm` where useful:
  - `customers.company_name`
  - `customers.email`
  - `shipments.shipment_code`
  - `documents.title`
  - `documents.file_name`
- Public token lookup:
  - Unique index on `tracking_access(token_hash)` where `enabled = true`.
- Task queues:
  - `(organization_id, assigned_to_id, status, due_at)`
- SMS queue:
  - `(status, next_attempt_at, created_at)`.

## Soft Delete Strategy

- Use `archived_at` for user-facing archive/restore.
- Use `deleted_at` only for internal tombstones if necessary.
- `archive_records` is a projection for listing/searching archived items.
- Restore clears `archived_at` and sets `archive_records.restored_at`.
- Permanent delete is allowed only from explicit archive permanent-delete flows and must be audited.
- Never hard-delete tenant records from normal active screens.

## Audit Fields

Recommended fields on important business tables:

- `created_by_id`
- `updated_by_id`
- `archived_by_id`
- `created_at`
- `updated_at`
- `archived_at`

Recommended audit log event fields:

- `request_id`
- `organization_id`
- `actor_user_id`
- `action`
- `entity_type`
- `entity_id`
- `summary`
- `before_json`
- `after_json`
- `ip_address`
- `user_agent`
- `created_at`

## Multi-Tenant Isolation Strategy

Service-level:

- Resolve active organization membership at request start.
- Attach `tenantContext` to request.
- Repositories require `organizationId` for tenant-owned queries.
- Repository methods should fail closed if `organizationId` is absent.

Database-level:

- `organization_id not null` on tenant-owned tables.
- Unique constraints scoped by organization.
- Optional PostgreSQL Row Level Security after MVP hardening:
  - Set `app.current_organization_id` per transaction.
  - Policies require `organization_id = current_setting(...)`.

## File And Document Storage Strategy

- Store file bytes in S3-compatible object storage.
- Store metadata in `documents` and `document_versions`.
- Object key format:
  - `organizations/{organizationId}/documents/{documentId}/v{version}/{uuid}-{safeName}`
- Private documents download through API or short-lived signed URL after authorization.
- Customer-visible documents require:
  - Document belongs to same organization as shipment.
  - Document is attached to shipment or approved related entity.
  - Document visibility is `customer_visible`.
  - Shipment tracking access is enabled.
- Store checksum and file size for integrity.
- Add malware scanning job post-MVP or before enterprise launch.

## Migration Strategy

- Create migrations with Drizzle migration tooling.
- Review generated SQL in code review.
- Never edit production schema manually.
- Use additive migrations first.
- Backfill in bounded batches.
- Separate data migrations from schema migrations for high-volume tables.
- Keep rollback scripts for destructive changes.
- Mirror seed data through versioned seed scripts.

## Seed Data Strategy

Required seeds:

- Permissions.
- System roles and role-permission mapping.
- Public subscription plans.
- Platform admin account creation flow for local/staging.
- Demo organization with sample users, customers, shipments, documents, tasks, public tracking.
- Workflow template `IR_IMPORT_CUSTOMS_V1`.
- SMS templates.

Seed rules:

- Seeds must be idempotent.
- Production demo seed must require explicit env confirmation.
- Do not seed real secrets.

## Decision Needed

- Decide whether to enforce PostgreSQL RLS at MVP. Recommendation: design repository layer first, add RLS in hardening.
- Decide whether document attachments use nullable foreign keys or a polymorphic `document_links` table. Recommendation: nullable MVP, `document_links` before adding many more attachment targets.
- Decide whether shipment code uniqueness is global or tenant-scoped. Recommendation: tenant-scoped.

