# Enterprise Readiness Checklist

## Security Readiness

- [ ] Passwords hashed with Argon2id.
- [ ] Refresh tokens stored as hashes.
- [ ] Refresh token rotation implemented.
- [ ] Platform admin is role-based, not email-based.
- [ ] Tenant guard fails closed.
- [ ] Permission guard covers all protected endpoints.
- [ ] Public tracking uses allowlisted DTOs.
- [ ] Customer tracking tokens stored hash-only.
- [ ] File uploads validate extension, MIME, size, and path.
- [ ] Object storage is private by default.
- [ ] Signed URLs expire.
- [ ] Rate limits use Redis in production.
- [ ] Secrets are in secret manager or platform env, not repo.
- [ ] Audit logs are append-only.
- [ ] Error logs scrub secrets and PII.
- [ ] Security headers enabled.
- [ ] MFA required for platform admins.

## Scalability Readiness

- [ ] API, web, and worker are separate deployable processes.
- [ ] Redis used for queues and rate limits.
- [ ] Documents stored in S3-compatible object storage.
- [ ] Database indexes cover high-volume tenant lists.
- [ ] Search is bounded and paginated.
- [ ] Public tracking endpoints are rate-limited.
- [ ] Background jobs are idempotent.
- [ ] Queue retry/dead-letter strategy exists.
- [ ] Health checks support horizontal scaling.
- [ ] Load tests cover dashboard, shipments, search, tracking, documents.

## Maintainability Readiness

- [ ] Modules have clear ownership.
- [ ] Controllers do not contain business logic.
- [ ] Services own workflows and transactions.
- [ ] Repositories require tenant context.
- [ ] DTOs are separate from database rows.
- [ ] Shared types/schemas are versioned.
- [ ] Migrations are reviewed SQL.
- [ ] No legacy `user_records` bridge.
- [ ] No large composition-root files.
- [ ] Feature tests live near modules.
- [ ] Documentation explains module boundaries.

## Observability Readiness

- [ ] Structured logs include request id.
- [ ] Logs include tenant id and user id where safe.
- [ ] Error tracker is configured.
- [ ] OpenTelemetry hooks are available.
- [ ] API latency metrics collected.
- [ ] DB query latency monitored.
- [ ] Queue depth monitored.
- [ ] Worker failures visible.
- [ ] Payment callback failures alert.
- [ ] SMS provider failures alert.
- [ ] Object storage errors alert.

## Performance Readiness

- [ ] List endpoints are paginated.
- [ ] Expensive counts are optional or cached.
- [ ] Dashboard queries are optimized.
- [ ] Search has indexes and limits.
- [ ] File downloads stream or use signed URLs.
- [ ] Frontend uses TanStack Query caching.
- [ ] Next.js bundles analyzed.
- [ ] Mobile pages avoid layout shift.
- [ ] P95 latency targets defined.

## Multi-Tenant Readiness

- [ ] Every tenant-owned table has `organization_id`.
- [ ] Every tenant-owned unique constraint is tenant-scoped.
- [ ] Tenant isolation tests cover each module.
- [ ] Background jobs include tenant context.
- [ ] Public tracking hides tenant identifiers.
- [ ] Platform admin support actions are audited.
- [ ] Tenant status/subscription gates are enforced.
- [ ] Tenant data export path exists or is planned.

## Compliance Readiness

- [ ] Audit logs cover sensitive changes.
- [ ] Document retention policy exists.
- [ ] Data deletion/archive policy exists.
- [ ] PII fields are identified.
- [ ] Access to support/admin data is auditable.
- [ ] Payment provider data is minimized.
- [ ] Customer-facing DTOs are reviewed.
- [ ] Backup/restore process is documented.
- [ ] Incident response runbook exists.

## Backup And Restore Readiness

- [ ] Automated database backups enabled.
- [ ] Manual backup before migrations.
- [ ] Restore drill completed.
- [ ] Object storage backup/versioning configured.
- [ ] Migration rollback approach documented.
- [ ] Cutover rollback plan documented.
- [ ] Old app retained during acceptance window.

## Team Development Readiness

- [ ] Local setup works from README.
- [ ] Docker Compose starts dependencies.
- [ ] Seed data creates usable demo tenant.
- [ ] CI pipeline runs typecheck/lint/tests/build.
- [ ] PR template includes security/tenant checks.
- [ ] Coding standards documented.
- [ ] Module ownership documented.
- [ ] Test data strategy documented.
- [ ] Environment variable reference complete.

## Client Onboarding Readiness

- [ ] Signup flow works.
- [ ] Manual platform signup works.
- [ ] Subscription plan assignment works.
- [ ] Tenant owner account creation works.
- [ ] Demo data option exists.
- [ ] Tenant settings page exists.
- [ ] User invite/create flow works.
- [ ] Public tracking setup guide exists.
- [ ] Support contact workflow exists.

## SLA And Support Readiness

- [ ] Health checks exposed.
- [ ] Admin error logs available.
- [ ] Support actions audited.
- [ ] Incident severity levels defined.
- [ ] Support runbooks exist.
- [ ] Monitoring alerts route to responsible people.
- [ ] Payment/SMS provider failure process defined.
- [ ] Data restore process tested.
- [ ] Client communication templates prepared.

## Launch Gate

- [ ] All must-have parity features complete.
- [ ] Public tracking leak tests pass.
- [ ] Tenant isolation tests pass.
- [ ] Migration dry-run passes.
- [ ] Staging smoke passes.
- [ ] Production backup and rollback plan approved.
- [ ] First production support person assigned.

## Decision Needed

- Decide which checklist items are required for MVP launch and which are required before first enterprise client contract.

