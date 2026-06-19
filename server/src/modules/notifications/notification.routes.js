import {
  notificationListQuerySchema,
  notificationParamsSchema,
} from "./notification.validation.js";
import { parseRequestValue } from "../../shared/middleware/validate.middleware.js";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "./notification.repository.js";

export function registerNotificationRoutes(
  app,
  {
    createApiError,
    pool,
    requireAuthenticatedUser,
    requireTenantContext,
  }
) {
  app.get("/api/notifications", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      const tenantContext = requireTenantContext(req, res, "list notifications");
      if (!tenantContext) return;
      const query = parseRequestValue(res, notificationListQuerySchema, req.query || {});
      if (!query) return;
      const data = await listNotifications(pool, {
        userId: user.id,
        organizationId: tenantContext.organizationId,
        includeRead: query.includeRead,
        limit: query.limit,
      });
      res.json({ ok: true, data });
    } catch (error) {
      console.error("List notifications failed:", error);
      createApiError(res, 500, "NOTIFICATIONS_LIST_FAILED", "Could not load notifications.");
    }
  });

  app.patch("/api/notifications/:id/read", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      const tenantContext = requireTenantContext(req, res, "mark notification read");
      if (!tenantContext) return;
      const params = parseRequestValue(res, notificationParamsSchema, req.params);
      if (!params) return;
      const data = await markNotificationRead(pool, params.id, {
        userId: user.id,
        organizationId: tenantContext.organizationId,
      });
      if (!data) return createApiError(res, 404, "NOTIFICATION_NOT_FOUND", "Notification was not found.");
      res.json({ ok: true, data });
    } catch (error) {
      console.error("Mark notification read failed:", error);
      createApiError(res, 500, "NOTIFICATION_READ_FAILED", "Could not update notification.");
    }
  });

  app.patch("/api/notifications/read-all", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      const tenantContext = requireTenantContext(req, res, "mark all notifications read");
      if (!tenantContext) return;
      const data = await markAllNotificationsRead(pool, {
        userId: user.id,
        organizationId: tenantContext.organizationId,
      });
      res.json({ ok: true, data });
    } catch (error) {
      console.error("Mark notifications read failed:", error);
      createApiError(res, 500, "NOTIFICATIONS_READ_FAILED", "Could not update notifications.");
    }
  });
}
