import { expect, test } from "@playwright/test";
import pg from "pg";
import {
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
import {
  PREDEFINED_SHIPMENT_TYPE_WORKFLOW_MAPPINGS,
  PREDEFINED_WORKFLOW_TEMPLATE_BY_SHIPMENT_TYPE,
} from "../../src/shared/shipment-workflow-template-presets.js";
import { SYSTEM_CUSTOMS_STEP_CATALOG } from "../../src/shared/shipment-workflow-step-catalog.js";

const { Client } = pg;
type DbClient = InstanceType<typeof Client>;

const testDatabaseUrl = process.env.TEST_DATABASE_URL || "postgres://postgres@localhost:5432/logisticplus_test";
const shipmentId = "s1";
let client: DbClient;
let seedOrganizationId = "org1";

const runtimeSelectionTypes = [
  "IMPORT_LENJ",
  "IMPORT_SEA_CONTAINER",
  "IMPORT_AIR_CARGO",
  "IMPORT_LAND_TRUCK",
  "EXPORT_SEA_CONTAINER",
];

async function cleanupWorkflowTemplateTestData() {
  await client.query(
    `DELETE FROM shipment_workflow_instances
     WHERE shipment_id IN (
       SELECT id
       FROM shipments
       WHERE organization_id = $1
         AND shipment_code LIKE 'WF-TPL-%'
     )`,
    [seedOrganizationId]
  );
  await client.query("DELETE FROM shipment_workflow_instances WHERE shipment_id = $1", [shipmentId]);
  await client.query(
    `DELETE FROM shipments
     WHERE organization_id = $1
       AND shipment_code LIKE 'WF-TPL-%'`,
    [seedOrganizationId]
  );
  await client.query("DELETE FROM shipment_type_workflow_templates WHERE organization_id = $1", [seedOrganizationId]);
  await client.query("DELETE FROM shipment_workflow_templates WHERE organization_id = $1", [seedOrganizationId]);
}

async function createOperationsUser(owner: Awaited<ReturnType<typeof loginApi>>) {
  const email = uniqueEmail("e2e-workflow-template-ops");
  const data = await readOk<any>(
    await owner.post("/api/users", {
      data: {
        name: "E2E Workflow Template Operations",
        email,
        password: USER_PASSWORD,
        role: "OPERATIONS",
      },
    })
  );
  return { id: data.id, email };
}

async function createTenantOwner(owner: Awaited<ReturnType<typeof loginApi>>) {
  const tenantEmail = uniqueEmail("e2e-workflow-template-tenant");
  const data = await readOk<any>(
    await owner.post("/api/admin/organizations/manual-signup", {
      data: {
        companyName: `E2E Workflow Template Tenant ${Date.now()}`,
        ownerName: "E2E Workflow Template Tenant Owner",
        ownerEmail: tenantEmail,
        password: USER_PASSWORD,
        planId: "starter",
        billingCycle: "monthly",
        contactPhone: "09120000000",
      },
    })
  );
  return { tenantEmail, organizationId: data.organizationId };
}

function allTemplateSteps(template: any) {
  return (template.phases || []).flatMap((phase: any) => phase.steps || []);
}

async function createShipmentForType(owner: Awaited<ReturnType<typeof loginApi>>, typeCode: string) {
  const template = PREDEFINED_WORKFLOW_TEMPLATE_BY_SHIPMENT_TYPE.get(typeCode);
  expect(template, `Missing test workflow template metadata for ${typeCode}`).toBeTruthy();
  return readOk<any>(
    await owner.post("/api/shipments", {
      data: {
        trackingNumber: `WF-TPL-${typeCode}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        customerName: `Workflow Template ${typeCode}`,
        origin: template!.shipmentDirection === "export" ? "Tehran" : "Dubai",
        destination: template!.shipmentDirection === "export" ? "Dubai" : "Tehran",
        status: "LOADING",
        shipmentTypeCode: typeCode,
        shipmentDirection: template!.shipmentDirection,
        transportMode: template!.transportMode,
        estimatedDelivery: "2026-06-10",
      },
    })
  );
}

test.describe.serial("shipment workflow templates", () => {
  test.beforeAll(async () => {
    client = new Client({ connectionString: testDatabaseUrl });
    await client.connect();
    const organization = await client.query(
      "SELECT organization_id FROM app_users WHERE lower(email) = lower('darksudo22@gmail.com') LIMIT 1"
    );
    seedOrganizationId = organization.rows[0]?.organization_id || seedOrganizationId;
  });

  test.beforeEach(async () => {
    await cleanupWorkflowTemplateTestData();
  });

  test.afterAll(async () => {
    await cleanupWorkflowTemplateTestData();
    await client.end();
  });

  test("lists all predefined templates and global shipment type mappings", async () => {
    const owner = await loginApi();
    try {
      const templates = await readOk<any[]>(await owner.get("/api/shipment-workflow-templates"));
      const codes = templates.map((template) => template.code);
      expect(codes).toEqual(expect.arrayContaining(
        PREDEFINED_SHIPMENT_TYPE_WORKFLOW_MAPPINGS.map((mapping) => mapping.workflowTemplateCode)
      ));
      expect(templates.filter((template) => template.isSystem).length).toBeGreaterThanOrEqual(10);

      const catalog = await readOk<any[]>(await owner.get("/api/shipment-workflow-step-catalog"));
      expect(catalog).toHaveLength(SYSTEM_CUSTOMS_STEP_CATALOG.length);
      expect(catalog.filter((step) => step.isSystem).length).toBe(SYSTEM_CUSTOMS_STEP_CATALOG.length);
      expect(new Set(catalog.map((step) => step.code)).size).toBe(SYSTEM_CUSTOMS_STEP_CATALOG.length);

      const documentsCatalog = await readOk<any[]>(
        await owner.get("/api/shipment-workflow-step-catalog?stageKey=documents")
      );
      expect(documentsCatalog.length).toBeGreaterThan(0);
      expect(documentsCatalog.every((step) => step.stageKey === "documents")).toBe(true);

      const cotageCatalog = await readOk<any[]>(
        await owner.get(`/api/shipment-workflow-step-catalog?q=${encodeURIComponent("کوتاج")}`)
      );
      expect(cotageCatalog.some((step) => String(step.titleFa).includes("کوتاج"))).toBe(true);

      for (const mapping of PREDEFINED_SHIPMENT_TYPE_WORKFLOW_MAPPINGS) {
        const matchingTemplates = await readOk<any[]>(
          await owner.get(`/api/shipment-workflow-templates?shipmentTypeCode=${mapping.shipmentTypeCode}`)
        );
        expect(matchingTemplates.some((template) => template.code === mapping.workflowTemplateCode)).toBe(true);

        const dbMapping = await client.query(
          `SELECT workflow_template_id, workflow_template_code, workflow_template_version
           FROM shipment_type_workflow_templates
           WHERE organization_id IS NULL
             AND shipment_type_code = $1
             AND archived_at IS NULL
           LIMIT 1`,
          [mapping.shipmentTypeCode]
        );
        expect(dbMapping.rows[0]).toEqual(expect.objectContaining({
          workflow_template_id: mapping.templateId,
          workflow_template_code: mapping.workflowTemplateCode,
        }));
        expect(Number(dbMapping.rows[0].workflow_template_version)).toBe(mapping.workflowTemplateVersion);
      }

      const createAttempt = await owner.post("/api/shipment-workflow-templates", {
        data: {
          titleFa: "E2E disabled blank workflow",
          titleEn: "E2E disabled blank workflow",
          shipmentTypeCode: "IMPORT_SEA_CONTAINER",
        },
      });
      expect(createAttempt.status(), await createAttempt.text()).toBe(403);
      const payload = await createAttempt.json();
      expect(payload.error?.code).toBe("WORKFLOW_TEMPLATE_CREATE_DISABLED");
    } finally {
      await disposeContexts(owner);
    }
  });

  test("new shipments use their mapped workflow templates and reject spoofed tenant ids", async () => {
    const owner = await loginApi();
    try {
      const spoofed = await owner.post("/api/shipments", {
        data: {
          trackingNumber: `WF-TPL-SPOOF-${Date.now()}`,
          customerName: "Spoofed workflow template shipment",
          origin: "Dubai",
          destination: "Tehran",
          shipmentTypeCode: "IMPORT_AIR_CARGO",
          organizationId: "other-org",
          orgId: "other-org",
          companyId: "other-company",
          tenantId: "other-tenant",
        },
      });
      expect(spoofed.status(), await spoofed.text()).toBe(403);
      expect((await spoofed.json()).error?.code).toBe("TENANT_SCOPE_CONFLICT");

      for (const typeCode of runtimeSelectionTypes) {
        const mapping = PREDEFINED_SHIPMENT_TYPE_WORKFLOW_MAPPINGS.find((item) => item.shipmentTypeCode === typeCode);
        expect(mapping).toBeTruthy();
        const shipment = await createShipmentForType(owner, typeCode);
        expect(shipment.shipmentTypeCode).toBe(typeCode);
        const dbShipment = await client.query(
          "SELECT organization_id, shipment_type_code FROM shipments WHERE id = $1 LIMIT 1",
          [shipment.id]
        );
        expect(dbShipment.rows[0]).toEqual(expect.objectContaining({
          organization_id: seedOrganizationId,
          shipment_type_code: typeCode,
        }));

        const active = await readOk<any>(await owner.get(`/api/shipments/${shipment.id}/workflow-template`));
        expect(active.template.code).toBe(mapping!.workflowTemplateCode);
        const progress = await readOk<any>(await owner.post(`/api/shipments/${shipment.id}/progress/start`));
        expect(progress.workflow.workflowTemplateCode).toBe(mapping!.workflowTemplateCode);
        expect(progress.workflow.workflowTemplateId).toBe(mapping!.templateId);
        expect(progress.definition.titleFa).toBeTruthy();
      }
    } finally {
      await disposeContexts(owner);
    }
  });

  test("admin edits existing seeded templates while started snapshots stay unchanged", async () => {
    const owner = await loginApi();
    const contexts = [owner];
    try {
      const auditStartedAt = new Date(Date.now() - 1000).toISOString();
      const templates = await readOk<any[]>(await owner.get("/api/shipment-workflow-templates"));
      const legacyTemplate = templates.find((template) => template.id === "swt-ir-import-customs-v1");
      const seaTemplate = templates.find((template) => template.code === "WF_IMPORT_SEA_CONTAINER_V1");
      expect(legacyTemplate?.isSystem).toBe(true);
      expect(seaTemplate?.isSystem).toBe(true);
      expect(allTemplateSteps(seaTemplate).length).toBeGreaterThanOrEqual(8);

      await readOk(
        await owner.patch("/api/shipment-types/IMPORT_SEA_CONTAINER/workflow-template", {
          data: { templateId: legacyTemplate.id },
        })
      );
      const started = await readOk<any>(await owner.post(`/api/shipments/${shipmentId}/progress/start`));
      expect(started.workflow.workflowTemplateCode).toBe("IR_IMPORT_CUSTOMS_V1");

      const operationsInfo = await createOperationsUser(owner);
      const operations = await loginApi(operationsInfo.email, USER_PASSWORD);
      contexts.push(operations);
      await expectForbidden(
        await operations.patch(`/api/shipment-workflow-templates/${seaTemplate.id}`, {
          data: { titleFa: "Forbidden workflow template edit" },
        })
      );

      const tenantInfo = await createTenantOwner(owner);
      const tenant = await loginApi(tenantInfo.tenantEmail, USER_PASSWORD);
      contexts.push(tenant);

      const edited = await readOk<any>(
        await owner.patch(`/api/shipment-workflow-templates/${seaTemplate.id}`, {
          data: {
            titleFa: "E2E edited sea container workflow",
            titleEn: "E2E edited sea container workflow",
            description: "Existing seeded template customized by Playwright.",
          },
        })
      );
      expect(edited.organizationId).toBe(seedOrganizationId);
      expect(edited.isSystem).toBe(false);
      await expectUnavailable(await tenant.get(`/api/shipment-workflow-templates/${edited.id}`));

      const phaseKey = edited.phases[0].phaseKey;
      const stepKey = `E2E_TEMPLATE_STEP_${Date.now()}`;
      const withAddedStep = await readOk<any>(
        await owner.post(`/api/shipment-workflow-templates/${edited.id}/steps`, {
          data: {
            phaseKey,
            stepKey,
            labelFa: "E2E optional workflow step",
            labelEn: "E2E optional workflow step",
            publicLabel: "Safe public E2E optional step",
            sortOrder: 99,
            isRequired: false,
            isVisible: true,
            isCustomerVisible: false,
            roleSuggestion: "OPERATIONS",
            expectedDocuments: ["commercial_invoice"],
            expectedFormFields: ["cotageNumber"],
            taskPolicy: { mode: "suggested" },
          },
        })
      );
      const addedStep = allTemplateSteps(withAddedStep).find((step: any) => step.stepKey === stepKey);
      expect(addedStep?.isRequired).toBe(false);

      const catalog = await readOk<any[]>(await owner.get("/api/shipment-workflow-step-catalog"));
      const catalogStep = catalog.find((step) => step.code === "IR_IMPORT_CUSTOMS_036") || catalog[0];
      const withCatalogStep = await readOk<any>(
        await owner.post(`/api/shipment-workflow-templates/${withAddedStep.id}/steps/from-catalog`, {
          data: { catalogStepIds: [catalogStep.id] },
        })
      );
      expect(allTemplateSteps(withCatalogStep).some((step: any) => step.catalogStepId === catalogStep.id)).toBe(true);

      const duplicateAttempt = await owner.post(`/api/shipment-workflow-templates/${withCatalogStep.id}/steps/from-catalog`, {
        data: { catalogStepIds: [catalogStep.id] },
      });
      expect(duplicateAttempt.status(), await duplicateAttempt.text()).toBe(409);
      expect((await duplicateAttempt.json()).error?.code).toBe("SHIPMENT_WORKFLOW_TEMPLATE_DUPLICATE_CATALOG_STEPS");

      const withEditedStep = await readOk<any>(
        await owner.patch(`/api/shipment-workflow-templates/${withAddedStep.id}/steps/${addedStep.id}`, {
          data: {
            labelFa: "E2E renamed workflow step",
            publicLabel: "Renamed safe public step",
            isVisible: false,
            isCustomerVisible: false,
            isRequired: false,
          },
        })
      );
      expect(allTemplateSteps(withEditedStep).find((step: any) => step.stepKey === stepKey)?.isVisible).toBe(false);

      const afterArchive = await readOk<any>(
        await owner.delete(`/api/shipment-workflow-templates/${withEditedStep.id}/steps/${addedStep.id}`)
      );
      expect(allTemplateSteps(afterArchive).some((step: any) => step.stepKey === stepKey)).toBe(false);

      const published = await readOk<any>(
        await owner.patch(`/api/shipment-workflow-templates/${afterArchive.id}/publish`, {
          data: {
            shipmentTypeCode: "IMPORT_SEA_CONTAINER",
            titleFa: "E2E published sea container workflow",
            titleEn: "E2E published sea container workflow",
          },
        })
      );
      expect(published.id).not.toBe(afterArchive.id);
      expect(published.version).toBeGreaterThan(afterArchive.version);
      expect(published.isActive).toBe(true);

      const activeForShipment = await readOk<any>(await owner.get(`/api/shipments/${shipmentId}/workflow-template`));
      expect(activeForShipment.template.id).toBe(published.id);

      const progressAfterPublish = await readOk<any>(await owner.get(`/api/shipments/${shipmentId}/progress`));
      expect(progressAfterPublish.workflow.workflowTemplateCode).toBe("IR_IMPORT_CUSTOMS_V1");
      expect(progressAfterPublish.workflow.workflowTemplateId).toBe(legacyTemplate.id);
      expect(JSON.stringify(progressAfterPublish.definition)).not.toContain(stepKey);

      const auditActions = await client.query(
        `SELECT event_type
         FROM audit_logs
         WHERE organization_id = $1
           AND event_type LIKE 'shipment_workflow_template.%'
           AND created_at >= $2`,
        [seedOrganizationId, auditStartedAt]
      );
      const events = auditActions.rows.map((row) => row.event_type);
      expect(events).toContain("shipment_workflow_template.update");
      expect(events).toContain("shipment_workflow_template.step_add");
      expect(events).toContain("shipment_workflow_template.steps_add_from_catalog");
      expect(events).toContain("shipment_workflow_template.step_update");
      expect(events).toContain("shipment_workflow_template.step_archive");
      expect(events).toContain("shipment_workflow_template.publish");
      expect(events).toContain("shipment_workflow_template.mapping_update");
      expect(events).not.toContain("shipment_workflow_template.create");
    } finally {
      await disposeContexts(...contexts);
    }
  });

  test("unused tenant templates can be deleted but referenced templates must be archived", async () => {
    const owner = await loginApi();
    try {
      const unusedTemplateId = `e2e-unused-workflow-template-${Date.now()}`;
      const unusedPhaseId = `${unusedTemplateId}-phase`;
      await client.query(
        `INSERT INTO shipment_workflow_templates (
           id, organization_id, code, shipment_direction, transport_mode, shipment_type_hint,
           title_fa, title_en, description, is_system, is_active, version, created_at, updated_at
         )
         VALUES ($1, $2, $3, 'import', 'sea', 'IMPORT_SEA_CONTAINER',
           'E2E unused workflow template', 'E2E unused workflow template', '', FALSE, TRUE, 1, NOW(), NOW())`,
        [unusedTemplateId, seedOrganizationId, unusedTemplateId]
      );
      await client.query(
        `INSERT INTO shipment_workflow_template_phases (
           id, template_id, phase_key, label_fa, label_en, sort_order, is_visible, created_at, updated_at
         )
         VALUES ($1, $2, 'base', 'Base', 'Base', 1, TRUE, NOW(), NOW())`,
        [unusedPhaseId, unusedTemplateId]
      );
      await readOk(await owner.delete(`/api/shipment-workflow-templates/${unusedTemplateId}`));
      const deleted = await client.query("SELECT COUNT(*)::int AS count FROM shipment_workflow_templates WHERE id = $1", [unusedTemplateId]);
      expect(Number(deleted.rows[0].count)).toBe(0);

      const templates = await readOk<any[]>(await owner.get("/api/shipment-workflow-templates"));
      const seaTemplate = templates.find((template) => template.code === "WF_IMPORT_SEA_CONTAINER_V1");
      const edited = await readOk<any>(
        await owner.patch(`/api/shipment-workflow-templates/${seaTemplate.id}`, {
          data: {
            titleFa: "E2E referenced workflow template",
            titleEn: "E2E referenced workflow template",
          },
        })
      );
      const deleteUsed = await owner.delete(`/api/shipment-workflow-templates/${edited.id}`);
      expect(deleteUsed.status(), await deleteUsed.text()).toBe(409);

      const archived = await readOk<any>(
        await owner.post(`/api/shipment-workflow-templates/${edited.id}/archive`, {
          data: { reason: "E2E archive referenced template" },
        })
      );
      expect(archived.archivedAt).toBeTruthy();

      const activeTemplates = await readOk<any[]>(await owner.get("/api/shipment-workflow-templates"));
      expect(activeTemplates.some((template) => template.id === edited.id)).toBe(false);
      const withArchived = await readOk<any[]>(await owner.get("/api/shipment-workflow-templates?includeArchived=true"));
      expect(withArchived.some((template) => template.id === edited.id && template.archivedAt)).toBe(true);
    } finally {
      await disposeContexts(owner);
    }
  });

  test("normal users cannot open the workflow template editor UI", async ({ page }) => {
    const owner = await loginApi();
    const operationsInfo = await createOperationsUser(owner);
    await disposeContexts(owner);

    await loginViaUi(page, operationsInfo.email, USER_PASSWORD);
    await page.goto("/admin/workflow-templates");
    await expect(page.getByTestId("shipment-workflow-templates-admin-page")).toHaveCount(0);
  });

  test("public tracking does not leak workflow template internals", async () => {
    const owner = await loginApi();
    const publicContext = await apiContext();
    try {
      const shipment = await createShipmentForType(owner, "EXPORT_SEA_CONTAINER");
      const progress = await readOk<any>(await owner.post(`/api/shipments/${shipment.id}/progress/start`));
      await readOk(
        await owner.patch(`/api/shipments/${shipment.id}/progress/current`, {
          data: {
            stepCode: "001",
            status: "completed",
            internalNote: "Private workflow template internals should stay hidden.",
            publicNote: "Customer-safe export workflow update.",
            publicVisible: true,
          },
        })
      );
      const access = await readOk<{ token: string }>(
        await owner.post(`/api/shipments/${shipment.id}/customer-access/generate`)
      );
      const payload = await readOk<any>(
        await publicContext.get(`/api/public/track/${encodeURIComponent(access.token)}`)
      );
      expectPublicTrackingPayloadIsSafe(payload);
      const serialized = JSON.stringify(payload);
      expect(serialized).not.toContain(progress.workflow.workflowTemplateId);
      expect(serialized).not.toContain(progress.workflow.workflowTemplateCode);
      expect(serialized).not.toContain("WF_EXPORT_SEA_CONTAINER_V1");
      expect(serialized.toLowerCase()).not.toContain("workflowtemplate");
      expect(serialized.toLowerCase()).not.toContain("taskpolicy");
    } finally {
      await disposeContexts(owner, publicContext);
    }
  });
});
