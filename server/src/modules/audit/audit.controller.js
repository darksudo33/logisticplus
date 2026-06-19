import { registerAuditRoutes } from "./audit.routes.js";

export function createAuditController(deps) {
  return {
    registerRoutes: (app) => registerAuditRoutes(app, deps),
  };
}
