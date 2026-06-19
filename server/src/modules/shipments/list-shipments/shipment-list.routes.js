import { listShipments } from "./shipment-list.repository.js";

export function registerShipmentListRoutes(
  app,
  {
    createApiError,
    pool,
    requireAuthenticatedTenantUser,
    requirePermission,
  }
) {
  app.get("/api/shipments", async (req, res) => {
    try {
      const tenantRequest = await requireAuthenticatedTenantUser(req, res, "shipments list API");
      if (!tenantRequest) return;
      const { user, organizationId } = tenantRequest;
      await requirePermission(user, "shipments.view_all");
      const data = await listShipments(pool, {
        organizationId,
        includeCustomerPrivateDetails: user.role === "CEO",
      });
      res.json({ ok: true, data });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      console.error("List shipments failed:", error);
      createApiError(res, 500, "LIST_FAILED", "Could not load shipments.");
    }
  });
}
