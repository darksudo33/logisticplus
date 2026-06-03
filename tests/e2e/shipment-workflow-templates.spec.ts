import { expect, test } from "@playwright/test";
import pg from "pg";
import {
  USER_PASSWORD,
  disposeContexts,
  expectForbidden,
  expectUnavailable,
  loginApi,
  readOk,
  uniqueEmail,
} from "./helpers";

const { Client } = pg;
type DbClient = InstanceType<typeof Client>;

const testDatabaseUrl = process.env.TEST_DATABASE_URL || "postgres://postgres@localhost:5432/logisticplus_test";
const shipmentId = "s1";
let client: DbClient;
let seedOrganizationId = "org1";

async function cleanupWorkflowTemplateTestData() {
  await client.query("DELETE FROM shipment_workflow_instances WHERE shipment_id = $1", [shipmentId]);
  await client.query("DELETE FROM shipment_type_workflow_templates WHERE organization_id = $1", [seedOrganizationId]);
  await client.query(
    "DELETE FROM shipment_workflow_templates WHERE organization_id = $1 AND code = 'IR_IMPORT_CUSTOMS_V1'",
    [seedOrganizationId]
  );
}

async function createOperationsUser(owner: Awaited<ReturnType<typeof loginApi>>) {
  const email = uniqueEmail("e2e-workflow-template-ops");
  await readOk(
    await owner.post("/api/users", {
      data: {
        name: "E2E Workflow Template Operations",
        email,
        password: USER_PASSWORD,
        role: "OPERATIONS",
      },
    })
  );
  return { email };
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

  test("versions tenant workflow templates without rewriting started shipment snapshots", async () => {
    const owner = await loginApi();
    const contexts = [owner];
    try {
      const auditStartedAt = new Date(Date.now() - 1000).toISOString();
      const templates = await readOk<any[]>(await owner.get("/api/shipment-workflow-templates"));
      const systemTemplate = templates.find((template) => template.id === "swt-ir-import-customs-v1");
      expect(systemTemplate?.isSystem).toBe(true);
      expect(allTemplateSteps(systemTemplate).length).toBeGreaterThan(60);

      const started = await readOk<any>(await owner.post(`/api/shipments/${shipmentId}/progress/start`));
      expect(started.workflow.workflowTemplateId).toBe(systemTemplate.id);
      expect(started.workflow.workflowTemplateVersion).toBe(1);

      const initialSnapshot = await client.query(
        `SELECT workflow_template_id, workflow_template_version, workflow_definition_snapshot_json
         FROM shipment_workflow_instances
         WHERE shipment_id = $1
         ORDER BY started_at DESC
         LIMIT 1`,
        [shipmentId]
      );
      expect(initialSnapshot.rows[0].workflow_template_id).toBe(systemTemplate.id);
      expect(Number(initialSnapshot.rows[0].workflow_template_version)).toBe(1);
      expect(JSON.stringify(initialSnapshot.rows[0].workflow_definition_snapshot_json)).not.toContain("E2E_TEMPLATE_STEP");

      const clone = await readOk<any>(
        await owner.post("/api/shipment-workflow-templates", {
          data: {
            sourceTemplateId: systemTemplate.id,
            titleFa: "E2E controlled workflow template",
            titleEn: "E2E controlled workflow template",
            description: "Playwright clone used to verify controlled workflow versioning.",
            shipmentTypeCode: "IMPORT_SEA_CONTAINER",
          },
        })
      );
      expect(clone.organizationId).toBe(seedOrganizationId);
      expect(clone.isSystem).toBe(false);

      const operationsInfo = await createOperationsUser(owner);
      const operations = await loginApi(operationsInfo.email, USER_PASSWORD);
      contexts.push(operations);
      await expectForbidden(
        await operations.patch(`/api/shipment-workflow-templates/${clone.id}`, {
          data: { titleFa: "Forbidden workflow template edit" },
        })
      );

      const tenantInfo = await createTenantOwner(owner);
      const tenant = await loginApi(tenantInfo.tenantEmail, USER_PASSWORD);
      contexts.push(tenant);
      await expectUnavailable(await tenant.get(`/api/shipment-workflow-templates/${clone.id}`));

      const phaseKey = clone.phases[0].phaseKey;
      const stepKey = `E2E_TEMPLATE_STEP_${Date.now()}`;
      const withAddedStep = await readOk<any>(
        await owner.post(`/api/shipment-workflow-templates/${clone.id}/steps`, {
          data: {
            phaseKey,
            stepKey,
            labelFa: "E2E template step",
            labelEn: "E2E template step",
            publicLabel: "Safe public E2E step",
            sortOrder: 2,
            isRequired: false,
            isVisible: true,
            isCustomerVisible: false,
            roleSuggestion: "OPERATIONS",
            expectedDocuments: ["commercial_invoice"],
            expectedFormFields: ["kootajNumber"],
            taskPolicy: { mode: "suggested" },
          },
        })
      );
      const addedStep = allTemplateSteps(withAddedStep).find((step: any) => step.stepKey === stepKey);
      expect(addedStep?.isRequired).toBe(false);
      expect(addedStep?.expectedDocuments).toContain("commercial_invoice");

      const withEditedStep = await readOk<any>(
        await owner.patch(`/api/shipment-workflow-templates/${clone.id}/steps/${addedStep.id}`, {
          data: {
            labelFa: "E2E renamed workflow step",
            publicLabel: "Renamed safe public step",
            sortOrder: 3,
            isVisible: false,
            isCustomerVisible: false,
            isRequired: false,
          },
        })
      );
      const editedStep = allTemplateSteps(withEditedStep).find((step: any) => step.stepKey === stepKey);
      expect(editedStep?.labelFa).toBe("E2E renamed workflow step");
      expect(editedStep?.isVisible).toBe(false);

      const archiveStepKey = `E2E_ARCHIVE_${Date.now()}`;
      const withArchiveCandidate = await readOk<any>(
        await owner.post(`/api/shipment-workflow-templates/${clone.id}/steps`, {
          data: {
            phaseKey,
            stepKey: archiveStepKey,
            labelFa: "E2E archive candidate",
            labelEn: "E2E archive candidate",
            isRequired: false,
            sortOrder: 4,
          },
        })
      );
      const archiveCandidate = allTemplateSteps(withArchiveCandidate).find((step: any) => step.stepKey === archiveStepKey);
      const afterArchive = await readOk<any>(
        await owner.delete(`/api/shipment-workflow-templates/${clone.id}/steps/${archiveCandidate.id}`)
      );
      expect(allTemplateSteps(afterArchive).some((step: any) => step.stepKey === archiveStepKey)).toBe(false);

      const published = await readOk<any>(
        await owner.patch(`/api/shipment-workflow-templates/${clone.id}/publish`, {
          data: {
            shipmentTypeCode: "IMPORT_SEA_CONTAINER",
            titleFa: "E2E published workflow template",
            titleEn: "E2E published workflow template",
          },
        })
      );
      expect(published.id).not.toBe(clone.id);
      expect(published.version).toBeGreaterThan(clone.version);
      expect(published.isActive).toBe(true);

      const mapping = await readOk<any>(
        await owner.patch("/api/shipment-types/IMPORT_LAND_TRUCK/workflow-template", {
          data: { templateId: published.id },
        })
      );
      expect(mapping.shipmentTypeCode).toBe("IMPORT_LAND_TRUCK");
      expect(mapping.template.id).toBe(published.id);

      const activeForShipment = await readOk<any>(await owner.get(`/api/shipments/${shipmentId}/workflow-template`));
      expect(activeForShipment.template.id).toBe(published.id);

      const progressAfterPublish = await readOk<any>(await owner.get(`/api/shipments/${shipmentId}/progress`));
      expect(progressAfterPublish.workflow.workflowTemplateId).toBe(systemTemplate.id);
      expect(progressAfterPublish.workflow.workflowTemplateVersion).toBe(1);
      expect(progressAfterPublish.steps.some((step: any) => step.code === stepKey)).toBe(false);

      const auditActions = await client.query(
        `SELECT event_type
         FROM audit_logs
         WHERE organization_id = $1
           AND event_type LIKE 'shipment_workflow_template.%'
           AND created_at >= $2`,
        [seedOrganizationId, auditStartedAt]
      );
      const events = auditActions.rows.map((row) => row.event_type);
      expect(events).toContain("shipment_workflow_template.create");
      expect(events).toContain("shipment_workflow_template.step_add");
      expect(events).toContain("shipment_workflow_template.step_update");
      expect(events).toContain("shipment_workflow_template.step_archive");
      expect(events).toContain("shipment_workflow_template.publish");
      expect(events).toContain("shipment_workflow_template.mapping_update");
    } finally {
      await disposeContexts(...contexts);
    }
  });
});
