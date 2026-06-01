# API Design

## API Principles

- REST first.
- Version all new APIs under `/api/v1`.
- Public/customer APIs return allowlisted DTOs only.
- Protected tenant APIs require authenticated user, active organization membership, and permissions.
- All tenant-owned reads/writes must include tenant context from auth, not from client body.
- Request and response DTOs are validated with Zod or Nest DTO validation.
- Errors use one consistent envelope.

## Versioning Strategy

- New API prefix: `/api/v1`.
- Public tracking prefix: `/api/v1/public`.
- Platform admin prefix: `/api/v1/platform`.
- Tenant app prefix: `/api/v1`.
- Additive response fields are allowed.
- Breaking changes require `/api/v2` or explicit compatibility adapters.

## Standard Response Format

Success:

```json
{
  "ok": true,
  "data": {},
  "meta": {}
}
```

Error:

```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request body is invalid.",
    "field": "email",
    "details": []
  }
}
```

## Pagination, Filtering, Sorting, Search

Pagination:

- Use cursor pagination for large lists.
- Support `limit` max 100.
- Response `meta`: `nextCursor`, `limit`, `total` only when cheap.

Filtering:

- Query params use simple keys: `status`, `customerId`, `assignedTo`, `archived`, `from`, `to`.
- Reject unknown filter values.

Sorting:

- `sort=updatedAt:desc`
- Allowlist sortable fields per endpoint.

Search:

- `q` must be at least 2 normalized characters for protected search.
- Normalize Persian/Arabic variants and digits.
- Results are permission-aware.

## Auth Endpoints

| Method | Path | Purpose | Request body | Response body | Permission | Validation | Error cases |
| --- | --- | --- | --- | --- | --- | --- | --- |
| POST | `/api/v1/auth/login` | Password login | `{ email, password, remember }` | User DTO, access token, refresh cookie | Public | Email, password required | Invalid credentials, inactive user, rate limited |
| POST | `/api/v1/auth/refresh` | Rotate refresh token | none | New access token | Refresh cookie | Valid refresh cookie | Expired/revoked token |
| POST | `/api/v1/auth/logout` | Revoke current session | none | `{ success: true }` | Authenticated | none | Already logged out |
| GET | `/api/v1/auth/me` | Current user and memberships | none | User, active org, permissions | Authenticated | none | Unauthenticated |
| POST | `/api/v1/auth/sms/request-code` | Request SMS login code | `{ phone }` | Generic accepted message | Public | Phone format | Rate limited, provider unavailable |
| POST | `/api/v1/auth/sms/verify` | Verify SMS code | `{ phone, code, remember }` | User DTO, access token, refresh cookie | Public | Phone, code | Invalid/expired code, rate limited |
| POST | `/api/v1/auth/switch-organization` | Switch active tenant | `{ organizationId }` | Active tenant context | Authenticated | Membership exists | Forbidden, inactive org |

## User And RBAC Endpoints

| Method | Path | Purpose | Body | Response | Permission |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/v1/users` | List tenant users | Query filters | User list | `users.manage` |
| POST | `/api/v1/users` | Create/invite user | `{ name, email, phone, roleId }` | User DTO | `users.manage` |
| GET | `/api/v1/users/:id` | User detail | none | User DTO | `users.manage` or self |
| PATCH | `/api/v1/users/:id` | Update user | Profile/admin fields | User DTO | `users.manage` or self-limited |
| PATCH | `/api/v1/users/:id/role` | Change tenant role | `{ roleId }` | Membership DTO | `users.manage` |
| POST | `/api/v1/users/:id/suspend` | Suspend tenant access | `{ reason }` | User DTO | `users.manage` |
| POST | `/api/v1/users/:id/activate` | Reactivate tenant access | none | User DTO | `users.manage` |
| POST | `/api/v1/users/:id/password` | Admin reset password | `{ temporaryPassword }` | success | `users.manage` |
| GET | `/api/v1/users/:id/delete-preview` | Deletion blockers | none | Blockers list | `users.manage` |
| DELETE | `/api/v1/users/:id` | Delete/deactivate user when allowed | none | success | `users.manage` |
| GET | `/api/v1/roles` | List roles | none | Roles with permissions | `users.manage` |
| POST | `/api/v1/roles` | Create tenant role | Role payload | Role DTO | `roles.manage` |

## Organization/Tenant Endpoints

| Method | Path | Purpose | Permission |
| --- | --- | --- | --- |
| GET | `/api/v1/organization` | Current organization profile/settings | Authenticated |
| PATCH | `/api/v1/organization` | Update safe tenant settings | `organization.update` |
| GET | `/api/v1/organization/members` | Member options for assignment | Authenticated |
| GET | `/api/v1/organization/subscription` | Tenant subscription/limits | `billing.view` or tenant owner |
| GET | `/api/v1/organization/usage` | Usage counters for plan limits | `billing.view` |

## Shipment Endpoints

| Method | Path | Purpose | Body/Query | Response | Permission | Error cases |
| --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/v1/shipments` | List shipments | filters, pagination | Shipment list | `shipments.view_all` or assigned-only | Forbidden |
| POST | `/api/v1/shipments` | Create shipment | Shipment create DTO | Shipment detail | `shipments.create` | Duplicate code, invalid customer |
| GET | `/api/v1/shipments/:id` | Shipment detail | none | Shipment detail DTO | `shipments.view_all` or assigned | Not found |
| PATCH | `/api/v1/shipments/:id` | Update shipment | Shipment update DTO | Shipment detail | `shipments.update` | Archived, invalid transition |
| PATCH | `/api/v1/shipments/:id/status` | Change status | `{ status, publicStatus? }` | Shipment DTO | `shipments.update` | Invalid transition |
| POST | `/api/v1/shipments/:id/archive` | Archive shipment | `{ reason }` optional | Archive DTO | `shipments.archive` | Already archived |
| POST | `/api/v1/shipments/:id/restore` | Restore shipment | none | Shipment DTO | `archive.restore` | Not archived |
| GET | `/api/v1/shipments/:id/documents` | Shipment documents | filters | Documents | `documents.view_related` | Forbidden |

## Workflow Endpoints

| Method | Path | Purpose | Body | Permission |
| --- | --- | --- | --- | --- |
| GET | `/api/v1/shipments/:id/workflow` | Current workflow progress | none | `shipments.view_all` |
| POST | `/api/v1/shipments/:id/workflow/start` | Start workflow | `{ templateKey }` | `shipment_steps.update` |
| PATCH | `/api/v1/shipments/:id/workflow/current` | Update current step/status/route | `{ stepCode, status, route, internalNote, publicNote, publicVisible }` | `shipment_steps.update` |
| POST | `/api/v1/shipments/:id/workflow/blockers` | Open blocker | `{ stepCode, blockerCode, internalNote, publicNote }` | `shipment_steps.update` |
| POST | `/api/v1/shipments/:id/workflow/unblock` | Resolve/cancel blocker | `{ blockerId, status, note }` | `shipment_steps.update` |
| GET | `/api/v1/workflow-templates` | List active templates | none | `shipments.view_all` |

## Customer Endpoints

| Method | Path | Purpose | Permission |
| --- | --- | --- | --- |
| GET | `/api/v1/customers` | List/search customers | `customers.view` |
| POST | `/api/v1/customers` | Create customer | `customers.create` |
| GET | `/api/v1/customers/:id` | Customer detail | `customers.view` |
| PATCH | `/api/v1/customers/:id` | Update customer | `customers.update` |
| POST | `/api/v1/customers/:id/archive` | Archive customer | `customers.update` |
| GET | `/api/v1/customers/:id/shipments` | Related shipments | `customers.view` + shipment permission |
| GET | `/api/v1/customers/:id/documents` | Related documents | `customers.view` + document permission |
| GET | `/api/v1/customers/:id/quotations` | Related quotations | `quotations.manage` |
| GET | `/api/v1/customers/:id/cheques` | Related cheques | `cheques.manage` |

## Task Endpoints

| Method | Path | Purpose | Permission |
| --- | --- | --- | --- |
| GET | `/api/v1/tasks` | List tasks with filters | `tasks.view_own` or `tasks.view_all` |
| POST | `/api/v1/tasks` | Create task | `tasks.create` |
| GET | `/api/v1/tasks/:id` | Task detail | Own/all policy |
| PATCH | `/api/v1/tasks/:id` | Update task | Own/all policy |
| PATCH | `/api/v1/tasks/:id/assign` | Assign/reassign | `tasks.assign` |
| PATCH | `/api/v1/tasks/:id/status` | Change status | Own/all policy |
| GET | `/api/v1/tasks/:id/events` | Assignment/status history | Own/all policy |

## Document Endpoints

| Method | Path | Purpose | Body | Permission |
| --- | --- | --- | --- | --- |
| GET | `/api/v1/documents` | List documents | filters | `documents.view_all` |
| POST | `/api/v1/documents` | Upload document | multipart + metadata | `documents.upload` |
| GET | `/api/v1/documents/:id` | Metadata/detail | none | document policy |
| GET | `/api/v1/documents/:id/download` | Download private document | none | document policy |
| PATCH | `/api/v1/documents/:id` | Update metadata | metadata DTO | `documents.upload` or owner policy |
| POST | `/api/v1/documents/:id/replace` | Upload replacement version | multipart | `documents.upload` |
| PATCH | `/api/v1/documents/:id/visibility` | Internal/customer-visible | `{ visibility }` | `customer_access.manage` |
| POST | `/api/v1/documents/:id/archive` | Archive document | reason optional | `documents.archive` |

## Public Tracking Endpoints

| Method | Path | Purpose | Body/Params | Response |
| --- | --- | --- | --- | --- |
| GET | `/api/v1/public/track/:token` | Token tracking | token param | Public tracking DTO |
| POST | `/api/v1/public/track/search` | Search by code + verification | `{ shipmentCode, verification }` | Public tracking DTO |
| GET | `/api/v1/public/track/:token/documents/:documentId` | Download visible document | token, document id | File stream |

Public tracking DTO must include only:

- Shipment code.
- Public status label/description.
- Origin/destination if approved.
- Estimated delivery if approved.
- Public workflow phase/label/counts.
- Customer-visible documents.
- Company contact text.

Never include:

- Internal notes.
- User/staff ids.
- Organization id.
- Customer id.
- Token or token hash.
- Cheques, invoices, tasks, audit logs, compliance internals.
- Storage object keys.

## Admin And Platform Endpoints

| Method | Path | Purpose | Permission |
| --- | --- | --- | --- |
| GET | `/api/v1/platform/overview` | SaaS KPIs | `platform.admin` |
| GET | `/api/v1/platform/organizations` | List organizations | `platform.admin` |
| POST | `/api/v1/platform/organizations/manual-signup` | Manual active org/user/subscription | `platform.admin` |
| GET | `/api/v1/platform/organizations/:id` | Org detail | `platform.admin` |
| PATCH | `/api/v1/platform/organizations/:id` | Update org | `platform.admin` |
| POST | `/api/v1/platform/organizations/:id/suspend` | Suspend org | `platform.admin` |
| POST | `/api/v1/platform/organizations/:id/activate` | Activate org | `platform.admin` |
| GET | `/api/v1/platform/signup-requests` | Signup review queue | `platform.admin` |
| POST | `/api/v1/platform/signup-requests/:id/approve` | Approve signup | `platform.admin` |
| POST | `/api/v1/platform/signup-requests/:id/reject` | Reject signup | `platform.admin` |
| DELETE | `/api/v1/platform/signup-requests/:id/abandoned` | Delete abandoned signup | `platform.admin` |
| GET | `/api/v1/platform/contact-requests` | Lead queue | `platform.admin` |
| POST | `/api/v1/platform/contact-requests/:id/resolve` | Resolve lead | `platform.admin` |
| GET | `/api/v1/platform/error-logs` | Error logs | `platform.admin` |
| POST | `/api/v1/platform/error-logs/:id/resolve` | Resolve error | `platform.admin` |

## Billing Endpoints

| Method | Path | Purpose | Permission |
| --- | --- | --- | --- |
| GET | `/api/v1/plans` | Public plans | Public |
| POST | `/api/v1/billing/payments/:id/start` | Start payment | Public or owner context |
| GET | `/api/v1/billing/zarinpal/callback` | Gateway callback | Public callback |
| GET | `/api/v1/billing/my-subscription` | Current tenant subscription | Authenticated |
| GET | `/api/v1/billing/my-invoices` | Tenant invoices | Billing permission |
| GET | `/api/v1/billing/my-payments` | Tenant payments | Billing permission |
| GET | `/api/v1/platform/billing/payments` | All payments | `platform.admin` |
| GET | `/api/v1/platform/billing/invoices` | All invoices | `platform.admin` |
| POST | `/api/v1/platform/billing/invoices` | Create manual invoice | `platform.admin` |
| POST | `/api/v1/platform/billing/invoices/:id/void` | Void invoice | `platform.admin` |
| POST | `/api/v1/platform/billing/payments/:id/mark-paid` | Manual paid | `platform.admin` |
| POST | `/api/v1/platform/billing/payments/:id/mark-failed` | Manual failed | `platform.admin` |

## Reporting Endpoints

MVP:

- `GET /api/v1/dashboard`
- `GET /api/v1/reports/shipments/summary`
- `GET /api/v1/reports/tasks/summary`
- `GET /api/v1/platform/reports/billing/summary`
- `GET /api/v1/platform/reports/sms/summary`

Post-MVP:

- CSV/XLSX export endpoints should create background jobs and return export job ids.

## Upload, Notification, Webhook Endpoints

Notifications:

- `GET /api/v1/notifications`
- `PATCH /api/v1/notifications/:id/read`
- `PATCH /api/v1/notifications/read-all`

SMS/platform:

- `GET /api/v1/platform/sms/deliveries`
- `GET /api/v1/platform/sms/analytics`
- `GET /api/v1/platform/sms/templates`
- `PATCH /api/v1/platform/sms/templates/:key`
- `POST /api/v1/platform/sms/run-worker`

Webhooks post-MVP:

- `POST /api/v1/webhooks`
- `GET /api/v1/webhooks`
- `POST /api/v1/webhooks/:id/test`
- `DELETE /api/v1/webhooks/:id`

## Rate Limiting

Rate limit:

- Password login by IP and account.
- SMS request by phone and IP.
- SMS verify by phone and IP.
- Public signup/contact.
- Payment start.
- Public tracking search.
- Public document download.
- Protected document upload/download.
- Admin dangerous mutations.

Use Redis for production counters. Keep PostgreSQL fallback only for disaster/simple deployments.

## Decision Needed

- Decide if route compatibility adapters should expose old paths during migration. Recommendation: new app uses `/api/v1`, old app keeps old paths until cutover.
- Decide if customer tracking origin/destination fields are always public or tenant-configurable.
- Decide whether platform admin APIs live under `/api/v1/platform` or `/api/v1/admin`. Recommendation: `/platform` to avoid confusing tenant admins with platform admins.

