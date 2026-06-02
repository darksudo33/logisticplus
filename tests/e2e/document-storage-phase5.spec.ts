import { expect, test } from "@playwright/test";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import {
  apiContext,
  disposeContexts,
  expectPublicTrackingPayloadIsSafe,
  loginApi,
  readOk,
} from "./helpers";

const { Client } = pg;

const testDatabaseUrl = process.env.TEST_DATABASE_URL || "postgres://postgres@localhost:5432/logisticplus_test";
const testDocumentStorageDir = process.env.TEST_DOCUMENT_STORAGE_DIR || "storage/test-documents";
const testObjectStorageDir = process.env.OBJECT_STORAGE_MOCK_DIR || "storage/test-object-documents";
const phase5StorageEnabled =
  process.env.DOCUMENT_STORAGE_MODE === "dual" &&
  process.env.OBJECT_STORAGE_PROVIDER === "local-mock";

async function dbQuery(sql: string, params: any[] = []) {
  const client = new Client({ connectionString: testDatabaseUrl });
  await client.connect();
  try {
    return await client.query(sql, params);
  } finally {
    await client.end();
  }
}

async function uploadDocument(
  context: Awaited<ReturnType<typeof loginApi>>,
  file: { name: string; mimeType: string; buffer: Buffer },
  fields: Record<string, string> = {}
) {
  return context.post("/api/documents/upload", {
    multipart: {
      title: fields.title || file.name,
      type: fields.type || "OTHER",
      ...fields,
      file,
    },
  });
}

function storagePath(storageKey: string) {
  return path.resolve(process.cwd(), testDocumentStorageDir, storageKey);
}

function objectPath(objectKey: string) {
  return path.resolve(process.cwd(), testObjectStorageDir, objectKey);
}

async function exists(filePath: string) {
  try {
    await fs.stat(filePath);
    return true;
  } catch {
    return false;
  }
}

function expectNoStorageLeak(value: unknown) {
  const serialized = JSON.stringify(value).toLowerCase();
  for (const forbidden of [
    "storage_key",
    "storagekey",
    "object_key",
    "objectkey",
    "storage_bucket",
    "storagebucket",
    "storage_region",
    "storageregion",
    "local_path",
    "localpath",
  ]) {
    expect(serialized).not.toContain(forbidden);
  }
}

function runScript(scriptPath: string, args: string[] = []) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    execFile(
      process.execPath,
      ["--import", "tsx", scriptPath, ...args],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          DATABASE_URL: testDatabaseUrl,
          DOCUMENT_STORAGE_DIR: testDocumentStorageDir,
          DOCUMENT_STORAGE_MODE: "dual",
          OBJECT_STORAGE_ENABLED: "true",
          OBJECT_STORAGE_PROVIDER: "local-mock",
          OBJECT_STORAGE_MOCK_DIR: testObjectStorageDir,
          S3_DOCUMENT_BUCKET: "phase5-test-documents",
        },
      },
      (error: any, stdout, stderr) => {
        if (error && typeof error.code !== "number") return reject(error);
        resolve({ code: error?.code ?? 0, stdout, stderr });
      }
    );
  });
}

async function documentStorageRow(documentId: string) {
  const result = await dbQuery(
    `SELECT id, storage_key, storage_provider, object_key, storage_bucket,
            storage_region, local_path, checksum_sha256, size_bytes, content_type,
            storage_verified_at, storage_migration_status
     FROM documents
     WHERE id = $1`,
    [documentId]
  );
  return result.rows[0];
}

test.describe.serial("Phase 5 document storage foundation", () => {
  test.skip(!phase5StorageEnabled, "Run with DOCUMENT_STORAGE_MODE=dual and OBJECT_STORAGE_PROVIDER=local-mock.");

  test.beforeAll(async () => {
    const resolved = path.resolve(process.cwd(), testObjectStorageDir);
    expect(resolved.toLowerCase()).toContain("test");
    await fs.rm(resolved, { recursive: true, force: true });
    await fs.mkdir(resolved, { recursive: true });
  });

  test("dual-writes uploads/replacements, keeps public DTOs safe, and redacts audit storage values", async () => {
    const owner = await loginApi();
    const publicContext = await apiContext();
    const marker = `phase5 dual write ${Date.now()}`;

    const uploaded = await readOk<any>(
      await uploadDocument(
        owner,
        {
          name: "phase5-dual.txt",
          mimeType: "text/plain",
          buffer: Buffer.from(marker),
        },
        {
          shipmentId: "s1",
          visibility: "customer_visible",
        }
      )
    );
    expectNoStorageLeak(uploaded);

    const row = await documentStorageRow(uploaded.id);
    expect(row.storage_key).toBeTruthy();
    expect(row.object_key).toBeTruthy();
    expect(row.storage_provider).toBe("local-mock");
    expect(row.storage_migration_status).toBe("verified");
    expect(row.storage_verified_at).toBeTruthy();
    await expect.poll(() => exists(storagePath(row.storage_key))).toBe(true);
    await expect.poll(() => exists(objectPath(row.object_key))).toBe(true);

    const download = await owner.get(`/api/documents/${encodeURIComponent(uploaded.id)}/download`);
    expect(download.status(), await download.text()).toBe(200);
    expect(await download.text()).toBe(marker);

    const access = await readOk<any>(await owner.post("/api/shipments/s1/customer-access/generate"));
    const publicTrack = await readOk<any>(await publicContext.get(`/api/public/track/${encodeURIComponent(access.token)}`));
    expectPublicTrackingPayloadIsSafe(publicTrack);
    const publicDocument = publicTrack.documents.find((item: any) => item.id === uploaded.id);
    expect(publicDocument).toBeTruthy();
    expectNoStorageLeak(publicDocument);
    const publicDownload = await publicContext.get(publicDocument.downloadUrl);
    expect(publicDownload.status(), await publicDownload.text()).toBe(200);
    expect(await publicDownload.text()).toBe(marker);

    const replacementMarker = `phase5 replacement ${Date.now()}`;
    const replaced = await readOk<any>(
      await owner.post(`/api/documents/${encodeURIComponent(uploaded.id)}/replace`, {
        multipart: {
          file: {
            name: "phase5-replaced.txt",
            mimeType: "text/plain",
            buffer: Buffer.from(replacementMarker),
          },
        },
      })
    );
    expectNoStorageLeak(replaced);
    const versionRows = await dbQuery(
      `SELECT version, storage_key, object_key, storage_migration_status
       FROM document_versions
       WHERE document_id = $1
       ORDER BY version ASC`,
      [uploaded.id]
    );
    expect(versionRows.rows).toHaveLength(2);
    for (const version of versionRows.rows) {
      expect(version.storage_key).toBeTruthy();
      expect(version.object_key).toBeTruthy();
      expect(version.storage_migration_status).toBe("verified");
    }
    const replacedDownload = await owner.get(`/api/documents/${encodeURIComponent(uploaded.id)}/download`);
    expect(replacedDownload.status(), await replacedDownload.text()).toBe(200);
    expect(await replacedDownload.text()).toBe(replacementMarker);

    const audit = await dbQuery(
      `SELECT before_json, after_json, metadata_json
       FROM audit_logs
       WHERE resource_type = 'DOCUMENT'
         AND resource_id = $1
       ORDER BY created_at ASC`,
      [uploaded.id]
    );
    const auditText = JSON.stringify(audit.rows).toLowerCase();
    expect(auditText).not.toContain(String(row.storage_key).toLowerCase());
    expect(auditText).not.toContain(String(row.object_key).toLowerCase());
    expect(auditText).not.toContain("storage_key");
    expect(auditText).not.toContain("object_key");
    expect(auditText).not.toContain("local_path");
    expect(auditText).not.toContain("storage_bucket");

    await disposeContexts(owner, publicContext);
  });

  test("reads object-only migrated records and falls back to local when object storage is unavailable", async () => {
    const owner = await loginApi();
    const objectMarker = `phase5 object read ${Date.now()}`;
    const objectOnly = await readOk<any>(
      await uploadDocument(owner, {
        name: "phase5-object-only.txt",
        mimeType: "text/plain",
        buffer: Buffer.from(objectMarker),
      })
    );
    const objectRow = await documentStorageRow(objectOnly.id);
    await dbQuery("UPDATE documents SET storage_key = NULL, local_path = NULL WHERE id = $1", [objectOnly.id]);
    const objectDownload = await owner.get(`/api/documents/${encodeURIComponent(objectOnly.id)}/download`);
    expect(objectDownload.status(), await objectDownload.text()).toBe(200);
    expect(await objectDownload.text()).toBe(objectMarker);

    const fallbackMarker = `phase5 fallback ${Date.now()}`;
    const fallback = await readOk<any>(
      await uploadDocument(owner, {
        name: "phase5-fallback.txt",
        mimeType: "text/plain",
        buffer: Buffer.from(fallbackMarker),
      })
    );
    const fallbackRow = await documentStorageRow(fallback.id);
    await fs.rm(objectPath(fallbackRow.object_key), { force: true });
    await fs.rm(`${objectPath(fallbackRow.object_key)}.metadata.json`, { force: true });
    const fallbackDownload = await owner.get(`/api/documents/${encodeURIComponent(fallback.id)}/download`);
    expect(fallbackDownload.status(), await fallbackDownload.text()).toBe(200);
    expect(await fallbackDownload.text()).toBe(fallbackMarker);

    const verifyMissing = await runScript("scripts/verify-document-storage.ts", [
      `--document-id=${fallback.id}`,
      "--require-object",
    ]);
    expect(verifyMissing.code).not.toBe(0);
    expect(verifyMissing.stdout).toContain('"missingObjectFiles"');
    expect(objectRow.object_key).toBeTruthy();

    await disposeContexts(owner);
  });

  test("backfill dry-run does not mutate, execute verifies before updating, and verification passes", async () => {
    const owner = await loginApi();
    const marker = `phase5 backfill ${Date.now()}`;
    const uploaded = await readOk<any>(
      await uploadDocument(owner, {
        name: "phase5-backfill.txt",
        mimeType: "text/plain",
        buffer: Buffer.from(marker),
      })
    );
    await dbQuery(
      `UPDATE documents
       SET storage_provider = 'local',
           object_key = NULL,
           storage_bucket = NULL,
           storage_region = NULL,
           storage_migrated_at = NULL,
           storage_verified_at = NULL,
           storage_migration_status = 'local',
           storage_migration_error = NULL
       WHERE id = $1`,
      [uploaded.id]
    );
    await dbQuery(
      `UPDATE document_versions
       SET storage_provider = 'local',
           object_key = NULL,
           storage_bucket = NULL,
           storage_region = NULL,
           storage_migrated_at = NULL,
           storage_verified_at = NULL,
           storage_migration_status = 'local',
           storage_migration_error = NULL
       WHERE document_id = $1`,
      [uploaded.id]
    );

    const dryRun = await runScript("scripts/backfill-document-storage.ts", [`--document-id=${uploaded.id}`]);
    expect(dryRun.code, dryRun.stderr).toBe(0);
    expect(dryRun.stdout).toContain('"dryRun": true');
    expect((await documentStorageRow(uploaded.id)).object_key).toBeNull();

    const execute = await runScript("scripts/backfill-document-storage.ts", [
      "--execute",
      `--document-id=${uploaded.id}`,
    ]);
    expect(execute.code, execute.stderr).toBe(0);
    expect(execute.stdout).toContain('"verified"');

    const row = await documentStorageRow(uploaded.id);
    expect(row.object_key).toBeTruthy();
    expect(row.storage_migration_status).toBe("verified");
    await expect.poll(() => exists(objectPath(row.object_key))).toBe(true);

    const verify = await runScript("scripts/verify-document-storage.ts", [`--document-id=${uploaded.id}`]);
    expect(verify.code, verify.stderr).toBe(0);
    expect(verify.stdout).toContain('"objectVerified"');

    await disposeContexts(owner);
  });
});
