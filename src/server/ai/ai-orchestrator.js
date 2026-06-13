import { callLlmProvider, llmProviderStatus } from "./llm-provider.js";
import {
  getActiveEmployeeCount,
  getActiveShipmentCountsByStatus,
  getBlockedShipments,
  getChequesDueSoon,
  getCustomerArchiveStatus,
  getCustomerAuditHistory,
  getCustomerChequeSummary,
  getCustomerContactInfo,
  getCustomerDetailContext,
  getCustomerDocumentsSummary,
  getCustomerOpenIssues,
  getCustomerProfile,
  getCustomerShipments,
  getCustomerVisibleDocuments,
  getCustomerVisibleTrackingSummary,
  getDailyStatusSummary,
  getDocumentCompletenessSummary,
  getLatestCurrencyRates,
  getMyActiveTasks,
  getOperationsSnapshot,
  getOrganizationActiveTasks,
  getOverdueCheques,
  getOverdueTasks,
  getRecentOrganizationActivity,
  getShipmentArchiveStatus,
  getShipmentAuditHistory,
  getShipmentCaptainInfo,
  getShipmentCustomerAccessStatus,
  getShipmentCustomerChatSummary,
  getShipmentDailyStatus,
  getShipmentDetailContext,
  getShipmentDocuments,
  getShipmentFinancialSummary,
  getShipmentFullProfile,
  getShipmentGoods,
  getShipmentImportantDates,
  getShipmentInternalChatSummary,
  getShipmentKootajDetails,
  getShipmentMalvaniAgentInfo,
  getShipmentMalvaniProfile,
  getMissingShipmentDocuments,
  getShipmentWorkflowBlockers,
  getShipmentRoute,
  getShipmentsMissingDailyUpdate,
  getShipmentWorkflowStatus,
  getTaskBasicInfo,
  getTasksByCustomer,
  getTasksByShipment,
  getTasksDueToday,
  getUnreadShipmentChats,
  getWorkflowBlockerBasicInfo,
  normalizeAiLookupCode,
  getBusinessEntityContacts,
  getCommercialCardContext,
  getChequeBasicInfo,
  getDocumentBasicInfo,
  resolveCustomerRef,
  resolveShipmentRef,
  searchBusinessContext,
  searchCustomerByCode,
  searchBusinessEntityContacts,
  searchCommercialCards,
  searchCustomersByName,
  searchDocuments,
  searchEmployees,
  searchMalvaniProfiles,
  searchShipmentByCode,
  searchShipmentsByGoods,
  searchShipmentsByText,
  searchTariffCatalog,
} from "./ai-tools.js";
import {
  BUSINESS_REQUESTED_FIELDS,
  RELATION_INTENTS,
  classifyResolutionState,
  detectRelationIntent,
  isSupportedRelationIntent,
  planCompanyBrainLookup,
  planBusinessSearch,
  verifyRelationAnswerability,
} from "./ai-context-planner.js";
import {
  STALE_MEMORY_MESSAGE,
  getCompanyBrainSnapshot,
  searchCompanyBrain,
} from "./company-brain.js";

const ASSISTANT_NAME = "همیار لاجستیک";
const CEO_ONLY_MESSAGE = "دسترسی به همیار لاجستیک در حال حاضر فقط برای مدیرعامل فعال است.";
const NO_SHIPMENT_FOUND = "محموله‌ای با این شماره در اطلاعات سازمان شما پیدا نشد.";
const NO_CUSTOMER_FOUND = "مشتری‌ای با این شماره در اطلاعات سازمان شما پیدا نشد.";
const MISSING_CAPTAIN = "برای این محموله اطلاعات ناخدا یا شماره تماس ثبت نشده است.";
const NO_CODE_DETECTED = "لطفاً شماره محموله یا شماره مشتری را بفرستید تا بررسی کنم.";
const NO_PROVIDER_MESSAGE =
  "همیار لاجستیک هنوز به سرویس هوش مصنوعی متصل نشده است. پس از تنظیم کلید سرویس، می‌توانم اطلاعات محموله‌ها و مشتریان را برای شما جستجو و خلاصه کنم.";
const RESPONSE_MODE_DIRECT = "direct_answer";
const RESPONSE_MODE_SUMMARY = "short_summary";
const RESPONSE_MODE_REPORT = "report";
const NOT_CONNECTED_MESSAGE = "این بخش هنوز برای همیار لاجستیک متصل نشده است.";

const SHIPMENT_SUGGESTIONS = [
  "وضعیت این محموله چیه؟",
  "اسنادش کامل هست؟",
  "شماره ناخدا رو بده",
  "مشتری این محموله کیه؟",
];

const CUSTOMER_SUGGESTIONS = [
  "شماره تماس مشتری رو بده",
  "محموله‌های فعالش کدومن؟",
  "آخرین محموله این مشتری چیه؟",
];

function forbidden(message = CEO_ONLY_MESSAGE) {
  const error = new Error(message);
  error.statusCode = 403;
  error.code = "FORBIDDEN";
  return error;
}

function assertCeo(user) {
  if (String(user?.role || "").toUpperCase() !== "CEO") throw forbidden();
}

function cleanText(value, fallback = "") {
  if (value === undefined || value === null) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function normalizeQueryText(value = "") {
  return normalizeAiLookupCode(value)
    .replace(/[ي]/g, "ی")
    .replace(/[ك]/g, "ک")
    .replace(/\u200c/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function source(type, { id, label, url } = {}) {
  return {
    type,
    ...(id ? { id } : {}),
    label: label || type,
    ...(url ? { url } : {}),
  };
}

function uniqueSources(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${item.type}:${item.id || ""}:${item.label}:${item.url || ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function extractCandidates(message = "") {
  const normalized = normalizeAiLookupCode(message);
  const matches = normalized.match(/[A-Za-z0-9][A-Za-z0-9\-_]{2,}/g) || [];
  return [...new Set(matches.map((item) => item.trim()).filter(Boolean))].slice(0, 8);
}

function extractRecentCandidates(recentMessages = []) {
  if (!Array.isArray(recentMessages)) return [];
  const candidates = [];
  for (const item of [...recentMessages].reverse()) {
    if (!item || typeof item.content !== "string") continue;
    candidates.push(...extractCandidates(item.content));
    if (candidates.length >= 8) break;
  }
  return [...new Set(candidates)].slice(0, 8);
}

function hasAny(text, terms) {
  return terms.some((term) => text.includes(term));
}

const AI_INTENTS = {
  MALVANI_AGENT_PHONE: "malvani_agent_phone",
  CAPTAIN_PHONE: "captain_phone",
  CUSTOMER_PHONE: "customer_phone",
  SHIPMENT_STATUS: "shipment_status",
  SHIPMENT_CUSTOMER: "shipment_customer",
  SHIPMENT_DOCUMENTS: "shipment_documents",
  SHIPMENT_GOODS: "shipment_goods",
  SHIPMENT_TASKS: "shipment_tasks",
  COMMERCIAL_CARD_INFO: "commercial_card_info",
  DAILY_STATUS: "daily_status",
  WORKFLOW_STATUS: "workflow_status",
  UNKNOWN: "unknown",
};

const ENTITY_CLUE_STOP_WORDS = new Set([
  "شماره",
  "شماره‌ش",
  "شماره‌اش",
  "شمارهش",
  "تماس",
  "تماسش",
  "تلفن",
  "تلفنش",
  "موبایل",
  "موبایلش",
  "باهاش",
  "ایجنت",
  "نماینده",
  "مخاطب",
  "هماهنگ",
  "هماهنگی",
  "ناخدا",
  "ناخدای",
  "ناخداش",
  "کاپیتان",
  "کاپیتانش",
  "ملوانی",
  "لنج",
  "محموله",
  "محموله‌هاش",
  "محمولههاش",
  "بار",
  "بارهاش",
  "پرونده",
  "پرونده‌هاش",
  "پروندههاش",
  "مشتری",
  "شرکت",
  "کارت",
  "بازرگانی",
  "وضعیت",
  "اسناد",
  "سند",
  "مدارک",
  "کالا",
  "کالای",
  "شرح",
  "وظایف",
  "وظیفه",
  "تسک",
  "روزانه",
  "جریان",
  "کار",
  "بفرست",
  "بفرستید",
  "ارسال",
  "کن",
  "کنید",
  "بده",
  "بدید",
  "بگو",
  "چیه",
  "کیه",
  "چند",
  "چنده",
  "کدام",
  "کدوم",
  "چیست",
  "هست",
  "است",
  "داره",
  "دارد",
  "دارند",
  "داشت",
  "داشته",
  "لطفا",
  "لطفاً",
  "آقای",
  "آقا",
  "خانم",
  "سرکار",
  "جناب",
  "رو",
  "را",
  "برای",
  "از",
  "به",
  "در",
  "این",
  "اون",
  "آن",
  "همون",
  "همونو",
  "اولی",
  "من",
  "هم",
  "که",
  "با",
  "توش",
  "داخلش",
  "درونش",
  "حاوی",
  "شامل",
  "دارای",
  "agent",
  "phone",
  "shipment",
  "tracking",
  "customer",
  "client",
  "status",
  "documents",
  "goods",
  "tasks",
  "workflow",
  "daily",
]);

const AGENT_TERMS = ["ایجنت", "نماینده ملوانی", "مخاطب ملوانی", "agent"];

function detectAiIntent(message = "") {
  const flags = intentFlags(message);
  const text = flags.text;
  if (hasAny(text, AGENT_TERMS)) return AI_INTENTS.MALVANI_AGENT_PHONE;
  if (flags.asksCaptainPhone) return AI_INTENTS.CAPTAIN_PHONE;
  if (flags.asksCustomerPhone) return AI_INTENTS.CUSTOMER_PHONE;
  if (flags.asksShipmentCustomer) return AI_INTENTS.SHIPMENT_CUSTOMER;
  if (flags.asksDocuments) return AI_INTENTS.SHIPMENT_DOCUMENTS;
  if (flags.asksGoods) return AI_INTENTS.SHIPMENT_GOODS;
  if (flags.asksTasks) return AI_INTENTS.SHIPMENT_TASKS;
  if (flags.asksCommercialCard) return AI_INTENTS.COMMERCIAL_CARD_INFO;
  if (flags.asksKootaj) return AI_INTENTS.DAILY_STATUS;
  if (flags.asksBlockers) return AI_INTENTS.WORKFLOW_STATUS;
  if (flags.asksShipmentStatus) return AI_INTENTS.SHIPMENT_STATUS;
  return AI_INTENTS.UNKNOWN;
}

function isIgnorableCodeCandidate(value = "") {
  const text = normalizeQueryText(value);
  return !text || ENTITY_CLUE_STOP_WORDS.has(text);
}

function extractEntityClue(message = "", codeCandidates = []) {
  const codeSet = new Set(codeCandidates.map((item) => normalizeQueryText(item)).filter(Boolean));
  const normalized = normalizeQueryText(message).replace(/[^\p{L}\p{N}\s_-]/gu, " ");
  const tokens = normalized
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => !codeSet.has(token))
    .filter((token) => !ENTITY_CLUE_STOP_WORDS.has(token))
    .filter((token) => !/^[0-9]+$/.test(token))
    .filter((token) => !/^[a-z][a-z0-9_-]*$/i.test(token));
  return tokens.join(" ").replace(/\s+/g, " ").trim();
}

function cleanNaturalClueText(value = "", codeCandidates = []) {
  return extractEntityClue(value, codeCandidates);
}

function splitShipmentReferenceText(message = "") {
  const text = normalizeQueryText(message).replace(/[^\p{L}\p{N}\s_-]/gu, " ");
  const connectors = [
    "که توش",
    "که داخلش",
    "که درونش",
    "که حاوی",
    "که شامل",
    "که دارای",
    "توش",
    "داخلش",
    "درونش",
    "حاوی",
    "شامل",
    "دارای",
    " با ",
  ];
  let best = null;
  for (const connector of connectors) {
    const index = text.indexOf(connector);
    if (index < 0) continue;
    if (!best || index < best.index) best = { index, connector };
  }
  if (!best) return { before: text, after: "" };
  return {
    before: text.slice(0, best.index),
    after: text.slice(best.index + best.connector.length),
  };
}

function resolveShipmentReferenceClues(message = "", codeCandidates = []) {
  const parts = splitShipmentReferenceText(message);
  const fullClue = cleanNaturalClueText(message, codeCandidates);
  const customerClue = cleanNaturalClueText(parts.before, codeCandidates);
  const goodsClue = cleanNaturalClueText(parts.after, codeCandidates);
  return {
    customerClue: customerClue || (!goodsClue ? fullClue : ""),
    goodsClue: goodsClue || "",
    textClue: fullClue,
  };
}

export function resolveEntityClueForIntent(message = "", intent = AI_INTENTS.UNKNOWN, context = {}) {
  const rawCandidates = extractCandidates(message);
  const codeCandidates = rawCandidates.filter((candidate) => !isIgnorableCodeCandidate(candidate));
  const shipmentClues = resolveShipmentReferenceClues(message, codeCandidates);
  return {
    intent,
    context,
    codeCandidates,
    shipmentCodes: codeCandidates,
    customerCodes: codeCandidates,
    clue: extractEntityClue(message, codeCandidates),
    shipmentClues,
  };
}

function messageHints(message = "") {
  const text = normalizeQueryText(message);
  return {
    shipment: /shipment|tracking|بار|محموله|رهگیری|ناخدا|کاپیتان|لنج|ملوانی|ایجنت/.test(text),
    customer: /customer|client|مشتری|کد مشتری|شرکت/.test(text),
  };
}

function intentFlags(message = "") {
  const text = normalizeQueryText(message);
  const asksPhone = hasAny(text, ["شماره", "تماس", "تلفن", "موبایل", "phone"]);
  const asksCaptain = hasAny(text, ["ناخدا", "کاپیتان", "ایجنت", "ملوانی", "لنج"]);
  const customerContactPossessives = [
    "تماسش",
    "تلفنش",
    "موبایلش",
    "شماره اش",
    "شماره‌اش",
    "شماره ش",
    "شماره‌ش",
    "شماره تماسش",
    "اطلاعات تماسش",
    "باهاش چطور تماس",
  ];
  const asksCustomer = hasAny(text, ["مشتری", "شرکت", ...customerContactPossessives]);
  const asksShipment = hasAny(text, ["محموله", "بار", "پرونده"]);
  const asksShipmentStatus = hasAny(text, ["وضعیت", "مرحله", "پیگیری", "کجاست", "کجاس", "status", "وضعیتش"]);
  const asksDocuments = hasAny(text, ["اسناد", "سند", "مدارک"]);
  const asksTasks = hasAny(text, ["وظایف", "وظیفه", "وظایفش", "تسک", "تسکش", "کارها", "کارهاش"]);
  const asksGoods = hasAny(text, ["کالا", "بارنامه", "شرح کالا", "goods", "commodity"]);
  const asksRoute = hasAny(text, ["مسیر", "مبدا", "مبدأ", "مقصد", "بندر", "port", "route"]);
  const asksDates = hasAny(text, ["تاریخ", "موعد", "زمان", "فری تایم", "free time", "eta", "etd"]);
  const asksArchive = hasAny(text, ["آرشیو", "خارج شده", "archive"]);
  const asksKootaj = hasAny(text, ["کوتاژ", "گمرک", "ترخیص", "اظهار", "customs", "daily"]);
  const asksBlockers = hasAny(text, ["مانع", "گیر کرده", "گیر کرده‌اند", "متوقف", "بلاک", "blocker", "blocked"]);
  const asksPublicTracking = hasAny(text, ["رهگیری مشتری", "دسترسی مشتری", "لینک رهگیری", "tracking", "public"]);
  const asksChat = hasAny(text, ["پیام", "چت", "chat", "unread"]);
  const asksAudit = hasAny(text, ["تاریخچه", "تغییر", "آخرین بار", "آخرین فعالیت", "فعالیتش", "چه کسی", "کی", "audit"]);
  const asksFinance = hasAny(text, ["مالی", "هزینه", "فاکتور", "پرداخت", "finance"]);
  const asksCommercialCard = hasAny(text, ["کارت بازرگانی", "کارتش", "commercial card"]);
  const asksCheque = hasAny(text, ["چک", "چک‌هاش", "چک هاش", "cheque", "check"]);
  const asksRate = hasAny(text, ["نرخ ارز", "دلار", "یورو", "درهم", "ارز", "currency", "rate"]);
  const asksTariff = hasAny(text, ["تعرفه", "hs", "hs code", "tariff"]);
  const asksEmployee = hasAny(text, ["کارمند", "پرسنل", "همکار", "employee", "user"]);
  const asksOperations = hasAny(text, ["عملیات", "داشبورد", "نمای کلی", "overview", "snapshot"]);
  const asksOverdue = hasAny(text, ["عقب افتاده", "معوق", "دیرکرد", "overdue"]);
  const asksDueToday = hasAny(text, ["امروز", "today"]);
  const asksMissing = hasAny(text, ["ناقص", "کامل", "کم", "ندارد", "missing", "complete"]);
  const asksCustomerShipments = hasAny(text, [
    "محموله های",
    "محموله‌های",
    "محموله هاش",
    "محموله‌هاش",
    "پرونده های",
    "پرونده‌های",
    "پرونده هاش",
    "پرونده‌هاش",
    "بارهای این مشتری",
    "بارهای فعال مشتری",
    "بار هاش",
    "بارهاش",
  ]);
  const asksLatest = hasAny(text, ["آخرین", "جدیدترین"]);
  const asksShipmentNumber = hasAny(text, ["شماره بار", "شماره محموله", "شماره پرونده", "کد محموله", "کد بار", "shipment number"]);
  const asksReport = hasAny(text, ["گزارش", "report"]);
  const asksSummary = hasAny(text, ["خلاصه", "گزارش", "پرونده", "summary"]);
  const asksCaptainPhone = asksPhone && asksCaptain;
  const asksCustomerPhone = asksPhone && (asksCustomer || hasAny(text, customerContactPossessives));

  return {
    text,
    asksPhone,
    asksCaptain,
    asksCustomer,
    asksShipment,
    asksShipmentStatus,
    asksCaptainPhone,
    asksShipmentCustomer: asksCustomer && asksShipment,
    asksCustomerPhone,
    asksDocuments,
    asksTasks,
    asksGoods,
    asksRoute,
    asksDates,
    asksArchive,
    asksKootaj,
    asksBlockers,
    asksPublicTracking,
    asksChat,
    asksAudit,
    asksFinance,
    asksCommercialCard,
    asksCheque,
    asksRate,
    asksTariff,
    asksEmployee,
    asksOperations,
    asksOverdue,
    asksDueToday,
    asksMissing,
    asksCustomerShipments,
    asksLatest,
    asksShipmentNumber,
    asksSummary,
    asksReport,
    isFollowUp: hasAny(text, [
      "این محموله",
      "این مشتری",
      "اون",
      "آن",
      "وضعیتش",
      "شماره اش",
      "شماره‌اش",
      "مشتریش",
      "اسنادش",
      "وظایفش",
      "کارتش",
      "چک‌هاش",
      "چک هاش",
      "فعالیتش",
      "تماسش",
      "تلفنش",
      "موبایلش",
      "شماره تماسش",
      "محموله هاش",
      "محموله‌هاش",
      "بار هاش",
      "بارهاش",
    ]) || asksShipmentNumber || asksShipmentStatus || asksCaptainPhone || asksCustomerPhone || asksDocuments || asksTasks || asksCustomerShipments || asksCommercialCard || asksCheque || asksGoods || asksRoute || asksDates || asksArchive || asksKootaj || asksBlockers || asksPublicTracking || asksChat || asksAudit || asksFinance,
  };
}

function labelOrMissing(value) {
  return cleanText(value) || "ثبت نشده";
}

function joinLines(lines) {
  return lines.filter(Boolean).join("\n");
}

const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const FIELD_ALIASES = {
  [BUSINESS_REQUESTED_FIELDS.PHONE]: [BUSINESS_REQUESTED_FIELDS.PHONE, BUSINESS_REQUESTED_FIELDS.CUSTOMER_PHONE],
  [BUSINESS_REQUESTED_FIELDS.CUSTOMER_PHONE]: [BUSINESS_REQUESTED_FIELDS.PHONE, BUSINESS_REQUESTED_FIELDS.CUSTOMER_PHONE],
  [BUSINESS_REQUESTED_FIELDS.STATUS]: [BUSINESS_REQUESTED_FIELDS.STATUS],
  [BUSINESS_REQUESTED_FIELDS.ADDRESS]: [BUSINESS_REQUESTED_FIELDS.ADDRESS],
  [BUSINESS_REQUESTED_FIELDS.ACCOUNTING]: [BUSINESS_REQUESTED_FIELDS.ACCOUNTING],
  [BUSINESS_REQUESTED_FIELDS.SHIPMENTS]: [BUSINESS_REQUESTED_FIELDS.SHIPMENTS],
};

function toPersianDigits(value = "") {
  return String(value).replace(/\d/g, (digit) => FA_DIGITS[Number(digit)] || digit);
}

function requestedFieldsForPlan(plan = {}) {
  const fields = Array.isArray(plan.requestedFields) ? plan.requestedFields : [];
  return [...new Set([...fields, plan.requestedField].map((field) => cleanText(field)).filter(Boolean))];
}

function planHasRequestedField(plan = {}, ...fields) {
  const requested = requestedFieldsForPlan(plan);
  const aliases = fields.flatMap((field) => FIELD_ALIASES[field] || [field]);
  return requested.some((field) => aliases.includes(field));
}

function shouldKeepBusinessAnswerDeterministic(plan = {}) {
  return planHasRequestedField(
    plan,
    BUSINESS_REQUESTED_FIELDS.PHONE,
    BUSINESS_REQUESTED_FIELDS.STATUS,
    BUSINESS_REQUESTED_FIELDS.ADDRESS,
    BUSINESS_REQUESTED_FIELDS.ACCOUNTING
  );
}

function formatCustomerPhones(customer) {
  const phoneNumbers = Array.isArray(customer?.phoneNumbers) ? customer.phoneNumbers : [];
  const formatted = phoneNumbers
    .map((phone) => {
      const phoneNumber = cleanText(phone?.phoneNumber);
      if (!phoneNumber) return "";
      const phoneLabel = cleanText(phone?.phoneLabel);
      return phoneLabel ? `${phoneNumber} (${phoneLabel})` : phoneNumber;
    })
    .filter(Boolean);
  if (!formatted.length && cleanText(customer?.phone)) formatted.push(cleanText(customer.phone));
  return formatted;
}

function shipmentStatusText(shipment, workflow) {
  const currentStep =
    cleanText(workflow?.currentStep?.label) ||
    cleanText(shipment.currentStep) ||
    cleanText(shipment.currentStatus);
  const status = labelOrMissing(shipment.currentStatus || shipment.status);
  return currentStep && currentStep !== status ? `${status} / ${currentStep}` : status;
}

function activeShipmentEntity(shipment) {
  return {
    type: "shipment",
    id: shipment.id,
    code: shipment.shipmentCode,
    label: `محموله ${shipment.shipmentCode}`,
  };
}

function activeCustomerEntity(customer) {
  return {
    type: "customer",
    id: customer.id,
    code: customer.customerCode,
    label: customer.companyName || customer.contactName || `مشتری ${customer.customerCode}`,
  };
}

function activeCustomerEntityFromShipment(shipment) {
  if (!shipment.customerId) return null;
  return {
    type: "customer",
    id: shipment.customerId,
    code: shipment.customerCode || shipment.customerId,
    label: shipment.customerName || `مشتری ${shipment.customerCode || shipment.customerId}`,
  };
}

function suggestionsForActiveEntity(entity) {
  if (entity?.type === "shipment") return SHIPMENT_SUGGESTIONS;
  if (entity?.type === "customer") return CUSTOMER_SUGGESTIONS;
  return [];
}

function toneForIntent(flags, queryType = "") {
  if (String(queryType).includes("followup")) return "conversational";
  return flags.isFollowUp && !queryType ? "conversational" : "direct";
}

function customerPhoneAnswer(customer, labelPrefix = "شماره تماس مشتری") {
  const phoneLines = formatCustomerPhones(customer);
  if (!phoneLines.length) return `${labelPrefix} ${labelOrMissing(customer?.customerCode)} ثبت نشده است.`;
  return `${labelPrefix} ${labelOrMissing(customer?.customerCode)}: ${phoneLines.join("، ")}`;
}

function shipmentAnswer({ shipment, captain, workflow, customerProfile, message }) {
  const flags = intentFlags(message);
  const code = shipment.shipmentCode;
  const statusLine = `وضعیت محموله ${code}: ${shipmentStatusText(shipment, workflow)}.`;
  const customerLine = `مشتری محموله ${code}: ${labelOrMissing(shipment.customerName)}${shipment.customerCode ? ` (${shipment.customerCode})` : ""}.`;
  const captainLine = captain?.captainPhone
    ? `شماره تماس ناخدای محموله ${code}: ${captain.captainPhone}${captain.captainName ? ` (${captain.captainName})` : ""}`
    : `${MISSING_CAPTAIN}${captain?.captainName ? ` نام ثبت‌شده: ${captain.captainName}.` : ""}`;

  if (flags.asksCustomerPhone && !flags.asksCaptainPhone) {
    if (customerProfile) return customerPhoneAnswer(customerProfile, `شماره تماس مشتری محموله ${code}`);
    return `برای مشتری محموله ${code} شماره تماس ثبت نشده است.`;
  }

  if (flags.asksShipmentNumber) return `شماره محموله: ${labelOrMissing(code)}.`;
  if (flags.asksShipmentCustomer && !flags.asksShipmentStatus && !flags.asksCaptainPhone) return customerLine;
  if (flags.asksCaptainPhone && flags.asksShipmentStatus) return joinLines([customerLine, statusLine, captainLine]);
  if (flags.asksCaptainPhone) return captainLine;
  if (flags.asksShipmentStatus) return statusLine;
  if (flags.asksDocuments) return `برای بررسی کامل بودن اسناد محموله ${code} هنوز ابزار خواندن اسناد در همیار فعال نیست.`;
  if (flags.asksTasks) return `برای بررسی وظایف محموله ${code} هنوز ابزار خواندن وظایف در همیار فعال نیست.`;

  const route = [
    cleanText(shipment.route?.origin),
    cleanText(shipment.route?.dischargePort),
    cleanText(shipment.route?.deliveryPort) || cleanText(shipment.route?.destination),
  ].filter(Boolean).join(" → ");
  const blockerLine = workflow?.blockers?.length
    ? `مانع باز: ${workflow.blockers.map((item) => item.label || item.code).join("، ")}`
    : "";

  return joinLines([
    `خلاصه محموله ${code}:`,
    customerLine,
    statusLine,
    route ? `مسیر: ${route}` : "",
    captainLine,
    blockerLine,
  ]);
}

function customerShipmentsAnswer(customer, shipments, { latestOnly = false } = {}) {
  if (!shipments.length) return `برای مشتری ${customer.customerCode} محموله فعالی در دسترس نیست.`;
  const selected = latestOnly ? shipments.slice(0, 1) : shipments.slice(0, 4);
  const lines = selected.map((item) => `${item.shipmentCode}: ${labelOrMissing(item.currentStatus || item.status)}`);
  return latestOnly
    ? `آخرین محموله مشتری ${customer.customerCode}: ${lines[0]}`
    : `محموله‌های فعال مشتری ${customer.customerCode}:\n${lines.join("\n")}`;
}

function customerAnswer({ customer, shipments, message }) {
  const flags = intentFlags(message);

  if (flags.asksCustomerPhone) return customerPhoneAnswer(customer);
  if (flags.asksCustomerShipments || (flags.asksShipment && !flags.asksSummary)) {
    return customerShipmentsAnswer(customer, shipments, { latestOnly: flags.asksLatest });
  }
  if (flags.asksShipmentStatus) return `وضعیت مشتری ${customer.customerCode}: ${labelOrMissing(customer.status)}.`;

  const shipmentLines = shipments.length
    ? shipments
      .slice(0, 5)
      .map((item) => `- ${item.shipmentCode}: ${labelOrMissing(item.currentStatus || item.status)}`)
      .join("\n")
    : "برای این مشتری محموله فعالی در دسترس نیست.";

  const phoneLines = formatCustomerPhones(customer);

  return joinLines([
    `خلاصه مشتری ${customer.customerCode}:`,
    `نام شرکت: ${labelOrMissing(customer.companyName)}`,
    `شخص تماس: ${labelOrMissing(customer.contactName)}`,
    phoneLines.length ? `شماره تماس: ${phoneLines.join("، ")}` : "شماره تماس ثبت نشده است.",
    `وضعیت: ${labelOrMissing(customer.status)}`,
    "آخرین محموله‌ها:",
    shipmentLines,
  ]);
}

function responseModeForFlags(flags) {
  if (flags.asksReport) return RESPONSE_MODE_REPORT;
  if (flags.asksSummary) return RESPONSE_MODE_SUMMARY;
  return RESPONSE_MODE_DIRECT;
}

function itemList(items, formatter, emptyText) {
  if (!items?.length) return emptyText;
  return items.map(formatter).filter(Boolean).join("\n");
}

function compactDate(value) {
  return labelOrMissing(value);
}

function formatTaskLine(task) {
  return `- ${labelOrMissing(task.title)} / ${labelOrMissing(task.status)} / مسئول: ${labelOrMissing(task.assignedToName)} / موعد: ${compactDate(task.dueAt)}`;
}

function formatDocumentLine(doc) {
  return `- ${labelOrMissing(doc.title || doc.fileName)} / نوع: ${labelOrMissing(doc.contentType || doc.mimeType)} / نمایش به مشتری: ${doc.customerVisible ? "بله" : "خیر"}`;
}

function formatShipmentLine(item) {
  return `- ${labelOrMissing(item.shipmentCode)} / ${labelOrMissing(item.currentStatus || item.status)} / مشتری: ${labelOrMissing(item.customerName || item.customerCode)}`;
}

function formatChequeLine(item) {
  return `- ${labelOrMissing(item.chequeNumber)} / ${labelOrMissing(item.amount)} ${labelOrMissing(item.currency)} / سررسید: ${compactDate(item.dueDate)} / وضعیت: ${labelOrMissing(item.status)}`;
}

function formatRateLine(item) {
  return `- ${labelOrMissing(item.currencyCode)} ${labelOrMissing(item.marketType)}: ${labelOrMissing(item.price || item.sellRate || item.buyRate)} ${labelOrMissing(item.unit)}`;
}

function formatTariffLine(item) {
  return `- ${labelOrMissing(item.tariffCode)} / ${labelOrMissing(item.titleFa || item.titleEn)} / حقوق ورودی: ${labelOrMissing(item.dutyRate)} / مالیات: ${labelOrMissing(item.taxRate)}`;
}

function formatAuditLine(item) {
  return `- ${labelOrMissing(item.eventType)} / ${labelOrMissing(item.actorName)} / ${compactDate(item.createdAt)}`;
}

function formatChatLine(item) {
  return `- ${labelOrMissing(item.senderName)}: ${labelOrMissing(item.content)} / ${compactDate(item.createdAt)}`;
}

function shipmentToolSource(shipment) {
  return source("shipment", { id: shipment.id, label: `محموله ${shipment.shipmentCode}`, url: shipment.actionUrl });
}

function customerToolSource(customer) {
  return source("customer", { id: customer.id, label: customer.companyName || customer.customerCode, url: customer.actionUrl });
}

function isAgentContact(contact = {}) {
  return /agent|ایجنت|نماینده|هماهنگ/i.test(
    `${contact.contactName || ""} ${contact.roleTitle || ""} ${contact.phoneLabel || ""}`
  );
}

function findAgentContact(contacts = []) {
  return contacts.find(isAgentContact) || null;
}

function malvaniAgentClarification(clue, toolsCalled = []) {
  return {
    handled: true,
    data: {
      answer: `برای پیدا کردن ایجنت ملوانی، «${clue}» را بررسی کردم اما محموله یا ملوانی مرتبط پیدا نشد. لطفاً شماره محموله یا نام کامل مشتری/ملوانی را بفرستید.`,
      tone: "clarification",
      responseMode: RESPONSE_MODE_DIRECT,
      sources: [source("system", { label: "جستجوی ایجنت ملوانی" })],
      suggestions: [],
    },
    audit: { queryType: AI_INTENTS.MALVANI_AGENT_PHONE, toolsCalled, recordIds: [], success: false },
  };
}

function malvaniAgentDirectResult({ answer, sources = [], toolsCalled = [], recordIds = [], activeEntity = null }) {
  return {
    handled: true,
    data: {
      answer,
      tone: "direct",
      responseMode: RESPONSE_MODE_DIRECT,
      ...(activeEntity ? { activeEntity } : {}),
      suggestions: suggestionsForActiveEntity(activeEntity),
      sources: uniqueSources(sources.length ? sources : [source("malvani", { label: "ایجنت ملوانی" })]),
    },
    audit: { queryType: AI_INTENTS.MALVANI_AGENT_PHONE, toolsCalled, recordIds, success: true },
  };
}

function shipmentEntityCandidate(shipment) {
  return {
    type: "shipment",
    id: shipment.id,
    label: shipment.shipmentCode,
    customerId: shipment.customerId,
    customerName: shipment.customerName,
    customerCode: shipment.customerCode,
    malvaniProfileId: shipment.malvaniProfileId,
    actionUrl: shipment.actionUrl,
  };
}

function customerEntityCandidate(customer) {
  return {
    type: "customer",
    id: customer.id,
    label: customer.companyName || customer.contactName || customer.customerCode,
    customerCode: customer.customerCode,
    actionUrl: customer.actionUrl,
  };
}

function malvaniEntityCandidate(profile) {
  return {
    type: "malvani",
    id: profile.id,
    label: profile.displayName || profile.lenjName || profile.captainName || profile.id,
    captainName: profile.captainName,
    actionUrl: profile.actionUrl,
  };
}

function contactEntityCandidate(contact) {
  return {
    type: "business_contact",
    id: contact.id,
    label: contact.contactName || contact.phoneNumber || contact.id,
    entityType: contact.entityType,
    entityId: contact.entityId,
    entityLabel: contact.entityLabel,
    roleTitle: contact.roleTitle,
    phoneNumber: contact.phoneNumber,
    phoneLabel: contact.phoneLabel,
    actionUrl: contact.actionUrl,
  };
}

function commercialCardEntityCandidate(card) {
  return {
    type: "commercial_card",
    id: card.id,
    label: card.displayName || card.cardNumber || card.id,
    cardNumber: card.cardNumber,
    actionUrl: card.actionUrl,
  };
}

function entityCandidateKey(candidate) {
  return `${candidate.type}:${candidate.id || candidate.entityType || ""}:${candidate.entityId || ""}:${candidate.label || ""}`;
}

function uniqueEntityCandidates(candidates = []) {
  const seen = new Set();
  const unique = [];
  for (const candidate of candidates) {
    const key = entityCandidateKey(candidate);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(candidate);
  }
  return unique;
}

function formatEntityChoice(candidate) {
  if (candidate.type === "shipment") {
    return `- محموله ${labelOrMissing(candidate.label)} — مشتری ${labelOrMissing(candidate.customerName || candidate.customerCode)}`;
  }
  if (candidate.type === "customer") {
    return `- مشتری ${labelOrMissing(candidate.label)}${candidate.customerCode ? ` — ${candidate.customerCode}` : ""}`;
  }
  if (candidate.type === "malvani") {
    return `- ملوانی ${labelOrMissing(candidate.label)}${candidate.captainName ? ` — ناخدا ${candidate.captainName}` : ""}`;
  }
  if (candidate.type === "business_contact") {
    const typeLabel = candidate.entityType === "malvani" ? "ملوانی" : "کارت بازرگانی";
    return `- ${typeLabel} ${labelOrMissing(candidate.entityLabel)} — مخاطب ${labelOrMissing(candidate.label)}`;
  }
  if (candidate.type === "commercial_card") {
    return `- کارت بازرگانی ${labelOrMissing(candidate.label)}${candidate.cardNumber ? ` — ${candidate.cardNumber}` : ""}`;
  }
  return `- ${labelOrMissing(candidate.label)}`;
}

function ambiguousEntityResolutionResult(clue, candidates, toolsCalled = [], options = {}) {
  const optionLines = candidates.slice(0, 5).map(formatEntityChoice);
  return {
    handled: true,
    data: {
      answer: joinLines([
        `چند مورد مرتبط با «${clue}» پیدا شد. لطفاً مشخص کنید منظورتان کدام است:`,
        ...optionLines,
      ]),
      tone: "clarification",
      responseMode: RESPONSE_MODE_DIRECT,
      sources: [source("system", { label: options.sourceLabel || "رفع ابهام ایجنت ملوانی" })],
      suggestions: [],
    },
    audit: {
      queryType: options.queryType || `${AI_INTENTS.MALVANI_AGENT_PHONE}_ambiguous`,
      toolsCalled,
      recordIds: candidates.slice(0, 5).map((candidate) => candidate.id).filter(Boolean),
      success: false,
    },
  };
}

function noGeneralShipmentResolutionResult(clue, toolsCalled = []) {
  const checked = cleanText(clue) ? `«${clue}» را در ` : "";
  return {
    handled: true,
    data: {
      answer: `برای پیدا کردن محموله، ${checked}کد/شماره محموله، مشتری، کالا و فیلدهای مرتبط بررسی کردم اما مورد مرتبط پیدا نشد. لطفاً شماره محموله، نام دقیق مشتری یا شرح دقیق‌تر کالا را بفرستید.`,
      tone: "clarification",
      responseMode: RESPONSE_MODE_DIRECT,
      sources: [source("system", { label: "جستجوی گسترده محموله" })],
      suggestions: [],
    },
    audit: {
      queryType: "shipment_entity_resolution",
      toolsCalled,
      recordIds: [],
      success: false,
    },
  };
}

function shipmentResolutionNeedsIntentResult(shipment, toolsCalled = []) {
  const activeEntity = activeShipmentEntity(shipment);
  return {
    handled: true,
    data: {
      answer: `محموله ${shipment.shipmentCode} را پیدا کردم. چه اطلاعاتی از آن می‌خواهید؟`,
      tone: "clarification",
      responseMode: RESPONSE_MODE_DIRECT,
      activeEntity,
      suggestions: suggestionsForActiveEntity(activeEntity),
      sources: [shipmentToolSource(shipment)],
    },
    audit: {
      queryType: "shipment_entity_resolution_clarification",
      toolsCalled,
      recordIds: [shipment.id, shipment.customerId].filter(Boolean),
      success: true,
    },
  };
}

function hasExplicitShipmentDetailIntent(flags, intent) {
  if (intent && intent !== AI_INTENTS.UNKNOWN) return true;
  return Boolean(
    flags.asksShipmentStatus ||
    flags.asksShipmentCustomer ||
    flags.asksCustomerPhone ||
    flags.asksCaptainPhone ||
    flags.asksDocuments ||
    flags.asksTasks ||
    flags.asksGoods ||
    flags.asksRoute ||
    flags.asksDates ||
    flags.asksArchive ||
    flags.asksKootaj ||
    flags.asksBlockers ||
    flags.asksPublicTracking ||
    flags.asksChat ||
    flags.asksAudit ||
    flags.asksFinance ||
    flags.asksCommercialCard
  );
}

function shouldAttemptGeneralShipmentResolution(flags, intent, resolution) {
  if (intent === AI_INTENTS.MALVANI_AGENT_PHONE) return false;
  const clues = resolution?.shipmentClues || {};
  return Boolean(
    flags.asksShipment ||
    flags.asksGoods ||
    flags.asksCaptainPhone ||
    (flags.asksDocuments && flags.asksShipment) ||
    (flags.asksTasks && flags.asksShipment) ||
    (flags.asksShipmentStatus && (flags.asksShipment || clues.customerClue || clues.goodsClue)) ||
    (clues.customerClue && clues.goodsClue)
  );
}

async function answerResolvedShipmentReference(pool, context, shipmentCandidate, message, toolsCalled = [], queryType = "shipment_entity_resolution") {
  toolsCalled.push("getShipmentFullProfile");
  const shipment = await getShipmentFullProfile(pool, context, { shipmentId: shipmentCandidate.id });
  if (!shipment) return null;

  const flags = intentFlags(message);
  const intent = detectAiIntent(message);
  if (!hasExplicitShipmentDetailIntent(flags, intent)) {
    return shipmentResolutionNeedsIntentResult(shipment, toolsCalled);
  }

  return answerShipmentById(pool, context, shipment.id, {
    message,
    toolsCalled,
    queryType,
  });
}

function shipmentCandidatesFromRows(rows = [], fallbackCustomer = null) {
  return rows.map((item) => shipmentEntityCandidate({
    ...item,
    customerName: item.customerName || fallbackCustomer?.label || fallbackCustomer?.companyName || fallbackCustomer?.contactName,
    customerCode: item.customerCode || fallbackCustomer?.customerCode,
    customerId: item.customerId || fallbackCustomer?.id,
  }));
}

async function resolveCustomerShipmentReference(pool, context, customer, clues, message, toolsCalled) {
  const customerCandidate = customerEntityCandidate(customer);
  if (clues.goodsClue) {
    toolsCalled.push("searchShipmentsByGoods");
    const goodsShipments = await searchShipmentsByGoods(pool, context, {
      query: clues.goodsClue,
      customerIds: [customer.id],
      limit: 6,
    });
    const candidates = uniqueEntityCandidates(shipmentCandidatesFromRows(goodsShipments, customerCandidate));
    if (candidates.length === 1) {
      return answerResolvedShipmentReference(pool, context, candidates[0], message, toolsCalled);
    }
    if (candidates.length > 1) {
      return ambiguousEntityResolutionResult(clues.goodsClue || clues.customerClue, candidates, toolsCalled, {
        sourceLabel: "رفع ابهام محموله",
        queryType: "shipment_entity_resolution_ambiguous",
      });
    }
    return null;
  }

  if (intentFlags(message).asksCustomerShipments) {
    return answerCustomerById(pool, context, customer.id, {
      message,
      toolsCalled: [...toolsCalled, "getCustomerProfile"],
      queryType: "customer",
    });
  }

  toolsCalled.push("getCustomerShipments");
  const shipments = await getCustomerShipments(pool, context, { customerId: customer.id });
  const candidates = uniqueEntityCandidates(shipmentCandidatesFromRows(shipments, customerCandidate));
  if (candidates.length === 1) return answerResolvedShipmentReference(pool, context, candidates[0], message, toolsCalled);
  if (candidates.length > 1) {
    return ambiguousEntityResolutionResult(clues.customerClue || customerCandidate.label, candidates, toolsCalled, {
      sourceLabel: "رفع ابهام محموله",
      queryType: "shipment_entity_resolution_ambiguous",
    });
  }
  return null;
}

async function answerGeneralShipmentReference(pool, context, resolution, message) {
  const flags = intentFlags(message);
  const intent = resolution.intent;
  if (!shouldAttemptGeneralShipmentResolution(flags, intent, resolution)) return null;

  const clues = resolution.shipmentClues || {};
  const broadClue = clues.goodsClue || clues.customerClue || clues.textClue || resolution.clue;
  const toolsCalled = [];

  for (const shipmentCode of resolution.shipmentCodes || []) {
    toolsCalled.push("searchShipmentByCode");
    const shipment = await searchShipmentByCode(pool, context, { shipmentCode });
    if (shipment) {
      return answerResolvedShipmentReference(pool, context, shipmentEntityCandidate(shipment), message, toolsCalled);
    }
  }

  for (const customerCode of resolution.customerCodes || []) {
    toolsCalled.push("searchCustomerByCode");
    const customer = await searchCustomerByCode(pool, context, { customerCode });
    if (!customer) continue;
    const result = await resolveCustomerShipmentReference(pool, context, customer, clues, message, toolsCalled);
    if (result) return result;
  }

  if (clues.customerClue) {
    toolsCalled.push("searchCustomersByName");
    const customers = await searchCustomersByName(pool, context, { query: clues.customerClue, limit: 5 });
    if (customers.length === 1) {
      const result = await resolveCustomerShipmentReference(pool, context, customers[0], clues, message, toolsCalled);
      if (result) return result;
      return noGeneralShipmentResolutionResult(broadClue, toolsCalled);
    }
    if (customers.length > 1 && clues.goodsClue) {
      toolsCalled.push("searchShipmentsByGoods");
      const shipments = await searchShipmentsByGoods(pool, context, {
        query: clues.goodsClue,
        customerIds: customers.map((customer) => customer.id),
        limit: 6,
      });
      const candidates = uniqueEntityCandidates(shipmentCandidatesFromRows(shipments));
      if (candidates.length === 1) return answerResolvedShipmentReference(pool, context, candidates[0], message, toolsCalled);
      if (candidates.length > 1) {
        return ambiguousEntityResolutionResult(broadClue, candidates, toolsCalled, {
          sourceLabel: "رفع ابهام محموله",
          queryType: "shipment_entity_resolution_ambiguous",
        });
      }
      return noGeneralShipmentResolutionResult(broadClue, toolsCalled);
    }
    if (customers.length > 1) {
      return ambiguousEntityResolutionResult(clues.customerClue, customers.map(customerEntityCandidate), toolsCalled, {
        sourceLabel: "رفع ابهام مشتری",
        queryType: "shipment_entity_customer_ambiguous",
      });
    }
  }

  if (clues.goodsClue) {
    toolsCalled.push("searchShipmentsByGoods");
    const goodsShipments = await searchShipmentsByGoods(pool, context, { query: clues.goodsClue, limit: 6 });
    const candidates = uniqueEntityCandidates(shipmentCandidatesFromRows(goodsShipments));
    if (candidates.length === 1) return answerResolvedShipmentReference(pool, context, candidates[0], message, toolsCalled);
    if (candidates.length > 1) {
      return ambiguousEntityResolutionResult(clues.goodsClue, candidates, toolsCalled, {
        sourceLabel: "رفع ابهام محموله",
        queryType: "shipment_entity_resolution_ambiguous",
      });
    }
  }

  if (clues.textClue) {
    toolsCalled.push("searchShipmentsByText");
    const shipments = await searchShipmentsByText(pool, context, { query: clues.textClue, limit: 6 });
    const candidates = uniqueEntityCandidates(shipmentCandidatesFromRows(shipments));
    if (candidates.length === 1) return answerResolvedShipmentReference(pool, context, candidates[0], message, toolsCalled);
    if (candidates.length > 1) {
      return ambiguousEntityResolutionResult(clues.textClue, candidates, toolsCalled, {
        sourceLabel: "رفع ابهام محموله",
        queryType: "shipment_entity_resolution_ambiguous",
      });
    }
  }

  return noGeneralShipmentResolutionResult(broadClue, toolsCalled);
}

function malvaniAgentAnswerFromContact({ phone, name, label }) {
  if (phone) return `شماره ایجنت ملوانی: ${phone}${name ? ` (${name})` : ""}`;
  return `برای ${labelOrMissing(label)} شماره ایجنت ملوانی ثبت نشده است.`;
}

async function answerMalvaniProfileAgent(pool, context, profileCandidate, toolsCalled = []) {
  toolsCalled.push("getBusinessEntityContacts");
  const contacts = await getBusinessEntityContacts(pool, context, {
    entityType: "malvani",
    entityId: profileCandidate.id,
  });
  const agent = findAgentContact(contacts);
  return malvaniAgentDirectResult({
    answer: malvaniAgentAnswerFromContact({
      phone: agent?.phoneNumber,
      name: agent?.contactName,
      label: `ملوانی ${profileCandidate.label}`,
    }),
    sources: [source("malvani", { id: profileCandidate.id, label: profileCandidate.label, url: profileCandidate.actionUrl })],
    toolsCalled,
    recordIds: [profileCandidate.id],
  });
}

async function answerBusinessContactAgent(pool, context, contactCandidate, toolsCalled = []) {
  if (contactCandidate.entityType !== "malvani") return null;
  if (isAgentContact(contactCandidate)) {
    return malvaniAgentDirectResult({
      answer: malvaniAgentAnswerFromContact({
        phone: contactCandidate.phoneNumber,
        name: contactCandidate.label,
        label: `ملوانی ${contactCandidate.entityLabel}`,
      }),
      sources: [source("malvani", { id: contactCandidate.entityId, label: contactCandidate.entityLabel, url: contactCandidate.actionUrl })],
      toolsCalled,
      recordIds: [contactCandidate.entityId, contactCandidate.id].filter(Boolean),
    });
  }
  return answerMalvaniProfileAgent(
    pool,
    context,
    {
      id: contactCandidate.entityId,
      label: contactCandidate.entityLabel,
      actionUrl: contactCandidate.actionUrl,
    },
    toolsCalled
  );
}

async function answerCustomerMalvaniAgent(pool, context, customerCandidate, toolsCalled = [], clue = "") {
  toolsCalled.push("getCustomerShipments");
  const shipments = await getCustomerShipments(pool, context, { customerId: customerCandidate.id });
  if (!shipments.length) return malvaniAgentClarification(clue || customerCandidate.label, toolsCalled);
  if (shipments.length > 1) {
    return ambiguousEntityResolutionResult(
      clue || customerCandidate.label,
      shipments.map(shipmentEntityCandidate),
      toolsCalled
    );
  }
  return answerShipmentById(pool, context, shipments[0].id, {
    message: "شماره ایجنت ملوانی را بده",
    toolsCalled: [...toolsCalled, "getShipmentFullProfile"],
    queryType: AI_INTENTS.MALVANI_AGENT_PHONE,
  });
}

async function answerMalvaniAgentByEntityCandidate(pool, context, candidate, toolsCalled = [], clue = "") {
  if (candidate.type === "shipment") {
    return answerShipmentById(pool, context, candidate.id, {
      message: "شماره ایجنت ملوانی را بده",
      toolsCalled: [...toolsCalled, "getShipmentFullProfile"],
      queryType: AI_INTENTS.MALVANI_AGENT_PHONE,
    });
  }
  if (candidate.type === "malvani") return answerMalvaniProfileAgent(pool, context, candidate, toolsCalled);
  if (candidate.type === "business_contact") return answerBusinessContactAgent(pool, context, candidate, toolsCalled);
  if (candidate.type === "customer") return answerCustomerMalvaniAgent(pool, context, candidate, toolsCalled, clue);
  return null;
}

async function answerResolvedEntityIntent(pool, context, resolution, message) {
  if (resolution.intent !== AI_INTENTS.MALVANI_AGENT_PHONE) return null;

  for (const shipmentCode of resolution.shipmentCodes) {
    const result = await answerShipment(pool, context, shipmentCode, {
      message,
      queryType: AI_INTENTS.MALVANI_AGENT_PHONE,
    });
    if (result?.audit?.success) return result;
  }

  const clue = cleanText(resolution.clue);
  if (!clue) return null;

  const toolsCalled = [
    "searchShipmentsByText",
    "searchMalvaniProfiles",
    "searchBusinessEntityContacts",
    "searchCustomersByName",
    "searchCommercialCards",
  ];
  const [shipments, malvaniProfiles, contacts, customers, commercialCards] = await Promise.all([
    searchShipmentsByText(pool, context, { query: clue, limit: 5 }),
    searchMalvaniProfiles(pool, context, { query: clue, limit: 5 }),
    searchBusinessEntityContacts(pool, context, { query: clue, limit: 5 }),
    searchCustomersByName(pool, context, { query: clue, limit: 5 }),
    searchCommercialCards(pool, context, { query: clue, limit: 5 }),
  ]);

  const shipmentCustomerIds = new Set(shipments.map((shipment) => shipment.customerId).filter(Boolean));
  const shipmentMalvaniIds = new Set(shipments.map((shipment) => shipment.malvaniProfileId).filter(Boolean));
  const contactMalvaniIds = new Set(
    contacts
      .filter((contact) => contact.entityType === "malvani")
      .map((contact) => contact.entityId)
      .filter(Boolean)
  );

  const candidates = uniqueEntityCandidates([
    ...shipments.map(shipmentEntityCandidate),
    ...malvaniProfiles
      .filter((profile) => !shipmentMalvaniIds.has(profile.id) && !contactMalvaniIds.has(profile.id))
      .map(malvaniEntityCandidate),
    ...contacts.map(contactEntityCandidate),
    ...customers
      .filter((customer) => !shipmentCustomerIds.has(customer.id))
      .map(customerEntityCandidate),
    ...commercialCards.map(commercialCardEntityCandidate),
  ]);

  if (!candidates.length) return malvaniAgentClarification(clue, toolsCalled);
  if (candidates.length > 1) return ambiguousEntityResolutionResult(clue, candidates, toolsCalled);

  const resolved = await answerMalvaniAgentByEntityCandidate(pool, context, candidates[0], toolsCalled, clue);
  return resolved || malvaniAgentClarification(clue, toolsCalled);
}

async function focusedShipmentAnswer(pool, context, { shipment, captain, workflow, customerProfile, message, toolsCalled }) {
  const flags = intentFlags(message);
  const code = shipment.shipmentCode;
  const text = flags.text;
  const sources = [shipmentToolSource(shipment)];

  if (flags.asksCommercialCard) {
    return {
      answer: `اطلاعات کارت بازرگانی محموله ${code} هنوز به صورت مستقل برای همیار لاجستیک متصل نشده است.`,
      sources: [...sources, source("system", { label: "کارت بازرگانی" })],
    };
  }

  if (flags.asksGoods) {
    toolsCalled.push("getShipmentGoods");
    const goods = await getShipmentGoods(pool, context, { shipmentId: shipment.id });
    const rows = Array.isArray(goods?.goodsRows) ? goods.goodsRows : [];
    return {
      answer: rows.length
        ? `کالای محموله ${code}:\n${rows.slice(0, 6).map((item) => `- ${labelOrMissing(item.description || item.goodsDescription || item.title)} / تعداد: ${labelOrMissing(item.quantity)} / وزن: ${labelOrMissing(item.weight || item.grossWeight)}`).join("\n")}`
        : `برای محموله ${code} شرح کالای قابل خواندن ثبت نشده است.`,
      sources,
    };
  }

  if (flags.asksRoute) {
    toolsCalled.push("getShipmentRoute");
    const routeInfo = await getShipmentRoute(pool, context, { shipmentId: shipment.id });
    const route = routeInfo?.route || shipment.route || {};
    const routeText = [
      cleanText(route.origin),
      cleanText(route.dischargePort),
      cleanText(route.deliveryPort) || cleanText(route.destination),
    ].filter(Boolean).join(" → ");
    return {
      answer: routeText
        ? `مسیر محموله ${code}: ${routeText}.`
        : `برای محموله ${code} مسیر کامل ثبت نشده است.`,
      sources,
    };
  }

  if (flags.asksDates) {
    toolsCalled.push("getShipmentImportantDates");
    const dates = await getShipmentImportantDates(pool, context, { shipmentId: shipment.id });
    const operationalDates = dates?.operationalDates || {};
    return {
      answer: joinLines([
        `تاریخ‌های مهم محموله ${code}:`,
        `ETA: ${compactDate(operationalDates.eta || operationalDates.estimatedArrival)}`,
        `ETD: ${compactDate(operationalDates.etd || operationalDates.departureDate)}`,
        `آخرین بروزرسانی عمومی: ${compactDate(operationalDates.latestPublicUpdateAt)}`,
        `آخرین بروزرسانی پرونده: ${compactDate(dates?.updatedAt || shipment.updatedAt)}`,
      ]),
      sources,
    };
  }

  if (flags.asksArchive) {
    toolsCalled.push("getShipmentArchiveStatus");
    const archive = await getShipmentArchiveStatus(pool, context, { shipmentId: shipment.id });
    return {
      answer: joinLines([
        `وضعیت آرشیو محموله ${code}: ${labelOrMissing(archive?.archiveStatus || "active")}.`,
        archive?.archivedAt ? `تاریخ آرشیو: ${archive.archivedAt}` : "",
        archive?.exitedArchivedAt ? `تاریخ خروج از آرشیو: ${archive.exitedArchivedAt}` : "",
        archive?.exitedArchiveReason ? `دلیل خروج: ${archive.exitedArchiveReason}` : "",
      ]),
      sources: [...sources, source("archive", { id: shipment.id, label: "وضعیت آرشیو", url: shipment.actionUrl })],
    };
  }

  if (flags.asksKootaj) {
    toolsCalled.push(flags.asksMissing ? "getShipmentKootajDetails" : "getShipmentDailyStatus");
    const daily = flags.asksMissing
      ? await getShipmentKootajDetails(pool, context, { shipmentId: shipment.id })
      : await getShipmentDailyStatus(pool, context, { shipmentId: shipment.id });
    if (daily?.missingDailyStatus) {
      return { answer: `برای محموله ${code} اطلاعات کوتاژ یا وضعیت روزانه ثبت نشده است.`, sources };
    }
    return {
      answer: joinLines([
        `وضعیت گمرکی محموله ${code}:`,
        `شماره کوتاژ: ${labelOrMissing(daily?.cotageNumber)}`,
        `وضعیت گمرک: ${labelOrMissing(daily?.customsStatus)}`,
        `مسیر گمرکی: ${labelOrMissing(daily?.customsRoute)}`,
        `وضعیت ترخیص: ${labelOrMissing(daily?.releaseStatus)}`,
        `دفتر گمرک: ${labelOrMissing(daily?.customsOffice)}`,
      ]),
      sources,
    };
  }

  if (flags.asksBlockers) {
    toolsCalled.push("getShipmentWorkflowBlockers");
    const blockers = await getShipmentWorkflowBlockers(pool, context, { shipmentId: shipment.id });
    return {
      answer: blockers.length
        ? `موانع باز محموله ${code}:\n${blockers.slice(0, 6).map((item) => `- ${labelOrMissing(item.label || item.code || item.blockerCode)} / مرحله: ${labelOrMissing(item.stepCode)}`).join("\n")}`
        : `برای محموله ${code} مانع باز ثبت نشده است.`,
      sources: [...sources, source("workflow", { id: shipment.id, label: "موانع جریان کار", url: shipment.actionUrl })],
    };
  }

  if (flags.asksPublicTracking) {
    toolsCalled.push(text.includes("سند") || text.includes("مدرک") ? "getCustomerVisibleTrackingSummary" : "getShipmentCustomerAccessStatus");
    const tracking = text.includes("سند") || text.includes("مدرک")
      ? await getCustomerVisibleTrackingSummary(pool, context, { shipmentId: shipment.id })
      : await getShipmentCustomerAccessStatus(pool, context, { shipmentId: shipment.id });
    return {
      answer: joinLines([
        `رهگیری مشتری برای محموله ${code}: ${tracking?.enabled ? "فعال" : "غیرفعال"}.`,
        tracking?.label ? `برچسب: ${tracking.label}` : "",
        Array.isArray(tracking?.visibleDocuments) ? `اسناد قابل مشاهده برای مشتری: ${tracking.visibleDocuments.length}` : "",
      ]),
      sources: [...sources, source("public_tracking", { id: shipment.id, label: "رهگیری مشتری", url: shipment.actionUrl })],
    };
  }

  if (flags.asksChat) {
    toolsCalled.push("getShipmentInternalChatSummary", "getShipmentCustomerChatSummary");
    const [internalChat, customerChat] = await Promise.all([
      getShipmentInternalChatSummary(pool, context, { shipmentId: shipment.id }),
      getShipmentCustomerChatSummary(pool, context, { shipmentId: shipment.id }),
    ]);
    const internalLines = itemList(internalChat?.messages, formatChatLine, "پیام داخلی اخیر ثبت نشده است.");
    const customerLines = itemList(customerChat?.messages, formatChatLine, "پیام مشتری اخیر ثبت نشده است.");
    return {
      answer: joinLines([`خلاصه چت محموله ${code}:`, "داخلی:", internalLines, "مشتری:", customerLines]),
      sources: [...sources, source("chat", { id: shipment.id, label: "چت محموله", url: shipment.actionUrl })],
    };
  }

  if (flags.asksAudit) {
    toolsCalled.push("getShipmentAuditHistory");
    const history = await getShipmentAuditHistory(pool, context, { shipmentId: shipment.id });
    return {
      answer: `آخرین تغییرات محموله ${code}:\n${itemList(history, formatAuditLine, "تاریخچه قابل نمایش ثبت نشده است.")}`,
      sources: [...sources, source("audit", { id: shipment.id, label: "تاریخچه تغییرات", url: shipment.actionUrl })],
    };
  }

  if (flags.asksFinance) {
    toolsCalled.push("getShipmentFinancialSummary");
    const financial = await getShipmentFinancialSummary(pool, context, { shipmentId: shipment.id });
    return {
      answer: financial?.message || `${NOT_CONNECTED_MESSAGE}`,
      sources: [...sources, source("system", { label: "خلاصه مالی محموله" })],
    };
  }

  if (flags.asksDocuments) {
    toolsCalled.push("getShipmentDocuments");
    const docs = await getShipmentDocuments(pool, context, { shipmentId: shipment.id });
    if (flags.asksMissing) {
      toolsCalled.push("getMissingShipmentDocuments");
      const missing = await getMissingShipmentDocuments(pool, context, { shipmentId: shipment.id });
      return {
        answer: joinLines([
          `اسناد ثبت‌شده برای محموله ${code}: ${docs.length}`,
          missing?.unknownRequiredDocuments ? missing.message : "",
          itemList(docs.slice(0, 6), formatDocumentLine, "سندی برای این محموله ثبت نشده است."),
        ]),
        sources: [...sources, source("document", { id: shipment.id, label: "اسناد محموله", url: shipment.actionUrl })],
      };
    }
    if (text.includes("مشتری")) {
      toolsCalled.push("getCustomerVisibleDocuments");
      const visibleDocs = await getCustomerVisibleDocuments(pool, context, { shipmentId: shipment.id });
      return {
        answer: `اسناد قابل مشاهده برای مشتری در محموله ${code}:\n${itemList(visibleDocs, formatDocumentLine, "سند قابل مشاهده برای مشتری ثبت نشده است.")}`,
        sources: [...sources, source("document", { id: shipment.id, label: "اسناد قابل مشاهده مشتری", url: shipment.actionUrl })],
      };
    }
    return {
      answer: `اسناد محموله ${code}:\n${itemList(docs.slice(0, 8), formatDocumentLine, "سندی برای این محموله ثبت نشده است.")}`,
      sources: [...sources, source("document", { id: shipment.id, label: "اسناد محموله", url: shipment.actionUrl })],
    };
  }

  if (flags.asksTasks) {
    toolsCalled.push("getTasksByShipment");
    const tasks = await getTasksByShipment(pool, context, { shipmentId: shipment.id });
    return {
      answer: `وظایف محموله ${code}:\n${itemList(tasks.slice(0, 8), formatTaskLine, "وظیفه‌ای برای این محموله ثبت نشده است.")}`,
      sources: [...sources, source("task", { id: shipment.id, label: "وظایف محموله", url: shipment.actionUrl })],
    };
  }

  if (flags.asksCaptain && hasAny(text, ["ایجنت", "agent", "نماینده", "هماهنگ"])) {
    toolsCalled.push("getShipmentMalvaniAgentInfo");
    const agent = await getShipmentMalvaniAgentInfo(pool, context, { shipmentId: shipment.id });
    return {
      answer: agent?.agentPhone
        ? `شماره ایجنت ملوانی: ${agent.agentPhone}${agent.agentName ? ` (${agent.agentName})` : ""}`
        : `برای محموله ${code} شماره ایجنت ملوانی ثبت نشده است.`,
      sources: [...sources, source("malvani", { label: "ایجنت ملوانی" })],
    };
  }

  if (flags.asksCaptain && hasAny(text, ["ملوانی", "لنج"]) && !flags.asksCaptainPhone) {
    toolsCalled.push("getShipmentMalvaniProfile");
    const profile = await getShipmentMalvaniProfile(pool, context, { shipmentId: shipment.id });
    return {
      answer: joinLines([
        `ملوانی محموله ${code}: ${labelOrMissing(profile?.displayName)}.`,
        `ناخدا: ${labelOrMissing(profile?.captainName || captain?.captainName)}`,
        `لنج: ${labelOrMissing(profile?.lenjName)}`,
      ]),
      sources: [...sources, source("malvani", { label: profile?.displayName || "پروفایل ملوانی" })],
    };
  }

  return null;
}

async function focusedCustomerAnswer(pool, context, { customer, shipments, message, toolsCalled }) {
  const flags = intentFlags(message);
  const sources = [customerToolSource(customer)];
  const code = customer.customerCode;

  if (flags.asksCustomerPhone) {
    toolsCalled.push("getCustomerContactInfo");
    const contact = await getCustomerContactInfo(pool, context, { customerId: customer.id });
    return {
      answer: customerPhoneAnswer(contact || customer, `شماره تماس مشتری ${labelOrMissing(code)}`),
      sources,
    };
  }

  if (flags.asksDocuments) {
    toolsCalled.push("getCustomerDocumentsSummary");
    const summary = await getCustomerDocumentsSummary(pool, context, { customerId: customer.id });
    return {
      answer: joinLines([
        `اسناد مشتری ${labelOrMissing(code)}: ${summary?.count || 0}`,
        itemList(summary?.documents?.slice(0, 8), formatDocumentLine, "سندی برای این مشتری ثبت نشده است."),
      ]),
      sources: [...sources, source("document", { id: customer.id, label: "اسناد مشتری", url: customer.actionUrl })],
    };
  }

  if (flags.asksTasks || flags.asksBlockers || flags.asksMissing) {
    toolsCalled.push(flags.asksTasks ? "getTasksByCustomer" : "getCustomerOpenIssues");
    const data = flags.asksTasks
      ? { openTasks: await getTasksByCustomer(pool, context, { customerId: customer.id }) }
      : await getCustomerOpenIssues(pool, context, { customerId: customer.id });
    const taskLines = itemList(data?.openTasks?.slice(0, 8), formatTaskLine, "وظیفه باز ثبت نشده است.");
    const blockerLines = itemList(
      data?.openBlockers?.slice(0, 6),
      (item) => `- ${labelOrMissing(item.blockerCode)} / محموله: ${labelOrMissing(item.shipmentCode)} / مرحله: ${labelOrMissing(item.stepCode)}`,
      "مانع باز ثبت نشده است."
    );
    return {
      answer: joinLines([`موارد باز مشتری ${labelOrMissing(code)}:`, "وظایف:", taskLines, flags.asksTasks ? "" : "موانع:", flags.asksTasks ? "" : blockerLines]),
      sources: [...sources, source("task", { id: customer.id, label: "موارد باز مشتری", url: customer.actionUrl })],
    };
  }

  if (flags.asksCheque) {
    toolsCalled.push("getCustomerChequeSummary");
    const summary = await getCustomerChequeSummary(pool, context, { customerId: customer.id });
    return {
      answer: `چک‌های مشتری ${labelOrMissing(code)}:\n${itemList(summary?.cheques?.slice(0, 8), formatChequeLine, "چکی برای این مشتری ثبت نشده است.")}`,
      sources: [...sources, source("cheque", { id: customer.id, label: "چک‌های مشتری", url: customer.actionUrl })],
    };
  }

  if (flags.asksArchive) {
    toolsCalled.push("getCustomerArchiveStatus");
    const archive = await getCustomerArchiveStatus(pool, context, { customerId: customer.id });
    return {
      answer: joinLines([
        `وضعیت آرشیو مشتری ${labelOrMissing(code)}: ${archive?.isArchived ? "آرشیو شده" : "فعال"}.`,
        archive?.archivedAt ? `تاریخ آرشیو: ${archive.archivedAt}` : "",
        archive?.summary ? `توضیح: ${archive.summary}` : "",
      ]),
      sources: [...sources, source("archive", { id: customer.id, label: "آرشیو مشتری", url: customer.actionUrl })],
    };
  }

  if (flags.asksAudit) {
    toolsCalled.push("getCustomerAuditHistory");
    const history = await getCustomerAuditHistory(pool, context, { customerId: customer.id });
    return {
      answer: `آخرین تغییرات مشتری ${labelOrMissing(code)}:\n${itemList(history, formatAuditLine, "تاریخچه قابل نمایش ثبت نشده است.")}`,
      sources: [...sources, source("audit", { id: customer.id, label: "تاریخچه مشتری", url: customer.actionUrl })],
    };
  }

  if (flags.asksCustomerShipments || (flags.asksShipment && !flags.asksSummary)) {
    return {
      answer: customerShipmentsAnswer(customer, shipments, { latestOnly: flags.asksLatest }),
      sources: uniqueSources([
        ...sources,
        ...shipments.slice(0, 5).map((item) => source("shipment", { id: item.id, label: `محموله ${item.shipmentCode}`, url: item.actionUrl })),
      ]),
    };
  }

  return null;
}

const AGENTIC_CONTEXT_MAX_STEPS = 4;

function relationText(plan, fa, en) {
  return plan?.language === "fa" ? fa : en;
}

function relationRef(plan) {
  return plan?.entities?.shipmentRef || plan?.entities?.customerRef || plan?.entities?.commercialCardRef || "";
}

function commercialCardLabel(card = {}) {
  return cleanText(card.displayName) ||
    cleanText(card.holderName) ||
    cleanText(card.companyName) ||
    cleanText(card.responsibleName) ||
    cleanText(card.cardNumber) ||
    cleanText(card.id);
}

function maskedCommercialCardNumber(value = "") {
  const text = cleanText(value);
  if (!text) return "";
  const digits = text.replace(/\D/g, "");
  if (digits.length < 6) return text;
  return `${text.slice(0, Math.max(0, text.length - 4)).replace(/[^\s-]/g, "•")}${text.slice(-4)}`;
}

function commercialCardLine(card = {}) {
  const label = commercialCardLabel(card);
  const parts = [
    labelOrMissing(label),
    maskedCommercialCardNumber(card.cardNumber),
    cleanText(card.expirationDate) ? `انقضا: ${card.expirationDate}` : "",
    cleanText(card.status),
  ].filter(Boolean);
  return parts.join(" / ");
}

function commercialCardSource(card = {}) {
  return source("commercial_card", {
    id: card.id,
    label: commercialCardLabel(card) || "کارت بازرگانی",
    url: card.actionUrl || "/daily-status",
  });
}

function relationOptionLine(item = {}, type) {
  if (type === "shipment") {
    return `- ${labelOrMissing(item.shipmentCode)} / مشتری: ${labelOrMissing(item.customerName || item.customerCode)} / وضعیت: ${labelOrMissing(item.currentStatus || item.status)}`;
  }
  if (type === "customer") {
    return `- ${labelOrMissing(item.companyName || item.contactName || item.customerCode)}${item.customerCode ? ` / ${item.customerCode}` : ""}`;
  }
  return `- ${labelOrMissing(commercialCardLabel(item))}`;
}

function relationResult({
  plan,
  answer,
  toolsCalled = [],
  sources = [],
  recordIds = [],
  activeEntity = null,
  success = true,
  reason = null,
  tone = "direct",
  responseMode = RESPONSE_MODE_DIRECT,
} = {}) {
  return {
    handled: true,
    data: {
      answer,
      tone,
      responseMode,
      ...(activeEntity ? { activeEntity } : {}),
      suggestions: suggestionsForActiveEntity(activeEntity),
      sources: uniqueSources(sources.length ? sources : [source("system", { label: ASSISTANT_NAME })]),
    },
    audit: {
      queryType: plan?.intent || "agentic_context",
      toolsCalled,
      recordIds,
      success,
      reason,
      detectedIntent: plan?.intent || null,
      registryIntent: plan?.registryIntent || plan?.hamyarPlan?.intent || null,
      relationPath: plan?.relationPath || plan?.hamyarPlan?.relationPath || [],
      requestedField: plan?.requestedField || plan?.hamyarPlan?.requestedField || null,
      preferredEntityTypes: plan?.preferredEntityTypes || plan?.candidateTypes || plan?.hamyarPlan?.preferredEntityTypes || [],
      needsCompanyBrain: Boolean(plan?.needsCompanyBrain || plan?.hamyarPlan?.needsCompanyBrain),
      needsLiveVerification: Boolean(plan?.needsLiveVerification || plan?.hamyarPlan?.needsLiveVerification),
      liveTool: plan?.liveTool || plan?.hamyarPlan?.liveTool || "",
      confidence: plan?.confidence || 0,
    },
  };
}

function identityResult(plan) {
  return relationResult({
    plan: { ...plan, intent: "identity" },
    answer: relationText(
      plan,
      "من همیار لاجستیک هستم؛ دستیار داخلی LogisticPlus برای پاسخ‌های read-only درباره محموله‌ها، مشتری‌ها، کارت‌های بازرگانی، اسناد، وظایف و وضعیت عملیات همین سازمان. فقط از داده‌هایی که شما مجاز به دیدنشان هستید استفاده می‌کنم.",
      "I am LogisticPlus assistant, a read-only internal helper for shipments, customers, commercial cards, documents, tasks, and operational status in this organization."
    ),
    toolsCalled: [],
    success: true,
    reason: "identity",
  });
}

function businessCandidateSource(candidate = {}) {
  if (candidate.type === "shipment") {
    return source("shipment", {
      id: candidate.id,
      label: candidate.safeSummary?.shipmentCode ? `محموله ${candidate.safeSummary.shipmentCode}` : candidate.label,
      url: candidate.actionUrl || `/shipments/${candidate.id}`,
    });
  }
  if (candidate.type === "customer") {
    return source("customer", {
      id: candidate.id,
      label: candidate.safeSummary?.customerName || candidate.safeSummary?.customerCode || candidate.label,
      url: candidate.actionUrl || `/customers/${candidate.id}`,
    });
  }
  if (candidate.type === "commercial_card") {
    return source("commercial_card", {
      id: candidate.id,
      label: candidate.safeSummary?.displayName || candidate.label,
      url: candidate.actionUrl || "/daily-status",
    });
  }
  if (candidate.type === "document") {
    return source("document", {
      id: candidate.id,
      label: candidate.safeSummary?.title || candidate.safeSummary?.fileName || candidate.label,
      url: candidate.actionUrl || "/documents",
    });
  }
  if (candidate.type === "workflow_item") {
    return source("workflow_item", {
      id: candidate.id,
      label: candidate.safeSummary?.title || candidate.safeSummary?.blockerCode || candidate.label,
      url: candidate.actionUrl || candidate.safeSummary?.actionUrl || "/tasks",
    });
  }
  if (candidate.type === "cheque") {
    return source("cheque", {
      id: candidate.id,
      label: candidate.safeSummary?.chequeNumber ? `چک ${candidate.safeSummary.chequeNumber}` : candidate.label,
      url: candidate.actionUrl || "/cheques",
    });
  }
  return source("business_record", {
    id: candidate.id,
    label: candidate.label || "رکورد تجاری",
    url: candidate.actionUrl,
  });
}

function businessOptionBlock(candidate = {}, index = 0, language = "fa") {
  const optionNumber = language === "fa" ? toPersianDigits(index + 1) : String(index + 1);
  if (candidate.type === "shipment") {
    return joinLines([
      `${optionNumber}) ${language === "fa" ? "محموله" : "Shipment"} ${labelOrMissing(candidate.safeSummary?.shipmentCode)}`,
      language === "fa"
        ? `کد محموله: ${labelOrMissing(candidate.safeSummary?.shipmentCode)}`
        : `Shipment code: ${labelOrMissing(candidate.safeSummary?.shipmentCode)}`,
      language === "fa"
        ? `مشتری: ${labelOrMissing(candidate.safeSummary?.customerName)}`
        : `Customer: ${labelOrMissing(candidate.safeSummary?.customerName)}`,
      language === "fa"
        ? `وضعیت: ${labelOrMissing(candidate.safeSummary?.status)}`
        : `Status: ${labelOrMissing(candidate.safeSummary?.status)}`,
    ]);
  }
  if (candidate.type === "customer") {
    return joinLines([
      `${optionNumber}) ${language === "fa" ? "مشتری" : "Customer"} ${labelOrMissing(candidate.safeSummary?.customerName)}`,
      language === "fa"
        ? `کد مشتری: ${labelOrMissing(candidate.safeSummary?.customerCode)}`
        : `Customer code: ${labelOrMissing(candidate.safeSummary?.customerCode)}`,
      language === "fa"
        ? `وضعیت: ${labelOrMissing(candidate.safeSummary?.status)}`
        : `Status: ${labelOrMissing(candidate.safeSummary?.status)}`,
    ]);
  }
  if (candidate.type === "commercial_card") {
    return joinLines([
    `${optionNumber}) ${language === "fa" ? "کارت بازرگانی" : "Commercial card"} ${labelOrMissing(candidate.safeSummary?.displayName)}`,
    language === "fa"
      ? `شماره کارت: ${labelOrMissing(candidate.safeSummary?.cardNumber)}`
      : `Card number: ${labelOrMissing(candidate.safeSummary?.cardNumber)}`,
    language === "fa"
      ? `وضعیت: ${labelOrMissing(candidate.safeSummary?.status)}`
      : `Status: ${labelOrMissing(candidate.safeSummary?.status)}`,
    ]);
  }
  if (candidate.type === "document") {
    return joinLines([
      `${optionNumber}) ${language === "fa" ? "سند" : "Document"} ${labelOrMissing(candidate.safeSummary?.title || candidate.label)}`,
      candidate.safeSummary?.shipmentCode
        ? (language === "fa" ? `کد محموله: ${candidate.safeSummary.shipmentCode}` : `Shipment code: ${candidate.safeSummary.shipmentCode}`)
        : "",
      candidate.safeSummary?.customerCode
        ? (language === "fa" ? `کد مشتری: ${candidate.safeSummary.customerCode}` : `Customer code: ${candidate.safeSummary.customerCode}`)
        : "",
    ]);
  }
  if (candidate.type === "workflow_item") {
    return joinLines([
      `${optionNumber}) ${language === "fa" ? "کار/مرحله" : "Workflow item"} ${labelOrMissing(candidate.safeSummary?.title || candidate.safeSummary?.blockerCode || candidate.label)}`,
      candidate.safeSummary?.shipmentCode
        ? (language === "fa" ? `کد محموله: ${candidate.safeSummary.shipmentCode}` : `Shipment code: ${candidate.safeSummary.shipmentCode}`)
        : "",
      language === "fa"
        ? `وضعیت: ${labelOrMissing(candidate.safeSummary?.status)}`
        : `Status: ${labelOrMissing(candidate.safeSummary?.status)}`,
    ]);
  }
  if (candidate.type === "cheque") {
    return joinLines([
      `${optionNumber}) ${language === "fa" ? "چک" : "Cheque"} ${labelOrMissing(candidate.safeSummary?.chequeNumber || candidate.label)}`,
      language === "fa"
        ? `بانک: ${labelOrMissing(candidate.safeSummary?.bankName)}`
        : `Bank: ${labelOrMissing(candidate.safeSummary?.bankName)}`,
      language === "fa"
        ? `وضعیت: ${labelOrMissing(candidate.safeSummary?.status)}`
        : `Status: ${labelOrMissing(candidate.safeSummary?.status)}`,
    ]);
  }
  return joinLines([
    `${optionNumber}) ${labelOrMissing(candidate.label)}`,
  ]);
}

export function renderBusinessAmbiguityMessage({ plan = {}, query = "", candidates = [] } = {}) {
  const language = plan.language === "fa" ? "fa" : "en";
  const terms = cleanText(query) || businessQueryDisplay(plan);
  if (language !== "fa") {
    return [
      `I found multiple matches for "${terms || "this request"}". Please send the option number or exact code.`,
      ...candidates.slice(0, 5).map((candidate, index) => businessOptionBlock(candidate, index, language)),
    ].join("\n\n");
  }
  return toPersianDigits([
    `چند مورد برای «${terms || "این عبارت"}» پیدا شد. لطفا شماره گزینه یا کد مورد درست را بفرستید؛ مثلا «گزینه 1» یا «به 214».`,
    ...candidates.slice(0, 5).map((candidate, index) => businessOptionBlock(candidate, index, language)),
  ].join("\n\n"));
}

export function businessQueryDisplay(plan = {}) {
  const terms = Array.isArray(plan.queryTerms) ? plan.queryTerms.map((term) => cleanText(term)).filter(Boolean) : [];
  const words = [];
  for (const term of terms) {
    for (const word of term.split(/\s+/).filter(Boolean)) {
      if (!words.includes(word)) words.push(word);
    }
  }
  return words.join(" ") || terms.join(" ");
}

function strongBusinessCandidate(candidates = []) {
  if (!candidates.length) return null;
  const [first, second] = candidates;
  if (first.score >= 0.78 && (!second || first.score - second.score >= 0.12)) return first;
  if (candidates.length === 1 && first.score >= 0.62) return first;
  return null;
}

export function rankBusinessCandidatesForPlan(plan = {}, candidates = []) {
  if (!Array.isArray(candidates) || candidates.length <= 1) return Array.isArray(candidates) ? candidates : [];
  const order = new Map((Array.isArray(plan.candidateTypes) ? plan.candidateTypes : []).map((type, index) => [type, index]));
  const priorityFor = (candidate) => {
    if (!order.has(candidate?.type)) return Number.MAX_SAFE_INTEGER;
    return order.get(candidate.type);
  };
  return [...candidates].sort((left, right) => {
    const priorityDelta = priorityFor(left) - priorityFor(right);
    if (priorityDelta !== 0) return priorityDelta;
    const scoreDelta = Number(right.score || 0) - Number(left.score || 0);
    if (scoreDelta !== 0) return scoreDelta;
    const matchedDelta = (right.matchedFields?.length || 0) - (left.matchedFields?.length || 0);
    if (matchedDelta !== 0) return matchedDelta;
    return cleanText(left.label).localeCompare(cleanText(right.label), "fa");
  });
}

function businessAmbiguousResult(plan, candidates, toolsCalled) {
  return relationResult({
    plan,
    answer: renderBusinessAmbiguityMessage({ plan, query: businessQueryDisplay(plan), candidates }),
    toolsCalled,
    sources: candidates.slice(0, 5).map(businessCandidateSource),
    recordIds: candidates.slice(0, 5).map((item) => item.id).filter(Boolean),
    success: false,
    reason: "ambiguous_business_search",
    tone: "clarification",
  });
}

function businessNotFoundResult(plan, searched, toolsCalled) {
  const terms = searched?.queryTerms?.length ? searched.queryTerms : plan.queryTerms;
  const types = (searched?.candidateTypes?.length ? searched.candidateTypes : plan.candidateTypes)
    .map((type) => {
      if (type === "shipment") return "محموله‌ها";
      if (type === "customer") return "مشتری‌ها";
      if (type === "commercial_card") return "کارت‌های بازرگانی";
      if (type === "document") return "اسناد";
      if (type === "workflow_item") return "کارها و مراحل";
      if (type === "cheque") return "چک‌ها";
      return "اطلاعات تجاری";
    })
    .join("، ");
  return relationResult({
    plan,
    answer: relationText(
      plan,
      `من در ${types || "اطلاعات تجاری"} این سازمان برای «${terms.join(" ")}» جستجو کردم، اما مورد مطمئنی پیدا نشد. اگر کد محموله، نام دقیق مشتری، یا بخشی از شرح کالا را دارید بفرستید.`,
      `I searched this organization's ${types || "business records"} for "${terms.join(" ")}", but did not find a confident match. Please send a shipment code, exact customer name, or part of the goods description.`
    ),
    toolsCalled,
    success: false,
    reason: "business_search_not_found",
    tone: "clarification",
  });
}

function missingBusinessContextResult(plan, candidate, toolsCalled, reason = "missing_context") {
  return relationResult({
    plan,
    answer: relationText(
      plan,
      `برای مورد پیدا شده «${candidate.label}» زمینه کافی برای پاسخ دقیق پیدا نکردم. لطفاً یک شناسه یا عبارت دقیق‌تر بفرستید.`,
      `I found "${candidate.label}", but did not retrieve enough context to answer safely. Please send a more specific reference.`
    ),
    toolsCalled,
    sources: [businessCandidateSource(candidate)],
    recordIds: [candidate.id].filter(Boolean),
    success: false,
    reason,
    tone: "clarification",
  });
}

function customerDisplayFromDetail(customer = {}) {
  return cleanText(customer.companyName) || cleanText(customer.contactName) || cleanText(customer.name) || cleanText(customer.customerCode);
}

function businessShipmentAnswer(plan, detail) {
  const shipment = detail.shipment;
  const customer = detail.customer || {};
  const field = plan.requestedField;
  if (planHasRequestedField(plan, BUSINESS_REQUESTED_FIELDS.STATUS)) {
    return relationText(
      plan,
      `وضعیت محموله ${shipment.shipmentCode}: ${labelOrMissing(shipment.currentStatus || shipment.status)}`,
      `Shipment ${shipment.shipmentCode} status: ${labelOrMissing(shipment.currentStatus || shipment.status)}`
    );
  }
  if (planHasRequestedField(plan, BUSINESS_REQUESTED_FIELDS.ADDRESS)) return null;
  if (planHasRequestedField(plan, BUSINESS_REQUESTED_FIELDS.ACCOUNTING)) {
    return relationText(
      plan,
      `اطلاعات حسابداری/مانده برای محموله ${shipment.shipmentCode} در زمینه دریافت‌شده متصل نیست.`,
      `Accounting or balance information for shipment ${shipment.shipmentCode} is not connected in the retrieved context.`
    );
  }
  if (field === BUSINESS_REQUESTED_FIELDS.CUSTOMER || field === BUSINESS_REQUESTED_FIELDS.CUSTOMER_PHONE) {
    const name = cleanText(customer.name) || cleanText(customer.customerCode);
    if (!name) return null;
    if (field === BUSINESS_REQUESTED_FIELDS.CUSTOMER_PHONE) {
      return relationText(
        plan,
        `مشتری محموله ${shipment.shipmentCode} «${name}» است. شماره تماس مشتری در زمینه محموله دریافت‌شده موجود نبود؛ از صفحه مشتری قابل بررسی است.`,
        `Shipment ${shipment.shipmentCode} belongs to ${name}. The customer phone was not available in the retrieved shipment context.`
      );
    }
    return relationText(
      plan,
      `مشتری محموله ${shipment.shipmentCode}، «${name}»${customer.customerCode ? ` (${customer.customerCode})` : ""} است.`,
      `Shipment ${shipment.shipmentCode} belongs to ${name}${customer.customerCode ? ` (${customer.customerCode})` : ""}.`
    );
  }
  if (field === BUSINESS_REQUESTED_FIELDS.SHIPMENT_NUMBER) {
    return relationText(
      plan,
      `شماره محموله مورد پیدا شده: ${labelOrMissing(shipment.shipmentCode)}.`,
      `The matched shipment number is ${labelOrMissing(shipment.shipmentCode)}.`
    );
  }
  if (field === BUSINESS_REQUESTED_FIELDS.COMMERCIAL_CARD || field === BUSINESS_REQUESTED_FIELDS.COMMERCIAL_CARD_NUMBER) {
    const card = detail.commercialCard || detail.commercialCards?.[0];
    if (!card) return null;
    return relationText(
      plan,
      `کارت بازرگانی مرتبط با محموله ${shipment.shipmentCode}: ${commercialCardLine(card)}.`,
      `The commercial card linked to shipment ${shipment.shipmentCode}: ${commercialCardLine(card)}.`
    );
  }
  return shipmentSummaryFromContext(plan, detail);
}

function businessCustomerAnswer(plan, detail) {
  const customer = detail.customer || {};
  const name = customerDisplayFromDetail(customer);
  const field = plan.requestedField;
  if (planHasRequestedField(plan, BUSINESS_REQUESTED_FIELDS.PHONE) || field === BUSINESS_REQUESTED_FIELDS.CUSTOMER_NUMBER) {
    const phoneLines = formatCustomerPhones(customer);
    const lines = [
      `مشتری: ${labelOrMissing(name)}${customer.customerCode ? ` (کد ${customer.customerCode})` : ""}`,
      ...phoneLines.map((phone) => `شماره تماس: ${phone}`),
    ].filter(Boolean);
    return relationText(
      plan,
      phoneLines.length ? lines.join("\n") : `برای مشتری ${labelOrMissing(name)} شماره تماس قابل نمایش پیدا نکردم.`,
      phoneLines.length ? lines.join("\n") : `I did not find a visible phone number for ${labelOrMissing(name)}.`
    );
  }
  if (planHasRequestedField(plan, BUSINESS_REQUESTED_FIELDS.ADDRESS)) {
    return relationText(
      plan,
      `آدرس مشتری ${labelOrMissing(name)}${customer.customerCode ? ` (کد ${customer.customerCode})` : ""}: ${labelOrMissing(customer.address)}`,
      `Address for ${labelOrMissing(name)}${customer.customerCode ? ` (${customer.customerCode})` : ""}: ${labelOrMissing(customer.address)}`
    );
  }
  if (planHasRequestedField(plan, BUSINESS_REQUESTED_FIELDS.ACCOUNTING)) {
    return relationText(
      plan,
      `اطلاعات حسابداری/مانده برای مشتری ${labelOrMissing(name)} در زمینه دریافت‌شده متصل نیست.`,
      `Accounting or balance information for ${labelOrMissing(name)} is not connected in the retrieved context.`
    );
  }
  if (planHasRequestedField(plan, BUSINESS_REQUESTED_FIELDS.STATUS)) {
    return relationText(
      plan,
      `وضعیت مشتری ${labelOrMissing(name)}: ${labelOrMissing(customer.status)}`,
      `Customer ${labelOrMissing(name)} status: ${labelOrMissing(customer.status)}`
    );
  }
  if (field === BUSINESS_REQUESTED_FIELDS.COMMERCIAL_CARD || field === BUSINESS_REQUESTED_FIELDS.COMMERCIAL_CARD_NUMBER) {
    return groundedCustomerAnswer({ ...plan, intent: RELATION_INTENTS.CUSTOMER_COMMERCIAL_CARD_LOOKUP }, detail);
  }
  if (field === BUSINESS_REQUESTED_FIELDS.SHIPMENTS || field === BUSINESS_REQUESTED_FIELDS.LOCATION) {
    return groundedCustomerAnswer({ ...plan, intent: RELATION_INTENTS.CUSTOMER_SHIPMENTS_LOOKUP }, detail);
  }
  return joinLines([
    relationText(plan, `مورد پیدا شده: مشتری ${labelOrMissing(name)}.`, `Matched customer: ${labelOrMissing(name)}.`),
    customer.customerCode ? `کد مشتری: ${customer.customerCode}` : "",
    customer.status ? `وضعیت: ${customer.status}` : "",
  ]);
}

function businessCommercialCardAnswer(plan, contextResult, candidate) {
  const card = contextResult?.cards?.[0] || {};
  const label = commercialCardLabel(card) || candidate.safeSummary?.displayName || candidate.label;
  if (planHasRequestedField(plan, BUSINESS_REQUESTED_FIELDS.PHONE)) {
    return relationText(
      plan,
      `شماره تماس کارت بازرگانی ${labelOrMissing(label)}: ${labelOrMissing(card.responsiblePhone)}`,
      `Commercial card ${labelOrMissing(label)} phone: ${labelOrMissing(card.responsiblePhone)}`
    );
  }
  if (planHasRequestedField(plan, BUSINESS_REQUESTED_FIELDS.STATUS)) {
    return relationText(
      plan,
      `وضعیت کارت بازرگانی ${labelOrMissing(label)}: ${labelOrMissing(card.status || candidate.safeSummary?.status)}`,
      `Commercial card ${labelOrMissing(label)} status: ${labelOrMissing(card.status || candidate.safeSummary?.status)}`
    );
  }
  if (planHasRequestedField(plan, BUSINESS_REQUESTED_FIELDS.ADDRESS)) {
    return relationText(
      plan,
      `آدرس برای کارت بازرگانی ${labelOrMissing(label)} در زمینه دریافت‌شده متصل نیست.`,
      `Address for commercial card ${labelOrMissing(label)} is not connected in the retrieved context.`
    );
  }
  if (planHasRequestedField(plan, BUSINESS_REQUESTED_FIELDS.ACCOUNTING)) {
    return relationText(
      plan,
      `اطلاعات حسابداری/مانده برای کارت بازرگانی ${labelOrMissing(label)} در زمینه دریافت‌شده متصل نیست.`,
      `Accounting or balance information for commercial card ${labelOrMissing(label)} is not connected in the retrieved context.`
    );
  }
  return relationText(
    plan,
    `کارت بازرگانی پیدا شده: ${labelOrMissing(label)}${card.cardNumber ? ` / شماره: ${commercialCardLine(card)}` : candidate.safeSummary?.cardNumber ? ` / شماره: ${candidate.safeSummary.cardNumber}` : ""}.`,
    `Matched commercial card: ${labelOrMissing(label)}${card.cardNumber ? ` / ${commercialCardLine(card)}` : candidate.safeSummary?.cardNumber ? ` / number: ${candidate.safeSummary.cardNumber}` : ""}.`
  );
}

function customerContactAnswerForBusinessRecord(plan, contact, contextLabel = "") {
  const name = customerDisplayFromDetail(contact || {});
  if (planHasRequestedField(plan, BUSINESS_REQUESTED_FIELDS.PHONE)) {
    const phoneLines = formatCustomerPhones(contact);
    return relationText(
      plan,
      phoneLines.length
        ? joinLines([
          contextLabel ? `مورد مرتبط: ${contextLabel}` : "",
          `مشتری: ${labelOrMissing(name)}${contact?.customerCode ? ` (کد ${contact.customerCode})` : ""}`,
          ...phoneLines.map((phone) => `شماره تماس: ${phone}`),
        ])
        : `برای مشتری ${labelOrMissing(name)} شماره تماس قابل نمایش پیدا نکردم.`,
      phoneLines.length
        ? joinLines([
          contextLabel ? `Related record: ${contextLabel}` : "",
          `Customer: ${labelOrMissing(name)}${contact?.customerCode ? ` (${contact.customerCode})` : ""}`,
          ...phoneLines.map((phone) => `Phone: ${phone}`),
        ])
        : `I did not find a visible phone number for ${labelOrMissing(name)}.`
    );
  }
  if (planHasRequestedField(plan, BUSINESS_REQUESTED_FIELDS.ADDRESS)) {
    return relationText(
      plan,
      joinLines([
        contextLabel ? `مورد مرتبط: ${contextLabel}` : "",
        `آدرس مشتری ${labelOrMissing(name)}${contact?.customerCode ? ` (کد ${contact.customerCode})` : ""}: ${labelOrMissing(contact?.address)}`,
      ]),
      joinLines([
        contextLabel ? `Related record: ${contextLabel}` : "",
        `Address for ${labelOrMissing(name)}${contact?.customerCode ? ` (${contact.customerCode})` : ""}: ${labelOrMissing(contact?.address)}`,
      ])
    );
  }
  return null;
}

function missingCustomerConnectionAnswer(plan, label) {
  if (planHasRequestedField(plan, BUSINESS_REQUESTED_FIELDS.PHONE)) {
    return relationText(
      plan,
      `برای «${labelOrMissing(label)}» مشتری مرتبطی پیدا نکردم که شماره تماسش را بخوانم.`,
      `I did not find a linked customer for "${labelOrMissing(label)}" to read contact data.`
    );
  }
  if (planHasRequestedField(plan, BUSINESS_REQUESTED_FIELDS.ADDRESS)) {
    return relationText(
      plan,
      `برای «${labelOrMissing(label)}» مشتری مرتبطی پیدا نکردم که آدرسش را بخوانم.`,
      `I did not find a linked customer for "${labelOrMissing(label)}" to read the address.`
    );
  }
  return null;
}

function businessDocumentAnswer(plan, document, candidate) {
  const label = document?.title || document?.fileName || candidate?.label;
  if (planHasRequestedField(plan, BUSINESS_REQUESTED_FIELDS.STATUS)) {
    return relationText(
      plan,
      `وضعیت سند ${labelOrMissing(label)}: ${labelOrMissing(document?.visibility)}.`,
      `Document ${labelOrMissing(label)} status: ${labelOrMissing(document?.visibility)}.`
    );
  }
  if (planHasRequestedField(plan, BUSINESS_REQUESTED_FIELDS.ACCOUNTING)) {
    return relationText(
      plan,
      `اطلاعات حسابداری/مالی برای سند ${labelOrMissing(label)} در زمینه دریافت‌شده متصل نیست.`,
      `Accounting or finance information for document ${labelOrMissing(label)} is not connected in the retrieved context.`
    );
  }
  if (planHasRequestedField(plan, BUSINESS_REQUESTED_FIELDS.PHONE, BUSINESS_REQUESTED_FIELDS.ADDRESS)) {
    return missingCustomerConnectionAnswer(plan, label);
  }
  return relationText(
    plan,
    joinLines([
      `سند پیدا شده: ${labelOrMissing(label)}.`,
      `نوع: ${labelOrMissing(document?.type)}`,
      `نمایش به مشتری: ${document?.customerVisible ? "بله" : "خیر"}`,
      document?.shipmentId ? `شناسه محموله: ${document.shipmentId}` : "",
    ]),
    joinLines([
      `Matched document: ${labelOrMissing(label)}.`,
      `Type: ${labelOrMissing(document?.type)}`,
      `Customer-visible: ${document?.customerVisible ? "yes" : "no"}`,
      document?.shipmentId ? `Shipment id: ${document.shipmentId}` : "",
    ])
  );
}

function parseWorkflowCandidateId(value = "") {
  const text = cleanText(value);
  const match = text.match(/^(task|blocker):(.+)$/);
  if (!match) return { kind: "", id: text };
  return { kind: match[1], id: match[2] };
}

function businessWorkflowItemAnswer(plan, item, candidate) {
  const label = item?.title || item?.blockerCode || candidate?.label;
  if (planHasRequestedField(plan, BUSINESS_REQUESTED_FIELDS.STATUS)) {
    return relationText(
      plan,
      `وضعیت کار/مرحله ${labelOrMissing(label)}: ${labelOrMissing(item?.status)}.`,
      `Workflow item ${labelOrMissing(label)} status: ${labelOrMissing(item?.status)}.`
    );
  }
  if (planHasRequestedField(plan, BUSINESS_REQUESTED_FIELDS.ACCOUNTING)) {
    return relationText(
      plan,
      `اطلاعات حسابداری/مالی برای کار/مرحله ${labelOrMissing(label)} در زمینه دریافت‌شده متصل نیست.`,
      `Accounting or finance information for workflow item ${labelOrMissing(label)} is not connected in the retrieved context.`
    );
  }
  if (planHasRequestedField(plan, BUSINESS_REQUESTED_FIELDS.PHONE, BUSINESS_REQUESTED_FIELDS.ADDRESS)) {
    return missingCustomerConnectionAnswer(plan, label);
  }
  return relationText(
    plan,
    joinLines([
      `کار/مرحله پیدا شده: ${labelOrMissing(label)}.`,
      `وضعیت: ${labelOrMissing(item?.status)}`,
      item?.priority ? `اولویت: ${item.priority}` : "",
      item?.assignedToName ? `مسئول: ${item.assignedToName}` : "",
      item?.dueAt ? `موعد: ${item.dueAt}` : "",
      item?.shipmentCode ? `محموله: ${item.shipmentCode}` : item?.shipmentId ? `شناسه محموله: ${item.shipmentId}` : "",
    ]),
    joinLines([
      `Matched workflow item: ${labelOrMissing(label)}.`,
      `Status: ${labelOrMissing(item?.status)}`,
      item?.priority ? `Priority: ${item.priority}` : "",
      item?.assignedToName ? `Assignee: ${item.assignedToName}` : "",
      item?.dueAt ? `Due: ${item.dueAt}` : "",
      item?.shipmentCode ? `Shipment: ${item.shipmentCode}` : item?.shipmentId ? `Shipment id: ${item.shipmentId}` : "",
    ])
  );
}

function businessChequeAnswer(plan, cheque, candidate) {
  const label = cheque?.chequeNumber || candidate?.safeSummary?.chequeNumber || candidate?.label;
  if (planHasRequestedField(plan, BUSINESS_REQUESTED_FIELDS.STATUS)) {
    return relationText(
      plan,
      `وضعیت چک ${labelOrMissing(label)}: ${labelOrMissing(cheque?.status)}.`,
      `Cheque ${labelOrMissing(label)} status: ${labelOrMissing(cheque?.status)}.`
    );
  }
  if (planHasRequestedField(plan, BUSINESS_REQUESTED_FIELDS.ACCOUNTING)) {
    return relationText(
      plan,
      joinLines([
        `اطلاعات مالی چک ${labelOrMissing(label)}:`,
        `مبلغ: ${labelOrMissing(cheque?.amount)} ${labelOrMissing(cheque?.currency)}`,
        `بانک: ${labelOrMissing(cheque?.bankName)}`,
        `سررسید: ${labelOrMissing(cheque?.dueDate)}`,
        `وضعیت: ${labelOrMissing(cheque?.status)}`,
      ]),
      joinLines([
        `Cheque ${labelOrMissing(label)} finance data:`,
        `Amount: ${labelOrMissing(cheque?.amount)} ${labelOrMissing(cheque?.currency)}`,
        `Bank: ${labelOrMissing(cheque?.bankName)}`,
        `Due date: ${labelOrMissing(cheque?.dueDate)}`,
        `Status: ${labelOrMissing(cheque?.status)}`,
      ])
    );
  }
  if (planHasRequestedField(plan, BUSINESS_REQUESTED_FIELDS.PHONE, BUSINESS_REQUESTED_FIELDS.ADDRESS)) {
    return missingCustomerConnectionAnswer(plan, label);
  }
  return relationText(
    plan,
    joinLines([
      `چک پیدا شده: ${labelOrMissing(label)}.`,
      `مبلغ: ${labelOrMissing(cheque?.amount)} ${labelOrMissing(cheque?.currency)}`,
      `بانک: ${labelOrMissing(cheque?.bankName)}`,
      `گیرنده: ${labelOrMissing(cheque?.receiver)}`,
      `سررسید: ${labelOrMissing(cheque?.dueDate)}`,
      `وضعیت: ${labelOrMissing(cheque?.status)}`,
    ]),
    joinLines([
      `Matched cheque: ${labelOrMissing(label)}.`,
      `Amount: ${labelOrMissing(cheque?.amount)} ${labelOrMissing(cheque?.currency)}`,
      `Bank: ${labelOrMissing(cheque?.bankName)}`,
      `Receiver: ${labelOrMissing(cheque?.receiver)}`,
      `Due date: ${labelOrMissing(cheque?.dueDate)}`,
      `Status: ${labelOrMissing(cheque?.status)}`,
    ])
  );
}

function activeEntityFromBusinessCandidate(candidate = {}, detail = {}) {
  if (candidate.type === "shipment" && detail.shipment?.id) {
    return { type: "shipment", id: detail.shipment.id, code: detail.shipment.shipmentCode, label: `محموله ${detail.shipment.shipmentCode}` };
  }
  if (candidate.type === "customer" && detail.customer?.id) {
    return {
      type: "customer",
      id: detail.customer.id,
      code: detail.customer.customerCode,
      label: customerDisplayFromDetail(detail.customer),
    };
  }
  if (candidate.type === "document" && detail.document?.id) {
    return { type: "document", id: detail.document.id, label: detail.document.title || detail.document.fileName };
  }
  if (candidate.type === "workflow_item" && detail.workflowItem?.id) {
    return { type: "workflow_item", id: detail.workflowItem.id, label: detail.workflowItem.title || detail.workflowItem.blockerCode };
  }
  if (candidate.type === "cheque" && detail.cheque?.id) {
    return { type: "cheque", id: detail.cheque.id, code: detail.cheque.chequeNumber, label: `چک ${detail.cheque.chequeNumber || detail.cheque.id}` };
  }
  return null;
}

function relationMissingRefResult(plan) {
  return relationResult({
    plan,
    answer: relationText(
      plan,
      "لطفاً شماره/کد محموله یا مشتری را بفرستید تا در اطلاعات همین سازمان بررسی کنم.",
      "Please send the shipment or customer reference so I can check this organization's data."
    ),
    success: false,
    reason: "missing_reference",
    tone: "clarification",
  });
}

function relationNotFoundResult(plan, entityType, toolsCalled) {
  const ref = relationRef(plan);
  const label = entityType === "customer" ? "مشتری" : entityType === "commercial_card" ? "کارت بازرگانی" : "بار";
  const answer = relationText(
    plan,
    `من ${label}${ref ? ` با کد/عبارت ${ref}` : ""} را در اطلاعات این سازمان پیدا نکردم.`,
    `I could not find that ${entityType.replace("_", " ")}${ref ? ` (${ref})` : ""} in this organization.`
  );
  return relationResult({
    plan,
    answer,
    toolsCalled,
    success: false,
    reason: "not_found",
    tone: "clarification",
  });
}

function relationAmbiguousResult(plan, matches, type, toolsCalled) {
  const ref = relationRef(plan);
  const options = matches.slice(0, 5).map((item) => relationOptionLine(item, type));
  return relationResult({
    plan,
    answer: joinLines([
      relationText(
        plan,
        `چند مورد برای «${ref || "این عبارت"}» پیدا شد. منظورتان کدام است؟`,
        `I found multiple matches for "${ref || "this reference"}". Which one do you mean?`
      ),
      ...options,
    ]),
    toolsCalled,
    recordIds: matches.slice(0, 5).map((item) => item.id).filter(Boolean),
    success: false,
    reason: "ambiguous",
    tone: "clarification",
  });
}

function shipmentContextForVerifier(detail) {
  if (!detail) return {};
  return {
    shipment: {
      ...detail.shipment,
      customer: detail.customer,
      commercialCard: detail.commercialCard,
    },
    commercialCard: detail.commercialCard,
  };
}

function customerContextForVerifier(detail) {
  if (!detail) return {};
  return {
    customer: detail.customer,
    shipments: detail.shipments,
    commercialCards: detail.commercialCards,
  };
}

function shipmentSummaryFromContext(plan, detail) {
  const shipment = detail.shipment;
  const customer = detail.customer;
  const route = [
    cleanText(shipment.route?.origin),
    cleanText(shipment.route?.dischargePort),
    cleanText(shipment.route?.deliveryPort) || cleanText(shipment.route?.destination),
  ].filter(Boolean).join(" → ");
  return relationText(
    plan,
    joinLines([
      `خلاصه بار ${shipment.shipmentCode}:`,
      `وضعیت: ${labelOrMissing(shipment.currentStatus || shipment.status)}`,
      customer?.name ? `مشتری: ${customer.name}${customer.customerCode ? ` (${customer.customerCode})` : ""}` : "",
      route ? `مسیر: ${route}` : "",
    ]),
    joinLines([
      `Shipment ${shipment.shipmentCode} summary:`,
      `Status: ${labelOrMissing(shipment.currentStatus || shipment.status)}`,
      customer?.name ? `Customer: ${customer.name}${customer.customerCode ? ` (${customer.customerCode})` : ""}` : "",
      route ? `Route: ${route}` : "",
    ])
  );
}

function groundedShipmentAnswer(plan, detail) {
  const shipment = detail.shipment;
  const customer = detail.customer;
  if (plan.intent === RELATION_INTENTS.SHIPMENT_CUSTOMER_LOOKUP) {
    return relationText(
      plan,
      `مشتری بار ${shipment.shipmentCode}، «${labelOrMissing(customer.name)}»${customer.customerCode ? ` (${customer.customerCode})` : ""} است.`,
      `Shipment ${shipment.shipmentCode} belongs to ${labelOrMissing(customer.name)}${customer.customerCode ? ` (${customer.customerCode})` : ""}.`
    );
  }
  if (plan.intent === RELATION_INTENTS.SHIPMENT_COMMERCIAL_CARD_LOOKUP) {
    const card = detail.commercialCard;
    return card
      ? relationText(
        plan,
        `کارت بازرگانی مرتبط با بار ${shipment.shipmentCode}: ${commercialCardLine(card)}.`,
        `The commercial card linked to shipment ${shipment.shipmentCode}: ${commercialCardLine(card)}.`
      )
      : relationText(
        plan,
        `برای بار ${shipment.shipmentCode} کارت بازرگانی در زمینه دریافت‌شده ثبت نشده است.`,
        `No commercial card was available in the retrieved context for shipment ${shipment.shipmentCode}.`
      );
  }
  return shipmentSummaryFromContext(plan, detail);
}

function groundedCustomerAnswer(plan, detail) {
  const customer = detail.customer;
  if (plan.intent === RELATION_INTENTS.CUSTOMER_COMMERCIAL_CARD_LOOKUP) {
    const cards = detail.commercialCards || [];
    if (!cards.length) {
      return relationText(
        plan,
        `برای مشتری ${labelOrMissing(customer.companyName || customer.contactName || customer.customerCode)} کارت بازرگانی در زمینه دریافت‌شده پیدا نکردم.`,
        `I did not find a commercial card in the retrieved context for ${labelOrMissing(customer.companyName || customer.contactName || customer.customerCode)}.`
      );
    }
    return joinLines([
      relationText(
        plan,
        `کارت‌های بازرگانی مشتری ${labelOrMissing(customer.companyName || customer.contactName || customer.customerCode)}:`,
        `Commercial cards for ${labelOrMissing(customer.companyName || customer.contactName || customer.customerCode)}:`
      ),
      ...cards.slice(0, 5).map((card) => `- ${commercialCardLine(card)}`),
    ]);
  }
  const shipments = detail.shipments || [];
  if (!shipments.length) {
    return relationText(
      plan,
      `برای مشتری ${labelOrMissing(customer.companyName || customer.contactName || customer.customerCode)} پرونده/بار فعال در زمینه دریافت‌شده پیدا نکردم.`,
      `I did not find active shipments in the retrieved context for ${labelOrMissing(customer.companyName || customer.contactName || customer.customerCode)}.`
    );
  }
  return joinLines([
    relationText(
      plan,
      `بارهای فعال مشتری ${labelOrMissing(customer.companyName || customer.contactName || customer.customerCode)} (${shipments.length} مورد):`,
      `Active shipments for ${labelOrMissing(customer.companyName || customer.contactName || customer.customerCode)} (${shipments.length}):`
    ),
    ...shipments.slice(0, 5).map((shipment) => `- ${shipment.shipmentCode}: ${labelOrMissing(shipment.currentStatus || shipment.status)}`),
  ]);
}

async function resolveSingleShipmentForPlan(pool, context, plan, toolsCalled) {
  toolsCalled.push("resolveShipmentRef");
  const matches = await resolveShipmentRef(pool, context, {
    shipmentRef: plan.entities.shipmentRef,
    text: relationRef(plan),
    limit: 5,
  });
  const state = classifyResolutionState(matches);
  if (state === "not_found") return { state, matches };
  if (state === "ambiguous") return { state, result: relationAmbiguousResult(plan, matches, "shipment", toolsCalled) };
  return { state, shipment: matches[0] };
}

async function resolveSingleCustomerForPlan(pool, context, plan, toolsCalled) {
  toolsCalled.push("resolveCustomerRef");
  const matches = await resolveCustomerRef(pool, context, {
    customerRef: plan.entities.customerRef,
    text: relationRef(plan),
    limit: 5,
  });
  const state = classifyResolutionState(matches);
  if (state === "not_found") return { state, matches };
  if (state === "ambiguous") return { state, result: relationAmbiguousResult(plan, matches, "customer", toolsCalled) };
  return { state, customer: matches[0] };
}

async function answerBusinessCandidate(pool, context, plan, candidate, toolsCalled) {
  if (candidate.type === "shipment") {
    toolsCalled.push("getShipmentDetailContext");
    const detail = await getShipmentDetailContext(pool, context, { shipmentId: candidate.id });
    if (!detail) return missingBusinessContextResult(plan, candidate, toolsCalled);

    let deterministicAnswer = businessShipmentAnswer(plan, detail);
    if ((planHasRequestedField(plan, BUSINESS_REQUESTED_FIELDS.PHONE) || planHasRequestedField(plan, BUSINESS_REQUESTED_FIELDS.ADDRESS)) && detail.customer?.id) {
      toolsCalled.push("getCustomerContactInfo");
      const contact = await getCustomerContactInfo(pool, context, { customerId: detail.customer.id });
      if (planHasRequestedField(plan, BUSINESS_REQUESTED_FIELDS.PHONE) && contact?.primaryPhone) {
        deterministicAnswer = relationText(
          plan,
          joinLines([
            `مشتری محموله ${detail.shipment.shipmentCode}: ${labelOrMissing(contact.companyName || contact.contactName || detail.customer.name)}`,
            `شماره تماس: ${contact.primaryPhone}`,
          ]),
          joinLines([
            `Customer for shipment ${detail.shipment.shipmentCode}: ${labelOrMissing(contact.companyName || contact.contactName || detail.customer.name)}`,
            `Phone: ${contact.primaryPhone}`,
          ])
        );
      } else if (planHasRequestedField(plan, BUSINESS_REQUESTED_FIELDS.ADDRESS)) {
        deterministicAnswer = relationText(
          plan,
          `آدرس مشتری محموله ${detail.shipment.shipmentCode}: ${labelOrMissing(contact?.address)}`,
          `Customer address for shipment ${detail.shipment.shipmentCode}: ${labelOrMissing(contact?.address)}`
        );
      }
    }
    if (!deterministicAnswer) return missingBusinessContextResult(plan, candidate, toolsCalled, "requested_field_missing");
    const answer = shouldKeepBusinessAnswerDeterministic(plan)
      ? deterministicAnswer
      : await maybePolishAnswer({ deterministicAnswer, queryType: "business_search", tone: "direct" });
    const activeEntity = detail.customer?.id && (
      planHasRequestedField(plan, BUSINESS_REQUESTED_FIELDS.PHONE, BUSINESS_REQUESTED_FIELDS.CUSTOMER_PHONE, BUSINESS_REQUESTED_FIELDS.ADDRESS) ||
      plan.requestedField === BUSINESS_REQUESTED_FIELDS.CUSTOMER ||
      plan.registryIntent === "shipment.customer.phone.lookup"
    )
      ? {
        type: "customer",
        id: detail.customer.id,
        code: detail.customer.customerCode,
        label: customerDisplayFromDetail(detail.customer),
      }
      : activeEntityFromBusinessCandidate(candidate, detail);
    return relationResult({
      plan,
      answer,
      toolsCalled,
      sources: [
        businessCandidateSource(candidate),
        detail.customer?.id ? source("customer", { id: detail.customer.id, label: detail.customer.name || detail.customer.customerCode, url: detail.customer.actionUrl }) : null,
        ...(detail.commercialCards || []).slice(0, 2).map(commercialCardSource),
      ].filter(Boolean),
      recordIds: [detail.shipment.id, detail.customer?.id, detail.commercialCard?.id].filter(Boolean),
      activeEntity,
      success: true,
      reason: "answered_from_business_search",
    });
  }

  if (candidate.type === "customer") {
    toolsCalled.push("getCustomerDetailContext");
    const detail = await getCustomerDetailContext(pool, context, { customerId: candidate.id });
    if (!detail) return missingBusinessContextResult(plan, candidate, toolsCalled);
    const deterministicAnswer = businessCustomerAnswer(plan, detail);
    if (!deterministicAnswer) return missingBusinessContextResult(plan, candidate, toolsCalled, "requested_field_missing");
    const answer = shouldKeepBusinessAnswerDeterministic(plan)
      ? deterministicAnswer
      : await maybePolishAnswer({ deterministicAnswer, queryType: "business_search", tone: "direct" });
    const activeEntity = activeEntityFromBusinessCandidate(candidate, detail);
    return relationResult({
      plan,
      answer,
      toolsCalled,
      sources: [
        businessCandidateSource(candidate),
        ...detail.shipments.slice(0, 3).map((shipment) => source("shipment", { id: shipment.id, label: `محموله ${shipment.shipmentCode}`, url: shipment.actionUrl })),
        ...detail.commercialCards.slice(0, 2).map(commercialCardSource),
      ],
      recordIds: [detail.customer.id, ...detail.shipments.slice(0, 3).map((item) => item.id)].filter(Boolean),
      activeEntity,
      success: true,
      reason: "answered_from_business_search",
    });
  }

  if (candidate.type === "document") {
    toolsCalled.push("getDocumentBasicInfo");
    const document = await getDocumentBasicInfo(pool, context, { documentId: candidate.id });
    if (!document) return missingBusinessContextResult(plan, candidate, toolsCalled);

    let deterministicAnswer = businessDocumentAnswer(plan, document, candidate);
    const needsCustomerContact = planHasRequestedField(plan, BUSINESS_REQUESTED_FIELDS.PHONE, BUSINESS_REQUESTED_FIELDS.ADDRESS);
    if (needsCustomerContact && document.customerId) {
      toolsCalled.push("getCustomerContactInfo");
      const contact = await getCustomerContactInfo(pool, context, { customerId: document.customerId });
      deterministicAnswer = customerContactAnswerForBusinessRecord(plan, contact, document.title || document.fileName);
    }
    if (!deterministicAnswer) return missingBusinessContextResult(plan, candidate, toolsCalled, "requested_field_missing");
    const answer = shouldKeepBusinessAnswerDeterministic(plan)
      ? deterministicAnswer
      : await maybePolishAnswer({ deterministicAnswer, queryType: "business_search", tone: "direct" });
    const activeEntity = activeEntityFromBusinessCandidate(candidate, { document });
    return relationResult({
      plan,
      answer,
      toolsCalled,
      sources: [
        businessCandidateSource(candidate),
        document.shipmentId ? source("shipment", { id: document.shipmentId, label: `محموله ${document.shipmentId}`, url: `/shipments/${document.shipmentId}` }) : null,
        document.customerId ? source("customer", { id: document.customerId, label: "مشتری مرتبط", url: `/customers/${document.customerId}` }) : null,
      ].filter(Boolean),
      recordIds: [document.id, document.shipmentId, document.customerId].filter(Boolean),
      activeEntity,
      success: true,
      reason: "answered_from_business_search",
    });
  }

  if (candidate.type === "workflow_item") {
    const parsed = parseWorkflowCandidateId(candidate.id);
    const isBlocker = parsed.kind === "blocker";
    toolsCalled.push(isBlocker ? "getWorkflowBlockerBasicInfo" : "getTaskBasicInfo");
    const workflowItem = isBlocker
      ? await getWorkflowBlockerBasicInfo(pool, context, { blockerId: parsed.id })
      : await getTaskBasicInfo(pool, context, { taskId: parsed.id });
    if (!workflowItem) return missingBusinessContextResult(plan, candidate, toolsCalled);

    let deterministicAnswer = businessWorkflowItemAnswer(plan, workflowItem, candidate);
    const needsCustomerContact = planHasRequestedField(plan, BUSINESS_REQUESTED_FIELDS.PHONE, BUSINESS_REQUESTED_FIELDS.ADDRESS);
    if (needsCustomerContact && workflowItem.customerId) {
      toolsCalled.push("getCustomerContactInfo");
      const contact = await getCustomerContactInfo(pool, context, { customerId: workflowItem.customerId });
      deterministicAnswer = customerContactAnswerForBusinessRecord(plan, contact, workflowItem.title || workflowItem.blockerCode);
    }
    if (!deterministicAnswer) return missingBusinessContextResult(plan, candidate, toolsCalled, "requested_field_missing");
    const answer = shouldKeepBusinessAnswerDeterministic(plan)
      ? deterministicAnswer
      : await maybePolishAnswer({ deterministicAnswer, queryType: "business_search", tone: "direct" });
    const activeEntity = activeEntityFromBusinessCandidate(candidate, { workflowItem });
    return relationResult({
      plan,
      answer,
      toolsCalled,
      sources: [
        businessCandidateSource(candidate),
        workflowItem.shipmentId ? source("shipment", { id: workflowItem.shipmentId, label: workflowItem.shipmentCode ? `محموله ${workflowItem.shipmentCode}` : `محموله ${workflowItem.shipmentId}`, url: `/shipments/${workflowItem.shipmentId}` }) : null,
        workflowItem.customerId ? source("customer", { id: workflowItem.customerId, label: workflowItem.customerName || workflowItem.customerCode || "مشتری مرتبط", url: `/customers/${workflowItem.customerId}` }) : null,
      ].filter(Boolean),
      recordIds: [workflowItem.id, workflowItem.shipmentId, workflowItem.customerId].filter(Boolean),
      activeEntity,
      success: true,
      reason: "answered_from_business_search",
    });
  }

  if (candidate.type === "cheque") {
    toolsCalled.push("getChequeBasicInfo");
    const cheque = await getChequeBasicInfo(pool, context, { chequeId: candidate.id });
    if (!cheque) return missingBusinessContextResult(plan, candidate, toolsCalled);

    let deterministicAnswer = businessChequeAnswer(plan, cheque, candidate);
    const needsCustomerContact = planHasRequestedField(plan, BUSINESS_REQUESTED_FIELDS.PHONE, BUSINESS_REQUESTED_FIELDS.ADDRESS);
    if (needsCustomerContact && cheque.customerId) {
      toolsCalled.push("getCustomerContactInfo");
      const contact = await getCustomerContactInfo(pool, context, { customerId: cheque.customerId });
      deterministicAnswer = customerContactAnswerForBusinessRecord(plan, contact, cheque.chequeNumber);
    }
    if (!deterministicAnswer) return missingBusinessContextResult(plan, candidate, toolsCalled, "requested_field_missing");
    const answer = shouldKeepBusinessAnswerDeterministic(plan)
      ? deterministicAnswer
      : await maybePolishAnswer({ deterministicAnswer, queryType: "business_search", tone: "direct" });
    const activeEntity = activeEntityFromBusinessCandidate(candidate, { cheque });
    return relationResult({
      plan,
      answer,
      toolsCalled,
      sources: [
        businessCandidateSource(candidate),
        cheque.customerId ? source("customer", { id: cheque.customerId, label: "مشتری مرتبط", url: `/customers/${cheque.customerId}` }) : null,
      ].filter(Boolean),
      recordIds: [cheque.id, cheque.customerId].filter(Boolean),
      activeEntity,
      success: true,
      reason: "answered_from_business_search",
    });
  }

  if (candidate.type === "commercial_card") {
    toolsCalled.push("getCommercialCardContext");
    const cardContext = await getCommercialCardContext(pool, context, {
      cardRef: candidate.id || candidate.safeSummary?.displayName || candidate.safeSummary?.cardNumber,
      limit: 3,
    });
    const deterministicAnswer = businessCommercialCardAnswer(plan, cardContext, candidate);
    const answer = shouldKeepBusinessAnswerDeterministic(plan)
      ? deterministicAnswer
      : await maybePolishAnswer({ deterministicAnswer, queryType: "business_search", tone: "direct" });
    return relationResult({
      plan,
      answer,
      toolsCalled,
      sources: [businessCandidateSource(candidate), ...(cardContext.cards || []).slice(0, 2).map(commercialCardSource)],
      recordIds: [candidate.id, ...(cardContext.cards || []).slice(0, 2).map((item) => item.id)].filter(Boolean),
      success: true,
      reason: "answered_from_business_search",
    });
  }

  return missingBusinessContextResult(plan, candidate, toolsCalled, "unsupported_business_candidate");
}

function companyBrainMemoryLabel(memory = {}) {
  if (memory.memoryType === "daily_summary") return "خلاصه امروز";
  if (memory.memoryType === "operational_snapshot") return "نمای عملیاتی";
  if (memory.memoryType === "company_summary") return "حافظه کلی";
  return memory.title || "حافظه همیار";
}

function companyBrainItemLine(item = {}) {
  const label = labelOrMissing(item.title || item.entityCode || item.entityId);
  const summary = cleanText(item.summary);
  const stale = item.freshness?.isStale ? ` (${STALE_MEMORY_MESSAGE})` : "";
  return `- ${label}${summary ? `: ${summary}` : ""}${stale}`;
}

function companyBrainSources(snapshot = {}) {
  const memorySources = (snapshot.memories || []).map((memory) => source("company_brain", {
    id: memory.id,
    label: companyBrainMemoryLabel(memory),
  }));
  const itemSources = (snapshot.recentItems || []).slice(0, 5).map((item) => source(
    item.entityType === "task" ? "workflow_item" : item.entityType,
    {
      id: item.entityId,
      label: item.title || item.entityCode || item.entityId,
      url: item.facts?.actionUrl,
    }
  ));
  return uniqueSources([...memorySources, ...itemSources]);
}

function companyBrainSnapshotAnswer(plan = {}, snapshot = {}) {
  const memories = snapshot.memories || [];
  const recentItems = snapshot.recentItems || [];
  const wantsLatest = plan.intent === "company_brain.latest";
  const lines = [];

  if (wantsLatest) {
    lines.push("آخرین مواردی که در حافظه همیار برای این شرکت ثبت شده:");
    lines.push(itemList(recentItems.slice(0, 6), companyBrainItemLine, "هنوز موردی در حافظه شرکت ثبت نشده است."));
  } else {
    lines.push("خلاصه حافظه همیار از وضعیت شرکت:");
    for (const memory of memories) {
      lines.push(`- ${companyBrainMemoryLabel(memory)}: ${memory.summary}`);
    }
    if (recentItems.length) {
      lines.push("آخرین موارد مرتبط:");
      lines.push(...recentItems.slice(0, 4).map(companyBrainItemLine));
    }
  }

  const hasStaleMemory =
    memories.some((memory) => memory.freshness?.isStale) ||
    recentItems.some((item) => item.freshness?.isStale);
  if (hasStaleMemory) lines.push(STALE_MEMORY_MESSAGE);
  return toPersianDigits(joinLines(lines));
}

async function answerCompanyBrainSnapshot(pool, context, plan, toolsCalled = []) {
  if (!plan?.useSnapshot) return null;
  toolsCalled.push("getCompanyBrainSnapshot");
  const snapshot = await getCompanyBrainSnapshot(pool, context, {
    memoryTypes: plan.memoryTypes,
    limit: plan.intent === "company_brain.latest" ? 8 : 5,
  });
  if (!snapshot.memoryAvailable || (!snapshot.memories.length && !snapshot.recentItems.length)) {
    return null;
  }
  return relationResult({
    plan,
    answer: companyBrainSnapshotAnswer(plan, snapshot),
    toolsCalled,
    sources: companyBrainSources(snapshot),
    recordIds: [
      ...snapshot.memories.map((memory) => memory.id),
      ...snapshot.recentItems.map((item) => item.entityId),
    ].filter(Boolean),
    success: true,
    reason: "answered_from_company_brain_snapshot",
    tone: "direct",
  });
}

async function runCompanyBrainSearchPlan(pool, context, plan, toolsCalled = []) {
  if (!plan.searchBusinessContext) return null;

  toolsCalled.push("searchCompanyBrain");
  const searchResult = await searchCompanyBrain(pool, context, {
    queryTerms: plan.queryTerms,
    candidateTypes: plan.candidateTypes,
    requestedField: plan.requestedField,
    requestedFields: requestedFieldsForPlan(plan),
    limit: 8,
  });
  const candidates = rankBusinessCandidatesForPlan(plan, searchResult.candidates || []);
  if (!candidates.length) return null;

  const strongCandidate = strongBusinessCandidate(candidates);
  if (strongCandidate && toolsCalled.length < AGENTIC_CONTEXT_MAX_STEPS) {
    return answerBusinessCandidate(pool, context, plan, strongCandidate, toolsCalled);
  }

  return businessAmbiguousResult(plan, candidates, toolsCalled);
}

async function runBusinessSearchPlan(pool, context, plan, toolsCalled = []) {
  if (!plan.searchBusinessContext) return null;

  const companyBrainResult = await runCompanyBrainSearchPlan(pool, context, plan, toolsCalled);
  if (companyBrainResult) return companyBrainResult;

  toolsCalled.push("searchBusinessContext");
  let searchResult = await searchBusinessContext(pool, context, {
    queryTerms: plan.queryTerms,
    candidateTypes: plan.candidateTypes,
    requestedField: plan.requestedField,
    requestedFields: requestedFieldsForPlan(plan),
    limit: 8,
  });
  let candidates = rankBusinessCandidatesForPlan(plan, searchResult.candidates || []);

  if (!candidates.length && plan.alternateQueryTerms.length && toolsCalled.length < AGENTIC_CONTEXT_MAX_STEPS) {
    toolsCalled.push("searchBusinessContext:alternate");
    searchResult = await searchBusinessContext(pool, context, {
      queryTerms: plan.alternateQueryTerms,
      candidateTypes: plan.candidateTypes,
      requestedField: plan.requestedField,
      requestedFields: requestedFieldsForPlan(plan),
      limit: 8,
    });
    candidates = rankBusinessCandidatesForPlan(plan, searchResult.candidates || []);
  }

  if (!candidates.length) return businessNotFoundResult(plan, searchResult.searched, toolsCalled);

  const strongCandidate = strongBusinessCandidate(candidates);
  if (strongCandidate && toolsCalled.length < AGENTIC_CONTEXT_MAX_STEPS) {
    return answerBusinessCandidate(pool, context, plan, strongCandidate, toolsCalled);
  }

  return businessAmbiguousResult(plan, candidates, toolsCalled);
}

export function extractAmbiguitySelection(message = "") {
  const normalized = normalizeAiLookupCode(message)
    .replace(/[^\p{L}\p{N}\s_-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  if (!normalized) return "";
  if (/^(همین مورد|همون مورد|همونو|همونو باز کن|اون یکی|show me the first one|show me first one)$/u.test(normalized)) {
    return "1";
  }
  const tokens = normalized.split(/\s+/).filter(Boolean);
  if (tokens.length > 8) return "";
  const filler = new Set([
    "به",
    "را",
    "رو",
    "گزینه",
    "مورد",
    "کد",
    "شماره",
    "همین",
    "همون",
    "همونو",
    "اون",
    "آن",
    "یکی",
    "باز",
    "کن",
    "انتخاب",
    "بده",
    "بدهید",
    "بدین",
    "لطفا",
    "لطفاً",
    "option",
    "number",
    "code",
    "show",
    "me",
    "the",
    "one",
    "please",
  ]);
  const meaningful = tokens.filter((token) => !filler.has(token));
  if (meaningful.length !== 1) return "";
  const selection = meaningful[0];
  const ordinals = new Map([
    ["اول", "1"],
    ["اولی", "1"],
    ["یک", "1"],
    ["دوم", "2"],
    ["دومی", "2"],
    ["دو", "2"],
    ["سوم", "3"],
    ["سومی", "3"],
    ["سه", "3"],
    ["چهارم", "4"],
    ["چهار", "4"],
    ["پنجم", "5"],
    ["پنج", "5"],
    ["first", "1"],
    ["second", "2"],
    ["third", "3"],
    ["fourth", "4"],
    ["fifth", "5"],
  ]);
  if (ordinals.has(selection)) return ordinals.get(selection);
  return /\d/.test(selection) && /^[a-z0-9_-]+$/i.test(selection) ? selection : "";
}

function extractCandidateLabelSelection(message = "") {
  const normalized = normalizeAiLookupCode(message)
    .replace(/[^\p{L}\p{N}\s_-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  if (!normalized) return "";
  const filler = new Set([
    "به",
    "را",
    "رو",
    "گزینه",
    "مورد",
    "انتخاب",
    "لطفا",
    "لطفاً",
    "please",
  ]);
  const meaningful = normalized.split(/\s+/).filter((token) => token && !filler.has(token));
  if (!meaningful.length || meaningful.length > 4) return "";
  return meaningful.join(" ");
}

function businessCandidateIdentifiers(candidate = {}) {
  const summary = candidate.safeSummary || {};
  return uniqueValues([
    candidate.id,
    candidate.label,
    summary.shipmentCode,
    summary.customerCode,
    summary.customerName,
    summary.cardNumber,
    summary.displayName,
    summary.holderName,
    summary.companyName,
    summary.responsibleName,
    summary.title,
    summary.blockerCode,
    summary.chequeNumber,
    summary.bankName,
  ]);
}

function normalizeSelectionValue(value = "") {
  return normalizeQueryText(value).replace(/[«»]/g, " ").replace(/\s+/g, " ").trim();
}

function candidateMatchesSelection(candidate = {}, selection = "") {
  const selected = normalizeSelectionValue(selection);
  if (!selected) return false;
  const compactSelected = selected.replace(/\s+/g, "");
  return businessCandidateIdentifiers(candidate).some((value) => {
    const normalized = normalizeSelectionValue(value);
    const compactNormalized = normalized.replace(/\s+/g, "");
    if (normalized === selected || compactNormalized === compactSelected) return true;
    return selected.length >= 3 && normalized.length >= 3 && (normalized.includes(selected) || selected.includes(normalized));
  });
}

function hasSelectionCue(message = "", cues = []) {
  const normalized = normalizeSelectionValue(message);
  return cues.some((cue) => normalized.includes(normalizeSelectionValue(cue)));
}

export function resolveBusinessCandidateSelection(message = "", candidates = []) {
  const selection = extractAmbiguitySelection(message) || extractCandidateLabelSelection(message);
  const list = Array.isArray(candidates) ? candidates.filter(Boolean) : [];
  if (!selection || !list.length) return { state: "not_found", selection };

  const optionNumber = /^\d+$/.test(selection) ? Number(selection) : 0;
  const optionCandidate = optionNumber >= 1 && optionNumber <= list.length ? list[optionNumber - 1] : null;
  const codeCue = hasSelectionCue(message, ["کد", "شماره", "code", "number"]);
  const optionCue = hasSelectionCue(message, ["گزینه", "مورد", "همین", "همون", "همونو", "اون یکی", "اول", "اولی", "دوم", "دومی", "سوم", "سومی", "first", "second", "third", "option"]);
  const matched = list.filter((candidate) => candidateMatchesSelection(candidate, selection));

  if (codeCue && matched.length === 1) return { state: "resolved", selection, candidate: matched[0], reason: "code" };
  if (codeCue && matched.length > 1) return { state: "ambiguous", selection, candidates: matched, reason: "code" };
  if ((optionCue || !matched.length) && optionCandidate) return { state: "resolved", selection, candidate: optionCandidate, reason: "option" };
  if (matched.length === 1) return { state: "resolved", selection, candidate: matched[0], reason: "code" };
  if (matched.length > 1) return { state: "ambiguous", selection, candidates: matched, reason: "code" };
  return { state: "not_found", selection };
}

function parseBusinessOptionLine(line = "") {
  const match = normalizeAiLookupCode(line).match(/^\s*(\d+)\)\s*(.+)$/);
  if (!match) return null;
  const label = cleanText(match[2]);
  const normalizedLabel = normalizeSelectionValue(label);
  let type = "";
  if (normalizedLabel.includes("محموله")) type = "shipment";
  else if (normalizedLabel.includes("مشتری")) type = "customer";
  else if (normalizedLabel.includes("کارت بازرگانی")) type = "commercial_card";
  else if (normalizedLabel.includes("سند")) type = "document";
  else if (normalizedLabel.includes("کار") || normalizedLabel.includes("مرحله")) type = "workflow_item";
  else if (normalizedLabel.includes("چک")) type = "cheque";
  return { optionNumber: Number(match[1]), type, label };
}

function parseCodeAfterLabel(block = "", labels = []) {
  for (const line of block.split(/\r?\n/)) {
    const normalized = normalizeSelectionValue(line);
    for (const label of labels) {
      const normalizedLabel = normalizeSelectionValue(label);
      if (!normalized.startsWith(`${normalizedLabel}:`)) continue;
      return cleanText(normalizeAiLookupCode(line).split(":").slice(1).join(":"));
    }
  }
  return "";
}

function parseBusinessAmbiguityCandidates(content = "") {
  const blocks = String(content || "").split(/\n\s*\n/).map((block) => block.trim()).filter(Boolean);
  const candidates = [];
  for (const block of blocks) {
    const [firstLine = ""] = block.split(/\r?\n/);
    const parsed = parseBusinessOptionLine(firstLine);
    if (!parsed?.type) continue;
    const safeSummary = {
      shipmentCode: parseCodeAfterLabel(block, ["کد محموله", "Shipment code"]),
      customerCode: parseCodeAfterLabel(block, ["کد مشتری", "Customer code"]),
      cardNumber: parseCodeAfterLabel(block, ["شماره کارت", "Card number"]),
      status: parseCodeAfterLabel(block, ["وضعیت", "Status"]),
      bankName: parseCodeAfterLabel(block, ["بانک", "Bank"]),
    };
    const id = safeSummary.shipmentCode || safeSummary.customerCode || safeSummary.cardNumber || parsed.label;
    candidates.push({
      type: parsed.type,
      id,
      label: parsed.label,
      optionNumber: parsed.optionNumber,
      safeSummary,
    });
  }
  return candidates.slice(0, 5);
}

function pendingBusinessCandidatesFromRecentMessages(recentMessages = []) {
  if (!Array.isArray(recentMessages)) return [];
  for (const item of [...recentMessages].reverse()) {
    if (!item || item.role !== "assistant" || typeof item.content !== "string") continue;
    const candidates = parseBusinessAmbiguityCandidates(item.content);
    if (candidates.length) return candidates;
  }
  return [];
}

function previousBusinessPlanFromRecentMessages(recentMessages = []) {
  if (!Array.isArray(recentMessages)) return null;
  for (const item of [...recentMessages].reverse()) {
    if (!item || item.role !== "user" || typeof item.content !== "string") continue;
    const plan = planBusinessSearch(item.content);
    if (plan.searchBusinessContext && plan.queryTerms.length) return plan;
  }
  return null;
}

function uniqueValues(values = []) {
  return [...new Set(values.map((value) => cleanText(value)).filter(Boolean))];
}

function candidateTypesForFollowUp(plan = {}) {
  const requested = requestedFieldsForPlan(plan);
  const types = Array.isArray(plan.candidateTypes) ? plan.candidateTypes : [];
  const allBusinessTypes = ["shipment", "customer", "commercial_card", "document", "workflow_item", "cheque"];
  if (
    requested.includes(BUSINESS_REQUESTED_FIELDS.PHONE) ||
    requested.includes(BUSINESS_REQUESTED_FIELDS.CUSTOMER_PHONE) ||
    requested.includes(BUSINESS_REQUESTED_FIELDS.ADDRESS) ||
    requested.includes(BUSINESS_REQUESTED_FIELDS.ACCOUNTING) ||
    requested.includes(BUSINESS_REQUESTED_FIELDS.CUSTOMER_NUMBER)
  ) {
    return uniqueValues(["customer", ...types, ...allBusinessTypes]);
  }
  return uniqueValues(types.length ? types : allBusinessTypes);
}

function queryTermForSelectedCandidate(candidate = {}) {
  const summary = candidate.safeSummary || {};
  if (candidate.type === "shipment") return cleanText(summary.shipmentCode) || cleanText(candidate.id) || cleanText(candidate.label);
  if (candidate.type === "customer") return cleanText(summary.customerCode) || cleanText(summary.customerName) || cleanText(candidate.id) || cleanText(candidate.label);
  if (candidate.type === "commercial_card") return cleanText(summary.cardNumber) || cleanText(summary.displayName) || cleanText(candidate.id) || cleanText(candidate.label);
  if (candidate.type === "document") return cleanText(summary.shipmentCode) || cleanText(summary.customerCode) || cleanText(summary.title) || cleanText(candidate.id) || cleanText(candidate.label);
  if (candidate.type === "workflow_item") return cleanText(summary.shipmentCode) || cleanText(summary.blockerCode) || cleanText(summary.title) || cleanText(candidate.id) || cleanText(candidate.label);
  if (candidate.type === "cheque") return cleanText(summary.chequeNumber) || cleanText(candidate.id) || cleanText(candidate.label);
  return cleanText(candidate.id) || cleanText(candidate.label);
}

export function followUpBusinessPlanFromRecentMessages(message = "", recentMessages = []) {
  const previousPlan = previousBusinessPlanFromRecentMessages(recentMessages);
  if (!previousPlan) return null;
  const explicitSelection = extractAmbiguitySelection(message);
  const pendingCandidates = pendingBusinessCandidatesFromRecentMessages(recentMessages);
  const resolvedSelection = resolveBusinessCandidateSelection(message, pendingCandidates);
  const selectedCandidate = resolvedSelection.state === "resolved" ? resolvedSelection.candidate : null;
  const selection = explicitSelection || (selectedCandidate ? resolvedSelection.selection : "");
  if (!selection) return null;
  const selectedTerm = selectedCandidate ? queryTermForSelectedCandidate(selectedCandidate) : "";
  const candidateTypes = selectedCandidate?.type
    ? uniqueValues([selectedCandidate.type, ...candidateTypesForFollowUp(previousPlan)])
    : candidateTypesForFollowUp(previousPlan);
  return {
    ...previousPlan,
    intent: "business_search_followup",
    searchBusinessContext: true,
    queryTerms: [selectedTerm || selection],
    alternateQueryTerms: [],
    candidateTypes,
    requestedFields: requestedFieldsForPlan(previousPlan),
    confidence: 0.94,
  };
}

export function shouldUseActiveEntityForFollowUp(message = "", activeEntity = null) {
  if (!activeEntity?.type || !activeEntity?.id) return false;
  if (extractAmbiguitySelection(message)) return false;
  const plan = planBusinessSearch(message);
  if (plan.intent === "identity") return false;
  const requested = requestedFieldsForPlan(plan).filter((field) => field && field !== BUSINESS_REQUESTED_FIELDS.SUMMARY);
  if (requested.includes(BUSINESS_REQUESTED_FIELDS.SHIPMENT_NUMBER) && activeEntity.type !== "shipment") return false;
  const flags = intentFlags(message);
  if (flags.asksDocuments) return false;
  const normalized = normalizeSelectionValue(message);
  const hasContextCue = flags.isFollowUp || hasAny(normalized, [
    "این",
    "همین",
    "قبلی",
    "اون",
    "آن",
    "وضعیتش",
    "شماره اش",
    "شماره‌اش",
    "شماره ش",
    "شماره‌ش",
    "مشتریش",
    "تماسش",
    "تلفنش",
    "موبایلش",
    "شماره تماسش",
    "اطلاعات تماسش",
    "آدرسش",
    "بارهاش",
    "بار هاش",
    "محموله‌هاش",
    "محموله هاش",
    "کارتش",
    "چک‌هاش",
    "چک هاش",
    "فعالیتش",
    "its",
    "that",
  ]);
  return !plan.queryTerms.length && (requested.length > 0 || hasContextCue);
}

async function runBoundedContextAgent(pool, context, message, { recentMessages = [] } = {}) {
  const followUpPlan = followUpBusinessPlanFromRecentMessages(message, recentMessages);
  if (followUpPlan) {
    return runBusinessSearchPlan(pool, context, followUpPlan, ["resolvePendingBusinessSelection"]);
  }

  const plan = detectRelationIntent(message);
  const businessPlan = planBusinessSearch(message);
  const companyBrainPlan = planCompanyBrainLookup(message);
  if (businessPlan.intent === "identity") return identityResult(businessPlan);
  if (companyBrainPlan.useSnapshot) {
    const snapshotResult = await answerCompanyBrainSnapshot(pool, context, companyBrainPlan, []);
    if (snapshotResult) return snapshotResult;
  }
  if (companyBrainPlan.searchCompanyBrain && !businessPlan.searchBusinessContext) {
    const memorySearchResult = await runCompanyBrainSearchPlan(pool, context, companyBrainPlan, []);
    if (memorySearchResult) return memorySearchResult;
  }
  if (!isSupportedRelationIntent(plan.intent)) return runBusinessSearchPlan(pool, context, businessPlan, []);
  if (plan.confidence < 0.7 || !relationRef(plan)) {
    return await runBusinessSearchPlan(pool, context, businessPlan, []) || relationMissingRefResult(plan);
  }

  const toolsCalled = [];
  if (plan.intent.startsWith("shipment.")) {
    const resolved = await resolveSingleShipmentForPlan(pool, context, plan, toolsCalled);
    if (resolved.result) return resolved.result;
    if (!resolved.shipment) {
      return await runBusinessSearchPlan(pool, context, businessPlan, toolsCalled) || relationNotFoundResult(plan, "shipment", toolsCalled);
    }
    if (toolsCalled.length >= AGENTIC_CONTEXT_MAX_STEPS) return relationMissingRefResult(plan);

    toolsCalled.push("getShipmentDetailContext");
    const detail = await getShipmentDetailContext(pool, context, { shipmentId: resolved.shipment.id });
    if (!detail) return relationNotFoundResult(plan, "shipment", toolsCalled);
    const verification = verifyRelationAnswerability(plan.intent, shipmentContextForVerifier(detail));
    const strictBusinessAnswer = verification.answerable && shouldKeepBusinessAnswerDeterministic(businessPlan)
      ? businessShipmentAnswer(businessPlan, detail)
      : null;
    const answer = verification.answerable
      ? strictBusinessAnswer || groundedShipmentAnswer(plan, detail)
      : relationText(
        plan,
        "زمینه دریافت‌شده برای پاسخ به این سؤال کافی نبود. لطفاً کد یا توضیح دقیق‌تری بفرستید.",
        "The retrieved context was not enough to answer this question. Please send a more specific reference."
      );
    const polished = verification.answerable && !strictBusinessAnswer
      ? await maybePolishAnswer({ deterministicAnswer: answer, queryType: plan.intent, tone: "direct" })
      : answer;
    return relationResult({
      plan,
      answer: polished,
      toolsCalled,
      sources: [
        source("shipment", { id: detail.shipment.id, label: `محموله ${detail.shipment.shipmentCode}`, url: detail.shipment.actionUrl }),
        detail.customer?.id ? source("customer", { id: detail.customer.id, label: detail.customer.name || detail.customer.customerCode, url: detail.customer.actionUrl }) : null,
        ...(detail.commercialCards || []).slice(0, 2).map(commercialCardSource),
      ].filter(Boolean),
      recordIds: [detail.shipment.id, detail.customer?.id, detail.commercialCard?.id].filter(Boolean),
      activeEntity: plan.intent === RELATION_INTENTS.SHIPMENT_CUSTOMER_LOOKUP && detail.customer?.id
        ? { type: "customer", id: detail.customer.id, code: detail.customer.customerCode, label: detail.customer.name }
        : { type: "shipment", id: detail.shipment.id, code: detail.shipment.shipmentCode, label: `محموله ${detail.shipment.shipmentCode}` },
      success: verification.answerable,
      reason: verification.answerable ? "answered_from_page_context" : verification.reason,
      tone: verification.answerable ? "direct" : "clarification",
    });
  }

  const resolved = await resolveSingleCustomerForPlan(pool, context, plan, toolsCalled);
  if (resolved.result) return resolved.result;
  if (!resolved.customer) {
    return await runBusinessSearchPlan(pool, context, businessPlan, toolsCalled) || relationNotFoundResult(plan, "customer", toolsCalled);
  }
  if (toolsCalled.length >= AGENTIC_CONTEXT_MAX_STEPS) return relationMissingRefResult(plan);

  toolsCalled.push("getCustomerDetailContext");
  const detail = await getCustomerDetailContext(pool, context, { customerId: resolved.customer.id });
  if (!detail) return relationNotFoundResult(plan, "customer", toolsCalled);
  const verification = verifyRelationAnswerability(plan.intent, customerContextForVerifier(detail));
  const answer = verification.answerable
    ? groundedCustomerAnswer(plan, detail)
    : relationText(
      plan,
      "زمینه دریافت‌شده برای پاسخ به این سؤال کافی نبود. لطفاً نام یا کد دقیق‌تری بفرستید.",
      "The retrieved context was not enough to answer this question. Please send a more specific customer reference."
    );
  const polished = verification.answerable
    ? await maybePolishAnswer({ deterministicAnswer: answer, queryType: plan.intent, tone: "direct" })
    : answer;
  return relationResult({
    plan,
    answer: polished,
    toolsCalled,
    sources: [
      source("customer", { id: detail.customer.id, label: detail.customer.companyName || detail.customer.contactName || detail.customer.customerCode, url: detail.customer.actionUrl }),
      ...detail.shipments.slice(0, 3).map((shipment) => source("shipment", { id: shipment.id, label: `محموله ${shipment.shipmentCode}`, url: shipment.actionUrl })),
      ...detail.commercialCards.slice(0, 3).map(commercialCardSource),
    ],
    recordIds: [detail.customer.id, ...detail.shipments.slice(0, 3).map((item) => item.id), ...detail.commercialCards.slice(0, 3).map((item) => item.id)].filter(Boolean),
    activeEntity: { type: "customer", id: detail.customer.id, code: detail.customer.customerCode, label: detail.customer.companyName || detail.customer.contactName },
    success: verification.answerable,
    reason: verification.answerable ? "answered_from_page_context" : verification.reason,
    tone: verification.answerable ? "direct" : "clarification",
  });
}

async function maybePolishAnswer({ deterministicAnswer, queryType, tone }) {
  if (!llmProviderStatus().configured) return deterministicAnswer;
  const providerResult = await callLlmProvider({
    strength: "fast",
    messages: [
      {
        role: "system",
        content:
          "You are LogisticPlus assistant. Rewrite the provided Persian logistics answer professionally and concisely. Keep it short, conversational, and no longer than necessary. Do not create a report unless the input is already a summary/report. Do not add facts, SQL, IDs, secrets, or data not present in the provided answer.",
      },
      {
        role: "user",
        content: JSON.stringify({ queryType, tone, deterministicAnswer }),
      },
    ],
  });
  if (!providerResult.ok) return deterministicAnswer;
  const deterministicLines = String(deterministicAnswer || "").split(/\r?\n/).length;
  const providerLines = String(providerResult.answer || "").split(/\r?\n/).length;
  const maxLines = Math.max(4, deterministicLines + 1);
  if (providerResult.answer.length > deterministicAnswer.length + 120 || providerLines > maxLines) {
    return deterministicAnswer;
  }
  return providerResult.answer;
}

function clarificationResult({ toolsCalled = [], queryType = "none" } = {}) {
  return {
    data: {
      answer: NO_CODE_DETECTED,
      tone: "clarification",
      responseMode: RESPONSE_MODE_DIRECT,
      sources: [source("system", { label: ASSISTANT_NAME })],
      suggestions: [],
    },
    audit: { queryType, toolsCalled, recordIds: [], success: false },
  };
}

function noShipmentResult(toolsCalled = ["searchShipmentByCode"]) {
  return {
    handled: true,
    data: {
      answer: NO_SHIPMENT_FOUND,
      tone: "clarification",
      responseMode: RESPONSE_MODE_DIRECT,
      sources: [source("system", { label: "جستجوی محموله در سازمان شما" })],
      suggestions: [],
    },
    audit: { queryType: "shipment", toolsCalled, recordIds: [], success: false },
  };
}

function noCustomerResult(toolsCalled = ["searchCustomerByCode"]) {
  return {
    handled: true,
    data: {
      answer: NO_CUSTOMER_FOUND,
      tone: "clarification",
      responseMode: RESPONSE_MODE_DIRECT,
      sources: [source("system", { label: "جستجوی مشتری در سازمان شما" })],
      suggestions: [],
    },
    audit: { queryType: "customer", toolsCalled, recordIds: [], success: false },
  };
}

function shipmentResponseActiveEntity(shipment, message) {
  const flags = intentFlags(message);
  if ((flags.asksShipmentCustomer || flags.asksCustomerPhone) && shipment.customerId) {
    return activeCustomerEntityFromShipment(shipment) || activeShipmentEntity(shipment);
  }
  return activeShipmentEntity(shipment);
}

async function answerShipmentById(pool, context, shipmentId, { message, toolsCalled = ["getShipmentFullProfile"], queryType = "shipment" } = {}) {
  const shipment = await getShipmentFullProfile(pool, context, { shipmentId });
  if (!shipment) return null;

  const flags = intentFlags(message);
  const needCustomerProfile = Boolean(shipment.customerId && (flags.asksCustomerPhone || flags.asksShipmentCustomer));
  toolsCalled.push("getShipmentCaptainInfo", "getShipmentWorkflowStatus");
  if (needCustomerProfile) toolsCalled.push("getCustomerProfile");

  const [captain, workflow, customerProfile] = await Promise.all([
    getShipmentCaptainInfo(pool, context, { shipmentId: shipment.id }),
    getShipmentWorkflowStatus(pool, context, { shipmentId: shipment.id }),
    needCustomerProfile ? getCustomerProfile(pool, context, { customerId: shipment.customerId }) : Promise.resolve(null),
  ]);

  const activeEntity = shipmentResponseActiveEntity(shipment, message);
  const tone = toneForIntent(flags, queryType);
  const focusedAnswer = await focusedShipmentAnswer(pool, context, {
    shipment,
    captain,
    workflow,
    customerProfile,
    message,
    toolsCalled,
  });
  const deterministicAnswer = focusedAnswer?.answer || shipmentAnswer({ shipment, captain, workflow, customerProfile, message });
  const answer = await maybePolishAnswer({
    deterministicAnswer,
    queryType,
    tone,
  });
  const defaultSources = [
    source("shipment", { id: shipment.id, label: `محموله ${shipment.shipmentCode}`, url: shipment.actionUrl }),
    shipment.customerId ? source("customer", { id: shipment.customerId, label: shipment.customerName, url: `/customers/${shipment.customerId}` }) : null,
    captain?.malvaniProfileName ? source("malvani", { label: captain.malvaniProfileName }) : null,
    workflow?.missingData?.workflow ? null : source("workflow", { id: shipment.id, label: "وضعیت جریان کار", url: shipment.actionUrl }),
  ].filter(Boolean);
  const sources = uniqueSources(focusedAnswer?.sources?.length ? focusedAnswer.sources : defaultSources);

  return {
    handled: true,
    data: {
      answer,
      tone,
      responseMode: responseModeForFlags(flags),
      activeEntity,
      suggestions: suggestionsForActiveEntity(activeEntity),
      sources,
    },
    audit: {
      queryType,
      toolsCalled,
      recordIds: [shipment.id, shipment.customerId].filter(Boolean),
      success: true,
    },
  };
}

async function answerShipment(pool, context, candidate, options = {}) {
  const toolsCalled = ["searchShipmentByCode"];
  const found = await searchShipmentByCode(pool, context, { shipmentCode: candidate });
  if (!found) return noShipmentResult(toolsCalled);

  return answerShipmentById(pool, context, found.id, {
    ...options,
    toolsCalled: [...toolsCalled, "getShipmentFullProfile"],
    queryType: "shipment",
  });
}

async function answerCustomerById(pool, context, customerId, { message, toolsCalled = ["getCustomerProfile"], queryType = "customer" } = {}) {
  toolsCalled.push("getCustomerShipments");
  const [customer, shipments] = await Promise.all([
    getCustomerProfile(pool, context, { customerId }),
    getCustomerShipments(pool, context, { customerId }),
  ]);
  if (!customer) return null;

  const flags = intentFlags(message);
  const focusedAnswer = await focusedCustomerAnswer(pool, context, { customer, shipments, message, toolsCalled });
  const deterministicAnswer = focusedAnswer?.answer || customerAnswer({ customer, shipments, message });
  const activeEntity = activeCustomerEntity(customer);
  const tone = toneForIntent(flags, queryType);
  const answer = await maybePolishAnswer({
    deterministicAnswer,
    queryType,
    tone,
  });
  const defaultSources = [
    source("customer", { id: customer.id, label: customer.companyName || customer.customerCode, url: customer.actionUrl }),
    ...shipments.slice(0, 5).map((item) => source("shipment", { id: item.id, label: `محموله ${item.shipmentCode}`, url: item.actionUrl })),
  ];
  const sources = uniqueSources(focusedAnswer?.sources?.length ? focusedAnswer.sources : defaultSources);

  return {
    handled: true,
    data: {
      answer,
      tone,
      responseMode: responseModeForFlags(flags),
      activeEntity,
      suggestions: suggestionsForActiveEntity(activeEntity),
      sources,
    },
    audit: {
      queryType,
      toolsCalled,
      recordIds: [customer.id, ...shipments.slice(0, 5).map((item) => item.id)],
      success: true,
    },
  };
}

async function answerCustomer(pool, context, candidate, options = {}) {
  const toolsCalled = ["searchCustomerByCode"];
  const found = await searchCustomerByCode(pool, context, { customerCode: candidate });
  if (!found) return noCustomerResult(toolsCalled);

  return answerCustomerById(pool, context, found.id, {
    ...options,
    toolsCalled: [...toolsCalled, "getCustomerProfile"],
    queryType: "customer",
  });
}

async function answerFromActiveEntity(pool, context, activeEntity, message) {
  if (!activeEntity?.type || !activeEntity?.id) return null;
  const flags = intentFlags(message);
  if (flags.asksDocuments) {
    return {
      handled: true,
      data: {
        answer: "خواندن یا بازکردن اسناد از طریق این پیگیری هنوز برای همیار فعال نیست.",
        tone: "concise",
        responseMode: RESPONSE_MODE_DIRECT,
        sources: [source("system", { label: "اسناد" })],
        suggestions: [],
      },
      audit: { queryType: "document_followup_deferred", toolsCalled: [], recordIds: [], success: false },
    };
  }
  if (activeEntity.type === "shipment") {
    return answerShipmentById(pool, context, activeEntity.id, {
      message,
      toolsCalled: ["getShipmentFullProfile"],
      queryType: "shipment_followup",
    });
  }
  if (activeEntity.type === "customer") {
    return answerCustomerById(pool, context, activeEntity.id, {
      message,
      toolsCalled: ["getCustomerProfile"],
      queryType: "customer_followup",
    });
  }
  return null;
}

async function answerFromRecentMessages(pool, context, recentMessages, message) {
  const candidates = extractRecentCandidates(recentMessages);
  if (!candidates.length) return null;
  const flags = intentFlags(message);
  const preferCustomer = flags.asksCustomerPhone || flags.asksCustomerShipments || (flags.asksCustomer && !flags.asksCaptain);

  for (const candidate of candidates) {
    const primary = preferCustomer
      ? await answerCustomer(pool, context, candidate, { message, queryType: "customer_followup" })
      : await answerShipment(pool, context, candidate, { message, queryType: "shipment_followup" });
    if (primary?.audit?.success) return primary;

    const secondary = preferCustomer
      ? await answerShipment(pool, context, candidate, { message, queryType: "shipment_followup" })
      : await answerCustomer(pool, context, candidate, { message, queryType: "customer_followup" });
    if (secondary?.audit?.success) return secondary;
  }

  return null;
}

async function answerDomainOverview(pool, context, message) {
  const flags = intentFlags(message);
  const toolsCalled = [];
  let answer = "";
  let sources = [source("system", { label: ASSISTANT_NAME })];
  let queryType = "domain_overview";

  if (flags.asksOperations) {
    toolsCalled.push("getOperationsSnapshot", "getActiveShipmentCountsByStatus");
    const [snapshot, counts] = await Promise.all([
      getOperationsSnapshot(pool, context),
      getActiveShipmentCountsByStatus(pool, context),
    ]);
    answer = joinLines([
      "نمای کلی عملیات:",
      `محموله‌های فعال: ${snapshot.activeShipments}`,
      `محموله‌های دارای مانع: ${snapshot.blockedShipments}`,
      `وظایف معوق: ${snapshot.overdueTasks}`,
      `اسناد فعال: ${snapshot.documents}`,
      `چک‌های نزدیک سررسید: ${snapshot.chequesDueSoon}`,
      counts.length ? `وضعیت‌ها: ${counts.map((item) => `${labelOrMissing(item.status)} ${item.count}`).join("، ")}` : "",
    ]);
    queryType = "operations";
  } else if (flags.asksBlockers) {
    toolsCalled.push("getBlockedShipments");
    const shipments = await getBlockedShipments(pool, context, { limit: 8 });
    answer = `محموله‌های دارای مانع باز:\n${itemList(shipments, formatShipmentLine, "محموله دارای مانع باز پیدا نشد.")}`;
    sources = shipments.slice(0, 5).map((item) => source("shipment", { id: item.id, label: `محموله ${item.shipmentCode}`, url: item.actionUrl }));
    queryType = "workflow";
  } else if (flags.asksTasks) {
    if (flags.asksOverdue) {
      toolsCalled.push("getOverdueTasks");
      const tasks = await getOverdueTasks(pool, context, { limit: 8 });
      answer = `وظایف معوق:\n${itemList(tasks, formatTaskLine, "وظیفه معوقی ثبت نشده است.")}`;
    } else if (flags.asksDueToday) {
      toolsCalled.push("getTasksDueToday");
      const tasks = await getTasksDueToday(pool, context, { limit: 8 });
      answer = `وظایف امروز:\n${itemList(tasks, formatTaskLine, "وظیفه‌ای برای امروز ثبت نشده است.")}`;
    } else if (hasAny(flags.text, ["من", "خودم", "my"])) {
      toolsCalled.push("getMyActiveTasks");
      const tasks = await getMyActiveTasks(pool, context, { limit: 8 });
      answer = `وظایف فعال شما:\n${itemList(tasks, formatTaskLine, "وظیفه فعالی برای شما ثبت نشده است.")}`;
    } else {
      toolsCalled.push("getOrganizationActiveTasks");
      const tasks = await getOrganizationActiveTasks(pool, context, { limit: 8 });
      answer = `وظایف فعال سازمان:\n${itemList(tasks, formatTaskLine, "وظیفه فعال ثبت نشده است.")}`;
    }
    sources = [source("task", { label: "وظایف" })];
    queryType = "tasks";
  } else if (flags.asksCheque) {
    if (flags.asksOverdue) {
      toolsCalled.push("getOverdueCheques");
      const cheques = await getOverdueCheques(pool, context, { limit: 8 });
      answer = `چک‌های معوق:\n${itemList(cheques, formatChequeLine, "چک معوقی ثبت نشده است.")}`;
    } else {
      toolsCalled.push("getChequesDueSoon");
      const cheques = await getChequesDueSoon(pool, context, { days: 7, limit: 8 });
      answer = `چک‌های نزدیک سررسید:\n${itemList(cheques, formatChequeLine, "چک نزدیک سررسید ثبت نشده است.")}`;
    }
    sources = [source("cheque", { label: "چک‌ها" })];
    queryType = "cheques";
  } else if (flags.asksRate) {
    toolsCalled.push("getLatestCurrencyRates");
    const rates = await getLatestCurrencyRates(pool, context, { limit: 8 });
    answer = `آخرین نرخ‌های ارز:\n${itemList(rates, formatRateLine, "نرخ ارزی ثبت نشده است.")}`;
    sources = [source("rate", { label: "نرخ ارز" })];
    queryType = "rates";
  } else if (flags.asksTariff) {
    toolsCalled.push("searchTariffCatalog");
    const tariffs = await searchTariffCatalog(pool, context, { query: message, limit: 6 });
    answer = `نتایج تعرفه:\n${itemList(tariffs, formatTariffLine, "تعرفه‌ای با این عبارت پیدا نشد.")}`;
    sources = [source("tariff", { label: "کاتالوگ تعرفه" })];
    queryType = "tariff";
  } else if (flags.asksEmployee) {
    if (hasAny(flags.text, ["تعداد", "چند", "count"])) {
      toolsCalled.push("getActiveEmployeeCount");
      const count = await getActiveEmployeeCount(pool, context);
      answer = `تعداد کارمندان فعال سازمان: ${count}.`;
    } else {
      toolsCalled.push("searchEmployees");
      const employees = await searchEmployees(pool, context, { query: message, limit: 6 });
      answer = `نتایج کارمندان:\n${itemList(employees, (item) => `- ${labelOrMissing(item.name)} / ${labelOrMissing(item.role)} / ${labelOrMissing(item.status)}`, "کارمندی با این عبارت پیدا نشد.")}`;
    }
    sources = [source("user", { label: "کارمندان" })];
    queryType = "employees";
  } else if (flags.asksKootaj) {
    if (flags.asksMissing) {
      toolsCalled.push("getShipmentsMissingDailyUpdate");
      const shipments = await getShipmentsMissingDailyUpdate(pool, context, { days: 1, limit: 8 });
      answer = `محموله‌های نیازمند بروزرسانی وضعیت روزانه:\n${itemList(shipments, formatShipmentLine, "موردی پیدا نشد.")}`;
      sources = shipments.slice(0, 5).map((item) => source("shipment", { id: item.id, label: `محموله ${item.shipmentCode}`, url: item.actionUrl }));
    } else {
      toolsCalled.push("getDailyStatusSummary");
      const summary = await getDailyStatusSummary(pool, context);
      answer = joinLines([
        "خلاصه وضعیت روزانه/کوتاژ:",
        `کل رکوردها: ${summary.total}`,
        `دارای مانع گمرکی: ${summary.blocked}`,
        `آماده یا انجام‌شده برای ترخیص: ${summary.releaseReadyOrDone}`,
        `بدون شماره کوتاژ: ${summary.missingCotage}`,
      ]);
    }
    queryType = "daily_status";
  } else if (flags.asksDocuments) {
    if (flags.asksMissing) {
      toolsCalled.push("getDocumentCompletenessSummary");
      const summary = await getDocumentCompletenessSummary(pool, context);
      answer = joinLines([
        "خلاصه تکمیل اسناد:",
        `محموله‌های فعال: ${summary.activeShipments}`,
        `محموله‌های دارای سند: ${summary.shipmentsWithDocuments}`,
        summary.unknownRequiredDocuments ? "وضعیت الزامی بودن اسناد هنوز برای همیار متصل نشده است." : "",
      ]);
    } else {
      toolsCalled.push("searchDocuments");
      const docs = await searchDocuments(pool, context, { query: message, limit: 8 });
      answer = `نتایج جستجوی سند:\n${itemList(docs, formatDocumentLine, "سندی با این عبارت پیدا نشد.")}`;
    }
    sources = [source("document", { label: "اسناد" })];
    queryType = "documents";
  } else if (flags.asksChat) {
    toolsCalled.push("getUnreadShipmentChats");
    const chats = await getUnreadShipmentChats(pool, context, { limit: 8 });
    answer = `چت‌های خوانده‌نشده محموله:\n${itemList(chats, (item) => `- ${labelOrMissing(item.shipmentCode || item.name)} / خوانده‌نشده: ${item.unreadCount}`, "چت خوانده‌نشده‌ای برای محموله‌ها ثبت نشده است.")}`;
    sources = [source("chat", { label: "چت محموله‌ها" })];
    queryType = "chat";
  } else if (flags.asksAudit) {
    toolsCalled.push("getRecentOrganizationActivity");
    const history = await getRecentOrganizationActivity(pool, context, { limit: 8 });
    answer = `آخرین فعالیت‌های سازمان:\n${itemList(history, formatAuditLine, "فعالیت قابل نمایش ثبت نشده است.")}`;
    sources = [source("audit", { label: "فعالیت‌های اخیر" })];
    queryType = "audit";
  } else if (flags.asksShipment) {
    toolsCalled.push("searchShipmentsByText");
    const shipments = await searchShipmentsByText(pool, context, { query: message, limit: 6 });
    answer = `نتایج جستجوی محموله:\n${itemList(shipments, formatShipmentLine, "محموله‌ای با این عبارت پیدا نشد.")}`;
    sources = shipments.slice(0, 5).map((item) => source("shipment", { id: item.id, label: `محموله ${item.shipmentCode}`, url: item.actionUrl }));
    queryType = "shipment_search";
  } else if (flags.asksCustomer) {
    toolsCalled.push("searchCustomersByName");
    const customers = await searchCustomersByName(pool, context, { query: message, limit: 6 });
    answer = `نتایج جستجوی مشتری:\n${itemList(customers, (item) => `- ${labelOrMissing(item.companyName || item.contactName)} / ${labelOrMissing(item.customerCode)} / ${labelOrMissing(item.status)}`, "مشتری‌ای با این عبارت پیدا نشد.")}`;
    sources = customers.slice(0, 5).map((item) => source("customer", { id: item.id, label: item.companyName || item.customerCode, url: item.actionUrl }));
    queryType = "customer_search";
  }

  if (!answer) return null;
  const responseMode = responseModeForFlags(flags);
  const tone = toneForIntent(flags, queryType);
  const polished = await maybePolishAnswer({ deterministicAnswer: answer, queryType, tone });
  return {
    handled: true,
    data: {
      answer: polished,
      tone,
      responseMode,
      sources: uniqueSources(sources.filter(Boolean)),
      suggestions: [],
    },
    audit: { queryType, toolsCalled, recordIds: [], success: true },
  };
}

export async function runAiChat({
  pool,
  user,
  organizationId,
  message,
  context = "dashboard",
  recentMessages = [],
  activeEntity,
} = {}) {
  assertCeo(user);
  const toolContext = { user, organizationId };
  const intent = detectAiIntent(message);
  const entityResolution = resolveEntityClueForIntent(message, intent, { activeEntity, context });
  const candidates = entityResolution.codeCandidates;
  const hints = messageHints(message);
  const flags = intentFlags(message);
  if (shouldUseActiveEntityForFollowUp(message, activeEntity)) {
    const activeFollowUpResult = await answerFromActiveEntity(pool, toolContext, activeEntity, message);
    if (activeFollowUpResult) return activeFollowUpResult;
  }
  const boundedContextResult = await runBoundedContextAgent(pool, toolContext, message, { recentMessages });
  if (boundedContextResult) return boundedContextResult;

  if (!candidates.length) {
    const activeResult = await answerFromActiveEntity(pool, toolContext, activeEntity, message);
    if (activeResult) return activeResult;

    const resolvedIntentResult = await answerResolvedEntityIntent(pool, toolContext, entityResolution, message);
    if (resolvedIntentResult) return resolvedIntentResult;

    const generalShipmentResult = await answerGeneralShipmentReference(pool, toolContext, entityResolution, message);
    if (generalShipmentResult) return generalShipmentResult;

    if (flags.isFollowUp) {
      const recentResult = await answerFromRecentMessages(pool, toolContext, recentMessages, message);
      if (recentResult) return recentResult;
      const domainResult = await answerDomainOverview(pool, toolContext, message);
      if (domainResult) return domainResult;
      return clarificationResult({ queryType: "followup" });
    }

    const domainResult = await answerDomainOverview(pool, toolContext, message);
    if (domainResult) return domainResult;

    return clarificationResult({ queryType: context === "ai_chat" ? "conversation" : "none" });
  }

  if (intent === AI_INTENTS.MALVANI_AGENT_PHONE) {
    const resolvedIntentResult = await answerResolvedEntityIntent(pool, toolContext, entityResolution, message);
    if (resolvedIntentResult?.audit?.success || entityResolution.clue) return resolvedIntentResult;
  }

  const generalShipmentResult = await answerGeneralShipmentReference(pool, toolContext, entityResolution, message);

  const looksLikeShipment = hints.shipment || candidates.some((candidate) => normalizeAiLookupCode(candidate).replace(/\D/g, "").length >= 8);

  if (hints.customer && !hints.shipment) {
    let lastCustomerResult = null;
    for (const candidate of candidates) {
      lastCustomerResult = await answerCustomer(pool, toolContext, candidate, { message });
      if (lastCustomerResult?.audit?.success) return lastCustomerResult;
    }
    return lastCustomerResult || noCustomerResult();
  }

  if (looksLikeShipment) {
    let lastShipmentResult = null;
    for (const candidate of candidates) {
      lastShipmentResult = await answerShipment(pool, toolContext, candidate, { message });
      if (lastShipmentResult?.audit?.success) return lastShipmentResult;
    }
    if (generalShipmentResult) return generalShipmentResult;
    return lastShipmentResult || noShipmentResult();
  }

  for (const candidate of candidates) {
    const shipmentResult = await answerShipment(pool, toolContext, candidate, { message });
    if (shipmentResult?.audit?.success) return shipmentResult;
    const customerResult = await answerCustomer(pool, toolContext, candidate, { message });
    if (customerResult?.audit?.success) return customerResult;
  }

  if (generalShipmentResult) return generalShipmentResult;

  return clarificationResult({ queryType: "none" });
}

export const AI_MESSAGES = {
  ASSISTANT_NAME,
  CEO_ONLY_MESSAGE,
  NO_SHIPMENT_FOUND,
  NO_CUSTOMER_FOUND,
  MISSING_CAPTAIN,
  NO_CODE_DETECTED,
  NO_PROVIDER_MESSAGE,
};
