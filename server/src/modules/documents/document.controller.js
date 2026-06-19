import { registerDocumentManagementCenterRoutes } from "./document-management-center.routes.js";
import { registerDocumentRoutes } from "./document.routes.js";

export function createDocumentController(deps) {
  return {
    registerRoutes: (app) => registerDocumentRoutes(app, deps),
    registerManagementCenterRoutes: (app) => registerDocumentManagementCenterRoutes(app, deps),
  };
}
