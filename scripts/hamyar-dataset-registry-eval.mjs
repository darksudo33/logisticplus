import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  HAMYAR_QUESTION_DATASET_DEFAULT_PATH,
  loadHamyarQuestionDataset,
  parseHamyarRelationPath,
  summarizeHamyarQuestionDataset,
  validateHamyarQuestionDataset,
} from "../src/server/ai/hamyar-question-dataset.js";
import { getHamyarIntent, listHamyarIntents } from "../src/server/ai/hamyar-capability-registry.js";
import { normalizeHamyarText, resolveHamyarQuestionPlan } from "../src/server/ai/hamyar-relation-resolver.js";
import {
  detectRelationIntent,
  planBusinessSearch,
  planCompanyBrainLookup,
} from "../src/server/ai/ai-context-planner.js";

const JSON_REPORT_PATH = path.resolve("reports/hamyar-dataset-coverage-report.json");
const MARKDOWN_REPORT_PATH = path.resolve("reports/hamyar-dataset-coverage-report.md");

const DATASET_INTENT_COMPATIBILITY = Object.freeze({
  "assistant.identity": ["identity.capability"],
  "shipment.lookup": ["shipment.lookup"],
  "shipment.status.lookup": ["shipment.status.lookup"],
  "shipment.customer.lookup": ["shipment.customer.lookup"],
  "shipment.customer.contact.lookup": ["shipment.customer.phone.lookup", "customer.contact.lookup"],
  "shipment.agent.contact.lookup": ["shipment.agent.phone.lookup"],
  "shipment.vessel_captain.lookup": ["shipment.vessel.lookup", "shipment.captain.phone.lookup"],
  "commercial_card.lookup": ["shipment.commercial_card.lookup"],
  "commercial_card.agent.contact.lookup": ["shipment.commercial_card.agent.lookup"],
  "customer.profile.lookup": ["customer.lookup"],
  "customer.contact.lookup": ["customer.contact.lookup"],
  "customer.shipments.lookup": ["customer.shipments.lookup"],
  "task.lookup": ["task.today.lookup", "task.assignee.lookup"],
  "workflow.lookup": ["workflow.latest_step.lookup"],
  "document.lookup": ["document.shipment.lookup", "document.status.lookup"],
  "cheque.lookup": ["cheque.customer.lookup", "cheque.due_date.lookup"],
  "company.daily_summary.lookup": ["company.daily_summary.lookup"],
  "company.operational_status.lookup": ["company.daily_summary.lookup", "company.latest_shipment.lookup"],
  "data_quality.missing_fields.lookup": ["missing_data.lookup", "document.status.lookup"],
  "conversation.followup.resolve": [
    "ambiguity.selection.reply",
    "customer.lookup",
    "customer.contact.lookup",
    "customer.shipments.lookup",
    "customer.tasks.lookup",
    "cheque.customer.lookup",
    "shipment.activity.lookup",
    "shipment.commercial_card.lookup",
    "shipment.customer.phone.lookup",
    "shipment.customer.lookup",
    "shipment.status.lookup",
    "shipment.tasks.lookup",
    "shipment.lookup",
  ],
  "analytics.aggregate.lookup": [],
  "risk.alerts.lookup": [],
  "action.proposed.requires_confirmation": [],
});

const REQUESTED_FIELD_COMPATIBILITY = Object.freeze({
  action_plan: [],
  card_status: ["commercial_card"],
  card_summary: ["commercial_card"],
  cheque_summary: ["cheques", "due_date"],
  contextual_field: ["customer", "customer_phone", "phone", "status", "commercial_card", "shipments", "tasks", "cheques", "documents", "summary", "selection"],
  counts: ["daily_summary", "latest_shipment", "missing_data", "due_today"],
  daily_summary: ["daily_summary"],
  document_or_file: ["documents", "document_status"],
  document_status: ["documents", "document_status"],
  identity: ["capability"],
  missing_field_list: ["missing_data", "document_status"],
  phone: ["phone", "customer_phone", "agent_phone", "captain_phone", "commercial_card_agent_phone"],
  profile: ["summary"],
  risk_summary: ["missing_data", "cheques", "due_date", "due_today", "latest_step"],
  shipment_list: ["shipments"],
  shipments: ["shipments"],
  status: ["status", "latest_step"],
  status_summary: ["daily_summary", "latest_shipment", "missing_data"],
  summary: ["summary"],
  task_list: ["due_today", "assignee", "tasks"],
  vessel_or_captain_contact: ["vessel_name", "captain_phone"],
  workflow_status: ["latest_step"],
});

const TOKEN_SYNONYMS = Object.freeze({
  activeentity: ["shipment", "customer", "commercial_card", "document", "task", "cheque", "selection"],
  agent: ["agent", "contact", "malvani", "commercial_card"],
  aggregate_tools: ["activity", "daily_summary", "latest", "missing_data"],
  alerts: ["missing_data", "cheques", "due_date", "latest_step"],
  card: ["commercial_card"],
  captain: ["captain", "captain_phone"],
  commercial: ["commercial_card"],
  commercial_card: ["commercial_card"],
  data_quality: ["missing_data", "document_status"],
  document_or_file: ["documents", "document_status"],
  documents: ["documents"],
  files: ["documents"],
  focusedentity: ["shipment", "customer", "commercial_card", "document", "task", "cheque", "selection"],
  history: ["latest_step", "workflow"],
  operational_summary: ["activity", "daily_summary"],
  progress: ["latest_step", "workflow"],
  proposed_action: ["selection"],
  risk_alerts: ["missing_data", "cheques", "due_date", "latest_step"],
  status_summary: ["daily_summary", "status"],
  vessel: ["vessel", "vessel_name"],
});

const FOLLOW_UP_FORBIDDEN_TERMS = new Set(
  [
    "این",
    "اون",
    "آن",
    "قبلی",
    "همین",
    "بده",
    "تماسش",
    "تلفنش",
    "موبایلش",
    "شماره‌ش",
    "شماره اش",
    "همون",
    "اولی",
    "رو",
    "را",
    "this",
    "that",
    "it",
    "previous",
    "give",
    "send",
    "please",
  ].map(normalizeToken)
);

function normalizeToken(value = "") {
  return normalizeHamyarText(String(value || ""))
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function countBy(values) {
  const counts = {};
  for (const value of values.filter(Boolean)) {
    counts[value] = (counts[value] || 0) + 1;
  }
  return Object.entries(counts)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([value, count]) => ({ value, count }));
}

function relationTokens(relationPath = "") {
  const segments = Array.isArray(relationPath) ? relationPath : parseHamyarRelationPath(relationPath);
  return segments.flatMap((segment) =>
    String(segment)
      .split("/")
      .map(normalizeToken)
      .filter(Boolean)
  );
}

function expandToken(token) {
  const normalized = normalizeToken(token);
  const underscoreKey = normalized.replace(/\s+/g, "_");
  return new Set([normalized, ...((TOKEN_SYNONYMS[normalized] || TOKEN_SYNONYMS[underscoreKey] || []).map(normalizeToken))]);
}

function tokensOverlap(expectedToken, actualSet) {
  for (const token of expandToken(expectedToken)) {
    if (actualSet.has(token)) return true;
  }
  return false;
}

function datasetEntityAlternatives(primaryEntity = "") {
  const normalized = normalizeToken(primaryEntity);
  const alternatives = normalized
    .split("/")
    .map((token) => token.trim())
    .filter(Boolean);
  if (normalized.includes("activeentity") || normalized.includes("focusedentity")) {
    alternatives.push("shipment", "customer", "commercial_card", "document", "task", "cheque", "selection");
  }
  if (normalized === "assistant") alternatives.push("organization");
  return [...new Set(alternatives)];
}

function plannedPrimaryEntity(plan = {}) {
  return (
    plan.primaryEntity?.type ||
    getHamyarIntent(plan.intent)?.primaryEntity ||
    ""
  );
}

function plannedRequestedFields(plan = {}, businessPlan = {}) {
  return [
    plan.requestedField,
    ...(Array.isArray(plan.requestedFields) ? plan.requestedFields : []),
    businessPlan.requestedField,
    ...(Array.isArray(businessPlan.requestedFields) ? businessPlan.requestedFields : []),
  ]
    .map(normalizeToken)
    .filter(Boolean);
}

function isIntentCompatible(row, plan) {
  const compatible = DATASET_INTENT_COMPATIBILITY[row.intent] || [row.intent];
  if (!compatible.length) return false;
  return compatible.includes(plan.intent);
}

function hasRegistrySupport(row) {
  return Boolean(DATASET_INTENT_COMPATIBILITY[row.intent]?.length);
}

function isEntityCompatible(row, plan = {}, businessPlan = {}) {
  const expected = datasetEntityAlternatives(row.primary_entity);
  if (!expected.length) return true;
  const actual = new Set([
    normalizeToken(plannedPrimaryEntity(plan)),
    ...(Array.isArray(plan.relationPath) ? plan.relationPath.map(normalizeToken) : []),
    ...(Array.isArray(plan.preferredEntityTypes) ? plan.preferredEntityTypes.map(normalizeToken) : []),
    ...(Array.isArray(businessPlan.candidateTypes) ? businessPlan.candidateTypes.map(normalizeToken) : []),
  ].filter(Boolean));
  return expected.some((token) => tokensOverlap(token, actual));
}

function isRelationCompatible(row, plan = {}) {
  const expected = relationTokens(row.relation_path);
  const actual = new Set(relationTokens(plan.relationPath || []));
  if (!expected.length) return !actual.size || plan.intent === "identity.capability";
  const generic = new Set(["entity", "organization", "shipment", "customer", "task", "user"]);
  const significantExpected = expected.filter((token) => !generic.has(token));
  if (significantExpected.length) {
    return significantExpected.some((token) => tokensOverlap(token, actual));
  }
  return expected.some((token) => tokensOverlap(token, actual));
}

function isRequestedFieldCompatible(row, plan = {}, businessPlan = {}) {
  const expected = normalizeToken(row.requested_field);
  const actual = new Set(plannedRequestedFields(plan, businessPlan));
  if (!expected) return true;
  if (actual.has(expected)) return true;
  const compatibilityKey = expected.replace(/\s+/g, "_");
  for (const compatible of REQUESTED_FIELD_COMPATIBILITY[expected] || REQUESTED_FIELD_COMPATIBILITY[compatibilityKey] || []) {
    if (actual.has(normalizeToken(compatible))) return true;
  }
  return false;
}

function hasExecutableAction(value, pathParts = []) {
  if (!value || typeof value !== "object") return false;
  for (const [key, child] of Object.entries(value)) {
    const keyPath = [...pathParts, key].join(".");
    if (/execute|executable|writeAction|mutation/i.test(keyPath) && child === true) return true;
    if (typeof child === "string" && /execute_now|auto_execute|write_now/i.test(child)) return true;
    if (child && typeof child === "object" && hasExecutableAction(child, [...pathParts, key])) return true;
  }
  return false;
}

function followUpCommandTerms(businessPlan = {}) {
  return (businessPlan.queryTerms || [])
    .map(normalizeToken)
    .filter((term) => FOLLOW_UP_FORBIDDEN_TERMS.has(term));
}

function documentLookupCovered(row, plan = {}, businessPlan = {}) {
  if (row.category !== "document_file_lookup") return true;
  const candidateTypes = new Set((businessPlan.candidateTypes || []).map(normalizeToken));
  const requestedFields = new Set(plannedRequestedFields(plan, businessPlan));
  return (
    String(plan.intent || "").startsWith("document.") ||
    candidateTypes.has("document") ||
    requestedFields.has("documents") ||
    requestedFields.has("document status")
  );
}

function rowPlanningContext(row = {}) {
  const question = normalizeToken(row.question);
  const shipmentEntity = {
    type: "shipment",
    id: "shipment-fixture",
    code: "LP-178072282908",
    label: "محموله LP-178072282908",
  };
  const customerEntity = {
    type: "customer",
    id: "customer-fixture",
    code: "CUS-00003",
    label: "مشتری CUS-00003",
  };

  if (row.category === "followup_context") {
    if (question.includes("اسناد") || question.includes("سند") || question.includes("مدارک")) {
      return {};
    }
    if (question.includes("گزینه") || question.includes("مورد") || question.includes("اولی") || question.includes("دومی") || question === "1" || question.includes("show me")) {
      return {};
    }
    if (
      question.includes("شماره") ||
      question.includes("تماس") ||
      question.includes("تلفن") ||
      question.includes("موبایل") ||
      question.includes("phone") ||
      question.includes("محموله") ||
      question.includes("بارها") ||
      question.includes("چک")
    ) {
      return { activeEntity: customerEntity };
    }
    if (
      question.includes("وضعیت") ||
      question.includes("مشتریش") ||
      question.includes("کارتش") ||
      question.includes("وظایف") ||
      question.includes("وظیفه") ||
      question.includes("تسک") ||
      question.includes("کارها") ||
      question.includes("آخرین فعالیت") ||
      question.includes("فعالیتش") ||
      question.includes("تاریخچه")
    ) {
      return { activeEntity: shipmentEntity };
    }
    return {};
  }

  if (
    row.intent === "shipment.customer.contact.lookup" &&
    (question.includes("این محموله") || question.includes("همین بار"))
  ) {
    return { activeEntity: shipmentEntity };
  }

  if (
    (row.intent === "customer.contact.lookup" || row.intent === "customer.shipments.lookup") &&
    (question.includes("این مشتری") || question.includes("همین مشتری"))
  ) {
    return { activeEntity: customerEntity };
  }

  return {};
}

function addIssue(target, type, message) {
  target.push({ type, message });
}

function shouldHardFailP0WrongCategory(row, plan, entityCompatible, fieldCompatible) {
  if (row.priority !== "P0" || !plan.intent) return false;
  const comparableTopLevels = new Set(["shipment", "customer", "document", "cheque", "task", "workflow"]);
  const expectedTopLevel = String(row.intent || "").split(".")[0];
  const plannedTopLevel = String(plan.intent || "").split(".")[0];
  return (
    comparableTopLevels.has(expectedTopLevel) &&
    comparableTopLevels.has(plannedTopLevel) &&
    expectedTopLevel !== plannedTopLevel &&
    !entityCompatible &&
    !fieldCompatible
  );
}

function evaluateDatasetRow(row) {
  const hardFailures = [];
  const softGaps = [];
  let plan;
  let businessPlan;
  let companyPlan;
  let relationIntent;

  try {
    const planningContext = rowPlanningContext(row);
    plan = resolveHamyarQuestionPlan(row.question, planningContext, planningContext.activeEntity);
    businessPlan = planBusinessSearch(row.question, planningContext);
    companyPlan = planCompanyBrainLookup(row.question, planningContext);
    relationIntent = detectRelationIntent(row.question, planningContext);
  } catch (error) {
    addIssue(hardFailures, "runtime_exception", error.stack || error.message);
    return { row, status: "hard_fail", plan: null, businessPlan: null, companyPlan: null, relationIntent: null, hardFailures, softGaps };
  }

  const intentCompatible = isIntentCompatible(row, plan);
  const entityCompatible = isEntityCompatible(row, plan, businessPlan);
  const relationCompatible = isRelationCompatible(row, plan);
  const fieldCompatible = isRequestedFieldCompatible(row, plan, businessPlan);

  if (hasRegistrySupport(row)) {
    if (!intentCompatible) {
      const message = `expected compatible registry intent ${DATASET_INTENT_COMPATIBILITY[row.intent].join(", ")}, got ${plan.intent || "(none)"}`;
      if (shouldHardFailP0WrongCategory(row, plan, entityCompatible, fieldCompatible)) {
        addIssue(hardFailures, "p0_wrong_category", message);
      } else {
        addIssue(softGaps, "intent_gap", message);
      }
    }
  } else {
    addIssue(softGaps, "unsupported_dataset_intent", `dataset intent ${row.intent} is not implemented in the current registry`);
  }

  if (!entityCompatible) {
    addIssue(softGaps, "entity_gap", `expected primary entity ${row.primary_entity}, got ${plannedPrimaryEntity(plan) || "(none)"}`);
  }

  if (!relationCompatible) {
    addIssue(softGaps, "relation_gap", `expected relation path ${row.relation_path || "(none)"}, got ${(plan.relationPath || []).join(" -> ") || "(none)"}`);
  }

  if (!fieldCompatible) {
    addIssue(softGaps, "requested_field_gap", `expected requested field ${row.requested_field}, got ${plan.requestedField || businessPlan.requestedField || "(none)"}`);
  }

  if (row.future_write_action === "yes") {
    if (hasExecutableAction(plan) || hasExecutableAction(businessPlan) || hasExecutableAction(companyPlan)) {
      addIssue(hardFailures, "future_action_executable", "future write action row produced executable planner metadata");
    } else {
      addIssue(softGaps, "future_action_preview_registry_missing", "future action is safely non-executable, but no preview-only Action Registry planner exists yet");
    }
  }

  if (row.requires_live_verification === "yes" && !plan.needsLiveVerification) {
    addIssue(softGaps, "live_verification_metadata_gap", "dataset requires live verification but planner metadata does not preserve it");
  }

  const companyBrainCompatible =
    plan.needsCompanyBrain ||
    companyPlan.checkCompanyBrain ||
    companyPlan.searchCompanyBrain ||
    businessPlan.searchBusinessContext;
  if (row.uses_company_brain === "yes" && !companyBrainCompatible) {
    addIssue(softGaps, "company_brain_metadata_gap", "dataset expects Company Brain candidate/search usage but planner metadata does not expose it");
  }

  const forbiddenFollowUpTerms = followUpCommandTerms(businessPlan);
  if (row.category === "followup_context" && forbiddenFollowUpTerms.length) {
    addIssue(
      hardFailures,
      "followup_command_term_search",
      `follow-up/context row used command or pronoun-only query terms: ${forbiddenFollowUpTerms.join(", ")}`
    );
  }

  if (!documentLookupCovered(row, plan, businessPlan)) {
    addIssue(softGaps, "document_lookup_gap", "document/file/image row did not map to a document/file lookup capability");
  }
  if (row.intent === "document.lookup") {
    addIssue(softGaps, "document_lookup_deferred", "document/file/image lookup is intentionally deferred for this PR");
  }

  const status = hardFailures.length ? "hard_fail" : softGaps.length ? "soft_gap" : "pass";
  return { row, status, plan, businessPlan, companyPlan, relationIntent, hardFailures, softGaps };
}

function aggregateByIntent(results) {
  const byIntent = {};
  for (const result of results) {
    const intent = result.row.intent;
    byIntent[intent] ||= { total: 0, pass: 0, soft_gap: 0, hard_fail: 0 };
    byIntent[intent].total += 1;
    byIntent[intent][result.status] += 1;
  }
  return Object.fromEntries(Object.entries(byIntent).sort(([left], [right]) => left.localeCompare(right)));
}

function topSoftGapRows(results, priority = null) {
  return results
    .filter((result) => result.status !== "pass" && (!priority || result.row.priority === priority))
    .map((result) => ({
      id: result.row.id,
      priority: result.row.priority,
      intent: result.row.intent,
      category: result.row.category,
      question: result.row.question,
      plannedIntent: result.plan?.intent || "",
      plannedRequestedField: result.plan?.requestedField || result.businessPlan?.requestedField || "",
      softGaps: result.softGaps,
      hardFailures: result.hardFailures,
    }));
}

function recommendationsFrom(results) {
  const softGapIntents = countBy(
    results
      .filter((result) => result.status !== "pass")
      .map((result) => result.row.intent)
  );
  const recommendations = [];
  if (softGapIntents.some(({ value }) => value === "document.lookup")) {
    recommendations.push("Expand document/file/image lookup registry coverage, including shipment/customer document lists and document visibility/status fields.");
  }
  if (softGapIntents.some(({ value }) => value === "shipment.agent.contact.lookup")) {
    recommendations.push("Broaden shipment agent contact aliases and relation resolution for Malvani/agent phone workflows.");
  }
  if (softGapIntents.some(({ value }) => value === "shipment.customer.contact.lookup" || value === "customer.contact.lookup")) {
    recommendations.push("Tighten contact-field routing so phone/contact questions preserve live-verification metadata across shipment and customer contexts.");
  }
  if (softGapIntents.some(({ value }) => value === "shipment.vessel_captain.lookup")) {
    recommendations.push("Add combined vessel/captain wording coverage so captain contact and vessel-name questions route to the correct live tools.");
  }
  if (softGapIntents.some(({ value }) => value === "commercial_card.lookup")) {
    recommendations.push("Add commercial-card summary/status coverage for card-primary and shipment/customer-to-card wording.");
  }
  if (softGapIntents.some(({ value }) => value === "action.proposed.requires_confirmation")) {
    recommendations.push("Add a preview-only Hamyar Action Registry planner that never executes writes without explicit confirmation.");
  }
  if (softGapIntents.some(({ value }) => value === "analytics.aggregate.lookup")) {
    recommendations.push("Add aggregate/count registry capabilities backed by existing live operations summary tools.");
  }
  if (softGapIntents.some(({ value }) => value === "risk.alerts.lookup")) {
    recommendations.push("Add risk alert registry intents for blockers, overdue tasks, due cheques, and missing daily statuses.");
  }
  if (softGapIntents.some(({ value }) => value === "commercial_card.agent.contact.lookup")) {
    recommendations.push("Add commercial-card-primary relation resolver coverage for agent/responsible contact lookups.");
  }
  if (softGapIntents.some(({ value }) => value === "conversation.followup.resolve")) {
    recommendations.push("Promote active-entity follow-up resolution into a first-class registry capability with eval rows.");
  }
  if (softGapIntents.some(({ value }) => value === "customer.shipments.lookup")) {
    recommendations.push("Improve customer-to-shipments aliases and active shipment list routing.");
  }
  if (softGapIntents.some(({ value }) => value === "task.lookup" || value === "workflow.lookup" || value === "cheque.lookup")) {
    recommendations.push("Add task, workflow, and cheque-specific relation aliases for current operational follow-up questions.");
  }
  recommendations.push("For each implemented gap, add/adjust registry examples, regenerate registry eval fixtures, and rerun this dataset eval.");
  return [...new Set(recommendations)];
}

function markdownTable(rows, columns) {
  if (!rows.length) return "_None._";
  const header = `| ${columns.map((column) => column.label).join(" | ")} |`;
  const divider = `| ${columns.map(() => "---").join(" | ")} |`;
  const body = rows.map((row) =>
    `| ${columns.map((column) => String(column.value(row) ?? "").replace(/\|/g, "\\|")).join(" | ")} |`
  );
  return [header, divider, ...body].join("\n");
}

function renderMarkdownReport(report) {
  const byIntentRows = Object.entries(report.coverageByIntent).map(([intent, counts]) => ({ intent, ...counts }));
  const topP0 = report.p0Gaps.slice(0, 40);
  return `# Hamyar Dataset Coverage Report

Generated by \`npm run hamyar:dataset:eval\`.

## Summary

- Total rows: ${report.totalRows}
- Pass: ${report.passCount}
- Soft gaps: ${report.softGapCount}
- Hard failures: ${report.hardFailureCount}
- P0 gaps: ${report.p0Gaps.length}
- Future action rows: ${report.datasetSummary.futureActionRows} (preview-only; no executable writes)

## Coverage by Intent

${markdownTable(byIntentRows, [
  { label: "Intent", value: (row) => row.intent },
  { label: "Total", value: (row) => row.total },
  { label: "Pass", value: (row) => row.pass },
  { label: "Soft gaps", value: (row) => row.soft_gap },
  { label: "Hard fails", value: (row) => row.hard_fail },
])}

## Top Missing Intents

${markdownTable(report.topMissingIntents, [
  { label: "Intent", value: (row) => row.value },
  { label: "Rows", value: (row) => row.count },
])}

## Top Missing Relation Paths

${markdownTable(report.topMissingRelationPaths, [
  { label: "Relation path", value: (row) => row.value },
  { label: "Rows", value: (row) => row.count },
])}

## Top Missing Requested Fields

${markdownTable(report.topMissingRequestedFields, [
  { label: "Requested field", value: (row) => row.value },
  { label: "Rows", value: (row) => row.count },
])}

## P0 Gaps

${markdownTable(topP0, [
  { label: "ID", value: (row) => row.id },
  { label: "Intent", value: (row) => row.intent },
  { label: "Planned intent", value: (row) => row.plannedIntent },
  { label: "Gap types", value: (row) => [...row.hardFailures, ...row.softGaps].map((gap) => gap.type).join(", ") },
])}

## Recommended Next PRs

${report.recommendedNextPrs.map((item) => `- ${item}`).join("\n")}
`;
}

let rows;
try {
  rows = await loadHamyarQuestionDataset(HAMYAR_QUESTION_DATASET_DEFAULT_PATH);
} catch (error) {
  console.error(`Hamyar dataset registry eval failed: ${error.message}`);
  process.exit(1);
}

const validation = validateHamyarQuestionDataset(rows);
if (!validation.ok) {
  console.error(`Hamyar dataset registry eval stopped because validation failed with ${validation.errors.length} error(s).`);
  for (const error of validation.errors.slice(0, 20)) {
    const location = error.lineNumber ? `line ${error.lineNumber}` : "dataset";
    console.error(`- ${location} ${error.id || ""} ${error.field || ""}: ${error.message}`);
  }
  process.exit(1);
}

const registryIntentIds = new Set(listHamyarIntents().map((intent) => intent.id));
const mappingReferencesMissingRegistry = Object.entries(DATASET_INTENT_COMPATIBILITY)
  .flatMap(([datasetIntent, registryIntents]) =>
    registryIntents
      .filter((intent) => !registryIntentIds.has(intent))
      .map((intent) => `${datasetIntent} -> ${intent}`)
  );
if (mappingReferencesMissingRegistry.length) {
  console.error("Hamyar dataset registry eval mapping references missing registry intents:");
  for (const item of mappingReferencesMissingRegistry) console.error(`- ${item}`);
  process.exit(1);
}

const results = rows.map(evaluateDatasetRow);
const passCount = results.filter((result) => result.status === "pass").length;
const softGapCount = results.filter((result) => result.status === "soft_gap").length;
const hardFailureCount = results.filter((result) => result.status === "hard_fail").length;
const gapResults = results.filter((result) => result.status !== "pass");
const report = {
  generatedAt: new Date().toISOString(),
  datasetPath: HAMYAR_QUESTION_DATASET_DEFAULT_PATH,
  totalRows: rows.length,
  passCount,
  softGapCount,
  hardFailureCount,
  datasetSummary: summarizeHamyarQuestionDataset(rows),
  coverageByIntent: aggregateByIntent(results),
  topMissingIntents: countBy(gapResults.map((result) => result.row.intent)).slice(0, 20),
  topMissingRelationPaths: countBy(gapResults.map((result) => result.row.relation_path || "(none)")).slice(0, 20),
  topMissingRequestedFields: countBy(gapResults.map((result) => result.row.requested_field)).slice(0, 20),
  p0Gaps: topSoftGapRows(results, "P0"),
  p1Gaps: topSoftGapRows(results, "P1"),
  hardFailures: results
    .filter((result) => result.hardFailures.length)
    .map((result) => ({
      id: result.row.id,
      priority: result.row.priority,
      intent: result.row.intent,
      question: result.row.question,
      plannedIntent: result.plan?.intent || "",
      hardFailures: result.hardFailures,
    })),
  recommendedNextPrs: recommendationsFrom(results),
};

await mkdir(path.dirname(JSON_REPORT_PATH), { recursive: true });
await writeFile(JSON_REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await writeFile(MARKDOWN_REPORT_PATH, renderMarkdownReport(report), "utf8");

console.log("Hamyar dataset registry coverage");
console.log(`- total rows: ${report.totalRows}`);
console.log(`- pass: ${report.passCount}`);
console.log(`- soft gaps: ${report.softGapCount}`);
console.log(`- hard failures: ${report.hardFailureCount}`);
console.log(`- reports: ${JSON_REPORT_PATH}, ${MARKDOWN_REPORT_PATH}`);

if (hardFailureCount) {
  console.error("Hamyar dataset registry eval failed because hard failures were found.");
  for (const failure of report.hardFailures.slice(0, 20)) {
    console.error(`- ${failure.id} ${failure.intent}: ${failure.hardFailures.map((issue) => issue.type).join(", ")}`);
  }
  process.exit(1);
}
