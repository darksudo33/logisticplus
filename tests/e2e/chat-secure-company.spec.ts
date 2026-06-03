import { expect, test } from "@playwright/test";
import pg from "pg";
import {
  USER_PASSWORD,
  disposeContexts,
  expectUnavailable,
  loginApi,
  loginViaUi,
  readOk,
  uniqueEmail,
} from "./helpers";

const { Client } = pg;
type DbClient = InstanceType<typeof Client>;
const testDatabaseUrl = process.env.TEST_DATABASE_URL || "postgres://postgres@localhost:5432/logisticplus_test";

async function createCompanyUser(owner: Awaited<ReturnType<typeof loginApi>>, role: string, prefix: string) {
  const email = uniqueEmail(prefix);
  const data = await readOk<any>(
    await owner.post("/api/users", {
      data: {
        name: `E2E Chat ${role}`,
        email,
        password: USER_PASSWORD,
        role,
      },
    })
  );
  return { id: data.id, email, name: data.name };
}

async function createTenantOwner(owner: Awaited<ReturnType<typeof loginApi>>) {
  const tenantEmail = uniqueEmail("e2e-chat-tenant");
  const data = await readOk<any>(
    await owner.post("/api/admin/organizations/manual-signup", {
      data: {
        companyName: `E2E Chat Tenant ${Date.now()}`,
        ownerName: "E2E Chat Tenant Owner",
        ownerEmail: tenantEmail,
        password: USER_PASSWORD,
        planId: "starter",
        billingCycle: "monthly",
        contactPhone: "09120000000",
      },
    })
  );
  return { tenantEmail, organizationId: data.organizationId, ownerUserId: data.ownerUserId };
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
      clientMessageId: `e2e-chat-attachment-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file,
    },
  });
}

const tinyPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
);

async function insertChatHistory(
  client: DbClient,
  {
    organizationId,
    threadId,
    senderId,
    senderName,
    prefix,
    count,
  }: {
    organizationId: string;
    threadId: string;
    senderId: string;
    senderName: string;
    prefix: string;
    count: number;
  }
) {
  for (let index = 0; index < count; index += 1) {
    await client.query(
      `INSERT INTO chat_messages (
         id, organization_id, thread_id, sender_id, sender_name, content, body, body_format,
         client_message_id, status, legacy_data, created_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $6, 'plain_text', $7, 'sent', '{}'::jsonb, NOW() - ($8::int * INTERVAL '1 minute'))`,
      [
        `e2e-chat-history-${Date.now()}-${index}-${Math.random().toString(36).slice(2)}`,
        organizationId,
        threadId,
        senderId,
        senderName,
        `${prefix} ${index} ${"history ".repeat(14)}`,
        `${prefix}-${index}`,
        count + 60 - index,
      ]
    );
  }
}

test.describe.serial("secure company chat", () => {
  let client: DbClient;
  const threadIds = new Set<string>();

  test.beforeAll(async () => {
    client = new Client({ connectionString: testDatabaseUrl });
    await client.connect();
  });

  test.afterAll(async () => {
    if (threadIds.size) {
      await client.query("DELETE FROM chat_threads WHERE id = ANY($1::text[])", [[...threadIds]]);
    }
    await client.end();
  });

  test("scopes participants, direct threads, and messages to active thread members", async () => {
    const owner = await loginApi();
    const tenantInfo = await createTenantOwner(owner);
    const employee = await createCompanyUser(owner, "OPERATIONS", "e2e-chat-ops");
    const tenant = await loginApi(tenantInfo.tenantEmail, USER_PASSWORD);

    try {
      const participants = await readOk<any[]>(await owner.get("/api/chat/participants?limit=100"));
      expect(participants.some((item) => item.userId === employee.id)).toBe(true);
      expect(participants.some((item) => item.userId === tenantInfo.ownerUserId)).toBe(false);
      expect(JSON.stringify(participants)).not.toContain("organization_id");

      const spoofed = await owner.get(`/api/chat/participants?organizationId=${encodeURIComponent(tenantInfo.organizationId)}`);
      expect(spoofed.status()).toBe(403);

      const firstDirect = await readOk<{ id: string }>(
        await owner.post("/api/chat/direct", { data: { userId: employee.id } })
      );
      const secondDirect = await readOk<{ id: string }>(
        await owner.post("/api/chat/direct", { data: { userId: employee.id } })
      );
      expect(secondDirect.id).toBe(firstDirect.id);
      threadIds.add(firstDirect.id);

      const spoofedDirect = await owner.post("/api/chat/direct", {
        data: { userId: employee.id, organizationId: tenantInfo.organizationId },
      });
      expect(spoofedDirect.status()).toBe(403);

      const body = "<img src=x onerror=alert(1)> literal text";
      const message = await readOk<any>(
        await owner.post(`/api/chat/threads/${encodeURIComponent(firstDirect.id)}/messages`, {
          data: { body },
        })
      );
      expect(message.body).toBe(body);
      expect(message.content).toBe(body);
      expect(JSON.stringify(message)).not.toContain("organization_id");
      expect(JSON.stringify(message)).not.toContain("legacy_data");

      const ownerMessages = await readOk<any[]>(
        await owner.get(`/api/chat/threads/${encodeURIComponent(firstDirect.id)}/messages`)
      );
      expect(ownerMessages.some((item) => item.id === message.id)).toBe(true);

      const tenantRead = await tenant.get(`/api/chat/threads/${encodeURIComponent(firstDirect.id)}/messages`);
      await expectUnavailable(tenantRead);
    } finally {
      await disposeContexts(owner, tenant);
    }
  });

  test("stores chat attachments privately with member-only delivery and safe deletion", async () => {
    const owner = await loginApi();
    const tenantInfo = await createTenantOwner(owner);
    const employee = await createCompanyUser(owner, "OPERATIONS", "e2e-chat-attach");
    const employeeApi = await loginApi(employee.email, USER_PASSWORD);
    const tenant = await loginApi(tenantInfo.tenantEmail, USER_PASSWORD);

    try {
      const thread = await readOk<{ id: string }>(
        await owner.post("/api/chat/direct", { data: { userId: employee.id } })
      );
      threadIds.add(thread.id);

      const imageMessage = await readOk<any>(
        await uploadChatAttachment(
          owner,
          thread.id,
          { name: "chat-image.png", mimeType: "image/png", buffer: tinyPng },
          "attachment image caption"
        )
      );
      const imageAttachment = imageMessage.attachments?.[0];
      expect(imageAttachment).toBeTruthy();
      expect(imageAttachment.attachmentType).toBe("image");
      expect(imageAttachment.previewUrl).toContain("/api/chat/messages/");
      expect(imageAttachment.downloadUrl).toContain("/api/chat/messages/");

      const safeDto = JSON.stringify(imageMessage).toLowerCase();
      for (const forbidden of ["storage_key", "storagekey", "object_key", "objectkey", "storage_bucket", "bucket", "local_path", "localpath"]) {
        expect(safeDto).not.toContain(forbidden);
      }

      const preview = await owner.get(imageAttachment.previewUrl);
      expect(preview.status(), await preview.text()).toBe(200);
      expect(preview.headers()["x-content-type-options"]).toBe("nosniff");
      expect(preview.headers()["content-type"]).toContain("image/png");

      const employeePreview = await employeeApi.get(imageAttachment.previewUrl);
      expect(employeePreview.status(), await employeePreview.text()).toBe(200);
      await expectUnavailable(await tenant.get(imageAttachment.previewUrl));

      const documentMessage = await readOk<any>(
        await uploadChatAttachment(
          employeeApi,
          thread.id,
          {
            name: "chat-note.txt",
            mimeType: "text/plain",
            buffer: Buffer.from("private chat document body"),
          },
          ""
        )
      );
      const documentAttachment = documentMessage.attachments?.[0];
      expect(documentAttachment.attachmentType).toBe("document");
      expect(documentAttachment.previewUrl).toBeUndefined();
      expect(documentAttachment.downloadUrl).toContain("/api/chat/messages/");
      const download = await owner.get(documentAttachment.downloadUrl);
      expect(download.status(), await download.text()).toBe(200);
      expect(await download.text()).toBe("private chat document body");

      const unsupported = await owner.post(`/api/chat/threads/${encodeURIComponent(thread.id)}/attachments`, {
        multipart: {
          file: { name: "unsafe.exe", mimeType: "application/octet-stream", buffer: Buffer.from("nope") },
        },
      });
      expect(unsupported.status()).toBe(415);
      const unsupportedPayload = await unsupported.json();
      expect(unsupportedPayload.error?.code).toBe("UNSUPPORTED_FILE_TYPE");

      const oversizedImage = await owner.post(`/api/chat/threads/${encodeURIComponent(thread.id)}/attachments`, {
        multipart: {
          file: { name: "too-large.png", mimeType: "image/png", buffer: Buffer.alloc(5 * 1024 * 1024 + 1) },
        },
      });
      expect(oversizedImage.status()).toBe(413);

      const blockedDelete = await employeeApi.delete(
        `/api/chat/messages/${encodeURIComponent(imageMessage.id)}/attachments/${encodeURIComponent(imageAttachment.id)}`
      );
      expect(blockedDelete.status()).toBe(403);

      const deletedDocument = await readOk<any>(
        await employeeApi.delete(
          `/api/chat/messages/${encodeURIComponent(documentMessage.id)}/attachments/${encodeURIComponent(documentAttachment.id)}`
        )
      );
      expect(deletedDocument.attachment.deletedAt).toBeTruthy();
      await expectUnavailable(await owner.get(documentAttachment.downloadUrl));

      const deletedImage = await readOk<any>(
        await owner.delete(
          `/api/chat/messages/${encodeURIComponent(imageMessage.id)}/attachments/${encodeURIComponent(imageAttachment.id)}`
        )
      );
      expect(deletedImage.attachment.deletedAt).toBeTruthy();
      await expectUnavailable(await owner.get(imageAttachment.previewUrl));

      const messages = await readOk<any[]>(await owner.get(`/api/chat/threads/${encodeURIComponent(thread.id)}/messages`));
      const reloadedImage = messages.find((message) => message.id === imageMessage.id);
      expect(reloadedImage.attachments?.[0]?.deletedAt).toBeTruthy();
      expect(reloadedImage.attachments?.[0]?.previewUrl).toBeUndefined();
      expect(JSON.stringify(reloadedImage).toLowerCase()).not.toContain("storage_key");

      const auditRows = await client.query(
        `SELECT event_type, resource_type, resource_id, metadata_json::text AS metadata
         FROM audit_logs
         WHERE resource_type = 'chat_attachment'
           AND resource_id = ANY($1::text[])
         ORDER BY created_at DESC`,
        [[imageAttachment.id, documentAttachment.id]]
      );
      expect(auditRows.rows.map((row) => row.event_type)).toContain("chat.attachment.upload");
      expect(auditRows.rows.map((row) => row.event_type)).toContain("chat.attachment.delete");
      expect(JSON.stringify(auditRows.rows).toLowerCase()).not.toContain("storage_key");
      expect(JSON.stringify(auditRows.rows).toLowerCase()).not.toContain("object_key");
    } finally {
      await disposeContexts(owner, employeeApi, tenant);
    }
  });

  test("preserves Unicode chat attachment filenames while keeping storage keys private", async ({ page }) => {
    const owner = await loginApi();
    const employee = await createCompanyUser(owner, "OPERATIONS", "e2e-chat-unicode-file");

    try {
      const thread = await readOk<{ id: string }>(
        await owner.post("/api/chat/direct", { data: { userId: employee.id } })
      );
      threadIds.add(thread.id);

      const persianName = "قرارداد مس.pdf";
      const persianMessage = await readOk<any>(
        await uploadChatAttachment(
          owner,
          thread.id,
          { name: persianName, mimeType: "application/pdf", buffer: Buffer.from("private persian pdf") },
          ""
        )
      );
      const persianAttachment = persianMessage.attachments?.[0];
      expect(persianAttachment?.filename).toBe(persianName);
      expect(JSON.stringify(persianMessage).toLowerCase()).not.toContain("storage_key");
      expect(JSON.stringify(persianMessage).toLowerCase()).not.toContain("object_key");

      const stored = await client.query(
        `SELECT original_filename, file_name, storage_key, object_key, local_path
         FROM chat_message_attachments
         WHERE id = $1`,
        [persianAttachment.id]
      );
      expect(stored.rows[0]?.original_filename).toBe(persianName);
      expect(stored.rows[0]?.file_name).toBe(persianName);
      expect(stored.rows[0]?.storage_key).toMatch(/^[0-9a-f-]{36}\.pdf$/i);
      expect(stored.rows[0]?.storage_key).not.toContain("قرارداد");
      expect(stored.rows[0]?.storage_key).not.toMatch(/[\\/]/);
      expect(stored.rows[0]?.local_path).toBe(stored.rows[0]?.storage_key);
      expect(String(stored.rows[0]?.object_key || "")).not.toContain("قرارداد");

      const persianDownload = await owner.get(persianAttachment.downloadUrl);
      expect(persianDownload.status(), await persianDownload.text()).toBe(200);
      const persianDisposition = persianDownload.headers()["content-disposition"] || "";
      expect(persianDisposition).toContain('filename="document.pdf"');
      expect(persianDisposition).toContain(`filename*=UTF-8''${encodeURIComponent(persianName)}`);

      await loginViaUi(page);
      await page.goto(`/chat?threadId=${encodeURIComponent(thread.id)}`);
      await expect(page.getByTestId("chat-file-attachment").filter({ hasText: persianName })).toBeVisible();

      const englishName = "contract-ms.pdf";
      const englishMessage = await readOk<any>(
        await uploadChatAttachment(
          owner,
          thread.id,
          { name: englishName, mimeType: "application/pdf", buffer: Buffer.from("private english pdf") },
          ""
        )
      );
      const englishAttachment = englishMessage.attachments?.[0];
      expect(englishAttachment?.filename).toBe(englishName);
      const englishDownload = await owner.get(englishAttachment.downloadUrl);
      const englishDisposition = englishDownload.headers()["content-disposition"] || "";
      expect(englishDisposition).toContain('filename="contract-ms.pdf"');
      expect(englishDisposition).toContain(`filename*=UTF-8''${encodeURIComponent(englishName)}`);

      const mojibakeName = Buffer.from(persianName, "utf8").toString("latin1");
      const mojibakeMessage = await readOk<any>(
        await uploadChatAttachment(
          owner,
          thread.id,
          { name: mojibakeName, mimeType: "application/pdf", buffer: Buffer.from("private mojibake pdf") },
          ""
        )
      );
      expect(mojibakeMessage.attachments?.[0]?.filename).toBe(persianName);

      const unsafeMessage = await readOk<any>(
        await uploadChatAttachment(
          owner,
          thread.id,
          { name: "bad/..\\قرارداد\u202Eمس.pdf", mimeType: "application/pdf", buffer: Buffer.from("private unsafe pdf") },
          ""
        )
      );
      const unsafeName = unsafeMessage.attachments?.[0]?.filename || "";
      expect(unsafeName).not.toMatch(/[\\/\u0000-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069]/);
      expect(unsafeName).toContain("قراردادمس.pdf");
      expect(unsafeName.endsWith(".pdf")).toBe(true);
      expect(Array.from(unsafeName).length).toBeLessThanOrEqual(140);
    } finally {
      await disposeContexts(owner);
    }
  });

  test("opens one canonical shipment thread and keeps it tenant scoped", async ({ page }) => {
    const owner = await loginApi();
    const tenantInfo = await createTenantOwner(owner);
    const tenant = await loginApi(tenantInfo.tenantEmail, USER_PASSWORD);

    try {
      const first = await readOk<any>(await owner.get("/api/shipments/s1/chat-thread"));
      const second = await readOk<any>(await owner.get("/api/shipments/s1/chat-thread"));
      expect(second.id).toBe(first.id);
      expect(first.type).toBe("SHIPMENT");
      expect(first.shipmentId).toBe("s1");
      expect(first.shipmentDetailUrl).toBe("/shipments/s1");
      threadIds.add(first.id);

      const ownerAuth = await readOk<any>(await owner.get("/api/auth/me"));
      const duplicateCount = await client.query(
        `SELECT COUNT(*)::int AS count
         FROM chat_threads
         WHERE organization_id = $1
           AND shipment_id = $2
           AND type = 'SHIPMENT'
           AND archived_at IS NULL`,
        [ownerAuth.user.organizationId, "s1"]
      );
      expect(Number(duplicateCount.rows[0]?.count || 0)).toBeLessThanOrEqual(1);

      const spoofed = await owner.get(`/api/shipments/s1/chat-thread?organizationId=${encodeURIComponent(tenantInfo.organizationId)}`);
      expect(spoofed.status()).toBe(403);

      await expectUnavailable(await tenant.get("/api/shipments/s1/chat-thread"));
      await expectUnavailable(await tenant.get(`/api/chat/threads/${encodeURIComponent(first.id)}/messages`));

      const body = `shipment chat e2e ${Date.now()}`;
      await readOk<any>(
        await owner.post(`/api/chat/threads/${encodeURIComponent(first.id)}/messages`, {
          data: { body },
        })
      );
      const messages = await readOk<any[]>(await owner.get(`/api/chat/threads/${encodeURIComponent(first.id)}/messages`));
      expect(messages.map((item) => item.body)).toContain(body);

      await loginViaUi(page);
      await page.goto(`/chat?threadId=${encodeURIComponent(first.id)}`);
      await expect(page.getByTestId("chat-category-tabs")).toBeVisible();
      await expect(page.getByTestId("chat-category-tabs").locator("button")).toHaveCount(3);
      const categoryOrder = await page.getByTestId("chat-category-tabs").locator("button").evaluateAll((buttons) =>
        buttons.map((button) => button.getAttribute("data-testid"))
      );
      expect(categoryOrder).toEqual(["chat-category-dm", "chat-category-group", "chat-category-shipment"]);
      await expect(page.getByTestId("chat-thread-shipment-badge").first()).toBeVisible();
      await expect(page.getByTestId("chat-message-bubble").filter({ hasText: body })).toBeVisible();
      await page.getByTestId("chat-open-shipment").click();
      await expect(page).toHaveURL(/\/shipments\/s1$/);
    } finally {
      await disposeContexts(owner, tenant);
    }
  });

  test("sends over an authenticated browser WebSocket and renders HTML-like text literally", async ({ page }) => {
    const owner = await loginApi();
    const employee = await createCompanyUser(owner, "OPERATIONS", "e2e-chat-ui");
    const thread = await readOk<{ id: string }>(
      await owner.post("/api/chat/direct", { data: { userId: employee.id } })
    );
    threadIds.add(thread.id);
    await disposeContexts(owner);

    await loginViaUi(page);
    await page.goto(`/chat?threadId=${encodeURIComponent(thread.id)}`);
    await expect(page.getByTestId("chat-page")).toBeVisible();

    const socketText = "<b>socket literal</b>";
    const socketResult = await page.evaluate(
      async ({ threadId, body }) => {
        return new Promise<{ ok: boolean; body?: string; error?: string }>((resolve) => {
          const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
          const ws = new WebSocket(`${protocol}//${window.location.host}/ws/chat`);
          const timeout = window.setTimeout(() => {
            ws.close();
            resolve({ ok: false, error: "timeout" });
          }, 8000);
          ws.onmessage = (event) => {
            const message = JSON.parse(event.data);
            if (message.type === "connection.ready") {
              ws.send(JSON.stringify({
                type: "message.send",
                requestId: "e2e-socket-send",
                payload: { threadId, body, clientMessageId: "e2e-client-message" },
              }));
            }
            if (message.type === "message.created" && message.payload?.body === body) {
              window.clearTimeout(timeout);
              ws.close();
              resolve({ ok: true, body: message.payload.body });
            }
            if (message.type === "error") {
              window.clearTimeout(timeout);
              ws.close();
              resolve({ ok: false, error: message.error?.message || "socket error" });
            }
          };
          ws.onerror = () => {
            window.clearTimeout(timeout);
            resolve({ ok: false, error: "socket error" });
          };
        });
      },
      { threadId: thread.id, body: socketText }
    );
    expect(socketResult).toEqual({ ok: true, body: socketText });

    const bubble = page.getByTestId("chat-message-bubble").filter({ hasText: socketText });
    await expect(bubble).toBeVisible();
    await expect(page.locator("img[src='x']")).toHaveCount(0);
  });

  test("rate limits REST chat sends before insert and validates plain text length", async () => {
    const owner = await loginApi();
    const employee = await createCompanyUser(owner, "OPERATIONS", "e2e-chat-rest-limit");
    const employeeApi = await loginApi(employee.email, USER_PASSWORD);
    const thread = await readOk<{ id: string }>(
      await owner.post("/api/chat/direct", { data: { userId: employee.id } })
    );
    threadIds.add(thread.id);

    try {
      const empty = await employeeApi.post(`/api/chat/threads/${encodeURIComponent(thread.id)}/messages`, {
        data: { body: "   " },
      });
      expect(empty.status()).toBe(400);

      const oversized = await employeeApi.post(`/api/chat/threads/${encodeURIComponent(thread.id)}/messages`, {
        data: { body: "x".repeat(3001) },
      });
      expect(oversized.status()).toBe(400);

      for (let index = 0; index < 5; index += 1) {
        await readOk<any>(
          await employeeApi.post(`/api/chat/threads/${encodeURIComponent(thread.id)}/messages`, {
            data: { body: `rest allowed ${index}` },
          })
        );
      }

      const blockedBody = "rest blocked by chat limiter";
      const blocked = await employeeApi.post(`/api/chat/threads/${encodeURIComponent(thread.id)}/messages`, {
        data: { body: blockedBody },
      });
      expect(blocked.status()).toBe(429);
      const blockedPayload = await blocked.json();
      expect(blockedPayload.error?.code).toBe("CHAT_RATE_LIMITED");
      expect(blockedPayload.error?.retryAfterMs).toBeGreaterThan(0);

      const messages = await readOk<any[]>(
        await owner.get(`/api/chat/threads/${encodeURIComponent(thread.id)}/messages?limit=100`)
      );
      expect(messages.map((item) => item.body)).not.toContain(blockedBody);
    } finally {
      await disposeContexts(owner, employeeApi);
    }
  });

  test("rate limits WebSocket sends without broadcasting or inserting the rejected message", async ({ page }) => {
    const owner = await loginApi();
    const employee = await createCompanyUser(owner, "OPERATIONS", "e2e-chat-ws-limit");
    const thread = await readOk<{ id: string }>(
      await owner.post("/api/chat/direct", { data: { userId: employee.id } })
    );
    threadIds.add(thread.id);

    try {
      await loginViaUi(page, employee.email, USER_PASSWORD);
      const result = await page.evaluate(
        async ({ threadId }) => {
          return new Promise<{
            allowed: string[];
            blocked?: { code?: string; retryAfterMs?: number };
            created: string[];
          }>((resolve) => {
            const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
            const ws = new WebSocket(`${protocol}//${window.location.host}/ws/chat`);
            const pending = new Map<string, (message: any) => void>();
            const allowed: string[] = [];
            const created: string[] = [];
            const timeout = window.setTimeout(() => {
              ws.close();
              resolve({ allowed, created });
            }, 12000);

            const sendAndWait = (index: number) => {
              const requestId = `ws-rate-${index}`;
              const body = index === 5 ? "ws blocked by chat limiter" : `ws allowed ${index}`;
              return new Promise<any>((resolveMessage) => {
                pending.set(requestId, resolveMessage);
                ws.send(JSON.stringify({
                  type: "message.send",
                  requestId,
                  payload: { threadId, body, clientMessageId: requestId },
                }));
              });
            };

            ws.onmessage = async (event) => {
              const message = JSON.parse(event.data);
              if (message.type === "message.created" && String(message.payload?.body || "").startsWith("ws ")) {
                created.push(message.payload.body);
              }
              if ((message.type === "message.ack" || message.type === "error") && message.requestId && pending.has(message.requestId)) {
                pending.get(message.requestId)?.(message);
                pending.delete(message.requestId);
              }
              if (message.type !== "connection.ready") return;
              for (let index = 0; index < 5; index += 1) {
                const ack = await sendAndWait(index);
                if (ack.type !== "message.ack") break;
                allowed.push(ack.requestId);
              }
              const blocked = await sendAndWait(5);
              window.setTimeout(() => {
                window.clearTimeout(timeout);
                ws.close();
                resolve({
                  allowed,
                  blocked: blocked.error,
                  created,
                });
              }, 300);
            };
          });
        },
        { threadId: thread.id }
      );

      expect(result.allowed).toHaveLength(5);
      expect(result.blocked?.code).toBe("CHAT_RATE_LIMITED");
      expect(result.blocked?.retryAfterMs).toBeGreaterThan(0);
      expect(result.created).not.toContain("ws blocked by chat limiter");

      const messages = await readOk<any[]>(
        await owner.get(`/api/chat/threads/${encodeURIComponent(thread.id)}/messages?limit=100`)
      );
      expect(messages.map((item) => item.body)).not.toContain("ws blocked by chat limiter");
    } finally {
      await disposeContexts(owner);
    }
  });

  test("typing events are throttled silently and the socket stays usable", async ({ browser }) => {
    const owner = await loginApi();
    const employee = await createCompanyUser(owner, "OPERATIONS", "e2e-chat-typing");
    const thread = await readOk<{ id: string }>(
      await owner.post("/api/chat/direct", { data: { userId: employee.id } })
    );
    threadIds.add(thread.id);
    await disposeContexts(owner);

    const senderContext = await browser.newContext();
    const recipientContext = await browser.newContext();
    const senderPage = await senderContext.newPage();
    const recipientPage = await recipientContext.newPage();
    try {
      await loginViaUi(senderPage, employee.email, USER_PASSWORD);
      await loginViaUi(recipientPage);
      await recipientPage.evaluate(() => {
        (window as any).__chatTypingEvents = [];
        (window as any).__chatReady = new Promise<void>((resolve) => {
          const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
          const ws = new WebSocket(`${protocol}//${window.location.host}/ws/chat`);
          (window as any).__chatWs = ws;
          ws.onmessage = (event) => {
            const message = JSON.parse(event.data);
            if (message.type === "connection.ready") resolve();
            if (message.type === "typing.updated") {
              (window as any).__chatTypingEvents.push(message.payload);
            }
          };
        });
      });
      await recipientPage.evaluate(() => (window as any).__chatReady);

      const senderResult = await senderPage.evaluate(
        async ({ threadId }) => {
          return new Promise<{ acked: boolean }>((resolve) => {
            const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
            const ws = new WebSocket(`${protocol}//${window.location.host}/ws/chat`);
            const timeout = window.setTimeout(() => {
              ws.close();
              resolve({ acked: false });
            }, 10000);
            ws.onmessage = (event) => {
              const message = JSON.parse(event.data);
              if (message.type === "connection.ready") {
                for (let index = 0; index < 5; index += 1) {
                  ws.send(JSON.stringify({ type: "typing.start", payload: { threadId } }));
                }
                window.setTimeout(() => {
                  ws.send(JSON.stringify({
                    type: "message.send",
                    requestId: "typing-socket-still-usable",
                    payload: {
                      threadId,
                      body: "message after typing throttle",
                      clientMessageId: "typing-socket-still-usable",
                    },
                  }));
                }, 300);
              }
              if (message.type === "message.ack" && message.requestId === "typing-socket-still-usable") {
                window.clearTimeout(timeout);
                ws.close();
                resolve({ acked: true });
              }
            };
          });
        },
        { threadId: thread.id }
      );
      await recipientPage.waitForTimeout(500);
      const typingCount = await recipientPage.evaluate(() => (window as any).__chatTypingEvents.length);
      expect(typingCount).toBeLessThanOrEqual(1);
      expect(senderResult.acked).toBe(true);
    } finally {
      await senderContext.close();
      await recipientContext.close();
    }
  });

  test("shows a friendly Persian rate-limit error, keeps typed text, and avoids chat viewport overflow", async ({ page }) => {
    const owner = await loginApi();
    const employee = await createCompanyUser(owner, "OPERATIONS", "e2e-chat-ui-limit");
    const employeeApi = await loginApi(employee.email, USER_PASSWORD);
    const thread = await readOk<{ id: string }>(
      await owner.post("/api/chat/direct", { data: { userId: employee.id } })
    );
    threadIds.add(thread.id);

    try {
      await page.setViewportSize({ width: 1440, height: 900 });
      await loginViaUi(page, employee.email, USER_PASSWORD);
      await page.goto(`/chat?threadId=${encodeURIComponent(thread.id)}`);
      await expect(page.getByTestId("chat-page")).toBeVisible();
      const heldText = "این پیام باید در کادر بماند";
      await page.getByTestId("chat-message-input").fill(heldText);

      for (let index = 0; index < 5; index += 1) {
        await readOk<any>(
          await employeeApi.post(`/api/chat/threads/${encodeURIComponent(thread.id)}/messages`, {
            data: { body: `preload limiter ${index}` },
          })
        );
      }

      await page.getByTestId("chat-send-button").click();
      await expect(page.getByTestId("chat-error")).toContainText("تعداد پیام‌ها زیاد است");
      await expect(page.getByTestId("chat-message-input")).toHaveValue(heldText);
      await expect(page.getByTestId("chat-send-button")).toBeDisabled();
    } finally {
      await disposeContexts(owner, employeeApi);
    }
  });

  test("loads chat history in 20-message batches without yanking readers to the bottom", async ({ page }) => {
    const owner = await loginApi();
    const ownerAuth = await readOk<any>(await owner.get("/api/auth/me"));
    const employee = await createCompanyUser(owner, "OPERATIONS", "e2e-chat-pagination");
    const employeeApi = await loginApi(employee.email, USER_PASSWORD);
    const thread = await readOk<{ id: string }>(
      await owner.post("/api/chat/direct", { data: { userId: employee.id } })
    );
    threadIds.add(thread.id);

    try {
      await insertChatHistory(client, {
        organizationId: ownerAuth.user.organizationId,
        threadId: thread.id,
        senderId: ownerAuth.user.id,
        senderName: ownerAuth.user.name || ownerAuth.user.email,
        prefix: "pagination message",
        count: 45,
      });

      const messageRequestUrls: string[] = [];
      page.on("request", (request) => {
        const url = request.url();
        if (url.includes(`/api/chat/threads/${encodeURIComponent(thread.id)}/messages`)) {
          messageRequestUrls.push(url);
        }
      });

      await page.setViewportSize({ width: 1440, height: 900 });
      await loginViaUi(page);
      await page.goto(`/chat?threadId=${encodeURIComponent(thread.id)}`);
      await expect(page.getByTestId("chat-composer")).toBeVisible();
      await expect(page.getByTestId("chat-message-bubble")).toHaveCount(20);
      await expect(page.getByTestId("chat-message-bubble").filter({ hasText: "pagination message 44" })).toBeVisible();
      await expect(page.getByTestId("chat-message-bubble").filter({ hasText: "pagination message 0" })).toHaveCount(0);

      await expect.poll(async () => page.evaluate(() => {
        const list = document.querySelector('[data-testid="chat-message-list"]') as HTMLElement;
        return Math.round(list.scrollHeight - list.scrollTop - list.clientHeight);
      })).toBeLessThanOrEqual(8);

      const beforeHistory = await page.evaluate(() => {
        const list = document.querySelector('[data-testid="chat-message-list"]') as HTMLElement;
        const previousHeight = list.scrollHeight;
        list.scrollTop = 0;
        list.dispatchEvent(new Event("scroll"));
        return { previousHeight };
      });
      await expect(page.getByTestId("chat-message-bubble")).toHaveCount(40);
      await expect(page.getByTestId("chat-message-bubble").filter({ hasText: "pagination message 24" })).toBeVisible();
      const afterHistory = await page.evaluate(() => {
        const list = document.querySelector('[data-testid="chat-message-list"]') as HTMLElement;
        return { scrollHeight: list.scrollHeight, scrollTop: list.scrollTop };
      });
      expect(afterHistory.scrollTop).toBeGreaterThan(0);
      expect(Math.abs(afterHistory.scrollTop - (afterHistory.scrollHeight - beforeHistory.previousHeight))).toBeLessThanOrEqual(24);

      const initialRequest = messageRequestUrls.find((url) => !new URL(url).searchParams.has("before"));
      const historyRequest = messageRequestUrls.find((url) => new URL(url).searchParams.has("before"));
      expect(initialRequest).toBeTruthy();
      expect(historyRequest).toBeTruthy();
      expect(new URL(initialRequest as string).searchParams.get("limit")).toBe("20");
      expect(new URL(historyRequest as string).searchParams.get("limit")).toBe("20");

      const readingScrollTop = await page.evaluate(() => {
        const list = document.querySelector('[data-testid="chat-message-list"]') as HTMLElement;
        list.scrollTop = 160;
        return list.scrollTop;
      });
      const incomingBody = `incoming pagination ${Date.now()}`;
      await readOk<any>(
        await employeeApi.post(`/api/chat/threads/${encodeURIComponent(thread.id)}/messages`, {
          data: { body: incomingBody },
        })
      );
      await expect(page.getByTestId("chat-message-bubble").filter({ hasText: incomingBody })).toBeVisible();
      const afterIncomingScrollTop = await page.evaluate(() => {
        const list = document.querySelector('[data-testid="chat-message-list"]') as HTMLElement;
        return list.scrollTop;
      });
      expect(Math.abs(afterIncomingScrollTop - readingScrollTop)).toBeLessThanOrEqual(8);
    } finally {
      await disposeContexts(owner, employeeApi);
    }
  });

  test("keeps desktop and mobile chat layout inside the shell with internal message scrolling", async ({ page }) => {
    const owner = await loginApi();
    const ownerAuth = await readOk<any>(await owner.get("/api/auth/me"));
    const employee = await createCompanyUser(owner, "OPERATIONS", "e2e-chat-layout");
    const thread = await readOk<{ id: string }>(
      await owner.post("/api/chat/direct", { data: { userId: employee.id } })
    );
    threadIds.add(thread.id);

    try {
      for (let index = 0; index < 40; index += 1) {
        await client.query(
          `INSERT INTO chat_messages (
             id, organization_id, thread_id, sender_id, sender_name, content, body, body_format,
             client_message_id, status, legacy_data, created_at
           )
           VALUES ($1, $2, $3, $4, $5, $6, $6, 'plain_text', $7, 'sent', '{}'::jsonb, NOW() - ($8::int * INTERVAL '1 second'))`,
          [
            `e2e-chat-layout-${Date.now()}-${index}-${Math.random().toString(36).slice(2)}`,
            ownerAuth.user.organizationId,
            thread.id,
            ownerAuth.user.id,
            ownerAuth.user.name || ownerAuth.user.email,
            `layout message ${index} ${"longword".repeat(18)}`,
            `layout-${index}`,
            40 - index,
          ]
        );
      }

      await page.setViewportSize({ width: 1440, height: 900 });
      await loginViaUi(page);
      await page.goto(`/chat?threadId=${encodeURIComponent(thread.id)}`);
      await expect(page.getByTestId("chat-composer")).toBeVisible();
      let metrics = await page.evaluate(() => {
        const main = document.querySelector("main") as HTMLElement;
        const list = document.querySelector('[data-testid="chat-message-list"]') as HTMLElement;
        const composer = document.querySelector('[data-testid="chat-composer"]') as HTMLElement;
        const header = document.querySelector('[data-testid="chat-conversation"] header') as HTMLElement;
        return {
          bodyOverflowX: document.body.scrollWidth - document.documentElement.clientWidth,
          mainOverflowY: main.scrollHeight - main.clientHeight,
          listScrollable: list.scrollHeight > list.clientHeight,
          composerBottom: composer.getBoundingClientRect().bottom,
          headerTop: header.getBoundingClientRect().top,
          viewportHeight: window.innerHeight,
        };
      });
      expect(metrics.bodyOverflowX).toBeLessThanOrEqual(1);
      expect(metrics.mainOverflowY).toBeLessThanOrEqual(2);
      expect(metrics.listScrollable).toBe(true);
      expect(metrics.headerTop).toBeGreaterThanOrEqual(0);
      expect(metrics.composerBottom).toBeLessThanOrEqual(metrics.viewportHeight + 1);

      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`/chat?threadId=${encodeURIComponent(thread.id)}`);
      await expect(page.getByTestId("chat-thread-list")).toBeVisible();
      await page.getByTestId("chat-thread-item").first().click();
      await expect(page.getByTestId("chat-message-input")).toBeVisible();
      metrics = await page.evaluate(() => {
        const main = document.querySelector("main") as HTMLElement;
        const list = document.querySelector('[data-testid="chat-message-list"]') as HTMLElement;
        const composer = document.querySelector('[data-testid="chat-composer"]') as HTMLElement;
        return {
          bodyOverflowX: document.body.scrollWidth - document.documentElement.clientWidth,
          mainOverflowY: main.scrollHeight - main.clientHeight,
          listScrollable: list.scrollHeight > list.clientHeight,
          composerBottom: composer.getBoundingClientRect().bottom,
          viewportHeight: window.innerHeight,
          headerTop: (document.querySelector('[data-testid="chat-conversation"] header') as HTMLElement).getBoundingClientRect().top,
        };
      });
      expect(metrics.bodyOverflowX).toBeLessThanOrEqual(1);
      expect(metrics.mainOverflowY).toBeLessThanOrEqual(2);
      expect(metrics.listScrollable).toBe(true);
      expect(metrics.headerTop).toBeGreaterThanOrEqual(0);
      expect(metrics.composerBottom).toBeLessThanOrEqual(metrics.viewportHeight + 1);
      await page.getByTestId("chat-mobile-back-button").click();
      await expect(page.getByTestId("chat-thread-list")).toBeVisible();
    } finally {
      await disposeContexts(owner);
    }
  });
});
