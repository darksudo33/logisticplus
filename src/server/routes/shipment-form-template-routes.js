import {
  shipmentFormTemplateCreateBodySchema,
  shipmentFormTemplateFieldCreateBodySchema,
  shipmentFormTemplateFieldParamsSchema,
  shipmentFormTemplateFieldUpdateBodySchema,
  shipmentFormTemplateListQuerySchema,
  shipmentFormTemplateParamsSchema,
  shipmentFormTemplateUpdateBodySchema,
  shipmentParamsSchema,
} from "../request-schemas.js";
import { parseRequestValue } from "../validation.js";
import {
  addShipmentFormTemplateField,
  archiveShipmentFormTemplateField,
  createShipmentFormTemplate,
  getActiveShipmentFormTemplateForShipment,
  getShipmentFormTemplate,
  listShipmentFormTemplates,
  shipmentFormTemplateCatalog,
  updateShipmentFormTemplate,
  updateShipmentFormTemplateField,
} from "../repositories/shipment-form-templates.js";

function isTemplateSchemaMissing(error) {
  return (
    error?.code === "42P01" ||
    error?.code === "42703" ||
    /shipment_form_templates|shipment_form_template_sections|shipment_form_template_fields/i.test(String(error?.message || ""))
  );
}

async function requireShipmentTemplateReader({ req, res, requireAuthenticatedTenantUser, requirePermission }) {
  const tenantRequest = await requireAuthenticatedTenantUser(req, res, "shipment form template read API");
  if (!tenantRequest) return null;
  try {
    await requirePermission(tenantRequest.user, "shipments.view_all");
  } catch (error) {
    await requirePermission(tenantRequest.user, "shipments.create");
  }
  return tenantRequest;
}

async function requireShipmentTemplateManager({ req, res, requireAuthenticatedTenantUser, requirePermission }) {
  const tenantRequest = await requireAuthenticatedTenantUser(req, res, "shipment form template manage API");
  if (!tenantRequest) return null;
  await requirePermission(tenantRequest.user, "shipment_forms.manage");
  return tenantRequest;
}

export function registerShipmentFormTemplateRoutes(
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
    if (isTemplateSchemaMissing(error)) {
      return createApiError(
        res,
        503,
        "SHIPMENT_FORM_TEMPLATE_SCHEMA_NOT_READY",
        "Shipment form template migration has not been applied yet."
      );
    }
    console.error(fallbackCode, error);
    return createApiError(res, 500, fallbackCode, fallbackMessage);
  }

  app.get("/api/shipment-types", async (req, res) => {
    try {
      const tenantRequest = await requireShipmentTemplateReader({ req, res, requireAuthenticatedTenantUser, requirePermission });
      if (!tenantRequest) return;
      res.json({ ok: true, data: shipmentFormTemplateCatalog.shipmentTypes });
    } catch (error) {
      handleRouteError(res, error, "SHIPMENT_TYPES_FAILED", "Could not load shipment types.");
    }
  });

  app.get("/api/shipment-form-canonical-fields", async (req, res) => {
    try {
      const tenantRequest = await requireShipmentTemplateManager({ req, res, requireAuthenticatedTenantUser, requirePermission });
      if (!tenantRequest) return;
      res.json({ ok: true, data: shipmentFormTemplateCatalog.canonicalFields });
    } catch (error) {
      handleRouteError(res, error, "SHIPMENT_FORM_FIELDS_FAILED", "Could not load canonical shipment form fields.");
    }
  });

  app.get("/api/shipment-form-templates", async (req, res) => {
    try {
      const tenantRequest = await requireShipmentTemplateReader({ req, res, requireAuthenticatedTenantUser, requirePermission });
      if (!tenantRequest) return;
      const query = parseRequestValue(res, shipmentFormTemplateListQuerySchema, req.query || {});
      if (!query) return;
      const data = await listShipmentFormTemplates(pool, {
        organizationId: tenantRequest.organizationId,
        shipmentTypeCode: query.shipmentTypeCode,
      });
      res.json({ ok: true, data });
    } catch (error) {
      handleRouteError(res, error, "SHIPMENT_FORM_TEMPLATES_FAILED", "Could not load shipment form templates.");
    }
  });

  app.get("/api/shipment-form-templates/:id", async (req, res) => {
    try {
      const tenantRequest = await requireShipmentTemplateReader({ req, res, requireAuthenticatedTenantUser, requirePermission });
      if (!tenantRequest) return;
      const params = parseRequestValue(res, shipmentFormTemplateParamsSchema, req.params);
      if (!params) return;
      const data = await getShipmentFormTemplate(pool, {
        organizationId: tenantRequest.organizationId,
        templateId: params.id,
      });
      if (!data) return createApiError(res, 404, "NOT_FOUND", "Shipment form template was not found.");
      res.json({ ok: true, data });
    } catch (error) {
      handleRouteError(res, error, "SHIPMENT_FORM_TEMPLATE_FAILED", "Could not load shipment form template.");
    }
  });

  app.get("/api/shipments/:id/form-template", async (req, res) => {
    try {
      const tenantRequest = await requireShipmentTemplateReader({ req, res, requireAuthenticatedTenantUser, requirePermission });
      if (!tenantRequest) return;
      const params = parseRequestValue(res, shipmentParamsSchema, req.params);
      if (!params) return;
      const data = await getActiveShipmentFormTemplateForShipment(pool, {
        organizationId: tenantRequest.organizationId,
        shipmentId: params.id,
      });
      if (!data) return createApiError(res, 404, "NOT_FOUND", "Shipment was not found.");
      res.json({ ok: true, data });
    } catch (error) {
      handleRouteError(res, error, "SHIPMENT_ACTIVE_FORM_TEMPLATE_FAILED", "Could not load shipment form template.");
    }
  });

  app.post("/api/shipment-form-templates", async (req, res) => {
    try {
      const tenantRequest = await requireShipmentTemplateManager({ req, res, requireAuthenticatedTenantUser, requirePermission });
      if (!tenantRequest) return;
      const body = parseRequestValue(res, shipmentFormTemplateCreateBodySchema, req.body || {});
      if (!body) return;
      const data = await createShipmentFormTemplate(pool, {
        organizationId: tenantRequest.organizationId,
        actorUserId: tenantRequest.user.id,
        body,
      });
      await auditLog({
        actorUserId: tenantRequest.user.id,
        organizationId: tenantRequest.organizationId,
        action: "shipment_form_template.create",
        entityType: "shipment_form_template",
        entityId: data.id,
        summary: "Shipment form template was created.",
        after: { id: data.id, code: data.code, shipmentTypeCode: data.shipmentTypeCode, titleFa: data.titleFa },
        requestContext: requestContext(req),
      });
      res.status(201).json({ ok: true, data });
    } catch (error) {
      handleRouteError(res, error, "SHIPMENT_FORM_TEMPLATE_CREATE_FAILED", "Could not create shipment form template.");
    }
  });

  app.patch("/api/shipment-form-templates/:id", async (req, res) => {
    try {
      const tenantRequest = await requireShipmentTemplateManager({ req, res, requireAuthenticatedTenantUser, requirePermission });
      if (!tenantRequest) return;
      const params = parseRequestValue(res, shipmentFormTemplateParamsSchema, req.params);
      const body = parseRequestValue(res, shipmentFormTemplateUpdateBodySchema, req.body || {});
      if (!params || !body) return;
      const result = await updateShipmentFormTemplate(pool, {
        organizationId: tenantRequest.organizationId,
        templateId: params.id,
        actorUserId: tenantRequest.user.id,
        body,
      });
      await auditLog({
        actorUserId: tenantRequest.user.id,
        organizationId: tenantRequest.organizationId,
        action: "shipment_form_template.update",
        entityType: "shipment_form_template",
        entityId: result.templateId,
        summary: "Shipment form template was updated.",
        before: { id: result.before.id, titleFa: result.before.titleFa, version: result.before.version },
        after: { id: result.after.id, titleFa: result.after.titleFa, version: result.after.version },
        metadata: { forkedFromSystemTemplate: result.forked },
        requestContext: requestContext(req),
      });
      res.json({ ok: true, data: result.after });
    } catch (error) {
      handleRouteError(res, error, "SHIPMENT_FORM_TEMPLATE_UPDATE_FAILED", "Could not update shipment form template.");
    }
  });

  app.post("/api/shipment-form-templates/:id/fields", async (req, res) => {
    try {
      const tenantRequest = await requireShipmentTemplateManager({ req, res, requireAuthenticatedTenantUser, requirePermission });
      if (!tenantRequest) return;
      const params = parseRequestValue(res, shipmentFormTemplateParamsSchema, req.params);
      const body = parseRequestValue(res, shipmentFormTemplateFieldCreateBodySchema, req.body || {});
      if (!params || !body) return;
      const result = await addShipmentFormTemplateField(pool, {
        organizationId: tenantRequest.organizationId,
        templateId: params.id,
        actorUserId: tenantRequest.user.id,
        body,
      });
      await auditLog({
        actorUserId: tenantRequest.user.id,
        organizationId: tenantRequest.organizationId,
        action: "shipment_form_template.field_add",
        entityType: "shipment_form_template",
        entityId: result.templateId,
        summary: "Shipment form template field was added.",
        after: { fieldKey: result.field.fieldKey, labelFa: result.field.labelFa, fieldSource: result.field.fieldSource },
        metadata: { forkedFromSystemTemplate: result.forked },
        requestContext: requestContext(req),
      });
      res.status(201).json({ ok: true, data: result.after });
    } catch (error) {
      handleRouteError(res, error, "SHIPMENT_FORM_TEMPLATE_FIELD_CREATE_FAILED", "Could not add shipment form template field.");
    }
  });

  app.patch("/api/shipment-form-templates/:id/fields/:fieldId", async (req, res) => {
    try {
      const tenantRequest = await requireShipmentTemplateManager({ req, res, requireAuthenticatedTenantUser, requirePermission });
      if (!tenantRequest) return;
      const params = parseRequestValue(res, shipmentFormTemplateFieldParamsSchema, req.params);
      const body = parseRequestValue(res, shipmentFormTemplateFieldUpdateBodySchema, req.body || {});
      if (!params || !body) return;
      const result = await updateShipmentFormTemplateField(pool, {
        organizationId: tenantRequest.organizationId,
        templateId: params.id,
        fieldId: params.fieldId,
        actorUserId: tenantRequest.user.id,
        body,
      });
      await auditLog({
        actorUserId: tenantRequest.user.id,
        organizationId: tenantRequest.organizationId,
        action: "shipment_form_template.field_update",
        entityType: "shipment_form_template",
        entityId: result.templateId,
        summary: "Shipment form template field was updated.",
        metadata: { fieldId: result.fieldId, forkedFromSystemTemplate: result.forked },
        requestContext: requestContext(req),
      });
      res.json({ ok: true, data: result.after });
    } catch (error) {
      handleRouteError(res, error, "SHIPMENT_FORM_TEMPLATE_FIELD_UPDATE_FAILED", "Could not update shipment form template field.");
    }
  });

  app.delete("/api/shipment-form-templates/:id/fields/:fieldId", async (req, res) => {
    try {
      const tenantRequest = await requireShipmentTemplateManager({ req, res, requireAuthenticatedTenantUser, requirePermission });
      if (!tenantRequest) return;
      const params = parseRequestValue(res, shipmentFormTemplateFieldParamsSchema, req.params);
      if (!params) return;
      const result = await archiveShipmentFormTemplateField(pool, {
        organizationId: tenantRequest.organizationId,
        templateId: params.id,
        fieldId: params.fieldId,
        actorUserId: tenantRequest.user.id,
      });
      await auditLog({
        actorUserId: tenantRequest.user.id,
        organizationId: tenantRequest.organizationId,
        action: "shipment_form_template.field_archive",
        entityType: "shipment_form_template",
        entityId: result.templateId,
        summary: "Shipment form template field was archived.",
        before: { fieldKey: result.field.fieldKey, labelFa: result.field.labelFa },
        metadata: { forkedFromSystemTemplate: result.forked },
        requestContext: requestContext(req),
      });
      res.json({ ok: true, data: result.after });
    } catch (error) {
      handleRouteError(res, error, "SHIPMENT_FORM_TEMPLATE_FIELD_ARCHIVE_FAILED", "Could not archive shipment form template field.");
    }
  });
}
