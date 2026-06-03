import {
  dailyStatusListQuerySchema,
  dailyStatusParamsSchema,
  dailyStatusPatchBodySchema,
} from "../request-schemas.js";
import { parseRequestValue } from "../validation.js";
import {
  dailyStatusAuditSnapshot,
  getDailyStatusBoardRow,
  getDailyStatusBoardRows,
  updateDailyStatusRow,
} from "../repositories/daily-status.js";

function isDailyStatusSchemaMissing(error) {
  return (
    error?.code === "42P01" ||
    error?.code === "42703" ||
    /shipment_kootaj_details/i.test(String(error?.message || ""))
  );
}

export function registerDailyStatusRoutes(
  app,
  {
    auditLog,
    createApiError,
    pool,
    requestContext,
    requireAuthenticatedTenantUser,
    requirePermission,
  }
) {
  async function handleList(req, res) {
    try {
      const tenantRequest = await requireAuthenticatedTenantUser(req, res, "daily status list API");
      if (!tenantRequest) return;
      const { user, organizationId } = tenantRequest;
      await requirePermission(user, "shipments.view_all");
      const query = parseRequestValue(res, dailyStatusListQuerySchema, req.query || {});
      if (!query) return;
      const data = await getDailyStatusBoardRows(pool, {
        organizationId,
        filters: query,
      });
      res.json({ ok: true, data });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      if (isDailyStatusSchemaMissing(error)) {
        return createApiError(
          res,
          503,
          "DAILY_STATUS_SCHEMA_NOT_READY",
          "Daily status database migration has not been applied yet."
        );
      }
      console.error("List daily status failed:", error);
      createApiError(res, 500, "DAILY_STATUS_LIST_FAILED", "Could not load daily status board.");
    }
  }

  async function handleShipmentDetailGet(req, res) {
    try {
      const tenantRequest = await requireAuthenticatedTenantUser(req, res, "shipment daily status API");
      if (!tenantRequest) return;
      const { user, organizationId } = tenantRequest;
      await requirePermission(user, "shipments.view_all");
      const params = parseRequestValue(res, dailyStatusParamsSchema, req.params);
      if (!params) return;
      const data = await getDailyStatusBoardRow(pool, {
        organizationId,
        shipmentId: params.shipmentId,
      });
      if (!data) return createApiError(res, 404, "NOT_FOUND", "Shipment was not found.");
      res.json({ ok: true, data });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      if (isDailyStatusSchemaMissing(error)) {
        return createApiError(
          res,
          503,
          "DAILY_STATUS_SCHEMA_NOT_READY",
          "Daily status database migration has not been applied yet."
        );
      }
      console.error("Get shipment daily status failed:", error);
      createApiError(res, 500, "DAILY_STATUS_GET_FAILED", "Could not load shipment daily status.");
    }
  }

  function createPatchHandler(auditSource, summary) {
    return async function handlePatch(req, res) {
      try {
        const tenantRequest = await requireAuthenticatedTenantUser(req, res, "daily status update API");
        if (!tenantRequest) return;
        const { user, organizationId } = tenantRequest;
        await requirePermission(user, "shipments.update");
        const params = parseRequestValue(res, dailyStatusParamsSchema, req.params);
        if (!params) return;
        const body = parseRequestValue(res, dailyStatusPatchBodySchema, req.body || {});
        if (!body) return;

        const result = await updateDailyStatusRow(pool, {
          organizationId,
          shipmentId: params.shipmentId,
          actorUserId: user.id,
          updates: body,
        });
        if (!result) return createApiError(res, 404, "NOT_FOUND", "Shipment was not found.");

        await auditLog({
          actorUserId: user.id,
          organizationId,
          action: "daily_status.update",
          entityType: "SHIPMENT",
          entityId: params.shipmentId,
          summary,
          before: dailyStatusAuditSnapshot(result.before, result.changedFields),
          after: dailyStatusAuditSnapshot(result.after, result.changedFields),
          metadata: {
            source: auditSource,
            changedFields: result.changedFields,
            shipmentId: params.shipmentId,
          },
          requestContext: requestContext(req),
        });

        res.json({ ok: true, data: result.after });
      } catch (error) {
        if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
        if (error.statusCode === 404) return createApiError(res, 404, error.code || "NOT_FOUND", error.message);
        if (error.statusCode === 400) return createApiError(res, 400, error.code || "VALIDATION_ERROR", error.message);
        if (isDailyStatusSchemaMissing(error)) {
          return createApiError(
            res,
            503,
            "DAILY_STATUS_SCHEMA_NOT_READY",
            "Daily status database migration has not been applied yet."
          );
        }
        console.error("Update daily status failed:", error);
        createApiError(res, 500, "DAILY_STATUS_UPDATE_FAILED", "Could not update daily status row.");
      }
    };
  }

  const handleDailyStatusPatch = createPatchHandler(
    "daily-status",
    "Daily status board fields were updated."
  );
  const handleShipmentDetailPatch = createPatchHandler(
    "shipment-detail-daily-status",
    "Shipment detail daily status fields were updated."
  );

  app.get("/api/daily-status", handleList);
  app.get("/api/kootaj-board", handleList);
  app.get("/api/shipments/:shipmentId/daily-status", handleShipmentDetailGet);
  app.patch("/api/daily-status/:shipmentId", handleDailyStatusPatch);
  app.patch("/api/kootaj-board/:shipmentId", handleDailyStatusPatch);
  app.patch("/api/shipments/:shipmentId/daily-status", handleShipmentDetailPatch);
}
