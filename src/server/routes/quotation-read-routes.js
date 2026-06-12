export function registerQuotationReadRoutes(
  app,
  {
    createApiError,
    getQuotationRecord,
    listQuotations,
    requireAuthenticatedTenantUser,
    requirePermission,
  }
) {
  app.get("/api/quotations", async (req, res) => {
    try {
      const tenantRequest = await requireAuthenticatedTenantUser(req, res, "quotations list API");
      if (!tenantRequest) return;
      const { user, organizationId } = tenantRequest;
      await requirePermission(user, "quotations.manage");
      const data = await listQuotations({
        organizationId,
        includeArchived: req.query.includeArchived === "true",
        includeCustomerPrivateDetails: user.role === "CEO",
      });
      res.json({ ok: true, data });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      console.error("List quotations failed:", error);
      createApiError(res, 500, "QUOTATIONS_LIST_FAILED", "Could not load quotations.");
    }
  });

  app.get("/api/quotations/:id", async (req, res) => {
    try {
      const tenantRequest = await requireAuthenticatedTenantUser(req, res, "quotation get API");
      if (!tenantRequest) return;
      const { user, organizationId } = tenantRequest;
      await requirePermission(user, "quotations.manage");
      const data = await getQuotationRecord(req.params.id, {
        organizationId,
        includeCustomerPrivateDetails: user.role === "CEO",
      });
      if (!data) return createApiError(res, 404, "NOT_FOUND", "Quotation was not found.");
      res.json({ ok: true, data });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      createApiError(res, 500, "QUOTATION_GET_FAILED", "Could not load quotation.");
    }
  });
}
