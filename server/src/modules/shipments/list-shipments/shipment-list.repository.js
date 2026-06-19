import { listOperationalShipmentRecords } from "../shipment.repository.js";

export async function listShipments(pool, { organizationId, includeCustomerPrivateDetails = true } = {}) {
  return listOperationalShipmentRecords(pool, { organizationId, includeCustomerPrivateDetails });
}
