import { registerNotificationRoutes } from "./notification.routes.js";

export function createNotificationController(deps) {
  return {
    registerRoutes: (app) => registerNotificationRoutes(app, deps),
  };
}
