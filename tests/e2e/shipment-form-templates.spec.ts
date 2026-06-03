import { expect, test, type Page } from "@playwright/test";
import {
  apiContext,
  disposeContexts,
  expectForbidden,
  expectPublicTrackingPayloadIsSafe,
  loginApi,
  loginViaUi,
  readOk,
  uniqueEmail,
  USER_PASSWORD,
} from "./helpers";

async function createCompanyUser(owner: Awaited<ReturnType<typeof loginApi>>, role: string, prefix: string) {
  const email = uniqueEmail(prefix);
  const data = await readOk<any>(
    await owner.post("/api/users", {
      data: {
        name: `E2E Shipment Forms ${role}`,
        email,
        password: USER_PASSWORD,
        role,
      },
    })
  );
  return { id: data.id, email, name: data.name };
}

async function createShipmentThroughWizard(
  page: Page,
  options: {
    operation: "import" | "export";
    method: "sea" | "lenj" | "air" | "land";
    typeCode: string;
    trackingNumber: string;
  }
) {
  await page.goto("/shipments");
  await page.getByTestId("open-shipment-dialog").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByTestId("shipment-wizard-step")).toBeVisible();
  await expect(dialog.locator("#container")).toHaveCount(0);
  await expect(dialog.getByTestId("shamsi-date-time-trigger")).toHaveCount(0);

  await page.getByTestId(`shipment-operation-${options.operation}`).click();
  await page.getByTestId("shipment-wizard-next").click();
  await expect(page.getByTestId(`shipment-method-${options.method}`)).toBeVisible();
  await page.getByTestId(`shipment-method-${options.method}`).click();
  await page.getByTestId("shipment-wizard-next").click();
  await expect(page.getByTestId(`shipment-type-${options.typeCode}`)).toBeVisible();
  await page.getByTestId(`shipment-type-${options.typeCode}`).click();
  await page.getByTestId("shipment-wizard-next").click();

  await page.getByTestId("shipment-create-tracking").fill(options.trackingNumber);
  await page.getByTestId("shipment-create-customer").selectOption({ index: 1 });
  await page.getByTestId("shipment-create-origin").fill(options.operation === "export" ? "Tehran" : "Dubai");
  await page.getByTestId("shipment-create-destination").fill(options.operation === "export" ? "Dubai" : "Tehran");
  await expect(page.getByTestId("shipment-create-date")).toHaveAttribute("type", "date");
  if (options.typeCode.includes("SEA_CONTAINER")) {
    await page.getByTestId("shipment-create-container-count").fill("2");
  } else {
    await expect(page.getByTestId("shipment-create-container-count")).toHaveCount(0);
  }
  await page.getByTestId("shipment-wizard-next").click();
  await expect(page.getByTestId("shipment-wizard-review")).toBeVisible();
  await page.getByTestId("submit-shipment").click();
  await page.waitForURL(/\/shipments\/[^/]+$/);

  const shipmentId = new URL(page.url()).pathname.split("/").pop();
  expect(shipmentId).toBeTruthy();
  const activeTemplate = await readOk<any>(
    await page.request.get(`/api/shipments/${encodeURIComponent(shipmentId!)}/form-template`)
  );
  expect(activeTemplate.shipment.shipmentTypeCode).toBe(options.typeCode);
  expect(activeTemplate.template).toEqual(expect.objectContaining({ shipmentTypeCode: options.typeCode }));
}

test.describe.serial("shipment form templates", () => {
  test("creates import and export shipments through the step-by-step wizard", async ({ page }) => {
    await loginViaUi(page);

    await createShipmentThroughWizard(page, {
      operation: "import",
      method: "sea",
      typeCode: "IMPORT_SEA_CONTAINER",
      trackingNumber: `WIZ-IMP-${Date.now()}`,
    });

    await page.goto("/shipments");
    await page.getByTestId("open-shipment-dialog").click();
    await page.getByTestId("shipment-operation-export").click();
    await page.getByTestId("shipment-wizard-next").click();
    await page.getByTestId("shipment-method-sea").click();
    await page.getByTestId("shipment-wizard-next").click();
    await expect(page.getByTestId("shipment-type-EXPORT_SEA_BULK")).toBeVisible();
    await expect(page.getByTestId("shipment-type-IMPORT_SEA_CONTAINER")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await createShipmentThroughWizard(page, {
      operation: "export",
      method: "sea",
      typeCode: "EXPORT_SEA_BULK",
      trackingNumber: `WIZ-EXP-${Date.now()}`,
    });
  });

  test("supports CEO-managed custom fields without leaking them publicly", async () => {
    const owner = await loginApi();
    const publicContext = await apiContext();
    let operations: Awaited<ReturnType<typeof loginApi>> | null = null;
    const suffix = `${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
    const customKey = `qaCustom${suffix}`;
    const privateOption = `private_${suffix}`;

    try {
      const types = await readOk<any[]>(await owner.get("/api/shipment-types"));
      expect(types.some((type) => type.code === "IMPORT_AIR_CARGO")).toBe(true);

      const employee = await createCompanyUser(owner, "OPERATIONS", "e2e-shipment-form-ops");
      operations = await loginApi(employee.email, USER_PASSWORD);
      await expectForbidden(await operations.get("/api/shipment-form-canonical-fields"));

      const templates = await readOk<any[]>(await owner.get("/api/shipment-form-templates"));
      const baseTemplate = templates.find((template) => template.shipmentTypeCode === "IMPORT_AIR_CARGO");
      expect(baseTemplate).toBeTruthy();
      const sectionId = baseTemplate.sections[0].id;

      await expectForbidden(
        await operations.post(`/api/shipment-form-templates/${encodeURIComponent(baseTemplate.id)}/fields`, {
          data: {
            sectionId,
            fieldKey: `blocked${suffix}`,
            fieldSource: "custom",
            fieldType: "text",
            labelFa: "Blocked field",
          },
        })
      );

      const withCustomField = await readOk<any>(
        await owner.post(`/api/shipment-form-templates/${encodeURIComponent(baseTemplate.id)}/fields`, {
          data: {
            sectionId,
            fieldKey: customKey,
            fieldSource: "custom",
            fieldType: "select",
            labelFa: "Private QA custom field",
            optionsJson: [{ value: privateOption, label: "Private option" }],
            isVisible: true,
            isRequired: false,
            isImportant: true,
            showInShipmentDetail: true,
            showInDailyStatus: true,
            showInCreateForm: true,
            sortOrder: 999,
          },
        })
      );
      expect(withCustomField.organizationId).toBeTruthy();
      const customField = withCustomField.sections.flatMap((section: any) => section.fields).find((field: any) => field.fieldKey === customKey);
      expect(customField).toEqual(expect.objectContaining({ fieldSource: "custom", fieldType: "select", isVisible: true }));

      const hiddenTemplate = await readOk<any>(
        await owner.patch(
          `/api/shipment-form-templates/${encodeURIComponent(withCustomField.id)}/fields/${encodeURIComponent(customField.id)}`,
          { data: { isVisible: false } }
        )
      );
      const hiddenField = hiddenTemplate.sections.flatMap((section: any) => section.fields).find((field: any) => field.fieldKey === customKey);
      expect(hiddenField.isVisible).toBe(false);

      const visibleTemplate = await readOk<any>(
        await owner.patch(
          `/api/shipment-form-templates/${encodeURIComponent(hiddenTemplate.id)}/fields/${encodeURIComponent(hiddenField.id)}`,
          { data: { isVisible: true } }
        )
      );
      const visibleField = visibleTemplate.sections.flatMap((section: any) => section.fields).find((field: any) => field.fieldKey === customKey);
      expect(visibleField.isVisible).toBe(true);

      const shipment = await readOk<any>(
        await owner.post("/api/shipments", {
          data: {
            trackingNumber: `FORM-${suffix}`,
            containerNumber: `AIR-${suffix}`,
            customerName: "Shipment form QA customer",
            origin: "Dubai",
            destination: "Tehran",
            status: "PENDING",
            shipmentTypeCode: "IMPORT_AIR_CARGO",
            shipmentDirection: "import",
            transportMode: "air",
            estimatedDelivery: "2026-06-10",
            freeTimeDays: 3,
          },
        })
      );
      expect(shipment.shipmentTypeCode).toBe("IMPORT_AIR_CARGO");

      const invalidUnknown = await owner.patch(`/api/shipments/${encodeURIComponent(shipment.id)}/daily-status`, {
        data: { customFields: { [`unknown${suffix}`]: "x" } },
      });
      expect(invalidUnknown.status(), await invalidUnknown.text()).toBe(400);

      const invalidOption = await owner.patch(`/api/shipments/${encodeURIComponent(shipment.id)}/daily-status`, {
        data: { customFields: { [customKey]: "not_an_option" } },
      });
      expect(invalidOption.status(), await invalidOption.text()).toBe(400);

      const updatedDailyStatus = await readOk<any>(
        await owner.patch(`/api/shipments/${encodeURIComponent(shipment.id)}/daily-status`, {
          data: { customFields: { [customKey]: privateOption } },
        })
      );
      expect(updatedDailyStatus.kootaj.customFields[customKey]).toBe(privateOption);

      const archivedTemplate = await readOk<any>(
        await owner.delete(
          `/api/shipment-form-templates/${encodeURIComponent(visibleTemplate.id)}/fields/${encodeURIComponent(visibleField.id)}`
        )
      );
      expect(archivedTemplate.sections.flatMap((section: any) => section.fields).some((field: any) => field.fieldKey === customKey)).toBe(false);

      const afterArchive = await readOk<any>(await owner.get(`/api/shipments/${encodeURIComponent(shipment.id)}/daily-status`));
      expect(afterArchive.kootaj.customFields[customKey]).toBe(privateOption);

      const access = await readOk<{ token: string }>(
        await owner.post(`/api/shipments/${encodeURIComponent(shipment.id)}/customer-access/generate`)
      );
      const publicPayload = await readOk<any>(
        await publicContext.get(`/api/public/track/${encodeURIComponent(access.token)}`)
      );
      expectPublicTrackingPayloadIsSafe(publicPayload);
      const publicSerialized = JSON.stringify(publicPayload);
      expect(publicSerialized).not.toContain(customKey);
      expect(publicSerialized).not.toContain(privateOption);
      await readOk(await owner.post(`/api/shipments/${encodeURIComponent(shipment.id)}/customer-access/disable`));
    } finally {
      await disposeContexts(owner, publicContext, ...(operations ? [operations] : []));
    }
  });
});
