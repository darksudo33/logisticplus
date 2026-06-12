import { expect, test, type APIRequestContext } from "@playwright/test";
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

async function createShipmentWithTemplateApi(
  request: APIRequestContext,
  options: {
    operation: "import" | "export";
    method: "sea" | "lenj" | "air" | "land";
    typeCode: string;
    trackingNumber: string;
  }
) {
  const shipment = await readOk<any>(
    await request.post("/api/shipments", {
      data: {
        trackingNumber: options.trackingNumber,
        containerNumber: options.typeCode.includes("SEA_CONTAINER") ? `CONT-${Date.now()}` : undefined,
        customerId: "c1",
        customerName: "Shipment template QA customer",
        origin: options.operation === "export" ? "Tehran" : "Dubai",
        destination: options.operation === "export" ? "Dubai" : "Tehran",
        status: "PENDING",
        shipmentTypeCode: options.typeCode,
        shipmentDirection: options.operation,
        transportMode: options.method === "lenj" ? "sea" : options.method,
        estimatedDelivery: "2026-06-10",
        freeTimeDays: 7,
      },
    })
  );
  const activeTemplate = await readOk<any>(
    await request.get(`/api/shipments/${encodeURIComponent(shipment.id)}/form-template`)
  );
  expect(activeTemplate.shipment.shipmentTypeCode).toBe(options.typeCode);
  expect(activeTemplate.template).toEqual(expect.objectContaining({ shipmentTypeCode: options.typeCode }));
}

test.describe.serial("shipment form templates", () => {
  test("keeps template selection for API-created shipments after removing the old create wizard", async ({ page }) => {
    await loginViaUi(page);
    await page.goto("/shipments");
    await expect(page.getByTestId("open-shipment-dialog")).toHaveCount(0);
    await page.getByTestId("open-shipment-v2-create").click();
    await expect(page).toHaveURL(/\/shipments\/new-v2$/);
    await expect(page.getByTestId("shipment-v2-create-page")).toBeVisible();

    await createShipmentWithTemplateApi(page.request, {
      operation: "import",
      method: "sea",
      typeCode: "IMPORT_SEA_CONTAINER",
      trackingNumber: `WIZ-IMP-${Date.now()}`,
    });

    await createShipmentWithTemplateApi(page.request, {
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
