# Product Requirements

## Product Summary

LogisticPlus is a Persian/RTL B2B logistics operations SaaS for companies that manage shipments, customers, documents, import/customs workflows, tasks, billing, and customer-facing tracking. The rebuild should preserve current product behavior while creating a cleaner enterprise foundation for future logistics clients.

The product has two major audiences:

- Platform owner/admins who sell and operate LogisticPlus as a SaaS.
- Logistics companies who use the app internally to manage operations and expose safe shipment tracking to their customers.

Assumption: The MVP remains focused on Iranian logistics/import operations, but the architecture should allow configurable workflows for other logistics domains later.

## Main Personas

| Persona | Goals | Current relevance |
| --- | --- | --- |
| Platform owner | Manage SaaS customers, plans, payments, support, errors, SMS | Current admin console |
| Company owner/CEO | See company-wide operations, manage users and permissions, control billing | Current `CEO` role |
| Operations manager | Manage shipments, tasks, workflow blockers, customers, documents | Current `MANAGER`/`OPERATIONS` roles |
| Customer service user | Track customer-facing updates, documents, public links | Current `CUSTOMER_SERVICE` role |
| Finance user | Manage cheques, invoices, payment-related workflows | Current `FINANCE` role |
| Compliance staff | Manage compliance meetings and required documents | Current compliance module |
| External customer | Check shipment status and customer-visible documents without internal app access | Current public tracking pages |

## Problems The App Solves

- Logistics teams need a shared operational system instead of spreadsheets and chat threads.
- Customers need safe shipment visibility without seeing internal notes or financial data.
- Managers need one dashboard for shipments, tasks, documents, risks, and deadlines.
- Teams need auditability across shipment updates, document changes, task handoffs, and admin actions.
- SaaS operator needs subscription, billing, onboarding, support, and usage visibility.
- Persian/RTL logistics users need localized UI, Jalali dates, and Iranian payment/SMS integrations.

## Main Business Goals

- Support multiple logistics companies in one secure SaaS platform.
- Make onboarding a new B2B client predictable and low-risk.
- Reduce manual shipment follow-up work through customer tracking and SMS notifications.
- Improve operational accountability through tasks, workflow history, and audit logs.
- Create a technical foundation that can support enterprise clients, integrations, reporting, and future mobile/driver apps.

## MVP Scope

The rebuild MVP must include feature parity for current launch-critical features:

- Public landing, pricing, contact, signup, payment pending/callback pages.
- Password login and SMS-code login.
- Tenant/company model with memberships, roles, permissions.
- Protected dashboard shell with RTL Persian UI.
- Customers CRUD and related records.
- Shipments CRUD/status/archive/detail.
- Iran import/customs workflow progression with blockers and public/private notes.
- Tasks with assignment, status, due dates, task events.
- Documents with upload, version/replace, download, visibility, archive.
- Customer tracking by secure token and by shipment-code search with verification.
- Public customer-safe tracking DTOs and customer-visible document downloads.
- Notifications and SMS delivery queue.
- Cheques, compliance meetings, quotations.
- Archive and restore.
- Global search.
- Change/audit log.
- User management.
- Platform admin console for organizations, signups, contact requests, plans, payments, invoices, SMS, errors.
- Zarinpal billing flow.
- Demo company seed.
- E2E regression suite for critical flows.

## Post-MVP Scope

- Configurable workflow templates beyond Iran import customs.
- Advanced reporting/export center.
- S3 object storage lifecycle policies and antivirus scanning.
- Customer portal with optional customer accounts.
- Driver/fleet app or mobile experience.
- Vehicle, route, warehouse, ETA, and map modules.
- Webhooks and integrations with accounting, customs, ERP, SMS/email providers.
- White-label tenant branding.
- SLA/support module for enterprise clients.
- Advanced plan usage metering and overage billing.

## Enterprise Features

- Multi-company tenancy.
- Tenant-level roles and custom permissions.
- Platform admin separated from tenant admins.
- Audit logs for every sensitive mutation.
- Configurable workflow templates.
- Object storage with signed URLs.
- Worker queues with retries and dead-letter handling.
- Usage limits by plan.
- Backup/restore and migration tooling.
- Observability, health checks, metrics, and error tracking.
- Data export and retention policies.
- Localization-ready UI.

## Admin Features

Platform admin must be able to:

- View SaaS overview KPIs.
- Manage organizations and organization status.
- Create manual company signups.
- Review/approve/reject signup requests.
- Review/resolve contact requests.
- View and update subscription plan/limits.
- View payments, invoices, and receipts.
- Issue and void manual invoices.
- Mark payments paid/failed manually with audit trail.
- View SMS deliveries, templates, analytics, and run worker manually.
- View and resolve client/server error logs.
- Manage organization users from platform context.
- Run health diagnostics.

## Company Features

Company users must be able to:

- Log in securely.
- View a company dashboard.
- Manage customers.
- Manage shipments and shipment details.
- Upload and manage documents.
- Create tasks and assign work.
- Track workflow progress and blockers.
- Manage compliance meetings.
- Manage cheques.
- Manage quotations and convert accepted quotations to shipments.
- Search company data.
- View archive and restore records.
- View change logs if permitted.
- Manage company users if permitted.
- Configure profile, security, notification preferences, and theme.

## Driver/Fleet/Operator Features

Current app does not include live fleet or driver operations.

Assumption: Driver/fleet features are post-MVP unless the business wants to expand beyond import operations.

Future requirements:

- Driver profiles.
- Vehicle records.
- Route assignments.
- Mobile check-ins.
- GPS/location events.
- Delivery proof uploads.
- ETA and geofence notifications.
- PostGIS-backed location queries.

## Logistics Workflow Requirements

MVP workflow requirements:

- Shipments have statuses such as `PENDING`, `BOOKED`, `IN_TRANSIT`, `ARRIVED`, `CUSTOMS`, `CLEARED`, `DELIVERED`, `CLOSED`.
- Shipments can run a workflow instance such as `IR_IMPORT_CUSTOMS_V1`.
- Workflow has phases, ordered steps, current step, optional customs route, blockers, public/private notes.
- Updating workflow can create/update related tasks.
- Blockers can be opened/resolved/cancelled.
- Public status mapping must hide internal details.
- Workflow history must be auditable.

Post-MVP workflow requirements:

- Workflow templates editable by platform/admin users.
- Tenant-specific workflow variants.
- SLA timers per step.
- Automation rules for creating tasks, notifications, and SMS.

## Notifications Requirements

- In-app notifications for assignments, workflow updates, compliance reminders, due dates, and system actions.
- Read/read-all support.
- SMS queue for operational alerts and SMS login.
- SMS must respect tenant plan/features.
- Delivery status must be tracked as queued, sent, failed, skipped.
- Templates must be editable by platform admins.
- Worker must support retry/backoff and manual run.

## Reporting Requirements

MVP:

- Dashboard KPIs.
- Search results.
- Admin payment/SMS/error overviews.

Post-MVP:

- Shipment volume by customer/status/month.
- Task SLA and overdue reports.
- Document storage usage.
- Billing and revenue reports.
- SMS usage/cost reports.
- Export CSV/XLSX/PDF.
- Scheduled reports.

## Payment And Billing Requirements

- Public pricing plans.
- Signup with plan and billing cycle.
- Zarinpal payment request and callback.
- Idempotent payment verification.
- Pending/rejected/approved signup workflow.
- Organization subscription status and limits.
- Invoices, invoice items, receipts.
- Manual payment marking by admin.
- Plan feature gating, including SMS availability.

## Document And Upload Requirements

- Supported file types: PDF, images, Word, Excel, CSV, TXT, RTF.
- Reject executables/scripts and MIME/extension mismatches.
- Enforce upload size limits.
- Store objects outside the web container in S3-compatible storage.
- Store checksum, MIME type, size, version, uploader, tenant, related shipment/customer.
- Support replace/version history.
- Visibility must be `internal` or `customer_visible`.
- Public downloads must require enabled tracking access and customer-visible document visibility.

## Map, Location, And Tracking Requirements

Current MVP tracking is shipment-status tracking, not GPS tracking.

MVP:

- Secure public token tracking.
- Search by shipment code plus verification email/phone.
- Public-safe status, progress summary, public documents, company contact.

Post-MVP:

- Shipment location events.
- Vehicle tracking.
- Warehouse/geofence support.
- Map view.
- Route and ETA calculations.

## Search And Filter Requirements

- Search shipments, customers, documents, tasks, tracking, users, archive.
- Always tenant-scoped.
- Permission-aware result groups.
- Normalize Persian/Arabic characters and digits.
- Support pagination and result limits.
- Never expose secrets, hashes, raw legacy payloads, storage keys, token values, or internal public-tracking fields.
- Post-MVP: PostgreSQL full-text search or dedicated search index if volume requires it.

## Roles And Permissions Requirements

MVP roles:

- Platform Admin
- Tenant Owner/CEO
- Manager
- Operations
- Customer Service
- Finance
- Quotation Manager
- Compliance Staff
- Employee

Permissions must be fine-grained and database-backed. A user can belong to one or more tenants in future, even if MVP starts with one tenant per user.

## Multi-Company/Multi-Tenant Requirements

- Every tenant-owned record must include `tenant_id`.
- Users access tenant data only through active memberships.
- Platform admins do not automatically become tenant users unless explicitly impersonating/supporting with audit.
- Unique business identifiers should be tenant-scoped unless intentionally global.
- Public tracking must not reveal tenant identifiers.
- Background jobs must include tenant context.
- Audit events must include tenant id, actor id, target entity, before/after where appropriate.

## Decision Needed

- Decide whether "customer" means a company contact only or a future login-capable customer account.
- Decide whether driver/fleet is in first rebuild release or a later product expansion.
- Decide whether chat should remain disabled, be rebuilt, or be removed from MVP.
- Decide whether commercial cards are a required module or should be redesigned under compliance/documents.
- Decide exact Persian product copy and plan names because some current files display encoding issues in console output.

