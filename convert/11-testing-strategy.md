# Testing Strategy

## Testing Goals

- Prove feature parity before switching users from old app to new app.
- Prevent tenant isolation and public tracking leaks.
- Make business logic testable outside the browser.
- Keep migrations and payment callbacks safe.
- Catch RTL/Persian UI regressions and mobile layout issues.

## Current Testing Baseline

The current app uses Playwright E2E tests under `tests/e2e` covering areas such as:

- Admin console.
- Client readiness smoke.
- Commercial cards.
- Company-wide visibility.
- Customer CRUD.
- Delete confirmations.
- Demo company.
- Document download/print.
- Document security lifecycle.
- Mobile layout.
- Notifications.
- Pricing/billing.
- Production readiness.
- Public funnel.
- Public tracking leak prevention.
- Search.
- Security.
- Shamsi date/time.
- Shipment detail workflow tasks.
- Skeleton loaders.
- SMS alerts and cost safety.
- UX/UI regression.
- Empty states.

The rebuild should keep equivalent E2E coverage and add stronger unit, integration, and API tests.

## Suggested Tools

| Test type | Tools |
| --- | --- |
| Unit tests | Vitest or Jest |
| Backend integration | Vitest/Jest + Testcontainers or Docker test DB |
| API tests | Supertest against Nest app |
| Frontend component tests | React Testing Library, Vitest |
| E2E | Playwright |
| Accessibility | axe-core, Playwright accessibility checks |
| Load tests | k6 |
| Migration tests | Testcontainers/PostgreSQL fixture migrations |
| Contract tests | OpenAPI schema checks |

## Unit Tests

Cover:

- Permission policy functions.
- Tenant guard helpers.
- Status transition rules.
- Workflow route/step/blocker logic.
- Public DTO mappers.
- File validation.
- Pricing/plan limit checks.
- Payment idempotency helpers.
- Search normalization.
- Jalali/date formatting utilities.

Acceptance:

- High-risk business services have unit coverage before implementation is considered complete.

## Integration Tests

Cover with real PostgreSQL:

- Repository tenant scoping.
- Shipment create/update/archive.
- Customer CRUD.
- Document metadata/versioning.
- Workflow start/update/blocker.
- Task assignment/status events.
- Archive projection transaction.
- Audit log creation.
- Billing payment verification transaction.
- SMS delivery queue record creation.

Acceptance:

- Every module with database writes has integration tests.
- Tests use isolated test DB and rollback/cleanup.

## E2E Tests

Preserve or recreate these scenarios:

- Public landing/contact/pricing/signup pages render.
- Password login.
- SMS login dry-run.
- Protected route access and redirects.
- Dashboard renders after login.
- Customer create/update/archive.
- Shipment create/edit/status/archive.
- Shipment workflow step update, blocker, task assignment.
- Document upload/download/replace/visibility/archive.
- Public tracking by token.
- Public tracking by search.
- Public tracking leak prevention.
- Task list/assignment/status/history.
- Compliance meeting workflow.
- Cheque workflow.
- Quotation status/convert to shipment.
- Archive restore/permanent delete.
- Global search.
- User management.
- Platform admin signups, billing, SMS, errors.
- Mobile layout smoke.
- Persian/RTL/Shamsi date rendering.

## API Tests

Each API group should have tests for:

- 401 unauthenticated.
- 403 forbidden.
- 404 tenant-scoped not found.
- 400 validation errors.
- Happy path.
- Tenant A cannot read/write Tenant B.
- Archived records excluded from active lists.
- Public DTO does not include forbidden fields.

## Frontend Component Tests

Cover:

- Data tables render empty/loading/error states.
- Status badges map values correctly.
- Permission gates hide/show actions.
- Form validation messages.
- File upload UI validation.
- Confirm dialogs.
- RTL layout-sensitive components.
- Public tracking components do not render internal fields.

## Auth And Security Tests

Required:

- Password login rate limit.
- SMS request/verify rate limits.
- Refresh token rotation.
- Reuse of revoked refresh token revokes family.
- Suspended user cannot log in.
- Suspended/expired organization blocks tenant app.
- Platform admin required for platform APIs.
- Tenant admin cannot access platform APIs.
- Customer tracking token hash lookup only.
- Public tracking invalid token returns safe error.

## Permission Tests

Build a permission matrix test suite:

- CEO can manage users.
- Manager can operate shipments/tasks/documents.
- Operations cannot manage billing.
- Finance can manage cheques/billing where intended.
- Customer service can view/update customer-facing shipment fields.
- Employee sees own tasks and permitted operational screens only.
- Platform admin cannot silently bypass tenant context without support mode.

## Database Migration Tests

For every migration:

- Apply migration to empty DB.
- Apply migration to previous schema with seed data.
- Run rollback or compatibility check when applicable.
- Verify constraints and indexes exist.
- Verify no data loss for existing mapped records.

Before production cutover:

- Run old schema snapshot to new schema migration using anonymized production copy.
- Compare record counts and checksums.

## Load And Performance Testing

Use k6 for:

- Login.
- Dashboard.
- Shipment list.
- Search.
- Document upload/download.
- Public tracking search.
- Public tracking detail.
- Admin lists.

Track:

- P95 latency.
- Error rate.
- DB CPU/query latency.
- Redis queue latency.
- Object storage latency.

## Regression Testing Before Switching

Required before cutover:

- Old app remains green on current critical tests.
- New app passes parity E2E suite.
- New app passes security and tenant isolation tests.
- Migration dry-run passes with anonymized production copy.
- Public tracking links tested for selected migrated shipments.
- Document downloads tested after object migration.
- Billing callback idempotency tested.
- Rollback rehearsal completed.

## Manual QA Checklist

- [ ] Owner login works.
- [ ] SMS login dry-run/live-guarded works.
- [ ] Dashboard KPIs make sense.
- [ ] Create customer.
- [ ] Create shipment for customer.
- [ ] Start workflow.
- [ ] Complete workflow step.
- [ ] Open and resolve blocker.
- [ ] Assign task and change status.
- [ ] Upload document.
- [ ] Replace document.
- [ ] Mark document customer-visible.
- [ ] Generate tracking link.
- [ ] Open public tracking page.
- [ ] Download customer-visible document.
- [ ] Confirm internal fields are absent from public page/API.
- [ ] Archive and restore shipment/document/customer.
- [ ] Search finds expected records.
- [ ] Create quotation and convert to shipment.
- [ ] Create compliance meeting and required document.
- [ ] Create cheque and due-soon check.
- [ ] Platform admin sees org/payment/SMS/error data.
- [ ] Mobile layout has no overflow.
- [ ] Persian text and Jalali dates render correctly.

## Decision Needed

- Decide minimum test suite required for each phase. Recommendation: require unit/integration for new services and keep Playwright for full workflows.
- Decide whether to use Testcontainers or Docker Compose test DB in CI. Recommendation: Testcontainers if CI supports it, Docker Compose otherwise.

