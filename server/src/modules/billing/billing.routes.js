export function registerBillingRoutes(
  app,
  {
    auditLog,
    createApiError,
    createBillingInvoice,
    getBillingInvoice,
    getOrganizationSubscription,
    listBillingInvoices,
    listBillingPayments,
    markBillingPaymentManually,
    requestContext,
    requireAuthenticatedUser,
    requirePlatformAdmin,
    voidBillingInvoice,
  }
) {
  app.get("/api/billing/my-subscription", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      res.json({ ok: true, data: await getOrganizationSubscription(user.organizationId) });
    } catch (error) {
      createApiError(res, 500, "MY_SUBSCRIPTION_FAILED", "Could not load subscription.");
    }
  });

  app.get("/api/billing/my-invoices", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      res.json({ ok: true, data: await listBillingInvoices({ organizationId: user.organizationId, limit: 50 }) });
    } catch (error) {
      createApiError(res, 500, "MY_INVOICES_FAILED", "Could not load invoices.");
    }
  });

  app.get("/api/billing/my-payments", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      res.json({ ok: true, data: await listBillingPayments({ organizationId: user.organizationId, limit: 50 }) });
    } catch (error) {
      createApiError(res, 500, "MY_PAYMENTS_FAILED", "Could not load payments.");
    }
  });

  app.get("/api/admin/payments", async (req, res) => {
    try {
      const user = await requirePlatformAdmin(req, res);
      if (!user) return;
      res.json({ ok: true, data: await listBillingPayments({ limit: req.query.limit || 100 }) });
    } catch (error) {
      createApiError(res, 500, "PAYMENTS_FAILED", "Could not load payments.");
    }
  });

  // Platform-admin boundary: organizationId filters below are privileged admin targeting
  // after requirePlatformAdmin, not tenant scope for normal protected APIs.
  app.get("/api/admin/billing/invoices", async (req, res) => {
    try {
      const user = await requirePlatformAdmin(req, res);
      if (!user) return;
      res.json({
        ok: true,
        data: await listBillingInvoices({
          organizationId: req.query.organizationId || undefined,
          status: req.query.status || undefined,
          limit: req.query.limit || 100,
        }),
      });
    } catch (error) {
      createApiError(res, 500, "INVOICES_FAILED", "Could not load invoices.");
    }
  });

  app.get("/api/admin/billing/invoices/:id", async (req, res) => {
    try {
      const user = await requirePlatformAdmin(req, res);
      if (!user) return;
      const data = await getBillingInvoice(req.params.id);
      if (!data) return createApiError(res, 404, "NOT_FOUND", "Invoice was not found.");
      res.json({ ok: true, data });
    } catch (error) {
      createApiError(res, 500, "INVOICE_FAILED", "Could not load invoice.");
    }
  });

  app.post("/api/admin/billing/invoices", async (req, res) => {
    try {
      const user = await requirePlatformAdmin(req, res);
      if (!user) return;
      if (!req.body?.organizationId || !Number(req.body?.amountIrr)) {
        return createApiError(res, 400, "VALIDATION_ERROR", "Organization and amount are required.");
      }
      const data = await createBillingInvoice({
        actorUserId: user.id,
        organizationId: req.body.organizationId,
        subscriptionId: req.body.subscriptionId,
        amountIrr: req.body.amountIrr,
        description: req.body.description,
        dueAt: req.body.dueAt,
        notes: req.body.notes,
      });
      await auditLog({
        actorUserId: user.id,
        action: "billing.invoice_issued",
        entityType: "billing_invoice",
        entityId: data.id,
        summary: "Invoice was issued.",
        after: data,
        requestContext: requestContext(req),
      });
      res.status(201).json({ ok: true, data });
    } catch (error) {
      createApiError(res, 500, "INVOICE_CREATE_FAILED", "Could not create invoice.");
    }
  });

  app.post("/api/admin/billing/invoices/:id/void", async (req, res) => {
    try {
      const user = await requirePlatformAdmin(req, res);
      if (!user) return;
      const data = await voidBillingInvoice(req.params.id, { actorUserId: user.id });
      if (!data) return createApiError(res, 404, "NOT_FOUND", "Invoice was not found.");
      await auditLog({
        actorUserId: user.id,
        action: "billing.invoice_voided",
        entityType: "billing_invoice",
        entityId: req.params.id,
        summary: "Invoice was voided.",
        after: data,
        requestContext: requestContext(req),
      });
      res.json({ ok: true, data });
    } catch (error) {
      createApiError(res, 500, "INVOICE_VOID_FAILED", "Could not void invoice.");
    }
  });

  app.post("/api/admin/billing/payments/:id/mark-paid", async (req, res) => {
    try {
      const user = await requirePlatformAdmin(req, res);
      if (!user) return;
      const data = await markBillingPaymentManually(req.params.id, {
        actorUserId: user.id,
        status: "paid",
        note: req.body?.note,
        audit: {
          actorUserId: user.id,
          action: "billing.payment_manual_paid",
          entityType: "billing_payment",
          entityId: req.params.id,
          summary: "Payment was manually marked paid.",
          requestContext: requestContext(req),
        },
      });
      if (!data) return createApiError(res, 404, "NOT_FOUND", "Payment was not found.");
      res.json({ ok: true, data });
    } catch (error) {
      createApiError(res, 500, "PAYMENT_MARK_PAID_FAILED", "Could not mark payment paid.");
    }
  });

  app.post("/api/admin/billing/payments/:id/mark-failed", async (req, res) => {
    try {
      const user = await requirePlatformAdmin(req, res);
      if (!user) return;
      const data = await markBillingPaymentManually(req.params.id, {
        actorUserId: user.id,
        status: "failed",
        note: req.body?.note,
        audit: {
          actorUserId: user.id,
          action: "billing.payment_manual_failed",
          entityType: "billing_payment",
          entityId: req.params.id,
          summary: "Payment was manually marked failed.",
          requestContext: requestContext(req),
        },
      });
      if (!data) return createApiError(res, 404, "NOT_FOUND", "Payment was not found.");
      res.json({ ok: true, data });
    } catch (error) {
      createApiError(res, 500, "PAYMENT_MARK_FAILED_FAILED", "Could not mark payment failed.");
    }
  });
}
