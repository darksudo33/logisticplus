import { registerShipmentArchiveRoutes } from "./archive/index.js";
import { registerShipmentCreateRoutes } from "./create-shipment/index.js";
import { registerShipmentGetRoutes } from "./get-shipment/index.js";
import { registerShipmentListRoutes } from "./list-shipments/index.js";
import { registerShipmentStepRoutes } from "./steps/index.js";
import { registerShipmentTaskRoutes } from "./tasks/index.js";
import { registerShipmentOperationalRoutes } from "./update-operational-fields/index.js";
import { registerShipmentTrackingRoutes } from "./tracking/index.js";
import { registerShipmentV2Routes } from "./shipment-v2.routes.js";

export function registerShipmentRoutes(app, deps) {
  registerShipmentListRoutes(app, deps);
  registerShipmentCreateRoutes(app, deps);
  registerShipmentArchiveRoutes(app, deps);
  registerShipmentTrackingRoutes(app, deps);
  registerShipmentV2Routes(app, deps);
  registerShipmentStepRoutes(app, deps);
  registerShipmentTaskRoutes(app, deps);
  registerShipmentGetRoutes(app, deps);
  registerShipmentOperationalRoutes(app, deps);
}
