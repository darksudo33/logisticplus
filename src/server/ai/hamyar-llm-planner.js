import {
  getHamyarIntent,
  listHamyarIntents,
} from "./hamyar-capability-registry.js";
import { createHamyarLlmProvider } from "./hamyar-llm-provider.js";
import { buildHamyarPlannerMessages } from "./hamyar-llm-prompts.js";

const KNOWN_UNSUPPORTED_INTENTS = new Set([
  "unsupported",
  "document.lookup",
  "action.proposed.requires_confirmation",
]);

const SQL_PATTERN = /\b(select|insert|update|delete|drop|alter|create|truncate|execute|grant|revoke|union|from|where|join)\b/i;
const TABLE_PATTERN = /\b(shipments|customers|documents|tasks|cheques|app_users|organization_members|shipment_workflow_instances|shipment_workflow_blockers)\b/i;
const SECRET_OR_URL_PATTERN = /(https?:\/\/|bearer\s+|api[_-]?key|token|secret|sk-[A-Za-z0-9])/i;
const CODE_EXECUTION_PATTERN = /(```|function\s*\(|=>|child_process|eval\s*\(|import\s+|require\s*\()/i;

function normalizePath(value = "") {
  if (Array.isArray(value)) return value.map((part) => String(part || "").trim()).filter(Boolean).join(" -> ");
  return String(value || "")
    .split(/->|>|\/|,/)
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" -> ");
}

function cleanNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function unique(values = []) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function stringifyForSafety(value) {
  return JSON.stringify(value || {});
}

function containsUnsafeGeneratedContent(value) {
  const text = stringifyForSafety(value);
  return (
    SQL_PATTERN.test(text) ||
    TABLE_PATTERN.test(text) ||
    SECRET_OR_URL_PATTERN.test(text) ||
    CODE_EXECUTION_PATTERN.test(text)
  );
}

function isDocumentDeferredPlan(plan = {}) {
  const intent = String(plan.intent || "");
  const requestedField = String(plan.requestedField || "");
  const relationPath = normalizePath(plan.relationPath);
  return (
    intent === "document.lookup" ||
    intent.startsWith("document.") ||
    requestedField.includes("document") ||
    requestedField.includes("documents") ||
    relationPath.includes("document")
  );
}

function isFutureActionPlan(plan = {}) {
  const text = stringifyForSafety(plan).toLowerCase();
  return (
    String(plan.intent || "") === "action.proposed.requires_confirmation" ||
    text.includes("write") ||
    text.includes("execute") ||
    text.includes("mutation") ||
    text.includes("تغییر بده") ||
    text.includes("حذف کن")
  );
}

function deterministicExactPlanWins(deterministicPlan = {}) {
  const confidence = cleanNumber(deterministicPlan.confidence, 0);
  const ref =
    deterministicPlan.entities?.shipmentRef ||
    deterministicPlan.entities?.customerRef ||
    deterministicPlan.entities?.commercialCardRef ||
    deterministicPlan.primaryEntity?.ref ||
    "";
  if (confidence >= 0.9 && ref) return true;
  return Boolean(ref && /\d/.test(String(ref)) && deterministicPlan.intent);
}

export function hamyarLlmAllowedPlannerContext() {
  const intents = listHamyarIntents();
  const allowedCapabilities = intents
    .filter((intent) => !String(intent.id || "").startsWith("document."))
    .map((intent) => ({
      intent: intent.id,
      relationPath: normalizePath(intent.relationPath || []),
      requestedField: intent.requestedField,
      primaryEntity: intent.primaryEntity,
      needsCompanyBrain: Boolean(intent.needsCompanyBrain),
      needsLiveVerification: Boolean(intent.needsLiveVerification),
    }));
  return {
    allowedCapabilities,
    allowedRelationPaths: unique(allowedCapabilities.map((item) => item.relationPath)),
    allowedRequestedFields: unique(allowedCapabilities.map((item) => item.requestedField)),
  };
}

export function hamyarLlmSafetyPolicy() {
  return {
    deterministicPlannerIsAuthority: true,
    llmExecutesTools: false,
    sqlAllowed: false,
    writeActionsExecutable: false,
    futureActionsPreviewOnly: true,
    documentLookupDeferred: true,
    secretsAllowed: false,
    urlsAllowedFromLlm: false,
  };
}

export function validateHamyarLlmPlan(rawPlan = {}, { deterministicPlan = {} } = {}) {
  if (!rawPlan || typeof rawPlan !== "object" || Array.isArray(rawPlan)) {
    return { ok: false, reason: "schema_mismatch" };
  }
  if (deterministicExactPlanWins(deterministicPlan)) {
    return { ok: false, reason: "deterministic_exact_plan_wins" };
  }
  if (isFutureActionPlan(rawPlan)) {
    return { ok: false, reason: "future_action_preview_only", previewOnly: true };
  }
  if (isDocumentDeferredPlan(rawPlan)) {
    return { ok: false, reason: "document_lookup_deferred" };
  }
  if (containsUnsafeGeneratedContent(rawPlan)) {
    return { ok: false, reason: "unsafe_generated_content" };
  }

  const intent = String(rawPlan.intent || "").trim();
  if (!intent) return { ok: false, reason: "missing_intent" };
  const definition = getHamyarIntent(intent);
  if (!definition) {
    return KNOWN_UNSUPPORTED_INTENTS.has(intent)
      ? { ok: false, reason: "known_unsupported_intent" }
      : { ok: false, reason: "unknown_capability" };
  }

  const relationPath = normalizePath(rawPlan.relationPath);
  const expectedPath = normalizePath(definition.relationPath || []);
  if (relationPath && relationPath !== expectedPath) {
    return { ok: false, reason: "relation_path_not_allowed" };
  }

  const requestedField = String(rawPlan.requestedField || definition.requestedField || "").trim();
  if (requestedField !== definition.requestedField) {
    return { ok: false, reason: "requested_field_not_allowed" };
  }

  const confidence = Math.max(0, Math.min(cleanNumber(rawPlan.confidence, 0), 0.89));
  const normalizedPlan = {
    intent,
    confidence,
    primaryEntity: rawPlan.primaryEntity && typeof rawPlan.primaryEntity === "object"
      ? {
        type: String(rawPlan.primaryEntity.type || definition.primaryEntity || "").trim(),
        value: String(rawPlan.primaryEntity.value || "").trim(),
        source: String(rawPlan.primaryEntity.source || "llm_suggestion").trim(),
      }
      : null,
    focusedEntity: rawPlan.focusedEntity && typeof rawPlan.focusedEntity === "object"
      ? {
        type: String(rawPlan.focusedEntity.type || "").trim(),
        value: String(rawPlan.focusedEntity.value || "").trim(),
        source: String(rawPlan.focusedEntity.source || "llm_suggestion").trim(),
      }
      : null,
    relationPath: expectedPath,
    requestedField,
    requestedFields: [requestedField],
    preferredEntityTypes: [...(definition.preferredEntityTypes || [])],
    requiresLiveVerification: Boolean(rawPlan.requiresLiveVerification || definition.needsLiveVerification),
    usesCompanyBrain: Boolean(rawPlan.usesCompanyBrain || definition.needsCompanyBrain),
    followupResolution: {
      usesFocusedEntity: Boolean(rawPlan.followupResolution?.usesFocusedEntity),
      usesLastCandidates: Boolean(rawPlan.followupResolution?.usesLastCandidates),
      selectionIndex: Number.isInteger(rawPlan.followupResolution?.selectionIndex)
        ? rawPlan.followupResolution.selectionIndex
        : null,
    },
    ambiguity: {
      needsClarification: Boolean(rawPlan.ambiguity?.needsClarification),
      clarificationQuestion: String(rawPlan.ambiguity?.clarificationQuestion || "").slice(0, 240),
    },
    answerPolicy: String(rawPlan.answerPolicy || "deterministic_tools_only").slice(0, 120),
    safetyFlags: Array.isArray(rawPlan.safetyFlags) ? rawPlan.safetyFlags.map(String).slice(0, 10) : [],
    source: "hamyar_llm_validated_plan",
  };

  return { ok: true, plan: normalizedPlan };
}

export function businessPlanFromValidatedHamyarLlmPlan(validatedPlan = {}, fallbackPlan = {}) {
  const definition = getHamyarIntent(validatedPlan.intent);
  if (!definition) return fallbackPlan;
  const queryTerm = String(validatedPlan.primaryEntity?.value || validatedPlan.focusedEntity?.value || "").trim();
  return {
    ...fallbackPlan,
    intent: "business_search",
    searchBusinessContext: Boolean(queryTerm),
    queryTerms: queryTerm ? [queryTerm] : [],
    alternateQueryTerms: [],
    candidateTypes: [...(definition.preferredEntityTypes || [])],
    requestedField: definition.requestedField,
    requestedFields: [definition.requestedField],
    relationPath: [...(definition.relationPath || [])],
    registryIntent: validatedPlan.intent,
    needsCompanyBrain: Boolean(definition.needsCompanyBrain),
    needsLiveVerification: Boolean(definition.needsLiveVerification),
    liveTool: definition.liveTool || "",
    confidence: validatedPlan.confidence,
    hamyarLlm: {
      llmUsed: true,
      llmMode: "planner",
      llmRejectedReason: "",
    },
  };
}

export async function suggestHamyarLlmPlan({
  message = "",
  conversationContext = {},
  deterministicPlan = {},
  provider = createHamyarLlmProvider(),
} = {}) {
  if (deterministicExactPlanWins(deterministicPlan)) {
    return { ok: false, reason: "deterministic_exact_plan_wins", providerCalled: false };
  }
  if (!provider?.isEnabled?.()) {
    return {
      ok: false,
      reason: provider?.status?.().disabledReason || "hamyar_llm_disabled",
      providerCalled: false,
    };
  }
  const allowed = hamyarLlmAllowedPlannerContext();
  const result = await provider.callJson(
    buildHamyarPlannerMessages({
      message,
      deterministicPlan,
      conversationContext,
      allowedCapabilities: allowed.allowedCapabilities,
      allowedRelationPaths: allowed.allowedRelationPaths,
      allowedRequestedFields: allowed.allowedRequestedFields,
      safetyPolicy: hamyarLlmSafetyPolicy(),
    })
  );
  if (!result.ok) {
    return {
      ok: false,
      reason: result.errorCode || "provider_failed",
      providerCalled: true,
      providerLatencyMs: result.latencyMs || 0,
    };
  }
  const validation = validateHamyarLlmPlan(result.json, { deterministicPlan });
  return {
    ...validation,
    providerCalled: true,
    providerLatencyMs: result.latencyMs || 0,
  };
}
