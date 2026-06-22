import { expect, test, type Page } from "@playwright/test";
import pg from "pg";
import { BASE_URL, disposeContexts, expectPublicTrackingPayloadIsSafe, loginApi, loginViaUi, nextValidShipmentCode, readOk, uniqueEmail, USER_PASSWORD } from "./helpers";

const { Client } = pg;
const testDatabaseUrl = process.env.TEST_DATABASE_URL || "postgres://postgres@localhost:5432/logisticplus_test";

async function dbClient() {
  const client = new Client({ connectionString: testDatabaseUrl });
  await client.connect();
  return client;
}

async function createCompanyUser(role: string, prefix: string) {
  const owner = await loginApi();
  const email = uniqueEmail(prefix);
  try {
    await readOk(
      await owner.post("/api/users", {
        data: {
          name: `E2E ${role} User`,
          email,
          password: USER_PASSWORD,
          role,
        },
      })
    );
    return email;
  } finally {
    await disposeContexts(owner);
  }
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

function validManualShipmentCode(sequence = (Date.now() % 899) + 100) {
  const parts = new Intl.DateTimeFormat("en-US-u-ca-persian", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const valueByType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const year = String(valueByType.year || "").padStart(4, "0");
  const month = String(valueByType.month || "").padStart(2, "0");
  const day = String(valueByType.day || "").padStart(2, "0");
  return `${year}${month}${day}${String(sequence).padStart(3, "0")}`;
}

async function seedLegacyShipmentWithoutSteps(id: string, options: { organizationId?: string | null } = {}) {
  const client = await dbClient();
  const shipment = {
    id,
    trackingNumber: id.toUpperCase(),
    containerNumber: `${id.toUpperCase()}-CONT`,
    customerId: "c1",
    customerName: "Legacy Customer",
    origin: "Tehran",
    destination: "Bandar Abbas",
    status: "LOADING",
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
       VALUES ($1, $8, 'u1', $2, 'c1', $3, 'LOADING', $4, $5, $6, $6, $7::jsonb, 'u1', NOW())`,
      [
        shipment.id,
        shipment.trackingNumber,
        shipment.customerName,
        shipment.origin,
        shipment.destination,
        shipment.estimatedDelivery,
        JSON.stringify(shipment),
        options.organizationId || null,
      ]
    );
    await client.query(
      `INSERT INTO user_records (owner_user_id, organization_id, collection, item_id, data, updated_at)
       VALUES ('u1', $3, 'shipments', $1, $2::jsonb, NOW())`,
      [id, JSON.stringify(shipment), options.organizationId || null]
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
      errors.push(`${new URL(page.url()).pathname}: ${text}`);
    }
  });
  page.on("pageerror", (error) => {
    if (!error.message.includes("WebSocket closed without opened")) errors.push(`${new URL(page.url()).pathname}: ${error.message}`);
  });
  return errors;
}

async function createShipmentFromV2(page: Page) {
  const marker = `UXV2${Date.now()}`;
  const customer = await readOk<any>(
    await page.request.post("/api/customers", {
      data: {
        name: `${marker} Customer`,
        company: `${marker} Company`,
        email: `${marker.toLowerCase()}@example.test`,
        phone: "09120000000",
      },
    })
  );
  const customerIdentifier = customer.customerCode || customer.code || customer.id;

  await page.goto("/shipments/new-v2");
  await expect(page.getByTestId("shipment-v2-create-page")).toBeVisible();
  await expect(page.locator("#container")).toHaveCount(0);
  await expect(page.getByTestId("shamsi-date-time-trigger")).toHaveCount(0);

  await page.getByTestId("shipment-v2-flow-IMPORT_LANJ").click();
  await page.getByTestId("shipment-v2-customer").fill(customerIdentifier);
  await expect(page.getByTestId("shipment-v2-customer-suggestions")).toBeVisible();
  await page.getByTestId("shipment-v2-customer-suggestion-0").click();
  await expect(page.getByTestId("shipment-v2-code-mode-new")).toBeVisible();
  await page.getByTestId("shipment-v2-origin").fill("Dubai");
  await page.getByTestId("shipment-v2-discharge-port").fill("Bandar Abbas");
  await page.getByTestId("shipment-v2-delivery-port").fill("Tehran");
  await page.getByTestId("shipment-v2-lenj-type").selectOption("MALVANI");
  await page.getByTestId("shipment-v2-submit").click();
}

test.describe.serial("UX/UI regression sweep", () => {
  test("new V2 shipments open clean detail without numeric progress regressions", async ({ page }) => {
    await loginViaUi(page);
    await page.goto("/shipments");

    await expect(page.getByTestId("open-shipment-dialog")).toHaveCount(0);
    await createShipmentFromV2(page);

    await expect(page).toHaveURL(/\/shipments\/(?!new-v2$)[^/]+$/);
    await expect(page.getByTestId("shipment-v2-detail-page")).toBeVisible();
    await expect(page.getByTestId("shipment-v2-header-shipment-id")).toHaveText(/^\d{11}$/);
    await expect(page.getByText("NaN%")).toHaveCount(0);
  });

  test("shipment detail loads records created after the page list was hydrated", async ({ page }) => {
    await loginViaUi(page);

    const api = await loginApi();
    const trackingNumber = validManualShipmentCode();
    try {
      const shipment = await readOk<any>(
        await api.post("/api/shipments", {
          data: {
            trackingNumber,
            containerNumber: `CONT-${Date.now()}`,
            customerId: "c1",
            customerName: "Stale Hydration Customer",
            origin: "Tehran",
            destination: "Bandar Abbas",
            status: "LOADING",
            estimatedDelivery: "1405/04/01 09:00",
            freeTimeDays: 7,
          },
        })
      );

      await page.goto(`/shipments/${shipment.id}`);
      await expect(page.getByTestId("shipment-v2-detail-page")).toBeVisible();
      await expect(page.locator("body")).toContainText(trackingNumber);
      await expect(page.getByText("Shipment was not found.")).toHaveCount(0);
    } finally {
      await api.dispose();
    }
  });

  test("manager can edit and delete shipments from the list", async ({ page }) => {
    const api = await loginApi();
    const managerEmail = await createCompanyUser("MANAGER", "e2e-manager-shipment");
    const trackingNumber = await nextValidShipmentCode();
    const customerMarker = `UXEDIT${Date.now()}`;
    const originalCustomer = await readOk<any>(
      await api.post("/api/customers", {
        data: {
          name: `${customerMarker} Original`,
          company: `${customerMarker} Original Co`,
          email: `${customerMarker.toLowerCase()}-original@example.test`,
          phone: "09120000000",
        },
      })
    );
    const correctedCustomer = await readOk<any>(
      await api.post("/api/customers", {
        data: {
          name: `${customerMarker} Corrected`,
          company: `${customerMarker} Corrected Co`,
          email: `${customerMarker.toLowerCase()}-corrected@example.test`,
          phone: "09120000001",
        },
      })
    );
    const shipment = await readOk<any>(
      await api.post("/api/shipments", {
        data: {
          trackingNumber,
          customerId: originalCustomer.id,
          customerName: originalCustomer.company,
          origin: "Edit origin before",
          destination: "Edit destination before",
          status: "LOADING",
        },
      })
    );
    const nextTrackingNumber = await nextValidShipmentCode();
    try {
      await loginViaUi(page, managerEmail, USER_PASSWORD);
      await page.goto("/shipments");
      const shipmentRow = page.locator("tbody tr", { hasText: trackingNumber });
      await expect(shipmentRow).toBeVisible();
      await shipmentRow.getByRole("button").last().click();
      await page.getByRole("menuitem").first().click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await expect(page.getByTestId("shipment-edit-tracking-number-input")).toHaveValue(trackingNumber);
      await expect(page.getByTestId("shipment-edit-customer-select")).toHaveValue(originalCustomer.id);
      await expect(page.getByTestId("shipment-edit-origin-input")).toBeVisible();
      await expect(page.getByTestId("shipment-edit-destination-input")).toBeVisible();
      await expect(page.getByTestId("shipment-edit-discharge-port-input")).toBeVisible();
      await expect(page.getByText("شماره کانتینر")).toHaveCount(0);
      await expect(page.getByText("وضعیت فعلی")).toHaveCount(0);
      await expect(page.getByText("نوع محموله")).toHaveCount(0);

      await page.getByTestId("shipment-edit-customer-select").selectOption(correctedCustomer.id);
      await page.getByTestId("shipment-edit-tracking-number-input").fill(nextTrackingNumber);
      await page.getByTestId("shipment-edit-origin-input").fill("Edit origin after");
      await page.getByTestId("shipment-edit-destination-input").fill("Edit destination after");
      await page.getByTestId("shipment-edit-discharge-port-input").fill("Edit discharge after");
      const saveResponse = page.waitForResponse((response) => (
        response.url().includes(`/api/shipments/${shipment.id}/operational-fields`) &&
        response.request().method() === "PATCH"
      ));
      await page.getByTestId("shipment-edit-save").click();
      expect((await saveResponse).status()).toBeLessThan(400);
      await expect(page).toHaveURL(new RegExp(`/shipments/${shipment.id}$`));

      const updated = await readOk<any>(await api.get(`/api/shipments/${shipment.id}`));
      expect(updated.trackingNumber).toBe(nextTrackingNumber);
      expect(updated.origin).toBe("Edit origin after");
      expect(updated.destination).toBe("Edit destination after");
      expect(updated.dischargePort).toBe("Edit discharge after");
      expect(updated.customerId).toBe(correctedCustomer.id);
      expect(updated.customerCode).toBe(correctedCustomer.customerCode);

      await page.goto("/shipments");
      const updatedShipmentRow = page.locator("tbody tr", { hasText: nextTrackingNumber });
      await expect(updatedShipmentRow).toBeVisible();
      await updatedShipmentRow.getByRole("button").last().click();
      await page.getByRole("menuitem").nth(1).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.getByRole("dialog").getByRole("button").first().click();
      await expect(updatedShipmentRow).toHaveCount(0);
    } finally {
      const client = await dbClient();
      try {
        await client.query("DELETE FROM archive_records WHERE entity_type = 'shipment' AND entity_id = $1", [shipment.id]);
        await client.query("DELETE FROM shipments WHERE id = $1", [shipment.id]);
        await client.query("DELETE FROM customers WHERE id = ANY($1::text[])", [[originalCustomer.id, correctedCustomer.id]]);
      } finally {
        await client.end();
        await api.dispose();
      }
    }
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
    await seedLegacyShipmentWithoutSteps(id, { organizationId: await ownerOrganizationId() });
    await loginViaUi(page);
    await page.goto(`/shipments/${id}`);
    await expect(page.getByTestId("shipment-v2-detail-page")).toBeVisible();
    await expect(page.locator("body")).toContainText(id.toUpperCase());
    await expect(page.getByText("NaN%")).toHaveCount(0);
    await expect(page.getByTestId("shipment-v2-route-progress")).toBeVisible();
  });

  test("customer tracking renders safe portal timeline, route, and documents without the removed support CTA", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.route("**/api/public/track/customer-portal-token", async (route) => {
      await route.fulfill({
        json: {
          ok: true,
          data: {
            shipment: {
              code: "PUBLIC-PORTAL-TRACK",
              publicStatusLabel: "Shipment is in transit",
              publicStatusDescription: "Your shipment is being handled by our operations team.",
              origin: "Bushehr",
              destination: "Shiraz",
              estimatedDelivery: "1405/11/15",
              lastPublicUpdate: "2026-06-02T12:39:47.911Z",
              currentPublicPhase: "LEGACY_PUBLIC_PHASE_SENTINEL",
              currentPublicLabel: "LEGACY_PUBLIC_LABEL_SENTINEL",
              completedPublicStepsCount: 1,
              totalPublicStepsCount: 3,
              publicNote: "LEGACY_PUBLIC_NOTE_SENTINEL",
            },
            steps: [
              {
                id: "legacy-step-1",
                label: "LEGACY_PUBLIC_STEP_SENTINEL",
                status: "IN_PROGRESS",
                order: 1,
                completedAt: null,
              },
            ],
            documents: [
              {
                id: "public-doc-1",
                title: "Customer-safe tracking document",
                fileName: "safe-document.pdf",
                fileSize: "1 MB",
                createdAt: "2026-06-02T12:39:47.911Z",
                downloadUrl: "/api/public/documents/public-doc-1?shipmentCode=PUBLIC-PORTAL-TRACK&expires=9999999999999&signature=safe",
              },
            ],
            company: {
              name: "Logistic Plus",
              contactText: "پشتیبانی Logistic Plus 021-12345678",
            },
          },
        },
      });
    });

    await page.goto("/track/customer-portal-token");
    await expect(page.getByRole("heading", { name: "PUBLIC-PORTAL-TRACK" })).toBeVisible();
    await expect(page.getByRole("link", { name: "جستجوی محموله" })).toHaveCount(0);
    await expect(page.getByTestId("public-progress-timeline")).toBeVisible();
    await expect(page.getByTestId("public-stage-transit")).toBeVisible();
    await expect(page.getByTestId("public-next-step-card")).toBeVisible();
    await expect(page.getByTestId("public-route-origin")).toContainText("Bushehr");
    await expect(page.getByTestId("public-route-destination")).toContainText("Shiraz");
    await expect(page.getByTestId("public-route-text")).toContainText("Bushehr");
    await expect(page.getByTestId("public-eta")).toContainText("1405/11/15");
    await expect(page.getByTestId("public-documents-section")).toContainText("Customer-safe tracking document");
    await expect(page.getByLabel("Download Customer-safe tracking document")).toHaveAttribute("href", /\/api\/public\/documents\/public-doc-1/);
    await expect(page.getByTestId("public-support-cta")).toHaveCount(0);
    await expect(page.locator('a[href^="tel:"]')).toHaveCount(0);
    await expect(page.getByText("021-12345678")).toHaveCount(0);
    await expect(page.getByText("LEGACY_PUBLIC_PHASE_SENTINEL")).toHaveCount(0);
    await expect(page.getByText("LEGACY_PUBLIC_LABEL_SENTINEL")).toHaveCount(0);
    await expect(page.getByText("LEGACY_PUBLIC_NOTE_SENTINEL")).toHaveCount(0);
    await expect(page.getByText("LEGACY_PUBLIC_STEP_SENTINEL")).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
  });

  test("customer tracking shows safe empty ETA and document states", async ({ page }) => {
    await page.route("**/api/public/track/customer-empty-token", async (route) => {
      await route.fulfill({
        json: {
          ok: true,
          data: {
            shipment: {
              code: "PUBLIC-EMPTY-TRACK",
              publicStatusLabel: "Shipment is being prepared",
              publicStatusDescription: "Documents are under review and the operations team will publish the next safe update soon.",
              origin: "",
              destination: "",
              estimatedDelivery: "",
              lastPublicUpdate: "",
              currentPublicPhase: "",
              currentPublicLabel: "",
              completedPublicStepsCount: 0,
              totalPublicStepsCount: 0,
              publicNote: "",
            },
            steps: [],
            documents: [],
            company: {
              name: "Logistic Plus",
              contactText: "",
            },
          },
        },
      });
    });

    await page.goto("/track/customer-empty-token");
    await expect(page.getByRole("heading", { name: "PUBLIC-EMPTY-TRACK" })).toBeVisible();
    await expect(page.getByTestId("public-route-origin")).toContainText("مبدأ ثبت نشده");
    await expect(page.getByTestId("public-route-destination")).toContainText("مقصد ثبت نشده");
    await expect(page.getByTestId("public-eta")).toContainText("زمان تقریبی تحویل هنوز ثبت نشده است");
    await expect(page.getByTestId("public-documents-empty")).toBeVisible();
    await expect(page.getByTestId("public-support-cta")).toHaveCount(0);
  });

  test("legacy shipment detail route redirects to canonical detail page", async ({ page }) => {
    await loginViaUi(page);
    await page.goto("/shipments/s1/legacy");
    await expect(page).toHaveURL(/\/shipments\/s1$/);
    await expect(page.getByTestId("shipment-v2-detail-page")).toBeVisible();
    await expect(page.locator("body")).toContainText("LS-9801");

    await expect(page.getByText("پیشرفت لجستیک")).toHaveCount(0);
    await expect(page.getByText("درصد تکمیل فرآیند")).toHaveCount(0);
    await expect(page.getByText("اطلاعات تکمیلی بار")).toHaveCount(0);
    await expect(page.getByText("40ft High Cube")).toHaveCount(0);
    await expect(page.getByText("8471.30.00")).toHaveCount(0);

    await expect(page.locator('[data-testid="workflow-start"], [data-testid="workflow-expand-all"]').first()).toHaveCount(0);
    await expect(page.getByTestId("shipment-daily-status-panel")).toHaveCount(0);
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

  test("shipment V2 creation stays inside the viewport on mobile", async ({ page }) => {
    await loginViaUi(page);
    await page.setViewportSize({ width: 390, height: 700 });
    await page.goto("/shipments");
    await expect(page.getByTestId("open-shipment-dialog")).toHaveCount(0);
    await page.getByTestId("open-shipment-v2-create").click();
    await expect(page).toHaveURL(/\/shipments\/new-v2$/);
    await expect(page.getByTestId("shipment-v2-create-page")).toBeVisible();
    await expect(page.getByTestId("shamsi-date-time-trigger")).toHaveCount(0);
    const box = await page.getByTestId("shipment-v2-create-page").boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    await expectNoHorizontalOverflow(page);
  });

  test("desktop sidebar and mobile nav sheet can scroll on short screens", async ({ page }) => {
    await loginViaUi(page);
    await page.setViewportSize({ width: 1280, height: 420 });
    await page.goto("/dashboard");
    await expect(page.locator('a[href="/shipments"]').first()).toBeVisible();
    const desktopScrollable = await page.evaluate(() => {
      const viewports = [...document.querySelectorAll('[data-slot="scroll-area-viewport"]')];
      return viewports.some((viewport) => {
        const box = viewport.getBoundingClientRect();
        return box.width > 0 && box.height > 0 && viewport.scrollHeight > viewport.clientHeight && getComputedStyle(viewport).overflowY !== "hidden";
      });
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
    const publicRoutes = ["/", "/signup", "/contact", "/login"];
    const protectedRoutes = ["/dashboard", "/daily-status", "/shipments", "/customers", "/tasks", "/documents", "/cheques", "/commercial-cards", "/compliance-meetings", "/archive", "/management"];
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

  test("legacy compliance route redirects and quotation UI routes stay disabled", async ({ page }) => {
    await loginViaUi(page);

    await page.goto("/compliance");
    await expect(page).toHaveURL(/\/compliance-meetings$/);
    await expect(page.locator("body")).not.toBeEmpty();

    await page.goto("/quotage");
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByTestId("open-quotation-dialog")).toHaveCount(0);

    await page.goto("/quotations");
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.locator('a[href="/quotations"]')).toHaveCount(0);
    await expect(page.getByTestId("open-quotation-dialog")).toHaveCount(0);
  });

  test("quotation backend stays available but bootstrap and UI omit quotation data", async ({ page }) => {
    const api = await loginApi();
    const suffix = Date.now();
    const customerName = `E2E Disabled Quote ${suffix}`;
    try {
      const quotation = await readOk<any>(
        await api.post("/api/quotations", {
          data: {
            customerName,
            customerPhone: "09120000000",
            originCity: "Tehran",
            destinationCity: "Shiraz",
            cargoType: "GENERAL",
            weight: 2,
            dimensions: "1x1x1",
            requirements: [],
            baseRate: 1000000,
            fuelSurcharge: 100000,
            loadingFees: 50000,
            tollFees: 25000,
            insurancePercentage: 1,
            profitMargin: 10,
            totalPrice: 1292500,
            validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            status: "PENDING",
          },
        })
      );
      const quotations = await readOk<any[]>(await api.get("/api/quotations?includeArchived=true"));
      expect(quotations.some((item) => item.id === quotation.id)).toBe(true);

      const auth = await readOk<any>(await api.get("/api/auth/me"));
      const bootstrapResponse = await api.get(`/api/users/${encodeURIComponent(auth.user.id)}/bootstrap`);
      expect(bootstrapResponse.status(), await bootstrapResponse.text()).toBeLessThan(400);
      const bootstrap = await bootstrapResponse.json();
      expect(bootstrap.records?.quotes || []).toEqual([]);
    } finally {
      await api.dispose();
    }

    await loginViaUi(page);
    await page.goto("/quotations");
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.locator('a[href="/quotations"]')).toHaveCount(0);
    await expect(page.getByText(customerName)).toHaveCount(0);
  });
});
