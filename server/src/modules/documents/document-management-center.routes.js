import { documentManagementCenterSearchQuerySchema } from "./document.validation.js";
import { searchDocumentManagementShipments } from "./document-management-center.repository.js";
import { parseRequestValue } from "../../shared/middleware/validate.middleware.js";

function isDocumentManagementSchemaMissing(error) {
  return (
    error?.code === "42P01" ||
    error?.code === "42703" ||
    /shipment_v2_profiles|documents|shipments/i.test(String(error?.message || ""))
  );
}

export function registerDocumentManagementCenterRoutes(
  app,
  {
    createApiError,
    pool,
    requireAuthenticatedTenantUser,
    requirePermission,
  }
) {
  app.get("/api/documents/management-center/search", async (req, res) => {
    try {
      const tenantRequest = await requireAuthenticatedTenantUser(req, res, "document management center search API");
      if (!tenantRequest) return;
      const { user, organizationId } = tenantRequest;
      await requirePermission(user, "documents.view_all");
      await requirePermission(user, "shipments.view_all");
      const query = parseRequestValue(res, documentManagementCenterSearchQuerySchema, req.query || {});
      if (!query) return;

      const data = await searchDocumentManagementShipments(pool, {
        organizationId,
        query: query.query,
        limit: query.limit,
        includeCustomerPrivateDetails: user.role === "CEO",
      });
      res.json({ ok: true, data });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      if (isDocumentManagementSchemaMissing(error)) {
        return createApiError(
          res,
          503,
          "DOCUMENT_MANAGEMENT_SCHEMA_NOT_READY",
          "Document management center database schema has not been applied yet."
        );
      }
      console.error("Document management center search failed:", error);
      createApiError(res, 500, "DOCUMENT_MANAGEMENT_SEARCH_FAILED", "Could not search shipment documents.");
    }
  });
}
