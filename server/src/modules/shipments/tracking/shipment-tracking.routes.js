import { parseRequestValue } from "../../../shared/middleware/validate.middleware.js";
import {
  shipmentParamsSchema,
  shipmentPublicStatusBodySchema,
} from "../shipment.validation.js";

export function registerShipmentTrackingRoutes(
  app,
  {
    auditLog,
    createApiError,
    disableShipmentCustomerAccess,
    generateShipmentCustomerAccess,
    getShipmentCustomerAccess,
    publicTrackLink,
    requestContext,
    requireAuthenticatedUser,
    requirePermission,
    updateShipmentPublicStatus,
  }
) {
  app.get("/api/shipments/:id/customer-access", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      await requirePermission(user, "customer_access.manage");
      const params = parseRequestValue(res, shipmentParamsSchema, req.params);
      if (!params) return;
      const data = await getShipmentCustomerAccess(params.id, { organizationId: user.organizationId, ownerUserId: user.id });
      if (!data) return createApiError(res, 404, "NOT_FOUND", "Shipment was not found.");
      res.json({
        ok: true,
        data: data.token
          ? { ...data, url: publicTrackLink(req, data.token) }
          : data,
      });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      console.error("Get customer access failed:", error);
      createApiError(res, 500, "CUSTOMER_ACCESS_FAILED", "Could not load customer access.");
    }
  });

  app.post("/api/shipments/:id/customer-access/generate", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      await requirePermission(user, "customer_access.manage");
      const params = parseRequestValue(res, shipmentParamsSchema, req.params);
      if (!params) return;
      const result = await generateShipmentCustomerAccess(params.id, {
        organizationId: user.organizationId,
        ownerUserId: user.id,
        rotate: false,
        audit: {
          actorUserId: user.id,
          action: "customer_access.generate",
          entityType: "SHIPMENT",
          entityId: params.id,
          summary: "Customer tracking access was generated.",
          requestContext: requestContext(req),
        },
      });
      if (!result) return createApiError(res, 404, "NOT_FOUND", "Shipment was not found.");
      res.json({
        ok: true,
        data: {
          ...result.after,
          token: result.token,
          url: publicTrackLink(req, result.token),
        },
      });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      console.error("Generate customer access failed:", error);
      createApiError(res, 500, "CUSTOMER_ACCESS_GENERATE_FAILED", "Could not generate customer access.");
    }
  });

  app.post("/api/shipments/:id/customer-access/reset", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      await requirePermission(user, "customer_access.manage");
      const params = parseRequestValue(res, shipmentParamsSchema, req.params);
      if (!params) return;
      const result = await generateShipmentCustomerAccess(params.id, {
        organizationId: user.organizationId,
        ownerUserId: user.id,
        audit: {
          actorUserId: user.id,
          action: "customer_access.reset",
          entityType: "SHIPMENT",
          entityId: params.id,
          summary: "Customer tracking access was reset.",
          requestContext: requestContext(req),
        },
      });
      if (!result) return createApiError(res, 404, "NOT_FOUND", "Shipment was not found.");
      res.json({
        ok: true,
        data: {
          ...result.after,
          token: result.token,
          url: publicTrackLink(req, result.token),
        },
      });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      console.error("Reset customer access failed:", error);
      createApiError(res, 500, "CUSTOMER_ACCESS_RESET_FAILED", "Could not reset customer access.");
    }
  });

  app.post("/api/shipments/:id/customer-access/disable", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      await requirePermission(user, "customer_access.manage");
      const params = parseRequestValue(res, shipmentParamsSchema, req.params);
      if (!params) return;
      const result = await disableShipmentCustomerAccess(params.id, {
        organizationId: user.organizationId,
        ownerUserId: user.id,
        audit: {
          actorUserId: user.id,
          action: "customer_access.disable",
          entityType: "SHIPMENT",
          entityId: params.id,
          summary: "Customer tracking access was disabled.",
          requestContext: requestContext(req),
        },
      });
      if (!result) return createApiError(res, 404, "NOT_FOUND", "Shipment was not found.");
      res.json({ ok: true, data: result.after });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      console.error("Disable customer access failed:", error);
      createApiError(res, 500, "CUSTOMER_ACCESS_DISABLE_FAILED", "Could not disable customer access.");
    }
  });

  app.patch("/api/shipments/:id/public-status", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      await requirePermission(user, "customer_access.manage");
      const params = parseRequestValue(res, shipmentParamsSchema, req.params);
      if (!params) return;
      const body = parseRequestValue(res, shipmentPublicStatusBodySchema, req.body || {});
      if (!body) return;
      const event = await updateShipmentPublicStatus({
        shipmentId: params.id,
        publicLabel: body.publicLabel,
        publicDescription: body.publicDescription || "",
        isCustomerVisible: body.isCustomerVisible !== false,
        createdById: user.id,
        organizationId: user.organizationId,
        ownerUserId: user.id,
      });
      if (!event) return createApiError(res, 404, "NOT_FOUND", "Shipment was not found.");
      await auditLog({
        actorUserId: user.id,
        action: "shipment.public_status.update",
        entityType: "SHIPMENT",
        entityId: params.id,
        summary: "Public shipment status was updated.",
        after: event,
        requestContext: requestContext(req),
      });
      res.json({ ok: true, data: event });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      console.error("Public status update failed:", error);
      createApiError(res, 500, "PUBLIC_STATUS_UPDATE_FAILED", "Could not update public status.");
    }
  });
}
