# Phase 2 Auth And Platform Admin Hardening Report

## Scope

Phase 2 hardened the existing Express/React/PostgreSQL auth, session, SMS login, and platform-admin authorization paths without replacing the app architecture or removing existing features.

No routes, public tracking flow, billing/Zarinpal flow, SMS provider flow, Persian/RTL UI behavior, workflow, archive behavior, migrations, schema history, or business data were removed.

## Files Inspected

- Auth/session and admin composition: `server.js`.
- Auth/session data access: `src/server/db.js`.
- Tenant guard helpers: `src/server/tenant-context.js`, `src/server/tenant-scope.js`.
- Platform-admin user route module: `src/server/routes/user-routes.js`.
- SMS provider/worker: `src/server/sms-provider.js`, `src/server/sms-worker.js`.
- Schema and migrations: `db/schema.sql`, `db/migrations/*`.
- Seed/bridge scripts: `scripts/seed-db.ts`, `scripts/bridge-canonical-db.ts`, `scripts/seed-demo-company.ts`, `scripts/reset-test-db.ts`.
- Frontend session/nav state: `src/store/useMockStore.ts`, `src/components/layout/Navbar.tsx`, `src/types/index.ts`.
- Auth/security tests: `tests/e2e/security.spec.ts`, `tests/e2e/helpers.ts`, `tests/e2e/rbac-policy.ts`, `tests/e2e/tenant-isolation-phase1.spec.ts`.

## Hardcoded Admin Checks

Found hardcoded platform-owner authorization behavior in:

- `src/server/db.js`: `getUserPermissions` added `platform.admin` when `userId === "u1"` or email was the owner email.
- `server.js`: subscription-inactive checks bypassed the owner email during password/SMS login and session restore.
- `src/components/layout/Navbar.tsx`: the platform-admin nav item was shown only to the owner email.

Removed as authorization source of truth:

- `getUserPermissions` now reads role permissions plus explicit `user_permissions` grants.
- `server.js` now uses explicit `platform.admin` permission for platform-admin checks and subscription bypass decisions.
- `Navbar.tsx` now shows the platform admin item from `currentUser.permissions.includes("platform.admin")`.

Remaining owner email references are identity/seed/test references, not live authorization checks. The migration uses the existing owner id/email once to seed the explicit grant.

## Platform Admin Guard

`requirePlatformAdmin` remains the platform API boundary and now calls `assertPlatformPermission(user, "platform.admin")`.

The guard behavior is:

- Requires an authenticated session through `requireAuthenticatedUser`.
- Loads database-backed permissions.
- Requires explicit `platform.admin`.
- Fails closed with `403 FORBIDDEN`.
- Does not treat tenant roles such as `CEO`, `MANAGER`, or owner membership as platform-admin access.

## Migration And Seed

Added additive migration:

- `db/migrations/20260601080000_phase_2_auth_platform_admin_hardening.sql`

It:

- Adds `app_sessions.revoked_at`.
- Creates `user_permissions`.
- Adds supporting indexes.
- Inserts `platform.admin` if missing.
- Grants `platform.admin` to the existing owner account as an explicit user permission.

Updated seed/bridge:

- `scripts/seed-db.ts` seeds `platform.admin` and grants it to `u1`.
- `scripts/bridge-canonical-db.ts` preserves/grants the owner platform permission during bridge setup.
- `scripts/seed-demo-company.ts` checks demo users do not receive `platform.admin` through role or explicit user grants.

## Session Cookies

Before:

- `HttpOnly`
- `SameSite=Lax`
- `Path=/`
- `Secure` only in production
- `Expires` only for remember-me sessions
- No `Max-Age`

After:

- `HttpOnly`
- `SameSite=Lax`
- `Path=/`
- `Secure` in production
- `Max-Age` based on the server-side session expiry
- `Expires` retained only for remember-me sessions
- Clear cookie includes `Max-Age=0` and an expired `Expires`

## Session Restore And Logout

- Session tokens continue to be stored only as SHA-256 hashes in `app_sessions.token_hash`.
- `getSessionByToken` rejects expired and revoked sessions.
- Logout now sets `revoked_at` for the current session server-side and clears the browser cookie.
- Failed restore continues to return a generic unauthenticated response.
- Raw session tokens are not logged.

## Password Hashing

Current state:

- The app uses `bcryptjs`.
- Existing login, signup, manual signup, user creation, and password reset paths continue to use bcrypt hashes.

Decision:

- Argon2id was not added in Phase 2 because it adds a new native dependency and rollout risk on the current deployment path.
- A code TODO was added at password verification for a future Argon2id verify-and-rehash migration.

Recommended safe migration design:

- Add nullable `password_hash_algorithm` and `password_hash_version` columns, or encode algorithm metadata in a single structured hash metadata column.
- Treat missing metadata as legacy bcrypt.
- On successful bcrypt login, rehash to Argon2id and update metadata in the same transaction as login bookkeeping.
- Keep bcrypt verification until all active accounts have migrated.
- Add rollback guidance before production migration.

## SMS Login

Findings and changes:

- SMS codes are hashed with a per-challenge salt in `login_sms_challenges`.
- New requests consume previous unconsumed challenges for the same user/phone.
- Verification rejects expired, consumed, and over-attempted challenges.
- Unknown phone request responses are now generic and do not report `codeSent: false`.
- Delivery logs for auth OTP use a generic message, not the OTP body.
- Stored provider responses are sanitized to drop body/code/message/text-style fields.
- Non-production dry-run still returns `debugCode` for existing tests.

Remaining SMS risk:

- Rate limiting exists for phone request, cooldown, IP, and verify paths, but Phase 7 should review production thresholds and alerting.

## Tests Added Or Updated

- `tests/e2e/security.spec.ts`
  - Verifies unauthenticated users cannot access platform admin APIs.
  - Verifies normal tenant users cannot access platform admin APIs.
  - Verifies tenant CEOs do not get platform admin access unless explicitly granted.
  - Verifies explicit `platform.admin` grants allow platform admin access.
  - Verifies the old owner account works because `user_permissions` contains an explicit grant.
  - Verifies bcrypt seed hash compatibility.
  - Verifies invalid login returns a generic error.
  - Verifies logout invalidates the current session.
  - Verifies expired and revoked sessions cannot restore.
  - Verifies session cookie flags include `HttpOnly`, `SameSite=Lax`, `Path=/`, and `Max-Age`.
  - Keeps existing dry-run SMS login coverage.

## Commands Run

- `npm run safety:check`
  - Passed.
  - Reported existing review warnings for destructive/seed utilities: `scripts/clean-liara-production-data.mjs`, `scripts/qa-cleanup-prod.ts`, `scripts/qa-seed-heavy.ts`, `scripts/seed-demo-company.ts`.
- `npm run lint`
  - Passed (`tsc --noEmit`).
- `npm run build`
  - Passed.
  - Vite reported the existing large chunk warning for the main bundle.
- `npm run test:e2e:setup`
  - Passed.
  - Reset `logisticplus_test`, seeded owner data, and bridged canonical tables.
- `npx playwright test tests/e2e/security.spec.ts`
  - Passed: 15/15 tests.
- `npm run db:migrate` with `DATABASE_URL=postgres://postgres@localhost:5432/logisticplus_test`
  - Passed.
  - Applied 5 pending migrations on the reset test database, including `20260601080000_phase_2_auth_platform_admin_hardening.sql`.

## Remaining Risks

- Argon2id migration is designed but not implemented.
- Existing `password_hash` values do not yet carry algorithm metadata.
- Platform-admin grant management is currently database/seed driven; an audited UI/API for granting platform permissions should be designed before broad operational use.
- SMS production rate limits and abuse monitoring should be revisited in Phase 7.

## Phase 3 Recommendation

Implement password-hash modernization and security metadata:

- Add non-destructive password hash metadata.
- Add Argon2id dependency only after deployment compatibility is verified.
- Support bcrypt verification and opportunistic Argon2id rehash on successful login.
- Add admin/session audit views for active and revoked sessions.
- Add an audited platform-permission management workflow rather than direct database grants.
