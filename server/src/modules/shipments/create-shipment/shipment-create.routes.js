import { parseRequestValue } from "../../../shared/middleware/validate.middleware.js";
import { shipmentCreateBodySchema } from "../shipment.validation.js";
import { createShipment } from "./shipment-create.service.js";

export function registerShipmentCreateRoutes(
  app,
  {
    auditLog,
    createApiError,
    createShipmentRecord,
    requestContext,
    requireAuthenticatedTenantUser,
    requirePermission,
  }
) {
  app.post("/api/shipments", async (req, res) => {
    try {
      const tenantRequest = await requireAuthenticatedTenantUser(req, res, "shipment create API");
      if (!tenantRequest) return;
      const { user, tenantContext } = tenantRequest;
      await requirePermission(user, "shipments.create");
      const body = parseRequestValue(res, shipmentCreateBodySchema, req.body || {});
      if (!body) return;
      const data = await createShipment({
        createShipmentRecord,
        ownerUserId: user.id,
        actorUserId: user.id,
        tenantContext,
        shipment: body,
        includeCustomerPrivateDetails: user.role === "CEO",
      });
      await auditLog({
        actorUserId: user.id,
        action: "shipment.create",
        entityType: "SHIPMENT",
        entityId: data.id,
        summary: "Shipment was created.",
        after: data,
        requestContext: requestContext(req),
      });
      res.status(201).json({ ok: true, data });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      if (error.statusCode === 404) return createApiError(res, 404, error.code || "NOT_FOUND", error.message);
      if (error.statusCode === 409) return createApiError(res, 409, error.code || "CONFLICT", error.message, "trackingNumber");
      console.error("Create shipment failed:", error);
      createApiError(res, 500, "CREATE_SHIPMENT_FAILED", "Could not create shipment.");
    }
  });
}
