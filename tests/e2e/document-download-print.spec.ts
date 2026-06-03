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
  uniqueEmail,
  USER_PASSWORD,
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

async function uploadChatAttachment(
  context: Awaited<ReturnType<typeof loginApi>>,
  threadId: string,
  file: { name: string; mimeType: string; buffer: Buffer },
  caption = ""
) {
  return context.post(`/api/chat/threads/${encodeURIComponent(threadId)}/attachments`, {
    multipart: {
      caption,
      file,
    },
  });
}

async function createCompanyUser(owner: Awaited<ReturnType<typeof loginApi>>, role: string, prefix: string) {
  const email = uniqueEmail(prefix);
  const data = await readOk<any>(
    await owner.post("/api/users", {
      data: {
        name: `E2E Documents ${role}`,
        email,
        password: USER_PASSWORD,
        role,
      },
    })
  );
  return { id: data.id, email, name: data.name };
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
    const publicDocumentDto = publicTrack.documents.find((document: any) => document.id === uploaded.id);
    expect(publicDocumentDto).toBeTruthy();

    const publicTrackDownload = await publicContext.get(
      `/api/public/track/${encodeURIComponent(access.token)}/documents/${encodeURIComponent(uploaded.id)}`
    );
    expect(publicTrackDownload.status(), await publicTrackDownload.text()).toBe(200);
    expect(publicTrackDownload.headers()["x-content-type-options"]).toBe("nosniff");
    expect(await publicTrackDownload.text()).toBe(marker);

    const signedPublicDownload = await publicContext.get(publicDocumentDto.downloadUrl);
    expect(signedPublicDownload.status(), await signedPublicDownload.text()).toBe(200);
    expect(await signedPublicDownload.text()).toBe(marker);

    await expectUnavailable(await publicContext.get(`/api/public/documents/${encodeURIComponent(uploaded.id)}`));

    await readOk(await owner.post(`/api/documents/${encodeURIComponent(uploaded.id)}/archive`));
    await expectUnavailable(await owner.get(`/api/documents/${encodeURIComponent(uploaded.id)}/download`));
    await expectUnavailable(
      await publicContext.get(`/api/public/track/${encodeURIComponent(access.token)}/documents/${encodeURIComponent(uploaded.id)}`)
    );
    await expectUnavailable(await publicContext.get(publicDocumentDto.downloadUrl));
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

  test("renders document download links while quotation UI remains disabled", async ({ page }) => {
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
    await loginViaUi(page);
    for (const route of ["/documents", "/shipments/s1", "/track/search"]) {
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

    await page.goto("/quotage");
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.goto("/quotations");
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText(quote.customerName)).toHaveCount(0);
    await expect(page.getByLabel(`Print quotation ${quote.id}`)).toHaveCount(0);
    expect(consoleErrors).toEqual([]);

    await disposeContexts(owner);
  });

  test("shows CEO-only chat media library and deletes chat media without touching documents", async ({ browser }) => {
    const owner = await loginApi();
    const employee = await createCompanyUser(owner, "OPERATIONS", "e2e-docs-media-ops");
    const employeeApi = await loginApi(employee.email, USER_PASSWORD);
    const documentTitle = `E2E Protected Document ${Date.now()}`;
    const chatFileName = `chat-media-library-${Date.now()}.txt`;

    const uploadedDocument = await readOk<any>(
      await uploadDocument(
        owner,
        {
          name: "protected-document.txt",
          mimeType: "text/plain",
          buffer: Buffer.from("official document body"),
        },
        {
          title: documentTitle,
          shipmentId: "s1",
        }
      )
    );
    const thread = await readOk<{ id: string }>(
      await owner.post("/api/chat/direct", { data: { userId: employee.id } })
    );
    const chatMessage = await readOk<any>(
      await uploadChatAttachment(
        owner,
        thread.id,
        {
          name: chatFileName,
          mimeType: "text/plain",
          buffer: Buffer.from("internal chat media body"),
        },
        "CEO media library smoke"
      )
    );
    const attachment = chatMessage.attachments?.[0];
    expect(attachment?.downloadUrl).toBeTruthy();

    const ownerContext = await browser.newContext();
    const ownerPage = await ownerContext.newPage();
    const employeeContext = await browser.newContext();
    const employeePage = await employeeContext.newPage();

    try {
      await loginViaUi(ownerPage);
      await ownerPage.goto("/documents");
      await expect(ownerPage.getByTestId("chat-media-tab")).toBeVisible();
      await ownerPage.getByTestId("chat-media-tab").click();
      await expect(ownerPage.getByTestId("chat-media-library")).toBeVisible();
      await expect(ownerPage.getByTestId("chat-media-item").filter({ hasText: chatFileName })).toBeVisible();

      await loginViaUi(employeePage, employee.email, USER_PASSWORD);
      await employeePage.goto("/documents");
      await expect(employeePage.getByTestId("chat-media-tab")).toHaveCount(0);

      const item = ownerPage.getByTestId("chat-media-item").filter({ hasText: chatFileName });
      await item.getByRole("button", { name: /حذف/ }).click();
      await ownerPage.getByRole("button", { name: /حذف فایل گفتگو/ }).click();
      await expect(item.getByText("حذف‌شده")).toBeVisible();

      await expectUnavailable(await owner.get(attachment.downloadUrl));
      const documentDownload = await owner.get(`/api/documents/${encodeURIComponent(uploadedDocument.id)}/download`);
      expect(documentDownload.status(), await documentDownload.text()).toBe(200);
      expect(await documentDownload.text()).toBe("official document body");
    } finally {
      await ownerContext.close();
      await employeeContext.close();
      await disposeContexts(owner, employeeApi);
    }
  });
});
