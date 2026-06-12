const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

export const RELATION_INTENTS = {
  SHIPMENT_CUSTOMER_LOOKUP: "shipment.customer.lookup",
  SHIPMENT_COMMERCIAL_CARD_LOOKUP: "shipment.commercial_card.lookup",
  CUSTOMER_COMMERCIAL_CARD_LOOKUP: "customer.commercial_card.lookup",
  CUSTOMER_SHIPMENTS_LOOKUP: "customer.shipments.lookup",
  SHIPMENT_SUMMARY_LOOKUP: "shipment.summary.lookup",
};

const SUPPORTED_RELATION_INTENTS = new Set(Object.values(RELATION_INTENTS));

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "card",
  "cards",
  "cargo",
  "client",
  "commercial",
  "customer",
  "for",
  "is",
  "load",
  "of",
  "shipment",
  "shipments",
  "status",
  "summary",
  "the",
  "what",
  "where",
  "which",
  "who",
  "بار",
  "بارها",
  "بارهای",
  "باز",
  "بازرگانی",
  "برای",
  "پرونده",
  "پرونده‌ها",
  "پرونده‌های",
  "چندتا",
  "چند",
  "چه",
  "چیه",
  "چیست",
  "داراست",
  "داره",
  "دارد",
  "در",
  "را",
  "رو",
  "صاحب",
  "فعال",
  "کارت",
  "کدام",
  "کدوم",
  "کجاست",
  "کیه",
  "مال",
  "محموله",
  "محموله‌ها",
  "محموله‌های",
  "مشتری",
  "مشتریش",
  "نام",
  "های",
  "هایی",
  "وضعیت",
]);

const SHIPMENT_TERMS = ["shipment", "cargo", "load", "tracking", "بار", "محموله", "پرونده"];
const CUSTOMER_TERMS = ["customer", "client", "مشتری", "صاحب", "مالک"];
const COMMERCIAL_CARD_TERMS = ["commercial card", "کارت بازرگانی", "کارت‌های بازرگانی", "کارتهاي بازرگانی"];
const CARD_TERMS = ["card", "cards", "کارت", "کارتها", "کارت‌ها", "کارت‌های", "کارت‌هایی"];
const SHIPMENT_LIST_TERMS = [
  "shipments",
  "active shipments",
  "بارهای",
  "بار ها",
  "محموله‌های",
  "محموله ها",
  "پرونده‌های",
  "پرونده ها",
  "چندتا پرونده",
  "چند پرونده",
];
const SUMMARY_TERMS = ["summary", "status", "where", "وضعیت", "خلاصه", "کجاست", "الان", "آخرین وضعیت"];
const CUSTOMER_OWNER_TERMS = ["مشتری", "صاحب", "مالک", "مال کی", "برای کی", "کدوم مشتری", "کدام مشتری", "who", "customer"];

function normalizeDigits(value = "") {
  return String(value)
    .replace(/[۰-۹]/g, (digit) => String(PERSIAN_DIGITS.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String(ARABIC_DIGITS.indexOf(digit)));
}

export function normalizeAgentText(value = "") {
  return normalizeDigits(value)
    .replace(/[يى]/g, "ی")
    .replace(/[ك]/g, "ک")
    .replace(/\u200c/g, " ")
    .replace(/[؟?.,،؛:!()[\]{}"']/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function hasPersian(value = "") {
  return /[\u0600-\u06ff]/.test(String(value));
}

function includesAny(text, terms) {
  return terms.some((term) => text.includes(normalizeAgentText(term)));
}

function tokenized(text = "") {
  return normalizeAgentText(text).match(/[\p{L}\p{N}_-]+/gu) || [];
}

function candidateRefs(message = "") {
  return tokenized(message)
    .filter((token) => !STOP_WORDS.has(token))
    .filter((token) => !/^(ها|های|اسم|نامش|کد|شماره)$/.test(token))
    .filter((token) => token.length > 0)
    .slice(0, 4);
}

function firstRefForIntent(message, intent) {
  const refs = candidateRefs(message);
  if (!refs.length) return null;
  if (intent === RELATION_INTENTS.CUSTOMER_COMMERCIAL_CARD_LOOKUP || intent === RELATION_INTENTS.CUSTOMER_SHIPMENTS_LOOKUP) {
    return refs[refs.length - 1] || refs[0];
  }
  return refs[0];
}

function confidenceFor(intent, ref) {
  if (!intent) return 0;
  if (ref) return 0.95;
  return 0.72;
}

export function isSupportedRelationIntent(intent) {
  return SUPPORTED_RELATION_INTENTS.has(intent);
}

export function detectRelationIntent(message = "") {
  const normalized = normalizeAgentText(message);
  if (!normalized) {
    return {
      intent: null,
      entities: { shipmentRef: null, customerRef: null, commercialCardRef: null },
      confidence: 0,
      language: "unknown",
    };
  }

  const language = hasPersian(message) ? "fa" : "en";
  const hasShipment = includesAny(normalized, SHIPMENT_TERMS);
  const hasCustomer = includesAny(normalized, CUSTOMER_TERMS);
  const hasCardWord = includesAny(normalized, CARD_TERMS);
  const hasCommercialCard =
    includesAny(normalized, COMMERCIAL_CARD_TERMS) || ((hasShipment || hasCustomer) && hasCardWord);
  const hasShipmentList = includesAny(normalized, SHIPMENT_LIST_TERMS);
  const hasSummary = includesAny(normalized, SUMMARY_TERMS);
  const hasCustomerOwner = includesAny(normalized, CUSTOMER_OWNER_TERMS);

  let intent = null;
  if (hasCommercialCard && hasShipment) {
    intent = RELATION_INTENTS.SHIPMENT_COMMERCIAL_CARD_LOOKUP;
  } else if (hasCommercialCard && hasCustomer) {
    intent = RELATION_INTENTS.CUSTOMER_COMMERCIAL_CARD_LOOKUP;
  } else if (hasCustomer && hasShipmentList) {
    intent = RELATION_INTENTS.CUSTOMER_SHIPMENTS_LOOKUP;
  } else if (hasShipment && hasCustomerOwner) {
    intent = RELATION_INTENTS.SHIPMENT_CUSTOMER_LOOKUP;
  } else if (hasShipment && hasSummary) {
    intent = RELATION_INTENTS.SHIPMENT_SUMMARY_LOOKUP;
  }

  const ref = firstRefForIntent(message, intent);
  const entities = {
    shipmentRef: intent?.startsWith("shipment.") ? ref : null,
    customerRef: intent?.startsWith("customer.") ? ref : null,
    commercialCardRef: intent === RELATION_INTENTS.CUSTOMER_COMMERCIAL_CARD_LOOKUP && !hasCustomer ? ref : null,
  };

  return {
    intent,
    entities,
    confidence: confidenceFor(intent, ref),
    language,
  };
}

export function classifyResolutionState(matches = []) {
  if (!Array.isArray(matches) || matches.length === 0) return "not_found";
  if (matches.length > 1) return "ambiguous";
  return "resolved";
}

export function verifyRelationAnswerability(intent, context = {}) {
  if (!isSupportedRelationIntent(intent)) return { answerable: false, reason: "unsupported_intent" };
  if (intent === RELATION_INTENTS.SHIPMENT_CUSTOMER_LOOKUP) {
    return context.shipment?.customer?.name || context.shipment?.customerName
      ? { answerable: true }
      : { answerable: false, reason: "missing_customer" };
  }
  if (intent === RELATION_INTENTS.SHIPMENT_COMMERCIAL_CARD_LOOKUP) {
    return context.shipment
      ? { answerable: true }
      : { answerable: false, reason: "missing_shipment_context" };
  }
  if (intent === RELATION_INTENTS.CUSTOMER_COMMERCIAL_CARD_LOOKUP) {
    return Array.isArray(context.commercialCards)
      ? { answerable: true }
      : { answerable: false, reason: "missing_commercial_cards" };
  }
  if (intent === RELATION_INTENTS.CUSTOMER_SHIPMENTS_LOOKUP) {
    return Array.isArray(context.shipments)
      ? { answerable: true }
      : { answerable: false, reason: "missing_shipments" };
  }
  if (intent === RELATION_INTENTS.SHIPMENT_SUMMARY_LOOKUP) {
    return context.shipment?.shipmentCode || context.shipment?.status
      ? { answerable: true }
      : { answerable: false, reason: "missing_shipment_summary" };
  }
  return { answerable: false, reason: "unsupported_intent" };
}
