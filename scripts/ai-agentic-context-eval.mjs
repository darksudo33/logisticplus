import assert from "node:assert/strict";
import {
  BUSINESS_REQUESTED_FIELDS,
  RELATION_INTENTS,
  classifyResolutionState,
  detectRelationIntent,
  isIdentityQuestion,
  planCompanyBrainLookup,
  planBusinessSearch,
  verifyRelationAnswerability,
} from "../src/server/ai/ai-context-planner.js";
import {
  HAMYAR_CAPABILITY_REGISTRY,
  registryToEvalCases,
} from "../src/server/ai/hamyar-capability-registry.js";
import { SHIPMENT_FIELD_LOOKUP_INTENT_ID } from "../src/server/ai/hamyar-shipment-field-registry.js";
import {
  HAMYAR_QUESTION_DATASET_DEFAULT_PATH,
  loadHamyarQuestionDataset,
  summarizeHamyarQuestionDataset,
  validateHamyarQuestionDataset,
} from "../src/server/ai/hamyar-question-dataset.js";
import { resolveHamyarQuestionPlan } from "../src/server/ai/hamyar-relation-resolver.js";
import {
  businessQueryDisplay,
  extractAmbiguitySelection,
  followUpBusinessPlanFromRecentMessages,
  rankBusinessCandidatesForPlan,
  renderBusinessAmbiguityMessage,
  resolveBusinessCandidateSelection,
  shouldUseActiveEntityForFollowUp,
} from "../src/server/ai/ai-orchestrator.js";
import {
  hamyarLlmPublicStatus,
  parseHamyarLlmConfig,
} from "../src/server/ai/hamyar-llm-config.js";
import {
  createDisabledLlmProvider,
} from "../src/server/ai/hamyar-llm-provider.js";
import {
  businessPlanFromValidatedHamyarLlmPlan,
  suggestHamyarLlmPlan,
  validateHamyarLlmPlan,
} from "../src/server/ai/hamyar-llm-planner.js";
import {
  polishHamyarAnswer,
  validatePolishedHamyarAnswer,
} from "../src/server/ai/hamyar-llm-answer-polisher.js";

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
    terms: ["چاپ آنتویس"],
    forbiddenTerms: ["چاپ", "آنتویس"],
    types: ["shipment"],
    requestedField: BUSINESS_REQUESTED_FIELDS.SUMMARY,
    requestedFields: [BUSINESS_REQUESTED_FIELDS.SUMMARY],
  },
  {
    message: "بار موتور برق مال کیه؟",
    terms: ["موتور برق"],
    forbiddenTerms: ["موتور", "برق", "بار"],
    types: ["shipment", "customer"],
    requestedField: BUSINESS_REQUESTED_FIELDS.CUSTOMER,
    requestedFields: [BUSINESS_REQUESTED_FIELDS.CUSTOMER],
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
    message: "تلفن شرکت گلدنیدک",
    terms: ["گلدنیدک"],
    forbiddenTerms: ["تلفن", "شرکت"],
    types: ["customer"],
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
    message: "شماره بار 1234021",
    terms: ["1234021"],
    forbiddenTerms: ["شماره", "بار"],
    types: ["shipment"],
    requestedField: BUSINESS_REQUESTED_FIELDS.SHIPMENT_NUMBER,
    requestedFields: [BUSINESS_REQUESTED_FIELDS.SHIPMENT_NUMBER],
  },
  {
    message: "سند محموله 14051102036",
    terms: ["14051102036"],
    forbiddenTerms: ["سند", "محموله"],
    types: ["document", "shipment", "customer"],
    requestedField: BUSINESS_REQUESTED_FIELDS.DOCUMENTS,
    requestedFields: [BUSINESS_REQUESTED_FIELDS.DOCUMENTS],
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

const companyBrainSnapshotCases = [
  ["آخرین بار ثبت شده چیه؟", "company_brain.latest"],
  ["امروز چه اتفاقی افتاده؟", "company_brain.daily"],
  ["وضعیت کلی شرکت چیه؟", "company_brain.snapshot"],
  ["چه وظایفی دارم امروز؟", "company_brain.daily"],
  ["چه محموله‌هایی در جریان هستند؟", "company_brain.snapshot"],
];
for (const [message, expectedIntent] of companyBrainSnapshotCases) {
  const plan = planCompanyBrainLookup(message);
  assert.equal(plan.checkCompanyBrain, true, `${message} should check company brain`);
  assert.equal(plan.useSnapshot, true, `${message} should use company brain snapshot`);
  assert.equal(plan.intent, expectedIntent, `${message} company brain intent`);
}

const companyBrainEntityPlan = planCompanyBrainLookup("بار موتور برق مال کیه؟");
assert.equal(companyBrainEntityPlan.checkCompanyBrain, true, "entity owner question should check company brain");
assert.equal(companyBrainEntityPlan.searchCompanyBrain, true, "entity owner question should search entity memory");
assert.ok(companyBrainEntityPlan.queryTerms.includes("موتور برق"), "entity memory search should keep the goods phrase");
assert.ok(companyBrainEntityPlan.candidateTypes.includes("shipment"), "entity memory search should include shipments");
assert.ok(companyBrainEntityPlan.candidateTypes.includes("customer"), "entity memory search should include customers for owner resolution");

const openEndedCompanyBrainPlan = planCompanyBrainLookup("برای سنجری چی داریم؟");
assert.equal(openEndedCompanyBrainPlan.searchCompanyBrain, true, "open-ended customer/company question should search company brain memory");
assert.deepEqual(openEndedCompanyBrainPlan.queryTerms, ["سنجری"], "open-ended company brain search should use the real entity term");

const exactStatusCompanyBrainPlan = planCompanyBrainLookup("وضعیت بار موتور برق چیه؟");
assert.equal(exactStatusCompanyBrainPlan.searchCompanyBrain, true, "exact status entity question should search memory for candidates first");
assert.ok(
  exactStatusCompanyBrainPlan.requestedFields.includes(BUSINESS_REQUESTED_FIELDS.STATUS),
  "exact status entity question should preserve status intent for live detail verification"
);

const identityCompanyBrainPlan = planCompanyBrainLookup("تو کی هستی");
assert.equal(identityCompanyBrainPlan.checkCompanyBrain, false, "identity query must not call memory/search");

const commandOnlyFollowUpPlan = planBusinessSearch("شماره تماس مشتری رو بده");
assert.equal(commandOnlyFollowUpPlan.searchBusinessContext, false, "field-only command follow-up should not search for command words");
assert.deepEqual(commandOnlyFollowUpPlan.queryTerms, [], "field-only command follow-up should not keep بده/رو as query terms");
assert.equal(commandOnlyFollowUpPlan.requestedField, BUSINESS_REQUESTED_FIELDS.CUSTOMER_PHONE, "field-only command follow-up should preserve phone intent");
assert.equal(planCompanyBrainLookup("شماره تماس مشتری رو بده").checkCompanyBrain, false, "activeEntity-style field follow-up should not call memory/search");
assert.equal(
  shouldUseActiveEntityForFollowUp("شماره تماس مشتری رو بده", { type: "customer", id: "customer-156", code: "156", label: "مشتری 156" }),
  true,
  "field-only phone follow-up should use the active selected customer"
);
assert.ok(!commandOnlyFollowUpPlan.queryTerms.includes("بده"), "business search term must not be command-only word بده");

const activeCustomer = { type: "customer", id: "customer-3", code: "CUS-00003", label: "مشتری CUS-00003" };
const activeShipment = { type: "shipment", id: "shipment-9", code: "LP-178072282908", label: "محموله LP-178072282908" };

const activeShipmentStatusPlan = resolveHamyarQuestionPlan("وضعیتش چیه؟", { activeEntity: activeShipment });
assert.equal(activeShipmentStatusPlan.intent, "shipment.status.lookup", "shipment status follow-up should bind to active shipment");
assert.deepEqual(activeShipmentStatusPlan.queryTerms, [], "active shipment status follow-up should not search pronoun terms");
assert.equal(activeShipmentStatusPlan.primaryEntity.fromActiveEntity, true, "active shipment status follow-up should use active entity reference");
assert.equal(activeShipmentStatusPlan.needsLiveVerification, true, "active shipment status follow-up needs live verification");

const activeShipmentCustomerPlan = resolveHamyarQuestionPlan("مشتریش کیه؟", { activeEntity: activeShipment });
assert.equal(activeShipmentCustomerPlan.intent, "shipment.customer.lookup", "customer owner follow-up should bind to active shipment");
assert.equal(activeShipmentCustomerPlan.requestedField, BUSINESS_REQUESTED_FIELDS.CUSTOMER, "customer owner follow-up should preserve customer requested field");

const activeShipmentCardPlan = resolveHamyarQuestionPlan("کارتش چیه؟", { activeEntity: activeShipment });
assert.equal(activeShipmentCardPlan.intent, "shipment.commercial_card.lookup", "card follow-up should bind to active shipment card relation");
assert.equal(activeShipmentCardPlan.requestedField, BUSINESS_REQUESTED_FIELDS.COMMERCIAL_CARD, "card follow-up should preserve commercial card requested field");

const activeShipmentTasksPlan = resolveHamyarQuestionPlan("وظایفش چیه؟", { activeEntity: activeShipment });
assert.equal(activeShipmentTasksPlan.intent, "shipment.tasks.lookup", "task follow-up should bind to active shipment");
assert.equal(activeShipmentTasksPlan.requestedField, BUSINESS_REQUESTED_FIELDS.TASKS, "task follow-up should preserve tasks requested field");

const activeShipmentActivityPlan = resolveHamyarQuestionPlan("آخرین فعالیتش چی بوده؟", { activeEntity: activeShipment });
assert.equal(activeShipmentActivityPlan.intent, "shipment.activity.lookup", "activity follow-up should bind to active shipment audit history");
assert.equal(activeShipmentActivityPlan.needsLiveVerification, true, "activity follow-up needs live verification");

const activeCustomerStatusPlan = resolveHamyarQuestionPlan("وضعیتش چیه؟", { activeEntity: activeCustomer });
assert.equal(activeCustomerStatusPlan.intent, "customer.lookup", "customer status follow-up should stay on active customer");
assert.equal(activeCustomerStatusPlan.requestedField, BUSINESS_REQUESTED_FIELDS.STATUS, "customer status follow-up should expose status requested field");

const activeCustomerShipmentPlan = resolveHamyarQuestionPlan("بارهاش چیه؟", { activeEntity: activeCustomer });
assert.equal(activeCustomerShipmentPlan.intent, "customer.shipments.lookup", "shipment-list follow-up should bind to active customer");
assert.equal(activeCustomerShipmentPlan.requestedField, BUSINESS_REQUESTED_FIELDS.SHIPMENTS, "shipment-list follow-up should preserve shipments requested field");

const activeCustomerOwnerPlan = resolveHamyarQuestionPlan("مشتریش کیه؟", { activeEntity: activeCustomer });
assert.equal(activeCustomerOwnerPlan.intent, "customer.lookup", "asking customer-of-customer should not pivot away from active customer");
assert.equal(activeCustomerOwnerPlan.requestedField, BUSINESS_REQUESTED_FIELDS.SUMMARY, "customer-of-customer follow-up should answer as current customer summary");

const activeCustomerChequePlan = resolveHamyarQuestionPlan("چک‌هاش چیه؟", { activeEntity: activeCustomer });
assert.equal(activeCustomerChequePlan.intent, "cheque.customer.lookup", "cheque follow-up should bind to active customer cheques");
assert.equal(activeCustomerChequePlan.requestedField, BUSINESS_REQUESTED_FIELDS.CHEQUES, "cheque follow-up should preserve cheques requested field");

const activeCustomerTasksPlan = resolveHamyarQuestionPlan("وظایفش چیه؟", { activeEntity: activeCustomer });
assert.equal(activeCustomerTasksPlan.intent, "customer.tasks.lookup", "task follow-up should bind to active customer");
assert.equal(activeCustomerTasksPlan.requestedField, BUSINESS_REQUESTED_FIELDS.TASKS, "customer task follow-up should preserve tasks requested field");

const exactShipmentFieldPlan = resolveHamyarQuestionPlan("کد ساتا بار 14050305014 چیه؟");
assert.equal(exactShipmentFieldPlan.intent, SHIPMENT_FIELD_LOOKUP_INTENT_ID, "SATA field should route to shipment field lookup");
assert.equal(exactShipmentFieldPlan.requestedField, "shipment.bank.sata_code", "SATA field should preserve canonical requested field");
assert.deepEqual(exactShipmentFieldPlan.queryTerms, ["14050305014"], "SATA lookup should only search by shipment reference");

const exactCommercialCardFieldPlan = resolveHamyarQuestionPlan("کارت بازرگانی بار 14050305014 ثبت شده؟");
assert.equal(exactCommercialCardFieldPlan.intent, SHIPMENT_FIELD_LOOKUP_INTENT_ID, "commercial card by shipment code should be supported as a field lookup");
assert.equal(exactCommercialCardFieldPlan.requestedField, "shipment.commercial_card", "commercial card field lookup should preserve canonical field key");

const exactShipmentFieldBusinessPlan = planBusinessSearch("کد ساتا بار 14050305014 چیه؟");
assert.equal(exactShipmentFieldBusinessPlan.registryIntent, SHIPMENT_FIELD_LOOKUP_INTENT_ID, "business plan should preserve shipment field registry intent");
assert.equal(exactShipmentFieldBusinessPlan.requestedField, "shipment.bank.sata_code", "business plan should expose the field key");
assert.deepEqual(exactShipmentFieldBusinessPlan.queryTerms, ["14050305014"], "business plan should not search generic field terms");

const activeGoodsContentsPlan = resolveHamyarQuestionPlan("محتویاتش چیه؟", { activeEntity: activeShipment });
assert.equal(activeGoodsContentsPlan.intent, SHIPMENT_FIELD_LOOKUP_INTENT_ID, "goods contents follow-up should bind to active shipment");
assert.equal(activeGoodsContentsPlan.requestedField, "shipment.goods.contents", "goods contents follow-up should preserve field key");
assert.deepEqual(activeGoodsContentsPlan.queryTerms, [], "active goods contents follow-up should not search pronoun terms");

const activeGoodsExistsPlan = resolveHamyarQuestionPlan("کالا داره؟", { activeEntity: activeShipment });
assert.equal(activeGoodsExistsPlan.intent, SHIPMENT_FIELD_LOOKUP_INTENT_ID, "goods existence follow-up should bind to active shipment");
assert.equal(activeGoodsExistsPlan.requestedField, "shipment.goods.exists", "goods existence should preserve field key");

const activeDocumentPlan = resolveHamyarQuestionPlan("اسنادش چیه؟", { activeEntity: activeShipment });
assert.equal(activeDocumentPlan.intent, SHIPMENT_FIELD_LOOKUP_INTENT_ID, "document metadata follow-up should use shipment field lookup");
assert.equal(activeDocumentPlan.requestedField, "shipment.documents.count", "generic document follow-up should answer metadata/count only");
assert.equal(
  shouldUseActiveEntityForFollowUp("اسنادش چیه؟", activeShipment),
  true,
  "active document metadata follow-up should use the focused shipment"
);

const activeDocumentFilePlan = resolveHamyarQuestionPlan("فایل سندش رو بده", { activeEntity: activeShipment });
assert.equal(activeDocumentFilePlan.intent, SHIPMENT_FIELD_LOOKUP_INTENT_ID, "document file follow-up should be classified explicitly");
assert.equal(activeDocumentFilePlan.requestedField, "shipment.documents.file_link", "document file follow-up should preserve deferred field key");
assert.equal(activeDocumentFilePlan.liveTool, "", "document file lookup must not call a live file/link tool");
assert.equal(
  shouldUseActiveEntityForFollowUp("فایل سندش رو بده", activeShipment),
  true,
  "active document file follow-up should stay on active shipment for a deferred policy answer"
);

const activeCustomerStatusBusinessPlan = planBusinessSearch("وضعیتش چیه؟", { activeEntity: activeCustomer });
assert.equal(activeCustomerStatusBusinessPlan.searchBusinessContext, false, "active customer status follow-up should not search pronoun terms");
assert.equal(activeCustomerStatusBusinessPlan.requestedField, BUSINESS_REQUESTED_FIELDS.STATUS, "active customer status business plan should keep status field");
assert.equal(
  shouldUseActiveEntityForFollowUp("وضعیتش چیه؟", activeCustomer),
  true,
  "active customer status follow-up should use the focused customer"
);

for (const message of ["شماره تماسش چنده", "تلفنش چیه؟", "موبایلش رو بده", "شماره‌ش رو بده"]) {
  const plan = planBusinessSearch(message);
  assert.equal(plan.searchBusinessContext, false, `${message} should not search possessive contact words`);
  assert.deepEqual(plan.queryTerms, [], `${message} should not keep possessive contact terms`);
  assert.equal(plan.requestedField, BUSINESS_REQUESTED_FIELDS.CUSTOMER_PHONE, `${message} should preserve customer phone intent`);
  assert.equal(
    shouldUseActiveEntityForFollowUp(message, activeCustomer),
    true,
    `${message} should use the focused customer instead of searching the possessive word`
  );
}

for (const message of ["محموله‌هاش چیه؟", "بارهاش چیه؟"]) {
  const plan = planBusinessSearch(message);
  assert.equal(plan.searchBusinessContext, false, `${message} should not search possessive shipment-list words`);
  assert.deepEqual(plan.queryTerms, [], `${message} should not keep hāš as an entity term`);
  assert.equal(plan.requestedField, BUSINESS_REQUESTED_FIELDS.SHIPMENTS, `${message} should preserve customer shipment-list intent`);
  assert.equal(
    shouldUseActiveEntityForFollowUp(message, activeCustomer),
    true,
    `${message} should use the focused customer for shipment list follow-up`
  );
}

const shipmentNumberFollowUp = planBusinessSearch("شماره بار چیه");
assert.equal(shipmentNumberFollowUp.requestedField, BUSINESS_REQUESTED_FIELDS.SHIPMENT_NUMBER, "شماره بار should mean shipment number");
assert.equal(
  shouldUseActiveEntityForFollowUp("شماره بار چیه", activeCustomer),
  false,
  "shipment-number wording must not be routed to a focused customer phone lookup"
);

const hamyarCases = registryToEvalCases();
assert.ok(hamyarCases.length >= 40, "Hamyar registry should provide broad eval coverage");
for (const [intentId, definition] of Object.entries(HAMYAR_CAPABILITY_REGISTRY.intents)) {
  assert.ok(Array.isArray(definition.examples) && definition.examples.length > 0, `${intentId} should have at least one eval example`);
}

for (const testCase of hamyarCases) {
  const plan = resolveHamyarQuestionPlan(testCase.question);
  assert.equal(plan.intent, testCase.intent, `${testCase.question} registry intent`);
  assert.deepEqual(plan.relationPath, testCase.relationPath, `${testCase.question} relation path`);
  assert.equal(plan.requestedField, testCase.requestedField, `${testCase.question} requested field`);
  for (const type of testCase.preferredEntityTypes || []) {
    assert.ok(plan.preferredEntityTypes.includes(type), `${testCase.question} should prefer ${type}`);
  }
  assert.equal(plan.needsCompanyBrain, testCase.needsCompanyBrain, `${testCase.question} Company Brain policy`);
  assert.equal(plan.needsLiveVerification, testCase.needsLiveVerification, `${testCase.question} live verification policy`);
  if (/بده|give|send/i.test(testCase.question)) {
    assert.ok(!plan.queryTerms.includes("بده"), `${testCase.question} should not keep Persian command words`);
    assert.ok(!plan.queryTerms.includes("give"), `${testCase.question} should not keep English command words`);
    assert.ok(!plan.queryTerms.includes("send"), `${testCase.question} should not keep English command words`);
  }
}

const hamyarDatasetRows = await loadHamyarQuestionDataset(HAMYAR_QUESTION_DATASET_DEFAULT_PATH);
const hamyarDatasetValidation = validateHamyarQuestionDataset(hamyarDatasetRows);
assert.equal(
  hamyarDatasetValidation.ok,
  true,
  `Hamyar question dataset should validate: ${hamyarDatasetValidation.errors.slice(0, 3).map((error) => error.message).join("; ")}`
);
const hamyarDatasetSummary = summarizeHamyarQuestionDataset(hamyarDatasetRows);
assert.ok(hamyarDatasetSummary.totalRows > 0, "Hamyar question dataset should contain rows");
assert.ok(hamyarDatasetSummary.totalIntents >= 20, "Hamyar question dataset should cover broad intent groups");
for (const row of hamyarDatasetRows.filter((candidate) => candidate.priority === "P0").slice(0, 20)) {
  const plan = resolveHamyarQuestionPlan(row.question);
  assert.equal(plan.source, "hamyar_capability_registry_v1", `${row.id} should use the registry-backed planner`);
}

assert.equal(
  businessQueryDisplay({ queryTerms: ["موتور", "برق", "موتور برق"] }),
  "موتور برق",
  "business query display should not duplicate overlapping phrase terms"
);

const shipmentIntentPlan = planBusinessSearch("بار موتور برق مال کیه؟");
const rankedCandidates = rankBusinessCandidatesForPlan(shipmentIntentPlan, [
  { type: "customer", id: "customer-1", label: "مشتری موتور برق", score: 0.99, matchedFields: ["customer_name"] },
  { type: "shipment", id: "shipment-1", label: "محموله موتور برق", score: 0.62, matchedFields: ["goods_description"] },
]);
assert.equal(rankedCandidates[0].type, "shipment", "shipment wording should rank shipment candidates before customer candidates");

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
assert.equal(extractAmbiguitySelection("گزینه دوم رو بده"), "2", "ordinal ambiguity follow-up should resolve option number");
assert.equal(extractAmbiguitySelection("مورد دوم"), "2", "case/option wording should resolve option number");
assert.equal(extractAmbiguitySelection("1"), "1", "bare numeric option should resolve option number");
assert.equal(extractAmbiguitySelection("گزینه ۱"), "1", "Persian digit option should resolve option number");
assert.equal(extractAmbiguitySelection("اولی"), "1", "bare Persian ordinal should resolve first option");
assert.equal(extractAmbiguitySelection("اون یکی"), "1", "implicit same/that option should resolve to the current first option");
assert.equal(extractAmbiguitySelection("show me the first one"), "1", "English ordinal follow-up should resolve first option");

const candidateSelectionCases = [
  {
    message: "گزینه دوم",
    expectedId: "customer-156",
    reason: "option",
  },
  {
    message: "به 156",
    expectedId: "customer-156",
    reason: "code",
  },
  {
    message: "آقای سنجری",
    expectedId: "customer-214",
    reason: "code",
  },
  {
    message: "اولی",
    expectedId: "customer-214",
    reason: "option",
  },
  {
    message: "مورد دوم",
    expectedId: "customer-156",
    reason: "option",
  },
  {
    message: "show me the first one",
    expectedId: "customer-214",
    reason: "option",
  },
  {
    message: "1",
    expectedId: "customer-214",
    reason: "option",
  },
];
const selectableCandidates = [
  {
    type: "customer",
    id: "customer-214",
    label: "مشتری آقای سنجری",
    safeSummary: { customerCode: "214", customerName: "آقای سنجری" },
  },
  {
    type: "customer",
    id: "customer-156",
    label: "مشتری شرکت سنجری",
    safeSummary: { customerCode: "156", customerName: "شرکت سنجری" },
  },
];
for (const testCase of candidateSelectionCases) {
  const resolved = resolveBusinessCandidateSelection(testCase.message, selectableCandidates);
  assert.equal(resolved.state, "resolved", `${testCase.message} should resolve to one candidate`);
  assert.equal(resolved.candidate.id, testCase.expectedId, `${testCase.message} should pick the expected candidate`);
  assert.equal(resolved.reason, testCase.reason, `${testCase.message} should expose resolution reason`);
}

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
assert.match(ambiguityText, /شماره گزینه یا کد/, "ambiguity renderer should ask for option number or exact code");
assert.match(ambiguityText, /۱\)/, "ambiguity renderer should use Persian option digits");
assert.match(ambiguityText, /کد مشتری: ۲۱۴/, "ambiguity renderer should show customer code with Persian digits");
assert.match(ambiguityText, /وضعیت:/, "ambiguity renderer should include status per option");

const optionFollowUpPlan = followUpBusinessPlanFromRecentMessages("گزینه دوم", [
  { role: "user", content: "شماره آقای سنجری" },
  { role: "assistant", content: ambiguityText },
]);
assert.ok(optionFollowUpPlan, "option follow-up should rebuild a business plan from assistant ambiguity text");
assert.deepEqual(optionFollowUpPlan.queryTerms, ["14051102036"], "option follow-up should search the selected candidate code only");
assert.equal(optionFollowUpPlan.candidateTypes[0], "shipment", "option follow-up should preserve the selected candidate type first");

function mockJsonProvider(json, { ok = true, errorCode = "" } = {}) {
  const calls = { json: 0, text: 0 };
  return {
    calls: () => ({ ...calls, total: calls.json + calls.text }),
    isEnabled: () => true,
    status: () => ({ enabled: true, configured: true, provider: "mock", model: "mock-model" }),
    callJson: async () => {
      calls.json += 1;
      if (!ok) {
        return { ok: false, json: null, text: "", latencyMs: 3, errorCode, safeError: errorCode };
      }
      return { ok: true, json, text: JSON.stringify(json), latencyMs: 3, errorCode: "", safeError: "" };
    },
    callText: async () => {
      calls.text += 1;
      return { ok: true, json: null, text: "", latencyMs: 3, errorCode: "", safeError: "" };
    },
  };
}

function mockTextProvider(text, { ok = true, errorCode = "" } = {}) {
  const calls = { json: 0, text: 0 };
  return {
    calls: () => ({ ...calls, total: calls.json + calls.text }),
    isEnabled: () => true,
    status: () => ({ enabled: true, configured: true, provider: "mock", model: "mock-model" }),
    callJson: async () => {
      calls.json += 1;
      return { ok: true, json: {}, text: "{}", latencyMs: 3, errorCode: "", safeError: "" };
    },
    callText: async () => {
      calls.text += 1;
      if (!ok) {
        return { ok: false, json: null, text: "", latencyMs: 3, errorCode, safeError: errorCode };
      }
      return { ok: true, json: null, text, latencyMs: 3, errorCode: "", safeError: "" };
    },
  };
}

function disabledCountingProvider(reason = "hamyar_llm_disabled") {
  const disabled = createDisabledLlmProvider(reason);
  const calls = { json: 0, text: 0 };
  return {
    ...disabled,
    calls: () => ({ ...calls, total: calls.json + calls.text }),
    callJson: async (...args) => {
      calls.json += 1;
      return disabled.callJson(...args);
    },
    callText: async (...args) => {
      calls.text += 1;
      return disabled.callText(...args);
    },
  };
}

const disabledHamyarConfig = parseHamyarLlmConfig({});
assert.equal(disabledHamyarConfig.enabled, false, "Hamyar LLM must be disabled by default");
assert.equal(disabledHamyarConfig.configured, false, "Hamyar LLM default config must not be treated as configured");
assert.equal(hamyarLlmPublicStatus({}).apiKeyConfigured, false, "public Hamyar LLM status must not imply a key by default");

const missingHamyarConfig = parseHamyarLlmConfig({ HAMYAR_LLM_ENABLED: "true" });
assert.equal(missingHamyarConfig.enabled, false, "enabled Hamyar LLM with missing config should fail closed");
assert.match(missingHamyarConfig.disabledReason, /HAMYAR_LLM_PROVIDER/, "missing Hamyar LLM config should name missing keys");

const configuredHamyarEnv = {
  HAMYAR_LLM_ENABLED: "true",
  HAMYAR_LLM_PROVIDER: "openai-compatible",
  HAMYAR_LLM_BASE_URL: "https://llm.example.invalid",
  HAMYAR_LLM_API_KEY: "placeholder",
  HAMYAR_LLM_MODEL: "mock-model",
};
const configuredHamyarStatus = hamyarLlmPublicStatus(configuredHamyarEnv);
assert.equal(configuredHamyarStatus.enabled, true, "complete Hamyar LLM config should enable the adapter");
assert.equal(configuredHamyarStatus.apiKeyConfigured, true, "public Hamyar LLM status should expose key presence only");
assert.equal(Object.hasOwn(configuredHamyarStatus, "apiKey"), false, "public Hamyar LLM status must not expose key material");

const disabledPlannerProvider = disabledCountingProvider();
const disabledPlannerSuggestion = await suggestHamyarLlmPlan({
  message: "phone for Sanjari",
  deterministicPlan: { intent: "unknown", confidence: 0 },
  provider: disabledPlannerProvider,
});
assert.equal(disabledPlannerSuggestion.ok, false, "disabled Hamyar LLM planner should return no suggestion");
assert.equal(disabledPlannerSuggestion.providerCalled, false, "disabled Hamyar LLM planner must not call the provider");
assert.equal(disabledPlannerProvider.calls().total, 0, "disabled Hamyar LLM planner provider must have zero calls");

const validHamyarLlmPlan = {
  intent: "customer.contact.lookup",
  confidence: 0.86,
  primaryEntity: { type: "customer", value: "Sanjari", source: "user_message" },
  relationPath: "customer -> contact",
  requestedField: "phone",
  requiresLiveVerification: true,
  usesCompanyBrain: true,
  answerPolicy: "deterministic_tools_only",
  safetyFlags: [],
};
const validPlannerProvider = mockJsonProvider(validHamyarLlmPlan);
const validPlannerSuggestion = await suggestHamyarLlmPlan({
  message: "phone for Sanjari",
  deterministicPlan: { intent: "unknown", confidence: 0 },
  provider: validPlannerProvider,
});
assert.equal(validPlannerProvider.calls().json, 1, "enabled mock planner should be called once");
assert.equal(validPlannerSuggestion.ok, true, "valid Hamyar LLM planner JSON should pass validation");
assert.equal(validPlannerSuggestion.plan.intent, "customer.contact.lookup", "valid Hamyar LLM planner should preserve the registry intent");
const staticBusinessPlan = businessPlanFromValidatedHamyarLlmPlan(validPlannerSuggestion.plan, {});
assert.equal(staticBusinessPlan.registryIntent, "customer.contact.lookup", "validated Hamyar LLM plan should map back to registry intent");
assert.deepEqual(staticBusinessPlan.queryTerms, ["Sanjari"], "validated Hamyar LLM plan should only supply search terms");
assert.equal(staticBusinessPlan.searchBusinessContext, true, "validated Hamyar LLM plan should require existing business search");
assert.equal(staticBusinessPlan.hamyarLlm.llmUsed, true, "validated Hamyar LLM business plan should mark planner usage");

const invalidPlannerProvider = mockJsonProvider(null);
const invalidPlannerSuggestion = await suggestHamyarLlmPlan({
  message: "phone for Sanjari",
  deterministicPlan: { intent: "unknown", confidence: 0 },
  provider: invalidPlannerProvider,
});
assert.equal(invalidPlannerSuggestion.ok, false, "invalid Hamyar LLM planner JSON should fail closed");
assert.equal(invalidPlannerSuggestion.reason, "schema_mismatch", "invalid Hamyar LLM planner JSON should expose schema mismatch");

const documentValidation = validateHamyarLlmPlan({
  intent: "document.lookup",
  confidence: 0.8,
  primaryEntity: { type: "shipment", value: "14051102036", source: "user_message" },
  relationPath: "shipment -> documents",
  requestedField: "documents",
});
assert.equal(documentValidation.ok, false, "Hamyar LLM document lookup plans must be deferred");
assert.equal(documentValidation.reason, "document_lookup_deferred", "document lookup should use deferred reason");

const unsafeSqlValidation = validateHamyarLlmPlan({
  ...validHamyarLlmPlan,
  answerPolicy: "SELECT * FROM shipments",
});
assert.equal(unsafeSqlValidation.ok, false, "Hamyar LLM planner must reject SQL-like output");
assert.equal(unsafeSqlValidation.reason, "unsafe_generated_content", "SQL-like output should be rejected as unsafe");

const writeActionValidation = validateHamyarLlmPlan({
  intent: "action.proposed.requires_confirmation",
  confidence: 0.8,
  answerPolicy: "preview write action only",
});
assert.equal(writeActionValidation.ok, false, "Hamyar LLM write/action plans must not be executable");
assert.equal(writeActionValidation.reason, "future_action_preview_only", "write/action plans should be preview-only");
assert.equal(writeActionValidation.previewOnly, true, "write/action plans should be marked preview-only");

const exactRouteProvider = mockJsonProvider(validHamyarLlmPlan);
const exactRouteSuggestion = await suggestHamyarLlmPlan({
  message: "status for shipment 14051102036",
  deterministicPlan: {
    intent: "shipment.status.lookup",
    confidence: 0.95,
    entities: { shipmentRef: "14051102036" },
  },
  provider: exactRouteProvider,
});
assert.equal(exactRouteSuggestion.ok, false, "exact deterministic routes should win over Hamyar LLM");
assert.equal(exactRouteSuggestion.providerCalled, false, "exact deterministic routes must not call Hamyar LLM");
assert.equal(exactRouteProvider.calls().total, 0, "exact deterministic route provider should have zero calls");

const deterministicAnswer = "No contact phone is registered.";
const hallucinatedPhoneValidation = validatePolishedHamyarAnswer({
  deterministicAnswer,
  polishedAnswer: "Call 09123456789.",
});
assert.equal(hallucinatedPhoneValidation.ok, false, "Hamyar LLM polish must reject introduced phone values");
assert.ok(
  ["introduced_numeric_identifier", "introduced_phone_like_value"].includes(hallucinatedPhoneValidation.reason),
  "introduced phone should be rejected as a new identifier or phone value"
);

const disabledPolishProvider = disabledCountingProvider();
const disabledPolish = await polishHamyarAnswer({
  deterministicAnswer,
  provider: disabledPolishProvider,
});
assert.equal(disabledPolish.answer, deterministicAnswer, "disabled Hamyar LLM polish should keep deterministic answer");
assert.equal(disabledPolish.llmUsed, false, "disabled Hamyar LLM polish should not mark LLM usage");
assert.equal(disabledPolishProvider.calls().total, 0, "disabled Hamyar LLM polish must not call the provider");

const hallucinatingPolishProvider = mockTextProvider("Call 09123456789.");
const hallucinatingPolish = await polishHamyarAnswer({
  deterministicAnswer,
  provider: hallucinatingPolishProvider,
});
assert.equal(hallucinatingPolish.answer, deterministicAnswer, "unsafe Hamyar LLM polish should fall back to deterministic answer");
assert.equal(hallucinatingPolish.llmUsed, false, "unsafe Hamyar LLM polish should not mark LLM usage");
assert.equal(hallucinatingPolish.llmMode, "fallback", "unsafe Hamyar LLM polish should be a fallback");
assert.equal(hallucinatingPolishProvider.calls().text, 1, "enabled mock polisher should be called once");

console.log("AI agentic context eval passed.");
