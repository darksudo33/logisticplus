import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import crypto from "node:crypto";
import pg from "pg";
import {
  BASE_URL,
  USER_PASSWORD,
  apiContext,
  disposeContexts,
  expectForbidden,
  expectPublicTrackingPayloadIsSafe,
  expectUnavailable,
  loginApi,
  loginViaUi,
  readOk,
  uniqueEmail,
} from "./helpers";

const { Client } = pg;
const testDatabaseUrl = process.env.TEST_DATABASE_URL || "postgres://postgres@localhost:5432/logisticplus_test";

type ExitedFixture = {
  shipment: any;
  trackingNumber: string;
  cotageNumber: string;
  declarationReference: string;
  internalNote: string;
  document: any;
  thread: any;
  chatMessage: string;
  accessToken: string;
};

async function dbQuery(sql: string, params: any[] = []) {
  const client = new Client({ connectionString: testDatabaseUrl });
  await client.connect();
  try {
    return await client.query(sql, params);
  } finally {
    await client.end();
  }
}

async function cleanupByTrackingPrefix(prefix: string) {
  const result = await dbQuery("SELECT id FROM shipments WHERE shipment_code LIKE $1", [`${prefix}%`]);
  const ids = result.rows.map((row) => row.id);
  if (ids.length === 0) return;

  await dbQuery("DELETE FROM documents WHERE shipment_id = ANY($1::text[])", [ids]);
  await dbQuery("DELETE FROM chat_threads WHERE shipment_id = ANY($1::text[])", [ids]);
  await dbQuery("DELETE FROM task_events WHERE shipment_id = ANY($1::text[])", [ids]);
  await dbQuery("DELETE FROM tasks WHERE shipment_id = ANY($1::text[])", [ids]);
  await dbQuery("DELETE FROM shipment_status_events WHERE shipment_id = ANY($1::text[])", [ids]);
  await dbQuery("DELETE FROM shipment_kootaj_details WHERE shipment_id = ANY($1::text[])", [ids]);
  await dbQuery("DELETE FROM shipment_workflow_instances WHERE shipment_id = ANY($1::text[])", [ids]);
  await dbQuery("DELETE FROM shipments WHERE id = ANY($1::text[])", [ids]);
}

async function createTenantOwner(owner: APIRequestContext) {
  const tenantEmail = uniqueEmail("exited-archive-tenant-owner");
  const data = await readOk<any>(
    await owner.post("/api/admin/organizations/manual-signup", {
      data: {
        companyName: `Exited Archive Tenant ${Date.now()}`,
        ownerName: "Exited Archive Tenant Owner",
        ownerEmail: tenantEmail,
        password: USER_PASSWORD,
        planId: "starter",
        billingCycle: "monthly",
        contactPhone: "09120000000",
      },
    })
  );
  return { ...data, tenantEmail };
}

async function uploadInternalDocument(context: APIRequestContext, shipmentId: string, title: string) {
  return readOk<any>(
    await context.post("/api/documents/upload", {
      multipart: {
        title,
        type: "OTHER",
        shipmentId,
        visibility: "internal",
        file: {
          name: `${title}.txt`,
          mimeType: "text/plain",
          buffer: Buffer.from(`internal test document for ${shipmentId}`),
        },
      },
    })
  );
}

async function createFixture(owner: APIRequestContext, prefix: string, suffix: string): Promise<ExitedFixture> {
  const trackingNumber = `${prefix}-${suffix}`;
  const cotageNumber = `EXIT-COTAGE-${suffix}`;
  const declarationReference = `EXIT-DECL-${suffix}`;
  const internalNote = `private exited daily status ${suffix}`;
  const chatMessage = `private exited chat ${suffix}`;

  const shipment = await readOk<any>(
    await owner.post("/api/shipments", {
      data: {
        trackingNumber,
        customerName: `Exited Customer ${suffix}`,
        origin: "Bandar Abbas",
        destination: "Tehran",
        status: "CLEARED",
        shipmentDirection: "import",
        transportMode: "sea",
        shipmentTypeCode: "IMPORT_SEA_CONTAINER",
        assignedManagerId: "u1",
      },
    })
  );

  await readOk<any>(
    await owner.patch(`/api/shipments/${encodeURIComponent(shipment.id)}/daily-status`, {
      data: {
        cotageNumber,
        declarationReference,
        customsStatus: "exited",
        releaseStatus: "exited",
        exitDate: "2026-06-04",
        internalNote,
      },
    })
  );

  await readOk<any>(await owner.post(`/api/shipments/${encodeURIComponent(shipment.id)}/progress/start`));
  const document = await uploadInternalDocument(owner, shipment.id, `exited-doc-${suffix}`);
  const thread = await readOk<any>(await owner.get(`/api/shipments/${encodeURIComponent(shipment.id)}/chat-thread`));
  await readOk<any>(
    await owner.post(`/api/chat/threads/${encodeURIComponent(thread.id)}/messages`, {
      data: {
        body: chatMessage,
        clientMessageId: `exited-${suffix}`,
      },
    })
  );
  const access = await readOk<any>(await owner.post(`/api/shipments/${encodeURIComponent(shipment.id)}/customer-access/generate`));

  return {
    shipment,
    trackingNumber,
    cotageNumber,
    declarationReference,
    internalNote,
    document,
    thread,
    chatMessage,
    accessToken: access.token,
  };
}

async function expectNoHorizontalPageOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    body: document.body.scrollWidth - document.body.clientWidth,
    document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  expect(overflow.body).toBeLessThanOrEqual(1);
  expect(overflow.document).toBeLessThanOrEqual(1);
}

test.describe.serial("exited shipments archive", () => {
  test.beforeAll(async () => {
    if (!testDatabaseUrl.toLowerCase().includes("test")) {
      throw new Error(`Refusing to run exited archive tests outside a test database: ${testDatabaseUrl}`);
    }
    await cleanupByTrackingPrefix("E2E-EXITED");
  });

  test.afterAll(async () => {
    await cleanupByTrackingPrefix("E2E-EXITED");
  });

  test("moves exited shipments out of active operations without deleting records", async () => {
    const owner = await loginApi();
    const publicContext = await apiContext();
    const contexts: APIRequestContext[] = [owner, publicContext];
    const suffix = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
    const fixture = await createFixture(owner, "E2E-EXITED-API", suffix);
    const shipmentId = fixture.shipment.id;

    try {
      await expectForbidden(await publicContext.get("/api/shipments/exited"));

      const activeBefore = await readOk<any[]>(await owner.get("/api/shipments"));
      expect(activeBefore.some((shipment) => shipment.id === shipmentId)).toBe(true);
      const dailyBefore = await readOk<any[]>(await owner.get(`/api/daily-status?shipmentId=${encodeURIComponent(shipmentId)}`));
      expect(dailyBefore.some((row) => row.shipment.id === shipmentId)).toBe(true);

      const spoofedList = await owner.get("/api/shipments/exited?organizationId=other-org");
      await expectForbidden(spoofedList);
      expect((await spoofedList.json()).error?.code).toBe("TENANT_SCOPE_CONFLICT");
      const spoofedArchive = await owner.post(`/api/shipments/${encodeURIComponent(shipmentId)}/exited-archive`, {
        data: { reason: "invalid spoof", organizationId: "other-org" },
      });
      await expectForbidden(spoofedArchive);
      expect((await spoofedArchive.json()).error?.code).toBe("TENANT_SCOPE_CONFLICT");

      const prematurePostExit = await owner.patch(`/api/shipments/${encodeURIComponent(shipmentId)}/post-exit`, {
        data: { postExitStatus: "in_progress" },
      });
      expect(prematurePostExit.status(), await prematurePostExit.text()).toBe(409);

      const archived = await readOk<any>(
        await owner.post(`/api/shipments/${encodeURIComponent(shipmentId)}/exited-archive`, {
          data: { reason: "Customs exit completed; keep long-tail follow-up." },
        })
      );
      expect(archived.isExitedArchived).toBe(true);
      expect(archived.postExitStatus).toBe("needs_follow_up");
      expect(archived.exitedArchiveReason).toContain("Customs exit completed");

      const activeAfter = await readOk<any[]>(await owner.get("/api/shipments"));
      expect(activeAfter.some((shipment) => shipment.id === shipmentId)).toBe(false);
      const dailyAfter = await readOk<any[]>(await owner.get(`/api/daily-status?shipmentId=${encodeURIComponent(shipmentId)}`));
      expect(dailyAfter).toEqual([]);
      const detailDaily = await readOk<any>(await owner.get(`/api/shipments/${encodeURIComponent(shipmentId)}/daily-status`));
      expect(detailDaily.shipment.id).toBe(shipmentId);

      const exitedByCotage = await readOk<any[]>(
        await owner.get(`/api/shipments/exited?q=${encodeURIComponent(fixture.cotageNumber)}`)
      );
      expect(exitedByCotage.some((shipment) => shipment.id === shipmentId && shipment.cotageNumber === fixture.cotageNumber)).toBe(true);
      const exitedByDeclaration = await readOk<any[]>(
        await owner.get(`/api/shipments/exited?q=${encodeURIComponent(fixture.declarationReference)}`)
      );
      expect(exitedByDeclaration.some((shipment) => shipment.id === shipmentId)).toBe(true);

      const search = await owner.get(`/api/search?q=${encodeURIComponent(fixture.cotageNumber)}&type=shipments`);
      expect(search.status(), await search.text()).toBeLessThan(400);
      const searchPayload = await search.json();
      const searchResult = searchPayload.results.find((result: any) => result.id === shipmentId);
      expect(searchResult?.matchedFields).toContain("cotageNumber");
      expect(searchResult?.badges).toContain("خروج‌شده");

      const loadedDetail = await readOk<any>(await owner.get(`/api/shipments/${encodeURIComponent(shipmentId)}`));
      expect(loadedDetail.isExitedArchived).toBe(true);
      const documents = await readOk<any[]>(await owner.get(`/api/shipments/${encodeURIComponent(shipmentId)}/documents`));
      expect(documents.some((document) => document.id === fixture.document.id)).toBe(true);
      const download = await owner.get(`/api/documents/${encodeURIComponent(fixture.document.id)}/download`);
      expect(download.status(), await download.text()).toBeLessThan(400);
      const progress = await readOk<any>(await owner.get(`/api/shipments/${encodeURIComponent(shipmentId)}/progress`));
      expect(progress.workflow.shipmentId).toBe(shipmentId);
      const messages = await readOk<any[]>(await owner.get(`/api/chat/threads/${encodeURIComponent(fixture.thread.id)}/messages`));
      expect(messages.some((message) => message.body === fixture.chatMessage)).toBe(true);

      const postExitNote = `internal post-exit note ${suffix}`;
      const postExit = await readOk<any>(
        await owner.patch(`/api/shipments/${encodeURIComponent(shipmentId)}/post-exit`, {
          data: {
            postExitStatus: "in_progress",
            postExitNote,
            postExitFollowUpAt: "2026-06-10",
          },
        })
      );
      expect(postExit.postExitStatus).toBe("in_progress");
      expect(postExit.postExitNote).toBe(postExitNote);

      const publicPayload = await readOk<any>(await publicContext.get(`/api/public/track/${encodeURIComponent(fixture.accessToken)}`));
      expectPublicTrackingPayloadIsSafe(publicPayload);
      const serializedPublic = JSON.stringify(publicPayload);
      expect(serializedPublic).not.toContain(fixture.cotageNumber);
      expect(serializedPublic).not.toContain(fixture.declarationReference);
      expect(serializedPublic).not.toContain(fixture.internalNote);
      expect(serializedPublic).not.toContain(fixture.chatMessage);
      expect(serializedPublic).not.toContain(postExitNote);

      const counts = await dbQuery(
        `SELECT
           (SELECT COUNT(*)::int FROM shipments WHERE id = $1) AS shipments,
           (SELECT COUNT(*)::int FROM shipment_kootaj_details WHERE shipment_id = $1) AS kootaj,
           (SELECT COUNT(*)::int FROM documents WHERE id = $2 AND shipment_id = $1) AS documents,
           (SELECT COUNT(*)::int FROM shipment_workflow_instances WHERE shipment_id = $1) AS workflows,
           (SELECT COUNT(*)::int FROM chat_threads WHERE id = $3 AND shipment_id = $1) AS chat_threads`,
        [shipmentId, fixture.document.id, fixture.thread.id]
      );
      expect(counts.rows[0]).toEqual({
        shipments: 1,
        kootaj: 1,
        documents: 1,
        workflows: 1,
        chat_threads: 1,
      });

      const audit = await dbQuery(
        `SELECT event_type
         FROM audit_logs
         WHERE resource_id = $1
           AND event_type IN ('shipment.exited_archive', 'shipment.post_exit_update')
         ORDER BY created_at DESC`,
        [shipmentId]
      );
      expect(audit.rows.map((row) => row.event_type)).toEqual(
        expect.arrayContaining(["shipment.exited_archive", "shipment.post_exit_update"])
      );

      const tenantInfo = await createTenantOwner(owner);
      const tenant = await loginApi(tenantInfo.tenantEmail, USER_PASSWORD);
      contexts.push(tenant);
      const tenantExited = await readOk<any[]>(
        await tenant.get(`/api/shipments/exited?q=${encodeURIComponent(fixture.trackingNumber)}`)
      );
      expect(tenantExited).toEqual([]);
      await expectUnavailable(await tenant.get(`/api/shipments/${encodeURIComponent(shipmentId)}`));
      await expectUnavailable(await tenant.post(`/api/shipments/${encodeURIComponent(shipmentId)}/exited-restore`));
      await expectUnavailable(
        await tenant.patch(`/api/shipments/${encodeURIComponent(shipmentId)}/post-exit`, {
          data: { postExitStatus: "closed" },
        })
      );

      const restored = await readOk<any>(await owner.post(`/api/shipments/${encodeURIComponent(shipmentId)}/exited-restore`));
      expect(restored.isExitedArchived).toBe(false);
      const activeRestored = await readOk<any[]>(await owner.get("/api/shipments"));
      expect(activeRestored.some((shipment) => shipment.id === shipmentId)).toBe(true);
      const exitedAfterRestore = await readOk<any[]>(
        await owner.get(`/api/shipments/exited?q=${encodeURIComponent(fixture.trackingNumber)}`)
      );
      expect(exitedAfterRestore).toEqual([]);
    } finally {
      await owner.post(`/api/shipments/${encodeURIComponent(shipmentId)}/customer-access/disable`).catch(() => null);
      await disposeContexts(...contexts);
    }
  });

  test("detail and exited archive pages confirm move, follow-up, and restore", async ({ page }) => {
    const owner = await loginApi();
    const suffix = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
    const fixture = await createFixture(owner, "E2E-EXITED-UI", suffix);
    const shipmentId = fixture.shipment.id;
    await disposeContexts(owner);

    await loginViaUi(page);
    await page.goto(`/shipments/${encodeURIComponent(shipmentId)}`);
    await expect(page.getByTestId("shipment-move-to-exited")).toBeVisible();
    await page.getByTestId("shipment-move-to-exited").click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByTestId("shipment-exited-archive-reason").fill("UI archive cancelled once.");
    await page.getByTestId("shipment-exited-archive-cancel").click();
    await expect(page.getByTestId("shipment-exited-badge")).toHaveCount(0);

    await page.getByTestId("shipment-move-to-exited").click();
    await page.getByTestId("shipment-exited-archive-reason").fill("UI confirmed customs exit.");
    await page.getByTestId("shipment-exited-archive-confirm").click();
    await expect(page.getByTestId("shipment-exited-badge")).toBeVisible();
    await expect(page.getByTestId("shipment-post-exit-panel")).toBeVisible();

    const uiPostExitNote = `ui post-exit note ${suffix}`;
    await page.getByTestId("shipment-post-exit-note").fill(uiPostExitNote);
    await page.getByTestId("shipment-post-exit-follow-up-at").fill("2026-06-11");
    await page.getByTestId("shipment-post-exit-save").click();
    await expect.poll(async () => {
      const response = await page.request.get(`${BASE_URL}/api/shipments/${encodeURIComponent(shipmentId)}`);
      const payload = await response.json();
      return payload.data?.postExitNote || "";
    }).toBe(uiPostExitNote);

    await page.goto("/shipments/exited");
    await expect(page.getByTestId("exited-shipments-page")).toBeVisible();
    await expectNoHorizontalPageOverflow(page);
    await page.getByTestId("exited-shipments-search").fill(fixture.trackingNumber);
    await page.keyboard.press("Enter");
    const card = page.locator(`[data-testid="exited-shipment-card"][data-shipment-id="${shipmentId}"]`);
    await expect(card).toBeVisible();
    await card.getByTestId("exited-shipment-follow-up").click();
    await page.getByTestId("exited-shipment-follow-up-note").fill(`page follow-up ${suffix}`);
    await page.getByTestId("exited-shipment-follow-up-save").click();
    await expect(card).toBeVisible();

    await card.getByTestId("exited-shipment-restore").click();
    await page.getByTestId("exited-shipment-restore-confirm").click();
    await expect(card).toHaveCount(0);
    await page.goto(`/shipments/${encodeURIComponent(shipmentId)}`);
    await expect(page.getByTestId("shipment-exited-badge")).toHaveCount(0);
    await expect(page.getByTestId("shipment-move-to-exited")).toBeVisible();
  });
});
