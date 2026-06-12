export function registerChequeReadRoutes(
  app,
  {
    createApiError,
    getChequeRecord,
    listCheques,
    listDueSoonCheques,
    requireAuthenticatedTenantUser,
    requirePermission,
  }
) {
  app.get("/api/cheques/due-soon", async (req, res) => {
    try {
      const tenantRequest = await requireAuthenticatedTenantUser(req, res, "due cheques API");
      if (!tenantRequest) return;
      const { user, organizationId } = tenantRequest;
      await requirePermission(user, "cheques.manage");
      const data = await listDueSoonCheques({
        organizationId,
        ownerUserId: user.id,
        days: req.query.days || 7,
      });
      res.json({ ok: true, data });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      console.error("List due soon cheques failed:", error);
      createApiError(res, 500, "LIST_DUE_CHEQUES_FAILED", "Could not load due cheques.");
    }
  });

  app.get("/api/cheques", async (req, res) => {
    try {
      const tenantRequest = await requireAuthenticatedTenantUser(req, res, "cheques list API");
      if (!tenantRequest) return;
      const { user, organizationId } = tenantRequest;
      await requirePermission(user, "cheques.manage");
      const data = await listCheques({
        organizationId,
        ownerUserId: user.id,
        includeArchived: req.query.includeArchived === "true",
      });
      res.json({ ok: true, data });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      console.error("List cheques failed:", error);
      createApiError(res, 500, "LIST_CHEQUES_FAILED", "Could not load cheques.");
    }
  });

  app.get("/api/cheques/:id", async (req, res) => {
    try {
      const tenantRequest = await requireAuthenticatedTenantUser(req, res, "cheque get API");
      if (!tenantRequest) return;
      const { user, organizationId } = tenantRequest;
      await requirePermission(user, "cheques.manage");
      const data = await getChequeRecord(req.params.id, { organizationId });
      if (!data) return createApiError(res, 404, "NOT_FOUND", "Cheque was not found.");
      res.json({ ok: true, data });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      console.error("Get cheque failed:", error);
      createApiError(res, 500, "GET_CHEQUE_FAILED", "Could not load cheque.");
    }
  });
}
