# Fresh Production Core Seed

`npm run seed:production-core` fills the production catalog rows that migrations intentionally do not treat as customer data. It is safe to run repeatedly and supports `--dry-run`.

Use it after migrations and before `seed:production-admin` on a fresh production database.

## Commands

Local disposable verifier:

```powershell
npm run seed:production-core:test
```

Liara production:

```bash
liara shell --app logisticplus --command "npm run db:migrate"
liara shell --app logisticplus --command "npm run seed:production-core -- --dry-run"
liara shell --app logisticplus --command "npm run seed:production-core"
liara shell --app logisticplus --command "npm run seed:production-admin -- --dry-run"
liara shell --app logisticplus --command "npm run seed:production-admin"
liara shell --app logisticplus --command "npm run verify:fresh-production"
```

If Liara CLI keeps streaming logs after a success line, stop that shell session with `Ctrl+C` and continue with the next command.

## Env Vars

Required:

- `DATABASE_URL`

Optional first-organization subscription settings:

- `INITIAL_ADMIN_EMAIL`
- `INITIAL_ORG_NAME`
- `INITIAL_ORG_PLAN_ID` default `enterprise`
- `INITIAL_ORG_BILLING_CYCLE` default `annual`
- `INITIAL_ORG_SUBSCRIPTION_STATUS` default `active`

When the first organization does not exist yet, the core seed skips subscription creation. `seed:production-admin` runs the core catalog again, creates the first organization/admin if needed, and then creates the first subscription.

## Seeded Rows

Subscription plans:

- `starter`
- `business`
- `enterprise`

Tenant roles:

- `CEO`
- `MANAGER`
- `OPERATIONS`
- `CUSTOMER_SERVICE`
- `FINANCE`
- `QUOTATION_MANAGER`
- `COMPLIANCE_STAFF`
- `EMPLOYEE`
- `CUSTOMER_VIEWER`

Permissions:

- Tenant permissions for dashboard, shipments, shipment steps, customers, tasks, documents, changes, chat, users, cheques, compliance, quotations, archive, and customer tracking access.
- `platform.admin` as a direct-only platform permission.

Other catalog rows:

- `role_permissions` for tenant roles.
- Default `sms_templates`.
- First organization subscription when the initial organization can be found.

## Safety Rules

- No role receives `platform.admin`; it must stay a direct `user_permissions` grant.
- Existing SMS template bodies and enabled flags are not overwritten.
- Existing user passwords are not touched.
- No customers, shipments, documents, invoices, payment authorities, archive records, legacy imports, or demo company data are created.
- The script does not write object-storage files.

## Verification

`npm run seed:production-core:test` proves:

- Fresh migrations plus core seed succeed on a blank database.
- `--dry-run` rolls back.
- Repeated core seed runs are idempotent.
- Required plans, roles, permissions, role-permissions, and SMS templates exist.
- `platform.admin` is not granted through tenant roles.
- Admin bootstrap can run after core seed.
- The first admin can create a customer and shipment.
- Manual company signup can select a seeded plan.
- Demo ParsRah data is absent.

`npm run verify:fresh-production` is the read-only production check after Liara seeding. It verifies schema, catalog, initial admin/subscription when initial env vars are present, no demo data, and object-storage configuration.
