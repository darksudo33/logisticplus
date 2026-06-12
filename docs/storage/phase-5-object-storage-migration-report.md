# Phase 5 Object Storage Migration Report

Date: 2026-06-01

## Summary

Phase 5 adds a safe document storage foundation for staged local-disk to S3-compatible object storage migration. Local disk remains the compatibility source and fallback path. New object storage behavior is opt-in through environment configuration, and migration/backfill is never run during application startup.

This phase does not delete local document files as part of object storage migration. The only local deletion behavior preserved is the pre-existing explicit archive permanent-delete flow.

## Pre-Flight Gate

Verified in this workspace:

- `npm run db:migrate:fresh:test` passed.
- `npm run db:migrate:current:test` passed.
- Phase 4.5 repair migration is present in the migration chain.

Manual gates that must be confirmed outside this repo before enabling object storage in staging/production:

- Deploy Phase 4.5 repair migration to staging.
- Confirm `npm run db:migrate:status` is clean in staging.
- Confirm a production database backup plan exists.
- Confirm a local document storage/Liara disk backup plan exists.
- Confirm object storage bucket credentials with a non-production smoke upload before switching to `dual`.

## Files Inspected

- `src/server/document-storage.js`
- `src/server/repositories/documents.js`
- `src/server/public-tracking.js`
- `src/server/routes/public-tracking-routes.js`
- `server.js`
- `src/server/db.js`
- `db/schema.sql`
- `tests/e2e/document-download-print.spec.ts`
- `tests/e2e/security.spec.ts`
- `tests/e2e/audit-logging.spec.ts`

## Current Local Storage Behavior

- Uploads use `multer.memoryStorage()`.
- Files are validated by extension, MIME type, and size.
- Local filenames are UUID-based storage keys under `DOCUMENT_STORAGE_DIR`.
- Internal downloads authorize first, then stream by server-side DB lookup.
- Public downloads require tracking/customer visibility/signature checks and stream by server-side DB lookup.
- Public DTOs are allowlisted and do not include storage locators.

## Schema Fields Added

Migration added: `db/migrations/20260601120000_phase_5_document_storage_foundation.sql`

New additive fields on both `documents` and `document_versions`:

- `storage_provider`
- `object_key`
- `storage_bucket`
- `storage_region`
- `local_path`
- `checksum_sha256`
- `size_bytes`
- `content_type`
- `storage_migrated_at`
- `storage_verified_at`
- `storage_migration_status`
- `storage_migration_error`

Indexes added:

- `documents_storage_migration_status_idx`
- `documents_object_key_idx`
- `document_versions_storage_migration_status_idx`
- `document_versions_object_key_idx`

Existing `storage_key` is preserved.

## Storage Abstraction

Added modules:

- `src/server/storage/storage-config.js`
- `src/server/storage/local-storage.js`
- `src/server/storage/object-storage.js`
- `src/server/storage/document-storage-service.js`
- `src/server/storage/index.js`

The abstraction supports local disk, S3-compatible object storage, and a test-only `local-mock` object provider. It calculates SHA-256 checksums, records size/content type, generates tenant-aware object keys, streams downloads, and redacts storage errors.

## Environment Variables

Added to `.env.example`:

- `DOCUMENT_STORAGE_MODE=local|dual|object`
- `OBJECT_STORAGE_ENABLED`
- `OBJECT_STORAGE_PROVIDER=s3|local-mock`
- `S3_ENDPOINT`
- `S3_REGION`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`
- `S3_DOCUMENT_BUCKET`
- `S3_FORCE_PATH_STYLE`
- `DOCUMENT_STORAGE_DUAL_WRITE_REQUIRED`
- `OBJECT_STORAGE_MOCK_DIR`

Local/dev defaults remain disk-only. If object storage is enabled with S3, missing bucket/credentials fail configuration validation.

## Upload Behavior By Mode

- `local`: write only to local disk; record local migration status.
- `dual`: write local disk first, then object storage. If object write fails and `DOCUMENT_STORAGE_DUAL_WRITE_REQUIRED=false`, keep the local upload and record an object failure status/error without keys in audit/API output.
- `object`: write object storage only for new files; local fallback remains for older records that still have `storage_key`.

Document replacement writes the same storage metadata into the current document row and the new `document_versions` row.

## Download Fallback Behavior

- Authorization and public tracking checks still happen before file access.
- If object storage is enabled and the record has verified object metadata, the server tries object storage first.
- If object read fails and the record has a local `storage_key`, the server logs a safe warning and falls back to local disk.
- If the record is not migrated, the server reads local disk as before.
- Storage source, object key, bucket, region, path, and provider details are not exposed to public customers.

## Public Security Verification

Public document DTOs still contain only:

- `id`
- `title`
- `fileName`
- `fileSize`
- `downloadUrl`
- `createdAt`

Public download lookup rows include private storage metadata only server-side for streaming. The public JSON payload remains allowlisted.

Document API responses and document audit snapshots now filter storage keys, object keys, bucket/region, local path, checksums, and migration internals.

## Backfill Usage

Script: `scripts/backfill-document-storage.ts`

Command:

```bash
npm run documents:storage:backfill -- --batch-size=100
```

Write mode requires:

```bash
npm run documents:storage:backfill -- --execute --batch-size=100
```

Filters:

```bash
npm run documents:storage:backfill -- --organization-id=ORG_ID
npm run documents:storage:backfill -- --document-id=DOCUMENT_ID
```

Behavior:

- Dry-run by default.
- Requires object storage to be enabled/configured.
- Reads local bytes.
- Calculates SHA-256.
- Uploads object.
- Verifies object size and metadata checksum when available.
- Updates migration fields only after verification.
- Does not delete local files.
- Prints summary counts for scanned, skipped, uploaded, verified, failed, and missing local files.

## Verification Usage

Script: `scripts/verify-document-storage.ts`

Command:

```bash
npm run documents:storage:verify -- --batch-size=500
```

Filters:

```bash
npm run documents:storage:verify -- --organization-id=ORG_ID
npm run documents:storage:verify -- --document-id=DOCUMENT_ID
```

Strict object gate:

```bash
npm run documents:storage:verify -- --require-object
```

Behavior:

- Read-only.
- Verifies local file availability.
- Verifies object existence when `object_key` is present.
- Checks local size/checksum when metadata exists.
- Checks object size and metadata checksum when available.
- Reports missing local files, missing object files, size mismatches, and checksum mismatches.

## Rollback Plan

- Set `DOCUMENT_STORAGE_MODE=local`.
- Keep reading from existing local disk.
- Do not delete object storage data.
- Do not rollback metadata columns unless absolutely necessary.
- Keep migration status fields for later retry.
- Re-run `npm run documents:storage:verify` before switching modes again.

## Tests Added Or Updated

- Added `tests/e2e/document-storage-phase5.spec.ts`.
- Updated `tests/e2e/helpers.ts` public payload leak assertions.
- Updated audit redaction coverage through existing `tests/e2e/audit-logging.spec.ts`.

The Phase 5 spec uses `OBJECT_STORAGE_PROVIDER=local-mock` and covers:

- dual-write local + object uploads
- object-only migrated document read
- object read failure fallback to local
- replacement version storage metadata
- public DTO storage leak prevention
- audit log storage redaction
- backfill dry-run no mutation
- backfill execute after verification
- verification script success/failure detection

## Commands Run

- `npm install @aws-sdk/client-s3`
- `npm run lint`
- `npm run build`
- `npm run db:migrate:fresh:test`
- `npm run db:migrate:current:test`
- `npm run safety:check`
- `npm run test:e2e:setup`
- `npx playwright test tests/e2e/document-download-print.spec.ts`
- `npx playwright test tests/e2e/security.spec.ts`
- `npx playwright test tests/e2e/audit-logging.spec.ts`
- `npm run test:e2e:setup`
- `DOCUMENT_STORAGE_MODE=dual OBJECT_STORAGE_ENABLED=true OBJECT_STORAGE_PROVIDER=local-mock OBJECT_STORAGE_MOCK_DIR=storage/test-object-documents S3_DOCUMENT_BUCKET=phase5-test-documents npx playwright test tests/e2e/document-storage-phase5.spec.ts`

## Results

- Lint passed.
- Build passed with the existing large chunk warning.
- Fresh migration verification passed.
- Current-schema migration verification passed.
- Safety check passed with existing warnings about destructive/seed utilities.
- Existing document lifecycle/public access test passed.
- Security regression test passed.
- Audit logging test passed.
- Phase 5 local-mock object storage test passed.

## Failures Or Skipped Checks

- Live S3/Liara object storage was not tested because credentials are not available in this workspace.
- Staging deployment and `db:migrate:status` cleanliness cannot be verified from this local repo and remain a manual gate.
- `npm install @aws-sdk/client-s3` reported existing dependency audit findings: 8 moderate and 1 high vulnerability. These were not introduced into runtime behavior beyond adding the AWS SDK dependency, but should be reviewed separately.

## Remaining Risks

- Live provider metadata behavior can differ from `local-mock`; verify S3/Liara headers, path-style mode, region, and checksum metadata in staging.
- Existing seed/legacy document rows can point at missing local files; verification will report them but will not mutate.
- `dual` mode with `DOCUMENT_STORAGE_DUAL_WRITE_REQUIRED=false` intentionally permits local-only fallback when object writes fail.
- Object storage bucket lifecycle/retention policies must be configured outside the app.

## Phase 6 Recommendation

Phase 6 should run a staged migration rehearsal in staging: deploy Phase 5 in `local`, confirm migrations/status/backups, switch staging to `dual` with real S3-compatible credentials, upload and replace test documents, run dry-run backfill, run execute backfill in small batches, run verification with `--require-object`, and only then consider production `dual`. Do not switch production to `object` until every active production document and version is verified in object storage and local disk backups are retained.
