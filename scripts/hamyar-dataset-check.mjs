import {
  HAMYAR_QUESTION_DATASET_DEFAULT_PATH,
  loadHamyarQuestionDataset,
  summarizeHamyarQuestionDataset,
  validateHamyarQuestionDataset,
} from "../src/server/ai/hamyar-question-dataset.js";

function printError(error) {
  const location = error.lineNumber ? `line ${error.lineNumber}` : "dataset";
  const id = error.id ? ` ${error.id}` : "";
  const field = error.field ? ` ${error.field}` : "";
  console.error(`- ${location}${id}${field}: ${error.message}`);
}

let rows;
try {
  rows = await loadHamyarQuestionDataset(HAMYAR_QUESTION_DATASET_DEFAULT_PATH);
} catch (error) {
  console.error(`Hamyar dataset check failed: ${error.message}`);
  process.exit(1);
}

const validation = validateHamyarQuestionDataset(rows);
const summary = summarizeHamyarQuestionDataset(rows);

console.log("Hamyar question dataset summary");
console.log(`- file: ${HAMYAR_QUESTION_DATASET_DEFAULT_PATH}`);
console.log(`- total rows: ${summary.totalRows}`);
console.log(`- total intents: ${summary.totalIntents}`);
console.log(`- total categories: ${summary.totalCategories}`);
console.log(`- P0/P1/P2 counts: ${summary.priorityCounts.P0}/${summary.priorityCounts.P1}/${summary.priorityCounts.P2}`);
console.log(`- future action rows: ${summary.futureActionRows}`);
console.log(`- requires live verification rows: ${summary.requiresLiveVerificationRows}`);
console.log(`- uses Company Brain rows: ${summary.usesCompanyBrainRows}`);

if (!validation.ok) {
  console.error(`Hamyar dataset validation failed with ${validation.errors.length} error(s). Showing first 20:`);
  for (const error of validation.errors.slice(0, 20)) printError(error);
  process.exit(1);
}

console.log("Hamyar dataset validation passed.");
