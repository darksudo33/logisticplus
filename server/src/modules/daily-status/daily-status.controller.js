import { registerDailyStatusRoutes } from "./daily-status.routes.js";

export function createDailyStatusController(deps) {
  return {
    registerRoutes: (app) => registerDailyStatusRoutes(app, deps),
  };
}
