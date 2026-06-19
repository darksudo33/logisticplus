import { registerTaskRoutes } from "./task.routes.js";

export function createTaskController(deps) {
  return {
    registerRoutes: (app) => registerTaskRoutes(app, deps),
  };
}
