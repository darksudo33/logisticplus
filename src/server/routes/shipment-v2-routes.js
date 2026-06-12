import {
  shipmentParamsSchema,
  shipmentV2CreateBodySchema,
  shipmentV2SectionParamsSchema,
  shipmentV2SectionPayloadSchemas,
} from "../request-schemas.js";
import { parseRequestValue } from "../validation.js";
import {
  createShipmentV2Record,
  getShipmentV2Profile,
  initializeShipmentV2Profile,
  shipmentV2AuditSnapshot,
  updateShipmentV2Section,
} from "../repositories/shipment-v2.js";

function isShipmentV2SchemaMissing(error) {
  return (
    error?.code === "42P01" ||
    error?.code === "42703" ||
    /shipment_v2_profiles/i.test(String(error?.message || ""))
  );
}

export function registerShipmentV2Routes(
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
    if (error.statusCode === 409) return createApiError(res, 409, error.code || "CONFLICT", error.message, "trackingNumber");
    if (error.statusCode === 400) return createApiError(res, 400, error.code || "VALIDATION_ERROR", error.message);
    if (isShipmentV2SchemaMissing(error)) {
      return createApiError(
        res,
        503,
        "SHIPMENT_V2_SCHEMA_NOT_READY",
        "Shipment Module V2 database migration has not been applied yet."
      );
    }
    console.error(fallbackCode, error);
    return createApiError(res, 500, fallbackCode, fallbackMessage);
  }

  app.post("/api/shipments/v2", async (req, res) => {
    try {
      const tenantRequest = await requireAuthenticatedTenantUser(req, res, "shipment v2 create API");
      if (!tenantRequest) return;
      const { user, organizationId } = tenantRequest;
      const permissions = await requirePermission(user, "shipments.create");
      const body = parseRequestValue(res, shipmentV2CreateBodySchema, req.body || {});
      if (!body) return;

      const data = await createShipmentV2Record(pool, {
        organizationId,
        ownerUserId: user.id,
        actorUserId: user.id,
        body,
        canUseExistingCode: user.role === "CEO" || permissions.includes("platform.admin"),
        includeCustomerPrivateDetails: user.role === "CEO",
      });

      await auditLog({
        actorUserId: user.id,
        organizationId,
        action: "shipment_v2.create",
        entityType: "SHIPMENT",
        entityId: data.shipment.id,
        summary: "Shipment Module V2 shipment was created.",
        after: shipmentV2AuditSnapshot(data),
        metadata: {
          flowCode: data.profile?.flowCode || body.flowCode,
          shipmentId: data.shipment.id,
        },
        requestContext: requestContext(req),
      });

      res.status(201).json({ ok: true, data });
    } catch (error) {
      handleRouteError(res, error, "SHIPMENT_V2_CREATE_FAILED", "Could not create Shipment Module V2 shipment.");
    }
  });

  app.get("/api/shipments/:id/v2-profile", async (req, res) => {
    try {
      const tenantRequest = await requireAuthenticatedTenantUser(req, res, "shipment v2 profile get API");
      if (!tenantRequest) return;
      const { user, organizationId } = tenantRequest;
      await requirePermission(user, "shipments.view_all");
      const params = parseRequestValue(res, shipmentParamsSchema, req.params);
      if (!params) return;

      const data = await getShipmentV2Profile(pool, {
        organizationId,
        shipmentId: params.id,
        includeCustomerPrivateDetails: user.role === "CEO",
      });
      if (!data) return createApiError(res, 404, "NOT_FOUND", "Shipment was not found.");
      res.json({ ok: true, data });
    } catch (error) {
      handleRouteError(res, error, "SHIPMENT_V2_GET_FAILED", "Could not load Shipment Module V2 profile.");
    }
  });

  app.post("/api/shipments/:id/v2-profile/init", async (req, res) => {
    try {
      const tenantRequest = await requireAuthenticatedTenantUser(req, res, "shipment v2 profile init API");
      if (!tenantRequest) return;
      const { user, organizationId } = tenantRequest;
      await requirePermission(user, "shipments.update");
      const params = parseRequestValue(res, shipmentParamsSchema, req.params);
      if (!params) return;

      const data = await initializeShipmentV2Profile(pool, {
        organizationId,
        shipmentId: params.id,
        actorUserId: user.id,
        includeCustomerPrivateDetails: user.role === "CEO",
      });
      if (!data) return createApiError(res, 404, "NOT_FOUND", "Shipment was not found.");

      await auditLog({
        actorUserId: user.id,
        organizationId,
        action: "shipment_v2.initialize",
        entityType: "SHIPMENT",
        entityId: params.id,
        summary: "Shipment Module V2 profile was initialized.",
        after: shipmentV2AuditSnapshot(data),
        metadata: {
          flowCode: data.profile?.flowCode || null,
          shipmentId: params.id,
        },
        requestContext: requestContext(req),
      });

      res.status(201).json({ ok: true, data });
    } catch (error) {
      handleRouteError(res, error, "SHIPMENT_V2_INIT_FAILED", "Could not initialize Shipment Module V2 profile.");
    }
  });

  app.patch("/api/shipments/:id/v2-profile/sections/:sectionKey", async (req, res) => {
    try {
      const tenantRequest = await requireAuthenticatedTenantUser(req, res, "shipment v2 section update API");
      if (!tenantRequest) return;
      const { user, organizationId } = tenantRequest;
      const permissions = await requirePermission(user, "shipments.update");
      const params = parseRequestValue(res, shipmentV2SectionParamsSchema, req.params);
      if (!params) return;
      const payloadSchema = shipmentV2SectionPayloadSchemas[params.sectionKey];
      const payload = parseRequestValue(res, payloadSchema, req.body || {});
      if (!payload) return;

      const result = await updateShipmentV2Section(pool, {
        organizationId,
        shipmentId: params.id,
        sectionKey: params.sectionKey,
        actorUserId: user.id,
        payload,
        canEditShipmentCode: user.role === "CEO" || permissions.includes("platform.admin"),
        includeCustomerPrivateDetails: user.role === "CEO",
      });
      if (!result) return createApiError(res, 404, "NOT_FOUND", "Shipment was not found.");

      await auditLog({
        actorUserId: user.id,
        organizationId,
        action: "shipment_v2.section_update",
        entityType: "SHIPMENT",
        entityId: params.id,
        summary: "Shipment Module V2 section was updated.",
        before: shipmentV2AuditSnapshot(result.before),
        after: shipmentV2AuditSnapshot(result.after),
        metadata: {
          changedSection: result.changedSection,
          shipmentId: params.id,
        },
        requestContext: requestContext(req),
      });

      res.json({ ok: true, data: result.after });
    } catch (error) {
      handleRouteError(res, error, "SHIPMENT_V2_SECTION_UPDATE_FAILED", "Could not update Shipment Module V2 section.");
    }
  });
}
