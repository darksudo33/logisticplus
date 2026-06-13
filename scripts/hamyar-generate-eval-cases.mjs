import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  HAMYAR_CAPABILITY_REGISTRY_VERSION,
  registryToEvalCases,
  validateHamyarCapabilityRegistry,
} from "../src/server/ai/hamyar-capability-registry.js";

const outputPath = path.resolve("tests/fixtures/hamyar-capability-eval.json");
const shouldPrintOnly = process.argv.includes("--print");

const validation = validateHamyarCapabilityRegistry();
if (!validation.ok) {
  console.error("Hamyar capability registry validation failed:");
  for (const error of validation.errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  const cases = registryToEvalCases();
  const payload = {
    version: HAMYAR_CAPABILITY_REGISTRY_VERSION,
    generatedAt: "static",
    cases,
  };

  if (shouldPrintOnly) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    console.log(`Generated ${cases.length} Hamyar capability eval cases at ${outputPath}`);
  }
}
