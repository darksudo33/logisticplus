import { registerSearchRoutes } from "./search.routes.js";

export function createSearchController(deps) {
  return {
    registerRoutes: (app) => registerSearchRoutes(app, deps),
  };
}
