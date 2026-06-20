# Project Handoff

Current repository:

`C:\Users\Ahmadreza\Documents\logisticplus`

External planning pack:

`C:\Users\Ahmadreza\Documents\New project\logistic-plus-codex-plan`

This handoff was prepared from the live repository, the external planning pack, and the current conversation context.

## Latest Changes / Working Notes

### 2026-05-18 - Skeleton loaders everywhere and Liara deploy

What changed:

- Added a shared skeleton primitive with shimmer styling in `components/ui/skeleton.tsx` and `src/index.css`.
- Added reusable app skeleton states in `src/components/SkeletonStates.tsx` for public route fallback, protected app shell fallback, protected content hydration, admin loading, and public tracking loading.
- Replaced the blank `Suspense fallback={null}` route behavior with route-aware skeleton fallbacks in `src/App.tsx`.
- Replaced protected app hydration blank content with a dashboard-shaped skeleton while `/api/users/:id/bootstrap` loads.
- Replaced dry spinner/text loaders in admin, pricing/signup plan sync, public tracking, login, contact, customers, documents, shipment detail customer-access actions, profile saves, delete confirmations, and user-management action buttons.
- Kept behavior/API/schema unchanged; this was a UI loading-state pass only.

Files touched:

- `components/ui/skeleton.tsx`
- `src/components/SkeletonStates.tsx`
- `src/index.css`
- `src/App.tsx`
- `src/app/AdminPanel.tsx`
- `src/app/LoginPage.tsx`
- `src/app/SaasSignup.tsx`
- `src/app/PublicTrack.tsx`
- `src/app/ContactPage.tsx`
- `src/app/Customers.tsx`
- `src/app/Documents.tsx`
- `src/app/ShipmentDetail.tsx`
- `src/app/Profile.tsx`
- `src/app/UserManagement.tsx`
- `src/components/DeleteConfirmDialog.tsx`
- `tests/e2e/skeleton-loaders.spec.ts`
- `PROJECT_HANDOFF.md`

Verification run:

- `npm.cmd run lint` passed.
- `npm.cmd run build` passed with the existing Vite large chunk warning only.
- `npm.cmd run test:e2e:setup` passed and reset `logisticplus_test`.
- First full `npm.cmd run test:e2e` run found one issue in the new skeleton test assertion: protected lazy fallback and inner hydration skeleton can briefly coexist. The app behavior was correct; the test was updated to wait for all protected skeletons to disappear.
- Targeted `npx.cmd playwright test tests/e2e/skeleton-loaders.spec.ts` passed: 3/3.
- Reran `npm.cmd run test:e2e:setup`, then `npm.cmd run test:e2e`: 48/48 passed. The known non-fatal Vite WebSocket port warning still appears.
- Local browser smoke on `http://localhost:3000` passed on desktop `1280x720` and mobile `390x844` for `/`, `/login`, `/dashboard`, `/documents`, `/shipments`, `/quotage`, `/admin`, and `/track/search`: visible page content, no horizontal overflow, and no console errors.

Liara deploy and production smoke:

- Deployed with the non-hanging command requested by the user: `liara deploy --detach --no-app-logs --message "skeleton loaders everywhere 2026-05-18"`.
- Liara CLI returned `Deployment created successfully` and `Upload finished`, then exited cleanly.
- After updating this handoff entry, ran a final detached push with `liara deploy --detach --no-app-logs --message "skeleton loaders everywhere handoff 2026-05-18"`; it also returned `Deployment created successfully` and `Upload finished`, then exited cleanly.
- Production health checks passed:
  - `/api/health` returned 200 ok at `2026-05-18T03:27:11.314Z`.
  - `/api/db/health` returned 200 ok at `2026-05-18T03:27:11.392Z`.
- Final post-handoff-deploy health checks passed:
  - `/api/health` returned 200 ok at `2026-05-18T03:28:29.572Z`.
  - `/api/db/health` returned 200 ok at `2026-05-18T03:28:29.667Z`.
- Live browser smoke passed for `https://logisticplus.liara.run/`, `/login`, and `/admin`: visible page content, no horizontal overflow, and no console errors. The unauthenticated `/admin` smoke redirected to `/login`, as expected.

Remaining risks / notes:

- No production data mutations were created for this skeleton pass.
- Button-level skeletons now replace existing submit/upload/action spinners; actions without a tracked pending state were not given new async state.
- The Vite WebSocket port warning is still non-fatal and limited to local/dev test output.

### 2026-05-18 - Document/download/print/export hardening and Liara smoke

What changed:

- Hardened stored document delivery so downloads now send `Content-Length`, `X-Content-Type-Options: nosniff`, and both ASCII fallback plus UTF-8 `Content-Disposition` filenames.
- Expanded CSV upload tolerance for common browser MIME variants while keeping executable/mismatched/empty file protections in place.
- Added document storage cleanup for permanent archive deletion: document version storage keys are collected before deleting the archived document row, and matching disk files are removed after the DB delete.
- Synced document archive restore/delete back to `user_records`, so refreshed app views do not keep stale restored or permanently deleted document records.
- Replaced document download `window.open(...)` buttons in `/documents` and shipment detail with real accessible anchor buttons, and removed the duplicate active-document archive/trash action from `/documents`.
- Updated document upload helper text to match the backend allowlist and 25 MB limit.
- Tightened quotation print/export behavior so only the selected quote is visible to print, the page title is restored after print, and print buttons have accessible labels.

Files touched:

- `src/server/document-storage.js`
- `src/server/db.js`
- `server.js`
- `src/app/Documents.tsx`
- `src/app/ShipmentDetail.tsx`
- `src/app/QuotageManagement.tsx`
- `tests/e2e/document-download-print.spec.ts`
- `PROJECT_HANDOFF.md`

Verification run:

- `npm.cmd run lint` passed.
- `npm.cmd run build` passed with the existing Vite large chunk warning only.
- `npm.cmd run test:e2e:setup` passed and reset `logisticplus_test`.
- First `npm.cmd run test:e2e` run proved the new tests but exposed a cross-test leak: the new public-document test left seeded shipment `s1` customer access enabled, making the older security test's direct-public-document expectation return 200.
- Fixed the test isolation by disabling `s1` customer access before the new lifecycle test ends.
- Reran `npm.cmd run test:e2e:setup`, then `npm.cmd run test:e2e`: 45/45 passed. The known non-fatal Vite WebSocket port warning still appears.
- Reran `npm.cmd run lint` after the test-isolation patch; it passed.

Liara deploy and production smoke:

- Deployed with the non-hanging command requested by the user: `liara deploy --detach --no-app-logs --message "document download print export sweep 2026-05-18"`.
- Liara CLI returned `Deployment created successfully` and `Upload finished`, then exited cleanly.
- After updating this handoff entry, ran a final detached push with `liara deploy --detach --no-app-logs --message "document download print export sweep handoff 2026-05-18"`; it also returned `Deployment created successfully` and `Upload finished`, then exited cleanly.
- Post-deploy health checks passed:
  - `/api/health` returned ok at `2026-05-18T03:01:50Z`.
  - `/api/db/health` returned ok at `2026-05-18T03:01:50Z`.
- Reversible production document smoke used `BUG-DOC-SWEEP-2026-05-18-*` records.
- Live smoke verified:
  - Customer-visible text document upload to Liara disk.
  - Authenticated download body matched the uploaded marker, `content-length` was `59`, `nosniff` was present, and UTF-8 filename disposition was present.
  - Public tracking payload included the customer-visible document.
  - Public tracking document download body matched the uploaded marker, `content-length` was `59`, and `nosniff` was present.
  - Archived document returned 404 for protected download.
  - Restored document downloaded successfully again.
- Permanent archive delete removed the document and subsequent protected download returned 404.
- Final production health checks passed at `2026-05-18T03:06:03Z`: `/api/health` ok and `/api/db/health` ok.
- Final post-handoff-deploy health checks passed at `2026-05-18T03:07:21Z`: `/api/health` ok and `/api/db/health` ok.

Production cleanup log:

- Customer `b870dcdb-5b2e-4240-96cc-f75974bcc726`: archived.
- Shipment `0705a988-d498-4f94-b6e2-4d67269e71ca` / `BUG-DOC-SWEEP-2026-05-18-SHIP-20260518030343`: customer access disabled, then exact shipment row deleted.
- Shipment status event `963062ac-2c4e-4653-a773-043da4089816`: deleted with shipment cleanup.
- Document `701396ce-8e10-4323-8caf-0d5e36cc7592`: archived, restored, archived again, then permanently deleted.
- Temporary owner smoke session was logged out; follow-up `/api/auth/me` returned 401.
- Exact-ID Liara cleanup audit returned `documents: 0`, `shipments: 0`, `archived_customers: 1`.

Remaining risks / notes:

- No new CSV/XLSX export feature was added; this pass only fixed existing document download and quotation print/PDF behavior.
- Real Zarinpal payment completion and SMS sends were out of scope.
- Liara shell still has intermittent quirks: one prefix cleanup audit attempt returned `Sorry, connection failed` plus the known raw-mode warning, but the exact-ID retry succeeded.

### 2026-05-17 - Full production bug sweep and cleanup

What was checked:

- Re-ran the automated baseline before the live sweep: `npm.cmd run lint`, `npm.cmd run build`, `npm.cmd run test:e2e:setup`, and `npm.cmd run test:e2e` all passed. The Playwright suite passed 43/43 with the known non-fatal Vite HMR WebSocket warning.
- Live health checks passed after the sweep: `https://logisticplus.liara.run/api/health` returned `{"status":"ok"}` and `/api/db/health` returned `{"status":"ok"}` with a database timestamp.
- Final Liara push used `liara deploy --detach --no-app-logs --message "production bug sweep handoff 2026-05-17"` after `npm.cmd run deploy` timed out in the known CLI hang path. Detached deploy returned `Deployment created successfully` and `Upload finished`.
- Post-deploy health checks passed at `2026-05-17T17:56:18Z`: `/api/health` returned ok and `/api/db/health` returned ok.
- Public route smoke passed on desktop and mobile for `/`, `/pricing`, `/signup`, `/signup/pending`, `/contact`, `/login`, and `/track/search`: visible page heading, no console errors, and no horizontal overflow. `/track/search` needed an h1 wait because the route lazy-loads.
- Authenticated protected route smoke passed for `/dashboard`, `/customers`, `/shipments`, `/documents`, `/tasks`, `/compliance`, `/cheques`, `/quotage`, `/archive`, `/profile`, `/settings`, `/management`, and `/admin`: no crashes, no console errors, and no horizontal overflow.
- Admin/SaaS API smoke passed with HTTP 200 for overview, organizations, signup requests, contact requests, payments, invoices, default organization subscription/billing, SMS deliveries, SMS analytics, SMS templates, error logs, and the user billing subscription/invoice/payment endpoints.
- Production SMS report remained healthy after the sweep: total sent 5, failed 1 historical task delivery, skipped 0, and queued 0. The Liara shell command still prints the known raw-mode warning after successful output.

Live workflow smoke:

- Public contact request was submitted and verified in `/admin`, then resolved.
- Created a temporary production customer, task, canonical shipment, public status event, and customer-visible text document with `BUG-SWEEP-2026-05-17-*` identifiers.
- Verified document upload/download through authenticated document APIs, including `X-Content-Type-Options: nosniff`.
- Generated shipment customer tracking access, verified public tracking by token, verified public document download, and verified public search by shipment code plus phone.
- Public tracking payload showed the expected shipment and customer-visible document and did not contain sensitive-looking keys such as password, secret, hash, or internal notes.

Bug findings:

- P0: none found.
- P1: none found.
- P2: none found.
- P3: none found.

Cleanup log:

- Contact request `12e006fd-5a21-4b7d-965a-dfe8ad2d3921`: resolved.
- Customer `c064f87d-0563-4c8d-9c82-2bad16570ed1`: archived and verified as `isArchived: true`.
- Task `5976cf02-d1f1-4980-aa12-eb114e17e0c6`: cancelled and verified as `CANCELLED`.
- Document `f07871f4-21a3-4d8b-a1f0-428239b4e115`: archived and verified as `isArchived: true`.
- Shipment `53351929-b589-4c16-a4c5-b16ee83e7acc` / `BUG-SWEEP-2026-05-17-SHIP-20260517174530`: customer access disabled, then the exact shipment row was deleted.
- Shipment status event `e1974854-a4a3-4fc9-9970-a7a27904eec5`: deleted with the shipment cleanup.
- Temporary owner sessions created for smoke checks were logged out; follow-up `/api/auth/me` returned 401.

Remaining risks / test gaps:

- Password login was not fully verified because the current production password was not available. One safe probe with the old local default password returned 401 as expected; no brute-force attempts were made.
- Real Zarinpal payment completion was intentionally not attempted. Billing/admin surfaces and safe read endpoints rendered/responded, but no card charge or final gateway verification was performed.
- SMS worker remains manually controlled; keep `SMS_WORKER_ENABLED=false` unless the team explicitly wants automatic background sending.
- Live SMS provider cost/throttling and default-line configuration remain operational risks during rollout.
- Liara CLI deploy/shell still has reliability quirks: shell commands can finish successfully and then print `Not running in a terminal, cannot set raw mode`, and deploy may hang even when the Liara panel shows completion.

### 2026-05-17 - Liara deploy, SMS marketing landing copy, and live OTP verification

What changed:

- Strengthened the public landing page SMS story in the first viewport, feature grid, module showcase, workflow copy, and FAQ.
- Added customer-facing SMS status wording alongside operational alerts for tasks, compliance meetings, and demurrage.
- Added a public-funnel regression expectation that `/` includes SMS, demurrage, and status wording.
- Deployed the current local patch to Liara production after the user confirmed the Liara panel showed the release complete. The local `npm.cmd run deploy` command did not return cleanly and was interrupted because the CLI appeared to hang after panel completion.

Files touched:

- `src/app/LandingPage.tsx`
- `tests/e2e/public-funnel.spec.ts`
- `PROJECT_HANDOFF.md`

Verification run:

- `npm.cmd run lint` passed.
- `npm.cmd run build` passed with the existing Vite large chunk warning only.
- `npm.cmd run test:e2e:setup` passed.
- `npm.cmd run test:e2e` first hit an unrelated customer archive assertion while the suite had the usual HMR port warning; after a fresh `test:e2e:setup`, rerun passed: 43/43 Playwright tests.
- Local browser smoke for `/` confirmed the new SMS hero/FAQ copy renders with no console errors.
- Production `https://logisticplus.liara.run/api/health` returned ok.
- Production `https://logisticplus.liara.run/api/db/health` returned ok.
- Liara schema safety pass ran with `liara shell --app logisticplus --command "npm run db:schema"` and applied `db/schema.sql` successfully.
- Production browser smoke confirmed `/` serves the new SMS marketing copy, no horizontal overflow, and no console errors.
- Production `/login` rendered cleanly, unauthenticated `/admin` redirected to `/login`, and authenticated `/admin` loaded cleanly after SMS login.
- Guarded production SMS smoke passed:
  - `precheck` found owner `u1` with phone `09365683694`, active enterprise subscription, and no queued deliveries.
  - `prepare` queued smoke delivery `772228a6-8ee8-4ec1-908f-e43133117fbd`.
  - `run-worker` claimed 1 and sent 1 through SMS.ir with provider message `موفق`, cost `2`, message id `405694405`, and `queued: 0`.
  - Final `report` showed `auth_otp` sent count 2, task sent count 3, total sent 5, failed 1, skipped 0, queued 0.
- Live SMS login was verified on `https://logisticplus.liara.run/login`: requested OTP for `09365683694`, submitted the received code, landed on `/dashboard`, then opened `/admin`; no console errors were observed.

Remaining risks / next steps:

- SMS.ir live sending is now working, so watch provider balance/cost, throughput limits, and line/default-line configuration during rollout.
- Keep `SMS_WORKER_ENABLED=false` until the team explicitly wants automatic background SMS sending; use the admin manual worker or guarded smoke path for controlled sends.
- Liara CLI still prints `Not running in a terminal, cannot set raw mode` after some successful shell commands, and deploy CLI may not return even when the panel shows completion.

### 2026-05-17 - SMS login local repair and guarded Liara smoke

What changed:

- Added `npm run db:schema` through `scripts/apply-schema.ts`; it applies only `db/schema.sql` to the configured `DATABASE_URL` and does not seed demo data.
- Improved phone-login diagnostics in `server.js`: missing `login_sms_challenges` or `sms_deliveries` now returns `SMS_SCHEMA_NOT_READY` with a local repair hint instead of a generic send failure.
- Updated the login UI to show the API error message from SMS-code requests instead of always replacing it with the generic Persian failure text.
- Updated `README.md` with the new schema-only repair command.
- Reset and reseeded the local database, bridged canonical seed data, and restarted the local dev server because the old process was still serving a stale API surface.

Files touched:

- `package.json`
- `scripts/apply-schema.ts`
- `server.js`
- `src/app/LoginPage.tsx`
- `README.md`
- `PROJECT_HANDOFF.md`

Verification run:

- `npm.cmd run db:schema` passed and applied `db/schema.sql` to local `logisticplus` without seeding records.
- `npm.cmd run db:seed` passed and seeded 120 records for `darksudo22@gmail.com`.
- `npm.cmd run db:bridge` passed and bridged canonical users/customers/shipments/tasks/documents/notifications/cheques/appointments/quotes/channels/messages/activity logs.
- Local DB check confirmed `login_sms_challenges` and `sms_deliveries` exist, and owner user `u1` / `darksudo22@gmail.com` has phone `09365683694`.
- Local `POST /api/auth/phone/request-code` for `09365683694` returned HTTP 200 with `ok: true` and a development `debugCode`.
- Browser smoke on `http://localhost:3000/login` opened the SMS tab, requested a local code through the UI, reached the code-entry state, and showed no console errors.
- `node --check server.js` passed.
- `npm.cmd run lint` passed.
- `npm.cmd run build` passed with the existing large chunk warning only.
- `npm.cmd run test:e2e:setup` passed, resetting and seeding `logisticplus_test`.
- `npm.cmd run test:e2e` passed: 43/43 Playwright tests. It still logs the known non-fatal Vite WebSocket port warning when another dev server owns the HMR port.
- Liara `precheck` passed: production owner phone and SMS tables are present.
- Liara `prepare` created one guarded smoke task/delivery for owner phone `09365683694`.
- Liara `run-worker` refused to send live SMS because the exposed SMS.ir API key rotation guard is active. This guard was not bypassed.
- Liara `report` now shows `queued: 0`, so no smoke delivery remains queued. The CLI still prints `Not running in a terminal, cannot set raw mode` after some successful JSON outputs.

Remaining risks / next steps:

- Real Liara OTP login was not completed because live sending is intentionally blocked until the exposed SMS.ir API key is rotated in Liara env.
- Before the next live SMS test, Liara must have `SMS_ENABLED=true`, `SMS_DRY_RUN=false`, `SMSIR_API_KEY`, and either `SMSIR_LINE_NUMBER` or `SMSIR_USE_DEFAULT_LINE=true`.
- After rotating the SMS.ir key, rerun `node scripts/live-sms-production-smoke.mjs precheck`, `prepare`, `run-worker`, and `report`, then manually verify `/login` with the received OTP.
- Watch SMS cost and provider throttling during any live smoke; the guarded script is designed for a single controlled send.

### 2026-05-17 - Current app state and documentation refresh

What changed:

- Checked the live local workspace state and refreshed the README to match the current app surface.
- Documented the current stack addition for SMS.ir/dry-run delivery, queued alert processing, phone-code login support, admin SMS analytics/templates/delivery logs/manual worker controls, and the guarded production SMS smoke script.
- Added `/contact` to public routes and updated testing notes from the older security-suite wording to the current full Playwright regression suite.
- Added a README current-state snapshot covering local health, browser smoke results, admin capabilities, verification commands, and the known Codex sandbox build nuance.
- Added missing SMS smoke and staging insecure-local flags to `.env.example`.

Files touched:

- `README.md`
- `.env.example`
- `PROJECT_HANDOFF.md`

Verification run:

- `node --check server.js` passed.
- `node --check src/server/db.js` passed.
- `npm.cmd run lint` passed.
- `npm.cmd run build` first failed inside the Codex sandbox with `Cannot read directory "../..": Access is denied` while resolving `vite.config.ts`; rerunning outside the sandbox passed with the existing large chunk warning only.
- `npm.cmd run test:e2e:setup` passed, resetting and seeding `logisticplus_test`.
- `npm.cmd run test:e2e` passed: 43/43 Playwright tests. It still logs the known non-fatal Vite WebSocket port warning when another dev server owns the HMR port.
- Local `/api/health` and `/api/db/health` both returned ok on `http://localhost:3000`.
- Browser smoke checked `/`, `/contact`, `/login`, `/dashboard`, and `/admin`; no console errors or horizontal overflow were detected on the checked surfaces.

Current app notes:

- The workspace is not currently a Git repository, so there is no `git diff` source of truth.
- Local browser session is authenticated as the seeded owner and `/admin` exposes overview, organizations, contact requests, signups, subscription limits, SMS, billing/payment, and errors tabs.
- There are two zero-byte stray files at the repo root named `{` and `{console.error(e)`; they were not touched.

Remaining risks / next bugs:

- Live SMS send still requires rotated SMS.ir credentials before using the guarded `run-worker` smoke path.
- Live document upload/download, customer tracking, and live Zarinpal should be re-smoked after any new production deploy.

### 2026-05-17 - Focused UI/UX contact and admin polish

What changed:

- Added a real public `/contact` page with direct phone contact, a lightweight request form, success/error states, and RTL public-page styling.
- Added public contact request persistence through a new `contact_requests` table and `POST /api/contact-requests`, with validation, rate limiting, and audit logging.
- Added platform admin contact-request management through `GET /api/admin/contact-requests` and `POST /api/admin/contact-requests/:id/resolve`.
- Updated admin overview with pending contact request counts and added a new `تماس‌ها` admin tab.
- Polished the admin tab bar into a compact scrollable segmented control and collapsed the manual company creation form by default.
- Cleaned public CTA language across landing, pricing, signup, and login so “رزرو دمو” is no longer repeated everywhere.
- Fixed public phone number rendering by removing `font-mono` from shared public contact actions and using the app sans font with tabular numerals.
- Updated public-funnel and RBAC tests to include `/contact` and contact request submit/list/resolve coverage.
- Updated production cleanup/test cleanup scripts to include `contact_requests`.

Files touched:

- `server.js`
- `db/schema.sql`
- `src/server/db.js`
- `src/App.tsx`
- `src/app/ContactPage.tsx`
- `src/app/LandingPage.tsx`
- `src/app/SaasSignup.tsx`
- `src/app/LoginPage.tsx`
- `src/app/AdminPanel.tsx`
- `src/components/PublicContactActions.tsx`
- `scripts/clean-liara-production-data.mjs`
- `tests/e2e/public-funnel.spec.ts`
- `tests/e2e/rbac-policy.ts`
- `tests/e2e/zzz-empty-state.spec.ts`
- `PROJECT_HANDOFF.md`

Verification run:

- `node --check server.js` passed.
- `node --check src/server/db.js` passed.
- `npm.cmd run lint` passed.
- `npm.cmd run build` passed. Vite still reports the existing large chunk warning only.
- `npm.cmd run test:e2e:setup` passed, resetting and seeding `logisticplus_test`.
- `npm.cmd run test:e2e` passed: 32/32 Playwright tests. It still logs the known non-fatal Vite WebSocket port warning when another dev server owns the HMR port.

Remaining risks / notes:

- No email or CRM notification was added for contact requests; they are reviewed manually in the platform admin panel. Operational SMS alerts are covered in the latest app-state entry.
- The production database needs the updated idempotent `db/schema.sql` applied before the live contact form can write to `contact_requests`.

### 2026-05-17 - Clean launch readiness and customer CRUD polish

What changed:

- Follow-up after deployment:
  - Reset the production owner password for `darksudo22@gmail.com` at the user's request.
  - Removed the hardcoded admin email from the login form initial state; `/login` now opens with an empty email field.
  - Added public-funnel regression coverage to ensure `/login` does not prefill or render the internal admin email.
  - Added `scripts/reset-owner-password-hash.mjs`, a guarded maintenance utility that accepts a base64-encoded bcrypt hash and updates the owner password without committing plaintext secrets.
- Polished the logged-in customer workflow for a clean production database.
- Added phone, address, and internal notes fields to the customer creation dialog, with LTR handling for email/phone and disabled submit while saving.
- Fixed the shared delete/archive confirmation dialog so it awaits async work, shows a loading state, keeps errors visible, and only closes after success.
- Updated customers, customer detail, dashboard setup counts, and shipment customer selection so archived customers do not behave like active records.
- Added Playwright coverage for creating a customer with contact details, archiving it through the confirmation dialog, removing it from the active list, and seeing it in Archive.
- Removed visible demo/sample leftovers from protected app polish paths: the disabled chat branch no longer appends `(demo)`, and shipment form placeholders no longer use fake record IDs.
- Suppressed only aborted background `Failed to fetch` persistence saves from the legacy Zustand/user_records auto-save path so rapid route changes do not create console-error noise.
- Corrected `liara.json` to target the production app `logisticplus` and mount `logisticplus-documents` at `storage/documents`.
- Added `scripts/clean-liara-production-data.mjs`, a guarded Liara-side cleanup utility with `--counts` and `--apply` modes.
- Created and downloaded a Liara database backup before cleanup, then cleaned the live production DB. The visible production `test` customer, old user_records, logs, sessions, rate-limit rows, and operational records are now gone; owner user `u1`, organization `org-logisticplus-default`, membership, subscription, plans, roles, and permissions were preserved.
- Deployed the patch to Liara production as a healthy release on `https://logisticplus.liara.run`.

Files touched:

- `.gitignore`
- `README.md`
- `liara.json`
- `src/app/Customers.tsx`
- `src/app/CustomerDetail.tsx`
- `src/app/Dashboard.tsx`
- `src/app/Shipments.tsx`
- `src/app/Chat.tsx`
- `src/components/DeleteConfirmDialog.tsx`
- `src/store/useAppStore.ts`
- `src/types/index.ts`
- `scripts/clean-liara-production-data.mjs`
- `scripts/reset-owner-password-hash.mjs`
- `tests/e2e/customer-crud.spec.ts`
- `tests/e2e/public-funnel.spec.ts`
- `PROJECT_HANDOFF.md`

Verification run:

- `npm run lint` passed.
- `npm run build` passed. Vite still reports the existing large chunk warning only.
- `npm run smoke:production-config` passed.
- `npm run test:e2e:setup` passed.
- `npx playwright test tests/e2e/customer-crud.spec.ts --reporter=list` passed.
- `npx playwright test tests/e2e/zzz-empty-state.spec.ts --reporter=list` passed.
- `npx playwright test tests/e2e/public-funnel.spec.ts --reporter=list` passed.
- `npm run test:e2e` passed: 26/26 Playwright tests. It still logs the known non-fatal Vite WebSocket port warning when another dev server owns the HMR port.
- Liara backup created for database `logisticplusbe` and downloaded locally under `backups/` before cleanup. `backups/` is gitignored.
- Liara deploy first failed as unhealthy because the disk mount was omitted; redeploy with `logisticplus-documents:storage/documents` succeeded, and `liara.json` now records the disk mount.
- Live `/api/health` and `/api/db/health` passed after deploy and cleanup.
- Live public routes `/`, `/pricing`, `/signup`, and `/login` render H1s with no console errors and no horizontal overflow.
- Live unauthenticated `/dashboard` redirects to `/login`.
- Production owner login was verified after the password reset.
- Live `/login` has an empty email input and does not render `darksudo22@gmail.com`.
- Live authenticated smoke passed for `/dashboard`, `/customers`, `/shipments`, `/documents`, `/tasks`, and `/admin`: no `test` customer text, no horizontal overflow, and no console errors. Admin overview has no empty state by design; operational pages do.
- Live production cleanup counts after `--apply`: operational tables are empty, with one owner user, one organization, one membership, and one organization subscription preserved.

Remaining risks / next bugs:

- Live document upload/download and customer tracking require an authenticated owner session and were not manually re-smoked after the cleanup.
- The downloaded DB backup contains production data and should stay out of source control; `backups/` is now ignored.

### 2026-05-17 - Liara staging validation tooling

What changed:

- Added `liara.staging.json` for a separate Liara staging app named `logisticplus-staging`, with disk `logisticplus-documents-staging` mounted at `storage/documents`.
- Added `npm run deploy:staging` so CLI deploys can target staging through `--liara-json liara.staging.json` without touching the production `liara.json`.
- Added `scripts/validate-liara-staging.ts` and `npm run smoke:staging` for deployed staging validation.
- The staging smoke checks `/api/health`, `/api/db/health`, SPA shell routes, optional owner login, private document upload/download, customer-visible public tracking, live Zarinpal gateway handoff, safe `Status=NOK` callback, and admin billing/signup state when owner credentials are provided.
- Added `docs/liara-staging-validation.md` with the staging app/database/disk names, required Liara env vars, staging DB setup, deploy command, local preflight, smoke command, and no-charge Zarinpal rule.
- Updated `.env.example` and `README.md` with staging smoke variables and commands.

Files touched:

- `liara.staging.json`
- `scripts/validate-liara-staging.ts`
- `docs/liara-staging-validation.md`
- `package.json`
- `.env.example`
- `README.md`
- `PROJECT_HANDOFF.md`

Verification run:

- `npm.cmd run lint` passed.
- `npm.cmd run build` passed. Vite still reports the existing large chunk warning only.
- `npm.cmd run smoke:production-config` passed.
- `npm.cmd run smoke:staging` passed in safe local mode against `http://localhost:3000` with `STAGING_ALLOW_INSECURE_URL=true`, `STAGING_SKIP_AUTH_SMOKE=true`, and `STAGING_SKIP_ZARINPAL_HANDOFF=true`.
- `npm.cmd run test:e2e:setup` passed, resetting and seeding `logisticplus_test`.
- `npm.cmd run test:e2e` passed: 12/12 Playwright tests. It still logs the known non-fatal Vite WebSocket port warning when another dev server owns the HMR port.
- Full `npm run smoke:staging` against Liara requires a deployed staging app, staging public URL, owner staging password, and live Zarinpal merchant configuration.

Remaining risks / notes:

- Liara resources and real secrets still must be created/configured outside the repo.
- The staging Zarinpal validation intentionally stops before any card charge and validates only the gateway handoff plus `Status=NOK` failure path.

### 2026-05-17 - Liara production hardening pass

What changed:

- Extracted document storage helpers from `server.js` into `src/server/document-storage.js` while preserving the existing local filesystem upload/download behavior.
- Added document storage startup probing. In production, `DOCUMENT_STORAGE_DIR` must already exist, be writable/readable/deletable, and is intended to be a Liara disk mounted at `storage/documents`.
- Added `src/server/rate-limit.js` with `RATE_LIMIT_STORE=memory|postgres`. Development defaults to memory; production defaults to PostgreSQL. The PostgreSQL limiter uses the new `rate_limit_buckets` table and preserves the existing `429 RATE_LIMITED` plus `Retry-After` behavior.
- Added production startup checks in `src/server/startup-checks.js`: production requires `DATABASE_URL`, HTTPS `APP_PUBLIC_URL`, `ZARINPAL_SANDBOX=false`, `ZARINPAL_MERCHANT_ID`, valid rate-limit config, and working document storage.
- Added `TRUST_PROXY` support, defaulting to true in production, and changed generated public tracking links to honor `APP_PUBLIC_URL`.
- Added Zarinpal request timeout support through `ZARINPAL_TIMEOUT_MS` and safer redacted gateway error logging.
- Changed `npm start` to `node server.js`, relying on the host to provide `NODE_ENV=production`.
- Added `npm run smoke:production-config`, which starts the server in config-smoke mode and confirms missing production storage/Zarinpal settings fail loudly.
- Updated `.env.example`, `.gitignore`, `README.md`, and `db/schema.sql` for Liara disk storage, PostgreSQL-backed limits, production env vars, and launch checklist.
- Expanded Playwright coverage from 11 to 12 tests with PostgreSQL limiter checks for login retry headers, payment start throttling, document upload throttling, and public signup throttling.

Files touched:

- `server.js`
- `src/server/document-storage.js`
- `src/server/rate-limit.js`
- `src/server/startup-checks.js`
- `db/schema.sql`
- `scripts/smoke-production-config.ts`
- `tests/e2e/security.spec.ts`
- `playwright.config.ts`
- `package.json`
- `.gitignore`
- `.env.example`
- `README.md`
- `PROJECT_HANDOFF.md`

Verification run:

- `node --check server.js` passed.
- `node --check src/server/document-storage.js` passed.
- `node --check src/server/rate-limit.js` passed.
- `node --check src/server/startup-checks.js` passed.
- `npm.cmd run smoke:production-config` passed.
- `npm.cmd run lint` passed.
- `npm.cmd run build` passed. Vite still reports the existing large chunk warning only.
- `npm.cmd run test:e2e:setup` passed, resetting and seeding `logisticplus_test`.
- `npm.cmd run test:e2e` passed: 12/12 Playwright tests. It still logs the known non-fatal Vite WebSocket port warning when another dev server owns the HMR port.

Remaining risks / notes:

- This pass keeps Liara disk/volume as the production document storage target. S3/object storage remains deferred.
- Live Zarinpal validation still requires real merchant credentials and a controlled production/sandbox merchant-side test; it is not automated in CI.
- The app still does not have a full migration framework; the limiter table is added idempotently through `db/schema.sql` and startup DDL.
- PostgreSQL-backed rate limits are suitable for the chosen Liara/PostgreSQL plan, but Redis remains the stronger option if traffic grows substantially.

### 2026-05-17 - Combined security hardening and billing QA

What changed:

- Hardened document uploads so extension and MIME type must match an allowlist, empty files and script/executable types are rejected, and shipment/customer parent ids are verified against the authenticated organization before file bytes are stored.
- Hardened document downloads with storage-root path checks and `X-Content-Type-Options: nosniff`; direct public document access now requires a customer-visible document attached to a shipment with customer tracking access enabled.
- Added in-memory, process-local rate limits for login failures, public signup, payment start, and document upload/replace requests. Rate-limited API responses return `429 RATE_LIMITED`.
- Tightened signup payment start so only valid unpaid signup payments can start the sandbox/Zarinpal flow.
- Expanded Playwright coverage from 7 to 11 tests, adding upload/download safety, logout invalidation, bad-login throttling, sandbox payment success/failure state transitions, admin billing denial, and company billing scoping.
- Updated README with upload allowlist behavior, process-local rate-limit caveats, and public document access notes.

Files touched:

- `server.js`
- `src/server/db.js`
- `tests/e2e/security.spec.ts`
- `README.md`
- `PROJECT_HANDOFF.md`

Verification run:

- `npm.cmd run test:e2e:setup` passed, resetting and seeding `logisticplus_test`.
- `npm.cmd run test:e2e` passed: 11/11 Playwright tests. It still logs the known non-fatal Vite WebSocket port warning when another dev server owns the HMR port.
- `npm.cmd run lint` passed.
- `npm.cmd run build` passed. Vite still reports the existing large chunk warning only.
- `node --check server.js` passed.
- `node --check src/server/db.js` passed.

Remaining risks / notes:

- This pass did not add object storage, visual snapshots, live Zarinpal network tests, or backend modularization.

### 2026-05-17 - RBAC and tenant isolation audit

What changed:

- Added an explicit Playwright-side RBAC/tenant policy map in `tests/e2e/rbac-policy.ts` covering normal app route families, required permissions, public-safe routes, and the rule that platform-global access belongs to `/api/admin/*`.
- Hardened normal app detail and mutation helpers/routes so direct-id access is scoped to the authenticated user's own organization across customers, shipment workflow steps/tasks, tasks, documents, cheques, compliance meetings/required docs, quotations, archive restore/create, change logs, and user record bootstrap/save compatibility endpoints.
- Kept `/api/admin/*` as the platform-wide management surface; normal app APIs no longer use `platform.admin` as a cross-tenant bypass.
- Added basic chat membership/org checks for direct chats, group member adds/removes, and mark-read so existing backend chat endpoints cannot cross organizations through member ids.
- Expanded the Playwright security harness from 4 to 7 tests, including seed-owner access, manual tenant isolation, direct seed-id denial for `c1`, `s1`, `doc1`, `t1`, `chq1`, `ap1`, and `q1`, seeded role permission boundaries, and the existing public tracking payload-safety checks.

Files touched:

- `server.js`
- `src/server/db.js`
- `tests/e2e/rbac-policy.ts`
- `tests/e2e/security.spec.ts`
- `PROJECT_HANDOFF.md`

Verification run:

- `npm.cmd run test:e2e:setup` passed, resetting and seeding `logisticplus_test`.
- `npm.cmd run test:e2e` passed: 7/7 Playwright tests. It still logs the known non-fatal Vite WebSocket port warning when another dev server owns the HMR port.
- `npm.cmd run lint` passed.
- `npm.cmd run build` passed. Vite still reports the existing large chunk warning only.
- `node --check server.js` passed.
- `node --check src/server/db.js` passed.

Remaining risks / notes:

- This pass focused on protected API RBAC and tenant isolation. It did not add visual snapshots or backend modularization.
- Public tracking routes stayed public and unchanged except for protected customer-access mutations continuing to enforce same-organization shipment ownership.

### 2026-05-17 - Playwright security regression harness

What changed:

- Added Playwright-based e2e security regression coverage with `test:e2e:setup`, `test:e2e`, and `test:e2e:headed` package scripts.
- Added `playwright.config.ts` configured to run the app on isolated `TEST_PORT` with `TEST_DATABASE_URL`, isolated document storage, and a system Chrome/Edge fallback when Playwright browser downloads are unavailable.
- Added `scripts/reset-test-db.ts`, which refuses to reset a database unless the database name includes `test`, recreates the dedicated test DB, resets test document storage, then runs the existing seed and bridge scripts against the test DB.
- Added Playwright helpers/specs under `tests/e2e/` covering protected-route redirect, UI login, `/api/auth/me`, non-admin RBAC denial, manual company signup, tenant isolation for customer/shipment access, public tracking safe payload shape, public tracking search, and internal document denial through public document endpoints.
- Added minimal `PORT` support in `server.js`, defaulting to `3000`, and wired the Vite middleware to the same port.
- Hardened customer/shipment customer-access lookups used by tested routes so company owners cannot directly access or generate public tracking for another organization's seed customer/shipment records.
- Fixed fresh-schema setup by deferring the `meeting_required_documents.document_id` foreign key until after `documents` exists.
- Updated README and `.env.example` with Playwright/test database variables and system-browser fallback notes.

Files touched:

- `package.json`
- `package-lock.json`
- `.gitignore`
- `playwright.config.ts`
- `scripts/reset-test-db.ts`
- `tests/e2e/helpers.ts`
- `tests/e2e/security.spec.ts`
- `server.js`
- `src/server/db.js`
- `db/schema.sql`
- `README.md`
- `.env.example`
- `PROJECT_HANDOFF.md`

Verification run:

- `npm.cmd run test:e2e:setup` passed, resetting and seeding `logisticplus_test`.
- `npm.cmd run test:e2e` passed: 4/4 Playwright tests.
- `npm.cmd run lint` passed.
- `npm.cmd run build` passed. Vite still reports the existing large chunk warning only.
- `node --check server.js` passed.
- `node --check src/server/db.js` passed.

Remaining risks / notes:

- Playwright CDN browser download is blocked in this environment with a location-based 403, so the config auto-detected local Chrome at `C:\Program Files\Google\Chrome\Application\chrome.exe`. `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` can override this.
- `npm.cmd run test:e2e` logs a non-fatal Vite WebSocket port warning when another dev server is already using the Vite HMR port; the Playwright suite still passes.
- This pass adds browser/security regression coverage only. It does not add unit/API test frameworks, visual snapshots, chat re-enablement, or broader endpoint-by-endpoint permission audits.

### 2026-05-17 - Setup documentation pass

What changed:

- Expanded `README.md` from a short setup note into a project runbook covering the current Vite/React/Express/PostgreSQL stack, prerequisites, PowerShell-first local setup, seed/bridge behavior, default local login, environment variables, commands, Windows caveats, routes, deployment notes, and current testing status.
- Expanded `.env.example` comments so every discovered environment variable is documented with safe local placeholders and usage notes.

Files touched:

- `README.md`
- `.env.example`
- `PROJECT_HANDOFF.md`

Verification run:

- Re-ran env discovery with `rg "process\\.env|import\\.meta\\.env" server.js src scripts vite.config.ts` and confirmed the docs cover the discovered variables.
- `npm.cmd run lint` passed. Direct `npm run lint` was blocked by the local PowerShell execution policy for `npm.ps1`.
- `npm.cmd run build` passed after rerunning outside the sandbox. The sandboxed build failed while Vite/esbuild tried to read outside the allowed directory; the successful build still reports the existing large chunk warning only.

Remaining risks / notes:

- This pass documents the current Windows caveats for `npm run start` and `npm run clean`; it does not fix those scripts.

### 2026-05-17 - Removed startup loading splash

What changed:

- Removed the forced one-second branded startup splash from `src/App.tsx`.
- Removed the protected-route hydration spinner shown on refresh for logged-in app pages.
- Changed route `Suspense` fallback to render without a visible loading component.
- Kept the existing auth redirect and user-record hydration behavior intact; protected app chrome now appears while the existing data load completes quietly.

Files touched:

- `src/App.tsx`
- `PROJECT_HANDOFF.md`

Verification run:

- `npm run lint` passed.
- `npm run build` passed. Vite still reports the existing large chunk warning only.
- In-app browser smoke on `/dashboard` after reload showed the dashboard app shell with no old startup overlay, no spinner classes, and no console errors.

Remaining risks / notes:

- Protected route content waits for existing database hydration before rendering, so the main panel can be briefly blank on a hard refresh instead of showing a loader. This preserves data-safety behavior while removing the visible loading screen the user disliked.

### 2026-05-17 - Company user management reliability pass

What changed:

- Reworked `/management` into a company-scoped employee management screen for company CEOs.
- Removed the dead SaaS signup-request panel from `/management`; signup approval remains owned by `/admin`.
- Added CEO-chosen password and confirm-password fields for new internal users. New users are created as active employees in the CEO's own organization.
- Replaced raw role/status display with Persian labels, real `app_users.status`, status filtering, active/suspended counts, management-user count, and plan capacity from the existing subscription limit.
- Added suspend/reactivate flows that keep historical users visible while blocking suspended users from login.
- Blocked risky self-actions in the UI: CEOs cannot suspend themselves or demote their own CEO role.
- Hardened company user APIs so `/api/users`, `/api/users/:id`, role changes, suspend, and activate require a company CEO and verify target users belong to the same `organization_id`.
- User creation now ignores client-supplied `organizationId` and derives the organization from the authenticated CEO.
- Improved `user_records` user-list sync so company user-list changes propagate across users in the same organization.
- Extended `User` typing with status/organization metadata used by the management screen.
- Added canonical changelog labels/details for user create, update, role change, suspend, and activate actions.

Files touched:

- `src/app/UserManagement.tsx`
- `server.js`
- `src/server/db.js`
- `src/types/index.ts`
- `src/app/ChangeLog.tsx`
- `PROJECT_HANDOFF.md`

Verification run:

- `node --check server.js` passed.
- `node --check src/server/db.js` passed.
- `npm run lint` passed.
- `npm run build` passed. Vite still reports the existing large chunk warning only.
- Latest `server-dev.err.log` is empty.
- In-app browser/API smoke:
  - `/management` renders the updated company user management UI with real status, role labels, capacity, and no SaaS signup panel.
  - Created QA employee `QA-MGMT-1778968300162` with CEO-chosen password via authenticated app API because the browser automation runtime could not type into password inputs.
  - Confirmed created user belongs to `org-logisticplus-default`, even when a bogus client `organizationId` was supplied.
  - Confirmed duplicate email creation returns `DUPLICATE_EMAIL`.
  - Confirmed QA employee login works while active and non-CEO `/api/users` access returns `403 FORBIDDEN`.
  - Changed QA employee role to Finance and confirmed `/management` shows `امور مالی` after reload.
  - Suspended QA employee, confirmed login is blocked, reactivated QA employee, confirmed login works again, then cleaned up by suspending the QA employee through the `/management` row action.
  - `/api/changes` shows `user.create`, `user.role_change`, `user.suspend`, and `user.activate` entries for the QA user.

Remaining risks / notes:

- Browser automation could not fill password inputs due the in-app browser virtual clipboard limitation; the visible UI fields were verified and the create mutation was smoke-tested through the authenticated app API.
- The pass did not add invite email delivery, password reset, or a new permission architecture.
- Existing historical seed/test users and mojibake names remain in the local database; this pass did not rewrite historical data.
- Public pages, SaaS signup/admin approval behavior, billing, public tracking, and chat were not intentionally changed.

### 2026-05-17 - Internal workflow audit and persistence hardening

What changed:

- Ran an end-to-end internal workflow pass with disposable shipment `QA-WF-1778965963402` / `sj7noa`.
- Verified the real operations path after login: shipment creation, shipment edit/status update, shipment detail reload, workflow-step assignment, workflow task completion, document upload, visibility toggle, document download, document archive, changelog visibility, logout/login persistence, and cleanup.
- Kept the current hybrid model in place. `user_records` remains the compatibility source for legacy shipment list/edit flows, with bridge hardening instead of a canonical CRUD rewrite.
- Hardened the `user_records` bridge so compatibility saves now carry `organization_id` into `user_records` and canonical customer/shipment/task/document/notification/cheque/compliance/quotation rows.
- Added bridge-level shipment audit rows for legacy shipment create, update, status change, archive, and restore saves so list/edit/status mutations show meaningful changelog entries instead of only generic `records.replace`.
- Fixed workflow task creation/activation so canonical tasks keep the shipment organization when a shipment step generates or reactivates a task.
- Protected `/api/users/:userId/bootstrap` and `PUT /api/users/:userId/records` so only the authenticated owner or a platform admin can read/write compatibility records. This was a data-safety issue found during the audit.
- Updated the changelog page to merge canonical `/api/changes` rows with legacy activity logs, hide noisy `records.replace` entries, label shipment-step/task/document actions in Persian, and route shipment-step entries back to the shipment detail.
- Fixed shipment detail documents so archived documents no longer remain visible on a shipment after archive/reload, and corrected the documents summary label from articles to documents.
- Cleaned up the QA data through existing app UI flows: the QA shipment was moved to delivered, archived from `/shipments`, confirmed absent from active shipments after reload, and confirmed present in `/archive` with the archived QA document.

Files touched:

- `server.js`
- `src/server/db.js`
- `src/app/ChangeLog.tsx`
- `src/app/ShipmentDetail.tsx`
- `PROJECT_HANDOFF.md`

Verification run:

- `npm run lint` passed.
- `npm run build` passed. Vite still reports the existing large chunk warning only.
- Latest `server-dev.err.log` is empty.
- In-app browser smoke:
  - Logged in with the documented seed owner account and reached `/dashboard`.
  - `/shipments` showed the QA shipment, accepted status updates, persisted after reload, and archived the QA shipment via the existing row action.
  - `/shipments/sj7noa` showed the updated destination/status after reload and after logout/login; archived QA document was hidden from the detail view after the fix.
  - Shipment workflow assignment created the related task; completing the workflow step marked that task complete.
  - `/tasks` showed the QA workflow task as completed after hydration.
  - `/documents` hid the archived QA document while `/archive` showed both the QA document and archived QA shipment.
  - Document download endpoint returned the uploaded QA file successfully during the smoke pass.
  - `/changelog` showed QA shipment, task, document, status, and archive entries.

Remaining risks / notes:

- Browser file-input automation could not drive the native upload control in this runtime, so the QA document upload used the authenticated app API and was then verified through the UI.
- The app still intentionally uses the hybrid `user_records` compatibility path. A full shipment canonicalization migration should be a separate project.
- Existing historical seed mojibake and older generic audit rows remain; this pass fixed future workflow/audit behavior without rewriting history.
- Chat remains disabled from the user-facing workflow; no public marketing, pricing, signup, admin-signup, auth redirect, billing, or public tracking behavior was intentionally changed.

### 2026-05-17 - Landing page polish and mobile hero pass

What changed:

- Further polished `/` with animated SaaS presentation elements: staggered hero entrance, animated dashboard preview cards, route/progress motion, hover states, and softer app-shell visual depth.
- Adjusted the dashboard-preview route dot so it travels one-way from `ثبت` through `اسناد` to `تحویل`, fades out, pauses, then restarts without the mixed-unit jump.
- Restyled the `نمای ماژول‌ها` showcase section with an animated multi-shade blue gradient background and blue-glass cards/pills/icons tuned for readability on the darker surface.
- Enhanced the landing-only header as a fixed sticky-style bar with `خانه`, `پلن‌ها`, `تماس با ما`, `ورود`, and `ثبت‌نام`; pricing now links to `/pricing` and contact anchors to the final CTA.
- Applied the same fixed public header pattern to the shared pricing/signup public shell in `src/app/SaasSignup.tsx`, so `/pricing` now matches the landing header while keeping pricing content and signup logic unchanged.
- Removed the lower landing-page pricing detail/cards section while keeping the compact plan strip under the hero and the full `/pricing` route unchanged.
- Added compact summarized plan cards directly under the hero/product preview area so visitors see the three subscription options before the proof strip.
- Tightened responsive behavior for phones: simplified mobile header, stacked hero CTAs, compact stats, single-column sub-plan cards, and no horizontal overflow at a 390px mobile viewport.
- Kept the page Persian/RTL, dashboard-themed, and marketing-only. No routes, auth/session, signup, tracking, chat, billing, or app module behavior changed.
- Replaced a decorative `Sparkles` icon import with an operations-style product icon so AI-image cleanup searches stay clean.

Files touched:

- `src/app/LandingPage.tsx`
- `PROJECT_HANDOFF.md`

Verification run:

- `npm run lint` passed.
- `npm run build` passed. Vite still reports the existing large chunk warning only.
- In-app browser smoke:
  - Desktop `/` hero renders with the animated product preview and compact plan cards visible below the hero.
  - Mobile `/` at 390x844 renders without horizontal overflow; hero, CTAs, preview, and sub-plan cards stack cleanly.
  - Search confirms no user-facing AI image-generation terms remain in app/source files.

### 2026-05-16 - Public pages, Rial pricing, and AI-image cleanup

What changed:

- Rebuilt `/` as a Persian RTL SaaS landing page for Logistic Plus using the current dashboard visual language: header/nav, hero, app-style preview, proof strip, feature cards, module showcase, summarized pricing, workflow, target customer cards, FAQ, final CTA, and footer.
- Theme-aligned `/pricing`, `/signup`, `/signup/pending`, and `/login` with the internal app shell colors, cards, borders, radius, spacing, and RTL layout.
- Added shared frontend pricing data in `src/lib/pricing.ts` for the three public plans:
  - `starter` / اقتصادی: ۱۹,۹۰۰,۰۰۰ ریال per month, ۳ users, ۵۰ shipments, ۲ GB.
  - `business` / حرفه‌ای: ۴۹,۹۰۰,۰۰۰ ریال per month, ۱۰ users, ۲۵۰ shipments, ۱۰ GB.
  - `enterprise` / سازمانی: ۹۹,۰۰۰,۰۰۰ ریال per month, ۳۰ users, ۱,۰۰۰ shipments, ۵۰ GB.
- Updated `scripts/bridge-canonical-db.ts` so SaaS subscription plan seed/upsert values come from the shared pricing data.
- Added `/pricing` extra usage pricing for added employees, shipment blocks, storage, and report exports.
- Removed the misplaced landing-page AI image prompt/visual section and removed unused Gemini/AI setup leftovers from `vite.config.ts`, `.env.example`, `README.md`, and dependencies.
- Added `asChild` support to the shared `Button` component so existing public link buttons no longer leak `asChild` onto DOM nodes.
- Replaced the generic setup README and expanded `.env.example` with the actual Logistic Plus local variables.

Files touched:

- `src/app/LandingPage.tsx`
- `src/app/LoginPage.tsx`
- `src/app/SaasSignup.tsx`
- `src/lib/pricing.ts`
- `scripts/bridge-canonical-db.ts`
- `components/ui/button.tsx`
- `vite.config.ts`
- `.env.example`
- `README.md`
- `package.json`
- `package-lock.json`
- `PROJECT_HANDOFF.md`

Verification run:

- `npm run lint` passed.
- `npm run build` passed. Vite still reports the existing large chunk warning only.
- In-app browser smoke:
  - `/` renders the new landing structure, required Persian sections, summarized pricing, FAQ, and no AI image-generation copy.
  - `/pricing` renders all three Persian Rial plans plus extra usage pricing.
  - `/signup` renders the signup form, plan selector, and payment summary with the new plans.
  - `/signup/pending` renders the themed pending state.
  - `/login` renders the themed login form.
  - Seed login from `/login` with the documented local credentials redirects to `/dashboard`.

Remaining risks / notes:

- This pass did not change auth/session, signup/payment, public tracking, chat behavior, or route names.
- Existing databases need `npm run db:bridge` to upsert the updated plan rows into PostgreSQL.
- Browser dev logs may retain older console entries from before HMR; the current DOM no longer contains leaked `asChild` attributes.

### 2026-05-16 - Landing page and official Logistic Plus branding

What changed:

- Added a new animated public marketing homepage at `/` for Logistic Plus.
- Moved the existing login screen to `/login`.
- Updated protected-route behavior so unauthenticated app routes redirect to `/login`.
- Updated public signup shell links to point to `/login`.
- Replaced visible old-brand copy across app loader, sidebar/mobile shell, public tracking, quotation print/header, user placeholder copy, and the static HTML fallback with the official names `Logistic Plus` and `لجستیک پلاس`.
- Left legacy seed/test email domains unchanged because they are mock data rather than product branding.

Files touched:

- `src/App.tsx`
- `src/app/LandingPage.tsx`
- `src/app/SaasSignup.tsx`
- `src/components/layout/Navbar.tsx`
- `src/app/PublicTrack.tsx`
- `src/app/QuotageManagement.tsx`
- `src/app/UserManagement.tsx`
- `index.html`
- `PROJECT_HANDOFF.md`

Verification run:

- `npm run lint` passed.
- `npm run build` passed. Vite still reports the existing large chunk warning only.
- Restarted the local dev server on port 3000; latest `server-dev.err.log` is empty.
- In-app browser smoke:
  - `/` renders the new landing page and its main CTA links point to `/signup`, `/pricing`, and `/login`.
  - `/login` renders the existing login form.
  - Seed owner login from `/login` reaches `/dashboard`.
  - `/pricing`, `/signup`, `/track/search`, and `/track/not-a-real-token` render with no console errors.
  - Dashboard smoke after login shows the official Logistic Plus branding only.
- Source text search confirms no visible old-brand strings remain in app/source UI files; only legacy seed/test email domains remain in mock data by design.

Remaining risks / next bugs:

- `/track/:token` was smoke-tested with a nonexistent token page because raw public tokens are not stored in local data; token hashes are stored instead.
- I did not clear the active browser session to verify unauthenticated `/dashboard` redirect visually, but the protected-route redirect was changed in code and the `/login` login flow was verified.

### 2026-05-16 - Admin unresolved error cleanup

What changed:

- Investigated all 14 unresolved Admin Panel error records and grouped them by root cause.
- Fixed compliance meeting creation failures caused by reusable required-document template IDs (`d1`, `d2`, `d3`) colliding against the global `meeting_required_documents.id` primary key. New meeting document IDs are now namespaced by meeting ID.
- Updated Admin Panel signup review handling so expected approval conflicts, such as approving before payment is marked paid, show a toast instead of becoming unhandled client errors.
- Disabled the approve button for unpaid signup requests and added a title explaining that payment must be verified first.
- Wrapped shipment public tracking link copy in a clipboard fallback so browser permission denial no longer becomes an unresolved client error.
- Truncated long strings in server error-log context so future API error records do not store huge payloads such as base64 avatars.
- Marked the 14 historical unresolved rows as resolved after their causes were fixed.

Files touched:

- `src/server/db.js`
- `src/app/AdminPanel.tsx`
- `src/app/ShipmentDetail.tsx`
- `server.js`
- `PROJECT_HANDOFF.md`

Verification run:

- `npm run lint` passed.
- `npm run build` passed. Vite still reports the existing large chunk warning only.
- Ran a duplicate compliance-meeting document smoke by creating two temporary meetings with the same required document template IDs, then cleaned them up; both inserts succeeded.
- Restarted the local dev server on port 3000; latest `server-dev.err.log` is empty.
- In-app browser smoke:
  - `/admin` renders with no console errors.
  - Admin overview shows open errors count at zero.
  - Admin `خطاها` tab shows the empty-state message and no `API returned 500` / signup approval conflict rows.
- Database check confirms `app_error_logs WHERE resolved_at IS NULL` count is `0`.

Remaining risks / next bugs:

- Historical resolved rows remain in the database for audit/history; they are no longer shown under unresolved errors.
- I did not submit a real admin signup approval or create a real compliance meeting through the browser to avoid adding live business data during verification.

### 2026-05-16 - Archive delete and admin signup repair

What changed:

- Added a backend hard-delete route for API-backed archive records: `DELETE /api/archive/:entityType/:entityId`.
- Added database support for permanently deleting archived canonical records while also removing their `archive_records` entry.
- Updated the archive page delete action so archived API records call the server and then refresh local records; legacy/local archive items still use the existing local fallback deletion behavior.
- Tightened signup creation validation so failed validation no longer holds a PostgreSQL client open.
- Made legacy `user_records` replacement tolerate duplicate IDs and overlapping save requests by de-duplicating payload records and using `ON CONFLICT` upserts.
- Restarted the local dev server on port 3000 with the final code.

Files touched:

- `server.js`
- `src/server/db.js`
- `src/app/Archive.tsx`
- `PROJECT_HANDOFF.md`

Verification run:

- `npm run lint` passed.
- `npm run build` passed. Vite still reports the existing large chunk warning only.
- In-app browser smoke:
  - Logged in with the documented local seed owner account.
  - `/archive` renders `بایگانی مرکزی`, shows 4 archived items, and exposes archive action buttons with no console errors.
  - `/admin` renders, the `مشتریان` tab opens, and the manual company signup form shows `ایجاد و فعال‌سازی شرکت` with email/password fields and no console errors.
- Server restarted cleanly; latest `server-dev.err.log` is empty after the final restart.

Remaining risks / next bugs:

- I did not click the archive permanent-delete action in the browser because it would delete real archived data.
- I did not create a real throwaway company from the admin panel to avoid polluting the local SaaS/customer data. The form, endpoint wiring, validation path, and related persistence bug were inspected/fixed.

### 2026-05-16 - Critical bug-fix pass 1

What changed:

- Fixed stale-session behavior so an expired/invalid server session clears `currentUser` and returns to login instead of leaving the protected app on the hydration loader.
- Updated logout controls in the desktop sidebar and mobile/top-bar menu to call `POST /api/auth/logout` before clearing local app state.
- Reset local Zustand records when `setCurrentUser(null)` runs, preventing logged-out users from retaining previous in-memory app data.
- Changed document visibility updates in the documents page and shipment-detail document panel to use the dedicated `PATCH /api/documents/:id/visibility` endpoint, preserving the intended audit action.
- Fixed two shipment-detail controls that looked interactive but did nothing:
  - The document-card external-link icon now opens the document/download URL.
  - The "مشاهده پروفایل مشتری" button now navigates to the linked customer detail page and disables itself when no customer is linked.
- Fixed new shipment-step task creation text so future assigned tasks use Persian title/description/toast text instead of `????` placeholders.

Files touched:

- `src/store/useAppStore.ts`
- `src/App.tsx`
- `src/components/layout/Navbar.tsx`
- `src/app/Documents.tsx`
- `src/app/ShipmentDetail.tsx`
- `PROJECT_HANDOFF.md`

Verification run:

- `npm run lint` passed.
- `npm run build` passed. Vite still reports the existing large chunk warning only.
- In-app browser smoke checks passed with no console errors for:
  - `/dashboard`
  - `/shipments`
  - `/documents`
  - `/track/search`
  - `/track/not-a-real-token`
  - `/admin`
  - First shipment detail page (`/shipments/s1`)
  - Shipment detail customer-profile button navigation to `/customers/c1`

Remaining risks / next bugs:

- Existing historical tasks that were already saved with `????` titles remain in data; this pass fixes newly created shipment-step tasks only.
- Full mutation persistence for shipment list actions still depends on the legacy Zustand `user_records` save loop and should get a dedicated follow-up audit.
- Global search in the top bar still needs a product decision or implementation pass; it is visible UI but not part of this first focused fix.

## 1. Project Overview

Logistic Plus is a responsive web-based logistics operations workspace. The official user-facing product name is `Logistic Plus`, with Persian display name `لجستیک پلاس`. The product is intended for logistics companies that need one internal system for shipment operations, customer management, tasks, documents, secure customer tracking, audit logs, finance-related cheque tracking, compliance meetings, quotations, archive, and eventually internal chat.

The project currently goes beyond a single-company operations tool. The codebase includes a SaaS/platform layer with organizations, subscription plans, signup requests, billing payments, invoices, receipts, admin overview, organization management, error logs, and a manual company signup flow in the admin panel.

Main purpose:

- Centralize shipment operations and related work in one RTL/Persian-friendly internal web app.
- Let internal users manage shipments, customers, tasks, documents, quotations, cheques, compliance meetings, and archives.
- Let customers view safe shipment status through secure public tracking links, QR codes, or a guarded search flow.
- Let platform/admin users manage companies, subscriptions, payments, and signup approvals.

Type of app:

- React single-page application served by an Express server.
- PostgreSQL-backed operational and SaaS management system.
- Internal protected dashboard plus public customer tracking and public signup/pricing pages.

Expected user experience:

- Internal users log in, see an RTL dashboard, and navigate through sidebar/mobile navigation.
- Each role should only see and use the sections allowed by RBAC.
- Managers and operations teams should be able to create and monitor shipments, assign work, upload documents, and keep customers updated.
- Customers should never enter the internal app. They should use `/track/:token` or `/track/search` and only see whitelisted public shipment data.
- Platform admin users should be able to create new companies manually, manage subscriptions/billing, and inspect platform errors.

Important product and technical goals:

- Server-side permission checks, not only hidden UI.
- Audit logging for important data-changing actions.
- Soft archive instead of hard deletion where possible.
- Safe separation between internal data and customer-facing tracking data.
- Mobile-responsive layouts for operational use.
- PostgreSQL as the source of durable state.
- Filesystem document storage now includes upload validation and Liara disk/volume production hardening; S3/object storage remains deferred.

Key assumptions inferred from the planning pack and code:

- The MVP should include auth/RBAC, users, audit logs, customers, shipments, shipment detail workflow, documents, tasks, dashboard, and secure customer access.
- Chat is a future/post-MVP feature. In the current code it is intentionally disabled visually and behaviorally.
- The legacy protected `/track` panel page has been removed. Only secure public tracking routes should remain.
- The app is intended to be multi-tenant, but some older code still carries single-owner or mock-store assumptions.

## 2. Current State

What appears already implemented:

- Vite + React + TypeScript frontend.
- Express backend in `server.js`.
- PostgreSQL database access in `src/server/db.js`.
- SQL schema in `db/schema.sql`.
- Session-based auth endpoints and protected React layout.
- User records/bootstrap persistence for the Zustand store.
- Role and permission tables plus server helpers such as `requirePermission`.
- Main internal pages:
  - Dashboard
  - Shipments
  - Shipment detail
  - Shipment edit
  - Customers
  - Customer detail
  - Tasks
  - Documents
  - Compliance
  - Cheque management
  - Quotage/quotation management
  - Archive
  - Change log
  - Profile
  - Settings
  - User management
  - Admin panel
  - Chat route with disabled/coming-soon state
- Public pages:
  - Landing page at `/`
  - Login at `/login`
  - Pricing at `/pricing`
  - Signup at `/signup`
  - Signup pending/payment status at `/signup/pending`
  - Zarinpal callback at `/billing/callback/zarinpal`
  - Secure public tracking at `/track/:token`
  - Public tracking search at `/track/search`
- Current Liara production status:
  - App name/domain in use: `logisticplus` at `https://logisticplus.liara.run`.
  - Latest production deploy booted successfully with disk `logisticplus-documents` mounted at `storage/documents`.
  - `/api/health` and `/api/db/health` were verified OK after deploy and cleanup.
  - Liara DB cleanup ran after backup/export; operational/test records are empty while owner/org/subscription scaffolding is preserved.
- Clean database UX:
  - Shared empty-state components are wired into protected app pages.
  - Dashboard has a launch checklist for first customer, shipment, document, and tracking setup.
  - Customer creation now captures contact phone, address, and notes.
  - Customer archive/delete uses the server-backed archive endpoint and waits for confirmation success before closing.
- Platform/SaaS functionality:
  - Subscription plans
  - Signup requests
  - Billing payments
  - Billing invoices and receipts
  - Organization listing/detail/status/subscription management
  - Admin manual company signup
  - Error log collection and admin error log views
- Secure customer tracking:
  - Customer access token generation/reset/disable.
  - Token hashing.
  - Public tracking API.
  - Public customer-visible documents API.
  - QR code controls in shipment detail.
- Document uploads:
  - Local file storage under `storage/documents` by default.
  - Document records and versions.
  - Document download and replacement endpoints.
- Production hardening:
  - Liara disk/volume startup probe for document storage.
  - Memory/PostgreSQL-backed rate limiting for login, signup, payment start, and document upload/replace.
  - Production config smoke script and Liara launch checklist.
- Automated testing:
  - Playwright e2e security regression harness with isolated test database/storage.
- Chat backend endpoints and WebSocket support exist, but chat frontend is currently disabled by design.

What is partially implemented:

- RBAC:
  - Permission keys and server checks exist.
  - Frontend navigation is partly filtered by role/email checks.
  - Route-level frontend permission checks are not fully granular.
  - Protected API RBAC/tenant coverage has a Playwright policy map, but new routes should still be mapped before release.
- Audit logging:
  - `change_logs` table and `auditLog` helper exist.
  - Many endpoints call audit logging.
  - Coverage is likely incomplete and should be tested.
- Multi-tenancy:
  - `organizations` and `organization_id` columns exist widely.
  - Some older flows still use `owner_user_id`, `user_records`, and legacy JSON data.
  - Direct normal-app record access has regression coverage, but the hybrid legacy/canonical model still needs care.
- Shipment workflow:
  - Shipment detail UI and step/task APIs exist.
  - The canonical schema does not include explicit `shipment_steps` or `shipment_team_members` tables from the planning docs.
  - Some workflow data appears to rely on legacy JSON/store patterns.
- Notifications:
  - Notification data exists in UI/store and schema.
  - Background jobs for reminders, due dates, and free-time alerts are not implemented as a production service.
- Billing:
  - SaaS billing tables and admin endpoints exist.
  - Zarinpal integration uses `ZARINPAL_*` config.
  - Production payment behavior needs verification with real credentials.
- Documents:
  - Local storage and metadata are implemented.
  - Filesystem storage helpers live in `src/server/document-storage.js` and production startup probes require a mounted/writable Liara disk.
  - Strict extension/MIME validation and public document filtering have Playwright coverage.

What is missing or incomplete:

- A migration system. The app uses `db/schema.sql` directly through seed/bridge scripts.
- Production-ready background jobs.
- S3/object-storage adapter, if the project later outgrows Liara disk storage.
- Fine-grained frontend permission routing.
- Global search/pagination consistency across all major lists.
- Git metadata. This local folder is not currently a Git repository.

Broken, placeholder, or unfinished areas:

- Chat is intentionally disabled in `src/app/Chat.tsx` with `CHAT_DISABLED = true`. UI is blurred and overlaid with a coming-soon message. Chat API fetches, WebSocket connection, thread creation, and message sending are guarded off.
- The legacy protected tracking panel page was removed. `/track` now falls through to the app wildcard behavior.
- `npm run clean` uses `rm -rf dist`, which may not work directly in Windows PowerShell.
- Some terminal output shows mojibake for Persian strings because of console encoding. Browser rendering should be checked separately.

Runnable status:

- The project appears runnable with Node.js, npm dependencies, and PostgreSQL configured.
- After the latest code changes, `npm run lint`, `npm run build`, `npm run smoke:production-config`, `npm run test:e2e:setup`, and `npm run test:e2e` were reported as passing.
- Browser smoke checks were also performed for:
  - `/chat` disabled/blurred state.
  - Sidebar still showing Chat and no longer showing panel Tracking.
  - `/track` falling through.
  - `/track/search` rendering.
  - Invalid `/track/:token` rendering safe unavailable state.
  - Shipment detail still exposing secure customer link and QR controls.

## 3. Repository Structure

Key repository tree:

```text
logisticplus/
  .env.example
  .gitignore
  README.md
  package.json
  package-lock.json
  index.html
  vite.config.ts
  tsconfig.json
  liara.json
  metadata.json
  components.json
  server.js
  db/
    schema.sql
  scripts/
    seed-db.ts
    bridge-canonical-db.ts
  src/
    App.tsx
    main.tsx
    index.css
    app/
      AdminPanel.tsx
      Archive.tsx
      ChangeLog.tsx
      Chat.tsx
      ChequeManagement.tsx
      Compliance.tsx
      CustomerDetail.tsx
      Customers.tsx
      Dashboard.tsx
      Documents.tsx
      LoginPage.tsx
      Profile.tsx
      PublicTrack.tsx
      QuotageManagement.tsx
      SaasSignup.tsx
      Settings.tsx
      ShipmentDetail.tsx
      ShipmentEdit.tsx
      Shipments.tsx
      Tasks.tsx
      UserManagement.tsx
    components/
      layout/
        Navbar.tsx
        MobileBottomNav.tsx
      ClientErrorBoundary.tsx
      DeleteConfirmDialog.tsx
    lib/
      errorReporting.ts
      mockData.ts
    server/
      db.js
    store/
      useAppStore.ts
    types/
      index.ts
  components/
    ui/
      avatar.tsx
      badge.tsx
      button.tsx
      card.tsx
      checkbox.tsx
      dialog.tsx
      dropdown-menu.tsx
      input.tsx
      label.tsx
      progress.tsx
      scroll-area.tsx
      select.tsx
      separator.tsx
      sheet.tsx
      switch.tsx
      table.tsx
      tabs.tsx
      tooltip.tsx
  lib/
    utils.ts
  storage/
    documents/
  dist/
  node_modules/
  server-dev.out.log
  server-dev.err.log
```

Important folders and files:

| Path | Purpose |
|---|---|
| `src/App.tsx` | React route table, protected layout, lazy page loading, app shell setup. |
| `src/main.tsx` | React entry point. |
| `src/index.css` | Tailwind/global styling and app theme. |
| `src/app/` | Feature pages and route components. Most product UI lives here. |
| `src/components/layout/` | Sidebar, top bar, mobile bottom navigation. |
| `src/store/useAppStore.ts` | Zustand store for active production app state; it syncs compatibility data with backend `user_records`. |
| `src/lib/mockData.ts` | Seed/mock source data used by the seed script and likely fallback UI flows. |
| `src/lib/errorReporting.ts` | Client-side error reporting helper used by `ClientErrorBoundary`. |
| `src/server/db.js` | Main data access layer, SQL queries, auth/session helpers, permission helpers, SaaS/billing functions, feature CRUD, audit, chat, documents, public tracking. |
| `server.js` | Express app, API routes, static serving, Zarinpal integration, WebSocket upgrade handling, and orchestration of server helpers. |
| `src/server/document-storage.js` | Filesystem document upload/download helpers, validation, cleanup, and production storage probe. |
| `src/server/rate-limit.js` | Memory/PostgreSQL rate-limit backend used by login, signup, payment, and document endpoints. |
| `src/server/startup-checks.js` | Production configuration checks for Liara storage, HTTPS public URL, Zarinpal, proxy, and limiter setup. |
| `db/schema.sql` | Canonical SQL schema used by seed/bridge scripts and the backend. |
| `scripts/seed-db.ts` | Creates database if needed, applies schema, seeds one owner user and legacy `user_records` from mock data. |
| `scripts/bridge-canonical-db.ts` | Bridges legacy/mock `user_records` into canonical tables and seeds roles, permissions, plans, and default organization. |
| `components/ui/` | shadcn/base UI primitives imported through the `@/components/ui/*` alias. |
| `lib/utils.ts` | Shared `cn` utility used by UI components. |
| `.env.example` | Local and production environment template covering PostgreSQL, documents, rate limiting, Zarinpal, Playwright, and Liara launch settings. |
| `liara.json` | Liara deployment config for Node 22 and port 3000. |
| `dist/` | Generated Vite build output. Should not be edited. |
| `node_modules/` | Installed dependencies. Should not be edited. |
| `storage/documents/` | Local uploaded document storage. Runtime data. |
| `server-dev.*.log` | Local development logs. Should generally be ignored/cleaned. |

Planning/specification files:

- They are not inside this repo.
- The planning pack is at `C:\Users\Ahmadreza\Documents\New project\logistic-plus-codex-plan`.
- This handoff summarizes that external folder in section 4.

Generated, temporary, or legacy files:

- `dist/`: generated build output.
- `node_modules/`: dependency install output.
- `storage/documents/`: runtime uploaded files.
- `server-dev.out.log` and `server-dev.err.log`: local logs.
- `src/lib/mockData.ts` and `src/store/useAppStore.ts`: important, but still carry legacy/mock architecture assumptions.
- `user_records` table: compatibility/persistence bridge for the Zustand store. Do not remove until all pages are fully canonicalized.

## 4. codexplan Folder Summary

The planning pack is external:

`C:\Users\Ahmadreza\Documents\New project\logistic-plus-codex-plan`

It contains a complete product specification for Logistic Plus. It describes a broader intended system than the current code, and it suggests a different initial stack in some places.

### Plan File Index

| File | Purpose | Current Code Alignment | Notes / Next Steps |
|---|---|---|---|
| `README.md` | Planning pack overview, scope, file index, build order, global rules, default roles. | Mostly aligned at product level. | Scope includes shipments, tasks, documents, customers, customer tracking, RBAC, chat, audit, archive, cheques, compliance, quotations. Code implements many of these plus SaaS/admin. |
| `architecture.md` | Technical foundation, app areas, layout, core services, data safety, API conventions, testing requirements. | Partially aligned. | Plan suggests Next.js, Prisma, storage abstraction, background jobs. Actual code is Vite React + Express + raw `pg`, no Prisma. Data safety and RBAC goals still apply. |
| `database-schema.md` | Feature-oriented database entities and relationships. | Partially aligned. | Actual `db/schema.sql` includes many planned entities plus SaaS/billing tables. Actual schema uses `app_users`, organizations, `legacy_data`, and `user_records`; it does not currently define explicit `shipment_steps` or `shipment_team_members` tables from the plan. |
| `rbac-and-auth.md` | User types, roles, permissions, route protection, server access rules. | Partial. | Permission keys exist and server helper functions exist. Need verify every internal route and API mutation is protected by the right permission. |
| `user-management.md` | CEO/manager user management, role changes, status, online users, permission management. | Partial to Done. | Current route is `/management`, not `/users`. Backend has user and role endpoints. UI exists. Full custom role/permission editing needs verification. |
| `changes.md` | Audit trail requirements, filters, detail view, events to log, append-only security. | Partial. | Current route is `/changelog`, not `/changes`. `change_logs` table and endpoints exist. Audit coverage needs testing. |
| `customers.md` | Customer list/detail, search, related shipments/documents/quotations/cheques, archive rules. | Partial to Done. | `/customers` and `/customers/:id` exist with API endpoints. Need verify duplicate warnings, related records completeness, and permission filtering. |
| `shipments.md` | Searchable/filterable shipment list, create flow, free-time urgency, quick actions. | Partial to Done. | `/shipments` exists. Legacy panel tracking shortcuts were removed. Need verify workflow, permissions, pagination, and all validations. |
| `shipment-detail.md` | Individual shipment workspace: header, documents, free-time timer, team, process box, workflow steps, customer link. | Partial. | `/shipments/:id` exists and secure customer access controls were preserved. Canonical step/team data model differs from the plan. |
| `documents.md` | Document bank, upload, search, preview/detail, versioning, storage rules, customer-visible docs. | Partial to Done. | `/documents` and document APIs exist. Local/Liara-disk storage, strict validation, and public filtering are covered. S3/object storage and richer version UX remain optional future work. |
| `tasks.md` | My/team tasks, create/assign, statuses, workflow-generated tasks, notifications. | Partial to Done. | `/tasks` and task APIs exist. Workflow-generated shipment tasks exist server-side. Notifications/background reminders need hardening. |
| `dashboard.md` | Role-specific operational dashboard, metrics, latest/priority shipments, tasks, alerts, management view. | Partial. | `/dashboard` exists and dashboard API endpoints exist. Role filtering and real-time freshness need verification. |
| `customer-access.md` | Secure customer tracking via token, QR, safe public view, search by shipment ID, public status. | Done to Partial. | `/track/:token`, `/track/search`, APIs, tokens, QR controls, customer-visible docs, safe-field regression tests, and rate limiting exist. Any field changes should keep tests updated. |
| `chat.md` | Direct chat, department groups, custom groups, realtime, unread counts, attachments. | Planned / Disabled. | Backend endpoints and WebSocket exist, but frontend is deliberately disabled with coming-soon overlay. Keep disabled until product is ready. |
| `archive.md` | Archive search, filters, archive/restore, soft delete behavior. | Partial to Done. | `/archive` and archive endpoints exist. Needs verification for every entity type and audit coverage. |
| `cheques.md` | Finance cheque tracking, due dates, status/location, documents, alerts, archive. | Partial to Done. | `/cheques` and cheque APIs exist. Need verify document attachment integration, due alerts, and dashboard integration. |
| `compliance-meetings.md` | Compliance meeting scheduling, required documents, outcomes, next steps, reminders. | Partial to Done. | Current route is `/compliance`, not `/compliance-meetings`. Meeting APIs and UI exist. Need verify required document upload flow and follow-up tasks. |
| `quotations.md` | Quotation management, active/accepted/rejected/expired, documents, tasks, convert to shipment. | Partial to Done. | Current route is `/quotage`, not `/quotations`. API includes quotation status actions and convert-to-shipment. Naming mismatch should be intentional or cleaned up. |
| `implementation-roadmap.md` | Suggested build phases from foundation to hardening. | Useful roadmap, not exact current state. | Many Phase 1-5 features exist. Remaining roadmap items are mainly migrations, modularization, background jobs, route naming, and deeper audit coverage. |
| `codex-master-prompt.md` | Prompt for future Codex sessions and non-negotiable rules. | Still useful. | It says to use existing repo stack if it differs. Future sessions should follow actual Vite/Express/pg stack, not migrate to Next.js/Prisma by default. |

### Important Requirements From the Planning Pack

- Customer-facing pages must never expose internal notes, audit logs, staff tasks, private files, chat, cheque/financial details, or compliance internals.
- Every meaningful mutation should write a change log entry.
- Permissions must be enforced server-side.
- Archive records instead of hard-deleting them by default.
- Documents should be the central upload/versioning system.
- Tasks should power workflow handoffs and dashboard to-do lists.
- Main pages should work on mobile and desktop.
- Major list pages should support search, filters, and pagination where appropriate.

### Completed or Mostly Completed Against the Plan

- Basic app shell and routing.
- Internal pages for most major features.
- Express API coverage for most major planned endpoints.
- PostgreSQL schema for most major planned tables.
- Auth/session flow.
- Secure public tracking by token/search.
- Customer access link/QR controls.
- Documents, tasks, cheques, compliance, quotations, archive, and changelog pages.
- SaaS/platform admin layer, which is outside the original core plan.
- Manual admin company signup implemented.
- Chat route retained but temporarily disabled.
- Legacy protected `/track` panel removed.
- Playwright e2e security regression harness.
- RBAC/tenant isolation regression coverage for high-risk direct-id access.
- Document upload/download/public visibility hardening.
- PostgreSQL-backed production rate limiting.
- Liara disk/volume production storage hardening and launch checklist.

### Still Not Done or Needs Verification Against the Plan

- Full permission audit for all protected routes and endpoints.
- Full audit logging coverage for every mutation.
- Canonical shipment steps/team-members schema, if the plan still requires it.
- Background jobs for reminders and alerts.
- Full migration/versioning workflow.
- S3/object storage adapter, if Liara disk storage is no longer enough.
- Decide whether route names should match the plan:
  - Plan: `/changes`, code: `/changelog`
  - Plan: `/users`, code: `/management`
  - Plan: `/compliance-meetings`, code: `/compliance`
  - Plan: `/quotations`, code: `/quotage`

### Contradictions Between Plans and Actual Codebase

- Planned stack is Next.js + Prisma; actual stack is Vite + React Router + Express + raw `pg`.
- Planning pack assumes feature files may map to modular server services. Actual backend is mostly concentrated in `server.js` and `src/server/db.js`.
- Plan has explicit `shipment_steps` and `shipment_team_members`; current schema does not define those tables.
- Planning pack treats chat as a buildable post-MVP feature; current product decision is to keep `/chat` visible but disabled.
- Planning pack includes optional `/customer-access`; current code uses controls inside shipment detail and public `/track/*`.
- Planning pack has internal `/track` only as public customer access; a legacy protected panel tracking page existed and has now been removed.
- Plan does not describe the SaaS/billing/admin layer in detail, but the codebase now includes it.

## 5. Architecture and Technical Design

Frameworks and libraries:

- Frontend:
  - React 19
  - React Router DOM 7
  - TypeScript
  - Vite 6
  - Tailwind CSS 4 via `@tailwindcss/vite`
  - shadcn/base-ui-style components
  - lucide-react icons
  - Zustand for client state
  - sonner toasts
  - date-fns-jalali for Persian/Jalali dates
  - motion for animations
  - Recharts for charts
- Backend:
  - Express 4
  - pg for PostgreSQL
  - bcryptjs for password hashing
  - ws for WebSocket chat
  - multer for uploads
  - dotenv for environment loading
- Deployment/tooling:
  - Liara config in `liara.json`
  - Node 22 target
  - `tsx` for running TypeScript scripts

Frontend structure:

- `src/App.tsx` defines all routes.
- Protected routes wrap page components in `ProtectedLayout`.
- `ProtectedLayout` checks `currentUser` from Zustand and hydrates records from the backend.
- Internal shell uses `Sidebar`, `TopBar`, and `MobileBottomNav`.
- Most pages live directly in `src/app/`.
- UI primitives live in root `components/ui/`, imported via `@/components/ui/*`.

Backend structure:

- `server.js` builds the Express app, applies middleware, defines API routes, talks to Zarinpal, serves the Vite app, and upgrades `/ws/chat`.
- `src/server/document-storage.js` handles upload validation, filesystem persistence, download streaming, cleanup, and storage probing.
- `src/server/rate-limit.js` handles memory/PostgreSQL-backed throttling.
- `src/server/startup-checks.js` validates production environment and storage readiness.
- `src/server/db.js` owns almost all database operations and maps SQL rows into UI-shaped objects.
- `db/schema.sql` defines database tables and indexes.
- There is no ORM. SQL is written by hand.

Data flow:

- On login, `POST /api/auth/login` creates a session cookie.
- `GET /api/auth/me` restores the current user.
- Protected frontend layout calls `loadCurrentUserRecords()`.
- Some feature state still flows through Zustand and `/api/users/:userId/bootstrap` plus `/api/users/:userId/records`.
- Many newer features also use canonical APIs backed by SQL tables.
- This creates a hybrid state model:
  - Legacy/mock/store collections in `user_records`.
  - Canonical feature tables such as `customers`, `shipments`, `tasks`, `documents`, `change_logs`, etc.
  - SaaS tables such as `organizations`, `subscription_plans`, `billing_payments`, `billing_invoices`.

State management:

- Zustand store in `src/store/useAppStore.ts`.
- The store likely remains necessary for UI hydration, current user, theme, notifications, and legacy collections.
- Future work should either document this as intentional or gradually reduce reliance on legacy store persistence.

API/client/server boundaries:

- Public API routes:
  - `/api/plans`
  - `/api/signup`
  - `/api/billing/zarinpal/callback`
  - `/api/public/track/:token`
  - `/api/public/track/search`
  - `/api/public/track/:token/documents/:documentId`
  - `/api/public/documents/:id`
- Authenticated API routes:
  - Auth/profile
  - Customers
  - Users/roles
  - Admin/SaaS/billing
  - Quotations
  - Archive
  - Chat
  - Tasks
  - Shipment steps/tasks
  - Cheques
  - Compliance meetings
  - Dashboard
  - Documents
  - Customer access controls
  - Changes
- WebSocket:
  - `/ws/chat`
  - Frontend chat currently does not connect because chat is disabled.

Database/storage assumptions:

- PostgreSQL is required for real local development.
- Default local connection is `postgres://postgres@localhost:5432/logisticplus`.
- `scripts/seed-db.ts` can create the database from `POSTGRES_ADMIN_URL`, apply `db/schema.sql`, create one owner user, and seed legacy records.
- `scripts/bridge-canonical-db.ts` applies schema, seeds roles/permissions/plans/default organization, and copies legacy `user_records` into canonical tables.
- Document files are stored on disk under `storage/documents` unless `DOCUMENT_STORAGE_DIR` is configured.
- Binary file data is not stored in PostgreSQL.

Styling approach:

- Tailwind CSS 4 utility classes.
- RTL app shell with Persian labels.
- UI components from `components/ui`.
- Iconography through `lucide-react`.
- No separate design-token package was found.

Build/dev/test tooling:

- `npm run dev` runs `tsx server.js`.
- `npm run build` runs Vite production build.
- `npm run start` runs `node server.js`; production behavior depends on host/env `NODE_ENV=production`.
- `npm run lint` runs TypeScript with `--noEmit`.
- `npm run test:e2e:setup` resets/seeds the dedicated Playwright test database.
- `npm run test:e2e` runs the Playwright security regression suite.
- `npm run smoke:production-config` verifies production startup checks fail loudly when required Liara/Zarinpal settings are missing.

Important design patterns:

- Route-level lazy loading in `src/App.tsx`.
- Server-side helper functions in `src/server/db.js`.
- API response helpers with `createApiError`.
- Audit logging helper `auditLog`.
- Permission helper `requirePermission`.
- Document upload handling with `multer` inside `src/server/document-storage.js`.
- Hashed session tokens and hashed customer access tokens.
- Public tracking uses whitelisted response mapping rather than returning internal shipment rows.

Unclear or needs verification:

- Whether every protected endpoint has correct permission checks.
- Whether all mutations have audit logs.
- Whether the legacy store/canonical database bridge is intended to remain long-term.

## 6. Feature Inventory

| Feature | Status | Relevant Files | Notes |
|---|---|---|---|
| App shell and protected layout | Done | `src/App.tsx`, `src/components/layout/Navbar.tsx`, `src/components/layout/MobileBottomNav.tsx` | Protected layout requires current user and store hydration. Permission granularity in frontend needs review. |
| Login/session auth | Partial to Done | `server.js`, `src/server/db.js`, `src/app/LoginPage.tsx`, `db/schema.sql` | Password hashing and sessions exist. Password reset/2FA are optional in plan and not verified. |
| RBAC/permissions | Partial | `src/server/db.js`, `scripts/bridge-canonical-db.ts`, `db/schema.sql`, `src/app/UserManagement.tsx` | Permission keys and roles exist. Endpoint coverage needs audit. |
| User management | Partial to Done | `src/app/UserManagement.tsx`, `server.js`, `src/server/db.js` | Current route is `/management`. Needs verification for role/permission editing and self-suspension rules. |
| Change log/audit | Partial | `src/app/ChangeLog.tsx`, `server.js`, `src/server/db.js`, `db/schema.sql` | Current route is `/changelog`. Audit table and APIs exist. Coverage and filtering need tests. |
| Dashboard | Partial | `src/app/Dashboard.tsx`, `server.js`, `src/server/db.js` | Role-specific dashboard exists. Data freshness and role filtering need verification. |
| Customers | Partial to Done | `src/app/Customers.tsx`, `src/app/CustomerDetail.tsx`, `server.js`, `src/server/db.js` | List/detail/API exist. Duplicate warnings and full related sections need review. |
| Shipments list | Partial to Done | `src/app/Shipments.tsx`, `server.js`, `src/server/db.js` | Legacy `/track` shortcuts were removed. Search/filter/permissions need verification. |
| Shipment detail/workspace | Partial | `src/app/ShipmentDetail.tsx`, `src/app/ShipmentEdit.tsx`, `server.js`, `src/server/db.js` | Secure customer access controls exist. Canonical workflow schema differs from plan. |
| Secure customer tracking | Done to Partial | `src/app/PublicTrack.tsx`, `src/app/ShipmentDetail.tsx`, `server.js`, `src/server/db.js` | `/track/:token` and `/track/search` remain active with safe-field regression coverage and rate limiting. Future field changes should update tests. |
| Legacy protected tracking panel | Removed | `src/App.tsx`, deleted `src/app/Track.tsx`, nav files | Bare `/track` falls through to wildcard behavior. Public `/track/*` remains. |
| Documents | Partial to Done | `src/app/Documents.tsx`, `server.js`, `src/server/db.js`, `src/server/document-storage.js` | Upload/download/versioning exist. Validation, public filtering, and Liara-disk startup probing are implemented. S3/object storage is deferred. |
| Tasks | Partial to Done | `src/app/Tasks.tsx`, `server.js`, `src/server/db.js` | My/team task endpoints exist. Workflow and notification behavior need tests. |
| Chat | Planned / Disabled | `src/app/Chat.tsx`, `server.js`, `src/server/db.js` | UI route kept, blurred with coming-soon overlay. Chat side effects are guarded off. |
| Archive | Partial to Done | `src/app/Archive.tsx`, `server.js`, `src/server/db.js` | Archive/search/restore endpoints exist. Entity coverage needs verification. |
| Cheques | Partial to Done | `src/app/ChequeManagement.tsx`, `server.js`, `src/server/db.js` | Cheque CRUD/status/archive/due-soon APIs exist. Dashboard/task/document integrations need review. |
| Compliance meetings | Partial to Done | `src/app/Compliance.tsx`, `server.js`, `src/server/db.js` | Current route is `/compliance`. Required documents and outcome APIs exist. |
| Quotations/quotage | Partial to Done | `src/app/QuotageManagement.tsx`, `server.js`, `src/server/db.js` | Current route is `/quotage`. Status actions and convert-to-shipment exist. Naming should be decided. |
| Profile/settings | Partial to Done | `src/app/Profile.tsx`, `src/app/Settings.tsx`, `server.js`, `src/server/db.js` | Profile/password/security/notification endpoints exist. Needs UX and validation review. |
| SaaS signup/pricing | Partial to Done | `src/app/SaasSignup.tsx`, `server.js`, `src/server/db.js` | Plans, signup, pending status, billing callback routes exist. Real payment flow needs verification. |
| Platform admin panel | Partial to Done | `src/app/AdminPanel.tsx`, `server.js`, `src/server/db.js` | Organizations, subscriptions, payments, invoices, signup requests, error logs, manual signup. Platform admin access is email-gated in nav. |
| Manual admin company signup | Done | `src/app/AdminPanel.tsx`, `server.js`, `src/server/db.js` | Creates organization/user/subscription/signup record manually. |
| Error reporting/logs | Partial | `src/lib/errorReporting.ts`, `src/components/ClientErrorBoundary.tsx`, `server.js`, `src/app/AdminPanel.tsx` | Client errors can be reported and viewed/admin-resolved. Coverage and privacy need review. |
| Billing/invoicing | Partial | `src/app/AdminPanel.tsx`, `server.js`, `src/server/db.js`, `db/schema.sql` | Manual payment marking/invoices/renew/expire exist. Zarinpal production behavior needs verification. |
| Notifications/background jobs | Partial / Missing | `src/store/useAppStore.ts`, `db/schema.sql`, `src/App.tsx`, `src/server/db.js` | UI/store notifications exist. Real background scheduler not found. |
| Tests | Partial / Active | `package.json`, `playwright.config.ts`, `tests/e2e/security.spec.ts` | Playwright e2e security suite exists and currently covers 12 regression scenarios. Unit/API test frameworks are not added. |
| Documentation | Partial to Done | `README.md`, `.env.example`, `PROJECT_HANDOFF.md` | README/env cover local setup, Playwright, Liara launch, storage, rate limiting, and Zarinpal configuration. |
| Deployment | Partial to Done | `liara.json`, `package.json`, `server.js`, `src/server/startup-checks.js` | Liara config exists with production startup checks. Real deploy and live Zarinpal validation still require production credentials. |

## 7. Known Issues and Gaps

- Local folder is not a Git repository, so there is no commit history/status safety in this copy.
- Backend is large and monolithic:
  - `server.js` is about 126 KB.
  - `src/server/db.js` contains most data access and business logic.
- Hybrid state architecture:
  - Zustand store plus `user_records`.
  - Canonical PostgreSQL feature tables.
  - Legacy JSON fields.
  - This is workable but easy to regress.
- Plan/code route naming mismatches:
  - `/changes` vs `/changelog`
  - `/users` vs `/management`
  - `/compliance-meetings` vs `/compliance`
  - `/quotations` vs `/quotage`
- Chat is intentionally disabled, but backend code remains active. Keep UI guards until the feature is intentionally re-enabled.
- Public tracking must remain safe. Existing tests cover the current safe payload; update them before changing exposed fields.
- Full organization isolation is a major risk. Any query missing `organization_id` filtering could leak tenant data.
- Audit logging coverage is broad but not proven for every mutation.
- File upload security has strict validation and regression tests; re-audit when adding new file types or storage backends.
- `npm run clean` is Unix-specific and may fail in Windows PowerShell.
- No migration/versioning system exists for schema changes.
- No separate `.env.production` file is committed; production variables are documented in `.env.example` and `README.md`.

## 8. Recommended Next Moves

### Immediate Next Steps

| Task | What to do | Why it matters | Likely files/folders | Dependencies |
|---|---|---|---|---|
| Live document/tracking smoke | Log in as owner, upload/download a private document, create a customer/shipment/tracking token, expose one customer-visible document, verify public tracking, then archive the test records. | Authenticated route smoke is green, but document storage and tracking token behavior still need a post-cleanup production rehearsal. | Browser, Liara app, `server.js`, document storage disk | Owner session and cleanup after test. |
| Live Zarinpal validation | Run one controlled live merchant payment from signup through callback, invoice, receipt, and admin billing state. | Sandbox is covered; live payment behavior still requires real credentials and gateway validation. | `server.js`, `src/server/db.js`, `src/app/SaasSignup.tsx`, `src/app/AdminPanel.tsx` | Real merchant credentials and test payment plan. |
| Audit log coverage review | Verify every create/update/archive/status/assignment/upload action calls `auditLog` and add missing regression cases. | Audit trail is a non-negotiable planning requirement. | `server.js`, `src/server/db.js`, feature pages, `tests/e2e/` | Current Playwright harness. |
| Stabilize state model | Document which features still use Zustand/user_records vs canonical tables, then plan a safe migration path. | Hybrid state is now the main maintainability risk. | `src/store/useAppStore.ts`, `server.js`, `src/server/db.js`, feature pages | Product decision on migration scope. |

### Short-Term Tasks

| Task | What to do | Why it matters | Likely files/folders | Dependencies |
|---|---|---|---|---|
| Permission coverage review | Map every route/API endpoint to required permission keys and add missing guards. | RBAC is central to the product and plan. | `server.js`, `src/server/db.js`, `src/App.tsx`, nav components | Decide role behavior for SaaS platform admin. |
| Route naming decision | Decide whether to keep current paths or align with planning docs. | Reduces future confusion. | `src/App.tsx`, nav components, docs | Product owner decision. |

### Medium-Term Tasks

| Task | What to do | Why it matters | Likely files/folders | Dependencies |
|---|---|---|---|---|
| Introduce migrations | Replace direct schema reapplication with a migration workflow. | Safer production schema evolution. | `db/`, scripts, package scripts | Pick tool or simple SQL migration convention. |
| Split backend modules | Gradually extract route groups and data services from `server.js`/`db.js`. | Improves maintainability and testability. | `server.js`, `src/server/` | Tests first are strongly recommended. |
| Object storage adapter | Add S3-compatible storage only if Liara disk storage is no longer enough. | Optional future scale/durability path beyond the chosen Liara disk setup. | `src/server/document-storage.js`, `.env.example` | Choose provider. |
| Background jobs | Implement reminders for free-time, tasks, cheques, compliance meetings, and quotations. | Dashboard/notifications need real automation. | new server job module, `notifications`, dashboard APIs | Decide runtime/job scheduler. |
| Re-enable chat deliberately | When ready, remove `CHAT_DISABLED`, verify WebSocket/API behavior, unread counts, permissions, and mobile UX. | Chat is planned but currently postponed. | `src/app/Chat.tsx`, `server.js`, `src/server/db.js` | Product approval and tests. |
| Reports/export/global search | Add CSV/export and global search where needed. | Phase 6 polish from roadmap. | Feature pages, server APIs | Stable data model. |

### Cleanup / Refactor Tasks

| Task | What to do | Why it matters | Likely files/folders | Dependencies |
|---|---|---|---|---|
| Remove generated/log files from working copy | Keep `dist`, logs, and runtime uploads out of source handoff. | Reduces noise and accidental commits. | `dist/`, `server-dev.*.log`, `storage/` | Only after confirming files are not needed. |
| Make scripts cross-platform | Replace `rm -rf` and Unix env assignment issues with cross-platform scripts or docs. | Developer is on Windows. | `package.json`, README | Decide whether to add `rimraf` or use Node scripts. |
| Normalize status enums | Compare plan status values to code values and normalize mappings. | Avoids UI/API confusion. | `src/server/db.js`, `db/schema.sql`, feature pages | Requires migration/backfill plan. |
| Document SaaS/admin model | Add docs for organization lifecycle, subscription states, billing states, platform admin access. | This layer is important but not fully covered by planning pack. | README or new docs file | Product decisions. |
| Review Persian text encoding | Ensure files are UTF-8 and terminal/scripts do not corrupt Persian text. | Avoids future mojibake and data corruption. | source files, scripts, terminal config | Use editor/PowerShell UTF-8 settings. |

## 9. Suggested Next Prompt for a New Conversation

Copy/paste this into a new Codex or ChatGPT coding session:

```text
We are continuing the Logistic Plus project in C:\Users\Ahmadreza\Documents\logisticplus.

First, read PROJECT_HANDOFF.md in the repository root. Also note that the external planning pack is at C:\Users\Ahmadreza\Documents\New project\logistic-plus-codex-plan.

Use the current repository stack as source of truth: Vite React TypeScript frontend, Express backend in server.js, PostgreSQL/raw pg data layer in src/server/db.js, schema in db/schema.sql. Do not migrate to Next.js or Prisma unless I explicitly ask.

Important current state:
- Official user-facing product name is Logistic Plus / لجستیک پلاس only. Legacy seed/test email domains may remain in mock data.
- Chat must stay temporarily disabled: keep /chat visible, blurred, coming soon, and no chat API/WebSocket side effects.
- The old protected panel /track page was removed. Keep public secure tracking active at /track/:token and /track/search.
- Admin manual company signup was added in the admin panel.
- Public customer tracking must never expose internal data.
- Playwright e2e security regression tests exist and should be run before/after high-risk changes.
- Liara production hardening is implemented: document storage uses a Liara disk path, production rate limiting can use PostgreSQL, and startup checks validate required production env vars.
- Liara production is live at https://logisticplus.liara.run and health/db-health were verified after the latest deploy and cleanup.
- Guided empty states are implemented for clean protected-app pages.
- Customer creation now captures phone/address/notes, and customer archive/delete uses an async confirmation flow.
- The live Liara database was backed up and cleaned. Operational/test tables are empty; owner/org/subscription scaffolding is preserved.
- The production owner password was reset at the user's request, and authenticated smoke for dashboard/customers/shipments/documents/tasks/admin passed.
- The login page no longer pre-fills or renders the internal admin email.

Please start with the current Recommended Next Moves from PROJECT_HANDOFF.md. The highest-value next lanes are live document/tracking smoke, live Zarinpal validation, audit-log coverage, or hybrid state stabilization.

As you work, preserve existing user changes, keep edits scoped, and run npm run lint/build/test:e2e when relevant.
```

## 10. Open Questions

Product decisions:

- Should route names stay as implemented, or should they align with the planning docs?
  - `/changelog` vs `/changes`
  - `/management` vs `/users`
  - `/compliance` vs `/compliance-meetings`
  - `/quotage` vs `/quotations`
- Should chat remain disabled for the next release, or is there a target version for re-enabling it?
- Should the public `/track/search` flow require email, phone, or another verification field?
- Should archived shipments remain visible through public tracking links?
- Should platform admin access be controlled only by email, or by a dedicated permission/role?

Technical architecture:

- Is the hybrid Zustand `user_records` plus canonical table model temporary or intentional?
- Should shipment steps and team members be moved into canonical tables matching the plan?
- Should the backend be split into route/service modules now, or only after tests are added?
- Should a migration tool be introduced, or should the project keep raw SQL schema files?

UX/UI choices:

- Should internal UI remain Persian/RTL only, or support bilingual Persian/English?
- Should "Quotage" remain the UI label, or should it become "Quotation Management" as the plan recommends?
- Should disabled chat show only "Coming soon" or include a target release message?

Data model:

- What are the final allowed shipment statuses and task statuses?
- What document types should be allowed for upload?
- What fields are safe for customer-facing public tracking?
- What is the retention policy for audit logs and archived records?

Deployment:

- `APP_PUBLIC_URL` for the current production app is `https://logisticplus.liara.run`.
- Liara production app in use is `logisticplus`; staging app tooling targets `logisticplus-staging`.
- What live Zarinpal merchant credential should be used for the controlled validation?

Testing:

- Which workflows must be covered before the next release?
- Should unit/API tests be added in addition to the existing Playwright e2e harness?

Prioritization:

- Is the next priority product hardening, SaaS billing/admin, customer tracking, or re-enabling chat?
- Should documentation/setup be completed before new features?

## 11. Development Commands

Commands inferred from `package.json` and scripts:

| Purpose | Command | Status / Notes |
|---|---|---|
| Install dependencies | `npm install` | Verified by presence of `node_modules`; rerun on a fresh checkout. |
| Run dev server | `npm run dev` | Runs `tsx server.js` on port 3000. Requires PostgreSQL for full app behavior. |
| Build production frontend | `npm run build` | Runs `vite build`. Reported passing in this conversation after latest code changes. |
| Start production server | `npm run start` | Runs `node server.js`; set `NODE_ENV=production` in the host environment for production static serving/startup checks. |
| Preview Vite build only | `npm run preview` | Vite preview. May not represent full Express API behavior. |
| Type check/lint | `npm run lint` | Runs `tsc --noEmit`. Reported passing in this conversation after latest code changes. |
| Seed database | `npm run db:seed` | Applies schema, creates DB if needed, seeds owner user and legacy records. Needs PostgreSQL and env values. |
| Bridge canonical DB | `npm run db:bridge` | Applies schema, seeds roles/permissions/plans/default organization, bridges legacy records into canonical tables. |
| Clean build output | `npm run clean` | Uses `rm -rf dist`; needs verification on Windows PowerShell. |
| Deploy | `npm run deploy` | Runs `liara deploy`; needs Liara CLI auth and env config. |
| Prepare e2e DB | `npm run test:e2e:setup` | Resets only `TEST_DATABASE_URL` databases whose name includes `test`, then seeds/bridges. |
| Run e2e tests | `npm run test:e2e` | Runs the Playwright security regression suite. Latest run passed 12/12. |
| Production config smoke | `npm run smoke:production-config` | Confirms missing production Liara/Zarinpal settings fail loudly at startup. |

Suggested local setup sequence:

```powershell
npm install
copy .env.example .env
# Edit .env with local PostgreSQL values.
npm run db:seed
npm run db:bridge
npm run dev
```

Default seed login, if `SEED_USER_PASSWORD` is not set:

- Email: `darksudo22@gmail.com`
- Password: `57603314`

Use a different password through `SEED_USER_PASSWORD` for any real environment.

## 12. Environment Variables and Configuration

| Variable | Used In | Required? | Purpose / Notes |
|---|---|---|---|
| `DATABASE_URL` | `src/server/db.js`, `scripts/seed-db.ts`, `scripts/bridge-canonical-db.ts` | Required for real app | PostgreSQL connection string. Defaults to `postgres://postgres@localhost:5432/logisticplus` if unset. |
| `POSTGRES_ADMIN_URL` | `scripts/seed-db.ts` | Required for auto-create DB | Maintenance DB connection used to create the target DB. Defaults to `postgres://postgres@localhost:5432/postgres`. |
| `SEED_USER_PASSWORD` | `scripts/seed-db.ts` | Optional but recommended | Password for seeded owner user. Defaults to `57603314`, which should not be used in production. |
| `SEED_USER_ID` | `scripts/bridge-canonical-db.ts` | Optional | Owner user id for bridge. Defaults to `u1`. |
| `SEED_ORGANIZATION_ID` | `scripts/bridge-canonical-db.ts` | Optional | Default organization id for bridge. Defaults to `org-logisticplus-default`. |
| `DOCUMENT_STORAGE_DIR` | `server.js` | Optional | Local storage directory for uploaded documents. Defaults to `storage/documents`. |
| `DOCUMENT_MAX_BYTES` | `server.js` | Optional | Maximum upload size. Defaults to `25 * 1024 * 1024`. |
| `NODE_ENV` | `server.js`, `package.json` | Required for production behavior | Controls secure cookie flag and production static serving. |
| `APP_PUBLIC_URL` | `server.js` | Recommended in production | Public base URL for generated links/callbacks. Falls back to request protocol/host. |
| `ZARINPAL_SANDBOX` | `server.js` | Optional | Zarinpal mode. Defaults to sandbox behavior unless set to `false`. |
| `ZARINPAL_MERCHANT_ID` | `server.js` | Required for real Zarinpal payments | Merchant ID for payment requests/verification. If absent, payment behavior needs verification. |
| `ZARINPAL_TIMEOUT_MS` | `server.js` | Optional | Timeout for Zarinpal request/verify calls. Defaults to `10000`. |
| `RATE_LIMIT_STORE` | `src/server/rate-limit.js` | Optional | `memory` or `postgres`. Defaults to `postgres` in production and `memory` in development. |
| `TRUST_PROXY` | `src/server/startup-checks.js`, `server.js` | Optional | Trust reverse proxy IPs. Defaults to true in production. |
| `DISABLE_HMR` | `vite.config.ts` | Optional | If set to `true`, disables Vite HMR. |
| `PORT` | `server.js`, `playwright.config.ts` | Optional | HTTP port. Defaults to `3000`; Playwright uses `TEST_PORT`/`PORT`. |

Current `.env.example` covers local setup, seed, document storage, public URL, Zarinpal, HMR, PostgreSQL-backed rate limiting, trust proxy, Playwright, and Liara production settings.

Do not commit real secrets.

## 13. Testing Status

Current test framework:

- Playwright e2e security regression suite in `tests/e2e/security.spec.ts`.
- `playwright.config.ts` runs the app on isolated `TEST_PORT` with `TEST_DATABASE_URL`, isolated document storage, and `RATE_LIMIT_STORE=postgres`.
- `scripts/reset-test-db.ts` resets and seeds only databases whose name includes `test`.

Existing verification commands:

- `npm run lint` uses TypeScript `--noEmit`.
- `npm run build` uses Vite build.
- `npm run test:e2e:setup` prepares the Playwright database/storage.
- `npm run test:e2e` runs the current e2e suite.
- `npm run smoke:production-config` checks production startup validation.
- All of the above were reported as passing after the clean launch/customer CRUD polish pass. Current full Playwright status is 26/26 passing.

Browser smoke checks performed across recent passes:

- `/chat` shows current chat layout blurred with a centered coming-soon overlay.
- Chat inputs/buttons cannot be used while disabled.
- Chat API/WebSocket side effects are guarded off by `CHAT_DISABLED`.
- Sidebar still shows Chat.
- Sidebar no longer shows panel Tracking.
- `/track` falls through instead of rendering old protected tracker.
- `/track/search` renders.
- `/track/<invalid-token>` renders a safe unavailable state.
- Shipment detail still has secure customer link and QR controls.

Recommended tests to add next:

| Priority | Test Area | Why |
|---|---|---|
| 1 | Audit logging tests for representative mutations | Ensures compliance with planning requirements. |
| 1 | More route/permission matrix cases | Broadens the existing RBAC policy harness. |
| 1 | Live Zarinpal manual validation checklist | Covers real gateway behavior without committing secrets. |
| 2 | Browser smoke tests for core pages | Catches routing/layout regressions beyond the current security harness. |
| 2 | Chat disabled regression test | Ensures no chat fetch/WebSocket side effects while disabled. |
| 3 | Unit/API tests for data helpers | Adds faster coverage beyond Playwright. |

Potential test stack:

- Vitest for utility/data-layer tests.
- Supertest or fetch-based integration tests for Express APIs.
- Playwright for browser flows.

Playwright is already installed. Vitest/Supertest remain optional if faster unit/API coverage is desired.

## 14. Final Summary

The project is a fairly complete logistics operations web app with a newer SaaS/admin layer. Most planned pages and APIs exist, and the latest requested product changes are in place: clean empty states, customer contact capture, async customer archive/delete confirmation, temporarily disabled chat, removed legacy protected panel tracking, secure public tracking, and admin manual company signup.

The biggest risk is not missing UI. The biggest remaining risk is unverified correctness in areas not fully covered by the current Playwright harness: audit logging completeness, hybrid legacy/canonical state, migrations, background jobs, production data hygiene, and live payment behavior.

The best next action is to finish the production launch-readiness lane: deploy the current patch, back up and clean the Liara database, run live post-cleanup smoke, then move to live Zarinpal validation or audit/state hardening.
