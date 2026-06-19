import { expect, test, type Locator, type Page } from "@playwright/test";
import crypto from "node:crypto";
import pg from "pg";
import {
  BASE_URL,
  OWNER_EMAIL,
  OWNER_PASSWORD,
  USER_PASSWORD,
  apiContext,
  disposeContexts,
  expectForbidden,
  expectPublicTrackingPayloadIsSafe,
  loginApi,
  nextValidShipmentCode,
  readOk,
  uniqueEmail,
} from "./helpers";

const { Client } = pg;
const testDatabaseUrl = process.env.TEST_DATABASE_URL || "postgres://postgres@localhost:5432/logisticplus_test";
const ownerOrganizationId = "org-logisticplus-default";
const ownerUserId = "u1";

async function dbQuery(sql: string, params: any[] = []) {
  const client = new Client({ connectionString: testDatabaseUrl });
  await client.connect();
  try {
    return await client.query(sql, params);
  } finally {
    await client.end();
  }
}

async function createTenantOwner(owner: Awaited<ReturnType<typeof loginApi>>) {
  const tenantEmail = uniqueEmail("daily-status-tenant-owner");
  const data = await readOk<any>(
    await owner.post("/api/admin/organizations/manual-signup", {
      data: {
        companyName: `Daily Status Tenant ${Date.now()}`,
        ownerName: "Daily Status Tenant Owner",
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

async function insertCommercialCard({
  ownerUserId,
  organizationId,
  id,
  holderName,
}: {
  ownerUserId: string;
  organizationId: string;
  id: string;
  holderName: string;
}) {
  await dbQuery(
    `INSERT INTO user_records (owner_user_id, organization_id, collection, item_id, data, updated_at)
     VALUES ($1, $2, 'commercialCards', $3, $4::jsonb, NOW())
     ON CONFLICT (owner_user_id, collection, item_id)
     DO UPDATE SET organization_id = EXCLUDED.organization_id, data = EXCLUDED.data, updated_at = NOW()`,
    [
      ownerUserId,
      organizationId,
      id,
      JSON.stringify({
        id,
        holderName,
        cardNumber: `CARD-${id.slice(-8)}`,
        issueDate: "2026-01-01",
        expirationDate: "2027-01-01",
        documents: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
    ]
  );
}

async function loginPageByApi(page: Page) {
  const response = await page.context().request.post(`${BASE_URL}/api/auth/login`, {
    data: { email: OWNER_EMAIL, password: OWNER_PASSWORD },
  });
  expect(response.status(), await response.text()).toBeLessThan(400);
}

async function expectNoHorizontalPageOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    body: document.body.scrollWidth - document.body.clientWidth,
    document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  expect(overflow.body).toBeLessThanOrEqual(1);
  expect(overflow.document).toBeLessThanOrEqual(1);
}

async function expectDetailsOpen(details: Locator, expectedOpen: boolean) {
  await expect(details).toBeVisible();
  expect(await details.evaluate((node) => (node as HTMLDetailsElement).open)).toBe(expectedOpen);
}

test.describe.serial("daily status board", () => {
  test("uses grouped tenant-safe rows, explicit relationship patches, audit, and private public tracking defaults", async () => {
    const owner = await loginApi();
    const publicContext = await apiContext();
    const suffix = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
    const ownerCardId = `daily-card-owner-${suffix}`;
    const tenantCardId = `daily-card-tenant-${suffix}`;
    const cotageNumber = `COTAGE-${suffix}`;
    const orderRegistrationNumber = `ORDER-${suffix}`;
    const bankTrackingNumber = `BANK-${suffix}`;
    const paymentReference = `PAY-${suffix}`;
    const truckPlate = `TRUCK-${suffix}`;
    const driverName = `Driver ${suffix}`;
    const taskTitle = `Daily status derived task ${suffix}`;
    const internalSecret = `daily-status-private-${suffix}`;
    const lenjShipmentId = `daily-lenj-${suffix}`;
    const lenjProfileId = `daily-lenj-profile-${suffix}`;
    const lenjShipmentCode = `DAILY-LENJ-${suffix}`;
    const malvaniDisplayName = `Daily Malvani ${suffix}`;
    let tenantInfo: any = null;

    try {
      tenantInfo = await createTenantOwner(owner);
      await insertCommercialCard({
        ownerUserId,
        organizationId: ownerOrganizationId,
        id: ownerCardId,
        holderName: "Owner daily status card",
      });
      await insertCommercialCard({
        ownerUserId: tenantInfo.ownerUserId,
        organizationId: tenantInfo.organizationId,
        id: tenantCardId,
        holderName: "Cross tenant daily status card",
      });

      const rows = await readOk<any[]>(await owner.get("/api/daily-status?shipmentId=s1"));
      expect(rows.length).toBeGreaterThan(0);
      const seedRow = rows.find((row) => row.shipment.id === "s1");
      expect(seedRow).toBeTruthy();
      expect(Object.keys(seedRow).sort()).toEqual([
        "baseInfo",
        "commercialCard",
        "customer",
        "documents",
        "id",
        "kootaj",
        "links",
        "shipment",
        "tasks",
        "v2Profile",
        "workflow",
      ]);
      expect(seedRow.shipment.id).toBe("s1");
      expect(seedRow.customer).toEqual(expect.objectContaining({
        id: expect.any(String),
        customerCode: expect.any(String),
        name: expect.any(String),
      }));
      expect(seedRow.customer.name).toBe(seedRow.customer.customerCode);
      expect(seedRow.baseInfo).toEqual(expect.objectContaining({
        code: seedRow.shipment.code,
        customerCode: seedRow.customer.customerCode,
        customerName: seedRow.customer.customerCode,
        statusText: expect.any(String),
        orderRegistrationNumber: expect.any(String),
        origin: expect.any(String),
        dischargePort: expect.any(String),
        deliveryPort: expect.any(String),
        consigneeName: expect.any(String),
        credentialLabel: expect.any(String),
        credentialDisplayName: expect.any(String),
        documentCount: expect.any(Number),
        currentStage: expect.any(String),
        updatedByName: expect.any(String),
      }));

      const detailAliasRow = await readOk<any>(await owner.get("/api/shipments/s1/daily-status"));
      expect(detailAliasRow.id).toBe("s1");
      expect(detailAliasRow.kootaj).toEqual(expect.any(Object));
      expect(detailAliasRow.baseInfo).toEqual(expect.objectContaining({ code: seedRow.shipment.code }));

      await dbQuery(
        `INSERT INTO shipments (
           id, organization_id, owner_user_id, shipment_code, customer_id, customer_name,
           status, shipment_direction, transport_mode, shipment_type_code, origin, destination,
           created_by_id, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, 'KOOTAJ_DONE', 'import', 'sea', 'IMPORT_LENJ', 'Bushehr', 'Dubai', $3, NOW())`,
        [lenjShipmentId, ownerOrganizationId, ownerUserId, lenjShipmentCode, seedRow.customer.id, seedRow.customer.customerCode]
      );
      await dbQuery(
        `INSERT INTO shipment_v2_profiles (
           id, organization_id, shipment_id, flow_code, sections_json, created_by_id, updated_by_id
         )
         VALUES ($1, $2, $3, 'IMPORT_LANJ', $4::jsonb, $5, $5)`,
        [
          lenjProfileId,
          ownerOrganizationId,
          lenjShipmentId,
          JSON.stringify({
            base: {
              lenjType: "MALVANI",
              malvaniDisplayName,
              commercialCardDisplayName: "",
            },
          }),
          ownerUserId,
        ]
      );
      const lenjRows = await readOk<any[]>(await owner.get(`/api/daily-status?shipmentId=${encodeURIComponent(lenjShipmentId)}`));
      expect(lenjRows[0].shipment.shipmentTypeCode).toBe("IMPORT_LENJ");
      expect(lenjRows[0].baseInfo.credentialLabel).toBe("ملوانی");
      expect(lenjRows[0].baseInfo.credentialDisplayName).toBe(malvaniDisplayName);

      const kootajRows = await readOk<any[]>(await owner.get("/api/daily-status?shipmentStatus=KOOTAJ_DONE"));
      expect(kootajRows.some((row) => row.id === lenjShipmentId)).toBe(true);
      expect(kootajRows.every((row) => row.shipment.status === "KOOTAJ_DONE")).toBe(true);

      const removedCustomsStatusFilter = await owner.get("/api/daily-status?customsStatus=in_customs_review");
      expect(removedCustomsStatusFilter.status(), await removedCustomsStatusFilter.text()).toBe(400);

      const removedReleaseStatusFilter = await owner.get("/api/daily-status?releaseStatus=ready");
      expect(removedReleaseStatusFilter.status(), await removedReleaseStatusFilter.text()).toBe(400);

      const spoofedList = await owner.get(`/api/daily-status?organizationId=${encodeURIComponent(tenantInfo.organizationId)}`);
      await expectForbidden(spoofedList);
      expect((await spoofedList.json()).error?.code).toBe("TENANT_SCOPE_CONFLICT");

      const unknownPatch = await owner.patch("/api/daily-status/s1", {
        data: { arbitraryRelationshipId: "future-module" },
      });
      expect(unknownPatch.status(), await unknownPatch.text()).toBe(400);

      const crossTenantPatch = await owner.patch("/api/daily-status/s1", {
        data: { commercialCardId: tenantCardId },
      });
      expect(crossTenantPatch.status(), await crossTenantPatch.text()).toBe(404);

      const detailCrossTenantPatch = await owner.patch("/api/shipments/s1/daily-status", {
        data: { commercialCardId: tenantCardId },
      });
      expect(detailCrossTenantPatch.status(), await detailCrossTenantPatch.text()).toBe(404);

      const invalidRoutePatch = await owner.patch("/api/shipments/s1/daily-status", {
        data: { customsRoute: "blue" },
      });
      expect(invalidRoutePatch.status(), await invalidRoutePatch.text()).toBe(400);

      const invalidStatusPatch = await owner.patch("/api/shipments/s1/daily-status", {
        data: { customsStatus: "unknown_status" },
      });
      expect(invalidStatusPatch.status(), await invalidStatusPatch.text()).toBe(400);

      const invalidDatePatch = await owner.patch("/api/shipments/s1/daily-status", {
        data: { exitDate: "2026-13-40" },
      });
      expect(invalidDatePatch.status(), await invalidDatePatch.text()).toBe(400);

      const invalidNegativePatch = await owner.patch("/api/shipments/s1/daily-status", {
        data: { currencyAmount: -1 },
      });
      expect(invalidNegativePatch.status(), await invalidNegativePatch.text()).toBe(400);

      const invalidBaseStatusPatch = await owner.patch("/api/shipments/s1/daily-status", {
        data: { baseInfo: { status: "NOT_A_SHIPMENT_STATUS" } },
      });
      expect(invalidBaseStatusPatch.status(), await invalidBaseStatusPatch.text()).toBe(400);

      const baseOrderRegistrationNumber = `BASE-ORDER-${suffix}`;
      const baseCurrentStage = `Base stage ${suffix}`;
      const baseInfoUpdated = await readOk<any>(
        await owner.patch("/api/shipments/s1/daily-status", {
          data: {
            baseInfo: {
              status: "ARRIVED",
              currentStage: baseCurrentStage,
              origin: "Daily origin",
              deliveryPort: "Daily delivery port",
              dischargePort: "Daily discharge port",
              consigneeName: "Daily consignee",
              orderRegistrationNumber: baseOrderRegistrationNumber,
            },
          },
        })
      );
      expect(baseInfoUpdated.shipment.status).toBe("ARRIVED");
      expect(baseInfoUpdated.shipment.origin).toBe("Daily origin");
      expect(baseInfoUpdated.shipment.destination).toBe("Daily delivery port");
      expect(baseInfoUpdated.baseInfo.currentStage).toBe(baseCurrentStage);
      expect(baseInfoUpdated.baseInfo.dischargePort).toBe("Daily discharge port");
      expect(baseInfoUpdated.baseInfo.consigneeName).toBe("Daily consignee");
      expect(baseInfoUpdated.baseInfo.orderRegistrationNumber).toBe(baseOrderRegistrationNumber);
      expect(baseInfoUpdated.kootaj.orderRegistrationNumber).toBe(baseOrderRegistrationNumber);

      const canonicalAfterBaseEdit = await readOk<any>(await owner.get("/api/shipments/s1"));
      expect(canonicalAfterBaseEdit.status).toBe("ARRIVED");
      expect(canonicalAfterBaseEdit.origin).toBe("Daily origin");
      expect(canonicalAfterBaseEdit.destination).toBe("Daily delivery port");

      const startedAt = new Date(Date.now() - 1000).toISOString();
      const updated = await readOk<any>(
        await owner.patch("/api/daily-status/s1", {
          data: {
            commercialCardId: ownerCardId,
            orderRegistrationNumber,
            bankTrackingNumber,
            cotageNumber,
            customsRoute: "green",
            customsStatus: "in_customs_review",
            customsOffice: "Shahid Rajaee",
            declarationReference: `DECL-${suffix}`,
            customsPaymentStatus: "pending",
            paymentReference,
            releaseStatus: "ready",
            truckPlate,
            driverName,
            internalNote: internalSecret,
          },
        })
      );
      expect(updated.kootaj.cotageNumber).toBe(cotageNumber);
      expect(updated.kootaj.orderRegistrationNumber).toBe(orderRegistrationNumber);
      expect(updated.kootaj.bankTrackingNumber).toBe(bankTrackingNumber);
      expect(updated.kootaj.customsPaymentStatus).toBe("pending");
      expect(updated.kootaj.paymentReference).toBe(paymentReference);
      expect(updated.kootaj.truckPlate).toBe(truckPlate);
      expect(updated.kootaj.driverName).toBe(driverName);
      expect(updated.commercialCard.id).toBe(ownerCardId);
      expect(updated.commercialCard.displayName).toBe("Owner daily status card");

      const audit = await dbQuery(
        `SELECT event_type, resource_id, before_json, after_json, metadata_json
         FROM audit_logs
         WHERE event_type = 'daily_status.update'
           AND resource_id = 's1'
           AND created_at >= $1
         ORDER BY created_at DESC
         LIMIT 1`,
        [startedAt]
      );
      expect(audit.rows[0]?.metadata_json?.source).toBe("daily-status");
      expect(audit.rows[0]?.metadata_json?.changedFields).toContain("commercialCardId");
      expect(audit.rows[0]?.metadata_json?.changedFields).toContain("customsPaymentStatus");
      expect(audit.rows[0]?.metadata_json?.changedFields).toContain("bankTrackingNumber");
      expect(audit.rows[0]?.after_json?.cotageNumber).toBe(cotageNumber);

      const beforeDerived = await readOk<any[]>(await owner.get("/api/daily-status?shipmentId=s1"));
      const beforeOpenTasks = beforeDerived[0].tasks.openCount;
      await readOk<any>(
        await owner.post("/api/tasks", {
          data: {
            title: taskTitle,
            shipmentId: "s1",
            assignedToUserId: ownerUserId,
            priority: "HIGH",
          },
        })
      );
      const afterDerived = await readOk<any[]>(await owner.get("/api/daily-status?shipmentId=s1"));
      expect(afterDerived[0].tasks.openCount).toBe(beforeOpenTasks + 1);

      const access = await readOk<{ token: string }>(await owner.post("/api/shipments/s1/customer-access/generate"));
      const publicPayload = await readOk<any>(await publicContext.get(`/api/public/track/${encodeURIComponent(access.token)}`));
      expectPublicTrackingPayloadIsSafe(publicPayload);
      const serializedPublic = JSON.stringify(publicPayload);
      expect(serializedPublic).not.toContain(cotageNumber);
      expect(serializedPublic).not.toContain(orderRegistrationNumber);
      expect(serializedPublic).not.toContain(bankTrackingNumber);
      expect(serializedPublic).not.toContain(paymentReference);
      expect(serializedPublic).not.toContain(truckPlate);
      expect(serializedPublic).not.toContain(driverName);
      expect(serializedPublic).not.toContain(ownerCardId);
      expect(serializedPublic).not.toContain(internalSecret);
      expect(serializedPublic.toLowerCase()).not.toContain("commercialcard");
      expect(serializedPublic.toLowerCase()).not.toContain("kootaj");
    } finally {
      await owner.post("/api/shipments/s1/customer-access/disable").catch(() => null);
      await dbQuery("DELETE FROM tasks WHERE title = $1", [taskTitle]).catch(() => null);
      await dbQuery("DELETE FROM shipment_kootaj_details WHERE cotage_number = $1", [cotageNumber]).catch(() => null);
      await dbQuery("DELETE FROM user_records WHERE item_id IN ($1, $2)", [ownerCardId, tenantCardId]).catch(() => null);
      await dbQuery("DELETE FROM shipment_v2_profiles WHERE shipment_id = $1", [lenjShipmentId]).catch(() => null);
      await dbQuery("DELETE FROM shipments WHERE id = $1", [lenjShipmentId]).catch(() => null);
      await disposeContexts(owner, publicContext);
    }
  });

  test("orders daily status rows by closest active shipment timer before created date fallback", async () => {
    const owner = await loginApi();
    try {
      const noTimer = await readOk<any>(
        await owner.post("/api/shipments", {
          data: {
            trackingNumber: await nextValidShipmentCode(),
            origin: "Daily no timer origin",
            destination: "Daily no timer destination",
            status: "LOADING",
          },
        })
      );
      const laterTimer = await readOk<any>(
        await owner.post("/api/shipments", {
          data: {
            trackingNumber: await nextValidShipmentCode(),
            origin: "Daily later timer origin",
            destination: "Daily later timer destination",
            status: "LOADING",
          },
        })
      );
      const closestTimer = await readOk<any>(
        await owner.post("/api/shipments", {
          data: {
            trackingNumber: await nextValidShipmentCode(),
            origin: "Daily closest timer origin",
            destination: "Daily closest timer destination",
            status: "LOADING",
          },
        })
      );

      await readOk<any>(
        await owner.patch(`/api/shipments/${encodeURIComponent(laterTimer.id)}/operational-fields`, {
          data: { timerDeadlineAt: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString() },
        })
      );
      await readOk<any>(
        await owner.patch(`/api/shipments/${encodeURIComponent(closestTimer.id)}/operational-fields`, {
          data: { timerDeadlineAt: new Date(Date.now() + 60 * 60 * 1000).toISOString() },
        })
      );

      const rows = await readOk<any[]>(await owner.get("/api/daily-status"));
      const ids = rows.map((row) => row.id);
      expect(ids.indexOf(closestTimer.id)).toBeGreaterThanOrEqual(0);
      expect(ids.indexOf(laterTimer.id)).toBeGreaterThanOrEqual(0);
      expect(ids.indexOf(noTimer.id)).toBeGreaterThanOrEqual(0);
      expect(ids.indexOf(closestTimer.id)).toBeLessThan(ids.indexOf(laterTimer.id));
      expect(ids.indexOf(laterTimer.id)).toBeLessThan(ids.indexOf(noTimer.id));
    } finally {
      await disposeContexts(owner);
    }
  });

  test("keeps the board usable on desktop/mobile and syncs edits both ways with shipment detail", async ({ page }) => {
    const owner = await loginApi();
    const suffix = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
    const ownerCardId = `daily-card-ui-${suffix}`;
    const detailCardId = `daily-card-detail-${suffix}`;
    const originalCotageNumber = `UI-COTAGE-${suffix}`;
    const editedCotageNumber = `UI-COTAGE-EDIT-${suffix}`;
    const editedDailyOrderRegistrationNumber = `UI-DAILY-ORDER-${suffix}`;
    const editedDailyCurrentStage = `Daily stage ${suffix}`;
    const detailCotageNumber = `UI-COTAGE-DETAIL-${suffix}`;
    const detailOrderRegistrationNumber = `UI-ORDER-${suffix}`;
    const detailBankTrackingNumber = `UI-BANK-${suffix}`;
    const detailTruckPlate = `UI-TRUCK-${suffix}`;
    const detailDriverName = `UI Driver ${suffix}`;

    try {
      await insertCommercialCard({
        ownerUserId,
        organizationId: ownerOrganizationId,
        id: ownerCardId,
        holderName: "Owner daily status UI card",
      });
      await insertCommercialCard({
        ownerUserId,
        organizationId: ownerOrganizationId,
        id: detailCardId,
        holderName: "Owner daily status detail card",
      });

      await readOk<any>(
        await owner.patch("/api/daily-status/s1", {
          data: {
            commercialCardId: ownerCardId,
            cotageNumber: originalCotageNumber,
            customsRoute: "green",
            customsStatus: "in_customs_review",
            releaseStatus: "ready",
            customsPaymentStatus: "pending",
            customsOffice: "UI Test Customs Office",
            internalNote: `daily-status-ui-private-${suffix}`,
          },
        })
      );
      await readOk<any>(
        await owner.patch("/api/shipments/s1/operational-fields", {
          data: { timerDeadlineAt: new Date(Date.now() + 10 * 60 * 1000).toISOString() },
        })
      );
      const uiRows = await readOk<any[]>(await owner.get("/api/daily-status"));
      const uiSeedRow = uiRows.find((row) => row.shipment.id === "s1");
      const expectedCustomerCode = uiSeedRow?.baseInfo?.customerCode || uiSeedRow?.customer?.customerCode || uiSeedRow?.customer?.id;
      expect(expectedCustomerCode).toBeTruthy();

      await loginPageByApi(page);
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto("/daily-status");
      await expect(page.getByTestId("daily-status-page")).toBeVisible();
      await expect(page.getByTestId("daily-status-row-s1")).toBeVisible();
      await expect(page.getByTestId("daily-status-compact-list")).toBeVisible();
      await expect(page.getByTestId("daily-status-detail-panel")).toBeVisible();
      await expect(page.getByTestId("daily-status-table-panel")).toHaveCount(0);
      await expect(page.getByTestId("daily-status-mobile-list")).toBeHidden();
      await expect(page.getByText("همه وضعیت‌ها", { exact: true })).toHaveCount(0);
      await expect(page.getByText("همه ترخیص‌ها", { exact: true })).toHaveCount(0);
      await expectNoHorizontalPageOverflow(page);

      await page.getByTestId("daily-status-details-s1").click();
      await expect(page.getByTestId("daily-status-desktop-view-panel-s1")).toBeVisible();
      await expectDetailsOpen(page.getByTestId("daily-status-desktop-section-base-s1"), true);
      await expectDetailsOpen(page.getByTestId("daily-status-desktop-section-goods-v2-s1"), true);
      await expectDetailsOpen(page.getByTestId("daily-status-desktop-section-declarationKootaj-s1"), true);
      await expectDetailsOpen(page.getByTestId("daily-status-desktop-section-permits-s1"), true);
      await expectDetailsOpen(page.getByTestId("daily-status-desktop-section-payments-s1"), true);
      await expectDetailsOpen(page.getByTestId("daily-status-desktop-section-banking-s1"), true);
      await expectDetailsOpen(page.getByTestId("daily-status-desktop-section-notes-s1"), true);
      await expect(page.getByTestId("daily-status-desktop-view-panel-s1")).toContainText("Owner daily status UI card");
      await expect(page.getByTestId("daily-status-desktop-view-panel-s1")).toContainText(originalCotageNumber);
      await expect(page.getByTestId("daily-status-desktop-base-info-s1")).toBeVisible();
      await expect(page.getByTestId("daily-status-desktop-base-customer-s1")).toContainText(expectedCustomerCode);
      await expect(page.getByTestId("daily-status-desktop-base-business-credential-s1")).toContainText("Owner daily status UI card");
      await expect(page.getByTestId("daily-status-desktop-base-document-count-s1")).toBeVisible();
      await expect(page.getByTestId("daily-status-desktop-base-origin-s1")).toBeVisible();
      await expect(page.getByTestId("daily-status-desktop-base-delivery-port-s1")).toBeVisible();
      await expect(page.getByTestId("daily-status-desktop-base-discharge-port-s1")).toBeVisible();
      await expect(page.getByTestId("daily-status-desktop-base-consignee-s1")).toHaveCount(0);
      await expect(page.getByTestId("daily-status-desktop-base-current-stage-s1")).toBeVisible();
      await expect(page.getByTestId("daily-status-desktop-base-goods-s1")).toHaveCount(0);
      await expect(page.getByTestId("daily-status-desktop-base-packaging-s1")).toHaveCount(0);
      await page.getByTestId("daily-status-desktop-base-customer-button-s1").click();
      await expect(page.getByTestId("daily-status-desktop-customer-dialog-s1")).toBeVisible();
      await expect(page.getByTestId("daily-status-desktop-customer-active-shipments-s1")).toContainText("LS-9801");
      await page.keyboard.press("Escape");
      await expect(page.getByTestId("daily-status-desktop-customer-dialog-s1")).toBeHidden();
      await page.getByTestId("daily-status-desktop-base-business-credential-button-s1").click();
      await expect(page.getByTestId("daily-status-desktop-business-credential-dialog-s1")).toContainText("Owner daily status UI card");
      await page.keyboard.press("Escape");
      await expect(page.getByTestId("daily-status-desktop-business-credential-dialog-s1")).toBeHidden();

      await page.getByTestId("daily-status-edit-s1").click();
      await expect(page.getByTestId("daily-status-desktop-edit-panel-s1")).toBeVisible();
      const currentEditSectionIds = [
        "base",
        "goods-v2",
        "declarationKootaj",
        "permits",
        "payments",
        "banking",
        "notes",
      ];
      for (const sectionId of currentEditSectionIds) {
        await expectDetailsOpen(page.getByTestId(`daily-status-desktop-section-${sectionId}-s1`), true);
      }
      for (const oldSectionId of [
        "order-registration",
        "fx-bank",
        "origin-docs",
        "arrival-warehouse",
        "declaration",
        "inspection",
        "release",
        "commercial-card",
        "internal-note",
      ]) {
        await expect(page.getByTestId(`daily-status-desktop-section-${oldSectionId}-s1`)).toHaveCount(0);
      }
      await expect(page.getByTestId("daily-status-desktop-base-status-s1-select")).toBeVisible();
      await expect(page.getByTestId("daily-status-desktop-base-order-registration-number-s1-input")).toBeVisible();
      await expect(page.getByTestId("daily-status-desktop-base-origin-s1-input")).toHaveCount(0);
      await expect(page.getByTestId("daily-status-desktop-base-delivery-port-s1-input")).toHaveCount(0);
      await expect(page.getByTestId("daily-status-desktop-base-discharge-port-s1-input")).toHaveCount(0);
      await expect(page.getByTestId("daily-status-desktop-base-consignee-s1")).toHaveCount(0);
      await expect(page.getByTestId("daily-status-desktop-base-consignee-s1-input")).toHaveCount(0);
      await expect(page.getByTestId("daily-status-desktop-base-current-stage-s1-input")).toBeVisible();
      await expect(page.getByTestId("daily-status-desktop-commercialCardId-s1-select")).toHaveCount(0);
      await expect(page.getByTestId("daily-status-desktop-orderRegistrationNumber-s1-input")).toHaveCount(0);
      await expect(page.getByTestId("daily-status-desktop-bankTrackingNumber-s1-input")).toHaveCount(0);
      await expect(page.getByTestId("daily-status-desktop-truckPlate-s1-input")).toHaveCount(0);
      await expect(page.getByTestId("daily-status-desktop-driverName-s1-input")).toHaveCount(0);
      const statusBox = await page.getByTestId("daily-status-desktop-base-status-s1").boundingBox();
      const currentStageBox = await page.getByTestId("daily-status-desktop-base-current-stage-s1").boundingBox();
      expect(statusBox).not.toBeNull();
      expect(currentStageBox).not.toBeNull();
      expect(Math.abs((statusBox?.y || 0) - (currentStageBox?.y || 0))).toBeLessThan(12);
      await page.getByTestId("daily-status-desktop-base-order-registration-number-s1-input").fill(editedDailyOrderRegistrationNumber);
      await page.getByTestId("daily-status-desktop-base-current-stage-s1-input").fill(editedDailyCurrentStage);
      await page.getByTestId("daily-status-desktop-cotageNumber-s1-input").fill(editedCotageNumber);
      const saveResponse = page.waitForResponse((response) => (
        response.url().includes("/api/daily-status/s1") && response.request().method() === "PATCH"
      ));
      await page.getByTestId("daily-status-desktop-save-s1").click();
      expect((await saveResponse).status()).toBeLessThan(400);
      await expect(page.getByTestId("daily-status-desktop-view-panel-s1")).toContainText(editedCotageNumber);
      await expect(page.getByTestId("daily-status-desktop-base-order-registration-number-s1")).toContainText(editedDailyOrderRegistrationNumber);
      await expect(page.getByTestId("daily-status-desktop-base-current-stage-s1")).toContainText(editedDailyCurrentStage);

      await page.goto("/shipments/s1/legacy");
      await expect(page).toHaveURL(/\/shipments\/s1$/);
      await expect(page.getByTestId("shipment-v2-detail-page")).toBeVisible();
      await expect(page.getByTestId("shipment-daily-status-panel")).toHaveCount(0);
      const detailStartedAt = new Date(Date.now() - 1000).toISOString();
      const detailSaveResponse = await owner.patch("/api/shipments/s1/daily-status", {
        data: {
          cotageNumber: detailCotageNumber,
          orderRegistrationNumber: detailOrderRegistrationNumber,
          bankTrackingNumber: detailBankTrackingNumber,
          customsPaymentStatus: "completed",
          commercialCardId: detailCardId,
          truckPlate: detailTruckPlate,
          driverName: detailDriverName,
          exitDate: "2026-06-02",
        },
      });
      expect(detailSaveResponse.status(), await detailSaveResponse.text()).toBeLessThan(400);
      const syncedRows = await readOk<any[]>(await owner.get("/api/daily-status?shipmentId=s1"));
      expect(syncedRows[0].kootaj.cotageNumber).toBe(detailCotageNumber);
      expect(syncedRows[0].kootaj.orderRegistrationNumber).toBe(detailOrderRegistrationNumber);
      expect(syncedRows[0].kootaj.bankTrackingNumber).toBe(detailBankTrackingNumber);
      expect(syncedRows[0].kootaj.customsPaymentStatus).toBe("completed");
      expect(syncedRows[0].kootaj.truckPlate).toBe(detailTruckPlate);
      expect(syncedRows[0].kootaj.driverName).toBe(detailDriverName);
      expect(syncedRows[0].kootaj.exitDate).toBe("2026-06-02");
      expect(syncedRows[0].commercialCard.id).toBe(detailCardId);

      const detailAudit = await dbQuery(
        `SELECT before_json, after_json, metadata_json
         FROM audit_logs
         WHERE event_type = 'daily_status.update'
           AND resource_id = 's1'
           AND metadata_json->>'source' = 'shipment-detail-daily-status'
           AND created_at >= $1
         ORDER BY created_at DESC
         LIMIT 5`,
        [detailStartedAt]
      );
      const detailChangedFields = detailAudit.rows.flatMap((row) => row.metadata_json?.changedFields || []);
      expect(detailChangedFields).toEqual(
        expect.arrayContaining(["commercialCardId", "cotageNumber", "exitDate", "orderRegistrationNumber", "bankTrackingNumber", "customsPaymentStatus", "truckPlate", "driverName"])
      );
      expect(detailAudit.rows.some((row) => row.after_json?.cotageNumber === detailCotageNumber)).toBe(true);

      await page.goto("/daily-status");
      await expect(page.getByTestId("daily-status-row-s1")).toBeVisible();
      await page.getByTestId("daily-status-details-s1").click();
      await expect(page.getByTestId("daily-status-desktop-view-panel-s1")).toContainText(detailCotageNumber);
      await expect(page.getByTestId("daily-status-desktop-view-panel-s1")).toContainText("Owner daily status detail card");

      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto("/daily-status");
      await expect(page.getByTestId("daily-status-mobile-list")).toBeVisible();
      await expect(page.getByTestId("daily-status-mobile-card-s1")).toBeVisible();
      await expect(page.getByTestId("daily-status-table-panel")).toHaveCount(0);
      await expectNoHorizontalPageOverflow(page);

      await page.getByTestId("daily-status-mobile-filter-toggle").click();
      await expect(page.getByTestId("daily-status-mobile-filters")).toBeVisible();
      await expect(page.getByTestId("daily-status-mobile-filters").getByText("همه وضعیت‌ها", { exact: true })).toHaveCount(0);
      await expect(page.getByTestId("daily-status-mobile-filters").getByText("همه ترخیص‌ها", { exact: true })).toHaveCount(0);
      await page.getByTestId("daily-status-mobile-details-s1").click();
      await expect(page.getByTestId("daily-status-mobile-view-panel-s1")).toBeVisible();
      await expect(page.getByTestId("daily-status-mobile-view-panel-s1")).toContainText(detailCotageNumber);
    } finally {
      await dbQuery(
        "DELETE FROM shipment_kootaj_details WHERE organization_id = $1 AND shipment_id = 's1' AND cotage_number IN ($2, $3, $4)",
        [ownerOrganizationId, originalCotageNumber, editedCotageNumber, detailCotageNumber]
      ).catch(() => null);
      await dbQuery("DELETE FROM user_records WHERE item_id IN ($1, $2)", [ownerCardId, detailCardId]).catch(() => null);
      await owner.patch("/api/shipments/s1/operational-fields", { data: { timerDeadlineAt: null } }).catch(() => null);
      await disposeContexts(owner);
    }
  });
});
