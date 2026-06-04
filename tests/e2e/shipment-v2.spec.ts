import { expect, test } from "@playwright/test";
import {
  USER_PASSWORD,
  disposeContexts,
  expectUnavailable,
  loginApi,
  loginViaUi,
  readOk,
  uniqueEmail,
} from "./helpers";

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

async function createTenantOwner(owner: Awaited<ReturnType<typeof loginApi>>) {
  const tenantEmail = uniqueEmail("shipment-v2-tenant");
  await readOk<any>(
    await owner.post("/api/admin/organizations/manual-signup", {
      data: {
        companyName: `Shipment V2 Tenant ${Date.now()}`,
        ownerName: "Shipment V2 Tenant Owner",
        ownerEmail: tenantEmail,
        password: USER_PASSWORD,
        planId: "starter",
        billingCycle: "monthly",
        contactPhone: "09120000000",
      },
    })
  );
  return { tenantEmail };
}

async function expectNoHorizontalPageOverflow(page: any) {
  const overflow = await page.evaluate(() => ({
    body: document.body.scrollWidth - document.body.clientWidth,
    document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  expect(overflow.body).toBeLessThanOrEqual(1);
  expect(overflow.document).toBeLessThanOrEqual(1);
}

test.describe.serial("shipment module v2", () => {
  test("creates a clean Import Lanj shipment through V2 UI and edits notes", async ({ page }) => {
    await loginViaUi(page);
    const marker = `ShipmentV2Ui${Date.now()}`;
    const customer = await readOk<any>(
      await page.request.post("/api/customers", {
        data: {
          name: `${marker} Customer`,
          company: `${marker} Company`,
          email: `${marker.toLowerCase()}@example.test`,
          phone: "09120000000",
          address: `${marker} Address`,
        },
      })
    );

    await page.goto("/shipments/new-v2");
    await expect(page.getByTestId("shipment-v2-create-page")).toBeVisible();
    await page.getByTestId("shipment-v2-flow-IMPORT_LANJ").click();
    await page.getByTestId("shipment-v2-customer").selectOption(customer.id);
    await page.getByTestId("shipment-v2-tracking").fill(`V2-LANJ-${Date.now()}`);
    await page.getByTestId("shipment-v2-title").fill("پرونده تست لنج V2");
    await page.getByTestId("shipment-v2-origin").fill("Dubai");
    await page.getByTestId("shipment-v2-discharge-port").fill("Bandar Abbas");
    await page.getByTestId("shipment-v2-delivery-port").fill("Tehran");
    await page.getByTestId("shipment-v2-lenj-type").selectOption("MALVANI");
    await page.getByTestId("shipment-v2-submit").click();

    await page.waitForURL(/\/shipments\/[^/]+\/v2$/);
    await expect(page.getByTestId("shipment-v2-detail-page")).toBeVisible();
    await expect(page.getByRole("heading", { name: "پرونده تست لنج V2" })).toBeVisible();

    const sectionOrder = await page.locator('[data-testid^="shipment-v2-section-"]').evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("data-testid"))
    );
    expect(sectionOrder).toEqual([
      "shipment-v2-section-base",
      "shipment-v2-section-orderRegistration",
      "shipment-v2-section-goods",
      "shipment-v2-section-declarationKootaj",
      "shipment-v2-section-permits",
      "shipment-v2-section-payments",
      "shipment-v2-section-banking",
      "shipment-v2-section-notes",
    ]);

    await expect(page.getByTestId("shipment-import-details-panel")).toHaveCount(0);
    await expect(page.getByTestId("shipment-v2-section-declarationKootaj")).toContainText("هنوز فیلدی");

    await page.getByTestId("shipment-v2-notes-edit").click();
    await page.getByTestId("shipment-v2-notes-input").fill("یادداشت داخلی V2 برای تست");
    await page.getByTestId("shipment-v2-notes-save").click();
    await expect(page.getByTestId("shipment-v2-section-notes")).toContainText("یادداشت داخلی V2 برای تست");
    await expectNoHorizontalPageOverflow(page);
  });

  test("creates Import Ship by API and scopes V2 profiles to the authenticated tenant", async () => {
    const owner = await loginApi();
    const contexts = [owner];
    try {
      const marker = `ShipmentV2Api${Date.now()}`;
      const customer = await createCustomer(owner, marker);
      const created = await readOk<any>(
        await owner.post("/api/shipments/v2", {
          data: {
            flowCode: "IMPORT_SHIP",
            trackingNumber: `V2-SHIP-${Date.now()}`,
            customerId: customer.id,
            shipmentTitle: "API Import Ship V2",
            origin: "Jebel Ali",
            dischargePort: "Bandar Abbas",
            deliveryPort: "Shiraz",
            consigneeName: "Consignee V2",
          },
        })
      );
      expect(created.profile.flowCode).toBe("IMPORT_SHIP");
      expect(created.profile.sections.base.shipmentTitle).toBe("API Import Ship V2");
      expect(created.profile.sections.declarationKootaj).toEqual({});

      const updated = await readOk<any>(
        await owner.patch(`/api/shipments/${encodeURIComponent(created.shipment.id)}/v2-profile/sections/base`, {
          data: {
            ...created.profile.sections.base,
            deliveryPort: "Isfahan",
          },
        })
      );
      expect(updated.profile.sections.base.deliveryPort).toBe("Isfahan");
      expect(updated.shipment.destination).toBe("Isfahan");

      const tenantInfo = await createTenantOwner(owner);
      const tenant = await loginApi(tenantInfo.tenantEmail, USER_PASSWORD);
      contexts.push(tenant);
      await expectUnavailable(await tenant.get(`/api/shipments/${encodeURIComponent(created.shipment.id)}/v2-profile`));
      await expectUnavailable(
        await tenant.patch(`/api/shipments/${encodeURIComponent(created.shipment.id)}/v2-profile/sections/notes`, {
          data: { internalNote: "cross tenant note" },
        })
      );
    } finally {
      await disposeContexts(...contexts);
    }
  });
});
