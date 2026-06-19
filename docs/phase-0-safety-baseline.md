# Phase 0 Safety Baseline

Last updated: 2026-06-19

## Current Architecture Summary

Logistic Plus is a Persian/RTL B2B logistics SaaS with a React/Vite frontend, Express/Node backend, PostgreSQL through raw `pg` queries, local filesystem document storage, multi-tenant organizations, public tracking, documents, shipment workflow, admin-managed billing, platform admin, and Playwright E2E coverage.

Main backend entry points:

- `server.js` is the composition root. It creates the Express app, runs startup checks, registers inline and extracted API route groups, serves Vite/static assets, handles WebSocket chat, and explicitly disables removed public self-serve signup/contact/Zarinpal/phone-login endpoints.
- `src/server/startup-checks.js` validates production configuration, document storage, and production rate-limit store requirements.
- `src/server/rate-limit.js` provides memory/postgres rate limiting; production must resolve to `postgres`.

Data-access files and patterns:

- `src/server/db.js` is still the main raw `pg` data-access and compatibility layer. It exports the shared `pool`, auth/session helpers, raw query functions, UI DTO mappers, write/archive helpers, admin billing helpers, and compatibility bridge functions.
- Extracted repositories already exist for focused slices: `src/server/repositories/documents.js`, `customers.js`, `shipments.js`, `users.js`, `notifications.js`, `shipment-progress.js`, and `billing.js`.
- `src/server/tenant-scope.js` provides fail-closed helpers: `requireOrganizationScope` and `organizationScopeClause`.
- `src/server/transaction.js` provides the shared transaction wrapper used by extracted workflows.
- SQL migrations live in `db/migrations/`; `db/schema.sql` is the current schema snapshot.

Auth/session code:

- `server.js` uses `SESSION_COOKIE = "logisticplus_session"` and cookie parsing helpers.
- `src/server/db.js` hashes session tokens into `app_sessions`, creates sessions with transient/remember lifetimes, and resolves sessions through `getSessionByToken`.
- `server.js` enforces request auth through `requireAuthenticatedUser`, `requirePlatformAdmin`, `requireCompanyCeo`, permission checks, and target-user organization checks.

Tenant/org scoping patterns:

- Normal protected routes derive tenant scope from `user.organizationId` after `requireAuthenticatedUser`.
- Extracted protected repositories use `organizationScopeClause(...)` to require `organization_id`.
- Some legacy paths in `src/server/db.js` still accept optional `organizationId` and rely on route callers to pass the session organization; these are Phase 1 audit candidates.
- Platform-admin routes are the explicit exception where an org id can come from route/query/body input after `requirePlatformAdmin`.

Public tracking routes:

- `src/server/routes/public-tracking-routes.js` registers `/api/public/track/:token`, `/api/public/track/search`, `/api/public/track/:token/documents/:documentId`, and `/api/public/documents/:id`.
- `src/server/public-tracking.js` builds customer-facing allowlisted DTOs for shipment status, public workflow summary, customer-visible documents, and public company contact text.
- Public document routes stream files through `sendStoredDocument` and must not expose `storage_key` or raw paths.

Document upload/download routes:

- Protected document APIs are inline in `server.js`: `/api/documents`, `/api/documents/upload`, `/api/documents/:id`, `/api/documents/:id/download`, `/api/documents/:id/replace`, `/api/documents/:id/archive`, `/api/documents/:id/visibility`, and `/api/shipments/:id/documents`.
- `src/server/document-storage.js` owns upload validation, filename sanitization, generated storage keys, path containment, persistence, cleanup, and streaming.
- Protected document lookup and storage-key cleanup queries are also present in `src/server/repositories/documents.js`.

Billing and admin signup routes:

- Public self-serve signup, contact requests, Zarinpal handoff/callback, and SMS phone-login routes are removed from the public-release app and return 404 through explicit disabled-route guards.
- The only supported company creation path is `POST /api/admin/organizations/manual-signup` for platform admins.
- Current billing routes cover `/api/billing/my-subscription`, `/api/billing/my-invoices`, `/api/billing/my-payments`, and platform-admin invoice/payment management.

## Critical Risk Map

| Area | Files | Risk | Phase 0 guardrail |
| --- | --- | --- | --- |
| Tenant scope | `server.js`, `src/server/db.js`, `src/server/repositories/*` | Optional `organizationId` in legacy helpers can become unscoped if a new route forgets to pass session scope. | Never trust client `organizationId`; audit protected access with the checklist before refactors. |
| Public tracking | `src/server/public-tracking.js`, `src/server/routes/public-tracking-routes.js` | Public payloads could leak internal shipment/customer/user/task/billing/document fields if raw rows are returned. | Use allowlisted DTOs only and add leak tests for every public payload change. |
| Document storage | `server.js`, `src/server/document-storage.js`, `src/server/repositories/documents.js` | Storage keys or filesystem paths could leak; path traversal and MIME mismatch protection must stay intact. | Stream by server lookup only; do not expose storage keys in URLs or JSON. |
| Billing/admin signup | `server.js`, `src/server/db.js`, `server/src/modules/billing/*`, `server/src/modules/organizations/*` | Manual company creation, invoice issuance, and payment status changes can create incorrect account or billing state. | Keep company creation platform-admin-only and cover disabled public routes plus manual signup tests. |
| Archive/permanent delete | `server.js`, `src/server/db.js`, `src/server/document-storage.js` | `DELETE /api/archive/:entityType/:entityId` intentionally hard-deletes archived rows and document files. | Avoid new hard deletes outside explicit archive permanent-delete flows. |
| Compatibility bridge | `src/server/db.js`, `src/store/useMockStore.ts`, `/api/users/:id/bootstrap` | Removing or bypassing bridge behavior can break legacy screens and data sync. | Do not remove `user_records` or bootstrap until intentionally retired. |
| Production safety scripts | `scripts/clean-liara-production-data.mjs`, `scripts/qa-cleanup-prod.ts`, seed scripts | Scripts contain broad `DELETE` statements and can damage data if pointed at the wrong database. | Do not run destructive scripts without explicit request and backup/target verification. |
| Persian/RTL behavior | `src/app/*`, `src/components/*`, public tracking copy | Refactors can accidentally change layout direction, labels, or encoded Persian strings. | Preserve RTL behavior and user-facing Persian copy unless explicitly requested. |

## Files Inspected

- Root/config: `AGENTS.md`, `package.json`, `playwright.config.ts`, `README.md`, `PROJECT_HANDOFF.md`.
- Backend composition and helpers: `server.js`, `src/server/db.js`, `src/server/startup-checks.js`, `src/server/rate-limit.js`, `src/server/document-storage.js`, `src/server/public-tracking.js`, `src/server/tenant-scope.js`, `src/server/transaction.js`, `src/server/request-schemas.js`, `src/server/validation.js`.
- Extracted route modules: `src/server/routes/customer-routes.js`, `notification-routes.js`, `public-tracking-routes.js`, `shipment-progress-routes.js`, `user-routes.js`.
- Extracted repositories: `customers.js`, `documents.js`, `notifications.js`, `shipment-progress.js`, `shipments.js`, `users.js`.
- Database and scripts: `db/schema.sql`, `db/migrations/*`, `scripts/migrate.ts`, `scripts/bridge-canonical-db.ts`, `scripts/seed-db.ts`, `scripts/seed-demo-company.ts`, `scripts/qa-cleanup-prod.ts`, `scripts/qa-seed-heavy.ts`, `scripts/smoke-production-config.ts`.
- Existing docs and tests: `docs/app-architecture.md`, `docs/search.md`, `docs/zarinpal-production-setup.md`, `tests/e2e/security.spec.ts`, `tests/e2e/public-tracking-leak.spec.ts`, `tests/e2e/document-security-lifecycle.spec.ts`, `tests/e2e/company-wide-visibility.spec.ts`, `tests/e2e/pricing-billing.spec.ts`.

## Test Commands Discovered

Package scripts:

- `npm run lint` - TypeScript typecheck via `tsc --noEmit`.
- `npm run build` - Vite production build.
- `npm run test:e2e:setup` - reset/seed the E2E database.
- `npm run test:e2e` - full Playwright suite.
- `npm run test:search` - focused search Playwright spec.
- `npm run test:e2e:headed` - headed Playwright run.
- `npm run smoke:production-config` - production startup/config smoke.
- `npm run smoke:staging` - staging validation script.
- `npm run db:migrate:status` - migration status and checksum validation.

Relevant focused Playwright specs:

- `tests/e2e/security.spec.ts`
- `tests/e2e/public-tracking-leak.spec.ts`
- `tests/e2e/document-security-lifecycle.spec.ts`
- `tests/e2e/company-wide-visibility.spec.ts`
- `tests/e2e/pricing-billing.spec.ts`
- `tests/e2e/search.spec.ts`
- `tests/e2e/sms-alerts.spec.ts`

## Known Risky Areas

- `server.js` and `src/server/db.js` are large and still mix routing, authorization, DTO mapping, raw SQL, compatibility sync, and business workflows. Keep extractions small and dependency-injected.
- Legacy helper functions in `src/server/db.js` sometimes accept optional `organizationId`; Phase 1 should verify every protected caller passes session scope and move fail-closed checks closer to data access.
- Public tracking DTO construction is separate, but public document queries still retrieve `storage_key` internally for streaming. That value must stay server-only.
- Direct public document download by id exists for customer-visible documents. Token-based tracking document URLs are safer and should be preferred for customer-facing flows.
- Cleanup/seed scripts include DELETE statements for test/demo/production cleanup workflows. They are operational tools, not refactor helpers.
- Archive permanent delete intentionally deletes archived rows and can remove document files. Do not expand this behavior without tests and explicit product approval.
- Platform admin routes can intentionally target tenant ids from params/query/body after admin auth. Do not confuse this exception with normal tenant-owned app access.
- Public Zarinpal payment validation is intentionally out of scope while public self-serve signup/payment remains removed.

## Recommended Order For Phase 1

1. Run a read-only tenant-scope audit using `docs/security/tenant-scope-checklist.md`; build a route-to-data-access map for customers, shipments, tasks, documents, workflow, billing, archive, search, platform admin, and public tracking.
2. Add focused regression tests before changing guards: cross-tenant denial for protected APIs, public DTO leak tests, document storage-key leak tests, and admin billing/manual signup tests.
3. Start with the highest-risk protected data paths that already have clear patterns: search, archive, documents, tasks, and shipment workflow. Move fail-closed `organization_id` requirements into repositories/helpers one bounded context at a time.
4. Keep route extraction incremental. Preserve `server.js` as the composition root, keep dependency injection explicit, and preserve route paths/response shapes.
5. Defer compatibility-bridge retirement until all affected UI pages have canonical endpoint reads, mutation flows, and Playwright coverage.
