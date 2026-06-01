# Build Roadmap For Codex

## Roadmap Rules

- Build in a fresh repository or separate new project folder.
- Do not modify the current production app during the rebuild.
- Keep the old app running until production cutover.
- Use the current app as source of truth for behavior and feature parity.
- Build tests with each phase.
- Keep tenant isolation and public DTO safety as non-negotiable requirements.

## Phase 1: Fresh Repo Setup

### Goals

- Create the new project foundation.
- Establish monorepo or separate frontend/backend decision.
- Add Docker local dependencies.
- Bootstrap basic frontend/backend apps.

### Tasks

- Create a new repo or new project folder.
- Use pnpm workspace or npm workspaces.
- Create `apps/web` with Next.js, TypeScript, Tailwind, shadcn/ui.
- Create `apps/api` with NestJS, TypeScript.
- Add shared package for types/schemas if useful.
- Add Docker Compose for PostgreSQL, Redis, MinIO, Mailhog.
- Add env templates.
- Add lint/typecheck/test/build scripts.
- Add base CI pipeline.
- Add health endpoints.
- Add structured logging.

### Files To Create

```text
package.json
pnpm-workspace.yaml
docker-compose.yml
.env.example
apps/web/
apps/api/
packages/shared/
apps/api/src/main.ts
apps/api/src/app.module.ts
apps/api/src/modules/health/
apps/web/app/(public)/page.tsx
apps/web/app/(auth)/login/page.tsx
apps/web/app/(app)/layout.tsx
```

### Acceptance Criteria

- `pnpm install` works.
- `docker compose up` starts dependencies.
- API health endpoint returns ok.
- Web app renders public home and login page.
- CI runs typecheck/build/test placeholders.
- No old app code is modified.

### Risks

- Overbuilding monorepo tooling.
- Losing time on deployment before domain foundation exists.

### Notes For AI Coding Agents

- Keep setup minimal and boring.
- Do not introduce microservices.
- Use exact package versions intentionally.
- Commit frequently if working in a new repo.

## Phase 2: Database, Auth, RBAC, Multi-Tenancy

### Goals

- Build the secure foundation before product modules.
- Define database schema and migrations.
- Implement authentication, refresh tokens, RBAC, tenant context.

### Tasks

- Add Drizzle ORM and migrations.
- Create identity/tenancy/RBAC tables.
- Seed permissions, roles, plans, workflow template.
- Implement password login.
- Implement refresh token rotation.
- Implement current user endpoint.
- Implement tenant guard.
- Implement permission guard.
- Implement organization memberships.
- Implement user management basics.
- Add audit log module.
- Add rate limiting.

### Files To Create

```text
apps/api/src/database/schema/users.ts
apps/api/src/database/schema/organizations.ts
apps/api/src/database/schema/rbac.ts
apps/api/src/database/schema/audit.ts
apps/api/src/modules/auth/
apps/api/src/modules/tenancy/
apps/api/src/modules/rbac/
apps/api/src/modules/users/
apps/api/src/modules/organizations/
apps/api/src/modules/audit/
apps/api/src/common/guards/
apps/web/features/auth/
apps/web/features/users/
```

### Acceptance Criteria

- User can log in and refresh token.
- Suspended user cannot log in.
- Authenticated user can load active tenant and permissions.
- Tenant guard fails closed.
- Permission guard blocks unauthorized route.
- User management CRUD works for CEO/platform admin rules.
- Unit/integration tests cover auth, tenant, RBAC.

### Risks

- Recreating current hardcoded admin email. Avoid this.
- Allowing client-supplied organization id to control tenant scope.
- Skipping refresh token reuse detection.

### Notes For AI Coding Agents

- Every protected service method should accept tenant context explicitly.
- Add tests before implementing broad product modules.
- Use Argon2id for new passwords; decide bcrypt migration later.

## Phase 3: Core LogisticPlus Modules

### Goals

- Build core operational feature parity.
- Replace `user_records` with canonical APIs.
- Make the protected app usable for daily logistics work.

### Tasks

- Build customers module.
- Build shipments module.
- Build workflow module with `IR_IMPORT_CUSTOMS_V1`.
- Build tasks module.
- Build documents module with object storage.
- Build public tracking module.
- Build dashboard.
- Build search.
- Build archive.
- Build audit/changelog UI.
- Build protected frontend routes and layouts.

### Files To Create

```text
apps/api/src/modules/customers/
apps/api/src/modules/shipments/
apps/api/src/modules/workflow/
apps/api/src/modules/tasks/
apps/api/src/modules/documents/
apps/api/src/modules/tracking/
apps/api/src/modules/search/
apps/api/src/modules/archive/
apps/api/src/modules/reports/
apps/web/features/customers/
apps/web/features/shipments/
apps/web/features/workflow/
apps/web/features/tasks/
apps/web/features/documents/
apps/web/features/tracking/
apps/web/features/search/
apps/web/features/archive/
```

### Acceptance Criteria

- Customer CRUD works and is tenant-scoped.
- Shipment CRUD/status/archive works and is tenant-scoped.
- Workflow start/update/blocker/resolve works.
- Workflow updates can create and update tasks.
- Document upload/download/replace/visibility/archive works with object storage.
- Public tracking token and search work.
- Public tracking API has leak tests.
- Archive/restore keeps source row and projection consistent.
- Global search is permission-aware.
- Dashboard loads with real module APIs.

### Risks

- Public tracking accidentally exposes internal fields.
- Document storage keys leak to clients.
- Workflow logic becomes hardcoded instead of template-versioned.
- Archive projection drifts from source table.

### Notes For AI Coding Agents

- Do not copy UI-shaped legacy records.
- Write public DTO mappers as separate functions with tests.
- Preserve current feature behavior first, improve UX second.

## Phase 4: Notifications, Reports, Documents, Jobs

### Goals

- Add asynchronous infrastructure and operational polish.
- Complete admin-operational workflows.
- Prepare for real usage volume.

### Tasks

- Add BullMQ queues.
- Add worker process.
- Add notifications module.
- Add SMS module with provider abstraction and templates.
- Add compliance meetings.
- Add cheques.
- Add quotations and convert-to-shipment.
- Add billing/subscriptions.
- Add platform admin console.
- Add reports/export foundations.
- Add error reporting.

### Files To Create

```text
apps/api/src/workers/
apps/api/src/modules/notifications/
apps/api/src/modules/sms/
apps/api/src/modules/compliance/
apps/api/src/modules/cheques/
apps/api/src/modules/quotations/
apps/api/src/modules/billing/
apps/api/src/modules/platform-admin/
apps/api/src/modules/error-log/
apps/web/features/notifications/
apps/web/features/compliance/
apps/web/features/cheques/
apps/web/features/quotations/
apps/web/features/billing/
apps/web/features/platform-admin/
```

### Acceptance Criteria

- In-app notifications can be created/read.
- SMS deliveries queue and process in worker.
- SMS templates are admin-editable.
- Compliance meetings and required documents work.
- Cheques due-soon and status/archive work.
- Quotations can be accepted/rejected/expired and converted to shipment.
- Zarinpal payment start/callback is idempotent.
- Platform admin can manage orgs, signups, billing, SMS, errors.
- Worker failures are observable.

### Risks

- Worker jobs not idempotent.
- Payment callback repeated side effects.
- SMS costs from unsafe live testing.

### Notes For AI Coding Agents

- Keep worker and API as separate entrypoints.
- Use idempotency keys for SMS/payment jobs.
- Keep live SMS/payment guarded by env flags.

## Phase 5: Testing, Hardening, Deployment, Migration, Cutover

### Goals

- Prove the new app is safe to launch.
- Migrate data.
- Deploy without stopping old app until cutover.

### Tasks

- Expand unit/integration/API tests.
- Recreate Playwright parity suite.
- Add security tests.
- Add tenant isolation tests.
- Add load tests for critical endpoints.
- Build migration scripts.
- Run migration dry-runs.
- Add staging deployment.
- Run staging smoke.
- Prepare production deployment.
- Execute final migration and cutover.

### Files To Create

```text
apps/api/test/
apps/web/tests/
tests/e2e/
tools/migration/
tools/load/
.github/workflows/ci.yml
.github/workflows/deploy-staging.yml
docs/runbooks/
docs/cutover.md
```

### Acceptance Criteria

- Feature parity checklist is complete for must-have items.
- Tenant isolation tests pass.
- Public tracking leak tests pass.
- Migration dry-run passes on production backup.
- Document migration checksums pass.
- Staging smoke passes.
- Production rollback plan is rehearsed.
- Old app remains available until final switch.

### Risks

- Data migration edge cases from legacy `user_records`.
- Missing document files.
- Encoding issues in Persian text.
- Incomplete billing/payment state mapping.
- Users writing to old app during final migration.

### Notes For AI Coding Agents

- Treat migration as a product feature, not a one-off script.
- Generate migration reports.
- Never cut over without rollback.
- Keep old app untouched except emergency fixes.

## Cross-Phase Acceptance Gates

- No tenant-owned query without tenant context.
- No public DTO from raw database row.
- No plaintext tracking token storage.
- No production memory rate limits.
- No local disk production documents.
- No hardcoded platform admin email.
- No feature considered done without tests for happy path and forbidden path.

## Decision Needed

- Decide when the rebuild becomes a separate production candidate. Recommendation: after Phase 3 must-have workflows pass E2E in staging.
- Decide whether to create a compatibility API layer for old routes. Recommendation: avoid unless old clients depend on them outside the current web app.

