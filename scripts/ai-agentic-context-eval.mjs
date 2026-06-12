import assert from "node:assert/strict";
import {
  RELATION_INTENTS,
  classifyResolutionState,
  detectRelationIntent,
  verifyRelationAnswerability,
} from "../src/server/ai/ai-context-planner.js";
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

const oldKey = process.env.LLM_API_KEY;
delete process.env.LLM_API_KEY;
assert.equal(llmProviderStatus().configured, false, "LLM_API_KEY unset should keep provider optional");
if (oldKey !== undefined) process.env.LLM_API_KEY = oldKey;

console.log("AI agentic context eval passed.");
