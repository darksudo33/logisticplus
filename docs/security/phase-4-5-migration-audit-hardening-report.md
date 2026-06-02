# Phase 4.5 Migration Baseline Repair And Audit Hardening Report

## Scope

Phase 4.5 repaired the migration baseline and tightened the highest-risk audit writes. This was not Phase 5: no S3/object-storage migration, document migration, auth rewrite, or public tracking rewrite was started.

## Migration Files Inspected

- `scripts/migrate.ts`
- `db/schema.sql`
- `db/migrations/20260521000000_baseline.sql`
- `db/migrations/20260521010000_tenant_access_indexes.sql`
- `db/migrations/20260523090000_iran_import_customs_workflow.sql`
- `db/migrations/20260531090000_company_wide_operational_sharing.sql`
- `db/migrations/20260601080000_phase_2_auth_platform_admin_hardening.sql`
- `db/migrations/20260601100000_phase_4_append_only_audit_logs.sql`

## Migration Runner Behavior

`scripts/migrate.ts` loads `db/migrations/*.sql`, sorts filenames lexicographically, wraps each migration in a transaction, and records `id`, `name`, `checksum`, and `applied_at` in `schema_migrations`.

The runner validates checksums for already-applied migrations. Because of that, changing `20260521010000_tenant_access_indexes.sql` directly would be unsafe for databases where that migration is already recorded.

The runner now strips a leading UTF-8 BOM before checksum/execution. This prevents Windows-authored SQL files from failing PostgreSQL parsing at byte 1.

## Root Cause

`20260521000000_baseline.sql` was only a marker:

```sql
SELECT 1;
```

It represented schema that had previously been applied from `db/schema.sql`, but it did not create that schema for a fresh-empty database.

The next migration, `20260521010000_tenant_access_indexes.sql`, assumes baseline tables already exist. Its first failing assumption was `shipments` in the duplicate `customer_access_token_hash` guard. Fresh-empty `npm run db:migrate` therefore failed before Phase 4.

The first migration that now creates `shipments` is the new repair migration:

- `db/migrations/20260521005000_baseline_schema_repair.sql`

Before this repair, no migration created `shipments`; it existed only in `db/schema.sql`.

## Fix Applied

Added:

- `db/migrations/20260521005000_baseline_schema_repair.sql`

The repair migration is lexicographically between the no-op baseline marker and the tenant index migration. It creates the current pre-audit schema idempotently with `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, guarded constraint blocks, and non-audit indexes.

It intentionally does not create `audit_logs`; Phase 4 remains responsible for the append-only audit table, indexes, and triggers.

This avoids editing `20260521010000_tenant_access_indexes.sql`, so already-applied databases do not hit a checksum mismatch for that historical migration.

## Why This Is Safe For Existing DBs

- No tables are dropped.
- No columns are dropped.
- No rows are deleted.
- No DML backfill or cleanup runs in the repair migration.
- Existing tables are left intact by `CREATE TABLE IF NOT EXISTS`.
- Existing columns are left intact by `ADD COLUMN IF NOT EXISTS`.
- Existing indexes are left intact by `CREATE INDEX IF NOT EXISTS`.
- `20260521010000_tenant_access_indexes.sql` keeps its checksum unchanged.

## Other Migration Findings

- `20260521010000_tenant_access_indexes.sql` referenced many baseline tables before any migration created them. The repair migration now supplies those tables first.
- `20260523090000_iran_import_customs_workflow.sql` assumes `organizations`, `app_users`, `shipments`, and `tasks` exist. The repair migration now supplies them first.
- `20260531090000_company_wide_operational_sharing.sql` assumes `user_records`, `app_users`, `roles`, `permissions`, and `role_permissions` exist. The repair migration now supplies them first.
- `20260601080000_phase_2_auth_platform_admin_hardening.sql` assumes `app_sessions`, `permissions`, and `app_users` exist. The repair migration now supplies them first.
- Phase 2 has an optional seed-data bridge for `u1` / `darksudo22@gmail.com`; if absent, the `INSERT ... SELECT` simply inserts no rows.
- Phase 4 applies cleanly after the repair and remains the authoritative migration for `audit_logs`.

## Verification Scripts Added

Added:

- `scripts/verify-migrations.ts`
- `npm run db:migrate:fresh:test`
- `npm run db:migrate:current:test`

The verifier creates a guarded throwaway DB whose name must include `test` and `migration` or `fresh`, runs migrations twice, verifies required tables and indexes, and proves `audit_logs` blocks update/delete through its triggers.

Fresh verification checks include:

- `organizations`
- `app_users`
- `customers`
- `shipments`
- `documents`
- `change_logs`
- `audit_logs`
- key tenant indexes
- audit indexes
- append-only audit triggers and behavior

## Audit Transaction Improvements

Required audit writes now happen in the same DB transaction as these mutations:

- platform-admin grant
- platform-admin revoke
- document visibility change
- customer tracking access generate/reset/disable
- billing payment manual mark-paid / mark-failed
- archive create/restore/delete, including shipment archive/restore/delete through the generic archive flow

`auditLog` now supports `required: true`. Existing normal calls remain best-effort. Required audit calls rethrow audit write failures so the surrounding transaction rolls back.

## Best-Effort Audit Still Remaining

These are still best-effort and should be considered for Phase 5 or a dedicated audit-completeness phase:

- most auth/session audit events
- signup and organization lifecycle route audit events
- invoice issue/void and subscription renew/expire route audit events
- public tracking denied/download-denied audit events
- shipment/task/quotation/customer/cheque/compliance route audit events outside the moved helpers
- document upload/replace/archive route audit events
- chat membership/thread audit events

## Legacy `change_logs`

`audit_logs` is the append-only authoritative audit trail.

`change_logs` remains legacy/mutable compatibility history. It is still written by `auditLog` for current compatibility, and historical `change_logs` rows were not deleted or backfilled. A historical backfill from `change_logs` to `audit_logs` remains deferred because it is a data migration and needs a separate backup/rollback plan.

## Tests Added Or Updated

- Added nested sanitizer coverage for forbidden keys/values inside `before_json`, `after_json`, and `metadata_json`.
- Added audit read-boundary coverage for a tenant user without `changes.view`.
- Strengthened tenant audit read scoping by inserting a second-tenant audit marker and asserting Tenant A cannot see it.
- Strengthened platform audit response sanitization by asserting an invalid public token is not returned.

## Commands Run

- `npm run db:migrate:fresh:test`
  - First run failed because the generated SQL file had a UTF-8 BOM; fixed by stripping BOMs in `scripts/migrate.ts`.
  - Second run passed. Applied 7 migrations, second run reported no pending migrations, and verifier passed.
  - Final rerun after removing the BOM from the repair migration file itself also passed.
- `npm run db:migrate:current:test`
  - Passed. Applied current schema snapshot, applied 7 migrations, second run reported no pending migrations, and verifier passed.
  - Final rerun after the repair migration encoding cleanup also passed.
- `npm run test:e2e:setup`
  - Passed before focused audit tests.
- `npx playwright test tests/e2e/audit-logging.spec.ts`
  - Passed: 3/3.
- `npm run safety:check`
  - Passed. It printed expected warnings about existing seed/cleanup utilities.
- `npm run lint`
  - Passed.
- `npm run build`
  - Passed. Vite printed the existing large-chunk warning.
- `npm run test:e2e:setup`
  - Passed before security regression tests.
- `npx playwright test tests/e2e/security.spec.ts`
  - Passed: 15/15.
- `npm run test:e2e:setup`
  - Passed before document download/archive tests.
- `npx playwright test tests/e2e/document-download-print.spec.ts`
  - Passed: 2/2.

## Skipped Checks

- Full `npm run test:e2e` was not run because the focused security, audit, public tracking, billing, and document specs covered the touched high-risk paths with less runtime.
- Production-like live payment/SMS checks were not run; this phase did not change provider credentials or live provider behavior.

## Remaining Risks

- Existing databases that already have `schema_migrations` entries for all previous migrations will see the new repair migration as pending; it is idempotent, but it should still be applied first in staging and monitored.
- Route-level best-effort audit logging still exists outside the critical paths moved in this phase.
- `change_logs` historical backfill remains deferred.
- The migration chain is now verified against fresh-empty and current-schema throwaway DBs, but CI should run these scripts continuously before Phase 5.

## Phase 5 Recommendation

Do not start S3/object-storage migration until this Phase 4.5 repair is deployed to staging, `npm run db:migrate:status` is clean, `npm run db:migrate:fresh:test` and `npm run db:migrate:current:test` are added to CI, and a production backup/rollback plan is approved.

For Phase 5, use a staged document-storage migration: add object-storage config and health checks first, then dual-write new uploads, then backfill existing disk files with checksums, then switch reads through server-side lookup only, and only then retire local-disk dependence after rollback has been proven.
