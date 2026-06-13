import { createHamyarLlmProvider } from "./hamyar-llm-provider.js";
import { buildHamyarPolishMessages } from "./hamyar-llm-prompts.js";

const URL_PATTERN = /https?:\/\/|www\./i;
const SQL_PATTERN = /\b(select|insert|update|delete|drop|alter|create|truncate|execute|union|from|where|join)\b/i;
const SECRET_PATTERN = /\b(sk-[A-Za-z0-9]{12,}|Bearer\s+[A-Za-z0-9._~+/=-]+|api[_-]?key|token|secret)\b/i;
const MONEY_PATTERN = /(?:[$€£]|ریال|تومان|دلار|یورو|درهم)\s*\d|(?:\d[\d,._\s]*)\s*(?:ریال|تومان|دلار|یورو|درهم)/i;
const DATE_PATTERN = /\b(?:\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})\b/;
const PHONE_LIKE_PATTERN = /(?:\+?\d[\d\s().-]{6,}\d)/g;
const NUMERIC_TOKEN_PATTERN = /\b[A-Za-z]*\d[A-Za-z0-9_-]*\b/g;
const DOCUMENT_LINK_PATTERN = /(document|file|image|download|storage|object key|لینک|دانلود|فایل|تصویر)/i;

function unique(values = []) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function extractMatches(text = "", pattern) {
  return unique(String(text || "").match(pattern) || []);
}

function sourceIncludesAll(candidateMatches = [], source = "") {
  const sourceText = String(source || "");
  return candidateMatches.every((item) => sourceText.includes(item));
}

export function buildAllowedHamyarFacts({ deterministicAnswer = "", facts = [] } = {}) {
  return unique([
    deterministicAnswer,
    ...facts,
    ...extractMatches(deterministicAnswer, NUMERIC_TOKEN_PATTERN),
    ...extractMatches(deterministicAnswer, PHONE_LIKE_PATTERN),
  ]).slice(0, 120);
}

export function validatePolishedHamyarAnswer({
  deterministicAnswer = "",
  polishedAnswer = "",
  deferred = false,
  unsupported = false,
} = {}) {
  const source = String(deterministicAnswer || "");
  const polished = String(polishedAnswer || "").trim();
  if (!polished) return { ok: false, reason: "empty_polish" };
  if (polished.length > source.length + 160) return { ok: false, reason: "polish_too_long" };
  const sourceLines = source.split(/\r?\n/).length;
  const polishedLines = polished.split(/\r?\n/).length;
  if (polishedLines > Math.max(4, sourceLines + 1)) return { ok: false, reason: "too_many_lines" };
  if (URL_PATTERN.test(polished) && !URL_PATTERN.test(source)) return { ok: false, reason: "introduced_url" };
  if (SQL_PATTERN.test(polished)) return { ok: false, reason: "introduced_sql" };
  if (SECRET_PATTERN.test(polished)) return { ok: false, reason: "introduced_secret" };
  if (MONEY_PATTERN.test(polished) && !MONEY_PATTERN.test(source)) return { ok: false, reason: "introduced_money" };
  if (DATE_PATTERN.test(polished) && !DATE_PATTERN.test(source)) return { ok: false, reason: "introduced_date" };
  if ((deferred || unsupported) && DOCUMENT_LINK_PATTERN.test(polished) && !DOCUMENT_LINK_PATTERN.test(source)) {
    return { ok: false, reason: "introduced_deferred_document_reference" };
  }

  const introducedNumbers = extractMatches(polished, NUMERIC_TOKEN_PATTERN).filter((item) => !source.includes(item));
  if (introducedNumbers.length) return { ok: false, reason: "introduced_numeric_identifier" };
  const introducedPhones = extractMatches(polished, PHONE_LIKE_PATTERN).filter((item) => !source.includes(item));
  if (introducedPhones.length) return { ok: false, reason: "introduced_phone_like_value" };
  if (!sourceIncludesAll(extractMatches(polished, URL_PATTERN), source)) return { ok: false, reason: "introduced_url" };
  return { ok: true, reason: "" };
}

export async function polishHamyarAnswer({
  originalQuestion = "",
  deterministicAnswer = "",
  facts = [],
  capability = "",
  language = "fa",
  unsupported = false,
  deferred = false,
  provider = createHamyarLlmProvider(),
} = {}) {
  const disabledReason = provider?.status?.().disabledReason || "hamyar_llm_disabled";
  if (!provider?.isEnabled?.()) {
    return {
      answer: deterministicAnswer,
      llmUsed: false,
      llmMode: "disabled",
      llmRejectedReason: disabledReason,
      providerLatencyMs: 0,
    };
  }

  const allowedFacts = buildAllowedHamyarFacts({ deterministicAnswer, facts });
  const result = await provider.callText(
    buildHamyarPolishMessages({
      originalQuestion,
      deterministicAnswer,
      capability,
      language,
      unsupported,
      deferred,
      allowedFacts,
      safetyPolicy: {
        noNewFacts: true,
        noSql: true,
        noSecrets: true,
        noDocumentLinksWhenDeferred: true,
      },
    })
  );
  if (!result.ok) {
    return {
      answer: deterministicAnswer,
      llmUsed: false,
      llmMode: "fallback",
      llmRejectedReason: result.errorCode || "provider_failed",
      providerLatencyMs: result.latencyMs || 0,
    };
  }

  const validation = validatePolishedHamyarAnswer({
    deterministicAnswer,
    polishedAnswer: result.text,
    deferred,
    unsupported,
  });
  if (!validation.ok) {
    return {
      answer: deterministicAnswer,
      llmUsed: false,
      llmMode: "fallback",
      llmRejectedReason: validation.reason,
      providerLatencyMs: result.latencyMs || 0,
    };
  }

  return {
    answer: result.text,
    llmUsed: true,
    llmMode: "polish",
    llmRejectedReason: "",
    providerLatencyMs: result.latencyMs || 0,
  };
}
