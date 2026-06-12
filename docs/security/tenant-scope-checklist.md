# Tenant Scope Audit Checklist

Use this checklist before changing protected routes, data access, route extraction, public DTOs, archive behavior, or compatibility-bridge writes. This file is intentionally non-invasive: check items during review, then add focused tests before changing behavior.

## Global Rules

- [ ] Normal protected routes derive tenant scope from the authenticated session user, not from client-supplied `organizationId`.
- [ ] Platform-admin routes are the only place where target organization ids can come from route/query/body input, and only after `requirePlatformAdmin`.
- [ ] Every protected tenant-owned read includes `organization_id` or an explicit equivalent server-side scope.
- [ ] Every protected tenant-owned write/update/archive/delete includes `organization_id` or an explicit equivalent server-side scope.
- [ ] Raw SQL uses parameterized values and does not interpolate user-controlled identifiers.
- [ ] Response DTOs omit tokens, hashes, password fields, storage keys, raw filesystem paths, merchant secrets, SMS codes, and raw legacy payloads.
- [ ] Security-sensitive changes add or update focused tests.

## Area Checklist

### Customers

- [ ] Customer list/detail/search/update/archive routes use `user.organizationId`.
- [ ] Customer related shipment/document/task lookups are scoped to the same organization.
- [ ] Duplicate/unique checks cannot leak cross-tenant records.
- [ ] Cross-tenant customer id access returns 404 or 403 consistently.

### Shipments

- [ ] Shipment list/detail/update/status/archive routes use `user.organizationId`.
- [ ] Shipment customer, manager, and owner references belong to the same organization.
- [ ] Customer tracking token generation/reset/disable is scoped to the shipment organization.
- [ ] Legacy shipment bridge writes preserve existing public tracking and workflow fields.

### Tasks

- [ ] Task list/detail/create/update/assign/status/event routes use `user.organizationId`.
- [ ] Assignment targets belong to the same organization and are active.
- [ ] Workflow-linked tasks validate workflow instance, blocker, and shipment ownership by organization.
- [ ] Personal/team task filters do not widen tenant scope.

### Documents

- [ ] Document list/detail/download/update/archive/visibility routes use `user.organizationId`.
- [ ] Upload and metadata update validate shipment/customer associations inside the same organization before storing or linking files.
- [ ] Download responses stream files without returning `storage_key`, raw file paths, or generated storage filenames in JSON.
- [ ] Public visibility changes are audited and cannot expose private or archived documents.

### Workflow

- [ ] Shipment workflow progress/start/current/blocker/unblock routes load the shipment with `user.organizationId`.
- [ ] Workflow instances, step states, blockers, events, and public projections all include organization scope.
- [ ] Public workflow summaries expose public labels/notes only, not internal notes or blockers.
- [ ] Missing workflow migrations fail safely without falling back to unscoped legacy reads.

### Billing

- [ ] Company billing views use `user.organizationId`.
- [ ] Platform billing/admin routes require `requirePlatformAdmin` before accepting target organization filters.
- [ ] Zarinpal callback lookup is idempotent and does not trust client amount, organization id, or status beyond gateway verification rules.
- [ ] Invoice, receipt, payment, subscription, signup, and organization transitions happen in one safe transaction path.

### Archive

- [ ] Archive list/search/detail routes use `user.organizationId`.
- [ ] Archive/restore updates source-row `archived_at` and `archive_records` in the same transaction when both are touched.
- [ ] Permanent delete is limited to explicit archive permanent-delete flows and requires archived source rows.
- [ ] Document permanent delete collects storage keys by tenant scope before removing files.

### Search

- [ ] Operational search requires an authenticated active user and active organization.
- [ ] Every search type query scopes by `organization_id` or a documented owner fallback for legacy rows.
- [ ] Explicit forbidden search types return 403 instead of silently widening results.
- [ ] Search result DTOs omit tokens, hashes, storage keys, raw paths, and raw legacy payloads.

### Platform Admin

- [ ] Every platform admin route calls `requirePlatformAdmin` before accepting target organization/user ids.
- [ ] Admin organization filters are treated as privileged admin targeting, not normal tenant scope.
- [ ] Admin user mutations protect last active CEO and self-destructive actions.
- [ ] Admin billing, SMS, error-log, signup, and organization responses avoid exposing secrets.

### Public Tracking

- [ ] Public tracking uses only allowlisted DTO builders from public tracking code.
- [ ] Public payloads exclude internal shipment/customer/user/organization/audit/task/cheque/compliance/billing fields.
- [ ] Public document URLs do not expose storage keys or filesystem paths.
- [ ] Public document download requires customer-visible documents on customer-access-enabled shipments, preferably through token-bound routes.
- [ ] Public tracking search keeps verification rules and rate limits intact.
