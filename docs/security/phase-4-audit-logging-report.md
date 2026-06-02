# Phase 4 Audit Logging Report

## Scope

Phase 4 adds append-only audit logging for sensitive mutations and security-relevant events in the existing Express/PostgreSQL app. It does not replace `change_logs`, retire raw customer tracking token storage, alter public tracking DTOs, or change the application architecture.

No business data, public routes, platform-admin flows, Persian/RTL/Jalali behavior, billing/Zarinpal flow, SMS login flow, or document storage behavior was removed.

## Files Inspected

- Composition and high-risk routes: `server.js`.
- Existing changelog/audit helper and database access: `src/server/db.js`.
- Public tracking repository and DTO/document authorization: `src/server/public-tracking.js`.
- Public tracking routes: `src/server/routes/public-tracking-routes.js`.
- User/RBAC/platform-admin routes: `src/server/routes/user-routes.js`.
- Customer routes: `src/server/routes/customer-routes.js`.
- Workflow/progress/blocker routes: `src/server/routes/shipment-progress-routes.js`.
- Document routes and storage streaming: `server.js`, `src/server/repositories/documents.js`, `src/server/document-storage.js`.
- Existing schema/migrations: `db/schema.sql`, `db/migrations/`.
- Security, document, and RBAC tests: `tests/e2e/security.spec.ts`, `tests/e2e/document-download-print.spec.ts`, `tests/e2e/rbac-policy.ts`, `tests/e2e/helpers.ts`.

## Existing Behavior Found

- `change_logs` already existed and is used by the existing `auditLog` helper.
- Many sensitive mutations already call `auditLog`, including users, roles, customer CRUD, shipment create/update, workflow progress/blockers, tasks, documents, archives/restores/deletes, quotations, cheques, compliance, billing, subscription, signup/contact reviews, SMS templates, SMS worker, and platform organization changes.
- `change_logs` is user-facing through `/api/changes` and remains unchanged for compatibility.

## Schema Decision

Added `audit_logs` through `db/migrations/20260601100000_phase_4_append_only_audit_logs.sql` and mirrored it in `db/schema.sql`.

Columns:

- `id`
- `organization_id`
- `actor_user_id`
- `actor_type`
- `event_type`
- `resource_type`
- `resource_id`
- `request_id`
- `ip`
- `user_agent`
- `before_json`
- `after_json`
- `metadata_json`
- `created_at`

Indexes:

- `organization_id, created_at DESC`
- `actor_user_id, created_at DESC`
- `event_type, created_at DESC`
- `resource_type, resource_id, created_at DESC`
- `created_at DESC`

Append-only guard:

- `prevent_audit_logs_mutation()` raises on `UPDATE` and `DELETE`.
- `audit_logs_prevent_update` and `audit_logs_prevent_delete` triggers are installed idempotently.

`change_logs` was not dropped, rewritten, or historically migrated. Current `change_logs.action/entity_type/entity_id` maps to `audit_logs.event_type/resource_type/resource_id`; `change_logs.summary` maps into `audit_logs.metadata_json.summary`.

## Audit Helper

`src/server/db.js` now centralizes audit writing through the existing `auditLog` helper:

- Writes the legacy `change_logs` row.
- Writes the new append-only `audit_logs` row.
- Accepts `actorType`, `eventType`, `resourceType`, `metadata`, and `queryable`.
- Resolves tenant organization from `organizationId` or actor user when available.
- Supports user, platform-admin, public, and system-style events.
- Bounds arrays, object keys, depth, strings, and total serialized JSON.
- Catches audit write failures and logs server-side so normal user flows do not fail solely because audit persistence failed.

Transactional repository-level adoption is deferred except where existing flows already call `auditLog` after successful mutations. Existing mutation behavior is preserved.

## Scrubber Behavior

`sanitizeAuditPayload` redacts sensitive keys and suspicious signed/token URL values before writing.

Redacted key families include:

- password and password hashes
- token, token hashes, raw tracking tokens, customer access tokens
- session, cookie, authorization
- auth/SMS OTP/code fields
- secret, API key, merchant/payment authority
- provider response/result
- storage key, file path, generic `path`
- signed URL and signature

The scrubber keeps useful operational metadata such as ids, event types, status values, visibility, timestamps, resource ids, shipment codes, and bounded summaries.

## Events Now Audited

Covered by existing mutation calls now mirrored into `audit_logs`:

- user created/updated/suspended/reactivated/deleted
- role changes
- platform admin user mutations
- profile/security/password changes
- customer create/update/archive
- shipment create/update/status change/public status/customer-access generate/reset/disable
- shipment workflow start/update/blocker add/resolve
- task create/update/assign/status/archive-like flows
- document upload/update/replace/archive/visibility change
- quotation, archive/restore/permanent-delete, chat membership, cheque, compliance, billing, subscription, signup/contact review, SMS template, SMS worker events

Added explicit Phase 4 security events:

- password login success/failure/rate-limit
- SMS code request/rate-limit/send failure
- SMS verify success/failure/rate-limit
- logout/session revoked
- session restore rejected for expired/revoked/unknown session
- platform-admin access denied
- `platform.admin` grant/revoke through protected platform-admin APIs
- public tracking invalid token attempt
- public tracking disabled access attempt
- public tracking search failed verification
- public document download denied
- internal document download denied

## Deferred Events

- Public document download success is intentionally skipped for now because it can be high-volume. Denials are audited.
- Historical `change_logs` backfill into `audit_logs` is deferred to avoid risky data migration.
- A full audit UI is deferred; Phase 4 adds minimal protected APIs.
- Fine-grained audit for every read-only denial path is deferred. Highest-risk auth, admin, public tracking, and document denial paths are covered.
- Transactional insertion inside every repository transaction is deferred; existing route-level post-success logging is preserved.

## Audit Read Rules

Added:

- `GET /api/audit-logs`
  - authenticated tenant route
  - requires `changes.view`
  - always scoped to the authenticated tenant organization

- `GET /api/admin/audit-logs`
  - requires `platform.admin`
  - can read platform/global/all audit logs
  - supports optional filters

Audit API responses use sanitized DTO-style fields and do not expose raw table internals beyond safe audit metadata.

## Tests Added

Added `tests/e2e/audit-logging.spec.ts`:

- shipment status change creates audit rows
- document visibility change creates audit rows
- tracking token reset/disable creates audit rows without raw token/hash
- `platform.admin` grant/revoke creates audit rows
- logout/session restore rejection creates audit rows
- SMS code request/verify success/failure create audit rows without the SMS code
- audit logs do not contain password, session token/hash, raw tracking token/hash, storage key, or signed URL signature
- `audit_logs` rejects update attempts
- tenant audit reads are tenant-scoped
- tenant user cannot read platform audit API
- platform admin can read public/platform audit events
- public tracking denial rows use `actor_type = public`

Updated `tests/e2e/rbac-policy.ts` with audit route policy entries.

## Commands Run

- `npm run lint`
  - Passed.
- `npm run test:e2e:setup`
  - Passed.
- `npx playwright test tests/e2e/audit-logging.spec.ts`
  - Passed: 2/2.
- `npm run test:e2e:setup`
  - Passed.
- `npx playwright test tests/e2e/audit-logging.spec.ts tests/e2e/security.spec.ts tests/e2e/document-download-print.spec.ts`
  - First run failed because the new audit spec used the seed owner's SMS phone and triggered the existing SMS cooldown before `security.spec.ts`.
  - Fixed the audit spec to use a fresh tenant-owner phone.
- `npm run test:e2e:setup`
  - Passed after the test isolation fix.
- `npx playwright test tests/e2e/audit-logging.spec.ts tests/e2e/security.spec.ts tests/e2e/document-download-print.spec.ts`
  - Passed: 19/19.
- `npm run db:migrate` on a fresh empty throwaway DB
  - Failed before Phase 4 on existing migration `20260521010000_tenant_access_indexes.sql`, which expects `shipments` to exist after baseline.
- `npm run db:seed` on a throwaway migration DB, marked prior migrations as applied, then `npm run db:migrate`
  - Phase 4 migration applied successfully.
- `npm run lint`
  - Final pass.
- `npm run build`
  - Passed with existing Vite main chunk-size warning.
- `npm run safety:check`
  - Passed with existing review warnings for destructive/seed utilities:
    `scripts/clean-liara-production-data.mjs`, `scripts/qa-cleanup-prod.ts`, `scripts/qa-seed-heavy.ts`, `scripts/seed-demo-company.ts`.

## Remaining Risks

- Existing route-level `auditLog` calls are not all transaction-coupled with their mutations.
- Existing `change_logs` remains mutable as before; only new `audit_logs` is append-only.
- Public document download successes are not audited yet.
- Some low-risk read-only denials and chat/message read side effects remain outside explicit Phase 4 audit coverage.
- Existing migration chain has a pre-Phase-4 fresh-empty-database issue that should be cleaned up separately.

## Phase 5 Recommendation

Phase 5 should harden operational audit completeness:

- move security-critical audit writes into the same DB transaction as the mutation where practical
- add an admin audit UI with filtering/export and retention policy
- add coverage for remaining read-denial surfaces and public document download success sampling
- fix the existing migration baseline chain so a brand-new database can run all migrations cleanly
- begin hash-only customer tracking token retirement as a separate token-migration phase
