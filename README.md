# Logistic Plus

Logistic Plus is a Persian RTL logistics operations app for shipment operations, customer tracking, documents, workflow tasks, billing records, and company administration.

The current repository uses:

- Vite + React + TypeScript for the frontend.
- React Router for app/public routes.
- Express through [server.js](/C:/Users/Ahmadreza/Documents/logisticplus/server.js), which is a compatibility bridge into [server/src/server.js](/C:/Users/Ahmadreza/Documents/logisticplus/server/src/server.js) for API startup and production static serving.
- PostgreSQL through the raw `pg` pool plus module repositories under [server/src/modules](/C:/Users/Ahmadreza/Documents/logisticplus/server/src/modules). [src/server/db.js](/C:/Users/Ahmadreza/Documents/logisticplus/src/server/db.js) remains as the legacy aggregate data-access layer for APIs and scripts that still need it.
- SQL schema setup through [db/schema.sql](/C:/Users/Ahmadreza/Documents/logisticplus/db/schema.sql).
- Password login with platform-admin controlled company/user provisioning. Public self-serve checkout, contact intake, marketing plan pages, and phone-code worker surfaces are not active in the public-release app.

Do not assume this project is Next.js or Prisma-based unless the stack is deliberately changed later.

## Current App State

Last checked: 2026-06-19.

- Local app is running on `http://localhost:3000`; `/api/health` and `/api/db/health` return ok.
- Browser smoke should check `/`, `/login`, `/dashboard`, `/admin`, and token-based public tracking routes. `/` shows the login entry; removed public marketing/self-serve/search routes redirect to login.
- The protected app currently opens for the seeded owner session. Admin includes manual organization/user provisioning, historical signup/contact review, subscription limits, billing records, and operational errors.
- The regression suite is green: `npm.cmd run test:e2e:setup` reset `logisticplus_test`, then `npm.cmd run test:e2e` passed 43/43 tests.
- `npm.cmd run lint`, `node --check server.js`, `node --check src/server/db.js`, `npm.cmd run build`, migration verification, and production-config smoke checks should pass before deploy. The build still emits Vite's existing large chunk warning.
- In the Codex desktop sandbox, Vite/esbuild may fail to read parent directories while loading `vite.config.ts`; rerunning the same build outside the sandbox passed.

## Backend Layout

The backend is module-first under [server/src](/C:/Users/Ahmadreza/Documents/logisticplus/server/src):

- [server/src/app.js](/C:/Users/Ahmadreza/Documents/logisticplus/server/src/app.js) creates the Express app and shared middleware.
- [server/src/server.js](/C:/Users/Ahmadreza/Documents/logisticplus/server/src/server.js) owns startup, route registration, workers, and WebSocket attachment.
- [server/src/config](/C:/Users/Ahmadreza/Documents/logisticplus/server/src/config), [server/src/db](/C:/Users/Ahmadreza/Documents/logisticplus/server/src/db), and [server/src/shared](/C:/Users/Ahmadreza/Documents/logisticplus/server/src/shared) hold cross-cutting infrastructure.
- Business routes and repositories live in [server/src/modules](/C:/Users/Ahmadreza/Documents/logisticplus/server/src/modules), grouped by capability.

The backend intentionally stays on runtime-safe `.js` files for now. `npm start` runs `node server.js`, and Liara can keep using the standard Node.js startup path without a separate server compile step.

Some legacy support code still lives under [src/server](/C:/Users/Ahmadreza/Documents/logisticplus/src/server), including AI, document storage, public tracking, request schemas, shipment workflow/template helpers, cheque/compliance helpers, and the aggregate [src/server/db.js](/C:/Users/Ahmadreza/Documents/logisticplus/src/server/db.js). Do not reintroduce route or repository compatibility wrappers there for modules that already live under [server/src/modules](/C:/Users/Ahmadreza/Documents/logisticplus/server/src/modules).

## Prerequisites

- Node.js 22-compatible runtime.
- npm.
- PostgreSQL running locally or reachable through `DATABASE_URL`.
- PowerShell for the commands below.

The app listens on `http://localhost:3000` by default. Set `PORT` to use a different port.

## Local Setup

1. Install dependencies:

```powershell
npm install
```

2. Create a local environment file:

```powershell
Copy-Item .env.example .env
```

3. Edit `.env` for your PostgreSQL connection, seed password, document storage, and public URL.

For local development, the default database URLs are:

```text
DATABASE_URL=postgres://postgres@localhost:5432/logisticplus
POSTGRES_ADMIN_URL=postgres://postgres@localhost:5432/postgres
```

4. Seed and bridge the database:

```powershell
npm run db:seed
npm run db:bridge
```

5. Start the full Express + Vite development server:

```powershell
npm run dev
```

6. Open the app:

```text
http://localhost:3000
```

## Seed Data

`npm run db:schema` applies only `db/schema.sql` to `DATABASE_URL`. Use it for an existing database that needs new tables/indexes without seeding demo data.

`npm run db:seed` applies `db/schema.sql`, creates the configured database if needed through `POSTGRES_ADMIN_URL`, seeds the owner user, and writes legacy mock collections into `user_records`.

`npm run db:bridge` reapplies the schema foundation, seeds roles, permissions, subscription plans, the default organization, and bridges legacy records into canonical PostgreSQL tables.

Default local owner login if `SEED_USER_PASSWORD` is not changed:

- Email: `darksudo22@gmail.com`
- Password: `57603314`

Set `SEED_USER_PASSWORD` before running `npm run db:seed` for any real environment. The default password is only a local development convenience.

`npm run seed:production-admin` is the fresh-production path for a new Liara database. It reads `INITIAL_ADMIN_EMAIL`, `INITIAL_ADMIN_PASSWORD`, `INITIAL_ADMIN_NAME`, `INITIAL_ORG_NAME`, and optional `INITIAL_ADMIN_PHONE`, then creates or reuses the first real admin user and organization without importing demo or legacy records. See [docs/deployment/fresh-production-admin-bootstrap.md](/C:/Users/Ahmadreza/Documents/logisticplus/docs/deployment/fresh-production-admin-bootstrap.md).

## Environment Variables

See [.env.example](/C:/Users/Ahmadreza/Documents/logisticplus/.env.example) for the authoritative local template.

Important variables:

- `DATABASE_URL`: PostgreSQL connection used by the API, seed script, bridge script, and data layer.
- `POSTGRES_ADMIN_URL`: maintenance database connection used by the seed script to create the target database.
- `SEED_USER_PASSWORD`: password assigned to the seeded owner user.
- `INITIAL_ADMIN_EMAIL`: first real production admin email for `npm run seed:production-admin`.
- `INITIAL_ADMIN_PASSWORD`: first real production admin password; must be strong and is never printed.
- `INITIAL_ADMIN_NAME`: first real production admin display name.
- `INITIAL_ORG_NAME`: first real production organization name.
- `INITIAL_ADMIN_PHONE`: optional phone for the first real production admin.
- `SEED_USER_ID`: owner user id used by the bridge script; defaults to `u1`.
- `SEED_ORGANIZATION_ID`: default organization id used by the bridge script.
- `APP_PUBLIC_URL`: public base URL used for generated links.
- `PORT`: HTTP port used by `server.js`; defaults to `3000`.
- `DOCUMENT_STORAGE_DIR`: local upload storage directory.
- `DOCUMENT_MAX_BYTES`: max upload size in bytes.
- `RATE_LIMIT_STORE`: `memory` or `postgres`; defaults to `postgres` in production and `memory` in development.
- `TRUST_PROXY`: whether Express should trust the platform reverse proxy; defaults to `true` in production.
- `DISABLE_HMR`: set to `true` to disable Vite HMR.
- `NODE_ENV`: set to `production` when running production static serving.
- `TEST_DATABASE_URL`: dedicated PostgreSQL database used by Playwright setup; the database name must include `test`.
- `TEST_PORT`: isolated HTTP port for Playwright; defaults to `3010`.
- `TEST_SEED_USER_PASSWORD`: password assigned to the seeded owner in the Playwright test database.
- `TEST_DOCUMENT_STORAGE_DIR`: isolated local upload storage for Playwright tests.
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`: optional path to Chrome/Edge when Playwright browser downloads are unavailable.
- `STAGING_PUBLIC_URL`: deployed staging base URL used by `npm run smoke:staging`.
- `STAGING_OWNER_EMAIL` / `STAGING_OWNER_PASSWORD`: optional owner credentials for authenticated staging smoke checks.
- `STAGING_SMOKE_SHIPMENT_ID`: shipment id used by staging public tracking checks.
- `STAGING_SKIP_AUTH_SMOKE`: skip authenticated staging smoke checks when credentials are not available.
- `STAGING_ALLOW_INSECURE_URL`: local-only escape hatch for validating `npm run smoke:staging` against an HTTP URL.

Do not commit real secrets.

## Security Notes

Document uploads are intentionally strict. The server accepts only matching extension/MIME pairs for PDF, common image formats, Word/Excel files, CSV, TXT, and RTF. Empty files, executable/script extensions, unknown extensions, and MIME mismatches are rejected. Document `shipmentId` and `customerId` parents must belong to the authenticated user's organization before any file bytes are stored.

Abuse protection rate-limits login failures, public tracking/search/chat, and document upload/replace requests. Local development uses an in-memory limiter by default. Production should use `RATE_LIMIT_STORE=postgres`, which stores counters in the `rate_limit_buckets` table so limits are shared across app instances.

Public document downloads are limited to customer-visible documents attached to shipments with customer tracking access enabled. Token-based public tracking remains the safer customer-facing document path.

## Useful Commands

```powershell
npm run dev
npm run lint
npm run build
npm run preview
npm run db:schema
npm run db:seed
npm run db:bridge
npm run seed:production-admin -- --dry-run
npm run seed:production-admin
npm run seed:production-admin:test
npm run documents:storage:smoke
npm run test:e2e:setup
npm run test:e2e
npm run smoke:production-config
npm run smoke:staging
```

Command notes:

- `npm run dev` runs `tsx server.js` and serves both API and frontend through Express/Vite on port `3000`.
- `npm run lint` runs `tsc --noEmit`.
- `npm run build` runs the production Vite build.
- `npm run preview` previews the Vite build only and may not represent the full Express API behavior.
- `npm run db:schema` applies `db/schema.sql` to the current `DATABASE_URL` without seeding records.
- `npm run seed:production-admin` bootstraps the first real production admin/org from `INITIAL_ADMIN_*` env vars without importing demo data.
- `npm run seed:production-admin -- --dry-run` exercises the same bootstrap transaction and rolls it back.
- `npm run seed:production-admin:test` verifies the bootstrap script against a disposable PostgreSQL test database.
- `npm run documents:storage:smoke` writes, verifies, reads, and deletes a tiny object-storage probe using configured object-storage env vars.
- `npm run test:e2e:setup` drops/recreates only `TEST_DATABASE_URL`, then runs `db:seed` and `db:bridge` against it.
- `npm run test:e2e` runs the Playwright security regression suite against `TEST_PORT`.
- `npm run test:e2e:headed` runs the same suite with a visible browser.
- `npm run smoke:production-config` confirms production startup checks fail loudly when required Liara storage/rate-limit settings are unsafe.
- `npm run smoke:staging` validates a deployed Liara staging app when `STAGING_PUBLIC_URL` is set.
- `npm run deploy` runs `liara deploy` and requires Liara CLI authentication plus the correct fresh app selected or passed with `--app`.
- `npm run deploy:staging` deploys with `liara.staging.json`, app `logisticplus-staging`, and disk mount `logisticplus-documents-staging:storage/documents`.

Production start:

`npm run start` runs `node server.js`, which imports [server/src/server.js](/C:/Users/Ahmadreza/Documents/logisticplus/server/src/server.js). Set `NODE_ENV=production` through your host environment before using it for production static serving. In PowerShell, use:

```powershell
$env:NODE_ENV = "production"
npm run start
```

- `npm run clean` currently uses `rm -rf dist`, which may not work in every Windows PowerShell environment.

## Routes

Public routes include:

- `/`
- `/login`
- `/track/:token`

Protected app routes require login and include dashboard, shipments, shipment detail/edit, customers, tasks, documents, compliance, cheques, quotations, archive, changelog, settings, profile, management, admin, and the disabled chat screen.

Login supports password auth for users created by platform/admin flows. Chat is intentionally visible but disabled for now. Public tracking must remain customer-safe and must not expose internal notes, audit logs, staff tasks, financial details, private files, chat, or compliance internals.

## Deployment Notes

[liara.json](/C:/Users/Ahmadreza/Documents/logisticplus/liara.json) is a generic Liara NodeJS config on port `3000`; it intentionally does not commit an app name, disk mount, database URL, object-storage bucket, or secret. Pass the fresh app name at deploy time with `liara deploy --app <LIARA_APP_NAME>` or select the app in the Liara CLI before running `liara deploy`. [liara.staging.json](/C:/Users/Ahmadreza/Documents/logisticplus/liara.staging.json) still targets the separate staging app named `logisticplus-staging`.

For production, configure at minimum:

- `DATABASE_URL`
- `NODE_ENV=production`
- `APP_PUBLIC_URL`
- `SESSION_SECRET`
- optional `COOKIE_DOMAIN`
- `DOCUMENT_STORAGE_DIR`
- `DOCUMENT_MAX_BYTES`
- `DOCUMENT_STORAGE_MODE=object`
- `OBJECT_STORAGE_ENABLED=true`
- `OBJECT_STORAGE_PROVIDER=s3`
- `S3_ENDPOINT`
- `S3_REGION=default`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`
- `S3_DOCUMENT_BUCKET`
- `S3_FORCE_PATH_STYLE=true`
- `DOCUMENT_STORAGE_DUAL_WRITE_REQUIRED=true`
- `RATE_LIMIT_STORE=postgres`
- `TRUST_PROXY=true`
- `INITIAL_ADMIN_EMAIL`
- `INITIAL_ADMIN_PASSWORD`
- `INITIAL_ADMIN_NAME`
- `INITIAL_ORG_NAME`
- optional `INITIAL_ADMIN_PHONE`

Fresh Liara production should use private Liara Object Storage for new documents. Document downloads must continue through app authorization routes; do not make the bucket public.

### Liara Launch Checklist

1. Create or select the Node.js app in Liara and keep `liara.json` as a NodeJS app on port `3000`.
2. Create a Liara PostgreSQL database and set `DATABASE_URL` in app environment variables.
3. Create a private Liara Object Storage bucket for documents.
4. Set production env vars: `NODE_ENV=production`, `APP_PUBLIC_URL=https://<your-domain>`, `SESSION_SECRET`, `DOCUMENT_STORAGE_MODE=object`, `OBJECT_STORAGE_ENABLED=true`, Liara S3-compatible object-storage vars, `RATE_LIMIT_STORE=postgres`, `TRUST_PROXY=true`, and all required `INITIAL_ADMIN_*` vars.
5. Run local preflight from [docs/deployment/liara-fresh-deploy-runbook.md](/C:/Users/Ahmadreza/Documents/logisticplus/docs/deployment/liara-fresh-deploy-runbook.md).
6. Deploy with `liara deploy --app <LIARA_APP_NAME>` or the Liara Console flow.
7. Run migrations in Liara shell: `liara shell --app <LIARA_APP_NAME> --command "npm run db:migrate"`.
8. Dry-run the first admin bootstrap: `liara shell --app <LIARA_APP_NAME> --command "npm run seed:production-admin -- --dry-run"`.
9. Run the first admin bootstrap: `liara shell --app <LIARA_APP_NAME> --command "npm run seed:production-admin"`.
10. Smoke object storage: `liara shell --app <LIARA_APP_NAME> --command "npm run documents:storage:smoke"`.
11. Login as the initial admin, verify `/admin`, verify `/dashboard`, then create real users and operational organization data manually.
12. After deploy, smoke check `/api/health`, upload/download a private document, expose one customer-visible document through a tracking token, and verify password login for the initial admin.

Production data cleanup utility, not part of the fresh deployment path:

```powershell
liara shell --app <LIARA_APP_NAME> --command "node scripts/clean-liara-production-data.mjs --counts"
liara shell --app <LIARA_APP_NAME> --command "node scripts/clean-liara-production-data.mjs --apply"
```

Run a Liara database backup before `--apply`. The utility preserves the owner user, default organization, membership, subscription, plans, roles, and permissions, then clears operational/test records and sessions.

### Liara Staging Validation

Use the staging runbook in [docs/liara-staging-validation.md](/C:/Users/Ahmadreza/Documents/logisticplus/docs/liara-staging-validation.md) before production cutover. The staging path uses a separate Liara app, PostgreSQL database, and disk, then validates health, password login, document storage, public tracking, and removed self-serve APIs.

Useful Liara references:

- [Persistent disks](https://docs.liara.ir/paas/disks/about/)
- [Disk mount paths](https://docs.liara.ir/paas/disks/route/)
- [Environment variables](https://docs.liara.ir/paas/details/envs/)
- [Node.js PostgreSQL connection](https://docs.liara.ir/paas/nodejs/how-tos/connect-to-db/postgresql/)
- [Node.js start script](https://docs.liara.ir/paas/nodejs/quick-start/)

## Current Testing Status

The automated regression suite uses Playwright. It targets a dedicated test database and should not run against the normal development database.

PowerShell setup:

```powershell
npm run test:e2e:setup
npm run test:e2e
```

The setup script refuses to reset a database unless the `TEST_DATABASE_URL` database name contains `test`.

If Playwright cannot download its bundled browser in your region, install Chrome or Edge locally. The config auto-detects common Windows Chrome/Edge paths, or you can set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.

As of 2026-06-19, the public-release cleanup removed stale Playwright assertions for retired public funnel and checkout surfaces. Do not treat older public self-serve coverage notes as current after this cleanup.

The current verification commands are:

```powershell
npm.cmd run lint
npm.cmd run build
npm.cmd run test:e2e:setup
npm.cmd run test:e2e
```

Before changing high-risk areas such as auth, tenant isolation, public tracking, billing, documents, or permissions, add focused API/browser regression tests.
