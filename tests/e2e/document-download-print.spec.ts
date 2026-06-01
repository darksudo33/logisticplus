import { expect, test } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import {
  apiContext,
  disposeContexts,
  expectPublicTrackingPayloadIsSafe,
  expectUnavailable,
  loginApi,
  loginViaUi,
  readOk,
} from "./helpers";

const { Client } = pg;

const testDatabaseUrl = process.env.TEST_DATABASE_URL || "postgres://postgres@localhost:5432/logisticplus_test";
const testDocumentStorageDir = process.env.TEST_DOCUMENT_STORAGE_DIR || "storage/test-documents";

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

async function withDb<T>(callback: (client: any) => Promise<T>) {
  const client = new Client({ connectionString: testDatabaseUrl });
  await client.connect();
  try {
    return await callback(client);
  } finally {
    await client.end();
  }
}

async function storageKeysForDocument(documentId: string) {
  return withDb(async (client) => {
    const result = await client.query(
      `SELECT storage_key FROM documents WHERE id = $1
       UNION
       SELECT storage_key FROM document_versions WHERE document_id = $1`,
      [documentId]
    );
    return result.rows.map((row) => row.storage_key).filter(Boolean) as string[];
  });
}

function storagePath(storageKey: string) {
  return path.resolve(process.cwd(), testDocumentStorageDir, storageKey);
}

async function exists(filePath: string) {
  try {
    await fs.stat(filePath);
    return true;
  } catch {
    return false;
  }
}

function isIgnorableDevServerMessage(message: string) {
  return (
    message.includes("WebSocket connection to") ||
    message.includes("[vite] failed to connect to websocket") ||
    message.includes("WebSocket closed without opened") ||
    message.includes("favicon.ico")
  );
}

test.describe.serial("document download, public access, archive, and print/export flows", () => {
  test("keeps document files downloadable, public-safe, restorable, and removable from disk", async () => {
    const owner = await loginApi();
    const publicContext = await apiContext();
    const marker = `document lifecycle smoke ${Date.now()}`;
    const title = `E2E Document Lifecycle ${Date.now()}`;

    const uploaded = await readOk<any>(
      await uploadDocument(
        owner,
        {
          name: "lifecycle.txt",
          mimeType: "text/plain",
          buffer: Buffer.from(marker),
        },
        {
          title,
          shipmentId: "s1",
          visibility: "customer_visible",
        }
      )
    );

    const csvUpload = await readOk<any>(
      await uploadDocument(owner, {
        name: "browser-csv.csv",
        mimeType: "text/plain",
        buffer: Buffer.from("name,value\nLogistic Plus,1\n"),
      })
    );
    expect(csvUpload.id).toBeTruthy();

    const storageKeys = await storageKeysForDocument(uploaded.id);
    expect(storageKeys.length).toBeGreaterThan(0);
    for (const key of storageKeys) {
      await expect.poll(() => exists(storagePath(key))).toBe(true);
    }

    const protectedDownload = await owner.get(`/api/documents/${encodeURIComponent(uploaded.id)}/download`);
    expect(protectedDownload.status(), await protectedDownload.text()).toBe(200);
    expect(protectedDownload.headers()["x-content-type-options"]).toBe("nosniff");
    expect(protectedDownload.headers()["content-length"]).toBe(String(Buffer.byteLength(marker)));
    expect(protectedDownload.headers()["content-disposition"]).toContain("filename=");
    expect(protectedDownload.headers()["content-disposition"]).toContain("filename*=");
    expect(await protectedDownload.text()).toBe(marker);

    const access = await readOk<any>(await owner.post("/api/shipments/s1/customer-access/generate"));
    const publicTrack = await readOk<any>(await publicContext.get(`/api/public/track/${encodeURIComponent(access.token)}`));
    expectPublicTrackingPayloadIsSafe(publicTrack);
    expect(publicTrack.documents.some((document: any) => document.id === uploaded.id)).toBe(true);

    const publicTrackDownload = await publicContext.get(
      `/api/public/track/${encodeURIComponent(access.token)}/documents/${encodeURIComponent(uploaded.id)}`
    );
    expect(publicTrackDownload.status(), await publicTrackDownload.text()).toBe(200);
    expect(publicTrackDownload.headers()["x-content-type-options"]).toBe("nosniff");
    expect(await publicTrackDownload.text()).toBe(marker);

    const publicDirectDownload = await publicContext.get(`/api/public/documents/${encodeURIComponent(uploaded.id)}`);
    expect(publicDirectDownload.status(), await publicDirectDownload.text()).toBe(200);
    expect(await publicDirectDownload.text()).toBe(marker);

    await readOk(await owner.post(`/api/documents/${encodeURIComponent(uploaded.id)}/archive`));
    await expectUnavailable(await owner.get(`/api/documents/${encodeURIComponent(uploaded.id)}/download`));
    await expectUnavailable(
      await publicContext.get(`/api/public/track/${encodeURIComponent(access.token)}/documents/${encodeURIComponent(uploaded.id)}`)
    );
    await readOk(await owner.post("/api/shipments/s1/customer-access/disable"));

    await readOk(await owner.post(`/api/archive/document/${encodeURIComponent(uploaded.id)}/restore`));
    const restoredDownload = await owner.get(`/api/documents/${encodeURIComponent(uploaded.id)}/download`);
    expect(restoredDownload.status(), await restoredDownload.text()).toBe(200);
    expect(await restoredDownload.text()).toBe(marker);

    await readOk(await owner.post(`/api/documents/${encodeURIComponent(uploaded.id)}/archive`));
    await readOk(await owner.delete(`/api/archive/document/${encodeURIComponent(uploaded.id)}`));
    await expectUnavailable(await owner.get(`/api/documents/${encodeURIComponent(uploaded.id)}/download`));
    expect(await storageKeysForDocument(uploaded.id)).toEqual([]);
    for (const key of storageKeys) {
      await expect.poll(() => exists(storagePath(key))).toBe(false);
    }

    await disposeContexts(owner, publicContext);
  });

  test("renders document download links and prints only the selected quotation", async ({ page }) => {
    const owner = await loginApi();
    const title = `E2E UI Download ${Date.now()}`;
    const uploaded = await readOk<any>(
      await uploadDocument(
        owner,
        {
          name: "ui-download.txt",
          mimeType: "text/plain",
          buffer: Buffer.from("ui download smoke"),
        },
        {
          title,
          shipmentId: "s1",
        }
      )
    );

    const quote = await readOk<any>(
      await owner.post("/api/quotations", {
        data: {
          customerName: `E2E Print Customer ${Date.now()}`,
          customerPhone: "09120000000",
          originCity: "Tehran",
          destinationCity: "Bandar Abbas",
          cargoType: "GENERAL",
          weight: 1,
          dimensions: "1x1x1",
          requirements: [],
          baseRate: 1000000,
          fuelSurcharge: 100000,
          loadingFees: 50000,
          tollFees: 50000,
          insurancePercentage: 1,
          profitMargin: 10,
          totalPrice: 1320000,
          validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          status: "PENDING",
        },
      })
    );

    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error" && !isIgnorableDevServerMessage(message.text())) consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => {
      if (!isIgnorableDevServerMessage(error.message)) consoleErrors.push(error.message);
    });
    await page.addInitScript(() => {
      (window as any).__printCalls = 0;
      (window as any).__activePrintBlocks = 0;
      (window as any).__printTitle = "";
      window.print = () => {
        (window as any).__printCalls += 1;
        (window as any).__activePrintBlocks = document.querySelectorAll('.print-content[data-print-active="true"]').length;
        (window as any).__printTitle = document.title;
        window.dispatchEvent(new Event("afterprint"));
      };
    });

    await loginViaUi(page);
    for (const route of ["/documents", "/shipments/s1", "/track/search", "/quotations"]) {
      await page.goto(route);
      await expect(page.locator("h1").first()).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
      expect(overflow).toBe(false);
    }

    await page.goto("/documents");
    const documentsDownload = page.getByLabel(`Download ${title}`).first();
    await expect(documentsDownload).toBeVisible();
    expect(await documentsDownload.getAttribute("href")).toBe(`/api/documents/${uploaded.id}/download`);

    await page.goto("/shipments/s1");
    const shipmentDownload = page.getByLabel(`Download ${title}`).first();
    await expect(shipmentDownload).toBeVisible();
    expect(await shipmentDownload.getAttribute("href")).toBe(`/api/documents/${uploaded.id}/download`);

    await page.goto("/quotations");
    const originalTitle = await page.title();
    await page.getByLabel(`Print quotation ${quote.id}`).first().click();
    await expect.poll(() => page.evaluate(() => (window as any).__printCalls)).toBe(1);
    expect(await page.evaluate(() => (window as any).__activePrintBlocks)).toBe(1);
    expect(await page.evaluate(() => (window as any).__printTitle)).toContain(quote.id);
    await expect.poll(() => page.title()).toBe(originalTitle);
    expect(consoleErrors).toEqual([]);

    await disposeContexts(owner);
  });
});
