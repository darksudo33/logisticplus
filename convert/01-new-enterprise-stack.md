# New Enterprise Stack

## Executive Recommendation

Build the new LogisticPlus as a TypeScript-first modular monolith:

- Frontend: Next.js App Router, TypeScript, Tailwind CSS, shadcn/ui, TanStack Query, Zod, React Hook Form.
- Backend: NestJS, TypeScript, REST-first API, modular monolith boundaries that can later become services.
- Database: PostgreSQL with Drizzle ORM and SQL migrations, plus PostGIS when location/geospatial features are introduced.
- Infrastructure: Docker, Docker Compose, Nginx, Redis, BullMQ, S3-compatible object storage, CI/CD-ready repo structure.
- Security: JWT access tokens, refresh token rotation, RBAC, multi-tenant guards, audit logs, rate limits, secure secrets.
- Observability: structured logs, health checks, error tracking, OpenTelemetry-ready instrumentation.

Final ORM recommendation: Use Drizzle ORM with SQL migrations. It matches the current app's SQL-first discipline, supports PostgreSQL-specific features cleanly, and keeps advanced indexes, JSONB, partial indexes, and future PostGIS work explicit. Prisma is still acceptable if the team strongly prioritizes schema readability and generated client ergonomics over SQL control.

## Why Rebuild Instead Of Refactor In Place

The current app is functional and contains important product logic, but the architecture has grown around a large Express file, a large raw SQL data file, and a legacy Zustand compatibility store. A fresh rebuild allows the team to:

- Preserve existing business behavior without carrying the compatibility bridge.
- Make tenant isolation systemic rather than manually repeated in queries.
- Move files from local disk to object storage.
- Split business modules into clear boundaries.
- Add unit/integration/API tests around services instead of relying mostly on E2E tests.
- Create a Docker-first, CI/CD-ready deployment path.
- Prepare for future B2B clients with configurable workflows, roles, limits, and integrations.

## Proposed Stack

| Layer | Technology | Responsibility |
| --- | --- | --- |
| Web app | Next.js App Router | Routing, layouts, SSR where useful, public pages, protected dashboard shell |
| Language | TypeScript | End-to-end static typing |
| Styling | Tailwind CSS | Utility styling and design tokens |
| UI kit | shadcn/ui | Accessible primitives and consistent enterprise UI |
| Server state | TanStack Query | API data caching, loading/error states, invalidation |
| Forms | React Hook Form + Zod | Typed form validation and submission |
| API server | NestJS | Modular REST backend, guards, pipes, interceptors, controllers |
| ORM/query | Drizzle ORM | Typed SQL, migrations, PostgreSQL-specific control |
| Database | PostgreSQL | Core transactional system of record |
| Geospatial | PostGIS | Future vehicle, map, depot, route, and location queries |
| Cache/session/rate limit | Redis | Shared ephemeral state and counters |
| Queues | BullMQ | SMS, email, document processing, reports, webhooks |
| Object storage | S3-compatible storage | Documents, generated exports, receipts, attachments |
| Reverse proxy | Nginx | TLS termination, routing, compression, upload limits |
| Local env | Docker Compose | Repeatable dev services |
| Logs | Pino or Winston | Structured JSON logs |
| Metrics/tracing | OpenTelemetry-ready instrumentation | Future distributed tracing and metrics |
| Error tracking | Sentry or equivalent | Frontend/backend exception visibility |
| Tests | Vitest/Jest, Supertest, Playwright | Unit, integration, API, E2E coverage |

## Frontend Recommendation

Use Next.js App Router with route groups:

- `(public)` for landing, contact, pricing, signup, tracking.
- `(auth)` for login and auth callbacks.
- `(app)` for tenant dashboard and operations.
- `(platform-admin)` for platform administration.

Use TanStack Query for all server state. Avoid a global store for backend-owned records. Use a small client store only for UI state such as sidebar, theme, locale, and transient filters.

## Backend Recommendation

Use NestJS as a modular monolith. Start with modules such as:

- `AuthModule`
- `TenancyModule`
- `RbacModule`
- `UsersModule`
- `OrganizationsModule`
- `ShipmentsModule`
- `CustomersModule`
- `DocumentsModule`
- `TasksModule`
- `WorkflowModule`
- `TrackingModule`
- `BillingModule`
- `NotificationsModule`
- `SmsModule`
- `AuditModule`
- `ArchiveModule`
- `ReportsModule`
- `PlatformAdminModule`

Each module should own controllers, services, repositories, DTOs, policies, and tests. Shared cross-cutting behavior should live in guards, interceptors, filters, and middleware.

## Database Recommendation

Use PostgreSQL from day one. Use Drizzle migrations as the primary schema-change mechanism and keep generated SQL reviewable in code review.

Use:

- UUID primary keys.
- `tenant_id` or `organization_id` on every tenant-owned table.
- `created_at`, `updated_at`, `archived_at`, `deleted_at` where appropriate.
- `created_by_id`, `updated_by_id`, `archived_by_id` for important business records.
- `jsonb` only for metadata/extension points, not for core queryable business fields.
- Partial indexes for active records.
- Unique constraints scoped by tenant.
- Optional PostgreSQL Row Level Security after the service-layer tenancy model is stable.

PostGIS should be enabled when the rebuild adds:

- Vehicle live locations.
- Warehouse/geofence radius queries.
- Route planning.
- ETA by coordinate.
- Map-based shipment tracking.

## Infrastructure Recommendation

Local Docker Compose should include:

- `frontend`
- `api`
- `postgres`
- `redis`
- `minio`
- `mailhog` or local SMTP capture
- optional `nginx`

Production should run:

- Next.js frontend as its own deployable unit or behind the same reverse proxy.
- NestJS API as a separate service/container.
- Worker process for BullMQ jobs.
- PostgreSQL managed database.
- Redis managed instance.
- S3-compatible object storage.
- Centralized logs and error tracking.

## Auth And Security Recommendation

- Access token: short-lived JWT, 5 to 15 minutes.
- Refresh token: long-lived, httpOnly secure cookie, hashed in database, rotated on use.
- Password hashing: Argon2id preferred.
- SMS login: keep as optional second login method, rate-limited and audited.
- RBAC: database-backed roles and permissions, scoped by tenant membership.
- Platform admin: explicit platform role, not hardcoded email.
- Tenant context: resolved once per request and enforced by guards/repositories.
- File access: signed download URLs, object-level tenant checks, customer-visible policy enforcement.
- Audit logs: append-only events for all sensitive mutations.

## Monitoring Recommendation

- `/health/live` for process liveness.
- `/health/ready` for DB/Redis/object-storage readiness.
- `/health/deps` for admin-only dependency details.
- Structured request logs with request id, tenant id, user id, route, status, duration.
- OpenTelemetry instrumentation hooks from day one.
- Error tracker for frontend and backend.
- Worker job metrics for retries, failures, latency, and dead-letter queues.

## Alternatives Considered

| Alternative | Pros | Cons | Recommendation |
| --- | --- | --- | --- |
| Keep Vite + Express | Fastest continuation, least migration | Carries current architecture debt | Avoid for rebuild |
| Next.js full-stack only | One framework, fewer services | Backend modules, queues, RBAC, integrations become less clean at scale | Avoid for serious SaaS core |
| NestJS + Prisma | Strong generated client, popular | Less direct control over complex SQL/PostGIS/partial index patterns | Acceptable alternative |
| NestJS + Drizzle | SQL-first, typed, PostgreSQL-friendly | Less batteries-included than Prisma | Recommended |
| Microservices from day one | Clear physical separation | High operational cost and premature complexity | Avoid at MVP |
| Modular monolith first | Clear boundaries, simpler deploy, future service extraction | Requires discipline to keep boundaries clean | Recommended |

## What Should Be Avoided

- Do not copy the `user_records` compatibility bridge into the new app.
- Do not store customer tracking tokens in plaintext.
- Do not rely on hardcoded platform admin emails.
- Do not use local disk as production document storage.
- Do not make tenant scoping optional or caller-managed.
- Do not put queue workers inside the web request process.
- Do not build a generic microservice platform before the domain is stable.
- Do not return raw database rows from public/customer APIs.
- Do not use JSON blobs for core fields that need filtering/reporting.

## Build First

1. Monorepo and Docker Compose foundation.
2. PostgreSQL schema and Drizzle migrations.
3. Auth, refresh tokens, RBAC, tenant context.
4. Users, organizations, memberships.
5. Core shipments/customers/tasks/documents.
6. Public tracking safe DTOs.
7. Audit logging.
8. Background jobs and notifications.
9. Billing/subscriptions.
10. Admin console.

## Decision Needed

- Decide monorepo package manager: npm workspaces, pnpm, or Turborepo. Recommendation: pnpm workspace for new project speed and strict dependency boundaries.
- Decide object storage provider: MinIO for local, Liara object storage if available, or AWS S3-compatible provider.
- Decide whether to use Drizzle only or Drizzle plus raw SQL for complex reporting/search.
- Decide whether to implement PostgreSQL RLS in MVP or reserve it for a hardening phase.

