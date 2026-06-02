import { expect, test } from "@playwright/test";
import { loginApi, loginViaUi, readOk } from "./helpers";

const archiveConfirmButton = /انتقال به بایگانی/;

test.describe.serial("delete buttons confirm before archiving", () => {
  test("cheque delete button opens confirmation and archives the cheque", async ({ page }) => {
    const api = await loginApi();
    const suffix = Date.now();
    const cheque = await readOk<any>(
      await api.post("/api/cheques", {
        data: {
          bankName: `بانک تست حذف ${suffix}`,
          chequeNumber: `DEL-CHQ-${suffix}`,
          amount: 1200000,
          dueDate: "1405/01/01 10:00",
          location: "صندوق تست",
          receiver: "گیرنده تست",
          status: "ACTIVE",
        },
      })
    );
    await api.dispose();

    await loginViaUi(page);
    await page.goto("/cheques");
    await page.getByLabel(`Delete cheque ${cheque.id}`).click();
    await expect(page.getByRole("dialog")).toContainText("بایگانی چک");
    await page.getByRole("dialog").getByRole("button", { name: archiveConfirmButton }).click();
    await expect(page.getByText(`DEL-CHQ-${suffix}`)).toHaveCount(0);
  });

  test("compliance delete button opens confirmation and archives the meeting", async ({ page }) => {
    const api = await loginApi();
    const suffix = Date.now();
    const meeting = await readOk<any>(
      await api.post("/api/compliance-meetings", {
        data: {
          dateTime: "1405/01/01 10:00",
          departmentName: "واحد تست",
          purpose: `جلسه تست حذف ${suffix}`,
          assignedPersonId: "u1",
          assignedPersonName: "Owner",
          status: "SCHEDULED",
          requiredDocuments: [{ id: "doc", name: "مدرک تست", required: true, completed: false }],
        },
      })
    );
    await api.dispose();

    await loginViaUi(page);
    await page.goto("/compliance-meetings");
    await page.getByLabel(`Archive compliance meeting ${meeting.id}`).click();
    await expect(page.getByRole("dialog")).toContainText("بایگانی نوبت");
    await page.getByRole("dialog").getByRole("button", { name: archiveConfirmButton }).click();
    await expect(page.getByText(`جلسه تست حذف ${suffix}`)).toHaveCount(0);
  });

  test("quotation delete button opens confirmation and archives the quotation", async ({ page }) => {
    const api = await loginApi();
    const suffix = Date.now();
    const quotation = await readOk<any>(
      await api.post("/api/quotations", {
        data: {
          customerName: `مشتری تست حذف ${suffix}`,
          customerPhone: "09120000000",
          originCity: "تهران",
          destinationCity: "بندرعباس",
          cargoType: "GENERAL",
          weight: 4,
          dimensions: "2x2x2",
          pickupDate: new Date().toISOString(),
          deliveryDate: new Date().toISOString(),
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
    await api.dispose();

    await loginViaUi(page);
    await page.goto("/quotations");
    await page.getByLabel(`Archive quotation ${quotation.id}`).first().click();
    await expect(page.getByRole("dialog")).toContainText("بایگانی استعلام قیمت");
    await page.getByRole("dialog").getByRole("button", { name: archiveConfirmButton }).click();
    await expect(page.locator("tbody tr", { hasText: `مشتری تست حذف ${suffix}` })).toHaveCount(0);
  });
});
