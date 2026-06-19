import { parseRequestValue } from "../../../shared/middleware/validate.middleware.js";
import {
  exitedShipmentArchiveBodySchema,
  exitedShipmentsListQuerySchema,
  postExitUpdateBodySchema,
  shipmentParamsSchema,
} from "../shipment.validation.js";
import { listExitedShipmentRecords } from "../shipment.repository.js";

export function registerShipmentArchiveRoutes(
  app,
  {
    auditLog,
    createApiError,
    moveShipmentToExitedArchive,
    pool,
    requestContext,
    requireAuthenticatedTenantUser,
    requirePermission,
    restoreShipmentFromExitedArchive,
    updateShipmentPostExitFields,
  }
) {
  app.get("/api/shipments/exited", async (req, res) => {
    try {
      const tenantRequest = await requireAuthenticatedTenantUser(req, res, "exited shipments list API");
      if (!tenantRequest) return;
      const { user, organizationId } = tenantRequest;
      await requirePermission(user, "shipments.view_all");
      const query = parseRequestValue(res, exitedShipmentsListQuerySchema, req.query || {});
      if (!query) return;
      const data = await listExitedShipmentRecords(pool, {
        organizationId,
        filters: query,
      });
      res.json({ ok: true, data });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      console.error("List exited shipments failed:", error);
      createApiError(res, 500, "EXITED_SHIPMENTS_LIST_FAILED", "Could not load exited shipments.");
    }
  });

  app.post("/api/shipments/:id/exited-archive", async (req, res) => {
    try {
      const tenantRequest = await requireAuthenticatedTenantUser(req, res, "exited shipment archive API");
      if (!tenantRequest) return;
      const { user, organizationId } = tenantRequest;
      await requirePermission(user, "shipments.archive");
      const params = parseRequestValue(res, shipmentParamsSchema, req.params);
      if (!params) return;
      const body = parseRequestValue(res, exitedShipmentArchiveBodySchema, req.body || {});
      if (!body) return;
      const result = await moveShipmentToExitedArchive(params.id, {
        organizationId,
        actorUserId: user.id,
        reason: body.reason,
      });
      if (!result) return createApiError(res, 404, "NOT_FOUND", "Shipment was not found.");
      await auditLog({
        actorUserId: user.id,
        organizationId,
        action: "shipment.exited_archive",
        entityType: "SHIPMENT",
        entityId: params.id,
        summary: "Shipment was moved to exited archive.",
        before: result.before,
        after: result.after,
        metadata: {
          reason: body.reason || null,
          previousPostExitStatus: result.before?.postExitStatus || null,
          newPostExitStatus: result.after?.postExitStatus || null,
        },
        requestContext: requestContext(req),
      });
      res.json({ ok: true, data: result.after });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      console.error("Move shipment to exited archive failed:", error);
      createApiError(res, 500, "EXITED_SHIPMENT_ARCHIVE_FAILED", "Could not move shipment to exited archive.");
    }
  });

  app.post("/api/shipments/:id/exited-restore", async (req, res) => {
    try {
      const tenantRequest = await requireAuthenticatedTenantUser(req, res, "exited shipment restore API");
      if (!tenantRequest) return;
      const { user, organizationId } = tenantRequest;
      await requirePermission(user, "shipments.archive");
      const params = parseRequestValue(res, shipmentParamsSchema, req.params);
      if (!params) return;
      const result = await restoreShipmentFromExitedArchive(params.id, {
        organizationId,
        actorUserId: user.id,
      });
      if (!result) return createApiError(res, 404, "NOT_FOUND", "Shipment was not found.");
      await auditLog({
        actorUserId: user.id,
        organizationId,
        action: "shipment.exited_restore",
        entityType: "SHIPMENT",
        entityId: params.id,
        summary: "Shipment was restored from exited archive.",
        before: result.before,
        after: result.after,
        metadata: {
          previousPostExitStatus: result.before?.postExitStatus || null,
          newPostExitStatus: result.after?.postExitStatus || null,
        },
        requestContext: requestContext(req),
      });
      res.json({ ok: true, data: result.after });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      console.error("Restore exited shipment failed:", error);
      createApiError(res, 500, "EXITED_SHIPMENT_RESTORE_FAILED", "Could not restore shipment from exited archive.");
    }
  });

  app.patch("/api/shipments/:id/post-exit", async (req, res) => {
    try {
      const tenantRequest = await requireAuthenticatedTenantUser(req, res, "shipment post-exit update API");
      if (!tenantRequest) return;
      const { user, organizationId } = tenantRequest;
      await requirePermission(user, "shipments.update");
      const params = parseRequestValue(res, shipmentParamsSchema, req.params);
      if (!params) return;
      const body = parseRequestValue(res, postExitUpdateBodySchema, req.body || {});
      if (!body) return;
      const result = await updateShipmentPostExitFields(params.id, body, {
        organizationId,
        actorUserId: user.id,
      });
      if (!result) return createApiError(res, 404, "NOT_FOUND", "Shipment was not found.");
      await auditLog({
        actorUserId: user.id,
        organizationId,
        action: "shipment.post_exit_update",
        entityType: "SHIPMENT",
        entityId: params.id,
        summary: "Shipment post-exit follow-up was updated.",
        before: result.before,
        after: result.after,
        metadata: {
          previousPostExitStatus: result.before?.postExitStatus || null,
          newPostExitStatus: result.after?.postExitStatus || null,
          noteUpdated: body.postExitNote !== undefined,
          followUpUpdated: body.postExitFollowUpAt !== undefined,
        },
        requestContext: requestContext(req),
      });
      res.json({ ok: true, data: result.after });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      if (error.statusCode === 404) return createApiError(res, 404, error.code || "NOT_FOUND", error.message);
      if (error.statusCode === 409) return createApiError(res, 409, error.code || "CONFLICT", error.message);
      console.error("Update shipment post-exit fields failed:", error);
      createApiError(res, 500, "SHIPMENT_POST_EXIT_UPDATE_FAILED", "Could not update post-exit follow-up.");
    }
  });
}
