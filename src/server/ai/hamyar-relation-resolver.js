import {
  HAMYAR_CAPABILITY_REGISTRY,
  getHamyarEntity,
  getHamyarField,
  getHamyarIntent,
  listHamyarIntents,
} from "./hamyar-capability-registry.js";

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
]);

const COLLECTION_INTENTS = new Set([
  "task.today.lookup",
  "company.latest_shipment.lookup",
  "company.daily_summary.lookup",
  "missing_data.lookup",
  "ambiguity.selection.reply",
  "identity.capability",
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

  const { id: intentId, definition, confidence } = chooseIntent(normalized, activeEntity);
  if (!intentId || !definition) return emptyPlan(question);

  const { ref, fromActiveEntity } = extractReference(question, definition, activeEntity);
  const primaryEntity = buildPrimaryEntity(definition, ref, activeEntity, fromActiveEntity);
  const queryTerms = queryTermsFor(question, ref);
  const preferredEntityTypes = unique(definition.preferredEntityTypes || []);
  const requestedFields = unique([definition.requestedField]);

  return {
    intent: intentId,
    legacyIntent: definition.legacyIntent || "",
    language: hasPersian(question) ? "fa" : "en",
    confidence,
    primaryEntity,
    relationPath: [...(definition.relationPath || [])],
    requestedField: definition.requestedField,
    requestedFields,
    preferredEntityTypes,
    candidateTypes: preferredEntityTypes,
    queryTerms,
    alternateQueryTerms: [],
    entities: relationRefEntities(definition, ref),
    needsEntityResolution: needsEntityResolution(intentId, definition, ref, fromActiveEntity),
    needsCompanyBrain: Boolean(definition.needsCompanyBrain),
    needsLiveVerification: Boolean(definition.needsLiveVerification),
    liveTool: definition.liveTool || "",
    memoryPolicy: definition.memoryPolicy,
    freshness: definition.freshness,
    answerTemplate: definition.answerTemplate || "",
    missingTemplate: definition.missingTemplate || "",
    fallback: fallbackFor(intentId, definition, ref, fromActiveEntity),
    source: "hamyar_capability_registry_v1",
  };
}

export function hamyarIntentFieldPolicy(intentId) {
  const definition = getHamyarIntent(intentId);
  if (!definition) return null;
  return getHamyarField(definition.primaryEntity, definition.requestedField);
}
