import { registerQuotationReadRoutes } from "./quotation-read.routes.js";

export function registerQuotationRoutes(
  app,
  {
    auditLog,
    convertQuotationToShipment,
    createApiError,
    createQuotationRecord,
    getQuotationRecord,
    listQuotations,
    requestContext,
    requireAuthenticatedTenantUser,
    requirePermission,
    setQuotationStatus,
    updateQuotationRecord,
  }
) {
  registerQuotationReadRoutes(app, {
    createApiError,
    getQuotationRecord,
    listQuotations,
    requireAuthenticatedTenantUser,
    requirePermission,
  });

  app.post("/api/quotations", async (req, res) => {
    try {
      const tenantRequest = await requireAuthenticatedTenantUser(req, res, "quotation create API");
      if (!tenantRequest) return;
      const { user, tenantContext } = tenantRequest;
      await requirePermission(user, "quotations.manage");
      if (!req.body?.customerName) return createApiError(res, 400, "VALIDATION_FAILED", "Customer name is required.", "customerName");
      const created = await createQuotationRecord({
        ownerUserId: user.id,
        actorUserId: user.id,
        tenantContext,
        quote: req.body,
        includeCustomerPrivateDetails: user.role === "CEO",
      });
      await auditLog({
        actorUserId: user.id,
        action: "quotation.create",
        entityType: "quotation",
        entityId: created.id,
        summary: "Quotation was created.",
        after: created,
        requestContext: requestContext(req),
      });
      res.status(201).json({ ok: true, data: created });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      if (error.code === "23505") return createApiError(res, 409, "DUPLICATE_QUOTATION", "Quotation number already exists.");
      console.error("Create quotation failed:", error);
      createApiError(res, 500, "QUOTATION_CREATE_FAILED", "Could not create quotation.");
    }
  });

  app.patch("/api/quotations/:id", async (req, res) => {
    try {
      const tenantRequest = await requireAuthenticatedTenantUser(req, res, "quotation update API");
      if (!tenantRequest) return;
      const { user, organizationId } = tenantRequest;
      await requirePermission(user, "quotations.manage");
      const result = await updateQuotationRecord(req.params.id, req.body || {}, {
        organizationId,
        includeCustomerPrivateDetails: user.role === "CEO",
      });
      if (!result.after) return createApiError(res, 404, "NOT_FOUND", "Quotation was not found.");
      await auditLog({
        actorUserId: user.id,
        action: "quotation.update",
        entityType: "quotation",
        entityId: req.params.id,
        summary: "Quotation was updated.",
        before: result.before,
        after: result.after,
        requestContext: requestContext(req),
      });
      res.json({ ok: true, data: result.after });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      createApiError(res, 500, "QUOTATION_UPDATE_FAILED", "Could not update quotation.");
    }
  });

  for (const [pathName, status] of Object.entries({ accept: "ACCEPTED", reject: "REJECTED", expire: "EXPIRED", archive: "ARCHIVED" })) {
    app.post(`/api/quotations/:id/${pathName}`, async (req, res) => {
      try {
        const tenantRequest = await requireAuthenticatedTenantUser(req, res, `quotation ${pathName} API`);
        if (!tenantRequest) return;
        const { user, organizationId } = tenantRequest;
        await requirePermission(user, "quotations.manage");
        const result = await setQuotationStatus(req.params.id, status, req.body || {}, {
          organizationId,
          includeCustomerPrivateDetails: user.role === "CEO",
        });
        if (!result.after) return createApiError(res, 404, "NOT_FOUND", "Quotation was not found.");
        await auditLog({
          actorUserId: user.id,
          action: `quotation.${pathName}`,
          entityType: "quotation",
          entityId: req.params.id,
          summary: `Quotation was ${pathName}ed.`,
          before: result.before,
          after: result.after,
          requestContext: requestContext(req),
        });
        res.json({ ok: true, data: result.after });
      } catch (error) {
        if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
        createApiError(res, 500, "QUOTATION_STATUS_FAILED", "Could not update quotation status.");
      }
    });
  }

  app.post("/api/quotations/:id/convert-to-shipment", async (req, res) => {
    try {
      const tenantRequest = await requireAuthenticatedTenantUser(req, res, "quotation convert API");
      if (!tenantRequest) return;
      const { user, organizationId } = tenantRequest;
      await requirePermission(user, "quotations.manage");
      const result = await convertQuotationToShipment(req.params.id, user.id, {
        organizationId,
        includeCustomerPrivateDetails: user.role === "CEO",
      });
      if (!result) return createApiError(res, 404, "NOT_FOUND", "Quotation was not found.");
      await auditLog({
        actorUserId: user.id,
        action: "quotation.convert_to_shipment",
        entityType: "quotation",
        entityId: req.params.id,
        summary: "Quotation was converted to shipment.",
        after: result,
        requestContext: requestContext(req),
      });
      res.json({ ok: true, data: result });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      console.error("Convert quotation failed:", error);
      createApiError(res, 500, "QUOTATION_CONVERT_FAILED", "Could not convert quotation.");
    }
  });
}
