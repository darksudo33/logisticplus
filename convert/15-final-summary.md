# Final Executive Summary

## Why LogisticPlus Should Be Rebuilt

The current LogisticPlus app is already a real product, not just a prototype. It supports Persian/RTL logistics operations, multi-company tenancy, shipment workflows, customer tracking, documents, tasks, billing, SMS, admin operations, and Playwright regression coverage.

The main reason to rebuild is not missing product value. The reason is architectural risk. The current app grew around a large Express `server.js`, a large raw PostgreSQL data layer, and a legacy Zustand compatibility store. That structure makes future enterprise growth harder because tenant scoping, permissions, audit logging, file storage, background jobs, and feature boundaries rely too much on developer discipline in central files.

A rebuild lets the team preserve the product behavior while removing the compatibility bridge and giving the app a clean enterprise foundation.

## Recommended New Stack

The recommended stack is:

- Frontend: Next.js, TypeScript, Tailwind CSS, shadcn/ui, TanStack Query, React Hook Form, Zod.
- Backend: NestJS, TypeScript, REST-first modular monolith.
- Database: PostgreSQL with Drizzle ORM and SQL migrations.
- Future geospatial: PostGIS when route, vehicle, warehouse, or map features are added.
- Infrastructure: Docker, Docker Compose, Nginx, Redis, BullMQ, S3-compatible object storage.
- Auth/security: JWT access tokens, refresh token rotation, RBAC, tenant guards, audit logs, rate limiting.
- Observability: structured logs, health checks, error tracking, OpenTelemetry-ready instrumentation.

This stack is more scalable and maintainable than the current one because it separates frontend, API, workers, storage, database access, permissions, and background processing into clear boundaries.

## Recommended Architecture

Start with a modular monolith, not microservices.

The backend should be organized into modules:

- Auth
- Tenancy
- RBAC
- Users
- Organizations
- Customers
- Shipments
- Workflow
- Tasks
- Documents
- Public Tracking
- Billing
- Notifications
- SMS
- Archive
- Audit
- Search
- Reports
- Platform Admin

This keeps deployment simple at MVP while making future extraction possible. Billing, notifications/SMS, documents, public tracking, and reporting can become separate services later if business volume justifies it.

The frontend should use Next.js route groups:

- Public pages.
- Auth pages.
- Tenant app.
- Platform admin.

The current global store/bootstrap pattern should not be copied. Server data should come from feature APIs through TanStack Query.

## How To Rebuild Safely

The current app should keep running until the new app is production-ready.

Recommended approach:

1. Build the new app in a separate repo or project folder.
2. Implement the foundation first: database, auth, RBAC, tenancy, audit.
3. Build feature parity module by module.
4. Add tests while building, especially tenant isolation and public tracking leak tests.
5. Run migration dry-runs from production backups into new staging.
6. Keep old app read/write until cutover.
7. Use a final maintenance window for final migration.
8. Switch traffic only after smoke tests pass.
9. Keep old app and database available for rollback during an acceptance window.

## Biggest Risks

The biggest risks are:

- Tenant isolation mistakes during rewrite.
- Public tracking exposing internal data.
- Document migration from local/Liara disk to object storage.
- Workflow migration from current Iran import/customs state.
- Billing/payment state migration and Zarinpal callback idempotency.
- Encoding issues with Persian text.
- Rebuilding too much at once without tests.
- Treating optional features like chat/fleet/maps as MVP requirements before core parity is stable.

## First Development Steps

The first practical steps are:

1. Create the fresh repo with Next.js, NestJS, Docker Compose, PostgreSQL, Redis, and MinIO.
2. Add database migrations for users, organizations, memberships, roles, permissions, audit, plans.
3. Implement auth with refresh token rotation.
4. Implement tenant and permission guards.
5. Seed roles, permissions, plans, and `IR_IMPORT_CUSTOMS_V1`.
6. Build customers, shipments, workflow, tasks, documents, and public tracking before lower-priority modules.
7. Recreate the critical Playwright security and public tracking tests early.

## What Must Be Preserved

- Persian/RTL interface.
- Jalali/Shamsi date behavior.
- Multi-tenant company isolation.
- Customer-safe public tracking.
- Customer-visible document rules.
- Shipment/customs workflow, blockers, and task links.
- Archive/restore/permanent-delete behavior.
- Audit/change history.
- SaaS signup, plans, billing, invoices, receipts.
- Zarinpal integration.
- SMS login and operational SMS concepts.
- Platform admin console.

## Decision Needed

- Confirm whether chat and commercial cards are MVP features or postponed.
- Confirm whether driver/fleet/location tracking is post-MVP.
- Confirm final ORM choice. Recommendation: Drizzle.
- Confirm cutover tolerance. Recommendation: short maintenance window with old app rollback available.

