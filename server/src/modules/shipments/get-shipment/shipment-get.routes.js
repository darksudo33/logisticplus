import { parseRequestValue } from "../../../shared/middleware/validate.middleware.js";
import { shipmentParamsSchema } from "../shipment.validation.js";
import { getShipmentOperationalRecord } from "../shipment.repository.js";

export function registerShipmentGetRoutes(
  app,
  {
    createApiError,
    pool,
    requireAuthenticatedTenantUser,
    requirePermission,
  }
) {
  app.get("/api/shipments/:id", async (req, res) => {
    try {
      const tenantRequest = await requireAuthenticatedTenantUser(req, res, "shipment get API");
      if (!tenantRequest) return;
      const { user, organizationId } = tenantRequest;
      await requirePermission(user, "shipments.view_all");
      const params = parseRequestValue(res, shipmentParamsSchema, req.params);
      if (!params) return;
      const data = await getShipmentOperationalRecord(pool, params.id, {
        organizationId,
        includeCustomerPrivateDetails: user.role === "CEO",
      });
      if (!data) return createApiError(res, 404, "NOT_FOUND", "Shipment was not found.");
      res.json({ ok: true, data });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      console.error("Get shipment failed:", error);
      createApiError(res, 500, "GET_SHIPMENT_FAILED", "Could not load shipment.");
    }
  });
}
