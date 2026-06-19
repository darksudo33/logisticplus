import { BASE_SECTION_DEFAULTS } from "./shipment-kootaj.repository.js";

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value || {}, key);
}

function normalizeText(value) {
  if (value === undefined || value === null) return "";
  return String(value);
}

function trimNullableText(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
}

export function defaultV2SectionsForShipment(shipment = {}) {
  const flowCode = String(shipment.shipment_type_code || "").toUpperCase().includes("LENJ") ? "IMPORT_LANJ" : "IMPORT_SHIP";
  return {
    base: {
      ...BASE_SECTION_DEFAULTS,
      trackingNumber: normalizeText(shipment.shipment_code),
      origin: normalizeText(shipment.origin),
      deliveryPort: normalizeText(shipment.destination),
      lenjType: flowCode === "IMPORT_LANJ" ? "MALVANI" : null,
    },
    orderRegistration: {},
    goods: { goodsRows: [] },
    declarationKootaj: {},
    permits: { permitRows: [] },
    payments: {},
    banking: {},
    notes: { internalNote: "" },
  };
}

export function baseSectionPatchFromUpdates(baseInfo = {}) {
  const patch = {};
  for (const key of ["currentStage", "origin", "deliveryPort", "dischargePort", "consigneeName", "orderRegistrationNumber"]) {
    if (!hasOwn(baseInfo, key)) continue;
    patch[key] = trimNullableText(baseInfo[key]) || "";
  }
  return patch;
}
