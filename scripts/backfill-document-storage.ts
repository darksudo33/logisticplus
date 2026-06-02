// @ts-nocheck
import "dotenv/config";
import pg from "pg";
import {
  createObjectStorageProvider,
} from "../src/server/storage/object-storage.js";
import {
  readLocalObjectBuffer,
} from "../src/server/storage/local-storage.js";
import {
  generateDocumentObjectKey,
  sha256Hex,
} from "../src/server/storage/document-storage-service.js";
import {
  resolveDocumentStorageConfig,
  validateObjectStorageConfig,
} from "../src/server/storage/storage-config.js";

const { Client } = pg;

const databaseUrl = process.env.DATABASE_URL || "postgres://postgres@localhost:5432/logisticplus";

function parseArgs(argv) {
  const args = {
    execute: false,
    batchSize: 100,
    organizationId: null,
    documentId: null,
  };
  for (const arg of argv) {
    if (arg === "--execute") args.execute = true;
    else if (arg.startsWith("--batch-size=")) args.batchSize = Math.max(1, Number(arg.split("=")[1] || 100));
    else if (arg.startsWith("--organization-id=")) args.organizationId = arg.split("=").slice(1).join("=") || null;
    else if (arg.startsWith("--document-id=")) args.documentId = arg.split("=").slice(1).join("=") || null;
  }
  return args;
}

function redactedId(value = "") {
  const text = String(value || "");
  if (text.length <= 12) return text;
  return `${text.slice(0, 6)}...${text.slice(-4)}`;
}

function contentTypeFor(row) {
  return row.content_type || row.mime_type || "application/octet-stream";
}

function checksumFromObjectHead(head) {
  const metadata = head?.metadata || {};
  return metadata.checksumSha256 || metadata.checksumsha256 || metadata["checksum-sha256"] || null;
}

async function loadCandidates(client, { batchSize, organizationId, documentId }) {
  const result = await client.query(
    `SELECT *
     FROM (
       SELECT
         'documents' AS source_table,
         d.id AS row_id,
         d.id AS document_id,
         d.organization_id,
         d.file_name,
         d.mime_type,
         d.storage_key,
         d.object_key,
         d.checksum AS legacy_checksum,
         d.checksum_sha256,
         d.size_bytes,
         d.content_type,
         d.storage_migration_status,
         d.storage_verified_at,
         d.updated_at AS sort_at
       FROM documents d
       WHERE d.storage_key IS NOT NULL
         AND d.storage_key <> ''
         AND ($1::text IS NULL OR d.organization_id = $1)
         AND ($2::text IS NULL OR d.id = $2)
         AND (
           d.object_key IS NULL
           OR d.storage_verified_at IS NULL
           OR d.storage_migration_status IS DISTINCT FROM 'verified'
         )
       UNION ALL
       SELECT
         'document_versions' AS source_table,
         v.id AS row_id,
         v.document_id,
         v.organization_id,
         v.file_name,
         d.mime_type,
         v.storage_key,
         v.object_key,
         d.checksum AS legacy_checksum,
         COALESCE(v.checksum_sha256, d.checksum_sha256, d.checksum) AS checksum_sha256,
         COALESCE(v.size_bytes, d.size_bytes) AS size_bytes,
         COALESCE(v.content_type, d.content_type, d.mime_type) AS content_type,
         v.storage_migration_status,
         v.storage_verified_at,
         v.created_at AS sort_at
       FROM document_versions v
       JOIN documents d ON d.id = v.document_id
       WHERE v.storage_key IS NOT NULL
         AND v.storage_key <> ''
         AND ($1::text IS NULL OR v.organization_id = $1)
         AND ($2::text IS NULL OR v.document_id = $2)
         AND (
           v.object_key IS NULL
           OR v.storage_verified_at IS NULL
           OR v.storage_migration_status IS DISTINCT FROM 'verified'
         )
     ) candidates
     ORDER BY sort_at ASC, source_table ASC, row_id ASC
     LIMIT $3`,
    [organizationId, documentId, batchSize]
  );
  return result.rows;
}

async function updateMigratedRow(client, row, objectResult, checksum, sizeBytes, contentType) {
  const table = row.source_table === "document_versions" ? "document_versions" : "documents";
  const timestampUpdate = table === "documents" ? ", updated_at = NOW()" : "";
  await client.query(
    `UPDATE ${table}
     SET storage_provider = $2,
         object_key = $3,
         storage_bucket = $4,
         storage_region = $5,
         local_path = COALESCE(local_path, storage_key),
         checksum_sha256 = $6,
         size_bytes = $7,
         content_type = $8,
         storage_migrated_at = NOW(),
         storage_verified_at = NOW(),
         storage_migration_status = 'verified',
         storage_migration_error = NULL
         ${timestampUpdate}
     WHERE id = $1
       AND organization_id = $9`,
    [
      row.row_id,
      objectResult.provider,
      objectResult.key,
      objectResult.bucket || null,
      objectResult.region || null,
      checksum,
      sizeBytes,
      contentType,
      row.organization_id,
    ]
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = resolveDocumentStorageConfig();
  const configErrors = validateObjectStorageConfig(config);
  if (!config.objectEnabled) {
    throw new Error("Object storage is disabled. Set OBJECT_STORAGE_ENABLED=true or DOCUMENT_STORAGE_MODE=dual before backfill.");
  }
  if (configErrors.length) {
    throw new Error(configErrors.join(" "));
  }

  const provider = createObjectStorageProvider(config);
  const client = new Client({ connectionString: databaseUrl });
  const summary = {
    dryRun: !args.execute,
    scanned: 0,
    skipped: 0,
    uploaded: 0,
    verified: 0,
    failed: 0,
    missingLocalFiles: 0,
  };

  await client.connect();
  try {
    const candidates = await loadCandidates(client, args);
    for (const row of candidates) {
      summary.scanned += 1;
      const buffer = await readLocalObjectBuffer(row.storage_key);
      if (!buffer) {
        summary.missingLocalFiles += 1;
        summary.failed += 1;
        console.warn(`missing local file for ${row.source_table}:${redactedId(row.row_id)}`);
        continue;
      }

      const checksum = sha256Hex(buffer);
      const expectedChecksum = row.checksum_sha256 || row.legacy_checksum || null;
      if (expectedChecksum && expectedChecksum !== checksum) {
        summary.failed += 1;
        console.warn(`checksum mismatch for ${row.source_table}:${redactedId(row.row_id)}`);
        continue;
      }

      if (!args.execute) {
        summary.skipped += 1;
        continue;
      }

      const contentType = contentTypeFor(row);
      const objectKey = row.object_key || generateDocumentObjectKey({
        organizationId: row.organization_id,
        fileName: row.file_name || row.document_id,
        id: row.row_id,
      });
      const objectResult = await provider.putObject({
        key: objectKey,
        body: buffer,
        contentType,
        metadata: {
          checksumSha256: checksum,
          documentId: String(row.document_id || ""),
          rowId: String(row.row_id || ""),
        },
      });
      summary.uploaded += 1;

      const head = await provider.headObject({ key: objectKey });
      const sizeBytes = Number(buffer.length || 0);
      const remoteSize = Number(head?.contentLength || head?.size || 0);
      const remoteChecksum = checksumFromObjectHead(head);
      if (!head || remoteSize !== sizeBytes || (remoteChecksum && remoteChecksum !== checksum)) {
        summary.failed += 1;
        console.warn(`object verification failed for ${row.source_table}:${redactedId(row.row_id)}`);
        continue;
      }

      await updateMigratedRow(client, row, objectResult, checksum, sizeBytes, contentType);
      summary.verified += 1;
    }
  } finally {
    await client.end();
  }

  console.log(JSON.stringify(summary, null, 2));
  if (summary.failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
