# Current App Audit

## Source Files Inspected

- `README.md`
- `PROJECT_HANDOFF.md`
- `AGENTS.md`
- `.env.example`
- `package.json`
- `vite.config.ts`
- `playwright.config.ts`
- `db/schema.sql`
- `db/migrations/*.sql`
- `docs/app-architecture.md`
- `docs/search.md`
- `docs/demo-company.md`
- `docs/zarinpal-production-setup.md`
- `docs/liara-staging-validation.md`
- `server.js`
- `src/server/**`
- `src/App.tsx`
- `src/app/*.tsx`
- `src/components/**`
- `src/store/useMockStore.ts`
- `src/types/index.ts`
- `src/lib/pricing.ts`
- `src/shared/iran-import-customs-workflow.js`
- `tests/e2e/*.spec.ts`

Assumption: This audit is based on the current repository files, not a live production database dump. Runtime-only production configuration and real data volumes must be verified separately.

## Current Tech Stack

| Area | Current implementation |
| --- | --- |
| Frontend | Vite, React 19, TypeScript, React Router, Tailwind CSS, shadcn-style UI components, lucide-react, Zustand |
| Backend | Node.js, Express, one main `server.js` composition root, extracted route modules under `src/server/routes` |
| Database | PostgreSQL through raw `pg` queries in `src/server/db.js` |
| Validation | Zod-like local validation wrapper in `src/server/validation.js` and request schemas in `src/server/request-schemas.js` |
| Auth | Password login with bcrypt, SMS code login, hashed session cookies stored in `app_sessions` |
| Files | Local filesystem document storage under `storage/documents`, Liara persistent disk in production |
| Realtime | WebSocket chat plumbing through `ws` |
| Payments | Zarinpal REST integration from `server.js` |
| SMS | SMS.ir provider, dry-run mode, queued deliveries, manual/admin worker controls |
| Testing | Playwright E2E suite, TypeScript `tsc --noEmit` as lint |
| Deployment | Liara Node app, Liara PostgreSQL, Liara disk mount, separate staging config |

## Current Folder Structure

| Path | Purpose |
| --- | --- |
| `server.js` | Main Express API, auth, payment, document, task, admin, archive, dashboard, chat, and static-serving composition root |
| `src/App.tsx` | SPA route map for public and protected routes |
| `src/app/` | Page-level React views such as dashboard, shipments, customers, tasks, documents, compliance, cheques, quotations, archive, admin, profile, settings |
| `src/components/` | Shared app components, layout, skeletons, search, shipment workflow widgets, task dialogs |
| `components/ui/` | shadcn-style primitive UI components |
| `src/store/useMockStore.ts` | Legacy Zustand app state boundary and compatibility store hydration |
| `src/server/db.js` | Large raw PostgreSQL data layer and business operations |
| `src/server/routes/` | Extracted route groups for customers, notifications, public tracking, shipment progress, users |
| `src/server/repositories/` | Extracted read/write repositories for billing, customers, documents, notifications, shipment progress, shipments, users |
| `src/server/document-storage.js` | Multer upload handling, MIME/extension checks, storage key generation, file download headers |
| `src/server/rate-limit.js` | Memory/PostgreSQL rate limiting |
| `src/server/startup-checks.js` | Production env, storage, and rate-limit safety checks |
| `db/schema.sql` | Current schema snapshot |
| `db/migrations/` | SQL migrations, including baseline, tenant indexes, Iran import workflow, company-wide operational sharing |
| `docs/` | Runbooks and architecture notes |
| `tests/e2e/` | Playwright regression tests |
| `public/landing/` | Landing-page image assets |

## Current Frontend Architecture

- Single-page app with React Router in `src/App.tsx`.
- Public routes:
  - `/`
  - `/login`
  - `/contact`
  - `/pricing`
  - `/signup`
  - `/signup/pending`
  - `/billing/callback/zarinpal`
  - `/track/:token`
  - `/track/search`
- Protected routes:
  - `/dashboard`
  - `/shipments`
  - `/shipments/:id`
  - `/shipments/:id/edit`
  - `/customers`
  - `/customers/:id`
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
  - `/platform-admin`
- Backward-compatible redirects exist from `/admin` to `/platform-admin`, `/compliance` to `/compliance-meetings`, and `/quotage` to `/quotations`.
- `ProtectedAppLayout` restores the session, hydrates the app store, applies frontend permission checks, renders the RTL shell, and hosts sidebar/topbar/mobile nav.
- Zustand store still has the historical name `useMockStore`; `useAppDataStore` is a safer alias.
- Many screens still hydrate from `/api/users/:userId/bootstrap`, while newer flows use targeted refresh helpers:
  - `refreshUsers()`
  - `refreshCustomers()`
  - `refreshDocuments()`
  - `refreshShipments()`
  - `refreshTasks()`
  - `refreshShipmentProgress()`
  - `refreshNotifications()`
- UI is Persian/RTL-oriented and uses Shamsi/Jalali date behavior in several places.

## Current Backend/API Architecture

- `server.js` is still the main backend composition root and is very large.
- Several route groups have been extracted, but many endpoint groups remain inline in `server.js`.
- Current major API groups:
  - Health: `/api/health`, `/api/db/health`
  - Public SaaS: `/api/plans`, `/api/contact-requests`, `/api/signup`
  - Billing: `/api/billing/*`, Zarinpal callback
  - Auth/profile: `/api/auth/*`, `/api/profile/*`
  - Compatibility bootstrap: `/api/users/:userId/bootstrap`, `/api/users/:userId/records`
  - Search: `/api/search`
  - Organization members: `/api/organization/members`
  - Admin/SaaS: `/api/admin/*`
  - Customers: `/api/customers/*`
  - Users/RBAC: `/api/users/*`, `/api/roles`
  - Quotations: `/api/quotations/*`
  - Archive: `/api/archive/*`
  - Chat: `/api/chat/*`
  - Tasks: `/api/tasks/*`
  - Shipment steps/tasks/progress: `/api/shipments/:id/steps`, `/api/shipments/:id/tasks`, `/api/shipments/:shipmentId/progress/*`
  - Cheques: `/api/cheques/*`
  - Compliance meetings: `/api/compliance-meetings/*`
  - Dashboard: `/api/dashboard`
  - Documents: `/api/documents/*`, `/api/shipments/:id/documents`
  - Customer tracking access: `/api/shipments/:id/customer-access/*`
  - Public tracking: `/api/public/track/*`, `/api/public/documents/:id`
  - Notifications: `/api/notifications/*`
  - Change logs: `/api/changes/*`
  - Client error reports: `/api/client-errors`
- Permission checks are mostly explicit calls to `requirePermission`.
- Tenant scoping is manual and depends on every repository/query including `organization_id` or an explicit equivalent scope.

## Current Database And Storage Approach

- PostgreSQL is the system of record.
- The app uses raw SQL through `pg`.
- `db/schema.sql` is the current snapshot.
- `db/migrations` contains additive SQL migrations and `schema_migrations` tracks applied migrations.
- Major schema groups:
  - Identity: `app_users`, `app_sessions`, `login_sms_challenges`
  - Tenancy: `organizations`, `organization_members`
  - RBAC: `roles`, `permissions`, `role_permissions`
  - SaaS/billing: `subscription_plans`, `organization_subscriptions`, `signup_requests`, `billing_payments`, `billing_invoices`, `billing_invoice_items`, `billing_receipts`, `subscription_events`
  - Operations: `customers`, `shipments`, `shipment_status_events`, `tasks`, `task_events`
  - Iran import workflow: `shipment_workflow_instances`, `shipment_workflow_step_states`, `shipment_workflow_blockers`, `shipment_workflow_events`
  - Documents: `documents`, `document_versions`
  - Office workflows: `cheques`, `compliance_meetings`, `meeting_required_documents`, `quotations`
  - Support/audit: `archive_records`, `change_logs`, `app_error_logs`, `contact_requests`, `notifications`
  - Messaging/SMS: `chat_threads`, `chat_thread_members`, `chat_messages`, `sms_templates`, `sms_deliveries`
  - Compatibility: `user_records`
- Document files are stored on disk using generated storage keys.
- Production expects a Liara disk mounted at `storage/documents`.
- `archived_at` on the source table is canonical archive state; `archive_records` is a searchable projection.

## Current Authentication And Authorization

- Password login uses bcrypt hashes stored on `app_users.password_hash`.
- SMS login uses `login_sms_challenges`, hashed codes, TTL, and attempt limits.
- Browser sessions use the `logisticplus_session` cookie and `app_sessions.token_hash`.
- Sessions can be transient or remembered.
- Production cookies are expected to be secure behind HTTPS.
- Roles include at least:
  - `CEO`
  - `MANAGER`
  - `OPERATIONS`
  - `CUSTOMER_SERVICE`
  - `FINANCE`
  - `QUOTATION_MANAGER`
  - `COMPLIANCE_STAFF`
  - `EMPLOYEE`
- Permissions include operational capabilities such as `shipments.view_all`, `customers.view`, `documents.upload`, `tasks.assign`, `archive.view`, `users.manage`, and `platform.admin`.
- Platform admin access is partly email-gated around `darksudo22@gmail.com`, which is not enterprise-friendly.
- Frontend guards are UX-only; backend permission checks are the source of truth.

## Current Deployment Assumptions

- The app runs as a Node server on Liara.
- `npm run build` builds static frontend assets into `dist`.
- `npm run start` runs `node server.js`.
- Production env requires:
  - `DATABASE_URL`
  - `NODE_ENV=production`
  - `APP_PUBLIC_URL=https://...`
  - `DOCUMENT_STORAGE_DIR`
  - `RATE_LIMIT_STORE=postgres`
  - `TRUST_PROXY=true`
  - `ZARINPAL_SANDBOX=false`
  - `ZARINPAL_MERCHANT_ID`
  - SMS env vars if live SMS is enabled
- Staging has separate Liara app, database, and disk.
- Current deployment is not Docker-first.

## Current Features

| Feature area | Current behavior |
| --- | --- |
| Landing/public funnel | Marketing homepage, contact form, pricing, signup, pending/payment callback pages |
| Auth | Email/password login, SMS phone-code login, session restore, logout |
| Dashboard | Operational KPIs and quick access |
| Shipments | Shipment list, create/update, status updates, archive, detail workspace, edit page |
| Shipment workflow | Iran import customs workflow with phases, step states, blockers, public-safe status mapping, task links |
| Customer tracking | Token-based customer tracking, public search by shipment code and customer verification, QR/link controls |
| Customers | CRUD, detail view, related shipments/documents/quotations/cheques, archive |
| Documents | Upload, strict file type validation, download, replace/version, visibility, archive, public customer-visible docs |
| Tasks | My/team tasks, assignment, status changes, history, shipment/workflow related tasks |
| Notifications | In-app notifications, read/read-all APIs |
| Search | Global tenant-scoped search for shipments, customers, documents, tasks, tracking, users, archive |
| Cheques | Cheque management, due-soon list, status/archive |
| Compliance | Meeting scheduling, required documents, outcomes, cancellation/archive |
| Quotations | Quotation CRUD, status actions, convert to shipment |
| Commercial cards | Frontend page exists; persistence appears legacy/store-oriented and needs confirmation |
| Archive | Searchable archive, restore, permanent delete through explicit archive flows |
| Change log | Audit/change log list and detail |
| User management | Company user CRUD, roles, status, password reset, delete preview |
| Admin console | Organizations, manual signup, subscription limits, signup/contact review, payments, invoices, SMS analytics/templates/worker, error logs |
| Billing | Plans, signup payments, Zarinpal handoff/callback, invoices, receipts, manual admin payment marking |
| SMS | SMS.ir provider, templates, queued delivery, dry-run, manual worker, SMS login |
| Error reporting | Client error reports and admin resolution |
| Chat | API and WebSocket plumbing exists, but UI is intentionally disabled/limited |
| Tests | Playwright coverage for security, public funnel, documents, billing, search, notifications, SMS, UX, mobile, admin, tenant isolation |

## Current Business Logic To Preserve

- Tenant isolation by `organization_id`.
- Public tracking must be DTO-allowlisted and must never expose internal fields.
- Source-table `archived_at` remains canonical archive state.
- `archive_records` remains a projection, not the source of truth.
- Hard deletes are only allowed through explicit permanent-delete archive flows or tightly controlled admin deletion previews.
- Customer-visible documents are opt-in through `visibility = 'customer_visible'`.
- Customer tracking token lookup should use token hashes.
- Zarinpal callbacks must be idempotent.
- Production rate limiting must use PostgreSQL-backed counters.
- SMS delivery should remain feature-gated by plan/subscription limits.
- Startup checks should fail closed for insecure or incomplete production config.
- Persian/RTL and Jalali date behavior are product requirements.

## Current Limitations

- `server.js` and `src/server/db.js` are too large and mix HTTP, business logic, database access, payment flow, and cross-cutting concerns.
- Raw SQL gives control but weak type safety and a high chance of tenant-scope omissions.
- The legacy `user_records` bridge makes canonical data and UI-shaped data coexist, increasing synchronization risk.
- Some date/time fields are stored as `TEXT`, which weakens sorting, constraints, and timezone correctness.
- Some current code/files show mojibake in console output for Persian strings. The rebuild must enforce UTF-8 from source through database, logs, and exports.
- Platform admin access is partly tied to a hardcoded email.
- Document storage is local-disk based and not enterprise portable.
- Commercial cards and chat need product decisions before they become launch-blocking rebuild scope.
- The test strategy is E2E-heavy; unit and integration coverage are not yet first-class.
- The app is not Docker-first and not structured for CI/CD environments by default.

## Not Enterprise-Friendly Parts

- Monolithic route/data files with many responsibilities.
- Manual tenant scoping in every query instead of a systemic tenancy guard.
- Legacy compatibility store and `/api/users/:id/bootstrap` as a central data hydrator.
- Plain `role` string on users rather than robust membership-role assignment per tenant.
- Limited separation between platform admin and tenant admin models.
- Local filesystem document storage.
- Payment, SMS, and background jobs live in the web process.
- Hardcoded platform admin identity.
- Sparse domain boundaries around shipments, documents, billing, tasks, and audit.

## Technical Debt

- Gradual extraction from `server.js` and `db.js` is incomplete.
- Several flows still perform broad refreshes through `loadCurrentUserRecords()`.
- Canonical tables and `legacy_data` coexist.
- Route naming history includes `quotage` and `compliance` redirects.
- Some planned features are partially implemented and need verification rather than blind migration.
- Current schema has many `TEXT` identifiers/statuses where enums or controlled lookup tables would improve consistency.
- No explicit service layer or domain events layer.

## Security Concerns

- Tenant isolation depends on manual query correctness.
- Public tracking safety depends on continued DTO discipline and regression tests.
- Historical notes mention an exposed SMS.ir key rotation guard; production secrets must be rotated and handled through a secure secret manager.
- Platform admin hardcoded email should be replaced with explicit platform role/membership.
- Customer access token plaintext columns should not exist in the rebuild; store only hashed tokens plus one-time display behavior.
- File upload validation is strong for extension/MIME matching, but enterprise storage needs virus scanning, object storage policies, and signed URLs.
- Audit coverage is not guaranteed for every mutation and should become mandatory through middleware/events.
- Error logs may capture contextual data; the rebuild needs explicit PII scrubbing rules.

## Scalability Concerns

- Web process handles API, static serving, uploads, billing callbacks, SMS worker, and WebSocket chat.
- Local disk storage limits horizontal scaling.
- No Redis-backed queues/cache/session/rate-limit service in the current app.
- Search uses bounded SQL but no dedicated full-text/indexing strategy yet.
- Large compatibility bootstrap payloads can grow with tenant size.
- E2E tests are valuable but slow as the only broad regression safety net.

## Maintainability Problems

- Cross-feature changes require editing central files.
- Business logic is hard to test independently of Express.
- Raw SQL and UI-shaped normalization are mixed in the same module.
- Permissions are spread between frontend maps, seed migrations, and backend checks.
- Status values are stringly typed across frontend and database.
- Background workflows are not isolated into jobs/processors.

## Must Preserve In The Rebuild

- Core logistics entities and relationships.
- Multi-tenant company isolation.
- Persian/RTL interface and Jalali date handling.
- Existing protected routes or clear redirects during migration.
- Customer-safe public tracking behavior.
- Customer-visible document controls.
- Shipment import/customs workflow concepts, phases, blockers, public/private notes.
- Tasks tied to shipments/workflow/blockers.
- Archive/restore/permanent-delete semantics.
- Audit/change log.
- SaaS signup, subscription plans, billing, invoices, receipts.
- Zarinpal payment lifecycle and idempotency.
- SMS login and operational SMS alert concepts.
- Admin console capabilities.
- Demo company seed concept.

## Decision Needed

- Decide whether chat and commercial cards are MVP launch blockers for the rebuild.
- Decide whether old route paths must remain forever or only through redirects.
- Decide whether the product will support only Iranian import/customs workflows at MVP or a configurable multi-country logistics workflow engine.
- Decide whether customer users will ever log in, or customer access remains link/search only.
- Decide whether billing stays Zarinpal-only at MVP or needs provider abstraction from day one.

