# Security And Permissions Plan

## Security Goals

- Tenant data must be isolated by default.
- Public tracking must expose only allowlisted customer-safe DTOs.
- Platform admin access must be explicit and audited.
- Auth tokens, customer tracking tokens, OTP codes, and payment data must never be stored or logged in plaintext.
- Production must fail closed on unsafe configuration.
- All sensitive mutations must produce audit logs.

## Authentication Strategy

Use:

- Email/password login.
- Optional SMS-code login.
- Short-lived JWT access tokens.
- Refresh tokens in httpOnly secure cookies.
- Refresh token rotation with family revocation.
- Optional 2FA post-MVP.

Access token claims:

- `sub`
- `activeOrganizationId`
- `membershipId`
- `roles`
- `permissionsVersion`
- `isPlatformAdmin`
- `iat`
- `exp`

Refresh token storage:

- Store only token hash.
- Store token family id.
- Rotate refresh token on every refresh.
- Revoke token family on reuse detection.

## Authorization Strategy

Authorization has four layers:

1. Authenticated user.
2. Active organization membership.
3. Organization/subscription status.
4. Permission/policy check.

Tenant-owned APIs must never accept client-supplied `organizationId` as the source of truth. Platform admin APIs may specify organization id in the URL, but must use platform permissions and audit context.

## RBAC Model

Core objects:

- `permissions`
- `roles`
- `role_permissions`
- `organization_memberships`
- optional tenant custom roles

Permission naming convention:

- `resource.action`
- Examples:
  - `shipments.view_all`
  - `shipments.view_assigned`
  - `shipments.create`
  - `documents.upload`
  - `customer_access.manage`
  - `platform.admin`

## Tenant Isolation

Backend:

- `TenantGuard` resolves active organization and membership.
- Repository methods require `organizationId`.
- Services never trust tenant id from body.
- Background jobs include organization id and validate it.

Database:

- Every tenant-owned table has `organization_id not null`.
- Unique constraints are tenant-scoped.
- Partial active indexes use `organization_id`.
- Optional PostgreSQL RLS can be added in hardening.

Testing:

- Every protected read/write module must have tenant isolation tests.
- Public tracking leak tests must be required before launch.

## Admin Vs Company User Access

Platform admin:

- Has `platform.admin`.
- Can manage SaaS organizations, billing, signups, contact requests, SMS, errors.
- Does not automatically bypass tenant business permissions in tenant app.
- Any support/impersonation mode must create audit logs.

Tenant admin/company owner:

- Has tenant-scoped membership role such as CEO.
- Can manage company users and tenant operations.
- Cannot access platform admin APIs.

External customer:

- No internal auth.
- Uses public tracking token or shipment-code search with verification.
- Sees only public-safe DTOs.

## Password Handling

- Use Argon2id.
- Minimum password length: 12 for new accounts, 8 only for temporary migration compatibility if necessary.
- Password reset creates temporary credential or reset link and forces change.
- Never log password fields.
- Existing bcrypt hashes can be supported during migration:
  - Verify bcrypt.
  - Rehash to Argon2id after successful login.

## Token Handling

- Access token lifetime: 5 to 15 minutes.
- Refresh token lifetime: 7 to 30 days depending on remember-me.
- Refresh cookie:
  - `httpOnly`
  - `Secure`
  - `SameSite=Lax` or stricter where compatible
  - scoped path `/api/v1/auth/refresh`
- Customer tracking tokens:
  - Generate high-entropy random token.
  - Store hash only.
  - Display raw token once.
  - Reset creates new token and disables old token.

## Refresh Token Handling

Refresh token table fields:

- `id`
- `user_id`
- `token_hash`
- `family_id`
- `expires_at`
- `rotated_at`
- `revoked_at`
- `created_ip`
- `created_user_agent`
- `last_used_at`

Rules:

- On refresh, revoke old token and create new token in same transaction.
- If a revoked token is reused, revoke entire family.
- Logout revokes current token/family depending on UI action.

## Rate Limiting

Use Redis-backed rate limits in production.

Limit these routes:

- Password login by IP and account.
- SMS code request by phone and IP.
- SMS verification by phone and IP.
- Signup/contact forms.
- Payment start.
- Public tracking search.
- Public/customer document downloads.
- Protected document upload/replace/download.
- Admin dangerous mutations.

Return:

- HTTP 429.
- `Retry-After`.
- Standard error envelope.

## Input Validation

- Validate all params, query, body, and multipart metadata.
- Reject unknown enum values.
- Trim text fields.
- Max lengths on all strings.
- Normalize phone/email/search values.
- Validate IDs as UUIDs.
- Validate pagination and sorting against allowlists.
- Use DTOs per endpoint; do not pass raw request bodies into repositories.

## File Upload Security

Required:

- Extension allowlist.
- MIME allowlist.
- Max file size.
- Reject empty files.
- Reject executable/script types.
- Generate storage keys; never use user filename as path.
- Store checksum.
- Store outside web container in S3-compatible object storage.
- Set download headers:
  - `Content-Type`
  - `Content-Length`
  - `Content-Disposition`
  - `X-Content-Type-Options: nosniff`
- Scan for malware before enterprise launch.
- Signed URLs expire quickly.

## Audit Logging

Audit these:

- Login failures/successes where appropriate.
- Password/security changes.
- User create/update/suspend/delete.
- Role/permission changes.
- Organization status/subscription changes.
- Shipment/customer/document/task/workflow changes.
- Public tracking token generation/reset/disable.
- Billing/payment/invoice/receipt events.
- Archive/restore/permanent delete.
- SMS template changes and manual worker runs.
- Platform admin support actions.

Audit rules:

- Append-only.
- Include request id, IP, user agent.
- Scrub secrets and tokens.
- Store before/after for business records where useful.

## Sensitive Data Handling

Never return/log:

- Password hashes.
- Session tokens.
- Refresh token hashes.
- OTP/code hashes.
- Customer tracking tokens or hashes.
- Payment raw provider payloads to public/client APIs.
- Storage object keys.
- Internal notes in public tracking.
- Audit logs in public/customer APIs.

## Environment Variable Rules

- Validate env on boot.
- Production requires HTTPS public URL.
- Production requires Redis and object storage.
- Production rate limit store cannot be memory.
- Zarinpal live mode requires live merchant id.
- SMS live mode requires provider key and line/default-line setting.
- Do not commit `.env`.
- Use secret manager in production.

## Production Security Checklist

- [ ] `NODE_ENV=production`
- [ ] HTTPS public URL
- [ ] Secure refresh cookies
- [ ] Redis rate limiting enabled
- [ ] Object storage private bucket configured
- [ ] Database backups enabled
- [ ] Secrets rotated and stored outside repo
- [ ] Platform admin roles assigned explicitly
- [ ] Public tracking leak tests pass
- [ ] Tenant isolation tests pass
- [ ] File upload tests pass
- [ ] Payment callback idempotency tests pass
- [ ] Audit log coverage verified
- [ ] Error tracking PII scrubber enabled
- [ ] Security headers enabled

## Role/Permission Matrix

| Permission | Platform Admin | CEO | Manager | Operations | Customer Service | Finance | Quotation Manager | Compliance Staff | Employee |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `platform.admin` | Yes | No | No | No | No | No | No | No | No |
| `dashboard.view` | Support only | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| `organizations.manage` | Yes | No | No | No | No | No | No | No | No |
| `users.manage` | Yes in platform context | Yes | No | No | No | No | No | No | No |
| `roles.manage` | Yes | Yes | No | No | No | No | No | No | No |
| `shipments.view_all` | Support only | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| `shipments.view_assigned` | Support only | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| `shipments.create` | Support only | Yes | Yes | Yes | Yes | No | Yes | Yes | Yes |
| `shipments.update` | Support only | Yes | Yes | Yes | Yes | No | Yes | Yes | Yes |
| `shipments.archive` | Support only | Yes | Yes | Yes | No | No | No | No | No |
| `shipment_steps.update` | Support only | Yes | Yes | Yes | Yes | No | No | Yes | Yes |
| `customers.view` | Support only | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| `customers.create` | Support only | Yes | Yes | Yes | Yes | No | Yes | No | Yes |
| `customers.update` | Support only | Yes | Yes | Yes | Yes | No | Yes | No | Yes |
| `documents.view_all` | Support only | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| `documents.upload` | Support only | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| `documents.archive` | Support only | Yes | Yes | Yes | No | No | No | No | No |
| `customer_access.manage` | Support only | Yes | Yes | Yes | Yes | No | No | No | No |
| `tasks.view_all` | Support only | Yes | Yes | Yes | Yes | Yes | Yes | Yes | No |
| `tasks.view_own` | Support only | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| `tasks.create` | Support only | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| `tasks.assign` | Support only | Yes | Yes | Yes | No | No | No | No | No |
| `cheques.manage` | Support only | Yes | Yes | No | No | Yes | No | No | No |
| `compliance.manage` | Support only | Yes | Yes | Yes | Yes | No | No | Yes | No |
| `quotations.manage` | Support only | Yes | Yes | No | Yes | Yes | Yes | No | No |
| `archive.view` | Support only | Yes | Yes | Yes | Yes | Yes | Yes | Yes | No |
| `archive.restore` | Support only | Yes | Yes | No | No | No | No | No | No |
| `changes.view` | Support only | Yes | Yes | No | No | No | No | No | No |
| `billing.view` | Yes | Yes | No | No | No | Yes | No | No | No |

Assumption: The exact role matrix can be adjusted per tenant later with custom roles.

## Decision Needed

- Decide whether platform support users can impersonate tenants. Recommendation: not in MVP unless audited support mode is fully implemented.
- Decide whether MFA is required for platform admins at launch. Recommendation: yes before real enterprise production.
- Decide whether old bcrypt hashes are migrated or users are forced to reset passwords. Recommendation: support bcrypt-on-login rehash to minimize launch friction.

