# Backend Module Restructure Plan

This plan moves LogisticPlus from the current centralized backend shape into a feature/module-oriented backend, while keeping production startup, migrations, tenant isolation, and existing routes safe during the transition.

The desired end state is a backend organized around business capabilities:

```txt
server/
  src/
    app.*
    server.*
    config/
    db/
    routes/
      v1/
    modules/
    shared/
```

The main goal is readability: when working on shipments, customers, documents, billing, or daily kootaj, the related routes, controllers, services, repositories, validation, and mapping should live together.

## Ground Rules

- Do not rewrite the whole backend in one pass.
- Keep `npm start` and Liara startup working after every phase.
- Keep existing database migration commands stable until the backend shell is complete.
- Keep tenant scope server-side. Never trust client-supplied `organizationId`.
- Do not move production data or change schema unless a phase explicitly needs a migration.
- Prefer module folders by business function/use-case, not one folder for every tiny helper function.
- Keep small private helper functions inside the closest file unless they become shared by multiple use-cases.
- Add compatibility exports when moving code so older imports keep working until cleanup.
- Each phase must run checks before it is considered done.

## File Extension Strategy

The repo currently starts production with:

```txt
npm start -> node server.js
```

Because Node does not run `.ts` files directly without a server build/runtime change, the first migration steps should use the new folder structure with runtime-safe `.js` files, or keep `server.js` as a bridge.

The desired `.ts` naming can be completed in the final cleanup phase after one of these is added:

- a real server build step, or
- a production-safe runtime command that supports TypeScript.

Until then, the structure matters more than the extension.

## Target Module Pattern

Each module should follow this dependency direction:

```txt
routes -> controller -> service -> repository -> db
```

Typical module:

```txt
server/src/modules/customers/
  customer.routes.*
  customer.controller.*
  customer.service.*
  customer.repository.*
  customer.validation.*
  customer.mapper.*
```

For large modules, split by sub-capability:

```txt
server/src/modules/shipments/
  shipment.routes.*
  shipment.controller.*

  list-shipments/
    list-shipments.service.*
    list-shipments.repository.*
    list-shipments.mapper.*
    list-shipments.validation.*

  get-shipment/
    get-shipment.service.*
    get-shipment.repository.*
    get-shipment.mapper.*

  create-shipment/
    create-shipment.service.*
    create-shipment.repository.*
    create-shipment.validation.*

  update-basic-info/
    update-basic-info.service.*
    update-basic-info.repository.*
    update-basic-info.validation.*

  update-operational-fields/
    update-operational-fields.service.*
    update-operational-fields.repository.*
    update-operational-fields.validation.*

  status/
    shipment-status.constants.*
    shipment-status.service.*
    shipment-status.mapper.*

  kootaj/
    shipment-kootaj.service.*
    shipment-kootaj.repository.*
    shipment-kootaj.mapper.*

  containers/
    shipment-container.service.*
    shipment-container.repository.*

  tracking/
    shipment-tracking.service.*
    shipment-tracking.repository.*
    shipment-tracking.mapper.*
```

## Phase 1 - Scaffold The New Backend Shell

Command phrase: `go phase 1`

Goal: create the new backend folder structure without changing runtime behavior.

Scope:

- Add `server/src/` folders:
  - `config/`
  - `db/`
  - `routes/v1/`
  - `modules/`
  - `shared/middleware/`
  - `shared/errors/`
  - `shared/utils/`
  - `shared/types/`
- Add initial placeholder/index files where useful.
- Add compatibility wrappers for:
  - database pool
  - transactions
  - tenant scope
  - validation
  - API errors
- Do not move route ownership yet.
- Do not modify migrations.
- Do not change Liara config.
- Do not change `npm start`.

Expected result:

- New structure exists.
- Existing app still starts from `server.js`.
- No API behavior changes.

Checks:

```txt
npm run lint
npm run build
```

Migration impact:

- No database migration expected.

## Phase 2 - Split App Bootstrap From Server Startup

Command phrase: `go phase 2`

Goal: separate Express app creation from HTTP/WebSocket startup.

Scope:

- Introduce:
  - `server/src/app.*`
  - `server/src/server.*`
  - `server/src/config/env.*`
  - `server/src/config/cors.*`
  - `server/src/config/security.*`
- Move only bootstrap concerns out of root `server.js`:
  - Express app creation
  - compression/security/static middleware setup
  - route mounting shell
  - startup checks
  - HTTP server startup
  - WebSocket server attachment if currently coupled to startup
- Keep root `server.js` as a compatibility bridge.
- Keep all existing route registration behavior.

Expected result:

- Backend can still start through `node server.js`.
- App creation can be imported independently for tests later.

Checks:

```txt
npm run lint
npm run build
npm run smoke:production-config
```

Migration impact:

- No database migration expected.

## Phase 3 - Move Shared Backend Infrastructure

Command phrase: `go phase 3`

Goal: move cross-cutting infrastructure into `server/src/shared` and `server/src/db`.

Scope:

- Move or wrap:
  - `src/server/db.js` -> `server/src/db/pool.*`
  - `src/server/transaction.js` -> `server/src/db/transaction.*`
  - tenant scope helpers -> `server/src/shared/middleware/tenant.middleware.*`
  - auth/session middleware -> `server/src/shared/middleware/auth.middleware.*`
  - permission checks -> `server/src/shared/middleware/permission.middleware.*`
  - validation helpers -> `server/src/shared/middleware/validate.middleware.*`
  - API error helpers -> `server/src/shared/errors/`
- Keep old import paths working through re-export wrappers.
- Do not change business route behavior.

Expected result:

- Shared infrastructure has a clear home.
- Old route/repository files still work.

Checks:

```txt
npm run lint
npm run build
npm run db:migrate:current:test
```

Migration impact:

- No schema migration expected.

## Phase 4 - Create The First Complete Feature Module: Customers

Command phrase: `go phase 4`

Goal: prove the module pattern with one important but manageable business area.

Scope:

- Create:
  - `server/src/modules/customers/customer.routes.*`
  - `customer.controller.*`
  - `customer.service.*`
  - `customer.repository.*`
  - `customer.validation.*`
  - `customer.mapper.*`
- Move customer route handlers out of `src/server/routes/customer-routes.js`.
- Move customer SQL/data mapping out of `src/server/repositories/customers.js` in safe slices.
- Keep old files as thin compatibility exports until cleanup.
- Preserve:
  - permissions
  - tenant scope
  - CEO-only private customer detail behavior
  - audit logging
  - archive behavior
  - related customer data loading

Expected result:

- Customers are the reference implementation for all future modules.

Checks:

```txt
npm run lint
npm run build
npm run test:e2e -- tests/e2e/search.spec.ts
```

Migration impact:

- No database migration expected unless existing customer behavior requires a discovered schema fix.

## Phase 5 - Users, Organizations, And Auth

Command phrase: `go phase 5`

Goal: move identity and organization ownership into modules.

Scope:

- Create modules:
  - `auth/`
  - `users/`
  - `organizations/`
- Move route/controller/service/repository layers for:
  - login/session lookup
  - users
  - roles/permissions where applicable
  - organization detail/billing/member reads where applicable
- Preserve:
  - tenant scoping
  - platform-admin exceptions
  - session revocation
  - permission checks

Expected result:

- Authentication and tenant ownership logic is easier to reason about before shipment migration.

Checks:

```txt
npm run lint
npm run build
npm run db:migrate:current:test
```

Migration impact:

- No database migration expected unless a permission/session gap is found.

## Phase 6 - Documents, Notifications, Tasks, Search, And Audit

Command phrase: `go phase 6`

Goal: move supporting operational modules before shipment core is moved.

Scope:

- Create modules:
  - `documents/`
  - `notifications/`
  - `tasks/`
  - `search/`
  - `audit/`
- Move document service/repository and storage integration behind module boundaries.
- Keep storage adapters in shared/storage or module-local storage only where appropriate.
- Preserve:
  - server-side document lookup
  - object storage behavior
  - public document visibility rules
  - audit log append-only behavior
  - task assignment behavior

Expected result:

- Shipment migration can depend on stable document/task/audit module interfaces.

Checks:

```txt
npm run lint
npm run build
npm run documents:storage:smoke
```

Migration impact:

- No database migration expected.

## Phase 7 - Daily Status And Kootaj

Command phrase: `go phase 7`

Goal: isolate daily status and kootaj workflow before moving all shipment endpoints.

Scope:

- Create:
  - `server/src/modules/shipments/kootaj/`
  - `server/src/modules/daily-status/` if kept separate from shipments
- Move daily status route/service/repository logic.
- Preserve:
  - shipment status filters
  - kootaj fields
  - editable shipment basic info from daily kootaj page
  - tenant-scoped reads/writes

Expected result:

- Daily kootaj becomes a clear module boundary.

Checks:

```txt
npm run lint
npm run build
npm run test:e2e -- tests/e2e/daily-status*.spec.ts
```

Migration impact:

- No database migration expected unless a daily-status schema gap is found.

## Phase 8 - Shipments Core Module

Command phrase: `go phase 8`

Goal: move the core shipment backend into feature/use-case folders.

Scope:

- Create shipment subfolders:
  - `list-shipments/`
  - `get-shipment/`
  - `create-shipment/`
  - `update-basic-info/`
  - `update-operational-fields/`
  - `status/`
  - `containers/`
  - `tracking/`
  - `archive/`
- Move shipment V2 and canonical shipment APIs behind the new module.
- Preserve:
  - five-pillar shipment statuses
  - `مرحله فعلی` custom stage
  - exited archive behavior
  - public tracking DTO allowlist
  - workflow template integration
  - document/customer relationships

Expected result:

- Shipment code is readable by business capability instead of spread across routes/repositories/schemas.

Checks:

```txt
npm run lint
npm run build
npm run db:migrate:current:test
npm run test:e2e -- tests/e2e/shipment*.spec.ts
npm run test:e2e -- tests/e2e/daily-status*.spec.ts
```

Migration impact:

- No migration expected for pure restructure.
- If shipment schema issues are found, create a safe forward migration in the same phase.

## Phase 9 - Quotations, Billing, Payments, Rates, And Commercial Data

Command phrase: `go phase 9`

Goal: move remaining commercial/business modules.

Scope:

- Create modules:
  - `quotations/`
  - `billing/`
  - `rates/`
  - `commercial-cards/` or `business-entities/`
- Preserve:
  - quotation to shipment conversion
  - invoice/payment behavior
  - BRSAPI sync behavior
  - Malvani/business entity relationships
  - tenant scoping and audit logging

Expected result:

- Most backend business code now lives under modules.

Checks:

```txt
npm run lint
npm run build
npm run billing:sync-plans
```

Migration impact:

- No migration expected unless commercial/billing schema gaps are found.

## Phase 10 - Cleanup, Naming, And Deployment Hardening

Command phrase: `go phase 10`

Goal: remove compatibility layers and finish the new backend structure.

Scope:

- Remove old route/repository/schema files after all imports are moved.
- Decide and implement final runtime strategy:
  - stay `.js`, or
  - add a server build and convert backend files to `.ts`.
- Update:
  - `package.json`
  - Liara startup assumptions if needed
  - README/deployment docs
  - migration paths only if intentionally moved
- Run a full deployment-readiness pass.

Expected result:

- Backend structure matches the module-first design.
- Old duplicated backend paths are gone.

Checks:

```txt
npm run lint
npm run build
npm run db:migrate:fresh:test
npm run db:migrate:current:test
npm run smoke:production-config
npm run test:e2e
```

Migration impact:

- No schema migration expected for cleanup.
- Deployment steps may change if server runtime changes.

## How To Use This Plan

When the user writes:

```txt
go phase 1
```

Codex should implement only Phase 1, run the listed checks, and stop with a summary.

When the user writes:

```txt
go phase 2
```

Codex should first verify Phase 1 is already in place, then implement only Phase 2.

This continues through Phase 10.

If a later phase reveals that an earlier phase needs adjustment, fix the earlier foundation in the same phase only if the change is required and low-risk. Otherwise, report the blocker clearly.

## Definition Of Done For Every Phase

- Requested phase scope is complete.
- App still builds.
- Relevant checks were run and results reported.
- No unrelated feature behavior was changed.
- Tenant scope and permission behavior were preserved.
- Migrations were created only if schema changed.
- Liara deployment path remains clear.
- Any compatibility wrappers are documented for later cleanup.
