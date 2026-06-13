import { readFile } from "node:fs/promises";
import path from "node:path";

export const HAMYAR_QUESTION_DATASET_DEFAULT_PATH = path.resolve(
  "data/hamyar/hamyar_logistic_question_dataset_v1.jsonl"
);

export const HAMYAR_QUESTION_DATASET_REQUIRED_FIELDS = Object.freeze([
  "id",
  "language",
  "domain",
  "category",
  "intent",
  "question",
  "primary_entity",
  "relation_path",
  "requested_field",
  "expected_route",
  "expected_behavior",
  "requires_live_verification",
  "uses_company_brain",
  "future_write_action",
  "priority",
  "eval_assertions",
]);

const YES_NO_FIELDS = Object.freeze([
  "requires_live_verification",
  "uses_company_brain",
  "future_write_action",
]);

const VALID_PRIORITIES = new Set(["P0", "P1", "P2"]);
const VALID_YES_NO = new Set(["yes", "no"]);

const MOJIBAKE_PATTERN = /(?:\uFFFD|Ã.|Â.|â(?:€|€™|€œ|€Œ|€¦|„)|Ø.|Ù.|Û.)/u;
const SECRET_PATTERNS = Object.freeze([
  { name: "AWS access key", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "private key", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: "JWT", pattern: /\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\b/ },
  { name: "generic API key", pattern: /\b(?:api[_-]?key|secret|token|password)\s*[:=]\s*["']?[A-Za-z0-9_./+=-]{16,}/i },
  { name: "S3 object URL", pattern: /\bs3:\/\/[^\s"']+/i },
]);

function lineLabel(lineNumber) {
  return Number.isFinite(lineNumber) ? `line ${lineNumber}` : "unknown line";
}

function errorFor(row, message, field = "") {
  return {
    id: typeof row?.id === "string" ? row.id : "",
    lineNumber: row?.__lineNumber || null,
    field,
    message,
  };
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeFlag(value) {
  return String(value || "").trim().toLowerCase();
}

function textFields(row = {}) {
  return Object.entries(row)
    .filter(([, value]) => typeof value === "string")
    .map(([field, value]) => ({ field, value }));
}

export function hasHamyarMojibake(value = "") {
  return MOJIBAKE_PATTERN.test(String(value || ""));
}

export function parseHamyarRelationPath(relationPath = "") {
  const raw = String(relationPath || "").trim();
  if (!raw) return [];
  if (/^(?:->|→)|(?:->|→)$/.test(raw)) {
    throw new Error("relation_path must not start or end with an arrow");
  }
  const segments = raw
    .split(/\s*(?:->|→)\s*/u)
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (!segments.length) return [];
  if (segments.some((segment) => !/[\p{L}\p{N}_/-]/u.test(segment))) {
    throw new Error("relation_path contains an empty or invalid segment");
  }
  return segments;
}

export function parseHamyarEvalAssertions(assertions = "") {
  const raw = String(assertions || "").trim();
  if (!raw) return {};
  const parsed = {};
  for (const part of raw.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const match = trimmed.match(/^([A-Za-z0-9_.-]+)\s*=\s*(.+)$/);
    if (!match) {
      throw new Error(`invalid assertion "${trimmed}"`);
    }
    parsed[match[1]] = match[2].trim();
  }
  return parsed;
}

function rowValue(row, field) {
  return String(row?.[field] || "").trim();
}

function futureActionIsPreviewOnly(row) {
  const combined = [
    rowValue(row, "intent"),
    rowValue(row, "expected_route"),
    rowValue(row, "expected_behavior"),
    rowValue(row, "eval_assertions"),
    rowValue(row, "notes"),
  ].join(" ").toLowerCase();
  const hasPreviewMarker =
    combined.includes("preview") ||
    combined.includes("proposed") ||
    combined.includes("confirmation") ||
    combined.includes("not for immediate execution") ||
    combined.includes("never execute directly");
  const unsafeDirectExecution =
    combined.includes("execute directly") && !combined.includes("never execute directly");
  const unsafeImmediateExecution =
    combined.includes("immediate execution") && !combined.includes("not for immediate execution");
  return hasPreviewMarker && !unsafeDirectExecution && !unsafeImmediateExecution;
}

export function scanHamyarQuestionDatasetSecrets(rows = []) {
  const findings = [];
  for (const row of rows) {
    for (const { field, value } of textFields(row)) {
      for (const { name, pattern } of SECRET_PATTERNS) {
        if (pattern.test(value)) {
          findings.push(errorFor(row, `possible secret detected: ${name}`, field));
        }
      }
    }
  }
  return findings;
}

export function parseHamyarQuestionDatasetLine(line, lineNumber) {
  const trimmed = String(line || "").replace(/^\uFEFF/u, "");
  if (!trimmed.trim()) {
    throw new Error(`${lineLabel(lineNumber)}: blank lines are not valid dataset rows`);
  }
  let row;
  try {
    row = JSON.parse(trimmed);
  } catch (error) {
    throw new Error(`${lineLabel(lineNumber)}: invalid JSONL row: ${error.message}`);
  }
  if (!isPlainObject(row)) {
    throw new Error(`${lineLabel(lineNumber)}: JSONL row must be an object`);
  }
  Object.defineProperty(row, "__lineNumber", {
    value: lineNumber,
    enumerable: false,
    configurable: true,
  });
  return row;
}

export async function loadHamyarQuestionDataset(filePath = HAMYAR_QUESTION_DATASET_DEFAULT_PATH) {
  const content = await readFile(filePath, "utf8");
  if (content.includes("\uFFFD")) {
    const error = new Error("Dataset contains Unicode replacement characters; check UTF-8 encoding.");
    error.code = "HAMYAR_DATASET_ENCODING";
    throw error;
  }
  const rows = [];
  const lines = content.split(/\r?\n/u);
  for (const [index, line] of lines.entries()) {
    if (!line.trim() && index === lines.length - 1) continue;
    rows.push(parseHamyarQuestionDatasetLine(line, index + 1));
  }
  return rows;
}

export function validateHamyarQuestionRow(row) {
  const errors = [];
  if (!isPlainObject(row)) {
    return { ok: false, errors: [errorFor(row, "row must be an object")] };
  }

  for (const field of HAMYAR_QUESTION_DATASET_REQUIRED_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(row, field)) {
      errors.push(errorFor(row, "required field is missing", field));
    }
  }

  for (const field of ["id", "intent", "question"]) {
    if (!rowValue(row, field)) {
      errors.push(errorFor(row, "field must be non-empty", field));
    }
  }

  for (const field of HAMYAR_QUESTION_DATASET_REQUIRED_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(row, field) && typeof row[field] !== "string") {
      errors.push(errorFor(row, "field must be a string", field));
    }
  }

  if (row.priority && !VALID_PRIORITIES.has(row.priority)) {
    errors.push(errorFor(row, "priority must be one of P0, P1, P2", "priority"));
  }

  for (const field of YES_NO_FIELDS) {
    if (row[field] && !VALID_YES_NO.has(normalizeFlag(row[field]))) {
      errors.push(errorFor(row, "field must be yes or no", field));
    }
  }

  for (const { field, value } of textFields(row)) {
    if (hasHamyarMojibake(value)) {
      errors.push(errorFor(row, "field appears to contain mojibake or encoding corruption", field));
    }
  }

  try {
    parseHamyarRelationPath(row.relation_path);
  } catch (error) {
    errors.push(errorFor(row, error.message, "relation_path"));
  }

  try {
    const assertions = parseHamyarEvalAssertions(row.eval_assertions);
    for (const field of ["intent", "requested_field", "primary_entity"]) {
      if (Object.prototype.hasOwnProperty.call(assertions, field) && assertions[field] !== row[field]) {
        errors.push(errorFor(row, `eval_assertions ${field} does not match row ${field}`, "eval_assertions"));
      }
    }
    if (row.eval_assertions && !Object.keys(assertions).some((field) => ["intent", "requested_field", "primary_entity"].includes(field))) {
      errors.push(errorFor(row, "eval_assertions must expose intent, requested_field, or primary_entity", "eval_assertions"));
    }
  } catch (error) {
    errors.push(errorFor(row, error.message, "eval_assertions"));
  }

  if (normalizeFlag(row.future_write_action) === "yes" && !futureActionIsPreviewOnly(row)) {
    errors.push(errorFor(row, "future_write_action=yes rows must be preview-only and require confirmation", "future_write_action"));
  }

  return { ok: errors.length === 0, errors };
}

export function validateHamyarQuestionDataset(rows) {
  const errors = [];
  if (!Array.isArray(rows)) {
    return { ok: false, errors: [{ id: "", lineNumber: null, field: "", message: "dataset must be an array" }] };
  }

  const ids = new Map();
  for (const row of rows) {
    const validation = validateHamyarQuestionRow(row);
    errors.push(...validation.errors);
    const id = rowValue(row, "id");
    if (!id) continue;
    if (ids.has(id)) {
      errors.push(errorFor(row, `duplicate id also appears on line ${ids.get(id)}`, "id"));
    } else {
      ids.set(id, row.__lineNumber || null);
    }
  }

  errors.push(...scanHamyarQuestionDatasetSecrets(rows));
  return { ok: errors.length === 0, errors };
}

function countBy(rows, field) {
  const counts = {};
  for (const row of rows) {
    const key = rowValue(row, field) || "(empty)";
    counts[key] = (counts[key] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

export function summarizeHamyarQuestionDataset(rows = []) {
  const priorityCounts = { P0: 0, P1: 0, P2: 0 };
  for (const row of rows) {
    if (Object.prototype.hasOwnProperty.call(priorityCounts, row.priority)) {
      priorityCounts[row.priority] += 1;
    }
  }
  return {
    totalRows: rows.length,
    totalIntents: new Set(rows.map((row) => rowValue(row, "intent")).filter(Boolean)).size,
    totalCategories: new Set(rows.map((row) => rowValue(row, "category")).filter(Boolean)).size,
    priorityCounts,
    futureActionRows: rows.filter((row) => normalizeFlag(row.future_write_action) === "yes").length,
    requiresLiveVerificationRows: rows.filter((row) => normalizeFlag(row.requires_live_verification) === "yes").length,
    usesCompanyBrainRows: rows.filter((row) => normalizeFlag(row.uses_company_brain) === "yes").length,
    intents: countBy(rows, "intent"),
    categories: countBy(rows, "category"),
    requestedFields: countBy(rows, "requested_field"),
    relationPaths: countBy(rows, "relation_path"),
  };
}
