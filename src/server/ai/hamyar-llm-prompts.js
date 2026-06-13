export const HAMYAR_LLM_PLANNER_SYSTEM_PROMPT = `
You are a constrained planning assistant for LogisticPlus Hamyar.
Return JSON only.
You are not allowed to generate SQL.
You are not allowed to execute actions.
You are not allowed to mutate data.
You are not allowed to invent capabilities, fields, tools, URLs, IDs, phone numbers, dates, amounts, or facts.
You must choose only from the allowed capabilities and relation paths provided by the server.
Document/file/image lookup is currently deferred.
Future actions are preview-only and must never be executable.
Live deterministic tools are the source of truth.
`.trim();

export const HAMYAR_LLM_POLISH_SYSTEM_PROMPT = `
You rewrite a final LogisticPlus Hamyar answer in Persian.
Use only the already-authorized facts provided by the server.
Do not add facts, phone numbers, shipment statuses, customer names, document links, dates, amounts, IDs, SQL, secrets, stack traces, private URLs, or actions.
Do not override unsupported or deferred capability messages.
If the source says information is missing, preserve that meaning.
Keep the answer concise and operational.
`.trim();

export const HAMYAR_LLM_UNSUPPORTED_SYSTEM_PROMPT = `
Write a short safe unsupported-capability response in Persian.
Do not expose document/file/image links.
Do not claim a deferred feature is available.
Do not suggest executing write actions.
`.trim();

export function buildHamyarPlannerMessages({
  message = "",
  deterministicPlan = {},
  conversationContext = {},
  allowedCapabilities = [],
  allowedRelationPaths = [],
  allowedRequestedFields = [],
  safetyPolicy = {},
} = {}) {
  return [
    { role: "system", content: HAMYAR_LLM_PLANNER_SYSTEM_PROMPT },
    {
      role: "user",
      content: JSON.stringify({
        userMessage: message,
        deterministicPlan,
        conversationContext,
        allowedCapabilities,
        allowedRelationPaths,
        allowedRequestedFields,
        safetyPolicy,
        outputSchema: {
          intent: "string",
          confidence: "number",
          primaryEntity: { type: "string", value: "string", source: "string" },
          focusedEntity: { type: "string", value: "string", source: "string" },
          relationPath: "string",
          requestedField: "string",
          requiresLiveVerification: "boolean",
          usesCompanyBrain: "boolean",
          followupResolution: {
            usesFocusedEntity: "boolean",
            usesLastCandidates: "boolean",
            selectionIndex: "number|null",
          },
          ambiguity: {
            needsClarification: "boolean",
            clarificationQuestion: "string",
          },
          answerPolicy: "string",
          safetyFlags: ["string"],
        },
      }),
    },
  ];
}

export function buildHamyarPolishMessages({
  originalQuestion = "",
  deterministicAnswer = "",
  capability = "",
  language = "fa",
  unsupported = false,
  deferred = false,
  allowedFacts = [],
  safetyPolicy = {},
} = {}) {
  return [
    { role: "system", content: HAMYAR_LLM_POLISH_SYSTEM_PROMPT },
    {
      role: "user",
      content: JSON.stringify({
        originalQuestion,
        deterministicAnswer,
        capability,
        language,
        unsupported,
        deferred,
        allowedFacts,
        safetyPolicy,
      }),
    },
  ];
}
