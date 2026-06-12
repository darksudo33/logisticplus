const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

export const RELATION_INTENTS = {
  SHIPMENT_CUSTOMER_LOOKUP: "shipment.customer.lookup",
  SHIPMENT_COMMERCIAL_CARD_LOOKUP: "shipment.commercial_card.lookup",
  CUSTOMER_COMMERCIAL_CARD_LOOKUP: "customer.commercial_card.lookup",
  CUSTOMER_SHIPMENTS_LOOKUP: "customer.shipments.lookup",
  SHIPMENT_SUMMARY_LOOKUP: "shipment.summary.lookup",
};

export const BUSINESS_ENTITY_TYPES = {
  SHIPMENT: "shipment",
  CUSTOMER: "customer",
  COMMERCIAL_CARD: "commercial_card",
};

export const BUSINESS_REQUESTED_FIELDS = {
  SUMMARY: "summary",
  STATUS: "status",
  CUSTOMER: "customer",
  CUSTOMER_PHONE: "customer_phone",
  CUSTOMER_NUMBER: "customer_number",
  COMMERCIAL_CARD: "commercial_card",
  COMMERCIAL_CARD_NUMBER: "commercial_card_number",
  SHIPMENT_NUMBER: "shipment_number",
  LOCATION: "location",
};

const SUPPORTED_RELATION_INTENTS = new Set(Object.values(RELATION_INTENTS));
const SUPPORTED_ENTITY_TYPES = new Set(Object.values(BUSINESS_ENTITY_TYPES));

const HONORIFICS = new Set([
  "آقا",
  "آقای",
  "خانم",
  "سرکار",
  "جناب",
  "شرکت",
  "mr",
  "mrs",
  "ms",
  "company",
]);

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
  "اون",
  "آن",
  "این",
  "چندتا",
  "چند",
  "چه",
  "چیه",
  "چیست",
  "چی",
  "شد",
  "شده",
  "داراست",
  "داره",
  "دارد",
  "در",
  "را",
  "رو",
  "صاحب",
  "طرف",
  "حساب",
  "فعال",
  "کارت",
  "کدام",
  "کدوم",
  "کجاست",
  "کجاس",
  "کیه",
  "مال",
  "محموله",
  "محموله‌ها",
  "محموله‌های",
  "مشتری",
  "مشتریش",
  "نام",
  "اسم",
  "های",
  "هایی",
  "وضعیت",
  "وضعیتش",
  "شماره",
  "کد",
  "خلاصه",
  "آخرین",
  "درچه",
  "حاله",
  "حالش",
]);

const SHIPMENT_TERMS = ["shipment", "cargo", "load", "tracking", "بار", "محموله", "پرونده"];
const CUSTOMER_TERMS = ["customer", "client", "مشتری", "صاحب", "مالک", "طرف حساب", "شرکت"];
const COMMERCIAL_CARD_TERMS = [
  "commercial card",
  "کارت بازرگانی",
  "کارت‌های بازرگانی",
  "کارتهاي بازرگانی",
];
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
const SUMMARY_TERMS = ["summary", "status", "where", "وضعیت", "خلاصه", "کجاست", "کجاس", "الان", "آخرین وضعیت", "چی شد", "در چه حال"];
const CUSTOMER_OWNER_TERMS = ["مشتری", "صاحب", "مالک", "مال کی", "برای کی", "کدوم مشتری", "کدام مشتری", "who", "customer"];
const NUMBER_TERMS = ["شماره", "number", "phone", "code", "کد", "تلفن", "تماس", "موبایل"];
const PHONE_TERMS = ["تلفن", "تماس", "موبایل", "شماره تماس", "phone", "mobile"];
const LOCATION_TERMS = ["کجاست", "کجاس", "لوکیشن", "محل", "بندر", "مسیر", "location", "where"];
const IDENTITY_TERMS = [
  "تو کی هستی",
  "تو چی هستی",
  "شما کی هستید",
  "شما چی هستید",
  "خودتو معرفی کن",
  "خودت رو معرفی کن",
  "who are you",
  "what are you",
];

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

function unique(values = []) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function tokenized(text = "") {
  return normalizeAgentText(text).match(/[\p{L}\p{N}_-]+/gu) || [];
}

function isStopToken(token = "") {
  return STOP_WORDS.has(token) || HONORIFICS.has(token) || /^(ها|های|اش|ش)$/.test(token);
}

function candidateRefs(message = "") {
  return tokenized(message)
    .filter((token) => !isStopToken(token))
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

export function isIdentityQuestion(message = "") {
  const normalized = normalizeAgentText(message);
  if (!normalized) return false;
  return IDENTITY_TERMS.some((term) => normalized === normalizeAgentText(term) || normalized.includes(normalizeAgentText(term)));
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

export function detectBusinessRequestedField(message = "") {
  const normalized = normalizeAgentText(message);
  const hasNumber = includesAny(normalized, NUMBER_TERMS);
  const hasPhone = includesAny(normalized, PHONE_TERMS);
  const hasShipment = includesAny(normalized, SHIPMENT_TERMS);
  const hasCustomer = includesAny(normalized, CUSTOMER_TERMS);
  const hasCard = includesAny(normalized, CARD_TERMS) || includesAny(normalized, COMMERCIAL_CARD_TERMS);
  const hasStatus = includesAny(normalized, SUMMARY_TERMS);
  const hasLocation = includesAny(normalized, LOCATION_TERMS);
  const asksOwner = includesAny(normalized, CUSTOMER_OWNER_TERMS);

  if (hasCard && hasNumber) return BUSINESS_REQUESTED_FIELDS.COMMERCIAL_CARD_NUMBER;
  if (hasCard) return BUSINESS_REQUESTED_FIELDS.COMMERCIAL_CARD;
  if (hasPhone || (hasNumber && hasCustomer && !hasShipment)) return BUSINESS_REQUESTED_FIELDS.CUSTOMER_PHONE;
  if (hasNumber && hasShipment) return BUSINESS_REQUESTED_FIELDS.SHIPMENT_NUMBER;
  if (hasNumber && hasCustomer) return BUSINESS_REQUESTED_FIELDS.CUSTOMER_NUMBER;
  if (asksOwner && hasShipment) return BUSINESS_REQUESTED_FIELDS.CUSTOMER;
  if (hasLocation) return BUSINESS_REQUESTED_FIELDS.LOCATION;
  if (hasStatus) return BUSINESS_REQUESTED_FIELDS.STATUS;
  return BUSINESS_REQUESTED_FIELDS.SUMMARY;
}

export function extractBusinessSearchTerms(message = "", { maxTerms = 8 } = {}) {
  const tokens = tokenized(message)
    .map((token) => token.replace(/[%_\\]/g, ""))
    .filter((token) => token.length >= 2 || /^[A-Za-z0-9_-]+$/.test(token))
    .filter((token) => !isStopToken(token));
  const phrases = [];
  for (let index = 0; index < tokens.length - 1; index += 1) {
    const left = tokens[index];
    const right = tokens[index + 1];
    if (left.length >= 2 && right.length >= 2 && !/^[0-9]+$/.test(left + right)) {
      phrases.push(`${left} ${right}`);
    }
  }
  return unique([...tokens, ...phrases]).slice(0, Math.min(Math.max(Number(maxTerms) || 8, 1), 12));
}

function candidateTypesFor(message = "", requestedField = BUSINESS_REQUESTED_FIELDS.SUMMARY) {
  const normalized = normalizeAgentText(message);
  const hasShipment = includesAny(normalized, SHIPMENT_TERMS);
  const hasCustomer = includesAny(normalized, CUSTOMER_TERMS) || [...HONORIFICS].some((term) => normalized.includes(term));
  const hasCard = includesAny(normalized, CARD_TERMS) || includesAny(normalized, COMMERCIAL_CARD_TERMS);
  const hasStatus = includesAny(normalized, SUMMARY_TERMS) || requestedField === BUSINESS_REQUESTED_FIELDS.STATUS;
  const types = [];

  if (hasCard || requestedField === BUSINESS_REQUESTED_FIELDS.COMMERCIAL_CARD || requestedField === BUSINESS_REQUESTED_FIELDS.COMMERCIAL_CARD_NUMBER) {
    types.push(BUSINESS_ENTITY_TYPES.COMMERCIAL_CARD, BUSINESS_ENTITY_TYPES.CUSTOMER, BUSINESS_ENTITY_TYPES.SHIPMENT);
  } else if (hasShipment && hasCustomer) {
    types.push(BUSINESS_ENTITY_TYPES.SHIPMENT, BUSINESS_ENTITY_TYPES.CUSTOMER);
  } else if (hasShipment || hasStatus) {
    types.push(BUSINESS_ENTITY_TYPES.SHIPMENT, BUSINESS_ENTITY_TYPES.CUSTOMER);
  } else if (hasCustomer) {
    types.push(BUSINESS_ENTITY_TYPES.CUSTOMER, BUSINESS_ENTITY_TYPES.SHIPMENT, BUSINESS_ENTITY_TYPES.COMMERCIAL_CARD);
  } else {
    types.push(BUSINESS_ENTITY_TYPES.SHIPMENT, BUSINESS_ENTITY_TYPES.CUSTOMER, BUSINESS_ENTITY_TYPES.COMMERCIAL_CARD);
  }

  return unique(types).filter((type) => SUPPORTED_ENTITY_TYPES.has(type));
}

function alternateTermsFor(terms = []) {
  if (terms.length <= 1) return [];
  const joined = terms.slice(0, 4).join(" ");
  const compact = terms.filter((term) => !term.includes(" "));
  return unique([joined, ...compact.slice().reverse()]).filter((term) => !terms.includes(term)).slice(0, 6);
}

export function planBusinessSearch(message = "") {
  const normalized = normalizeAgentText(message);
  const language = hasPersian(message) ? "fa" : "en";
  if (!normalized) {
    return {
      intent: "empty",
      language: "unknown",
      searchBusinessContext: false,
      queryTerms: [],
      alternateQueryTerms: [],
      candidateTypes: [],
      requestedField: BUSINESS_REQUESTED_FIELDS.SUMMARY,
      confidence: 0,
    };
  }

  if (isIdentityQuestion(message)) {
    return {
      intent: "identity",
      language,
      searchBusinessContext: false,
      queryTerms: [],
      alternateQueryTerms: [],
      candidateTypes: [],
      requestedField: BUSINESS_REQUESTED_FIELDS.SUMMARY,
      confidence: 1,
    };
  }

  const requestedField = detectBusinessRequestedField(message);
  const queryTerms = extractBusinessSearchTerms(message);
  const candidateTypes = candidateTypesFor(message, requestedField);
  const hasBusinessCue =
    includesAny(normalized, SHIPMENT_TERMS) ||
    includesAny(normalized, CUSTOMER_TERMS) ||
    includesAny(normalized, CARD_TERMS) ||
    includesAny(normalized, SUMMARY_TERMS) ||
    includesAny(normalized, NUMBER_TERMS) ||
    [...HONORIFICS].some((term) => normalized.includes(term));

  return {
    intent: "business_search",
    language,
    searchBusinessContext: Boolean(hasBusinessCue && queryTerms.length),
    queryTerms,
    alternateQueryTerms: alternateTermsFor(queryTerms),
    candidateTypes,
    requestedField,
    confidence: queryTerms.length >= 2 ? 0.86 : hasBusinessCue ? 0.72 : 0.35,
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
