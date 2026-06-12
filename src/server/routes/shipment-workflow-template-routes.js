import {
  shipmentParamsSchema,
  shipmentWorkflowStepCatalogListQuerySchema,
  shipmentWorkflowTemplateArchiveBodySchema,
  shipmentTypeWorkflowTemplateBodySchema,
  shipmentTypeWorkflowTemplateParamsSchema,
  shipmentWorkflowTemplateListQuerySchema,
  shipmentWorkflowTemplateParamsSchema,
  shipmentWorkflowTemplatePublishBodySchema,
  shipmentWorkflowTemplateStepCreateBodySchema,
  shipmentWorkflowTemplateStepParamsSchema,
  shipmentWorkflowTemplateStepUpdateBodySchema,
  shipmentWorkflowTemplateStepsFromCatalogBodySchema,
  shipmentWorkflowTemplateUpdateBodySchema,
} from "../request-schemas.js";
import { parseRequestValue } from "../validation.js";
import {
  addShipmentWorkflowTemplateStep,
  addShipmentWorkflowTemplateStepsFromCatalog,
  archiveShipmentWorkflowTemplate,
  archiveShipmentWorkflowTemplateStep,
  deleteShipmentWorkflowTemplate,
  getActiveShipmentWorkflowTemplateForShipment,
  getShipmentWorkflowTemplate,
  listShipmentWorkflowStepCatalog,
  listShipmentWorkflowTemplates,
  publishShipmentWorkflowTemplate,
  setShipmentTypeWorkflowTemplate,
  shipmentWorkflowTemplateCatalog,
  updateShipmentWorkflowTemplate,
  updateShipmentWorkflowTemplateStep,
} from "../repositories/shipment-workflow-templates.js";

function isWorkflowTemplateSchemaMissing(error) {
  return (
    error?.code === "42P01" ||
    error?.code === "42703" ||
    /shipment_workflow_templates|shipment_workflow_template_phases|shipment_workflow_template_steps|shipment_type_workflow_templates|shipment_workflow_step_catalog/i.test(String(error?.message || ""))
  );
}

async function requireWorkflowTemplateReader({ req, res, requireAuthenticatedTenantUser, requirePermission }) {
  const tenantRequest = await requireAuthenticatedTenantUser(req, res, "shipment workflow template read API");
  if (!tenantRequest) return null;
  try {
    await requirePermission(tenantRequest.user, "shipments.view_all");
  } catch {
    await requirePermission(tenantRequest.user, "shipments.create");
  }
  return tenantRequest;
}

async function requireWorkflowTemplateManager({ req, res, requireAuthenticatedTenantUser, requirePermission }) {
  const tenantRequest = await requireAuthenticatedTenantUser(req, res, "shipment workflow template manage API");
  if (!tenantRequest) return null;
  await requirePermission(tenantRequest.user, "shipment_workflows.manage");
  return tenantRequest;
}

export function registerShipmentWorkflowTemplateRoutes(
  app,
  {
    auditLog,
    createApiError,
    pool,
    requestContext,
    requireAuthenticatedTenantUser,
    requirePermission,
  }
) {
  function handleRouteError(res, error, fallbackCode, fallbackMessage) {
    if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
    if (error.statusCode === 404) return createApiError(res, 404, error.code || "NOT_FOUND", error.message);
    if (error.statusCode === 400) return createApiError(res, 400, error.code || "VALIDATION_ERROR", error.message);
    if (error.statusCode === 409) return createApiError(res, 409, error.code || "CONFLICT", error.message);
    if (isWorkflowTemplateSchemaMissing(error)) {
      return createApiError(
        res,
        503,
        "SHIPMENT_WORKFLOW_TEMPLATE_SCHEMA_NOT_READY",
        "Shipment workflow template migration has not been applied yet."
      );
    }
    console.error(fallbackCode, error);
    return createApiError(res, 500, fallbackCode, fallbackMessage);
  }

  app.get("/api/shipment-workflow-template-types", async (req, res) => {
    try {
      const tenantRequest = await requireWorkflowTemplateReader({ req, res, requireAuthenticatedTenantUser, requirePermission });
      if (!tenantRequest) return;
      res.json({ ok: true, data: shipmentWorkflowTemplateCatalog.shipmentTypes });
    } catch (error) {
      handleRouteError(res, error, "SHIPMENT_WORKFLOW_TYPES_FAILED", "Could not load shipment workflow types.");
    }
  });

  app.get("/api/shipment-workflow-step-catalog", async (req, res) => {
    try {
      const tenantRequest = await requireWorkflowTemplateReader({ req, res, requireAuthenticatedTenantUser, requirePermission });
      if (!tenantRequest) return;
      const query = parseRequestValue(res, shipmentWorkflowStepCatalogListQuerySchema, req.query || {});
      if (!query) return;
      const data = await listShipmentWorkflowStepCatalog(pool, {
        organizationId: tenantRequest.organizationId,
        search: query.q || query.search,
        stageKey: query.stageKey,
        category: query.category || "customs_import",
        includeArchived: query.includeArchived,
      });
      res.json({ ok: true, data });
    } catch (error) {
      handleRouteError(res, error, "SHIPMENT_WORKFLOW_STEP_CATALOG_FAILED", "Could not load shipment workflow step catalog.");
    }
  });

  app.get("/api/shipment-workflow-templates", async (req, res) => {
    try {
      const tenantRequest = await requireWorkflowTemplateReader({ req, res, requireAuthenticatedTenantUser, requirePermission });
      if (!tenantRequest) return;
      const query = parseRequestValue(res, shipmentWorkflowTemplateListQuerySchema, req.query || {});
      if (!query) return;
      const data = await listShipmentWorkflowTemplates(pool, {
        organizationId: tenantRequest.organizationId,
        shipmentTypeCode: query.shipmentTypeCode,
        includeArchived: query.includeArchived,
      });
      res.json({ ok: true, data });
    } catch (error) {
      handleRouteError(res, error, "SHIPMENT_WORKFLOW_TEMPLATES_FAILED", "Could not load shipment workflow templates.");
    }
  });

  app.get("/api/shipment-workflow-templates/:id", async (req, res) => {
    try {
      const tenantRequest = await requireWorkflowTemplateReader({ req, res, requireAuthenticatedTenantUser, requirePermission });
      if (!tenantRequest) return;
      const params = parseRequestValue(res, shipmentWorkflowTemplateParamsSchema, req.params);
      if (!params) return;
      const data = await getShipmentWorkflowTemplate(pool, {
        organizationId: tenantRequest.organizationId,
        templateId: params.id,
      });
      if (!data) return createApiError(res, 404, "NOT_FOUND", "Shipment workflow template was not found.");
      res.json({ ok: true, data });
    } catch (error) {
      handleRouteError(res, error, "SHIPMENT_WORKFLOW_TEMPLATE_FAILED", "Could not load shipment workflow template.");
    }
  });

  app.get("/api/shipments/:id/workflow-template", async (req, res) => {
    try {
      const tenantRequest = await requireWorkflowTemplateReader({ req, res, requireAuthenticatedTenantUser, requirePermission });
      if (!tenantRequest) return;
      const params = parseRequestValue(res, shipmentParamsSchema, req.params);
      if (!params) return;
      const data = await getActiveShipmentWorkflowTemplateForShipment(pool, {
        organizationId: tenantRequest.organizationId,
        shipmentId: params.id,
      });
      if (!data) return createApiError(res, 404, "NOT_FOUND", "Shipment was not found.");
      res.json({ ok: true, data });
    } catch (error) {
      handleRouteError(res, error, "SHIPMENT_ACTIVE_WORKFLOW_TEMPLATE_FAILED", "Could not load shipment workflow template.");
    }
  });

  app.post("/api/shipment-workflow-templates", async (req, res) => {
    try {
      const tenantRequest = await requireWorkflowTemplateManager({ req, res, requireAuthenticatedTenantUser, requirePermission });
      if (!tenantRequest) return;
      return createApiError(
        res,
        403,
        "WORKFLOW_TEMPLATE_CREATE_DISABLED",
        "Creating brand-new workflow templates is disabled in V1. Customize one of the seeded shipment-type templates instead."
      );
    } catch (error) {
      handleRouteError(res, error, "SHIPMENT_WORKFLOW_TEMPLATE_CREATE_FAILED", "Could not create shipment workflow template.");
    }
  });

  app.patch("/api/shipment-workflow-templates/:id", async (req, res) => {
    try {
      const tenantRequest = await requireWorkflowTemplateManager({ req, res, requireAuthenticatedTenantUser, requirePermission });
      if (!tenantRequest) return;
      const params = parseRequestValue(res, shipmentWorkflowTemplateParamsSchema, req.params);
      const body = parseRequestValue(res, shipmentWorkflowTemplateUpdateBodySchema, req.body || {});
      if (!params || !body) return;
      const result = await updateShipmentWorkflowTemplate(pool, {
        organizationId: tenantRequest.organizationId,
        templateId: params.id,
        actorUserId: tenantRequest.user.id,
        body,
      });
      await auditLog({
        actorUserId: tenantRequest.user.id,
        organizationId: tenantRequest.organizationId,
        action: "shipment_workflow_template.update",
        entityType: "shipment_workflow_template",
        entityId: result.templateId,
        summary: "Shipment workflow template metadata was updated.",
        before: { id: result.before.id, titleFa: result.before.titleFa, version: result.before.version },
        after: { id: result.after.id, titleFa: result.after.titleFa, version: result.after.version },
        metadata: { forkedFromSystemTemplate: result.forked },
        requestContext: requestContext(req),
      });
      res.json({ ok: true, data: result.after });
    } catch (error) {
      handleRouteError(res, error, "SHIPMENT_WORKFLOW_TEMPLATE_UPDATE_FAILED", "Could not update shipment workflow template.");
    }
  });

  app.post("/api/shipment-workflow-templates/:id/archive", async (req, res) => {
    try {
      const tenantRequest = await requireWorkflowTemplateManager({ req, res, requireAuthenticatedTenantUser, requirePermission });
      if (!tenantRequest) return;
      const params = parseRequestValue(res, shipmentWorkflowTemplateParamsSchema, req.params);
      const body = parseRequestValue(res, shipmentWorkflowTemplateArchiveBodySchema, req.body || {});
      if (!params || !body) return;
      const result = await archiveShipmentWorkflowTemplate(pool, {
        organizationId: tenantRequest.organizationId,
        templateId: params.id,
        actorUserId: tenantRequest.user.id,
        body,
      });
      await auditLog({
        actorUserId: tenantRequest.user.id,
        organizationId: tenantRequest.organizationId,
        action: "shipment_workflow_template.archive",
        entityType: "shipment_workflow_template",
        entityId: result.templateId,
        summary: "Shipment workflow template was archived.",
        before: { id: result.before.id, titleFa: result.before.titleFa, version: result.before.version },
        after: { id: result.after.id, archivedAt: result.after.archivedAt },
        requestContext: requestContext(req),
      });
      res.json({ ok: true, data: result.after });
    } catch (error) {
      handleRouteError(res, error, "SHIPMENT_WORKFLOW_TEMPLATE_ARCHIVE_FAILED", "Could not archive shipment workflow template.");
    }
  });

  app.delete("/api/shipment-workflow-templates/:id", async (req, res) => {
    try {
      const tenantRequest = await requireWorkflowTemplateManager({ req, res, requireAuthenticatedTenantUser, requirePermission });
      if (!tenantRequest) return;
      const params = parseRequestValue(res, shipmentWorkflowTemplateParamsSchema, req.params);
      if (!params) return;
      const result = await deleteShipmentWorkflowTemplate(pool, {
        organizationId: tenantRequest.organizationId,
        templateId: params.id,
      });
      await auditLog({
        actorUserId: tenantRequest.user.id,
        organizationId: tenantRequest.organizationId,
        action: "shipment_workflow_template.delete",
        entityType: "shipment_workflow_template",
        entityId: result.templateId,
        summary: "Unused shipment workflow template was deleted.",
        before: { id: result.before.id, titleFa: result.before.titleFa, version: result.before.version },
        requestContext: requestContext(req),
      });
      res.json({ ok: true, data: { id: result.templateId } });
    } catch (error) {
      handleRouteError(res, error, "SHIPMENT_WORKFLOW_TEMPLATE_DELETE_FAILED", "Could not delete shipment workflow template.");
    }
  });

  app.patch("/api/shipment-workflow-templates/:id/publish", async (req, res) => {
    try {
      const tenantRequest = await requireWorkflowTemplateManager({ req, res, requireAuthenticatedTenantUser, requirePermission });
      if (!tenantRequest) return;
      const params = parseRequestValue(res, shipmentWorkflowTemplateParamsSchema, req.params);
      const body = parseRequestValue(res, shipmentWorkflowTemplatePublishBodySchema, req.body || {});
      if (!params || !body) return;
      const result = await publishShipmentWorkflowTemplate(pool, {
        organizationId: tenantRequest.organizationId,
        templateId: params.id,
        actorUserId: tenantRequest.user.id,
        body,
      });
      await auditLog({
        actorUserId: tenantRequest.user.id,
        organizationId: tenantRequest.organizationId,
        action: "shipment_workflow_template.publish",
        entityType: "shipment_workflow_template",
        entityId: result.templateId,
        summary: "Shipment workflow template version was published.",
        before: { id: result.before.id, code: result.before.code, version: result.before.version },
        after: { id: result.after.id, code: result.after.code, version: result.after.version },
        metadata: { shipmentTypeCode: body.shipmentTypeCode || result.before.shipmentTypeHint || null },
        requestContext: requestContext(req),
      });
      res.json({ ok: true, data: result.after });
    } catch (error) {
      handleRouteError(res, error, "SHIPMENT_WORKFLOW_TEMPLATE_PUBLISH_FAILED", "Could not publish shipment workflow template.");
    }
  });

  app.post("/api/shipment-workflow-templates/:id/steps", async (req, res) => {
    try {
      const tenantRequest = await requireWorkflowTemplateManager({ req, res, requireAuthenticatedTenantUser, requirePermission });
      if (!tenantRequest) return;
      const params = parseRequestValue(res, shipmentWorkflowTemplateParamsSchema, req.params);
      const body = parseRequestValue(res, shipmentWorkflowTemplateStepCreateBodySchema, req.body || {});
      if (!params || !body) return;
      const result = await addShipmentWorkflowTemplateStep(pool, {
        organizationId: tenantRequest.organizationId,
        templateId: params.id,
        actorUserId: tenantRequest.user.id,
        body,
      });
      await auditLog({
        actorUserId: tenantRequest.user.id,
        organizationId: tenantRequest.organizationId,
        action: "shipment_workflow_template.step_add",
        entityType: "shipment_workflow_template",
        entityId: result.templateId,
        summary: "Shipment workflow template step was added.",
        after: { stepKey: result.step.stepKey, labelFa: result.step.labelFa },
        metadata: { forkedFromSystemTemplate: result.forked },
        requestContext: requestContext(req),
      });
      res.status(201).json({ ok: true, data: result.after });
    } catch (error) {
      handleRouteError(res, error, "SHIPMENT_WORKFLOW_TEMPLATE_STEP_CREATE_FAILED", "Could not add shipment workflow step.");
    }
  });

  app.post("/api/shipment-workflow-templates/:id/steps/from-catalog", async (req, res) => {
    try {
      const tenantRequest = await requireWorkflowTemplateManager({ req, res, requireAuthenticatedTenantUser, requirePermission });
      if (!tenantRequest) return;
      const params = parseRequestValue(res, shipmentWorkflowTemplateParamsSchema, req.params);
      const body = parseRequestValue(res, shipmentWorkflowTemplateStepsFromCatalogBodySchema, req.body || {});
      if (!params || !body) return;
      const result = await addShipmentWorkflowTemplateStepsFromCatalog(pool, {
        organizationId: tenantRequest.organizationId,
        templateId: params.id,
        actorUserId: tenantRequest.user.id,
        body,
      });
      await auditLog({
        actorUserId: tenantRequest.user.id,
        organizationId: tenantRequest.organizationId,
        action: "shipment_workflow_template.steps_add_from_catalog",
        entityType: "shipment_workflow_template",
        entityId: result.templateId,
        summary: "Shipment workflow template steps were added from the catalog.",
        after: { count: result.addedSteps.length, catalogStepIds: body.catalogStepIds },
        metadata: { forkedFromSystemTemplate: result.forked },
        requestContext: requestContext(req),
      });
      res.status(201).json({ ok: true, data: result.after });
    } catch (error) {
      handleRouteError(res, error, "SHIPMENT_WORKFLOW_TEMPLATE_CATALOG_STEP_ADD_FAILED", "Could not add catalog steps to shipment workflow template.");
    }
  });

  app.patch("/api/shipment-workflow-templates/:id/steps/:stepId", async (req, res) => {
    try {
      const tenantRequest = await requireWorkflowTemplateManager({ req, res, requireAuthenticatedTenantUser, requirePermission });
      if (!tenantRequest) return;
      const params = parseRequestValue(res, shipmentWorkflowTemplateStepParamsSchema, req.params);
      const body = parseRequestValue(res, shipmentWorkflowTemplateStepUpdateBodySchema, req.body || {});
      if (!params || !body) return;
      const result = await updateShipmentWorkflowTemplateStep(pool, {
        organizationId: tenantRequest.organizationId,
        templateId: params.id,
        stepId: params.stepId,
        actorUserId: tenantRequest.user.id,
        body,
      });
      await auditLog({
        actorUserId: tenantRequest.user.id,
        organizationId: tenantRequest.organizationId,
        action: "shipment_workflow_template.step_update",
        entityType: "shipment_workflow_template",
        entityId: result.templateId,
        summary: "Shipment workflow template step was updated.",
        metadata: { stepId: result.stepId, forkedFromSystemTemplate: result.forked },
        requestContext: requestContext(req),
      });
      res.json({ ok: true, data: result.after });
    } catch (error) {
      handleRouteError(res, error, "SHIPMENT_WORKFLOW_TEMPLATE_STEP_UPDATE_FAILED", "Could not update shipment workflow step.");
    }
  });

  app.delete("/api/shipment-workflow-templates/:id/steps/:stepId", async (req, res) => {
    try {
      const tenantRequest = await requireWorkflowTemplateManager({ req, res, requireAuthenticatedTenantUser, requirePermission });
      if (!tenantRequest) return;
      const params = parseRequestValue(res, shipmentWorkflowTemplateStepParamsSchema, req.params);
      if (!params) return;
      const result = await archiveShipmentWorkflowTemplateStep(pool, {
        organizationId: tenantRequest.organizationId,
        templateId: params.id,
        stepId: params.stepId,
        actorUserId: tenantRequest.user.id,
      });
      await auditLog({
        actorUserId: tenantRequest.user.id,
        organizationId: tenantRequest.organizationId,
        action: "shipment_workflow_template.step_archive",
        entityType: "shipment_workflow_template",
        entityId: result.templateId,
        summary: "Shipment workflow template step was archived.",
        before: { stepKey: result.step.stepKey, labelFa: result.step.labelFa },
        metadata: { forkedFromSystemTemplate: result.forked },
        requestContext: requestContext(req),
      });
      res.json({ ok: true, data: result.after });
    } catch (error) {
      handleRouteError(res, error, "SHIPMENT_WORKFLOW_TEMPLATE_STEP_ARCHIVE_FAILED", "Could not archive shipment workflow step.");
    }
  });

  app.patch("/api/shipment-types/:shipmentTypeCode/workflow-template", async (req, res) => {
    try {
      const tenantRequest = await requireWorkflowTemplateManager({ req, res, requireAuthenticatedTenantUser, requirePermission });
      if (!tenantRequest) return;
      const params = parseRequestValue(res, shipmentTypeWorkflowTemplateParamsSchema, req.params);
      const body = parseRequestValue(res, shipmentTypeWorkflowTemplateBodySchema, req.body || {});
      if (!params || !body) return;
      const data = await setShipmentTypeWorkflowTemplate(pool, {
        organizationId: tenantRequest.organizationId,
        shipmentTypeCode: params.shipmentTypeCode,
        templateId: body.templateId,
        actorUserId: tenantRequest.user.id,
      });
      await auditLog({
        actorUserId: tenantRequest.user.id,
        organizationId: tenantRequest.organizationId,
        action: "shipment_workflow_template.mapping_update",
        entityType: "shipment_type_workflow_template",
        entityId: params.shipmentTypeCode,
        summary: "Shipment type default workflow template was updated.",
        after: { shipmentTypeCode: data.shipmentTypeCode, templateId: data.template.id, version: data.template.version },
        requestContext: requestContext(req),
      });
      res.json({ ok: true, data });
    } catch (error) {
      handleRouteError(res, error, "SHIPMENT_WORKFLOW_TEMPLATE_MAPPING_FAILED", "Could not update shipment type workflow template.");
    }
  });
}
