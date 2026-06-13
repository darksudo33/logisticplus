import {
  HAMYAR_CAPABILITY_REGISTRY,
  getHamyarEntity,
  getHamyarField,
  getHamyarIntent,
  listHamyarIntents,
} from "./hamyar-capability-registry.js";
import {
  SHIPMENT_FIELD_LOOKUP_INTENT_ID,
  matchShipmentFieldQuestion,
} from "./hamyar-shipment-field-registry.js";

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

const QUESTION_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "for",
  "is",
  "of",
  "the",
  "to",
  "what",
  "where",
  "which",
  "who",
  "به",
  "برای",
  "در",
  "از",
  "با",
  "را",
  "رو",
  "این",
  "آن",
  "اون",
  "همین",
  "قبلی",
  "که",
  "چه",
  "چی",
  "چیه",
  "چند",
  "چندتا",
  "چنده",
  "کدوم",
  "کدومه",
  "کدام",
  "کجاست",
  "کجاس",
  "کیه",
  "اسم",
  "نام",
  "هست",
  "است",
  "دارد",
  "داره",
  "ندارد",
  "نداره",
  "مال",
  "آقا",
  "آقای",
  "خانم",
  "شرکت",
  "ها",
  "های",
  "هاش",
  "هایش",
  "اش",
  "ش",
  "همون",
  "همونو",
  "اولی",
  "دومی",
  "سومی",
  "یکی",
  "باز",
  "کن",
  "me",
  "show",
  "one",
]);

const COLLECTION_INTENTS = new Set([
  "task.today.lookup",
  "company.latest_shipment.lookup",
  "company.daily_summary.lookup",
  "missing_data.lookup",
  "ambiguity.selection.reply",
  "identity.capability",
]);

const LEGACY_SHIPMENT_FIELD_KEYS = new Set([
  "shipment.code",
  "shipment.customer",
  "shipment.status",
]);

const ACTIVE_LEGACY_SHIPMENT_FIELD_KEYS = new Set([
  ...LEGACY_SHIPMENT_FIELD_KEYS,
  "shipment.commercial_card",
]);

function normalizeDigits(value = "") {
  return String(value)
    .replace(/[۰-۹]/g, (digit) => String(PERSIAN_DIGITS.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String(ARABIC_DIGITS.indexOf(digit)));
}

export function normalizeHamyarText(value = "") {
  return normalizeDigits(value)
    .replace(/[يى]/g, "ی")
    .replace(/[ك]/g, "ک")
    .replace(/[\u200c\u200d\u200e\u200f\u00a0]/g, " ")
    .replace(/[؟?.,،؛:!()[\]{}"']/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function hasPersian(value = "") {
  return /[\u0600-\u06ff]/.test(String(value));
}

function unique(values = []) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function tokens(value = "") {
  return normalizeHamyarText(value).match(/[\p{L}\p{N}_-]+/gu) || [];
}

function aliasesForEntity(entityType) {
  return getHamyarEntity(entityType)?.aliases || [];
}

function aliasesForField(entityType, fieldName) {
  return getHamyarField(entityType, fieldName)?.aliases || [];
}

function normalizeAliases(aliases = []) {
  return unique(aliases.map(normalizeHamyarText));
}

function includesAlias(normalized, aliases = []) {
  return normalizeAliases(aliases).some((alias) => alias && normalized.includes(alias));
}

function aliasMatchCount(normalized, aliases = []) {
  return normalizeAliases(aliases).filter((alias) => alias && normalized.includes(alias)).length;
}

function allAliasTokens() {
  const values = [
    ...HAMYAR_CAPABILITY_REGISTRY.commandAliases,
    ...QUESTION_STOP_WORDS,
  ];
  for (const entity of Object.values(HAMYAR_CAPABILITY_REGISTRY.entities)) {
    values.push(...(entity.aliases || []));
    for (const field of Object.values(entity.fields || {})) {
      values.push(...(field.aliases || []));
    }
  }
  for (const definition of Object.values(HAMYAR_CAPABILITY_REGISTRY.intents)) {
    values.push(...(definition.aliases || []));
  }
  return new Set(values.flatMap(tokens));
}

const ALIAS_TOKENS = allAliasTokens();

function isCommandOrStopToken(token = "") {
  const strippedPossessive = token.replace(/(هایش|هاش|اش|ش)$/u, "");
  return (
    !token ||
    QUESTION_STOP_WORDS.has(token) ||
    ALIAS_TOKENS.has(token) ||
    !strippedPossessive ||
    QUESTION_STOP_WORDS.has(strippedPossessive) ||
    ALIAS_TOKENS.has(strippedPossessive) ||
    HAMYAR_CAPABILITY_REGISTRY.commandAliases.map(normalizeHamyarText).includes(token)
  );
}

function relationHasEntity(relationPath = [], entityType = "") {
  if (!entityType) return false;
  return relationPath.some((part) => part === entityType || (entityType === "customer" && part === "contact"));
}

function normalizedIncludesAny(normalized = "", terms = []) {
  return terms.some((term) => normalized.includes(normalizeHamyarText(term)));
}

function explicitEntityHints(normalized) {
  return Object.keys(HAMYAR_CAPABILITY_REGISTRY.entities).filter((entityType) =>
    includesAlias(normalized, aliasesForEntity(entityType))
  );
}

function scoreIntent(definition, normalized, activeEntity) {
  let score = 0;
  const primaryAliases = aliasesForEntity(definition.primaryEntity);
  const fieldAliases = aliasesForField(definition.primaryEntity, definition.requestedField);
  const explicitEntities = explicitEntityHints(normalized);
  const primaryFields = getHamyarEntity(definition.primaryEntity)?.fields || {};
  const hasRequestedFieldHint = includesAlias(normalized, fieldAliases);
  const hasDifferentFieldHint = Object.entries(primaryFields).some(([fieldName, fieldDefinition]) =>
    fieldName !== definition.requestedField && includesAlias(normalized, fieldDefinition.aliases || [])
  );
  const matchedIntentAliases = normalizeAliases(definition.aliases || []).filter((alias) => alias && normalized.includes(alias));

  score += Math.min(matchedIntentAliases.length * 0.42, 0.84);
  if (matchedIntentAliases.some((alias) => tokens(alias).length >= 3)) score += 0.2;
  score += Math.min(aliasMatchCount(normalized, fieldAliases) * 0.32, 0.64);
  score += includesAlias(normalized, primaryAliases) ? 0.18 : 0;

  for (const entityType of explicitEntities) {
    if (relationHasEntity(definition.relationPath, entityType) || definition.primaryEntity === entityType) {
      score += 0.16;
    }
  }

  for (const example of definition.examples || []) {
    const exampleTokens = tokens(example).filter((token) => !isCommandOrStopToken(token));
    const common = exampleTokens.filter((token) => normalized.includes(token)).length;
    if (common) score += Math.min(common * 0.08, 0.24);
  }

  if (activeEntity?.type && (definition.primaryEntity === activeEntity.type || relationHasEntity(definition.relationPath, activeEntity.type))) {
    score += 0.1;
  }
  if (
    activeEntity?.type &&
    definition.primaryEntity !== activeEntity.type &&
    relationHasEntity(definition.relationPath, activeEntity.type) &&
    !explicitEntities.includes(definition.primaryEntity)
  ) {
    score -= 0.18;
  }

  if (definition.primaryEntity === "shipment" && explicitEntities.length && !explicitEntities.includes("shipment") && !activeEntity?.type) {
    score -= 0.35;
  }
  if (definition.primaryEntity === "customer" && explicitEntities.includes("shipment")) {
    score -= 0.1;
  }
  if (!hasRequestedFieldHint && hasDifferentFieldHint) {
    score -= 0.22;
  }
  if (definition.primaryEntity === "organization" && !includesAlias(normalized, definition.aliases || [])) {
    score -= 0.08;
  }

  return Math.max(0, Math.min(score, 0.99));
}

function intentSpecificity(definition = {}, normalized = "") {
  const aliases = [
    ...(definition.aliases || []),
    ...aliasesForField(definition.primaryEntity, definition.requestedField),
    ...aliasesForEntity(definition.primaryEntity),
  ];
  const longestAlias = normalizeAliases(aliases)
    .filter((alias) => alias && normalized.includes(alias))
    .reduce((max, alias) => Math.max(max, alias.length), 0);
  return longestAlias + ((definition.relationPath?.length || 0) * 2);
}

function chooseIntent(normalized, activeEntity) {
  const scored = listHamyarIntents()
    .map((definition) => ({
      definition,
      score: scoreIntent(definition, normalized, activeEntity),
      specificity: intentSpecificity(definition, normalized),
    }))
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      if (right.specificity !== left.specificity) return right.specificity - left.specificity;
      const rightPath = right.definition.relationPath?.length || 0;
      const leftPath = left.definition.relationPath?.length || 0;
      return rightPath - leftPath;
    });
  const best = scored[0];
  if (!best || best.score < 0.34) return { id: null, definition: null, confidence: best?.score || 0 };
  return { id: best.definition.id, definition: best.definition, confidence: best.score };
}

function activeEntityType(activeEntity) {
  const type = String(activeEntity?.type || "").trim();
  return HAMYAR_CAPABILITY_REGISTRY.entities[type] ? type : "";
}

function activeEntityReference(activeEntity) {
  return String(activeEntity?.code || activeEntity?.ref || activeEntity?.id || "").trim();
}

function extractReference(question = "", definition = {}, activeEntity = null) {
  const meaningful = tokens(question)
    .map((token) => token.replace(/[%_\\]/g, ""))
    .filter((token) => token.length >= 2 || /^[A-Za-z0-9_-]+$/.test(token))
    .filter((token) => !isCommandOrStopToken(token));
  const numeric = meaningful.find((token) => /\d/.test(token));
  if (numeric) return { ref: numeric, fromActiveEntity: false };
  if (meaningful.length >= 2 && meaningful.every((token) => !/^\d+$/.test(token))) {
    return { ref: meaningful.slice(0, 3).join(" "), fromActiveEntity: false };
  }
  if (meaningful[0]) return { ref: meaningful[0], fromActiveEntity: false };

  const activeType = activeEntityType(activeEntity);
  if (activeType && (definition.primaryEntity === activeType || relationHasEntity(definition.relationPath, activeType))) {
    const ref = activeEntityReference(activeEntity);
    if (ref) return { ref, fromActiveEntity: true };
  }
  return { ref: meaningful[0] || "", fromActiveEntity: false };
}

function extractShipmentFieldReference(question = "", activeEntity = null) {
  const meaningful = tokens(question)
    .map((token) => token.replace(/[%_\\]/g, ""))
    .filter((token) => token.length >= 2 || /^[A-Za-z0-9_-]+$/.test(token))
    .filter((token) => !isCommandOrStopToken(token));
  const numeric = meaningful.find((token) => /\d/.test(token));
  if (numeric) return { ref: numeric, fromActiveEntity: false };

  const activeType = activeEntityType(activeEntity);
  if (activeType === "shipment") {
    const ref = activeEntityReference(activeEntity);
    if (ref) return { ref, fromActiveEntity: true };
  }
  return { ref: "", fromActiveEntity: false };
}

function queryTermsFor(question = "", reference = "") {
  const ref = normalizeHamyarText(reference);
  if (ref) return [ref];
  const meaningful = tokens(question)
    .map((token) => token.replace(/[%_\\]/g, ""))
    .filter((token) => token.length >= 2 || /^[A-Za-z0-9_-]+$/.test(token))
    .filter((token) => !isCommandOrStopToken(token));
  if (meaningful.length === 2 && meaningful.every((token) => !/^\d+$/.test(token))) return [meaningful.join(" ")];
  return unique(meaningful).slice(0, 8);
}

function buildShipmentFieldLookupPlan(question = "", activeEntity = null) {
  const match = matchShipmentFieldQuestion(question);
  const field = match?.field || null;
  if (!field || LEGACY_SHIPMENT_FIELD_KEYS.has(field.key)) return null;
  const normalized = normalizeHamyarText(question);
  if (
    field.key === "shipment.commercial_card" &&
    (
      normalizedIncludesAny(normalized, ["مشتری", "customer"]) ||
      !normalizedIncludesAny(normalized, ["ثبت", "داره", "دارد", "وجود", "registered", "has"])
    )
  ) {
    return null;
  }

  const definition = getHamyarIntent(SHIPMENT_FIELD_LOOKUP_INTENT_ID);
  if (!definition) return null;
  const reference = extractShipmentFieldReference(question, activeEntity);
  const hasReference = Boolean(reference.ref);
  return buildResolvedPlan(question, SHIPMENT_FIELD_LOOKUP_INTENT_ID, definition, hasReference ? 0.97 : 0.9, activeEntity, {
    reference,
    queryTerms: reference.ref && !reference.fromActiveEntity ? [reference.ref] : [],
    relationPath: field.relationPath || definition.relationPath,
    requestedField: field.key,
    requestedFields: [field.key],
    liveTool: field.sourceTool || "",
    needsLiveVerification: Boolean(field.liveVerificationRequired),
    needsCompanyBrain: false,
    fallback: hasReference ? "current_planner_fallback" : "ask_clarification",
  });
}

function buildPrimaryEntity(definition = {}, ref = "", activeEntity = null, fromActiveEntity = false) {
  const type = definition.primaryEntity || "";
  if (!type || type === "organization") return null;
  if (fromActiveEntity && activeEntity?.type) {
    return {
      type: activeEntity.type,
      id: activeEntity.id || "",
      ref,
      label: activeEntity.label || activeEntity.code || ref,
      fromActiveEntity: true,
    };
  }
  return {
    type,
    ref,
    fromActiveEntity: false,
  };
}

function relationRefEntities(definition = {}, ref = "") {
  const base = {
    shipmentRef: null,
    customerRef: null,
    commercialCardRef: null,
    taskRef: null,
    documentRef: null,
    chequeRef: null,
  };
  if (!ref) return base;
  if (definition.primaryEntity === "shipment" || relationHasEntity(definition.relationPath, "shipment")) base.shipmentRef = ref;
  else if (definition.primaryEntity === "customer" || relationHasEntity(definition.relationPath, "customer")) base.customerRef = ref;
  else if (definition.primaryEntity === "commercial_card" || relationHasEntity(definition.relationPath, "commercial_card")) base.commercialCardRef = ref;
  else if (definition.primaryEntity === "task") base.taskRef = ref;
  else if (definition.primaryEntity === "document") base.documentRef = ref;
  else if (definition.primaryEntity === "cheque") base.chequeRef = ref;
  return base;
}

function needsEntityResolution(intentId, definition = {}, ref = "", fromActiveEntity = false) {
  if (COLLECTION_INTENTS.has(intentId)) return false;
  if (!definition.primaryEntity || definition.primaryEntity === "organization") return false;
  if (fromActiveEntity) return false;
  return Boolean(ref || definition.primaryEntity);
}

function fallbackFor(intentId, definition = {}, ref = "", fromActiveEntity = false) {
  if (definition.fallback && definition.fallback !== "ask_clarification") return definition.fallback;
  if (!needsEntityResolution(intentId, definition, ref, fromActiveEntity)) return "current_planner_fallback";
  return ref || fromActiveEntity ? "current_planner_fallback" : "ask_clarification";
}

function buildResolvedPlan(question = "", intentId = "", definition = {}, confidence = 0, activeEntity = null, options = {}) {
  const reference = options.reference || extractReference(question, definition, activeEntity);
  const ref = reference.ref || "";
  const fromActiveEntity = Boolean(reference.fromActiveEntity);
  const primaryEntity = buildPrimaryEntity(definition, ref, activeEntity, fromActiveEntity);
  const queryTerms = Array.isArray(options.queryTerms) ? options.queryTerms : queryTermsFor(question, ref);
  const preferredEntityTypes = unique(definition.preferredEntityTypes || []);
  const requestedField = options.requestedField || definition.requestedField;
  const requestedFields = unique(options.requestedFields || [requestedField]);

  return {
    intent: intentId,
    legacyIntent: options.legacyIntent ?? definition.legacyIntent ?? "",
    language: hasPersian(question) ? "fa" : "en",
    confidence,
    primaryEntity,
    relationPath: [...(options.relationPath || definition.relationPath || [])],
    requestedField,
    requestedFields,
    preferredEntityTypes,
    candidateTypes: preferredEntityTypes,
    queryTerms,
    alternateQueryTerms: [],
    entities: relationRefEntities(definition, ref),
    needsEntityResolution: options.needsEntityResolution ?? needsEntityResolution(intentId, definition, ref, fromActiveEntity),
    needsCompanyBrain: options.needsCompanyBrain ?? Boolean(definition.needsCompanyBrain),
    needsLiveVerification: options.needsLiveVerification ?? Boolean(definition.needsLiveVerification),
    liveTool: options.liveTool ?? definition.liveTool ?? "",
    memoryPolicy: definition.memoryPolicy,
    freshness: definition.freshness,
    answerTemplate: definition.answerTemplate || "",
    missingTemplate: definition.missingTemplate || "",
    fallback: options.fallback || fallbackFor(intentId, definition, ref, fromActiveEntity),
    source: "hamyar_capability_registry_v1",
  };
}

function selectionFollowUpIntent(normalized = "") {
  if (!normalized) return "";
  if (/^\d+$/.test(normalized)) return "ambiguity.selection.reply";
  if (
    /^(اول|اولی|یک|دوم|دومی|دو|سوم|سومی|سه|چهارم|چهار|پنجم|پنج|first|second|third|fourth|fifth)$/u.test(normalized)
  ) {
    return "ambiguity.selection.reply";
  }
  if (
    /^(گزینه|مورد)\s+(\d+|اول|اولی|یک|دوم|دومی|دو|سوم|سومی|سه|چهارم|چهار|پنجم|پنج|first|second|third|fourth|fifth)$/u.test(normalized)
  ) {
    return "ambiguity.selection.reply";
  }
  if (/^به\s+[\p{L}\p{N}_-]+$/u.test(normalized)) return "ambiguity.selection.reply";
  if (
    normalizedIncludesAny(normalized, [
      "همین مورد",
      "همون مورد",
      "همونو",
      "اون یکی",
      "show me the first one",
      "show me first one",
    ])
  ) {
    return "ambiguity.selection.reply";
  }
  return "";
}

function buildSelectionFollowUpPlan(question = "", normalized = "") {
  const intentId = selectionFollowUpIntent(normalized);
  const definition = intentId ? getHamyarIntent(intentId) : null;
  if (!definition) return null;
  return buildResolvedPlan(question, intentId, definition, 0.96, null, {
    queryTerms: [],
    needsEntityResolution: false,
    needsLiveVerification: true,
    fallback: definition.fallback || "resolve_pending_selection",
  });
}

function activeFollowUpIntent(normalized = "", activeEntity = null) {
  const activeType = activeEntityType(activeEntity);
  if (!activeType) return null;

  const asksShipmentNumber = normalizedIncludesAny(normalized, [
    "شماره بار",
    "شماره محموله",
    "شماره پرونده",
    "کد بار",
    "کد محموله",
    "shipment number",
  ]);
  const asksContact = normalizedIncludesAny(normalized, [
    "شماره",
    "شماره اش",
    "شماره‌اش",
    "شماره ش",
    "شماره‌ش",
    "شماره تماس",
    "تماسش",
    "تلفنش",
    "موبایلش",
    "تلفن",
    "موبایل",
    "تماس",
    "phone",
    "mobile",
    "contact",
  ]);
  const asksStatus = normalizedIncludesAny(normalized, [
    "وضعیت",
    "وضعیتش",
    "در چه حال",
    "کجاست",
    "کجاس",
    "چی شد",
    "status",
    "where",
  ]);
  const asksCustomerOwner = normalizedIncludesAny(normalized, [
    "مشتریش",
    "مشتری",
    "صاحبش",
    "صاحب",
    "مالک",
    "مال کی",
    "برای کی",
    "customer",
    "owner",
    "who",
  ]);
  const asksShipments = normalizedIncludesAny(normalized, [
    "بارهاش",
    "بار هاش",
    "بارهایش",
    "محموله‌هاش",
    "محموله هاش",
    "محموله‌هایش",
    "پرونده‌هاش",
    "پرونده هاش",
    "shipments",
  ]);
  const asksCommercialCard = normalizedIncludesAny(normalized, [
    "کارت بازرگانی",
    "کارتش",
    "commercial card",
  ]);
  const asksTasks = normalizedIncludesAny(normalized, [
    "وظایف",
    "وظیفه",
    "وظایفش",
    "تسک",
    "تسکش",
    "کارهاش",
    "tasks",
  ]);
  const asksCheques = normalizedIncludesAny(normalized, ["چک", "چک‌هاش", "چک هاش", "cheque", "check"]);
  const asksActivity = normalizedIncludesAny(normalized, [
    "آخرین فعالیت",
    "فعالیتش",
    "آخرین تغییر",
    "تاریخچه",
    "activity",
    "history",
  ]);
  const asksDocuments = normalizedIncludesAny(normalized, ["سند", "اسناد", "مدارک", "document", "file"]);
  const shipmentFieldMatch = activeType === "shipment" ? matchShipmentFieldQuestion(normalized) : null;
  if (shipmentFieldMatch?.field && !ACTIVE_LEGACY_SHIPMENT_FIELD_KEYS.has(shipmentFieldMatch.field.key)) {
    return {
      intentId: SHIPMENT_FIELD_LOOKUP_INTENT_ID,
      requestedField: shipmentFieldMatch.field.key,
      requestedFields: [shipmentFieldMatch.field.key],
      relationPath: shipmentFieldMatch.field.relationPath,
      liveTool: shipmentFieldMatch.field.sourceTool || "",
      needsLiveVerification: Boolean(shipmentFieldMatch.field.liveVerificationRequired),
    };
  }
  if (asksDocuments) return null;

  if (activeType === "shipment") {
    if (asksContact && !asksShipmentNumber) return { intentId: "shipment.customer.phone.lookup" };
    if (asksCustomerOwner) return { intentId: "shipment.customer.lookup" };
    if (asksStatus) return { intentId: "shipment.status.lookup" };
    if (asksCommercialCard) return { intentId: "shipment.commercial_card.lookup" };
    if (asksTasks) return { intentId: "shipment.tasks.lookup" };
    if (asksActivity) return { intentId: "shipment.activity.lookup" };
    return null;
  }

  if (activeType === "customer") {
    if (asksShipmentNumber) return null;
    if (asksContact) return { intentId: "customer.contact.lookup" };
    if (asksShipments) return { intentId: "customer.shipments.lookup" };
    if (asksStatus) return { intentId: "customer.lookup", requestedField: "status", requestedFields: ["status"] };
    if (asksCustomerOwner) return { intentId: "customer.lookup" };
    if (asksTasks) return { intentId: "customer.tasks.lookup" };
    if (asksCheques) return { intentId: "cheque.customer.lookup" };
    if (asksActivity) return { intentId: "customer.activity.lookup" };
    return null;
  }

  return null;
}

function isActiveDocumentFollowUp(normalized = "", activeEntity = null) {
  return Boolean(
    activeEntityType(activeEntity) &&
    normalizedIncludesAny(normalized, ["سند", "اسناد", "مدارک", "document", "file"])
  );
}

function buildActiveFollowUpPlan(question = "", normalized = "", activeEntity = null) {
  const activeMatch = activeFollowUpIntent(normalized, activeEntity);
  if (!activeMatch?.intentId) return null;
  const definition = getHamyarIntent(activeMatch.intentId);
  if (!definition) return null;
  const ref = activeEntityReference(activeEntity);
  if (!ref) return null;
  return buildResolvedPlan(question, activeMatch.intentId, definition, 0.94, activeEntity, {
    reference: { ref, fromActiveEntity: true },
    queryTerms: [],
    requestedField: activeMatch.requestedField,
    requestedFields: activeMatch.requestedFields,
    relationPath: activeMatch.relationPath,
    liveTool: activeMatch.liveTool,
    needsLiveVerification: activeMatch.needsLiveVerification ?? true,
  });
}

function emptyPlan(question = "") {
  const language = hasPersian(question) ? "fa" : question ? "en" : "unknown";
  return {
    intent: null,
    language,
    confidence: 0,
    primaryEntity: null,
    relationPath: [],
    requestedField: "summary",
    requestedFields: ["summary"],
    preferredEntityTypes: [],
    candidateTypes: [],
    queryTerms: queryTermsFor(question),
    alternateQueryTerms: [],
    entities: relationRefEntities({}, ""),
    needsEntityResolution: false,
    needsCompanyBrain: false,
    needsLiveVerification: false,
    liveTool: "",
    memoryPolicy: "none",
    freshness: "memory_candidate",
    fallback: "current_planner_fallback",
    source: "hamyar_capability_registry_v1",
  };
}

export function resolveHamyarQuestionPlan(question = "", context = {}, activeEntity = context?.activeEntity) {
  const normalized = normalizeHamyarText(question);
  if (!normalized) return emptyPlan(question);

  const selectionFollowUpPlan = buildSelectionFollowUpPlan(question, normalized);
  if (selectionFollowUpPlan) return selectionFollowUpPlan;

  const activeFollowUpPlan = buildActiveFollowUpPlan(question, normalized, activeEntity);
  if (activeFollowUpPlan) return activeFollowUpPlan;
  if (isActiveDocumentFollowUp(normalized, activeEntity)) return emptyPlan(question);

  const shipmentFieldPlan = buildShipmentFieldLookupPlan(question, activeEntity);
  if (shipmentFieldPlan) return shipmentFieldPlan;

  const { id: intentId, definition, confidence } = chooseIntent(normalized, activeEntity);
  if (!intentId || !definition) return emptyPlan(question);

  return buildResolvedPlan(question, intentId, definition, confidence, activeEntity);
}

export function hamyarIntentFieldPolicy(intentId) {
  const definition = getHamyarIntent(intentId);
  if (!definition) return null;
  return getHamyarField(definition.primaryEntity, definition.requestedField);
}
