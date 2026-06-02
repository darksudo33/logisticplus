# Liara Fresh Deploy Runbook

This runbook is for deploying Logistic Plus to the Liara NodeJS app `logisticplus` with a fresh Liara PostgreSQL database, ArvanCloud S3-compatible object storage, and one initial admin created from environment variables.

Do not use this runbook to import old production data. Do not run demo seed, bridge seed, or document backfill.

## Prerequisites

- Liara app is created as a NodeJS app.
- Fresh Liara PostgreSQL database is attached and reachable from the app.
- Private ArvanCloud bucket and access keys are ready.
- Liara CLI is authenticated locally, or you can run the commands manually from another authenticated machine.
- Real secrets are configured only in Liara env vars or your local shell, never in source files or `liara.json`.

## Deployment Config

[liara.json](/C:/Users/Ahmadreza/Documents/logisticplus/liara.json) is intentionally generic:

```json
{
  "platform": "node",
  "port": 3000
}
```

Use the app name explicitly:

```bash
liara deploy --app logisticplus
```

## Liara Env Checklist

Core:

```text
NODE_ENV=production
DATABASE_URL=<Liara private PostgreSQL URL>
APP_PUBLIC_URL=<production HTTPS app URL>
SESSION_SECRET=<strong random secret>
COOKIE_DOMAIN=<custom domain only if needed>
RATE_LIMIT_STORE=postgres
TRUST_PROXY=true
```

Initial admin and first organization:

```text
INITIAL_ADMIN_EMAIL=<admin email>
INITIAL_ADMIN_PASSWORD=<strong password, at least 12 chars with upper/lower/number/symbol>
INITIAL_ADMIN_NAME=<admin display name>
INITIAL_ORG_NAME=<first organization name>
INITIAL_ADMIN_PHONE=<optional phone>
INITIAL_ORG_PLAN_ID=enterprise
INITIAL_ORG_BILLING_CYCLE=annual
INITIAL_ORG_SUBSCRIPTION_STATUS=active
```

ArvanCloud object storage:

```text
DOCUMENT_STORAGE_MODE=object
OBJECT_STORAGE_ENABLED=true
OBJECT_STORAGE_PROVIDER=s3
S3_ENDPOINT=https://s3.ir-thr-at1.arvanstorage.ir
S3_REGION=ir-thr-at1
S3_ACCESS_KEY_ID=<Arvan access key>
S3_SECRET_ACCESS_KEY=<Arvan secret key>
S3_DOCUMENT_BUCKET=<private bucket name>
S3_FORCE_PATH_STYLE=true
DOCUMENT_STORAGE_DUAL_WRITE_REQUIRED=true
```

SMS and Zarinpal:

```text
ZARINPAL_SANDBOX=false
ZARINPAL_MERCHANT_ID=<live merchant id when payments are ready>
ZARINPAL_TIMEOUT_MS=10000
SMS_ENABLED=false
SMS_DRY_RUN=true
SMSIR_API_KEY=<set only when live SMS is ready>
SMSIR_LINE_NUMBER=<set only when live SMS is ready>
SMSIR_USE_DEFAULT_LINE=false
SMS_TIMEOUT_MS=10000
SMS_WORKER_ENABLED=false
SMS_WORKER_INTERVAL_MS=300000
```

Keep SMS disabled/dry-run until live provider settings and templates are verified. Keep payment, SMS, database, and object-storage secrets out of source control and support logs.

## Local Preflight

Run these before deploying:

```bash
npm install
npm run lint
npm run build
npm run safety:check
npm run db:migrate:fresh:test
npm run db:migrate:current:test
npm run seed:production-core:test
npm run seed:production-admin:test
npm run test:e2e:setup
npx playwright test tests/e2e/security.spec.ts
npx playwright test tests/e2e/document-download-print.spec.ts
npx playwright test tests/e2e/audit-logging.spec.ts
```

## Deploy

```bash
liara deploy --app logisticplus
```

## Fresh Production Command Order

Run these inside Liara shell after deploy and after env vars are set:

```bash
liara shell --app logisticplus --command "npm run db:migrate"
liara shell --app logisticplus --command "npm run seed:production-core -- --dry-run"
liara shell --app logisticplus --command "npm run seed:production-core"
liara shell --app logisticplus --command "npm run seed:production-admin -- --dry-run"
liara shell --app logisticplus --command "npm run seed:production-admin"
liara shell --app logisticplus --command "npm run verify:fresh-production"
liara shell --app logisticplus --command "npm run documents:storage:smoke"
```

If the Liara CLI keeps streaming logs after a command has already printed success, stop that shell session with `Ctrl+C` and continue with the next command.

Do not run these commands on the fresh production path:

```text
npm run db:seed
npm run db:bridge
npm run db:seed:demo
npm run documents:storage:backfill
```

## What The Seeds Create

`seed:production-core` creates or ensures only shared production catalog data:

- Public subscription plans from [src/lib/pricing.ts](/C:/Users/Ahmadreza/Documents/logisticplus/src/lib/pricing.ts): `starter`, `business`, `enterprise`.
- Tenant permissions used by dashboards, customers, shipments, documents, tasks, chat, archive, compliance, quotations, cheques, and user management.
- Direct-only platform permission `platform.admin`.
- Tenant roles: `CEO`, `MANAGER`, `OPERATIONS`, `CUSTOMER_SERVICE`, `FINANCE`, `QUOTATION_MANAGER`, `COMPLIANCE_STAFF`, `EMPLOYEE`, `CUSTOMER_VIEWER`.
- Role-permission rows for tenant access. No role receives `platform.admin`.
- Default SMS template rows. Existing template bodies and enabled flags are preserved.
- First organization subscription when the initial organization already exists.

`seed:production-admin` creates or ensures the first real admin user, first real organization, owner membership, explicit `platform.admin` user grant, and active first-organization subscription. It preserves existing passwords unless `--reset-password` is passed.

Neither seed creates demo customers, demo shipments, documents, imported legacy records, invoices, payment authorities, or object-storage files.

## Manual Smoke Checklist

- App opens at `APP_PUBLIC_URL`.
- Login with the initial admin works.
- `/dashboard` works.
- `/admin` works and requires `platform.admin`.
- The admin can create a customer.
- The admin can create a shipment.
- Manual company signup from `/admin` can select a plan.
- Upload, replace, and download a document through app routes.
- Mark a document `customer_visible` and verify public tracking can download only that public document.
- Private public-document download is blocked.
- Audit logs are written.
- Public tracking responses do not contain storage keys, object keys, bucket names, storage paths, signed URLs, token hashes, or internal document fields.
- SMS is disabled/dry-run unless real production credentials are ready.

## Rollback Plan

- If deploy fails, roll back to the previous Liara release.
- Do not delete the PostgreSQL database.
- Do not delete the ArvanCloud bucket.
- Do not delete uploaded objects.
- If object storage fails, fix env vars/credentials and keep the bucket private.
- If admin bootstrap used the wrong password, rerun `npm run seed:production-admin -- --reset-password` with the intended env password.
- If admin bootstrap used the wrong email or organization after real use begins, do not manually delete rows. Use an approved SQL fix or app admin flow with a backup and rollback plan.
