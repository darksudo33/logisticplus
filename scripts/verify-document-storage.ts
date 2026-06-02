// @ts-nocheck
import "dotenv/config";
import pg from "pg";
import {
  createObjectStorageProvider,
} from "../src/server/storage/object-storage.js";
import {
  headLocalObject,
  readLocalObjectBuffer,
} from "../src/server/storage/local-storage.js";
import {
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
    batchSize: 500,
    organizationId: null,
    documentId: null,
    requireObject: false,
  };
  for (const arg of argv) {
    if (arg === "--require-object") args.requireObject = true;
    else if (arg.startsWith("--batch-size=")) args.batchSize = Math.max(1, Number(arg.split("=")[1] || 500));
    else if (arg.startsWith("--organization-id=")) args.organizationId = arg.split("=").slice(1).join("=") || null;
    else if (arg.startsWith("--document-id=")) args.documentId = arg.split("=").slice(1).join("=") || null;
  }
  return args;
}

function checksumFromObjectHead(head) {
  const metadata = head?.metadata || {};
  return metadata.checksumSha256 || metadata.checksumsha256 || metadata["checksum-sha256"] || null;
}

function redactedId(value = "") {
  const text = String(value || "");
  if (text.length <= 12) return text;
  return `${text.slice(0, 6)}...${text.slice(-4)}`;
}

async function loadRows(client, { batchSize, organizationId, documentId }) {
  const result = await client.query(
    `SELECT *
     FROM (
       SELECT
         'documents' AS source_table,
         d.id AS row_id,
         d.id AS document_id,
         d.organization_id,
         d.storage_key,
         d.object_key,
         d.checksum AS legacy_checksum,
         d.checksum_sha256,
         d.size_bytes,
         d.storage_migration_status,
         d.storage_verified_at,
         d.updated_at AS sort_at
       FROM documents d
       WHERE ($1::text IS NULL OR d.organization_id = $1)
         AND ($2::text IS NULL OR d.id = $2)
       UNION ALL
       SELECT
         'document_versions' AS source_table,
         v.id AS row_id,
         v.document_id,
         v.organization_id,
         v.storage_key,
         v.object_key,
         d.checksum AS legacy_checksum,
         COALESCE(v.checksum_sha256, d.checksum_sha256, d.checksum) AS checksum_sha256,
         COALESCE(v.size_bytes, d.size_bytes) AS size_bytes,
         v.storage_migration_status,
         v.storage_verified_at,
         v.created_at AS sort_at
       FROM document_versions v
       JOIN documents d ON d.id = v.document_id
       WHERE ($1::text IS NULL OR v.organization_id = $1)
         AND ($2::text IS NULL OR v.document_id = $2)
     ) rows
     ORDER BY sort_at ASC, source_table ASC, row_id ASC
     LIMIT $3`,
    [organizationId, documentId, batchSize]
  );
  return result.rows;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = resolveDocumentStorageConfig();
  const needsObjectProvider = config.objectEnabled || args.requireObject;
  const provider = needsObjectProvider && validateObjectStorageConfig(config).length === 0
    ? createObjectStorageProvider(config)
    : null;

  const client = new Client({ connectionString: databaseUrl });
  const summary = {
    scanned: 0,
    skipped: 0,
    localVerified: 0,
    objectVerified: 0,
    missingLocalFiles: 0,
    missingObjectFiles: 0,
    checksumMismatches: 0,
    sizeMismatches: 0,
    objectConfigSkipped: 0,
    failed: 0,
  };

  await client.connect();
  try {
    const rows = await loadRows(client, args);
    for (const row of rows) {
      summary.scanned += 1;
      const label = `${row.source_table}:${redactedId(row.row_id)}`;
      if (!row.storage_key && !row.object_key) {
        summary.skipped += 1;
        continue;
      }

      if (row.storage_key) {
        const localHead = await headLocalObject(row.storage_key);
        if (!localHead) {
          summary.missingLocalFiles += 1;
          summary.failed += 1;
          console.warn(`missing local file for ${label}`);
        } else {
          summary.localVerified += 1;
          if (row.size_bytes && Number(row.size_bytes) !== Number(localHead.size)) {
            summary.sizeMismatches += 1;
            summary.failed += 1;
            console.warn(`local size mismatch for ${label}`);
          }
          const expectedChecksum = row.checksum_sha256 || row.legacy_checksum || null;
          if (expectedChecksum) {
            const buffer = await readLocalObjectBuffer(row.storage_key);
            const checksum = buffer ? sha256Hex(buffer) : null;
            if (checksum && checksum !== expectedChecksum) {
              summary.checksumMismatches += 1;
              summary.failed += 1;
              console.warn(`local checksum mismatch for ${label}`);
            }
          }
        }
      }

      if (!row.object_key) {
        if (args.requireObject) {
          summary.missingObjectFiles += 1;
          summary.failed += 1;
          console.warn(`missing object key for ${label}`);
        }
        continue;
      }

      if (!provider) {
        summary.objectConfigSkipped += 1;
        if (args.requireObject) summary.failed += 1;
        continue;
      }

      const objectHead = await provider.headObject({ key: row.object_key });
      if (!objectHead) {
        summary.missingObjectFiles += 1;
        summary.failed += 1;
        console.warn(`missing object file for ${label}`);
        continue;
      }

      summary.objectVerified += 1;
      if (row.size_bytes && Number(row.size_bytes) !== Number(objectHead.contentLength || objectHead.size || 0)) {
        summary.sizeMismatches += 1;
        summary.failed += 1;
        console.warn(`object size mismatch for ${label}`);
      }
      const expectedChecksum = row.checksum_sha256 || row.legacy_checksum || null;
      const remoteChecksum = checksumFromObjectHead(objectHead);
      if (expectedChecksum && remoteChecksum && expectedChecksum !== remoteChecksum) {
        summary.checksumMismatches += 1;
        summary.failed += 1;
        console.warn(`object checksum mismatch for ${label}`);
      }
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
