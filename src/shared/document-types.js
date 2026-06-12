export const DOCUMENT_TYPE_ALL = "ALL";

export const DOCUMENT_TYPE_OPTIONS = [
  { value: "ORDER_REGISTRATION", label: "ثبت سفارش" },
  { value: "COMMERCIAL_CARD", label: "کارت بازرگانی" },
  { value: "COMMERCIAL_DOCUMENTS", label: "اسناد تجاری" },
  { value: "SHIPPING_DOCUMENTS", label: "اسناد حمل" },
  { value: "CUSTOMS", label: "گمرک" },
  { value: "PERMITS", label: "مجوزها" },
  { value: "BANKING", label: "بانکی" },
  { value: "EXIT", label: "خروج" },
  { value: "MISC", label: "متفرقه" },
];

export const DOCUMENT_TYPE_FILTERS = [
  { value: DOCUMENT_TYPE_ALL, label: "همه" },
  ...DOCUMENT_TYPE_OPTIONS,
];

const DOCUMENT_TYPE_LABELS = new Map(DOCUMENT_TYPE_OPTIONS.map((item) => [item.value, item.label]));

const LEGACY_DOCUMENT_TYPE_GROUPS = {
  BILL_OF_LADING: "SHIPPING_DOCUMENTS",
  INVOICE: "COMMERCIAL_DOCUMENTS",
  PACKING_LIST: "COMMERCIAL_DOCUMENTS",
  CUSTOMS_PERMIT: "CUSTOMS",
  INSURANCE: "MISC",
  OTHER: "MISC",
};

export function getDocumentTypeFilterValue(type) {
  const normalized = String(type || "").trim().toUpperCase();
  if (DOCUMENT_TYPE_LABELS.has(normalized)) return normalized;
  return LEGACY_DOCUMENT_TYPE_GROUPS[normalized] || "MISC";
}

export function getDocumentTypeLabel(type) {
  return DOCUMENT_TYPE_LABELS.get(getDocumentTypeFilterValue(type)) || DOCUMENT_TYPE_LABELS.get("MISC");
}
