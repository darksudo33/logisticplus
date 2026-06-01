# Phase 1 Tenant Isolation Report

Last updated: 2026-06-01

## Summary

Phase 1 added a trusted tenant context for authenticated protected APIs and tightened legacy tenant-owned data access so prioritized reads/writes fail closed when `organizationId` is missing. Normal tenant APIs continue to derive scope from the authenticated session and active organization membership, not from client-provided tenant identifiers.

No routes, features, Persian/RTL behavior, public tracking behavior, billing behavior, SMS behavior, workflow behavior, archive behavior, migrations, or business data were removed.

## Files Inspected

- Auth/session and routing: `server.js`, `src/server/db.js`, `src/server/request-schemas.js`, `src/server/validation.js`.
- Tenant and repository helpers: `src/server/tenant-scope.js`, `src/server/transaction.js`, `src/server/repositories/customers.js`, `documents.js`, `shipments.js`, `shipment-progress.js`, `notifications.js`, `users.js`, `billing.js`.
- Route modules: `src/server/routes/customer-routes.js`, `notification-routes.js`, `shipment-progress-routes.js`, `public-tracking-routes.js`, `user-routes.js`.
- Database/schema: `db/schema.sql`, `db/migrations/*`.
- Tests and policy docs: `tests/e2e/security.spec.ts`, `tests/e2e/company-wide-visibility.spec.ts`, `tests/e2e/public-tracking-leak.spec.ts`, `tests/e2e/document-security-lifecycle.spec.ts`, `tests/e2e/rbac-policy.ts`, `docs/security/tenant-scope-checklist.md`.

## Routes Protected

- Customer routes now consume `req.tenantContext.organizationId` after `requireAuthenticatedUser`.
- Notification routes now consume `req.tenantContext.organizationId`.
- Shipment workflow/progress routes now load shipment/progress data through `req.tenantContext.organizationId`.
- Company CEO routes fail closed through tenant context in `requireCompanyCeo`.
- Existing protected routes for shipments, tasks, documents, archive, search, quotations, cheques, compliance meetings, billing, and organization members continue to use `user.organizationId`, which is now normalized from the trusted tenant context during authentication.

Client-supplied `organizationId`, `organization_id`, `orgId`, `companyId`, and `tenantId` are detected for observability on authenticated requests and are not used as normal tenant scope.

## Data Access Updated

- Added `src/server/tenant-context.js` for request tenant context creation, attachment, and fail-closed tenant requirement checks.
- Extended `src/server/tenant-scope.js` with reusable tenant-context assertions for repository/data-access methods.
- `getSessionByToken` now loads active organization membership status/role from `organization_members`.
- `requireAuthenticatedUser` now attaches `req.tenantContext = { organizationId, userId, membershipId, role, membershipRole, permissions }` and fails closed if an authenticated org user lacks active membership.
- Legacy list helpers now require organization scope: `listFeatureRecords`, `listTasks`, `listCheques`, `listComplianceMeetings`, `listQuotations`, and `listArchiveRecords`.
- Legacy mutation helpers now require or preserve organization scope for prioritized writes: `updateTaskRecord`, `updateChequeRecord`, `updateComplianceMeetingRecord`, `archiveComplianceMeetingRecord`, `updateMeetingRequiredDocument`, `updateQuotationRecord`, `setQuotationStatus`, and `convertQuotationToShipment`.
- Create helpers for tasks, cheques, compliance meetings, and quotations now assert that the owner user resolves to an organization before creating tenant-owned rows.

## Platform Admin Exceptions

Platform admin remains a separate boundary. Routes that intentionally accept organization ids from params/query/body still require `requirePlatformAdmin` first, including admin organization, admin billing, admin SMS analytics/deliveries, admin error logs, and admin organization user management. Comments were added near admin billing and admin user route groups to document this exception.

Normal tenant routes must not use these admin-targeting patterns.

## Public Tracking Deferred To Phase 3

Public tracking was inspected but not rewritten. Current public tracking risks to carry into Phase 3:

- Public document streaming internally reads `storage_key`; this must remain server-only.
- Direct public document download by id exists for customer-visible documents on customer-access-enabled shipments; token-bound document URLs remain the safer customer-facing path.
- Public DTO code should continue to be the only source of public tracking JSON responses.
- Existing tests cover public payload leak hardening and customer-visible document filtering; expand these before changing public tracking behavior.

## Routes Still Needing Follow-Up

- `server.js` still contains large inline protected route groups. Future extraction should keep `server.js` as composition root and pass tenant context explicitly.
- Some write helpers still derive organization from owner user for creates instead of accepting tenant context directly. This is server-side trusted, but Phase 2 can make create APIs pass tenant context explicitly.
- Chat/thread APIs were inspected at a high level but not fully hardened in this phase because they were outside the prioritized tenant-owned operational routes.
- Compatibility bridge paths still support legacy `user_records`; do not retire them until canonical API reads and UI flows are fully covered.

## Tests Added

- `tests/e2e/tenant-isolation-phase1.spec.ts`
  - Proves a tenant cannot expand scope through body/query `organizationId`/`orgId`/`companyId`.
  - Proves tenant-owned customer creation uses the authenticated tenant organization.
  - Proves Tenant A cannot access Tenant B customers, shipment access surface, shipment archive path, document metadata, or tasks.
  - Proves platform admin organization lookup still works where intentionally allowed.

Existing relevant tests remain important:

- `tests/e2e/security.spec.ts`
- `tests/e2e/company-wide-visibility.spec.ts`
- `tests/e2e/public-tracking-leak.spec.ts`
- `tests/e2e/document-security-lifecycle.spec.ts`

## Database Audit Notes

No database migration was added. The current schema already has `organization_id` on prioritized tenant-owned tables including customers, shipments, shipment status events, tasks, task events, documents, document versions, notifications, cheques, compliance meetings, meeting required documents, quotations, archive records, chat threads/messages, billing tables, SMS deliveries, and user records.

`organization_members` has no standalone id column; `membershipId` in tenant context is normalized as `organizationId:userId`.

## Commands Run

- `node --check server.js` - passed.
- `node --check src/server/db.js` - passed.
- `node --check src/server/tenant-context.js` - passed.
- `node --check src/server/routes/customer-routes.js` - passed.
- `node --check src/server/routes/notification-routes.js` - passed.
- `node --check src/server/routes/shipment-progress-routes.js` - passed.
- `npm run safety:check` - passed with existing warnings for destructive/seed utilities that require review before use.
- `npm run lint` - passed.
- `npm run build` - passed.
- `npm run test:e2e:setup` - passed.
- `npx playwright test tests/e2e/tenant-isolation-phase1.spec.ts tests/e2e/public-tracking-leak.spec.ts tests/e2e/document-security-lifecycle.spec.ts --reporter=line` - passed, 3 tests.
- `npx playwright test tests/e2e/security.spec.ts --reporter=line` - passed, 14 tests.

## Remaining Risks

- Broad inline routing in `server.js` still makes security review harder than focused route modules.
- Some legacy bridge and create paths still infer organization from `ownerUserId`; safe for this phase, but less explicit than passing tenant context into every write.
- Public tracking requires its own focused phase before any public payload or public document behavior changes.
- Existing cleanup/seed scripts contain destructive SQL and remain operational-risk tools that need explicit target verification and backups before use.

## Phase 2 Recommendation

Make tenant context explicit at route-module boundaries for the remaining large inline route groups, starting with tasks, documents, archive, quotations, cheques, and compliance meetings. Move one bounded route group at a time behind dependency-injected modules, pass `tenantContext` into create/update helpers directly, and add cross-tenant tests before each extraction.
