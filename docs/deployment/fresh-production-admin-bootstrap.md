# Fresh Production Bootstrap

Use this runbook only for a brand-new Logistic Plus production database where you are not importing old production data.

Fresh production bootstrap has two safe, idempotent parts:

- `seed:production-core` ensures shared catalog rows that a blank production database needs.
- `seed:production-admin` ensures one initial real admin user, one real organization, owner membership, direct `platform.admin`, and the initial subscription.

It does not seed demo records, import legacy data, run document backfill, create invoices, create payment authorities, upload documents, or delete anything.

## When To Run

Run it after production migrations complete and before first login on a fresh Liara PostgreSQL database.

Do not run `npm run db:seed`, `npm run db:bridge`, `npm run db:seed:demo`, or document backfill as part of this fresh production path unless there is a separate approved migration/import plan.

## Required Env Vars

Set these in Liara app environment variables or in the one shell that runs the scripts:

- `DATABASE_URL`
- `INITIAL_ADMIN_EMAIL`
- `INITIAL_ADMIN_PASSWORD`
- `INITIAL_ADMIN_NAME`
- `INITIAL_ORG_NAME`

Optional:

- `INITIAL_ADMIN_PHONE`
- `INITIAL_ORG_PLAN_ID` default `enterprise`
- `INITIAL_ORG_BILLING_CYCLE` default `annual`
- `INITIAL_ORG_SUBSCRIPTION_STATUS` default `active`

Password requirements:

- At least 12 characters
- At least one lowercase letter
- At least one uppercase letter
- At least one number
- At least one symbol

The scripts never print the password or database URL.

## Safe Command Order

After setting env vars in Liara:

```bash
liara shell --app logisticplus --command "npm run db:migrate"
liara shell --app logisticplus --command "npm run seed:production-core -- --dry-run"
liara shell --app logisticplus --command "npm run seed:production-core"
liara shell --app logisticplus --command "npm run seed:production-admin -- --dry-run"
liara shell --app logisticplus --command "npm run seed:production-admin"
liara shell --app logisticplus --command "npm run verify:fresh-production"
```

Run object-storage smoke after ArvanCloud env vars are set:

```bash
liara shell --app logisticplus --command "npm run documents:storage:smoke"
```

For local verification against a disposable database:

```powershell
npm run seed:production-core:test
npm run seed:production-admin:test
```

## What It Creates Or Ensures

Core catalog:

- `subscription_plans` for `starter`, `business`, and `enterprise` from the subscription plan catalog.
- Tenant `permissions` used by production workflows.
- Direct-only `platform.admin` permission.
- Tenant `roles`: `CEO`, `MANAGER`, `OPERATIONS`, `CUSTOMER_SERVICE`, `FINANCE`, `QUOTATION_MANAGER`, `COMPLIANCE_STAFF`, `EMPLOYEE`, `CUSTOMER_VIEWER`.
- `role_permissions` for tenant access, excluding `platform.admin`.

Initial admin:

- `app_users` row for `INITIAL_ADMIN_EMAIL` if missing.
- `organizations` row for `INITIAL_ORG_NAME` if missing.
- Active owner `organization_members` row.
- Direct `user_permissions` grant for `platform.admin`.
- Initial `organization_subscriptions` row using `INITIAL_ORG_PLAN_ID`.
- Best-effort `change_logs` and `audit_logs` event when those tables exist.

The password hash uses bcrypt with cost factor 12.

## Idempotency

Repeated runs do not duplicate plans, permissions, roles, role-permissions, user, organization, membership, subscription, or direct platform admin grant.

If the user already exists, the admin script preserves the existing password hash unless `--reset-password` is passed. It may still ensure the user is active, has role `CEO`, has the target organization as the primary organization when currently unassigned, and has active owner membership.

If the existing user already belongs to a different organization, the script refuses to move it because the current app model has one primary `organization_id` per user.

## Intentional Password Reset

To reset the existing bootstrap admin password, set `INITIAL_ADMIN_PASSWORD` to the new strong value and run:

```bash
liara shell --app logisticplus --command "npm run seed:production-admin -- --reset-password"
```

Without `--reset-password`, password hashes are not overwritten.

## Verification

Automated:

```bash
liara shell --app logisticplus --command "npm run verify:fresh-production"
```

Manual:

1. Open `APP_PUBLIC_URL/login`.
2. Login with `INITIAL_ADMIN_EMAIL` and the password from your secret manager or Liara env setup notes.
3. Confirm `/dashboard` loads.
4. Confirm `/admin` loads and requires `platform.admin`.
5. Confirm `/api/me` or the login response includes `platform.admin`.
6. Create a customer and a shipment.
7. Confirm manual company signup can select a plan.

Database spot check:

```sql
SELECT u.email, u.role, u.status, o.name, o.plan_id, om.role AS membership_role, p.key
FROM app_users u
JOIN organizations o ON o.id = u.organization_id
JOIN organization_members om ON om.user_id = u.id AND om.organization_id = o.id
JOIN user_permissions up ON up.user_id = u.id
JOIN permissions p ON p.id = up.permission_id
WHERE lower(u.email) = lower('<initial-admin-email>')
  AND p.key = 'platform.admin';
```

Do not paste passwords, database URLs, gateway authorities, message-provider secrets, bucket names, access keys, or token values into logs or tickets.

## Automated Verifiers

```powershell
npm run seed:production-core:test
npm run seed:production-admin:test
```

`seed:production-core:test` creates a guarded disposable PostgreSQL database whose name must include `test` and `core`, runs migrations, checks dry-run rollback, checks idempotency, proves the first admin can create customers and shipments, proves manual company signup can use plans, and checks demo data was not created.

`seed:production-admin:test` creates a guarded disposable PostgreSQL database whose name must include `test` and `bootstrap`, runs migrations, runs bootstrap repeatedly, checks password preservation and explicit reset behavior, checks that `platform.admin` is a direct user grant rather than a role permission, checks bcrypt verification, and checks that passwords are not printed.

## Rollback Notes

On a truly fresh database before customer data exists, the safest rollback is to restore the pre-bootstrap database backup or recreate the fresh database and rerun migrations.

After real use begins, do not delete records manually. Use existing admin/user-management flows where possible. For a wrong password, rerun with `--reset-password`. For a wrong platform admin grant, use the audited platform-admin revoke flow or a reviewed SQL change with a backup and rollback plan. Audit rows are append-only and should remain as history.
