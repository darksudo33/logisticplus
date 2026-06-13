import { resolveHamyarQuestionPlan } from "./hamyar-relation-resolver.js";

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
  DOCUMENT: "document",
  WORKFLOW_ITEM: "workflow_item",
  CHEQUE: "cheque",
};

export const BUSINESS_REQUESTED_FIELDS = {
  SUMMARY: "summary",
  STATUS: "status",
  PHONE: "phone",
  CUSTOMER: "customer",
  CUSTOMER_PHONE: "customer_phone",
  CUSTOMER_NUMBER: "customer_number",
  SHIPMENTS: "shipments",
  COMMERCIAL_CARD: "commercial_card",
  COMMERCIAL_CARD_NUMBER: "commercial_card_number",
  SHIPMENT_NUMBER: "shipment_number",
  LOCATION: "location",
  ADDRESS: "address",
  ACCOUNTING: "accounting",
  AGENT_PHONE: "agent_phone",
  CAPTAIN_PHONE: "captain_phone",
  VESSEL_NAME: "vessel_name",
  CONTAINER_NUMBERS: "container_numbers",
  COMMERCIAL_CARD_AGENT_PHONE: "commercial_card_agent_phone",
  DOCUMENTS: "documents",
  DOCUMENT_STATUS: "document_status",
  TASKS: "tasks",
  ASSIGNEE: "assignee",
  DUE_DATE: "due_date",
  CHEQUES: "cheques",
  LATEST_STEP: "latest_step",
  DUE_TODAY: "due_today",
  LATEST_SHIPMENT: "latest_shipment",
  DAILY_SUMMARY: "daily_summary",
  MISSING_DATA: "missing_data",
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
  "چنده",
  "چه",
  "چیه",
  "چیست",
  "چی",
  "شد",
  "شده",
  "داراست",
  "دارم",
  "داریم",
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
  "کدومه",
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
  "سند",
  "اسناد",
  "مدرک",
  "مدارک",
  "وظیفه",
  "وظایف",
  "تسک",
  "کار",
  "اقدام",
  "مرحله",
  "مانع",
  "چک",
  "چک‌ها",
  "کد",
  "خلاصه",
  "آخرین",
  "درچه",
  "حاله",
  "حالش",
]);

const BUSINESS_FIELD_STOP_WORDS = new Set([
  "شماره",
  "تلفن",
  "موبایل",
  "همراه",
  "تماس",
  "کانتکت",
  "آدرس",
  "نشانی",
  "محل",
  "وضعیت",
  "کجاست",
  "رسیده",
  "ارسال",
  "تحویل",
  "حسابداری",
  "مالی",
  "مانده",
  "بدهی",
  "طلب",
  "به",
  "گزینه",
  "phone",
  "mobile",
  "contact",
  "address",
  "status",
  "accounting",
  "balance",
]);

const COMMAND_STOP_WORDS = new Set([
  "بده",
  "بدهید",
  "بدین",
  "بفرست",
  "بفرستید",
  "بفرستین",
  "بیار",
  "بیارید",
  "بگو",
  "بگویید",
  "لطفا",
  "لطفاً",
  "خواهشا",
  "خواهشاً",
  "میخوام",
  "میخواهم",
  "می‌خوام",
  "می‌خواهم",
  "میخواستم",
  "می‌خواستم",
  "میشه",
  "می‌شه",
  "کن",
  "کنید",
  "نشون",
  "نشان",
  "نمایش",
  "show",
  "give",
  "send",
  "please",
]);

const SHIPMENT_TERMS = ["shipment", "cargo", "load", "tracking", "بار", "محموله", "پرونده"];
const CUSTOMER_TERMS = ["customer", "client", "مشتری", "صاحب", "مالک", "طرف حساب", "شرکت"];
const DOCUMENT_TERMS = ["document", "file", "سند", "اسناد", "مدرک", "مدارک", "فایل", "بارنامه", "قبض"];
const WORKFLOW_TERMS = ["workflow", "task", "blocker", "کار", "وظیفه", "وظایف", "تسک", "اقدام", "پیگیری", "مرحله", "مانع", "موانع"];
const CHEQUE_TERMS = ["cheque", "check", "payment", "چک", "چک‌ها", "چکهای", "پرداخت", "سررسید", "وصول", "بانک"];
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
  "بارهاش",
  "بار هاش",
  "بارهای این مشتری",
  "بارهای فعال مشتری",
  "محموله‌های",
  "محموله ها",
  "محموله‌هاش",
  "محموله هاش",
  "محموله‌های مشتری",
  "آخرین محموله‌های مشتری",
  "پرونده‌های",
  "پرونده ها",
  "پرونده‌هاش",
  "پرونده هاش",
  "پرونده‌های مشتری",
  "چندتا پرونده",
  "چند پرونده",
];
const SUMMARY_TERMS = ["summary", "status", "where", "وضعیت", "خلاصه", "کجاست", "کجاس", "الان", "آخرین وضعیت", "چی شد", "در چه حال"];
const SHIPMENT_STATUS_TERMS = ["وضعیت", "کجاست", "کجاس", "رسیده", "ارسال", "تحویل", "مرحله", "status", "where", "arrived", "sent", "delivered"];
const CUSTOMER_OWNER_TERMS = ["مشتری", "صاحب", "مالک", "مال کی", "برای کی", "کدوم مشتری", "کدام مشتری", "who", "customer"];
const NUMBER_TERMS = ["شماره", "number", "phone", "code", "کد", "تلفن", "تماس", "موبایل"];
const PHONE_TERMS = ["شماره", "تلفن", "موبایل", "همراه", "تماس", "کانتکت", "شماره تماس", "phone", "mobile", "contact"];
const LOCATION_TERMS = ["کجاست", "کجاس", "لوکیشن", "محل", "بندر", "مسیر", "location", "where"];
const ADDRESS_TERMS = ["آدرس", "نشانی", "محل", "address"];
const ACCOUNTING_TERMS = ["حسابداری", "مالی", "مانده", "بدهی", "طلب", "accounting", "balance", "finance"];
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

export const COMPANY_BRAIN_LOOKUP_INTENTS = {
  SNAPSHOT: "company_brain.snapshot",
  DAILY: "company_brain.daily",
  LATEST: "company_brain.latest",
  ENTITY_MEMORY: "company_brain.entity_memory",
  NONE: "company_brain.none",
};

const COMPANY_BRAIN_STATUS_TERMS = [
  "وضعیت کلی",
  "نمای کلی",
  "خلاصه شرکت",
  "وضعیت شرکت",
  "عملیات شرکت",
  "در جریان",
  "محموله های در جریان",
  "محموله‌های در جریان",
  "company status",
  "operations snapshot",
  "overview",
];

const COMPANY_BRAIN_DAILY_TERMS = [
  "امروز چه اتفاقی",
  "اتفاقات امروز",
  "امروز چی شد",
  "امروز چه خبر",
  "today",
  "what happened today",
];

const COMPANY_BRAIN_LATEST_TERMS = [
  "آخرین بار ثبت شده",
  "جدیدترین بار",
  "آخرین محموله",
  "آخرین پرونده",
  "latest shipment",
  "latest cargo",
];

const COMPANY_BRAIN_OPEN_ENDED_TERMS = [
  "برای",
  "درباره",
  "در مورد",
  "چی داریم",
  "چه داریم",
  "what do we have",
  "about",
  "for",
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

function stripPersianPossessive(token = "") {
  return String(token || "").replace(/(هایش|هاش|اش|ش)$/u, "");
}

function isStopToken(token = "") {
  const strippedPossessive = stripPersianPossessive(token);
  return (
    !token ||
    STOP_WORDS.has(token) ||
    BUSINESS_FIELD_STOP_WORDS.has(token) ||
    COMMAND_STOP_WORDS.has(token) ||
    HONORIFICS.has(token) ||
    /^(ها|های|هاش|هایش|اش|ش|همون|همونو|اولی)$/.test(token) ||
    (
      strippedPossessive !== token &&
      (
        !strippedPossessive ||
        STOP_WORDS.has(strippedPossessive) ||
        BUSINESS_FIELD_STOP_WORDS.has(strippedPossessive) ||
        COMMAND_STOP_WORDS.has(strippedPossessive) ||
        HONORIFICS.has(strippedPossessive)
      )
    )
  );
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

export function detectRelationIntent(message = "", context = {}) {
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
  const registryPlan = resolveHamyarQuestionPlan(message, context, context?.activeEntity);
  if (registryPlan.legacyIntent && SUPPORTED_RELATION_INTENTS.has(registryPlan.legacyIntent)) {
    return {
      intent: registryPlan.legacyIntent,
      entities: {
        shipmentRef: registryPlan.entities.shipmentRef,
        customerRef: registryPlan.entities.customerRef,
        commercialCardRef: registryPlan.entities.commercialCardRef,
      },
      confidence: Math.max(registryPlan.confidence, confidenceFor(registryPlan.legacyIntent, relationRefFromRegistryPlan(registryPlan))),
      language: registryPlan.language || language,
      relationPath: registryPlan.relationPath,
      requestedField: registryPlan.requestedField,
      requestedFields: registryPlan.requestedFields,
      preferredEntityTypes: registryPlan.preferredEntityTypes,
      registryIntent: registryPlan.intent,
      hamyarPlan: registryPlan,
    };
  }

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

function relationRefFromRegistryPlan(plan = {}) {
  return plan.entities?.shipmentRef || plan.entities?.customerRef || plan.entities?.commercialCardRef || plan.primaryEntity?.ref || "";
}

export function detectBusinessRequestedFields(message = "") {
  const normalized = normalizeAgentText(message);
  const registryPlan = resolveHamyarQuestionPlan(message);
  const hasNumber = includesAny(normalized, NUMBER_TERMS);
  const hasPhone = includesAny(normalized, PHONE_TERMS);
  const hasShipment = includesAny(normalized, SHIPMENT_TERMS);
  const hasCustomer = includesAny(normalized, CUSTOMER_TERMS);
  const hasShipmentList = includesAny(normalized, SHIPMENT_LIST_TERMS);
  const hasCard = includesAny(normalized, CARD_TERMS) || includesAny(normalized, COMMERCIAL_CARD_TERMS);
  const hasStatus = includesAny(normalized, SUMMARY_TERMS) || includesAny(normalized, SHIPMENT_STATUS_TERMS);
  const hasLocation = includesAny(normalized, LOCATION_TERMS);
  const hasAddress = includesAny(normalized, ADDRESS_TERMS);
  const hasAccounting = includesAny(normalized, ACCOUNTING_TERMS);
  const asksOwner = includesAny(normalized, CUSTOMER_OWNER_TERMS);
  const hasPersonCue = [...HONORIFICS].some((term) => normalized.includes(term));

  if (hasAccounting) return [BUSINESS_REQUESTED_FIELDS.ACCOUNTING];
  if (hasAddress) return [BUSINESS_REQUESTED_FIELDS.ADDRESS];
  if (
    hasShipmentList &&
    (
      hasCustomer ||
      registryPlan.intent === "customer.shipments.lookup" ||
      includesAny(normalized, ["این مشتری", "همین مشتری", "محموله‌هاش", "محموله هاش", "بارهاش", "بار هاش"])
    )
  ) {
    return [BUSINESS_REQUESTED_FIELDS.SHIPMENTS];
  }
  if (hasCard && hasNumber) return [BUSINESS_REQUESTED_FIELDS.COMMERCIAL_CARD_NUMBER];
  if (hasCard) return [BUSINESS_REQUESTED_FIELDS.COMMERCIAL_CARD];
  if ((hasPhone && !hasShipment) || (hasPhone && (hasCustomer || hasPersonCue)) || (hasNumber && (hasCustomer || hasPersonCue) && !hasShipment)) {
    return [BUSINESS_REQUESTED_FIELDS.PHONE];
  }
  if (hasNumber && hasShipment) return [BUSINESS_REQUESTED_FIELDS.SHIPMENT_NUMBER];
  if (hasNumber && hasCustomer) return [BUSINESS_REQUESTED_FIELDS.PHONE];
  if (asksOwner && hasShipment) return [BUSINESS_REQUESTED_FIELDS.CUSTOMER];
  if (hasLocation) return [BUSINESS_REQUESTED_FIELDS.LOCATION];
  if (hasStatus) return [BUSINESS_REQUESTED_FIELDS.STATUS];
  if (
    registryPlan.requestedField &&
    !["summary", "capability", "selection"].includes(registryPlan.requestedField)
  ) {
    return [registryPlan.requestedField];
  }
  return [BUSINESS_REQUESTED_FIELDS.SUMMARY];
}

export function detectBusinessRequestedField(message = "") {
  const [requestedField = BUSINESS_REQUESTED_FIELDS.SUMMARY] = detectBusinessRequestedFields(message);
  if (requestedField === BUSINESS_REQUESTED_FIELDS.PHONE) return BUSINESS_REQUESTED_FIELDS.CUSTOMER_PHONE;
  return requestedField;
}

export function extractBusinessSearchTerms(message = "", { maxTerms = 8 } = {}) {
  const tokens = tokenized(message)
    .map((token) => token.replace(/[%_\\]/g, ""))
    .filter((token) => token.length >= 2 || /^[A-Za-z0-9_-]+$/.test(token))
    .filter((token) => !isStopToken(token));
  if (tokens.length === 2 && tokens.every((token) => !/^\d+$/.test(token))) {
    return [`${tokens[0]} ${tokens[1]}`].slice(0, Math.min(Math.max(Number(maxTerms) || 8, 1), 12));
  }
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
  const hasDocument = includesAny(normalized, DOCUMENT_TERMS);
  const hasWorkflow = includesAny(normalized, WORKFLOW_TERMS);
  const hasCheque = includesAny(normalized, CHEQUE_TERMS);
  const hasStatus = includesAny(normalized, SUMMARY_TERMS) || requestedField === BUSINESS_REQUESTED_FIELDS.STATUS;
  const needsCustomerField = [
    BUSINESS_REQUESTED_FIELDS.CUSTOMER_PHONE,
    BUSINESS_REQUESTED_FIELDS.CUSTOMER_NUMBER,
    BUSINESS_REQUESTED_FIELDS.ADDRESS,
    BUSINESS_REQUESTED_FIELDS.ACCOUNTING,
  ].includes(requestedField);
  const types = [];

  if (hasCheque) {
    types.push(BUSINESS_ENTITY_TYPES.CHEQUE, BUSINESS_ENTITY_TYPES.CUSTOMER, BUSINESS_ENTITY_TYPES.SHIPMENT);
  } else if (hasDocument) {
    types.push(BUSINESS_ENTITY_TYPES.DOCUMENT, BUSINESS_ENTITY_TYPES.SHIPMENT, BUSINESS_ENTITY_TYPES.CUSTOMER);
  } else if (hasCard || requestedField === BUSINESS_REQUESTED_FIELDS.COMMERCIAL_CARD || requestedField === BUSINESS_REQUESTED_FIELDS.COMMERCIAL_CARD_NUMBER) {
    types.push(BUSINESS_ENTITY_TYPES.COMMERCIAL_CARD, BUSINESS_ENTITY_TYPES.CUSTOMER, BUSINESS_ENTITY_TYPES.SHIPMENT);
  } else if (hasWorkflow) {
    types.push(BUSINESS_ENTITY_TYPES.WORKFLOW_ITEM, BUSINESS_ENTITY_TYPES.SHIPMENT, BUSINESS_ENTITY_TYPES.CUSTOMER);
  } else if (requestedField === BUSINESS_REQUESTED_FIELDS.SHIPMENTS) {
    types.push(BUSINESS_ENTITY_TYPES.CUSTOMER, BUSINESS_ENTITY_TYPES.SHIPMENT);
  } else if (needsCustomerField) {
    types.push(BUSINESS_ENTITY_TYPES.CUSTOMER, BUSINESS_ENTITY_TYPES.SHIPMENT, BUSINESS_ENTITY_TYPES.COMMERCIAL_CARD);
  } else if (hasShipment && hasCustomer) {
    types.push(BUSINESS_ENTITY_TYPES.SHIPMENT, BUSINESS_ENTITY_TYPES.CUSTOMER);
  } else if (hasShipment || hasStatus) {
    types.push(BUSINESS_ENTITY_TYPES.SHIPMENT, BUSINESS_ENTITY_TYPES.CUSTOMER);
  } else if (hasCustomer) {
    types.push(BUSINESS_ENTITY_TYPES.CUSTOMER, BUSINESS_ENTITY_TYPES.SHIPMENT, BUSINESS_ENTITY_TYPES.COMMERCIAL_CARD, BUSINESS_ENTITY_TYPES.CHEQUE, BUSINESS_ENTITY_TYPES.DOCUMENT);
  } else {
    types.push(
      BUSINESS_ENTITY_TYPES.SHIPMENT,
      BUSINESS_ENTITY_TYPES.CUSTOMER,
      BUSINESS_ENTITY_TYPES.COMMERCIAL_CARD,
      BUSINESS_ENTITY_TYPES.DOCUMENT,
      BUSINESS_ENTITY_TYPES.WORKFLOW_ITEM,
      BUSINESS_ENTITY_TYPES.CHEQUE
    );
  }

  return unique(types).filter((type) => SUPPORTED_ENTITY_TYPES.has(type));
}

function alternateTermsFor(terms = []) {
  const parts = unique(terms.flatMap((term) => String(term || "").split(/\s+/)).filter(Boolean));
  if (parts.length <= 1) return [];
  const joined = parts.slice(0, 4).join(" ");
  const reversed = parts.slice(0, 4).reverse().join(" ");
  return unique([joined, reversed, ...parts.slice().reverse()]).filter((term) => !terms.includes(term)).slice(0, 6);
}

export function planBusinessSearch(message = "", context = {}) {
  const normalized = normalizeAgentText(message);
  const language = hasPersian(message) ? "fa" : "en";
  const registryPlan = resolveHamyarQuestionPlan(message, context, context?.activeEntity);
  if (!normalized) {
    return {
      intent: "empty",
      language: "unknown",
      searchBusinessContext: false,
      queryTerms: [],
      alternateQueryTerms: [],
      candidateTypes: [],
      requestedField: BUSINESS_REQUESTED_FIELDS.SUMMARY,
      requestedFields: [BUSINESS_REQUESTED_FIELDS.SUMMARY],
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
      requestedFields: [BUSINESS_REQUESTED_FIELDS.SUMMARY],
      confidence: 1,
    };
  }

  const requestedFields = detectBusinessRequestedFields(message);
  const requestedField = detectBusinessRequestedField(message);
  const extractedTerms = extractBusinessSearchTerms(message);
  const registryTerms = Array.isArray(registryPlan.queryTerms) ? registryPlan.queryTerms : [];
  const queryTerms = extractedTerms.length ? extractedTerms : registryTerms;
  const candidateTypes = unique([
    ...(Array.isArray(registryPlan.preferredEntityTypes) ? registryPlan.preferredEntityTypes : []),
    ...candidateTypesFor(message, requestedField),
  ]);
  const hasBusinessCue =
    includesAny(normalized, SHIPMENT_TERMS) ||
    includesAny(normalized, CUSTOMER_TERMS) ||
    includesAny(normalized, CARD_TERMS) ||
    includesAny(normalized, DOCUMENT_TERMS) ||
    includesAny(normalized, WORKFLOW_TERMS) ||
    includesAny(normalized, CHEQUE_TERMS) ||
    includesAny(normalized, SUMMARY_TERMS) ||
    includesAny(normalized, NUMBER_TERMS) ||
    includesAny(normalized, PHONE_TERMS) ||
    includesAny(normalized, ADDRESS_TERMS) ||
    includesAny(normalized, ACCOUNTING_TERMS) ||
    [...HONORIFICS].some((term) => normalized.includes(term));

  return {
    intent: "business_search",
    language,
    searchBusinessContext: Boolean(hasBusinessCue && queryTerms.length),
    queryTerms,
    alternateQueryTerms: alternateTermsFor(queryTerms),
    candidateTypes,
    requestedField,
    requestedFields,
    relationPath: registryPlan.relationPath || [],
    registryIntent: registryPlan.intent || "",
    hamyarPlan: registryPlan.intent ? registryPlan : null,
    needsCompanyBrain: Boolean(registryPlan.needsCompanyBrain),
    needsLiveVerification: Boolean(registryPlan.needsLiveVerification),
    liveTool: registryPlan.liveTool || "",
    confidence: queryTerms.length >= 2 ? 0.86 : hasBusinessCue ? 0.72 : 0.35,
  };
}

export function planCompanyBrainLookup(message = "", context = {}) {
  const normalized = normalizeAgentText(message);
  const language = hasPersian(message) ? "fa" : "en";
  if (!normalized || isIdentityQuestion(message)) {
    return {
      intent: COMPANY_BRAIN_LOOKUP_INTENTS.NONE,
      language,
      checkCompanyBrain: false,
      useSnapshot: false,
      searchCompanyBrain: false,
      memoryTypes: [],
      queryTerms: [],
      candidateTypes: [],
      requestedField: BUSINESS_REQUESTED_FIELDS.SUMMARY,
      requestedFields: [BUSINESS_REQUESTED_FIELDS.SUMMARY],
      confidence: 0,
    };
  }

  const businessPlan = planBusinessSearch(message, context);
  const hasStatusQuestion = includesAny(normalized, COMPANY_BRAIN_STATUS_TERMS);
  const hasTodayCue = includesAny(normalized, ["امروز", "today"]);
  const hasDailyQuestion =
    includesAny(normalized, COMPANY_BRAIN_DAILY_TERMS) ||
    (hasTodayCue && (includesAny(normalized, WORKFLOW_TERMS) || includesAny(normalized, SHIPMENT_LIST_TERMS)));
  const hasLatestQuestion = includesAny(normalized, COMPANY_BRAIN_LATEST_TERMS);
  const hasOperationalListQuestion =
    businessPlan.queryTerms.length === 0 &&
    (
      includesAny(normalized, SHIPMENT_LIST_TERMS) ||
      includesAny(normalized, WORKFLOW_TERMS) ||
      includesAny(normalized, CHEQUE_TERMS)
    );
  const hasOpenEndedEntityQuestion =
    businessPlan.queryTerms.length > 0 &&
    includesAny(normalized, COMPANY_BRAIN_OPEN_ENDED_TERMS) &&
    !businessPlan.searchBusinessContext;

  if (hasLatestQuestion) {
    return {
      ...businessPlan,
      intent: COMPANY_BRAIN_LOOKUP_INTENTS.LATEST,
      checkCompanyBrain: true,
      useSnapshot: true,
      searchCompanyBrain: false,
      memoryTypes: ["operational_snapshot", "daily_summary", "company_summary"],
      confidence: 0.88,
    };
  }

  if (hasDailyQuestion) {
    return {
      ...businessPlan,
      intent: COMPANY_BRAIN_LOOKUP_INTENTS.DAILY,
      checkCompanyBrain: true,
      useSnapshot: true,
      searchCompanyBrain: false,
      memoryTypes: ["daily_summary", "operational_snapshot"],
      confidence: 0.9,
    };
  }

  if (hasStatusQuestion || hasOperationalListQuestion) {
    return {
      ...businessPlan,
      intent: COMPANY_BRAIN_LOOKUP_INTENTS.SNAPSHOT,
      checkCompanyBrain: true,
      useSnapshot: true,
      searchCompanyBrain: false,
      memoryTypes: ["operational_snapshot", "company_summary"],
      confidence: 0.84,
    };
  }

  if (businessPlan.searchBusinessContext || hasOpenEndedEntityQuestion) {
    return {
      ...businessPlan,
      intent: COMPANY_BRAIN_LOOKUP_INTENTS.ENTITY_MEMORY,
      checkCompanyBrain: true,
      useSnapshot: false,
      searchCompanyBrain: true,
      memoryTypes: [],
      searchBusinessContext: true,
      candidateTypes: businessPlan.candidateTypes?.length
        ? businessPlan.candidateTypes
        : [
          BUSINESS_ENTITY_TYPES.SHIPMENT,
          BUSINESS_ENTITY_TYPES.CUSTOMER,
          BUSINESS_ENTITY_TYPES.COMMERCIAL_CARD,
          BUSINESS_ENTITY_TYPES.DOCUMENT,
          BUSINESS_ENTITY_TYPES.WORKFLOW_ITEM,
          BUSINESS_ENTITY_TYPES.CHEQUE,
        ],
      confidence: Math.max(businessPlan.confidence || 0, hasOpenEndedEntityQuestion ? 0.74 : 0.7),
    };
  }

  return {
    ...businessPlan,
    intent: COMPANY_BRAIN_LOOKUP_INTENTS.NONE,
    checkCompanyBrain: false,
    useSnapshot: false,
    searchCompanyBrain: false,
    memoryTypes: [],
    confidence: 0,
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
