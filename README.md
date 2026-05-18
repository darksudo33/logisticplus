# Logistic Plus

Logistic Plus is a Persian RTL logistics SaaS for shipment operations, customer tracking, documents, workflow tasks, billing, and company administration.

The current repository uses:

- Vite + React + TypeScript for the frontend.
- React Router for app/public routes.
- Express in [server.js](/C:/Users/Ahmadreza/Documents/logisticplus/server.js) for the API and production static serving.
- PostgreSQL through the raw `pg` data layer in [src/server/db.js](/C:/Users/Ahmadreza/Documents/logisticplus/src/server/db.js).
- SQL schema setup through [db/schema.sql](/C:/Users/Ahmadreza/Documents/logisticplus/db/schema.sql).
- SMS.ir/dry-run SMS delivery through [src/server/sms-provider.js](/C:/Users/Ahmadreza/Documents/logisticplus/src/server/sms-provider.js) and queued alert processing through [src/server/sms-worker.js](/C:/Users/Ahmadreza/Documents/logisticplus/src/server/sms-worker.js).

Do not assume this project is Next.js or Prisma-based unless the stack is deliberately changed later.

## Current App State

Last checked: 2026-05-17.

- Local app is running on `http://localhost:3000`; `/api/health` and `/api/db/health` return ok.
- Browser smoke checked `/`, `/contact`, `/login`, `/dashboard`, and `/admin`; the public pages render RTL content with no console errors or horizontal overflow.
- The protected app currently opens for the seeded owner session. Admin includes SaaS organizations, contact requests, signups, subscription limits, billing/payment views, operational errors, and SMS analytics/templates/deliveries/manual worker controls.
- The regression suite is green: `npm.cmd run test:e2e:setup` reset `logisticplus_test`, then `npm.cmd run test:e2e` passed 43/43 tests.
- `npm.cmd run lint`, `node --check server.js`, `node --check src/server/db.js`, and `npm.cmd run build` pass. The build still emits Vite's existing large chunk warning.
- In the Codex desktop sandbox, Vite/esbuild may fail to read parent directories while loading `vite.config.ts`; rerunning the same build outside the sandbox passed.

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

3. Edit `.env` for your PostgreSQL connection, seed password, document storage, public URL, and payment settings.

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

## Environment Variables

See [.env.example](/C:/Users/Ahmadreza/Documents/logisticplus/.env.example) for the authoritative local template.

Important variables:

- `DATABASE_URL`: PostgreSQL connection used by the API, seed script, bridge script, and data layer.
- `POSTGRES_ADMIN_URL`: maintenance database connection used by the seed script to create the target database.
- `SEED_USER_PASSWORD`: password assigned to the seeded owner user.
- `SEED_USER_ID`: owner user id used by the bridge script; defaults to `u1`.
- `SEED_ORGANIZATION_ID`: default organization id used by the bridge script.
- `APP_PUBLIC_URL`: public base URL used for generated links and Zarinpal callbacks.
- `PORT`: HTTP port used by `server.js`; defaults to `3000`.
- `DOCUMENT_STORAGE_DIR`: local upload storage directory.
- `DOCUMENT_MAX_BYTES`: max upload size in bytes.
- `ZARINPAL_SANDBOX`: use sandbox-style local callback behavior unless set to `false`.
- `ZARINPAL_MERCHANT_ID`: required for real Zarinpal payment requests.
- `ZARINPAL_TIMEOUT_MS`: timeout for Zarinpal request/verify calls; defaults to `10000`.
- `SMS_ENABLED`: enables SMS sending path; dry-run mode can still be used without provider credentials.
- `SMS_DRY_RUN`: defaults to `true`; keep it enabled until SMS.ir account settings are verified.
- `SMSIR_API_KEY` / `SMSIR_LINE_NUMBER`: SMS.ir credentials required only when `SMS_DRY_RUN=false`.
- `SMSIR_USE_DEFAULT_LINE`: allow live sends without `SMSIR_LINE_NUMBER` when the SMS.ir account supports a default line.
- `SMS_TIMEOUT_MS`: timeout for SMS.ir delivery calls; defaults to `10000`.
- `SMS_WORKER_ENABLED`: starts the background alert worker when set to `true`; admin can run the worker manually without enabling this.
- `SMS_WORKER_INTERVAL_MS`: background SMS worker interval; values below one minute fall back to five minutes.
- `SMS_SMOKE_OWNER_EMAIL`: optional owner email for the guarded live production SMS smoke script.
- `SMS_SMOKE_TARGET_PHONE`: optional target phone for the guarded live production SMS smoke script.
- `SMS_SMOKE_ALLOW_CURRENT_KEY`: set only for an intentional live smoke before the known exposed SMS.ir key has been rotated; otherwise the script refuses live sending.
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
- `STAGING_SKIP_AUTH_SMOKE` / `STAGING_SKIP_ZARINPAL_HANDOFF`: skip high-impact staging smoke sections when credentials or merchant setup are not available.
- `STAGING_ALLOW_INSECURE_URL`: local-only escape hatch for validating `npm run smoke:staging` against an HTTP URL.

Do not commit real secrets.

## Security Notes

Document uploads are intentionally strict. The server accepts only matching extension/MIME pairs for PDF, common image formats, Word/Excel files, CSV, TXT, and RTF. Empty files, executable/script extensions, unknown extensions, and MIME mismatches are rejected. Document `shipmentId` and `customerId` parents must belong to the authenticated user's organization before any file bytes are stored.

Abuse protection rate-limits login failures, public signup, payment start, and document upload/replace requests. Local development uses an in-memory limiter by default. Production should use `RATE_LIMIT_STORE=postgres`, which stores counters in the `rate_limit_buckets` table so limits are shared across app instances.

Public document downloads are limited to customer-visible documents attached to shipments with customer tracking access enabled. Token-based public tracking remains the safer customer-facing document path.

## SMS Alerts

SMS delivery is dry-run by default and uses SMS.ir only when `SMS_ENABLED=true` and `SMS_DRY_RUN=false`. The same provider path backs phone-code login, queued operational alerts, and admin-triggered worker runs.

Queued alert coverage currently includes high-priority task assignments/reassignments, compliance meeting reminders, demurrage windows, and customer-visible shipment status updates. SMS alerts are gated by the organization's active subscription features; lower plans need the `smsNotifications` limit override or an upgraded plan before operational SMS rows are queued.

Platform admin can review SMS analytics, delivery logs, editable templates, and the manual worker from `/admin`. Keep `SMS_WORKER_ENABLED=false` for initial production rollout and use the manual worker or the guarded smoke script until provider credentials, line/default-line behavior, and template text are verified.

## Useful Commands

```powershell
npm run dev
npm run lint
npm run build
npm run preview
npm run db:schema
npm run db:seed
npm run db:bridge
npm run test:e2e:setup
npm run test:e2e
npm run smoke:production-config
npm run smoke:staging
npm run sms:prod-smoke -- precheck
```

Command notes:

- `npm run dev` runs `tsx server.js` and serves both API and frontend through Express/Vite on port `3000`.
- `npm run lint` runs `tsc --noEmit`.
- `npm run build` runs the production Vite build.
- `npm run preview` previews the Vite build only and may not represent the full Express API behavior.
- `npm run db:schema` applies `db/schema.sql` to the current `DATABASE_URL` without seeding records.
- `npm run test:e2e:setup` drops/recreates only `TEST_DATABASE_URL`, then runs `db:seed` and `db:bridge` against it.
- `npm run test:e2e` runs the Playwright security regression suite against `TEST_PORT`.
- `npm run test:e2e:headed` runs the same suite with a visible browser.
- `npm run smoke:production-config` confirms production startup checks fail loudly when Liara disk/Zarinpal config is missing.
- `npm run smoke:staging` validates a deployed Liara staging app when `STAGING_PUBLIC_URL` is set.
- `npm run sms:prod-smoke -- precheck|prepare|run-worker|report` is a guarded Liara production SMS smoke utility; `run-worker` refuses live sending until the SMS.ir key rotation guard is satisfied.
- `npm run deploy` runs `liara deploy` for the production `logisticplus` app and requires Liara CLI authentication/configuration.
- `npm run deploy:staging` deploys with `liara.staging.json`, app `logisticplus-staging`, and disk mount `logisticplus-documents-staging:storage/documents`.

Production start:

`npm run start` runs `node server.js`. Set `NODE_ENV=production` through your host environment before using it for production static serving. In PowerShell, use:

```powershell
$env:NODE_ENV = "production"
npm run start
```

- `npm run clean` currently uses `rm -rf dist`, which may not work in every Windows PowerShell environment.

## Routes

Public routes include:

- `/`
- `/contact`
- `/pricing`
- `/signup`
- `/signup/pending`
- `/billing/callback/zarinpal`
- `/login`
- `/track/search`
- `/track/:token`

Protected app routes require login and include dashboard, shipments, shipment detail/edit, customers, tasks, documents, compliance, cheques, quotations, archive, changelog, settings, profile, management, admin, and the disabled chat screen.

Login supports password auth and phone SMS codes for users with a valid phone number. Chat is intentionally visible but disabled for now. Public tracking must remain customer-safe and must not expose internal notes, audit logs, staff tasks, financial details, private files, chat, or compliance internals.

## Deployment Notes

[liara.json](/C:/Users/Ahmadreza/Documents/logisticplus/liara.json) targets the production Liara app `logisticplus` on port `3000`, mounts the `logisticplus-documents` disk at `storage/documents`, and runs `npm run build` during build. [liara.staging.json](/C:/Users/Ahmadreza/Documents/logisticplus/liara.staging.json) targets a separate staging app named `logisticplus-staging` with the staging document disk mounted at `storage/documents`.

For production, configure at minimum:

- `DATABASE_URL`
- `NODE_ENV=production`
- `APP_PUBLIC_URL`
- `DOCUMENT_STORAGE_DIR`
- `DOCUMENT_MAX_BYTES`
- `RATE_LIMIT_STORE=postgres`
- `TRUST_PROXY=true`
- `ZARINPAL_SANDBOX=false`
- `ZARINPAL_MERCHANT_ID`
- `ZARINPAL_TIMEOUT_MS`
- `SMS_DRY_RUN=true`
- `SMS_WORKER_ENABLED=false`

The current document storage adapter is local filesystem storage. On Liara, use a persistent disk mounted at `storage/documents`; the default platform filesystem is not durable for runtime uploads. Startup checks verify that `DOCUMENT_STORAGE_DIR` exists, is writable, and can read/delete a probe file before the server accepts traffic in production.

### Liara Launch Checklist

1. Create or select the Node.js app in Liara and keep `liara.json` pointed at app `logisticplus`, port `3000`, and disk `logisticplus-documents:storage/documents`.
2. Create a Liara PostgreSQL database and set `DATABASE_URL` in app environment variables.
3. Create a Liara disk and mount it to `storage/documents` for uploaded documents.
4. Set production env vars: `NODE_ENV=production`, `APP_PUBLIC_URL=https://<your-domain>`, `DOCUMENT_STORAGE_DIR=storage/documents`, `RATE_LIMIT_STORE=postgres`, `TRUST_PROXY=true`, `ZARINPAL_SANDBOX=false`, the live `ZARINPAL_MERCHANT_ID`, and `SMS_DRY_RUN=true` for the first SMS rollout.
5. Run `npm run build`, then deploy with `npm run deploy` or the Liara Console flow.
6. After deploy, smoke check `/api/health`, login, upload/download a private document, expose one customer-visible document through a tracking token, and run one controlled live Zarinpal payment.

For live SMS rollout, rotate the SMS.ir API key first, then set `SMS_ENABLED=true`, `SMS_DRY_RUN=false`, and either `SMSIR_LINE_NUMBER` or `SMSIR_USE_DEFAULT_LINE=true`. Use `npm run sms:prod-smoke -- precheck`, `prepare`, `run-worker`, and `report` in order for a controlled production send.

Production data cleanup utility:

```powershell
liara shell --app logisticplus --command "node scripts/clean-liara-production-data.mjs --counts"
liara shell --app logisticplus --command "node scripts/clean-liara-production-data.mjs --apply"
```

Run a Liara database backup before `--apply`. The utility preserves the owner user, default organization, membership, subscription, plans, roles, and permissions, then clears operational/test records and sessions.

### Liara Staging Validation

Use the staging runbook in [docs/liara-staging-validation.md](/C:/Users/Ahmadreza/Documents/logisticplus/docs/liara-staging-validation.md) before production cutover. The staging path uses a separate Liara app, PostgreSQL database, and disk, then validates a live Zarinpal gateway handoff without completing a card charge.

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

As of 2026-05-17, `npm.cmd run test:e2e` passes 43/43 tests after setup. Coverage includes customer CRUD/archive, public funnel/contact requests, auth/session/RBAC/tenant isolation, public tracking safety, document hardening, billing/Zarinpal sandbox behavior, PostgreSQL-backed throttles, SMS login/alerts, and clean-database empty states.

The current verification commands are:

```powershell
npm.cmd run lint
npm.cmd run build
npm.cmd run test:e2e:setup
npm.cmd run test:e2e
```

Before changing high-risk areas such as auth, tenant isolation, public tracking, billing, documents, or permissions, add focused API/browser regression tests.
