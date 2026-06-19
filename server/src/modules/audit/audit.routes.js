export function registerAuditRoutes(app, deps) {
  const {
    createApiError,
    listAuditLogs,
    requireAuthenticatedTenantUser,
    requirePermission,
    requirePlatformAdmin,
  } = deps;

  app.get("/api/audit-logs", async (req, res) => {
    try {
      const tenantRequest = await requireAuthenticatedTenantUser(req, res, "audit log list API");
      if (!tenantRequest) return;
      const { user, organizationId } = tenantRequest;
      await requirePermission(user, "changes.view");
      const data = await listAuditLogs({
        organizationId,
        limit: req.query.limit,
        eventType: req.query.eventType || undefined,
        resourceType: req.query.resourceType || undefined,
        resourceId: req.query.resourceId || undefined,
      });
      res.json({ ok: true, data });
    } catch (error) {
      if (error.statusCode === 403) {
        return createApiError(res, 403, "FORBIDDEN", error.message);
      }
      console.error("List audit logs failed:", error);
      createApiError(res, 500, "LIST_AUDIT_LOGS_FAILED", "Could not load audit logs.");
    }
  });

  app.get("/api/admin/audit-logs", async (req, res) => {
    try {
      const admin = await requirePlatformAdmin(req, res);
      if (!admin) return;
      const data = await listAuditLogs({
        organizationId: req.query.organizationId === undefined ? undefined : String(req.query.organizationId || ""),
        actorUserId: req.query.actorUserId || undefined,
        eventType: req.query.eventType || undefined,
        resourceType: req.query.resourceType || undefined,
        resourceId: req.query.resourceId || undefined,
        limit: req.query.limit,
      });
      res.json({ ok: true, data });
    } catch (error) {
      if (error.statusCode === 403) {
        return createApiError(res, 403, "FORBIDDEN", error.message);
      }
      console.error("List platform audit logs failed:", error);
      createApiError(res, 500, "LIST_PLATFORM_AUDIT_LOGS_FAILED", "Could not load platform audit logs.");
    }
  });
}
