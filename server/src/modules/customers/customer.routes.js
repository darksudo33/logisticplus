import { createCustomerController } from "./customer.controller.js";

export function registerCustomerRoutes(app, deps) {
  const controller = createCustomerController(deps);

  app.get("/api/customers", controller.listCustomers);
  app.post("/api/customers", controller.createCustomer);
  app.get("/api/customers/:id", controller.getCustomer);
  app.patch("/api/customers/:id", controller.updateCustomer);
  app.get("/api/customers/:id/:related", controller.listCustomerRelated);
  app.post("/api/customers/:id/archive", controller.archiveCustomer);
}
