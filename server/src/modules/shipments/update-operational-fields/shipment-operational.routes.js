import { parseRequestValue } from "../../../shared/middleware/validate.middleware.js";
import {
  shipmentOperationalFieldsBodySchema,
  shipmentParamsSchema,
} from "../shipment.validation.js";

export function registerShipmentOperationalRoutes(
  app,
  {
    auditLog,
    createApiError,
    requestContext,
    requireAuthenticatedTenantUser,
    requirePermission,
    updateShipmentOperationalFields,
  }
) {
  async function updateShipmentOperationalEndpoint(req, res) {
    try {
      const tenantRequest = await requireAuthenticatedTenantUser(req, res, "shipment operational update API");
      if (!tenantRequest) return;
      const { user, organizationId } = tenantRequest;
      await requirePermission(user, "shipments.update");
      const params = parseRequestValue(res, shipmentParamsSchema, req.params);
      if (!params) return;
      const body = parseRequestValue(res, shipmentOperationalFieldsBodySchema, req.body || {});
      if (!body) return;
      const result = await updateShipmentOperationalFields(params.id, body, {
        organizationId,
        actorUserId: user.id,
        includeCustomerPrivateDetails: user.role === "CEO",
      });
      if (!result) return createApiError(res, 404, "NOT_FOUND", "Shipment was not found.");
      await auditLog({
        actorUserId: user.id,
        action: body.status && body.status !== result.before?.status ? "shipment.status.update" : "shipment.update",
        entityType: "SHIPMENT",
        entityId: params.id,
        summary: "Shipment operational fields were updated.",
        before: result.before,
        after: result.after,
        requestContext: requestContext(req),
      });
      res.json({ ok: true, data: result.after });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      if (error.statusCode === 404) return createApiError(res, 404, error.code || "NOT_FOUND", error.message);
      if (error.statusCode === 409) return createApiError(res, 409, error.code || "CONFLICT", error.message, "trackingNumber");
      console.error("Update shipment failed:", error);
      createApiError(res, 500, "UPDATE_SHIPMENT_FAILED", "Could not update shipment.");
    }
  }

  app.patch("/api/shipments/:id/operational-fields", updateShipmentOperationalEndpoint);
  app.patch("/api/shipments/:id", updateShipmentOperationalEndpoint);
}
