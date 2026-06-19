export function pickShipmentBasicInfoUpdates(updates = {}) {
  const allowedKeys = [
    "trackingNumber",
    "customerId",
    "origin",
    "destination",
    "deliveryPort",
    "dischargePort",
    "shipmentDirection",
    "transportMode",
    "shipmentTypeCode",
  ];
  return Object.fromEntries(
    Object.entries(updates).filter(([key]) => allowedKeys.includes(key))
  );
}
