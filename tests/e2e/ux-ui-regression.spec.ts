import { expect, test, type Page } from "@playwright/test";
import pg from "pg";
import { BASE_URL, expectPublicTrackingPayloadIsSafe, loginApi, loginViaUi, readOk } from "./helpers";

const { Client } = pg;
const testDatabaseUrl = process.env.TEST_DATABASE_URL || "postgres://postgres@localhost:5432/logisticplus_test";

async function dbClient() {
  const client = new Client({ connectionString: testDatabaseUrl });
  await client.connect();
  return client;
}

async function ownerOrganizationId() {
  const client = await dbClient();
  try {
    const result = await client.query("SELECT organization_id FROM app_users WHERE id = 'u1'");
    return result.rows[0]?.organization_id || null;
  } finally {
    await client.end();
  }
}

async function seedLegacyShipmentWithoutSteps(id: string) {
  const client = await dbClient();
  const shipment = {
    id,
    trackingNumber: id.toUpperCase(),
    containerNumber: `${id.toUpperCase()}-CONT`,
    customerId: "c1",
    customerName: "Legacy Customer",
    origin: "Tehran",
    destination: "Bandar Abbas",
    status: "PENDING",
    createdAt: "1405/01/01",
    estimatedDelivery: "1405/01/10 09:00",
    freeTimeDays: 7,
  };
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM user_records WHERE item_id LIKE $1 OR data::text LIKE $2", [`${id}%`, `%${id}%`]);
    await client.query("DELETE FROM shipments WHERE id = $1 OR shipment_code = $2", [id, shipment.trackingNumber]);
    await client.query(
      `INSERT INTO shipments (
         id, organization_id, owner_user_id, shipment_code, customer_id, customer_name, status,
         origin, destination, estimated_delivery_at, free_time_ends_at, legacy_data, created_by_id, updated_at
       )
       VALUES ($1, NULL, 'u1', $2, 'c1', $3, 'PENDING', $4, $5, $6, $6, $7::jsonb, 'u1', NOW())`,
      [
        shipment.id,
        shipment.trackingNumber,
        shipment.customerName,
        shipment.origin,
        shipment.destination,
        shipment.estimatedDelivery,
        JSON.stringify(shipment),
      ]
    );
    await client.query(
      `INSERT INTO user_records (owner_user_id, organization_id, collection, item_id, data, updated_at)
       VALUES ('u1', NULL, 'shipments', $1, $2::jsonb, NOW())`,
      [id, JSON.stringify(shipment)]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

async function expectNoHorizontalOverflow(page: Page) {
  await expect.poll(
    () => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)
  ).toBe(true);
}

async function collectConsoleErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (message) => {
    const text = message.text();
    if (message.type() === "error" && !text.includes("/@vite/client") && !text.includes("WebSocket")) {
      errors.push(text);
    }
  });
  page.on("pageerror", (error) => {
    if (!error.message.includes("WebSocket closed without opened")) errors.push(error.message);
  });
  return errors;
}

test.describe.serial("UX/UI regression sweep", () => {
  test("new shipments get workflow steps and numeric progress immediately", async ({ page }) => {
    await loginViaUi(page);
    await page.goto("/shipments");
    await page.getByTestId("open-shipment-dialog").click();

    const trackingNumber = `UX-${Date.now()}`;
    await page.locator("#tracking").fill(trackingNumber);
    await page.locator("#container").fill(`CONT-${Date.now()}`);
    await page.locator("#customer").selectOption({ index: 1 });
    await page.locator("#origin").fill("Tehran");
    await page.locator("#destination").fill("Bandar Abbas");
    await page.getByTestId("submit-shipment").click();

    await expect(page.getByRole("table").getByText(trackingNumber)).toBeVisible();
    await expect(page.getByText("NaN%")).toHaveCount(0);
    await page.locator("tr", { hasText: trackingNumber }).locator("button").first().click();
    await expect(page).toHaveURL(/\/shipments\/s/);
    await expect(page.getByText("NaN%")).toHaveCount(0);
    expect(await page.locator('[data-slot="progress"]').count()).toBeGreaterThan(0);
    await expect(page.locator("body")).toContainText("%");
  });

  test("legacy missing-organization shipment can generate customer tracking access", async () => {
    const id = `legacy-${Date.now()}`;
    await seedLegacyShipmentWithoutSteps(id);
    const api = await loginApi();
    try {
      const generated = await readOk<any>(await api.post(`/api/shipments/${id}/customer-access/generate`));
      expect(generated.url).toContain("/track/");
      const tracking = await readOk<any>(await api.get(new URL(generated.url).pathname.replace(/^\/track\//, "/api/public/track/")));
      expectPublicTrackingPayloadIsSafe(tracking);
    } finally {
      await api.dispose();
    }

    const client = await dbClient();
    try {
      const orgId = await ownerOrganizationId();
      const result = await client.query("SELECT organization_id FROM shipments WHERE id = $1", [id]);
      expect([orgId, null]).toContain(result.rows[0]?.organization_id || null);
    } finally {
      await client.end();
    }
  });

  test("pre-existing shipments without steps do not render NaN progress", async ({ page }) => {
    const id = `nosteps-${Date.now()}`;
    await seedLegacyShipmentWithoutSteps(id);
    await loginViaUi(page);
    await page.goto(`/shipments/${id}`);
    await expect(page.getByRole("heading", { name: id.toUpperCase() })).toBeVisible();
    await expect(page.getByText("NaN%")).toHaveCount(0);
    expect(await page.locator('[data-slot="progress"]').count()).toBeGreaterThan(0);
  });

  test("dashboard setup checklist disappears after customer tracking is enabled", async ({ page }) => {
    const client = await dbClient();
    try {
      await client.query(
        `UPDATE shipments
         SET customer_access_enabled = TRUE,
             updated_at = NOW()
         WHERE owner_user_id = 'u1' OR organization_id = $1`,
        [await ownerOrganizationId()]
      );
    } finally {
      await client.end();
    }

    await loginViaUi(page);
    await page.goto("/dashboard");
    await expect(page.locator('[data-empty-state="setup-checklist"]')).toHaveCount(0);
  });

  test("calendar popover stays inside the viewport on mobile dialogs", async ({ page }) => {
    await loginViaUi(page);
    await page.setViewportSize({ width: 390, height: 700 });
    await page.goto("/shipments");
    await page.getByTestId("open-shipment-dialog").click();
    await page.getByTestId("shamsi-date-time-trigger").click();
    const box = await page.getByTestId("shamsi-date-time-panel").boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    expect(box!.y + box!.height).toBeLessThanOrEqual(700);
    await expectNoHorizontalOverflow(page);
  });

  test("desktop sidebar and mobile nav sheet can scroll on short screens", async ({ page }) => {
    await loginViaUi(page);
    await page.setViewportSize({ width: 1280, height: 420 });
    await page.goto("/dashboard");
    const desktopScrollable = await page.evaluate(() => {
      const viewport = document.querySelector('[data-slot="scroll-area-viewport"]');
      return Boolean(viewport && viewport.scrollHeight > viewport.clientHeight && getComputedStyle(viewport).overflowY !== "hidden");
    });
    expect(desktopScrollable).toBe(true);

    await page.setViewportSize({ width: 390, height: 520 });
    await page.getByTestId("mobile-nav-trigger").click();
    const mobileScrollable = await page.evaluate(() => {
      const viewports = [...document.querySelectorAll('[data-slot="scroll-area-viewport"]')];
      return viewports.some((viewport) => viewport.scrollHeight > viewport.clientHeight && getComputedStyle(viewport).overflowY !== "hidden");
    });
    expect(mobileScrollable).toBe(true);
  });

  test("core public and protected routes have no obvious desktop/mobile UI breakage", async ({ browser }) => {
    const publicRoutes = ["/", "/pricing", "/signup", "/contact", "/login", "/track/search"];
    const protectedRoutes = ["/dashboard", "/shipments", "/customers", "/tasks", "/documents", "/cheques", "/commercial-cards", "/compliance-meetings", "/quotations", "/archive", "/management"];
    const viewports = [
      { width: 1280, height: 800 },
      { width: 390, height: 844 },
    ];

    for (const viewport of viewports) {
      const context = await browser.newContext({ baseURL: BASE_URL, viewport });
      const page = await context.newPage();
      const errors = await collectConsoleErrors(page);

      for (const route of publicRoutes) {
        await page.goto(route, { waitUntil: "domcontentloaded" });
        await expect(page.locator("body")).not.toBeEmpty();
        await expectNoHorizontalOverflow(page);
      }

      await loginViaUi(page);
      await page.waitForLoadState("networkidle").catch(() => null);
      for (const route of protectedRoutes) {
        await page.goto(route, { waitUntil: "domcontentloaded" });
        await expect(page.locator("body")).not.toBeEmpty();
        await expectNoHorizontalOverflow(page);
      }

      expect(errors).toEqual([]);
      await context.close();
    }
  });

  test("legacy compliance and quotation routes redirect to canonical paths", async ({ page }) => {
    await loginViaUi(page);

    await page.goto("/compliance");
    await expect(page).toHaveURL(/\/compliance-meetings$/);
    await expect(page.locator("body")).not.toBeEmpty();

    await page.goto("/quotage");
    await expect(page).toHaveURL(/\/quotations$/);
    await expect(page.locator("body")).not.toBeEmpty();
  });
});
