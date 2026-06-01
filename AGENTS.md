# Logistic Plus Codex Guidance

## Product Safety

- Preserve every existing feature, route, UI page, Persian/RTL behavior, public tracking flow, billing/Zarinpal flow, SMS flow, document path, workflow, archive path, and data path unless the user explicitly asks for a targeted change.
- Never remove business behavior as a refactor shortcut. If a change is risky or ambiguous, add a TODO and documentation instead of breaking behavior.
- Never delete migrations, schema history, or business records. Avoid hard deletes except through explicit archive permanent-delete flows that already exist.
- Do not add destructive migrations or data cleanup scripts without an explicit user request, a backup plan, and a rollback plan.
- Prefer SQL migrations in `db/migrations/` over direct-only edits to `db/schema.sql`; keep `db/schema.sql` as the current schema snapshot.
- Do not change production environment behavior unless explicitly requested. Production rate limiting must use `RATE_LIMIT_STORE=postgres`; do not allow production to fall back to in-memory counters.
- Do not remove `user_records` or `/api/users/:id/bootstrap` until the compatibility bridge is intentionally retired.

## Tenant And Security Rules

- Never trust client-supplied `organizationId` for normal protected tenant scope. Derive tenant scope from the authenticated session user; platform-admin organization targeting is the explicit exception.
- Every protected tenant-owned read and write must include `organization_id` or an explicit equivalent scope enforced server-side.
- Public tracking responses must be built from allowlisted DTOs only. Never return internal shipment, customer, user, organization, audit, task, cheque, compliance, billing, token, hash, raw legacy, or storage fields.
- Document downloads must stream by server-side lookup only and must never expose `storage_key`, filesystem paths, or generated storage filenames in JSON responses or public URLs.
- Keep auth/session tokens, password hashes, SMS codes, payment authorities, merchant secrets, customer tracking tokens, and token hashes out of logs and API responses.
- Treat source-table `archived_at` as canonical archive state; keep `archive_records` as the archive/search projection in the same transaction when both are touched.

## Refactor Boundaries

- Keep `server.js` as the composition root when extracting route groups; route modules should receive dependencies explicitly and preserve existing paths and response shapes.
- Keep changes narrow. Avoid broad rewrites of `server.js`, `src/server/db.js`, or `src/store/useMockStore.ts` in one patch.
- Do not rename major files, route paths, database tables, migrations, or public API shapes during safety or refactor work unless explicitly requested.
- Use existing raw `pg` patterns, Zod request schemas, tenant-scope helpers, transaction helper, and route-module style before introducing new abstractions.

## Verification

- Add or update focused tests for security-sensitive changes, especially auth, tenant isolation, public tracking, document download/upload, billing, archive, workflow, and permissions.
- Before finishing high-risk changes, run `npm run lint`, `npm run build`, and the relevant Playwright tests. If a command cannot run, report the exact reason.
- Run `npm run safety:check` when touching guardrails, routing, data access, public DTOs, documents, billing, archive, or tenant scope.
