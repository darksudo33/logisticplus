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

function persianNumber(value: number) {
  return value.toLocaleString("fa-IR", { maximumFractionDigits: 6 });
}

function fieldDisplayValue(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .pop() || "";
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
    const customerIdentifier = customer.customerCode || customer.code || customer.id;
    const malvaniName = `${marker} Malvani`;
    const malvaniProfile = await readOk<any>(
      await page.request.post("/api/malvani-profiles", {
        data: {
          displayName: malvaniName,
          captainName: `${marker} Captain`,
          lenjName: `${marker} Lenj`,
          lenjRegistrationNumber: `LENJ-${Date.now()}`,
          lenjType: "لنج باری",
          homePort: "بندر دیلم",
          activeStatus: "ACTIVE",
          note: "Linked from Shipment V2 base section",
        },
      })
    );
    expect(malvaniProfile.id).toBeTruthy();
    const malvaniContactName = `${marker} Contact`;
    const malvaniContactPhone = "09129876543";
    await readOk<any>(
      await page.request.post("/api/business-entity-contacts", {
        data: {
          entityType: "malvani",
          entityId: malvaniProfile.id,
          contactName: malvaniContactName,
          roleTitle: "Captain contact",
          phoneNumber: malvaniContactPhone,
          phoneLabel: "Primary",
          note: "Shipment V2 linked contact",
          isPrimary: true,
          sortOrder: 1,
        },
      })
    );

    await page.goto("/shipments/new-v2");
    await expect(page.getByTestId("shipment-v2-create-page")).toBeVisible();
    await page.getByTestId("shipment-v2-flow-IMPORT_LANJ").click();
    await page.getByTestId("shipment-v2-customer").fill(customerIdentifier);
    await expect(page.getByTestId("shipment-v2-customer-suggestions")).toBeVisible();
    await page.getByTestId("shipment-v2-customer-suggestion-0").click();
    await expect(page.getByTestId("shipment-v2-code-mode-new")).toBeVisible();
    await expect(page.getByText("کد محموله به صورت خودکار ساخته می‌شود")).toBeVisible();
    await page.getByTestId("shipment-v2-origin").fill("Dubai");
    await page.getByTestId("shipment-v2-discharge-port").fill("Bandar Abbas");
    await page.getByTestId("shipment-v2-delivery-port").fill("Tehran");
    await page.getByTestId("shipment-v2-lenj-type").selectOption("MALVANI");
    await expect(page.getByTestId("shipment-v2-create-goods-section")).toBeVisible();
    await page.getByTestId("shipment-v2-create-goods-row-0-description").fill("Initial goods from create");
    await page.getByTestId("shipment-v2-create-goods-row-0-packaging").fill("Carton");
    await page.getByTestId("shipment-v2-create-goods-row-0-quantity").fill("7.5");
    await page.getByTestId("shipment-v2-create-goods-row-0-weight").fill("120.25");
    await page.getByTestId("shipment-v2-create-goods-row-0-cbm").fill("1.5");
    await page.getByTestId("shipment-v2-create-goods-row-0-pcs").fill("3.5");
    await expect(page.getByTestId("shipment-v2-create-goods-total-quantity")).toContainText(persianNumber(7.5));
    await expect(page.getByTestId("shipment-v2-create-goods-total-weight")).toContainText(persianNumber(120.25));
    await expect(page.getByTestId("shipment-v2-create-goods-total-cbm")).toContainText(persianNumber(1.5));
    await expect(page.getByTestId("shipment-v2-create-goods-total-pcs")).toContainText(persianNumber(3.5));
    await page.getByTestId("shipment-v2-submit").click();

    await page.waitForURL(/\/shipments\/(?!new-v2$)[^/]+$/);
    const shipmentId = new URL(page.url()).pathname.split("/")[2];
    expect(shipmentId).toBeTruthy();
    await expect(page.getByTestId("shipment-v2-detail-page")).toBeVisible();
    await expect.poll(async () => page.evaluate(() => {
      const main = document.querySelector(".app-main") as HTMLElement | null;
      return Math.round(main?.scrollTop || 0);
    })).toBeLessThanOrEqual(2);
    await expect(page.getByTestId("shipment-v2-header-shipment-id")).toHaveText(/^\d{11}$/);
    const generatedShipmentCode = (await page.getByTestId("shipment-v2-header-shipment-id").innerText()).trim();
    await expect(page.getByTestId("shipment-v2-header-customer")).toContainText(customerIdentifier);
    await expect(page.getByTestId("shipment-v2-route-step-origin")).toContainText("Dubai");
    await expect(page.getByTestId("shipment-v2-route-step-dischargePort")).toContainText("Bandar Abbas");
    await expect(page.getByTestId("shipment-v2-route-step-deliveryPort")).toContainText("Tehran");
    await expect(page.getByTestId("shipment-v2-route-progress")).toBeVisible();
    await expect(page.getByText("عنوان محموله")).toHaveCount(0);
    await expect(page.getByTestId("shipment-v2-base-code")).toContainText(generatedShipmentCode);
    await expect(page.getByTestId("shipment-v2-base-customer")).toContainText(customerIdentifier);
    await expect(page.getByTestId("shipment-v2-base-document-count")).toBeVisible();
    await expect(page.getByTestId("shipment-v2-base-total-quantity")).toContainText(persianNumber(7.5));
    await expect(page.getByTestId("shipment-v2-base-total-container-count")).toHaveCount(0);
    await expect(page.getByTestId("shipment-v2-base-last-update")).toContainText("توسط");

    const sectionOrder = await page.locator('[data-testid^="shipment-v2-section-"]').evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("data-testid"))
    );
    expect(sectionOrder).toEqual([
      "shipment-v2-section-notes",
      "shipment-v2-section-base",
      "shipment-v2-section-goods",
      "shipment-v2-section-declarationKootaj",
      "shipment-v2-section-permits",
      "shipment-v2-section-payments",
      "shipment-v2-section-banking",
    ]);
    await expect(page.getByTestId("shipment-v2-section-orderRegistration")).toHaveCount(0);

    await expect(page.getByTestId("shipment-import-details-panel")).toHaveCount(0);
    await expect(page.getByTestId("shipment-v2-section-goods")).toContainText("Initial goods from create");
    await expect(page.getByTestId("shipment-v2-section-goods")).toContainText("Carton");
    await expect(page.getByTestId("shipment-v2-section-goods")).not.toContainText("کانتینر ۲۰ فوت");
    await expect(page.getByTestId("shipment-v2-section-goods")).not.toContainText("کانتینر ۴۰ فوت");
    await expect(page.getByTestId("shipment-v2-section-declarationKootaj")).toContainText("شماره کوتاژ");

    await page.getByTestId("shipment-v2-goods-edit").click();
    await expect(page.getByTestId("shipment-v2-section-goods")).not.toContainText("کانتینر ۲۰ فوت");
    await expect(page.getByTestId("shipment-v2-section-goods")).not.toContainText("کانتینر ۴۰ فوت");
    await page.getByTestId("shipment-v2-goods-row-0-description").fill("کالای تست V2");
    await page.getByTestId("shipment-v2-goods-row-0-packaging").fill("کارتن");
    await page.getByTestId("shipment-v2-goods-row-0-quantity").fill("12.5");
    await page.getByTestId("shipment-v2-goods-row-0-weight").fill("340.75");
    await page.getByTestId("shipment-v2-goods-row-0-cbm").fill("2.5");
    await page.getByTestId("shipment-v2-goods-row-0-pcs").fill("9.5");
    await page.getByTestId("shipment-v2-goods-add").click();
    await page.getByTestId("shipment-v2-goods-row-1-description").fill("Second V2 goods");
    await page.getByTestId("shipment-v2-goods-row-1-packaging").fill("Box");
    await page.getByTestId("shipment-v2-goods-row-1-quantity").fill("2.5");
    await page.getByTestId("shipment-v2-goods-row-1-weight").fill("9.25");
    await page.getByTestId("shipment-v2-goods-row-1-cbm").fill("1.5");
    await page.getByTestId("shipment-v2-goods-row-1-pcs").fill("1");
    await expect(page.getByTestId("shipment-v2-goods-total-quantity")).toContainText(persianNumber(15));
    await expect(page.getByTestId("shipment-v2-goods-total-weight")).toContainText(persianNumber(350));
    await expect(page.getByTestId("shipment-v2-goods-total-cbm")).toContainText(persianNumber(4));
    await expect(page.getByTestId("shipment-v2-goods-total-pcs")).toContainText(persianNumber(10.5));
    await page.getByTestId("shipment-v2-goods-save").click();
    await expect(page.getByTestId("shipment-v2-goods-total-quantity")).toContainText(persianNumber(15));
    await expect(page.getByTestId("shipment-v2-base-total-quantity")).toContainText(persianNumber(15));
    await expect(page.getByTestId("shipment-v2-goods-total-weight")).toContainText(persianNumber(350));
    await expect(page.getByTestId("shipment-v2-goods-total-cbm")).toContainText(persianNumber(4));
    await expect(page.getByTestId("shipment-v2-goods-total-pcs")).toContainText(persianNumber(10.5));
    await expect(page.getByTestId("shipment-v2-section-goods")).toContainText("Second V2 goods");
    await expect(page.getByTestId("shipment-v2-section-goods")).toContainText("کالای تست V2");
    await expect(page.getByTestId("shipment-v2-section-goods")).toContainText("بسته بندی");
    await expect(page.getByTestId("shipment-v2-section-goods")).toContainText("کارتن");

    await page.getByTestId("shipment-v2-declaration-edit").click();
    await page.getByTestId("shipment-v2-declaration-cotage-number").fill("123456");
    await page.getByTestId("shipment-v2-declaration-customs-route").selectOption("GREEN");
    await page.getByTestId("shipment-v2-declaration-cotage-date").getByTestId("shamsi-date-time-trigger").click();
    await page.getByTestId("shamsi-date-day").first().click();
    await page.getByTestId("shipment-v2-declaration-total-value").fill("125000");
    await page.getByTestId("shipment-v2-declaration-total-currency").selectOption("EUR");
    await page.getByTestId("shipment-v2-declaration-final-paid").fill("94000000");
    await page.getByTestId("shipment-v2-declaration-final-paid-currency").selectOption("AED");
    await page.getByTestId("shipment-v2-declaration-save").click();
    await expect(page.getByTestId("shipment-v2-section-declarationKootaj")).toContainText("123456");
    await expect(page.getByTestId("shipment-v2-section-declarationKootaj")).toContainText("سبز");
    await expect(page.getByTestId("shipment-v2-section-declarationKootaj")).toContainText("یورو");
    await expect(page.getByTestId("shipment-v2-section-declarationKootaj")).toContainText("۹۴٬۰۰۰٬۰۰۰");
    await expect(page.getByTestId("shipment-v2-section-declarationKootaj")).toContainText("درهم");

    await page.getByTestId("shipment-v2-permits-edit").click();
    await page.getByTestId("shipment-v2-permit-row-0-name").fill("بهدا");
    await expect(page.getByTestId("shipment-v2-permit-row-0-suggestions")).toBeVisible();
    const permitSuggestionCount = await page.getByTestId("shipment-v2-permit-row-0-suggestions").locator("button").count();
    expect(permitSuggestionCount).toBeGreaterThan(0);
    expect(permitSuggestionCount).toBeLessThanOrEqual(5);
    await page.getByTestId("shipment-v2-permit-row-0-suggestion-0").click();
    await page.getByTestId("shipment-v2-permit-row-0-state").fill("در حال پیگیری");
    await page.getByTestId("shipment-v2-permits-add").click();
    await page.getByTestId("shipment-v2-permit-row-1-name").fill("مجوز دستی تست");
    await page.getByTestId("shipment-v2-permit-row-1-state").fill("تایید شده");
    await page.getByTestId("shipment-v2-permits-save").click();
    await expect(page.getByTestId("shipment-v2-section-permits")).toContainText("بهداشت");
    await expect(page.getByTestId("shipment-v2-section-permits")).toContainText("در حال پیگیری");
    await expect(page.getByTestId("shipment-v2-section-permits")).toContainText("مجوز دستی تست");
    await expect(page.getByTestId("shipment-v2-section-permits")).toContainText("تایید شده");

    await page.getByTestId("shipment-v2-payments-edit").click();
    await page.getByTestId("shipment-v2-payments-customs-paid").check();
    await page.getByTestId("shipment-v2-payments-customs-amount").fill("8500000");
    await page.getByTestId("shipment-v2-payments-customs-amount-currency").selectOption("IRR");
    await page.getByTestId("shipment-v2-payments-customs-difference").fill("350000");
    await page.getByTestId("shipment-v2-payments-customs-difference-currency").selectOption("USD");
    await page.getByTestId("shipment-v2-payments-customs-difference-paid").check();
    await page.getByTestId("shipment-v2-payments-tax-status").selectOption("PAYABLE");
    await page.getByTestId("shipment-v2-payments-tax-amount").fill("1200000");
    await page.getByTestId("shipment-v2-payments-tax-currency").selectOption("IRR");
    await page.getByTestId("shipment-v2-payments-tax-paid").check();
    await page.getByTestId("shipment-v2-payments-save").click();
    await expect(page.getByTestId("shipment-v2-payments-customs-amount-value")).toContainText("پرداخت شده");
    await expect(page.getByTestId("shipment-v2-payments-customs-difference-value")).toContainText("پرداخت شده");
    await expect(page.getByTestId("shipment-v2-payments-tax-amount-value")).toContainText("پرداخت شده");
    await expect(page.getByTestId("shipment-v2-section-payments")).toContainText("۸٬۵۰۰٬۰۰۰");
    await expect(page.getByTestId("shipment-v2-section-payments")).toContainText("دلار");
    await expect(page.getByTestId("shipment-v2-section-payments")).toContainText("نیاز به پرداخت");
    await expect(page.getByTestId("shipment-v2-section-payments")).toContainText("۱٬۲۰۰٬۰۰۰");

    await page.getByTestId("shipment-v2-payments-edit").click();
    await page.getByTestId("shipment-v2-payments-tax-status").selectOption("GOOD_STANDING");
    await expect(page.getByTestId("shipment-v2-payments-tax-amount")).toHaveValue("—");
    await expect(page.getByTestId("shipment-v2-payments-tax-paid")).toBeDisabled();
    await page.getByTestId("shipment-v2-payments-save").click();
    await expect(page.getByTestId("shipment-v2-section-payments")).toContainText("خوش حسابی");
    await expect(page.getByTestId("shipment-v2-payments-tax-amount-value")).toContainText("—");
    await expect(page.getByTestId("shipment-v2-payments-tax-amount-value")).toContainText("بدون پرداخت");

    await page.getByTestId("shipment-v2-banking-edit").click();
    await page.getByTestId("shipment-v2-banking-bank-name").fill("بانک تست");
    await page.getByTestId("shipment-v2-banking-branch-code").fill("0123");
    await page.getByTestId("shipment-v2-banking-branch-name").fill("شعبه مرکزی تست");
    await page.getByTestId("shipment-v2-banking-payment-instrument-code").fill("998877");
    await page.getByTestId("shipment-v2-banking-sata-code").fill("554433");
    await page.getByTestId("shipment-v2-banking-save").click();
    await expect(page.getByTestId("shipment-v2-section-banking")).toContainText("بانک تست");
    await expect(page.getByTestId("shipment-v2-banking-branch-code-value")).toContainText("0123");
    await expect(page.getByTestId("shipment-v2-section-banking")).toContainText("شعبه مرکزی تست");
    await expect(page.getByTestId("shipment-v2-section-banking")).toContainText("998877");
    await expect(page.getByTestId("shipment-v2-section-banking")).toContainText("554433");

    await page.getByTestId("shipment-v2-base-edit").click();
    await page.getByTestId("shipment-v2-base-order-registration-number-input").fill("123456789");
    await page.getByTestId("shipment-v2-base-business-credential-input").fill(malvaniName);
    await expect(page.getByTestId("shipment-v2-base-business-credential-suggestions")).toBeVisible();
    const credentialSuggestionCount = await page.getByTestId("shipment-v2-base-business-credential-suggestions").locator("button").count();
    expect(credentialSuggestionCount).toBeGreaterThan(0);
    expect(credentialSuggestionCount).toBeLessThanOrEqual(5);
    await page.getByTestId("shipment-v2-base-business-credential-suggestion-0").click();
    await page.getByTestId("shipment-v2-base-status-select").selectOption("KOOTAJ_DONE");
    await page.getByTestId("shipment-v2-base-current-stage-input").fill("مرحله فعلی V2 برای تست");
    await page.getByTestId("shipment-v2-base-save").click();
    await expect(page.getByTestId("shipment-v2-base-order-registration-number")).toContainText("123456789");
    await expect(page.getByTestId("shipment-v2-base-business-credential")).toContainText(malvaniName);
    await page.getByTestId("shipment-v2-base-business-credential-button").click();
    await expect(page.getByTestId("shipment-v2-base-business-credential-dialog")).toContainText(malvaniName);
    await expect(page.getByTestId("shipment-v2-base-business-credential-dialog")).toContainText(`${marker} Captain`);
    await expect(page.getByTestId("shipment-v2-base-business-credential-contacts")).toContainText(malvaniContactName);
    await expect(page.getByTestId("shipment-v2-base-business-credential-contacts")).toContainText(malvaniContactPhone);
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("shipment-v2-base-status")).toContainText("کوتاژ شده");
    await expect(page.getByTestId("shipment-v2-base-current-stage")).toContainText("مرحله فعلی V2 برای تست");

    await page.getByTestId("shipment-v2-base-customer-button").click();
    await expect(page.getByTestId("shipment-v2-base-customer-dialog")).toContainText(customerIdentifier);
    await expect(page.getByTestId("shipment-v2-base-customer-active-shipments")).toContainText(generatedShipmentCode);
    await expect(page.getByTestId("shipment-v2-base-customer-active-shipments").getByRole("link")).toHaveCount(1);
    await page.keyboard.press("Escape");

    await page.getByTestId("shipment-v2-notes-edit").click();
    await page.getByTestId("shipment-v2-notes-input").fill("یادداشت داخلی V2 برای تست");
    await page.getByTestId("shipment-v2-notes-save").click();
    await expect(page.getByTestId("shipment-v2-section-notes")).toContainText("یادداشت داخلی V2 برای تست");

    const detailStatusText = fieldDisplayValue(await page.getByTestId("shipment-v2-base-status").innerText());
    const detailCurrentStage = fieldDisplayValue(await page.getByTestId("shipment-v2-base-current-stage").innerText());
    const shipmentsListPayload = await readOk<any[]>(await page.request.get("/api/shipments"));
    const listShipment = shipmentsListPayload.find((item) => item.id === shipmentId);
    expect(listShipment).toBeTruthy();
    expect(listShipment.customerName).toBe(customerIdentifier);
    expect(listShipment.customerCode).toBe(customerIdentifier);
    expect(listShipment.origin).toBe("Dubai");
    expect(listShipment.destination).toBe("Tehran");
    expect(listShipment.dischargePort).toBe("Bandar Abbas");
    expect(listShipment.deliveryPort).toBe("Tehran");
    expect(listShipment.displayStatusText).toBe(detailStatusText);
    expect(listShipment.currentStage).toBe(detailCurrentStage);

    await page.goto("/shipments");
    const shipmentRow = page.getByTestId(`shipment-row-${shipmentId}`);
    await expect(shipmentRow).toContainText(customerIdentifier);
    await expect(shipmentRow).toContainText("Dubai");
    await expect(shipmentRow).toContainText("Tehran");
    await expect(shipmentRow).toContainText("کوتاژ شده");
    await expect(shipmentRow).toContainText(detailCurrentStage);
    await expect(shipmentRow).not.toContainText(`${marker} Company`);
    await expect(shipmentRow).not.toContainText("100%");
    await expect(page.getByTestId("open-shipment-dialog")).toHaveCount(0);
    await page.getByTestId("open-shipment-v2-create").click();
    await expect(page).toHaveURL(/\/shipments\/new-v2$/);

    await page.goto(`/shipments/${shipmentId}`);
    await expect(page.getByTestId("shipment-v2-detail-page")).toBeVisible();

    await page.goto(`/shipments/${shipmentId}/legacy`);
    await expect(page).toHaveURL(new RegExp(`/shipments/${shipmentId}$`));
    await expect(page.getByTestId("shipment-v2-detail-page")).toBeVisible();
    await expect(page.locator("body")).toContainText(generatedShipmentCode);
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
            customerId: customer.id,
            origin: "Jebel Ali",
            dischargePort: "Bandar Abbas",
            deliveryPort: "Shiraz",
            consigneeName: "Consignee V2",
            container20Count: 2.5,
            container40Count: 1.25,
            goodsRows: [
              {
                description: "API goods from create",
                packagingType: "Pallet",
                quantity: 18.75,
                weight: 960.5,
                cbm: 4.4,
                pcs: 12.5,
              },
            ],
          },
        })
      );
      expect(created.profile.flowCode).toBe("IMPORT_SHIP");
      expect(created.profile.sections.base).not.toHaveProperty("shipmentTitle");
      expect(created.profile.sections.goods.container20Count).toBe(2.5);
      expect(created.profile.sections.goods.container40Count).toBe(1.25);
      expect(created.profile.sections.goods.goodsRows).toEqual([
        expect.objectContaining({
          description: "API goods from create",
          packagingType: "Pallet",
          quantity: 18.75,
          weight: 960.5,
          cbm: 4.4,
          pcs: 12.5,
        }),
      ]);
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
