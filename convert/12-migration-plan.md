# Migration Plan

## Migration Goal

Rebuild LogisticPlus in a new stack while the current app keeps running. The old app remains the production system until the new app reaches feature parity, data migration is verified, and cutover can be performed with rollback.

## What Data Needs To Migrate

Migrate:

- Organizations.
- Organization memberships.
- Users.
- Roles and permissions.
- Subscription plans.
- Organization subscriptions.
- Signup requests.
- Payments.
- Invoices.
- Invoice items.
- Receipts.
- Customers.
- Shipments.
- Shipment status events.
- Shipment workflow instances.
- Workflow step states.
- Workflow blockers.
- Workflow events.
- Tasks.
- Task events.
- Documents.
- Document versions.
- Cheques.
- Compliance meetings.
- Meeting required documents.
- Quotations.
- Archive records.
- Notifications if still useful.
- SMS templates.
- SMS delivery history if needed for audit/cost review.
- Change/audit logs.
- Contact requests.
- Error logs if support history is needed.
- Demo company data if it remains useful.

## What Data Should Not Migrate

Do not migrate:

- Active sessions in `app_sessions`.
- Login SMS challenges.
- Rate limit buckets.
- Temporary local/test records.
- Browser-local state.
- Old `user_records` as a compatibility mechanism.
- Plain customer access tokens.
- Raw provider secrets.
- Runtime logs.
- Test results/playwright reports.

Optional:

- Old client error logs can be archived externally instead of imported.
- Old SMS delivery attempts can be summarized if full history is not required.

## Old-To-New Mapping

| Current source | New target | Notes |
| --- | --- | --- |
| `app_users` | `users` | Keep ids if possible or map through `legacy_id` |
| `organizations` | `organizations` | Preserve slug/status/contact fields |
| `organization_members` | `organization_memberships` | Convert role text to role id |
| `roles`, `permissions`, `role_permissions` | Same logical tables | Seed new catalog, map old roles |
| `app_sessions` | none | Users log in again |
| `login_sms_challenges` | none | Ephemeral |
| `subscription_plans` | `subscription_plans` | Preserve plan ids/prices/features |
| `organization_subscriptions` | `subscriptions` | Preserve billing cycle/status/period |
| `signup_requests` | `signup_requests` | Preserve payment review state |
| `billing_payments` | `payments` | Preserve gateway authority/ref ids |
| `billing_invoices` | `invoices` | Preserve invoice numbers |
| `billing_invoice_items` | `invoice_items` | Preserve invoice rows |
| `billing_receipts` | `receipts` | Preserve receipt numbers |
| `customers` | `customers` | Move legacy queryable fields into columns |
| `shipments` | `shipments` | Convert text dates to timestamptz where possible |
| `shipment_status_events` | `shipment_status_events` | Preserve customer-visible events |
| `shipment_workflow_*` | `workflow_*` | Preserve `IR_IMPORT_CUSTOMS_V1` state |
| `tasks` | `tasks` | Preserve assignment/status/source/workflow links |
| `task_events` | `task_events` | Preserve history |
| `documents` | `documents` | Migrate metadata and object storage |
| `document_versions` | `document_versions` | Migrate versions and storage keys |
| disk files in `storage/documents` | S3 objects | Upload and update object keys |
| `cheques` | `cheques` | Preserve finance status |
| `compliance_meetings` | `compliance_meetings` | Preserve required doc links |
| `meeting_required_documents` | `meeting_required_documents` | Link to migrated documents |
| `quotations` | `quotations` | Preserve conversion links |
| `archive_records` | `archive_records` | Rebuild from source `archived_at` where possible |
| `change_logs` | `audit_logs` | Preserve as imported audit history |
| `notifications` | `notifications` | Optional active unread notifications |
| `sms_templates` | `sms_templates` | Preserve templates |
| `sms_deliveries` | `sms_deliveries` | Optional historical import |
| `user_records` | canonical tables only | Use only as fallback for legacy-only entities |

## Data Cleaning Requirements

- Normalize emails to lowercase/citext.
- Normalize phone numbers.
- Convert date/time text fields to timestamps with timezone.
- Validate shipment statuses.
- Validate task statuses/priorities.
- Validate document visibility values.
- Confirm every tenant-owned row has an organization id.
- Remove or map orphaned records.
- Rebuild archive projection from source rows where inconsistent.
- Verify document files exist for document/version records.
- Recompute checksums if missing.
- Remove plaintext tracking tokens and generate hash-only access records.
- Fix Persian text encoding issues before import where detected.

## Migration Scripts Strategy

Create migration tooling in the new repo:

```text
tools/migration/
  config.ts
  old-db.ts
  new-db.ts
  id-map.ts
  extract/
  transform/
  load/
  verify/
  migrate-documents.ts
  migrate-all.ts
  dry-run.ts
```

Script phases:

1. Connect read-only to old DB.
2. Connect write to new DB.
3. Extract in deterministic order.
4. Transform old records to new schema.
5. Store id mapping.
6. Load in dependency order.
7. Upload documents to object storage.
8. Verify counts and relationships.
9. Generate migration report.

Dependency order:

1. Roles/permissions/plans.
2. Users.
3. Organizations.
4. Memberships/subscriptions.
5. Billing/signup.
6. Customers.
7. Shipments.
8. Workflow.
9. Tasks.
10. Documents/files.
11. Office workflows.
12. Notifications/SMS/audit/archive.

## Parallel-Running Strategy

Recommended path:

1. Keep old app production read/write.
2. Build new app in separate repo/environment.
3. Run repeated migration dry-runs from old production backup to new staging.
4. Compare results.
5. Run user acceptance testing on new staging.
6. Schedule cutover window.
7. Put old app into maintenance/read-only mode if possible.
8. Take final backup.
9. Run final migration.
10. Smoke new production.
11. Switch DNS/traffic.
12. Keep old app and database available for rollback until acceptance window closes.

If old app cannot be made read-only:

- Use a short maintenance window for final migration.
- Or implement dual-write/change-capture only if absolutely necessary. This is usually not worth it for MVP cutover.

## How To Keep Old App Alive

- Do not modify old app during rebuild except critical production fixes.
- Do not change old schema for new app needs.
- Do not point old app at new database.
- Keep old document disk intact.
- Keep old env/secrets isolated.
- Continue current backup and smoke-test practices.
- Use production backups for dry-runs, not live writes.

## How To Test Migration

Automated checks:

- Row counts by entity.
- Tenant-owned row count by organization.
- Foreign key integrity.
- No orphaned documents/tasks/workflows.
- Active/archive counts match.
- Public tracking records only for enabled shipments.
- Public DTO leak tests on migrated records.
- Document file checksum match.
- Billing totals match.
- Invoice/receipt uniqueness.
- Payment callback idempotency still works for pending payments.

Manual checks:

- Pick 5 active shipments across tenants.
- Pick 5 archived records.
- Pick 5 documents including customer-visible docs.
- Pick 3 billing/signup examples.
- Pick demo company and run public tracking links.

## Cutover Plan

Pre-cutover:

- [ ] New app feature parity accepted.
- [ ] Migration dry-run passed on recent production backup.
- [ ] Document migration checksums passed.
- [ ] Public tracking leak tests passed.
- [ ] Staging smoke passed.
- [ ] Rollback plan approved.
- [ ] Maintenance window announced.

Cutover:

- [ ] Stop old app writes or enable maintenance mode.
- [ ] Take final DB backup.
- [ ] Snapshot document storage.
- [ ] Run final migration.
- [ ] Run verification.
- [ ] Deploy new app.
- [ ] Run production smoke.
- [ ] Switch DNS/traffic.
- [ ] Monitor logs/errors/queues/payments/SMS.

Post-cutover:

- [ ] Keep old app available but not public write target.
- [ ] Run support checklist.
- [ ] Confirm first real user workflows.
- [ ] Confirm first payment callback.
- [ ] Confirm first SMS delivery.
- [ ] Confirm first document upload/download.

## Rollback Plan

Rollback if:

- New app cannot authenticate users.
- Tenant isolation bug is found.
- Public tracking exposes internal data.
- Payment callback corrupts billing state.
- Document downloads fail broadly.
- Migration verification failed but traffic was switched.

Rollback steps:

1. Stop new app traffic.
2. Switch DNS/traffic back to old app.
3. Ensure old app points to old DB/storage.
4. Re-enable old app writes.
5. Preserve new app logs and migration report for analysis.
6. Decide whether to discard or reconcile new writes if any occurred.

Rollback rule:

- Do not attempt partial database rollback while users are writing to the new app. Either complete cutover or route back to old app quickly.

## Launch Checklist

- [ ] Security review complete.
- [ ] Tenant isolation tests pass.
- [ ] Public tracking leak tests pass.
- [ ] Payment tests pass.
- [ ] Document tests pass.
- [ ] Migration verified.
- [ ] Backups verified.
- [ ] Monitoring dashboards live.
- [ ] Support/admin users trained.
- [ ] Old app rollback path verified.
- [ ] DNS/traffic switch plan approved.

## Decision Needed

- Decide whether cutover includes a maintenance/read-only window. Recommendation: yes, unless business requires no downtime.
- Decide whether old ids are preserved. Recommendation: preserve where practical to simplify references and support.
- Decide whether historical notifications/SMS/error logs are fully migrated or archived separately.

