#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const requiredFiles = [
  "AGENTS.md",
  "docs/phase-0-safety-baseline.md",
  "docs/security/tenant-scope-checklist.md",
];

const requiredPackageScripts = [
  "lint",
  "build",
  "test:e2e",
  "test:e2e:setup",
  "safety:check",
];

const requiredAgentRules = [
  "Never trust client-supplied `organizationId`",
  "Every protected tenant-owned read and write must include `organization_id`",
  "Public tracking responses must be built from allowlisted DTOs only",
  "Document downloads must stream by server-side lookup only",
  "Never delete migrations",
];

const warnings = [];
const failures = [];

function fileExists(relativePath) {
  return fs.existsSync(path.join(rootDir, relativePath));
}

for (const relativePath of requiredFiles) {
  if (!fileExists(relativePath)) {
    failures.push(`Missing required safety file: ${relativePath}`);
  }
}

const packagePath = path.join(rootDir, "package.json");
let packageJson = null;
try {
  packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
} catch (error) {
  failures.push(`Could not read package.json: ${error.message}`);
}

if (packageJson) {
  const scripts = packageJson.scripts || {};
  for (const scriptName of requiredPackageScripts) {
    if (!scripts[scriptName]) {
      failures.push(`Missing package script: ${scriptName}`);
    }
  }
}

if (fileExists("AGENTS.md")) {
  const agents = fs.readFileSync(path.join(rootDir, "AGENTS.md"), "utf8");
  for (const snippet of requiredAgentRules) {
    if (!agents.includes(snippet)) {
      failures.push(`AGENTS.md is missing guardrail text: ${snippet}`);
    }
  }
}

const riskyOperationalScripts = [
  "scripts/clean-liara-production-data.mjs",
  "scripts/qa-cleanup-prod.ts",
  "scripts/qa-seed-heavy.ts",
  "scripts/seed-demo-company.ts",
];

for (const relativePath of riskyOperationalScripts) {
  if (fileExists(relativePath)) {
    warnings.push(`Review before running destructive or seed utility: ${relativePath}`);
  }
}

if (warnings.length) {
  console.warn("Safety warnings:");
  for (const warning of warnings) console.warn(`- ${warning}`);
}

if (failures.length) {
  console.error("Safety check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Safety check passed.");
