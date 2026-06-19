import { expect, test, type Page } from "@playwright/test";
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
  expectUnavailable,
  loginApi,
  readOk,
  uniqueEmail,
} from "./helpers";

const { Client } = pg;
const testDatabaseUrl = process.env.TEST_DATABASE_URL || "postgres://postgres@localhost:5432/logisticplus_test";

async function dbQuery(sql: string, params: any[] = []) {
  const client = new Client({ connectionString: testDatabaseUrl });
  await client.connect();
  try {
    return await client.query(sql, params);
  } finally {
    await client.end();
  }
}

async function loginPageByApi(page: Page, email = OWNER_EMAIL, password = OWNER_PASSWORD) {
  const response = await page.context().request.post(`${BASE_URL}/api/auth/login`, {
    data: { email, password },
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

async function createCustomer(context: Awaited<ReturnType<typeof loginApi>>, marker: string) {
  return readOk<any>(
    await context.post("/api/customers", {
      data: {
        name: `${marker} Customer`,
        company: `${marker} Company`,
        email: `${marker.toLowerCase()}@example.test`,
        phone: "09120000000",
        address: `${marker} Address`,
      },
    })
  );
}

async function createCompanyUser(owner: Awaited<ReturnType<typeof loginApi>>, role = "OPERATIONS") {
  const email = uniqueEmail("kootaj-board-user");
  const response = await owner.post("/api/users", {
    data: {
      name: "Kootaj Board Employee",
      email,
      password: USER_PASSWORD,
      role,
    },
  });
  const user = await readOk<any>(response);
  return { user, email };
}

async function createTenantOwner(owner: Awaited<ReturnType<typeof loginApi>>) {
  const tenantEmail = uniqueEmail("kootaj-board-tenant-owner");
  const data = await readOk<any>(
    await owner.post("/api/admin/organizations/manual-signup", {
      data: {
        companyName: `Kootaj Board Tenant ${Date.now()}`,
        ownerName: "Kootaj Board Tenant Owner",
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

test.describe.serial("read-only kootaj board", () => {
  test("uses the Daily Status projection alias with tenant and customer privacy safeguards", async () => {
    const owner = await loginApi();
    const anonymous = await apiContext();
    const contexts = [owner, anonymous];
    try {
      await expectForbidden(await anonymous.get("/api/kootaj-board"));

      const kootajRows = await readOk<any[]>(await owner.get("/api/kootaj-board?shipmentId=s1"));
      const dailyRows = await readOk<any[]>(await owner.get("/api/daily-status?shipmentId=s1"));
      expect(kootajRows.length).toBeGreaterThan(0);
      expect(dailyRows.length).toBeGreaterThan(0);
      expect(kootajRows[0].shipment).toMatchObject({
        id: dailyRows[0].shipment.id,
        code: dailyRows[0].shipment.code,
        status: dailyRows[0].shipment.status,
      });
      expect(kootajRows[0].kootaj).toMatchObject({
        cotageNumber: dailyRows[0].kootaj.cotageNumber,
        customsRoute: dailyRows[0].kootaj.customsRoute,
      });
      expect(kootajRows[0].links.shipmentDetailUrl).toBe("/shipments/s1");

      const employeeInfo = await createCompanyUser(owner);
      const employee = await loginApi(employeeInfo.email, USER_PASSWORD);
      contexts.push(employee);
      const employeeRows = await readOk<any[]>(await employee.get("/api/kootaj-board?shipmentId=s1"));
      expect(employeeRows.length).toBeGreaterThan(0);
      const employeeRow = employeeRows[0];
      expect(employeeRow.customer.name).toBe(employeeRow.customer.customerCode);
      expect(JSON.stringify(employeeRow).toLowerCase()).not.toMatch(/phone|email|address|referrer|private/);

      const tenantInfo = await createTenantOwner(owner);
      const tenant = await loginApi(tenantInfo.tenantEmail, USER_PASSWORD);
      contexts.push(tenant);
      const tenantRows = await readOk<any[]>(await tenant.get("/api/kootaj-board?shipmentId=s1"));
      expect(tenantRows).toEqual([]);
    } finally {
      await disposeContexts(...contexts);
    }
  });

  test("updates safe Kootaj fields through the shared backend path only", async () => {
    const owner = await loginApi();
    const anonymous = await apiContext();
    const contexts = [owner, anonymous];
    const suffix = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
    try {
      const ownerAuth = await readOk<any>(await owner.get("/api/auth/me"));
      const customer = await createCustomer(owner, `KootajPhase2A${suffix}`);
      const created = await readOk<any>(
        await owner.post("/api/shipments/v2", {
          data: {
            flowCode: "IMPORT_SHIP",
            customerId: customer.id,
            origin: "Jebel Ali",
            dischargePort: "Bandar Abbas",
            deliveryPort: "Tehran",
            consigneeName: "Kootaj consignee",
          },
        })
      );
      const shipmentId = created.shipment.id;
      const cotageNumber = `KB-COTAGE-${suffix}`;
      const startedAt = new Date(Date.now() - 1000).toISOString();

      const unauthorized = await anonymous.patch(`/api/kootaj-board/${encodeURIComponent(shipmentId)}`, {
        data: { cotageNumber },
      });
      await expectForbidden(unauthorized);

      const invalidRelationship = await owner.patch(`/api/kootaj-board/${encodeURIComponent(shipmentId)}`, {
        data: { commercialCardId: `card-${suffix}` },
      });
      expect(invalidRelationship.status(), await invalidRelationship.text()).toBe(400);

      const invalidRoute = await owner.patch(`/api/kootaj-board/${encodeURIComponent(shipmentId)}`, {
        data: { customsRoute: "blue" },
      });
      expect(invalidRoute.status(), await invalidRoute.text()).toBe(400);

      const updated = await readOk<any>(
        await owner.patch(`/api/kootaj-board/${encodeURIComponent(shipmentId)}`, {
          data: {
            cotageNumber,
            customsRoute: "yellow",
            customsStatus: "inspection",
            releaseStatus: "ready",
          },
        })
      );
      expect(updated.kootaj.cotageNumber).toBe(cotageNumber);
      expect(updated.kootaj.customsRoute).toBe("yellow");
      expect(updated.kootaj.customsStatus).toBe("inspection");
      expect(updated.kootaj.releaseStatus).toBe("ready");

      const kootajRows = await readOk<any[]>(await owner.get(`/api/kootaj-board?shipmentId=${encodeURIComponent(shipmentId)}`));
      expect(kootajRows).toHaveLength(1);
      expect(kootajRows[0].kootaj).toMatchObject({
        cotageNumber,
        customsRoute: "yellow",
        customsStatus: "inspection",
        releaseStatus: "ready",
      });

      const dailyRows = await readOk<any[]>(await owner.get(`/api/daily-status?shipmentId=${encodeURIComponent(shipmentId)}`));
      expect(dailyRows[0].kootaj).toMatchObject(kootajRows[0].kootaj);

      const detailAlias = await readOk<any>(await owner.get(`/api/shipments/${encodeURIComponent(shipmentId)}/daily-status`));
      expect(detailAlias.kootaj).toMatchObject(kootajRows[0].kootaj);

      const v2Profile = await readOk<any>(await owner.get(`/api/shipments/${encodeURIComponent(shipmentId)}/v2-profile`));
      expect(v2Profile.profile.sections.declarationKootaj.cotageNumber).toBe(cotageNumber);
      expect(v2Profile.profile.sections.declarationKootaj.customsRoute).toBe("YELLOW");

      const audit = await dbQuery(
        `SELECT organization_id, actor_user_id, resource_id, after_json, metadata_json
         FROM audit_logs
         WHERE event_type = 'daily_status.update'
           AND resource_id = $1
           AND metadata_json->>'source' = 'kootaj-board'
           AND created_at >= $2
         ORDER BY created_at DESC
         LIMIT 1`,
        [shipmentId, startedAt]
      );
      expect(audit.rows[0]?.organization_id).toBe(ownerAuth.user.organizationId);
      expect(audit.rows[0]?.actor_user_id).toBe(ownerAuth.user.id);
      expect(audit.rows[0]?.metadata_json?.shipmentId).toBe(shipmentId);
      expect(audit.rows[0]?.metadata_json?.changedFields).toEqual(
        expect.arrayContaining(["cotageNumber", "customsRoute", "customsStatus", "releaseStatus"])
      );
      expect(audit.rows[0]?.after_json).toEqual(expect.objectContaining({
        cotageNumber,
        customsRoute: "yellow",
        customsStatus: "inspection",
        releaseStatus: "ready",
      }));

      const tenantInfo = await createTenantOwner(owner);
      const tenant = await loginApi(tenantInfo.tenantEmail, USER_PASSWORD);
      contexts.push(tenant);
      await expectUnavailable(
        await tenant.patch(`/api/kootaj-board/${encodeURIComponent(shipmentId)}`, {
          data: { cotageNumber: `CROSS-${suffix}` },
        })
      );

      const detailCotageNumber = `DETAIL-COTAGE-${suffix}`;
      const detailUpdated = await readOk<any>(
        await owner.patch(`/api/shipments/${encodeURIComponent(shipmentId)}/v2-profile/sections/declarationKootaj`, {
          data: {
            cotageNumber: detailCotageNumber,
            customsRoute: "RED",
            cotageRegistrationDate: "",
            totalValueAmount: null,
            totalValueCurrency: "IRR",
            finalPaidAmount: null,
            finalPaidCurrency: "IRR",
          },
        })
      );
      expect(detailUpdated.profile.sections.declarationKootaj.cotageNumber).toBe(detailCotageNumber);
      expect(detailUpdated.profile.sections.declarationKootaj.customsRoute).toBe("RED");

      const afterDetailRows = await readOk<any[]>(
        await owner.get(`/api/kootaj-board?shipmentId=${encodeURIComponent(shipmentId)}`)
      );
      expect(afterDetailRows[0].kootaj.cotageNumber).toBe(detailCotageNumber);
      expect(afterDetailRows[0].kootaj.customsRoute).toBe("red");
      expect(afterDetailRows[0].kootaj.customsStatus).toBe("inspection");
      expect(afterDetailRows[0].kootaj.releaseStatus).toBe("ready");
    } finally {
      await disposeContexts(...contexts);
    }
  });

  test("renders protected read-only rows, links to canonical detail, and preserves legacy redirects", async ({ page }) => {
    const owner = await loginApi();
    try {
      const rows = await readOk<any[]>(await owner.get("/api/kootaj-board?shipmentId=s1"));
      expect(rows.length).toBeGreaterThan(0);
    } finally {
      await disposeContexts(owner);
    }

    let patchSeen = false;
    page.on("request", (request) => {
      if (request.method() === "PATCH" && request.url().includes("/api/kootaj-board")) {
        patchSeen = true;
      }
    });

    await loginPageByApi(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/kootaj-board");
    await expect(page.getByTestId("kootaj-board-page")).toBeVisible();
    await expect(page.getByTestId("kootaj-board-table")).toBeVisible();
    await expect(page.getByTestId("kootaj-board-row-s1")).toBeVisible();
    await expect(page.getByTestId("kootaj-board-readonly-notice")).toBeVisible();
    await expect(page.getByRole("button", { name: /ذخیره|ویرایش|حذف/ })).toHaveCount(0);
    await expect(page.locator('[data-testid^="kootaj-board-edit"], [data-testid^="kootaj-board-save"]')).toHaveCount(0);
    await expectNoHorizontalPageOverflow(page);

    await page.getByTestId("kootaj-board-row-link-s1").click();
    await expect(page).toHaveURL(/\/shipments\/s1$/);
    await expect(page.getByTestId("shipment-v2-detail-page")).toBeVisible();

    await page.goto("/shipments/s1/v2");
    await expect(page).toHaveURL(/\/shipments\/s1$/);
    await expect(page.getByTestId("shipment-v2-detail-page")).toBeVisible();

    await page.goto("/shipments/s1/legacy");
    await expect(page).toHaveURL(/\/shipments\/s1$/);
    await expect(page.getByTestId("shipment-v2-detail-page")).toBeVisible();
    expect(patchSeen).toBe(false);
  });

  test("shows empty and error states without horizontal overflow on desktop and mobile", async ({ page }) => {
    await loginPageByApi(page);
    await page.route("**/api/kootaj-board**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, data: [] }),
      });
    });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/kootaj-board");
    await expect(page.getByTestId("kootaj-board-empty-state")).toBeVisible();
    await expectNoHorizontalPageOverflow(page);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/kootaj-board");
    await expect(page.getByTestId("kootaj-board-empty-state")).toBeVisible();
    await expectNoHorizontalPageOverflow(page);

    await page.unroute("**/api/kootaj-board**");
    await page.route("**/api/kootaj-board**", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, error: { message: "kootaj board test failure" } }),
      });
    });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/kootaj-board");
    await expect(page.getByTestId("kootaj-board-error-state")).toContainText("kootaj board test failure");
    await expectNoHorizontalPageOverflow(page);
  });
});
