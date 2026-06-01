import { expect, test } from "@playwright/test";
import path from "node:path";
import pg from "pg";
import {
  apiContext,
  disposeContexts,
  expectUnavailable,
  loginApi,
  readOk,
} from "./helpers";

const { Client } = pg;
const testDatabaseUrl = process.env.TEST_DATABASE_URL || "postgres://postgres@localhost:5432/logisticplus_test";

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

async function replaceDocument(
  context: Awaited<ReturnType<typeof loginApi>>,
  documentId: string,
  file: { name: string; mimeType: string; buffer: Buffer },
  fields: Record<string, string> = {}
) {
  return context.post(`/api/documents/${encodeURIComponent(documentId)}/replace`, {
    multipart: {
      title: fields.title || file.name,
      type: fields.type || "OTHER",
      ...fields,
      file,
    },
  });
}

async function withDb<T>(fn: (client: any) => Promise<T>) {
  const client = new Client({ connectionString: testDatabaseUrl });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

test.describe.serial("document security lifecycle edge cases", () => {
  test("sanitizes filenames, replaces versions, and blocks private or archived public access", async () => {
    const owner = await loginApi();
    const publicContext = await apiContext();
    const marker = `document-security-${Date.now()}`;

    try {
      const uploaded = await readOk<any>(
        await uploadDocument(
          owner,
          {
            name: "..\\..\\evil<script>.txt",
            mimeType: "text/plain",
            buffer: Buffer.from(`original ${marker}`),
          },
          {
            title: `Document Security ${marker}`,
            shipmentId: "s1",
            visibility: "internal",
          }
        )
      );

      const stored = await withDb(async (client) => {
        const result = await client.query(
          "SELECT file_name, storage_key, version FROM documents WHERE id = $1",
          [uploaded.id]
        );
        return result.rows[0];
      });
      expect(stored.storage_key).toBe(path.basename(stored.storage_key));
      expect(stored.storage_key).not.toMatch(/[\\/]/);
      expect(stored.file_name).not.toContain("..");
      expect(stored.file_name).not.toContain("<script>");

      const access = await readOk<{ token: string }>(
        await owner.post("/api/shipments/s1/customer-access/generate")
      );
      await expectUnavailable(
        await publicContext.get(`/api/public/track/${encodeURIComponent(access.token)}/documents/${uploaded.id}`)
      );
      await expectUnavailable(await publicContext.get(`/api/public/documents/${uploaded.id}`));

      const replacement = await readOk<any>(
        await replaceDocument(
          owner,
          uploaded.id,
          {
            name: "replacement.txt",
            mimeType: "text/plain",
            buffer: Buffer.from(`replacement ${marker}`),
          },
          {
            title: `Document Security Replacement ${marker}`,
          }
        )
      );
      expect(Number(replacement.version || 0)).toBeGreaterThanOrEqual(2);
      const protectedDownload = await owner.get(`/api/documents/${uploaded.id}/download`);
      expect(protectedDownload.status(), await protectedDownload.text()).toBe(200);
      expect(await protectedDownload.text()).toBe(`replacement ${marker}`);

      const versions = await withDb(async (client) => {
        const result = await client.query(
          "SELECT COUNT(*)::int AS count FROM document_versions WHERE document_id = $1",
          [uploaded.id]
        );
        return result.rows[0]?.count || 0;
      });
      expect(versions).toBeGreaterThanOrEqual(1);

      await readOk(
        await owner.patch(`/api/documents/${uploaded.id}/visibility`, {
          data: { visibility: "customer_visible" },
        })
      );
      const publicDownload = await publicContext.get(`/api/public/documents/${uploaded.id}`);
      expect(publicDownload.status(), await publicDownload.text()).toBe(200);
      expect(publicDownload.headers()["x-content-type-options"]).toBe("nosniff");

      await readOk(await owner.post(`/api/documents/${uploaded.id}/archive`));
      await expectUnavailable(await owner.get(`/api/documents/${uploaded.id}/download`));
      await expectUnavailable(await publicContext.get(`/api/public/documents/${uploaded.id}`));
      await expectUnavailable(
        await publicContext.get(`/api/public/track/${encodeURIComponent(access.token)}/documents/${uploaded.id}`)
      );

      const oversized = await uploadDocument(owner, {
        name: "oversized.txt",
        mimeType: "text/plain",
        buffer: Buffer.alloc(26 * 1024 * 1024, "a"),
      });
      expect(oversized.status(), await oversized.text()).toBe(413);
    } finally {
      await owner.post("/api/shipments/s1/customer-access/disable").catch(() => null);
      await disposeContexts(owner, publicContext);
    }
  });
});
