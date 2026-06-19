export const SHIPMENT_STATUS_OPTIONS = [
  { value: "LOADING", label: "درحال بارگیری", order: 1 },
  { value: "IN_TRANSIT", label: "در مسیر", order: 2 },
  { value: "ARRIVED", label: "رسیده", order: 3 },
  { value: "KOOTAJ_DONE", label: "کوتاژ شده", order: 4 },
  { value: "EXITED", label: "خروج شده", order: 5 },
];

export const SHIPMENT_STATUS_VALUES = SHIPMENT_STATUS_OPTIONS.map((option) => option.value);

export const SHIPMENT_STATUS_LABELS = Object.fromEntries(
  SHIPMENT_STATUS_OPTIONS.map((option) => [option.value, option.label])
);

export const LEGACY_SHIPMENT_STATUS_MAP = {
  PENDING: "LOADING",
  BOOKED: "LOADING",
  IN_TRANSIT: "IN_TRANSIT",
  ARRIVED: "ARRIVED",
  CUSTOMS: "KOOTAJ_DONE",
  CLEARED: "KOOTAJ_DONE",
  DELIVERED: "EXITED",
  CLOSED: "EXITED",
};

export function normalizeShipmentStatus(value, fallback = "LOADING") {
  const normalized = String(value || "").trim().toUpperCase();
  if (SHIPMENT_STATUS_VALUES.includes(normalized)) return normalized;
  return LEGACY_SHIPMENT_STATUS_MAP[normalized] || fallback;
}

export function shipmentStatusLabel(value) {
  const normalized = normalizeShipmentStatus(value);
  return SHIPMENT_STATUS_LABELS[normalized] || normalized;
}

export function shipmentStatusProgressFloor(value) {
  switch (normalizeShipmentStatus(value)) {
    case "EXITED":
      return 100;
    case "KOOTAJ_DONE":
      return 85;
    case "ARRIVED":
      return 60;
    case "IN_TRANSIT":
      return 35;
    default:
      return 10;
  }
}

export function isShipmentTerminalStatus(value) {
  return normalizeShipmentStatus(value) === "EXITED";
}
