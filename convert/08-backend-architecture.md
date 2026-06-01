# Backend Architecture

## Backend Goals

- Replace `server.js` and `src/server/db.js` centralization with clear modules.
- Make tenant scoping automatic and fail-closed.
- Keep REST API response shapes documented and stable.
- Separate web requests from background jobs.
- Make payment, SMS, document, and audit workflows testable.
- Start as a modular monolith that can later split into services.

## Recommended Stack

- NestJS
- TypeScript
- Drizzle ORM
- PostgreSQL
- Redis
- BullMQ
- S3-compatible object storage
- Zod or class-validator for DTO validation
- Pino logger
- OpenTelemetry-ready instrumentation

## Module Structure

| Module | Responsibility |
| --- | --- |
| `ConfigModule` | Env parsing, validation, secrets references |
| `DatabaseModule` | Drizzle client, transaction helper, repository base utilities |
| `AuthModule` | Login, refresh tokens, logout, SMS OTP auth |
| `TenancyModule` | Tenant resolution, active membership, tenant guard |
| `RbacModule` | Roles, permissions, policy checks |
| `UsersModule` | User/membership management |
| `OrganizationsModule` | Tenant profile, lifecycle, settings |
| `PlansModule` | Subscription plan catalog |
| `BillingModule` | Payments, invoices, receipts, Zarinpal adapter |
| `CustomersModule` | Customer CRUD and related records |
| `ShipmentsModule` | Shipment CRUD, status, tracking access |
| `WorkflowModule` | Workflow templates, instances, step states, blockers, events |
| `TasksModule` | Tasks, assignment, status, task events |
| `DocumentsModule` | Metadata, upload, versions, downloads, visibility |
| `TrackingModule` | Public tracking DTOs and public document access |
| `NotificationsModule` | In-app notifications |
| `SmsModule` | Templates, delivery queue, provider adapter |
| `ArchiveModule` | Archive/restore/permanent delete orchestration |
| `AuditModule` | Append-only audit logs and query APIs |
| `SearchModule` | Tenant-scoped operational search |
| `ReportsModule` | Dashboard and reports |
| `PlatformAdminModule` | Platform-only organization, signup, billing, SMS, error-log operations |
| `HealthModule` | Liveness/readiness/dependency checks |
| `ErrorLogModule` | Client/server error reports |

## Controllers

Controllers should:

- Parse route params/query/body through DTOs.
- Declare guards and permissions.
- Call services.
- Return response DTOs.
- Avoid direct database calls.
- Avoid business logic beyond simple request mapping.

Example:

```ts
@Controller('api/v1/shipments')
@UseGuards(AuthGuard, TenantGuard)
export class ShipmentsController {
  @Get()
  @RequirePermission('shipments.view_all')
  list(@Tenant() tenant: TenantContext, @Query() query: ListShipmentsDto) {
    return this.shipmentsService.list(tenant, query);
  }
}
```

## Services

Services should:

- Own business workflows.
- Open transactions for multi-table changes.
- Emit domain events.
- Call repositories.
- Call audit service.
- Enforce state transitions and plan limits.
- Build internal DTOs for controllers.

Examples:

- `ShipmentsService.createShipment`
- `WorkflowService.updateCurrentStep`
- `DocumentsService.replaceDocument`
- `BillingService.handleZarinpalCallback`
- `ArchiveService.archiveEntity`

## Repositories

Repositories should:

- Require `organizationId` for tenant-owned queries.
- Use typed Drizzle queries.
- Return persistence models, not public API DTOs.
- Keep query-specific indexes in mind.
- Avoid hidden global tenant state unless wrapped in transactions with explicit context.

Repository rule:

- If a method reads/writes tenant-owned data and no tenant context is provided, it throws.

## DTOs

Use separate DTOs for:

- Request body.
- Query params.
- Internal service command.
- API response.
- Public/customer response.

Do not reuse database row types as public responses.

## Guards

Required guards:

- `JwtAuthGuard`
- `RefreshTokenGuard`
- `TenantGuard`
- `PermissionGuard`
- `PlatformAdminGuard`
- `SubscriptionStatusGuard`
- `PublicTrackingRateLimitGuard`
- `UploadGuard`

Tenant guard behavior:

- Resolve active organization from token/session.
- Check membership status.
- Check organization status.
- Attach `tenantContext`.
- Fail closed if tenant missing.

## Interceptors

Recommended interceptors:

- Request id interceptor.
- Response envelope interceptor.
- Audit context interceptor.
- Logging/timing interceptor.
- Serialization interceptor to remove sensitive fields.
- Cache interceptor for safe read endpoints.

## Pipes

Recommended pipes:

- Zod validation pipe or class-validator pipe.
- Parse UUID pipe.
- Pagination pipe.
- Sort allowlist pipe.
- File metadata validation pipe.

## Middleware

Recommended middleware:

- Request id.
- CORS.
- Helmet/security headers.
- Compression where appropriate.
- Raw body capture only for webhook providers that require signatures.
- Body size limits.
- IP extraction behind trusted proxy.

## Background Jobs

Use BullMQ queues:

- `sms-delivery`
- `email-delivery`
- `document-processing`
- `report-export`
- `billing-retry`
- `webhook-delivery`
- `audit-export`

Worker process:

- Runs separately from API.
- Uses the same modules/services where possible.
- Uses idempotency keys.
- Records job attempts/failures.
- Has dead-letter handling.

## Event System

Use domain events inside the modular monolith:

- `shipment.created`
- `shipment.status_changed`
- `workflow.step_completed`
- `workflow.blocker_opened`
- `task.assigned`
- `task.status_changed`
- `document.uploaded`
- `document.visibility_changed`
- `billing.payment_verified`
- `subscription.activated`

Event handlers:

- Create audit logs.
- Create notifications.
- Queue SMS.
- Update archive projections where needed.

## Queue System

Use Redis + BullMQ.

Queue rules:

- Every job includes `organizationId` where relevant.
- Every job has an idempotency key.
- Provider calls have timeout and retry policy.
- Sensitive payloads are minimized.
- Failed jobs are visible in admin/support tooling.

## File Upload System

Flow:

1. Controller validates metadata and file envelope.
2. Upload service validates MIME/extension/size.
3. Object storage service writes to S3-compatible bucket.
4. Document service creates metadata and version row in transaction.
5. Post-upload job scans/processes file if enabled.
6. Audit event is written.

Download flow:

- Protected download checks tenant and permission.
- Public download checks tracking token, shipment access, document visibility.
- API returns short-lived signed URL or streams file through API.

## Notification System

In-app notifications:

- Stored in `notifications`.
- Read/read-all APIs.
- Created by domain event handlers.

SMS notifications:

- Created as `sms_deliveries` records.
- Sent by `sms-delivery` worker.
- Templates stored in DB.
- Feature-gated by plan.

Post-MVP:

- Email and webhook channels.

## Auth Module

Responsibilities:

- Password login.
- SMS login.
- Access token issue.
- Refresh token rotation.
- Logout/revoke.
- Current user/membership endpoint.
- Password change.
- Optional 2FA.

Security:

- Argon2id password hashing.
- Refresh token hash storage.
- Token family revocation on reuse detection.
- Rate limiting.
- Audit login/security events.

## RBAC Module

Responsibilities:

- Permission catalog.
- System roles.
- Tenant custom roles.
- Role-permission assignment.
- Guards/decorators.
- Policy helpers for own/all access.

Permission examples:

- `shipments.view_all`
- `shipments.view_assigned`
- `shipments.create`
- `shipments.update`
- `shipments.archive`
- `documents.view_all`
- `documents.upload`
- `customer_access.manage`
- `tasks.view_own`
- `tasks.view_all`
- `platform.admin`

## Multi-Tenancy Module

Responsibilities:

- Active tenant selection.
- Membership validation.
- Organization subscription status checks.
- Tenant context decorators.
- Repository helper enforcement.
- Optional RLS transaction context.

## Audit Logging Module

Responsibilities:

- Append audit events.
- Provide audit query APIs.
- Scrub sensitive fields.
- Attach request metadata.
- Support exports post-MVP.

Audit must cover:

- Auth/security changes.
- User/role changes.
- Organization/subscription changes.
- Shipment/customer/task/document/workflow changes.
- Public tracking access generation/reset/disable.
- Billing/payment/manual admin actions.
- Archive/restore/permanent delete.
- SMS template changes and worker manual runs.

## Proposed Folder Structure

```text
apps/api/
  src/
    main.ts
    app.module.ts
    config/
    database/
      schema/
      migrations/
      repositories/
    common/
      decorators/
      dto/
      errors/
      filters/
      guards/
      interceptors/
      pipes/
      utils/
    modules/
      auth/
      tenancy/
      rbac/
      users/
      organizations/
      plans/
      billing/
      customers/
      shipments/
      workflow/
      tasks/
      documents/
      tracking/
      notifications/
      sms/
      archive/
      audit/
      search/
      reports/
      platform-admin/
      health/
      error-log/
    workers/
      worker.module.ts
      queues.ts
      processors/
    tests/
```

## Modular Monolith To Microservices Path

Start as one deployable API plus one worker. Keep module boundaries strict:

- No cross-module repository imports.
- Cross-module operations go through services or events.
- Each module owns its tables and migrations.
- Each module owns tests.
- Shared primitives live in `common`, not in feature modules.

Future extraction candidates:

- Billing service.
- Notification/SMS service.
- Document processing service.
- Public tracking service.
- Reporting service.

Do not split services until module boundaries and operational volume justify it.

## Decision Needed

- Decide whether DTO validation uses Zod everywhere or Nest class-validator. Recommendation: Zod for shared frontend/backend schema potential.
- Decide if API and worker are separate packages or separate Nest entrypoints in one package. Recommendation: same package, separate entrypoints at MVP.
- Decide how strict module boundary linting should be. Recommendation: add ESLint boundaries once the module tree is stable.

