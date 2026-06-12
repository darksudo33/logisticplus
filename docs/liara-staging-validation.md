# Liara Staging Validation

This runbook validates Logistic Plus on a fresh Liara staging app before any production cutover.

## Target Resources

Use separate staging resources:

- App: `logisticplus-staging`
- PostgreSQL database: `logisticplus_staging`
- Disk: `logisticplus-documents-staging`
- Disk mount path: `storage/documents`

The repo includes [liara.staging.json](../liara.staging.json) so CLI staging deploys do not need to reuse the existing demo app in [liara.json](../liara.json).

## Staging Environment

Set these in the Liara staging app environment:

```text
NODE_ENV=production
DATABASE_URL=<liara-staging-postgres-url>
APP_PUBLIC_URL=https://<liara-staging-domain>
DOCUMENT_STORAGE_DIR=storage/documents
DOCUMENT_MAX_BYTES=26214400
RATE_LIMIT_STORE=postgres
TRUST_PROXY=true
```

Do not commit real database URLs, seed passwords, session secrets, or storage credentials.

## Database Setup

Run this locally with staging database environment variables set:

```powershell
$env:DATABASE_URL = "<liara-staging-postgres-url>"
$env:POSTGRES_ADMIN_URL = "<liara-staging-postgres-url-or-maintenance-db-url>"
$env:SEED_USER_PASSWORD = "<strong-temporary-staging-password>"
npm run db:seed
npm run db:bridge
```

If Liara has already created the staging database, `POSTGRES_ADMIN_URL` can point to the same Liara PostgreSQL connection if that user can read `pg_database`.

## Deploy

Preferred staging CLI deploy:

```powershell
npm run deploy:staging
```

Equivalent raw command:

```powershell
liara deploy --liara-json liara.staging.json --app logisticplus-staging --port 3000 --disks logisticplus-documents-staging:storage/documents
```

The disk must already exist in Liara and be mountable by the app.

## Local Preflight

Run before deploying:

```powershell
npm run lint
npm run build
npm run smoke:production-config
npm run test:e2e:setup
npm run test:e2e
```

## Staging Smoke

After deploy, set smoke variables locally:

```powershell
$env:STAGING_PUBLIC_URL = "https://<liara-staging-domain>"
$env:STAGING_OWNER_EMAIL = "darksudo22@gmail.com"
$env:STAGING_OWNER_PASSWORD = "<strong-temporary-staging-password>"
$env:STAGING_SMOKE_SHIPMENT_ID = "s1"
npm run smoke:staging
```

The smoke script checks:

- `/api/health` and `/api/db/health`
- SPA shell routes `/`, `/login`, `/contact`, `/admin`
- removed self-serve/payment/SMS public APIs return 404
- owner login, if `STAGING_OWNER_PASSWORD` is set
- private document upload/download
- customer-visible document exposure through public tracking

Use these optional flags only when deliberately narrowing the smoke:

```powershell
$env:STAGING_SKIP_AUTH_SMOKE = "true"
```
