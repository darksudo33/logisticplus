import assert from "node:assert/strict";
import {
  BUSINESS_REQUESTED_FIELDS,
  RELATION_INTENTS,
  classifyResolutionState,
  detectRelationIntent,
  isIdentityQuestion,
  planBusinessSearch,
  verifyRelationAnswerability,
} from "../src/server/ai/ai-context-planner.js";
import {
  extractAmbiguitySelection,
  followUpBusinessPlanFromRecentMessages,
  renderBusinessAmbiguityMessage,
} from "../src/server/ai/ai-orchestrator.js";
import { llmProviderStatus } from "../src/server/ai/llm-provider.js";

const intentCases = [
  ["بار X اسم مشتریش چیه؟", RELATION_INTENTS.SHIPMENT_CUSTOMER_LOOKUP, "X"],
  ["مشتری بار X چیه؟", RELATION_INTENTS.SHIPMENT_CUSTOMER_LOOKUP, "X"],
  ["بار X مال کیه؟", RELATION_INTENTS.SHIPMENT_CUSTOMER_LOOKUP, "X"],
  ["کارت بازرگانی مشتری بار X چیه؟", RELATION_INTENTS.SHIPMENT_COMMERCIAL_CARD_LOOKUP, "X"],
  ["مشتری X چه کارت‌هایی داره؟", RELATION_INTENTS.CUSTOMER_COMMERCIAL_CARD_LOOKUP, "X"],
  ["بارهای مشتری X چیه؟", RELATION_INTENTS.CUSTOMER_SHIPMENTS_LOOKUP, "X"],
  ["وضعیت بار X چیه؟", RELATION_INTENTS.SHIPMENT_SUMMARY_LOOKUP, "X"],
];

for (const [message, expectedIntent, expectedRef] of intentCases) {
  const result = detectRelationIntent(message);
  assert.equal(result.intent, expectedIntent, message);
  const ref = result.entities.shipmentRef || result.entities.customerRef || result.entities.commercialCardRef;
  assert.equal(ref, expectedRef.toLowerCase(), message);
  assert.ok(result.confidence >= 0.9, message);
}

const businessCases = [
  {
    message: "محموله آنتویس چاپ آقای سنجری شماره خانمانش چنده",
    terms: ["آنتویس", "چاپ", "سنجری"],
    types: ["shipment", "customer"],
    requestedField: BUSINESS_REQUESTED_FIELDS.CUSTOMER_PHONE,
    requestedFields: [BUSINESS_REQUESTED_FIELDS.PHONE],
  },
  {
    message: "محموله آنتویس چاپ آقای سنجری",
    terms: ["آنتویس", "چاپ", "سنجری"],
    types: ["shipment", "customer"],
    requestedField: BUSINESS_REQUESTED_FIELDS.SUMMARY,
    requestedFields: [BUSINESS_REQUESTED_FIELDS.SUMMARY],
  },
  {
    message: "برای آقای سنجری در چه حاله",
    terms: ["سنجری"],
    types: ["shipment", "customer"],
    requestedField: BUSINESS_REQUESTED_FIELDS.STATUS,
    requestedFields: [BUSINESS_REQUESTED_FIELDS.STATUS],
  },
  {
    message: "پرونده سنجری چی شد",
    terms: ["سنجری"],
    types: ["shipment"],
    requestedField: BUSINESS_REQUESTED_FIELDS.STATUS,
    requestedFields: [BUSINESS_REQUESTED_FIELDS.STATUS],
  },
  {
    message: "اون بار چاپ آنتویس",
    terms: ["چاپ", "آنتویس"],
    types: ["shipment"],
    requestedField: BUSINESS_REQUESTED_FIELDS.SUMMARY,
    requestedFields: [BUSINESS_REQUESTED_FIELDS.SUMMARY],
  },
  {
    message: "بار آقای سنجری",
    terms: ["سنجری"],
    types: ["shipment", "customer"],
    requestedField: BUSINESS_REQUESTED_FIELDS.SUMMARY,
    requestedFields: [BUSINESS_REQUESTED_FIELDS.SUMMARY],
  },
  {
    message: "کارت آقای سنجری",
    terms: ["سنجری"],
    types: ["commercial_card", "customer"],
    requestedField: BUSINESS_REQUESTED_FIELDS.COMMERCIAL_CARD,
    requestedFields: [BUSINESS_REQUESTED_FIELDS.COMMERCIAL_CARD],
  },
  {
    message: "شماره مشتری سنجری چنده",
    terms: ["سنجری"],
    types: ["customer"],
    requestedField: BUSINESS_REQUESTED_FIELDS.CUSTOMER_PHONE,
    requestedFields: [BUSINESS_REQUESTED_FIELDS.PHONE],
  },
  {
    message: "بار X اسم مشتریش چیه؟",
    terms: ["x"],
    types: ["shipment", "customer"],
    requestedField: BUSINESS_REQUESTED_FIELDS.CUSTOMER,
    requestedFields: [BUSINESS_REQUESTED_FIELDS.CUSTOMER],
  },
  {
    message: "مشتری بار X چیه؟",
    terms: ["x"],
    types: ["shipment", "customer"],
    requestedField: BUSINESS_REQUESTED_FIELDS.CUSTOMER,
    requestedFields: [BUSINESS_REQUESTED_FIELDS.CUSTOMER],
  },
  {
    message: "کارت بازرگانی مشتری بار X چیه؟",
    terms: ["x"],
    types: ["commercial_card", "customer", "shipment"],
    requestedField: BUSINESS_REQUESTED_FIELDS.COMMERCIAL_CARD,
    requestedFields: [BUSINESS_REQUESTED_FIELDS.COMMERCIAL_CARD],
  },
  {
    message: "شماره آقای سنجری",
    terms: ["سنجری"],
    forbiddenTerms: ["شماره"],
    types: ["customer", "shipment", "commercial_card"],
    requestedField: BUSINESS_REQUESTED_FIELDS.CUSTOMER_PHONE,
    requestedFields: [BUSINESS_REQUESTED_FIELDS.PHONE],
  },
  {
    message: "شماره مشتری 214",
    terms: ["214"],
    forbiddenTerms: ["شماره", "مشتری"],
    types: ["customer"],
    requestedField: BUSINESS_REQUESTED_FIELDS.CUSTOMER_PHONE,
    requestedFields: [BUSINESS_REQUESTED_FIELDS.PHONE],
  },
  {
    message: "مشتری 214",
    terms: ["214"],
    types: ["customer"],
    requestedField: BUSINESS_REQUESTED_FIELDS.SUMMARY,
    requestedFields: [BUSINESS_REQUESTED_FIELDS.SUMMARY],
  },
  {
    message: "وضعیت محموله 14051102036 چیه؟",
    terms: ["14051102036"],
    forbiddenTerms: ["وضعیت", "محموله"],
    types: ["shipment"],
    requestedField: BUSINESS_REQUESTED_FIELDS.STATUS,
    requestedFields: [BUSINESS_REQUESTED_FIELDS.STATUS],
  },
  {
    message: "سند محموله 14051102036",
    terms: ["14051102036"],
    forbiddenTerms: ["سند", "محموله"],
    types: ["document", "shipment", "customer"],
    requestedField: BUSINESS_REQUESTED_FIELDS.SUMMARY,
    requestedFields: [BUSINESS_REQUESTED_FIELDS.SUMMARY],
  },
  {
    message: "مانع محموله 14051102036",
    terms: ["14051102036"],
    forbiddenTerms: ["مانع", "محموله"],
    types: ["workflow_item", "shipment", "customer"],
    requestedField: BUSINESS_REQUESTED_FIELDS.SUMMARY,
    requestedFields: [BUSINESS_REQUESTED_FIELDS.SUMMARY],
  },
  {
    message: "چک مشتری 214",
    terms: ["214"],
    forbiddenTerms: ["چک", "مشتری"],
    types: ["cheque", "customer", "shipment"],
    requestedField: BUSINESS_REQUESTED_FIELDS.SUMMARY,
    requestedFields: [BUSINESS_REQUESTED_FIELDS.SUMMARY],
  },
];

for (const testCase of businessCases) {
  const plan = planBusinessSearch(testCase.message);
  assert.equal(plan.searchBusinessContext, true, `${testCase.message} should trigger business search`);
  for (const term of testCase.terms) {
    assert.ok(plan.queryTerms.includes(term.toLowerCase()), `${testCase.message} should include term ${term}`);
  }
  for (const term of testCase.forbiddenTerms || []) {
    assert.ok(!plan.queryTerms.includes(term.toLowerCase()), `${testCase.message} should not include generic term ${term}`);
  }
  for (const type of testCase.types) {
    assert.ok(plan.candidateTypes.includes(type), `${testCase.message} should include candidate type ${type}`);
  }
  assert.equal(plan.requestedField, testCase.requestedField, `${testCase.message} requested field`);
  assert.deepEqual(plan.requestedFields, testCase.requestedFields, `${testCase.message} requested fields`);
  assert.ok(plan.confidence >= 0.7, `${testCase.message} should be confident enough to search`);
}

const identityPlan = planBusinessSearch("تو کی هستی");
assert.equal(isIdentityQuestion("تو کی هستی"), true, "identity phrase should be detected");
assert.equal(identityPlan.intent, "identity", "identity query should use identity intent");
assert.equal(identityPlan.searchBusinessContext, false, "identity query must not trigger business search");

assert.equal(
  classifyResolutionState([
    { id: "customer-a", customerCode: "X" },
    { id: "customer-b", customerCode: "X" },
  ]),
  "ambiguous",
  "multiple customer matches should trigger clarification"
);

assert.equal(
  classifyResolutionState([]),
  "not_found",
  "unknown shipment/customer references should produce a not-found state"
);

assert.deepEqual(
  verifyRelationAnswerability(RELATION_INTENTS.SHIPMENT_CUSTOMER_LOOKUP, {
    shipment: { customer: { name: "Acme" } },
  }),
  { answerable: true },
  "shipment customer lookup must verify against retrieved shipment detail context"
);

assert.equal(extractAmbiguitySelection("به 214"), "214", "short ambiguity follow-up should extract selected code");
assert.equal(extractAmbiguitySelection("به ۲۱۴"), "214", "Persian digit ambiguity follow-up should normalize selected code");

const followUpPlan = followUpBusinessPlanFromRecentMessages("به 214", [
  { role: "user", content: "شماره آقای سنجری" },
]);
assert.ok(followUpPlan, "ambiguity follow-up should rebuild the previous business plan");
assert.deepEqual(followUpPlan.queryTerms, ["214"], "follow-up query should search the selected code only");
assert.equal(followUpPlan.requestedField, BUSINESS_REQUESTED_FIELDS.CUSTOMER_PHONE, "follow-up should preserve the requested field");
assert.ok(followUpPlan.requestedFields.includes(BUSINESS_REQUESTED_FIELDS.PHONE), "follow-up should preserve phone alias");
assert.ok(followUpPlan.requestedFields.includes(BUSINESS_REQUESTED_FIELDS.CUSTOMER_PHONE), "follow-up should preserve normalized customer phone field");
for (const type of ["customer", "shipment", "commercial_card", "document", "workflow_item", "cheque"]) {
  assert.ok(followUpPlan.candidateTypes.includes(type), `follow-up should include ${type}`);
}

const ambiguityText = renderBusinessAmbiguityMessage({
  plan: { language: "fa", queryTerms: ["سنجری"] },
  candidates: [
    {
      type: "customer",
      safeSummary: {
        customerName: "آقای سنجری",
        customerCode: "214",
        status: "active",
      },
    },
    {
      type: "shipment",
      safeSummary: {
        shipmentCode: "14051102036",
        customerName: "سنجری",
        status: "در جریان",
      },
    },
    {
      type: "cheque",
      safeSummary: {
        chequeNumber: "991122",
        bankName: "ملت",
        status: "در انتظار",
      },
    },
  ],
});
assert.ok(ambiguityText.includes("\n\n"), "ambiguity renderer should separate options with blank lines");
assert.match(ambiguityText, /۱\)/, "ambiguity renderer should use Persian option digits");
assert.match(ambiguityText, /کد مشتری: ۲۱۴/, "ambiguity renderer should show customer code with Persian digits");
assert.match(ambiguityText, /وضعیت:/, "ambiguity renderer should include status per option");

const oldKey = process.env.LLM_API_KEY;
delete process.env.LLM_API_KEY;
assert.equal(llmProviderStatus().configured, false, "LLM_API_KEY unset should keep provider optional");
if (oldKey !== undefined) process.env.LLM_API_KEY = oldKey;

console.log("AI agentic context eval passed.");
