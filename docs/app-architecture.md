# Logistic Plus App Architecture

This document describes the current application as implemented in this repository. It is the source-of-truth architecture snapshot for both the frontend and database/backend layers as of 2026-05-24.

## Frontend Architecture

Logistic Plus is a Vite, React 19, TypeScript single-page app served by the Node/Express server in production. React Router owns public and protected routing in `src/App.tsx`.

The protected app shell is composed of:

- `ProtectedLayout` in `src/App.tsx`, which requires an authenticated `currentUser`.
- `Sidebar` and `TopBar` from `src/components/layout/Navbar.tsx`.
- `MobileBottomNav` from `src/components/layout/MobileBottomNav.tsx`.
- `TooltipProvider`, `Toaster`, and `ClientErrorBoundary` around all routes.
- `ProtectedShellSkeleton` and `ProtectedContentSkeleton` while lazy routes or database hydration are loading.

The frontend still uses `useMockStore` as the legacy app-facing state boundary, but the store hydrates from real backend records through `/api/users/:id/bootstrap`. New frontend work should prefer the non-breaking `useAppDataStore` alias from `src/store/useMockStore.ts`; existing `useMockStore` imports remain supported. Page components call backend APIs for mutations. Most legacy screens still call `loadCurrentUserRecords()`, while documents, customers, normal shipment mutations, shipment import workflow progress, and tasks now use narrower endpoint refresh patterns such as `refreshDocuments()`, `refreshCustomers()`, `refreshShipments()`, `refreshShipmentProgress()`, and `refreshTasks()`.

`ProtectedLayout` also applies route-level frontend permission guards for protected sections where the backend already has matching permissions. Backend authorization remains the source of truth; frontend guards are only an early UX and defense-in-depth layer.

Canonical protected routes:

- `/dashboard`
- `/shipments`, `/shipments/:id`, `/shipments/:id/edit`
- `/customers`, `/customers/:id`
- `/tasks`
- `/documents`
- `/compliance-meetings`
- `/cheques`
- `/commercial-cards`
- `/quotations`
- `/archive`
- `/search`
- `/changelog`
- `/profile`
- `/settings`
- `/management`
- `/admin`

Backward-compatible redirects:

- `/compliance` redirects to `/compliance-meetings`.
- `/quotage` redirects to `/quotations`.

Public routes:

- `/`
- `/login`
- `/contact`
- `/pricing`
- `/signup`
- `/signup/pending`
- `/billing/callback/zarinpal`
- `/track/:token`
- `/track/search`

Shared UI patterns:

- App pages use `app-page`, `bg-card`, `border-border`, `text-foreground`, `text-muted-foreground`, and theme tokens from `src/index.css`.
- Form and modal surfaces use the shared dialog components in `components/ui/dialog.tsx`.
- Destructive active-record actions should use `src/components/DeleteConfirmDialog.tsx`.
- Empty states use `src/components/EmptyState.tsx`.
- Date/time workflows use `src/components/ShamsiDateTimeField.tsx`.
- Search surfaces use `src/components/search/GlobalSearch.tsx` and `SearchPage.tsx`.

## Backend And Database Architecture

The backend entrypoint is `server.js`. It serves the API, Vite middleware in development, static production assets from `dist`, document downloads, billing/Zarinpal callbacks, SMS endpoints, and WebSocket chat plumbing. `server.js` remains the composition root; extracted route modules are registered from it with explicit dependencies.

Database access is still mostly centralized in `src/server/db.js` using raw `pg` queries. This file maps PostgreSQL rows into UI-shaped records for the React store and owns many create/update/archive/restore operations. Incremental extraction has started:

- `src/server/routes/public-tracking-routes.js` registers public tracking and public document download routes without changing route paths or response shapes.
- `src/server/routes/customer-routes.js` registers the protected customer route group while preserving existing route paths and response shapes.
- `src/server/public-tracking.js` owns public tracking queries and allowlisted DTO construction.
- `src/server/repositories/billing.js` owns the Zarinpal callback payment transition path.
- `src/server/repositories/documents.js` owns protected document list/detail/download/storage-key read queries; `src/server/db.js` keeps backward-compatible exports.
- `src/server/repositories/customers.js` owns tenant-scoped customer list/detail read queries; customer writes remain behind backward-compatible `src/server/db.js` exports while the compatibility bridge is active.
- `src/server/repositories/shipments.js` owns tenant-scoped shipment list/detail read queries; core shipment writes still flow through the `user_records` compatibility bridge.
- `src/server/routes/shipment-progress-routes.js` and `src/server/repositories/shipment-progress.js` own the canonical Iran import customs workflow APIs.
- `src/shared/iran-import-customs-workflow.js` contains the workflow definition, step/phase/blocker labels, and public-safe mapping helpers.
- `src/server/transaction.js` provides the shared transaction wrapper used by extracted workflows.
- `src/server/tenant-scope.js` centralizes fail-closed tenant scope helpers for protected tenant-owned lookups.

The canonical SQL schema snapshot is `db/schema.sql`. Raw SQL migrations live in `db/migrations` and are applied through `scripts/migrate.ts`, with applied migrations recorded in the `schema_migrations` table. Keep `db/schema.sql` updated as the current reference after adding migrations. The local database has applied the baseline and tenant-access index migrations:

- `20260521000000_baseline.sql`
- `20260521010000_tenant_access_indexes.sql`
- `20260523090000_iran_import_customs_workflow.sql`

- `npm run db:schema`
- `npm run db:migrate`
- `npm run db:migrate:status`
- `npm run db:seed`
- `npm run db:bridge`

Major schema groups:

- Identity and tenant model: `app_users`, `organizations`, `organization_members`, `roles`, `permissions`, `role_permissions`, `app_sessions`.
- SaaS and billing: `subscription_plans`, `organization_subscriptions`, `signup_requests`, `billing_payments`, `billing_invoices`, `billing_invoice_items`, `billing_receipts`, `subscription_events`.
- Operations: `customers`, `shipments`, `shipment_status_events`, `shipment_workflow_instances`, `shipment_workflow_step_states`, `shipment_workflow_blockers`, `shipment_workflow_events`, `tasks`, `task_events`, `documents`, `document_versions`.
- Finance and office workflows: `cheques`, `compliance_meetings`, `meeting_required_documents`, `quotations`.
- Audit/support: `archive_records`, `change_logs`, `notifications`, `app_error_logs`, `contact_requests`.
- Messaging/SMS: `chat_threads`, `chat_thread_members`, `chat_messages`, `sms_templates`, `sms_deliveries`, `login_sms_challenges`.
- Compatibility bridge: `user_records`, which keeps legacy UI-shaped collections synchronized during the transition to canonical tables.

Tenant safety is enforced primarily in the backend by scoping queries with `organization_id` and by permission checks in `server.js` and `src/server/db.js`. Common protected lookup-by-id helpers for tenant-owned entities now use fail-closed tenant-scope helpers. Customer update/archive writes, duplicate email checks, customer related-record reads, protected document reads, and protected shipment reads are scoped to the authenticated organization. Public tracking endpoints return intentionally reduced customer-safe payloads from purpose-built DTOs and must not expose owner, organization, token, audit, internal task, cheque, or compliance internals.

Request validation and abuse protection:

- Zod validation helpers live in `src/server/validation.js` and route schemas live in `src/server/request-schemas.js`.
- Public tracking, protected document params/metadata, customer params/mutations, shipment params/task/public-status inputs, archive entity params, and billing payment-start params return consistent 400 validation envelopes for invalid input.
- Rate limiting covers password login, SMS login challenges, public signup/contact, payment start, document upload/replace/download, and public tracking search/document downloads.
- Production must use `RATE_LIMIT_STORE=postgres`; startup checks reject `RATE_LIMIT_STORE=memory` or invalid values in production. Local development defaults to memory unless configured otherwise.

Archive behavior:

- Active list delete buttons should archive or soft-delete records, not hard-delete them.
- Canonical archive state is the tenant-owned source row `archived_at`.
- `archive_records` is the searchable/indexed projection for archive screens and restore/permanent-delete flows.
- Archive/restore flows that touch both the source row and projection should run in one transaction.
- Permanent deletion is limited to archive flows that explicitly call `/api/archive/:entityType/:entityId` with `DELETE`.

Billing and payment callbacks:

- Zarinpal request/verify orchestration remains in `server.js`.
- The callback mutation path is idempotent in `src/server/repositories/billing.js`, using a transaction and row lock on `billing_payments`.
- Duplicate callbacks for already-paid payments redirect as paid without repeating invoice, receipt, subscription, or audit side effects.

Document storage:

- Runtime files are stored on the filesystem through `src/server/document-storage.js`.
- Production expects a Liara persistent disk mounted at `storage/documents`.
- Startup checks verify the document storage directory is writable before accepting production traffic.
- Stored physical paths use generated storage keys rather than uploaded filenames.
- Document records and `document_versions` are created in transactional workflows; document replacement now uses the shared transaction helper, and protected document lookups require tenant scope.

## Compatibility Bridge Retirement Plan

`user_records` and `/api/users/:id/bootstrap` remain supported. They should not be removed until all protected screens read from canonical endpoint-specific APIs and no longer rely on compatibility saves. New work should:

- Prefer canonical APIs for new screens and targeted refresh helpers for existing screens.
- Preserve bootstrap response compatibility while reducing call sites that refresh all records after small mutations.
- Keep bridge writes tenant-scoped with `organization_id`.
- Keep bridge saves non-destructive for canonical shipments and workflow-linked tasks. The bridge must not hard-delete shipment rows because workflow instances, step states, blockers, events, public status events, and task links depend on them.
- Retire one bounded context at a time after tests cover the replacement API and UI behavior.

## Liara Deployment Shape

Production deploy uses `liara.json`:

- App: `logisticplus`
- Public production URL: `https://logisticplus.ir`
- Platform: Node
- Node version: 22
- Port: 3000
- Build command: `npm run build`
- Disk: `logisticplus-documents` mounted to `storage/documents`

The reliable deploy command used by this project is:

```powershell
liara deploy --detach --no-app-logs --message "<release message>"
```

Post-deploy smoke checks should include:

- Back up the target PostgreSQL database before applying migrations.
- `npm run db:migrate` and `npm run db:migrate:status` in the target environment.
- `https://logisticplus.ir/api/health`
- `https://logisticplus.ir/api/db/health`
- Browser smoke for `/login`, `/compliance-meetings`, `/cheques`, and `/quotations`.

Latest production rollout note:

- On 2026-05-24, the workflow persistence bridge fix was deployed to Liara with `liara deploy --detach --no-app-logs`.
- The deploy returned `Deployment created successfully` and `Upload finished`.
- `https://logisticplus.ir/api/health` returned 200 at `2026-05-24T01:27:14.262Z`.
- `https://logisticplus.ir/api/db/health` returned 200 with database timestamp `2026-05-24T01:27:14.287Z`.
- On 2026-05-21, Liara release `v54` was deployed with the documents/customers/shipments architecture hardening patch.
- Release `v54` logs showed `npm start`, production static serving from `dist`, SMS worker startup, and `Server running on http://localhost:3000`.
- This slice introduced no new schema migration; local `npm run db:migrate:status` reported 0 pending migrations before deploy.
- `https://logisticplus.ir/api/health` returned 200 at `2026-05-21T06:39:12.699Z`.
- `https://logisticplus.ir/api/db/health` returned 200 at `2026-05-21T06:39:12.727Z`.
- Earlier on 2026-05-21, release `v53` applied the baseline and tenant-access index migrations after a manual Liara database backup.
- `https://logisticplus.liara.run` returned Liara's platform 503 page during the same smoke. Treat `https://logisticplus.ir` as the canonical public URL unless the Liara default domain is intentionally restored.
