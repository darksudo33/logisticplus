export async function createShipment({
  createShipmentRecord,
  ownerUserId,
  actorUserId,
  tenantContext,
  shipment,
  includeCustomerPrivateDetails,
}) {
  return createShipmentRecord({
    ownerUserId,
    actorUserId,
    tenantContext,
    shipment,
    includeCustomerPrivateDetails,
  });
}
