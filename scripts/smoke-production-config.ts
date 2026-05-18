// @ts-nocheck
import { spawn } from "node:child_process";
import path from "node:path";

const missingStorageDir = path.join("storage", `missing-production-smoke-${Date.now()}`);

const env = {
  ...process.env,
  APP_PUBLIC_URL: "https://logisticplus.example",
  CONFIG_SMOKE_ONLY: "true",
  DATABASE_URL: process.env.TEST_DATABASE_URL || "postgres://postgres@localhost:5432/logisticplus_test",
  DOCUMENT_STORAGE_DIR: missingStorageDir,
  NODE_ENV: "production",
  RATE_LIMIT_STORE: "memory",
  ZARINPAL_MERCHANT_ID: "",
  ZARINPAL_SANDBOX: "true",
};

const child = spawn(process.execPath, ["server.js"], {
  cwd: process.cwd(),
  env,
  stdio: ["ignore", "pipe", "pipe"],
});

let output = "";
child.stdout.on("data", (chunk) => {
  output += chunk.toString();
});
child.stderr.on("data", (chunk) => {
  output += chunk.toString();
});

child.on("error", (error) => {
  console.error("Could not start production config smoke:", error);
  process.exit(1);
});

child.on("exit", (code) => {
  if (code === 0) {
    console.error("Production config smoke expected startup checks to fail, but server exited successfully.");
    process.exit(1);
  }

  const expected = [
    "Production configuration error",
    "DOCUMENT_STORAGE_DIR",
    "ZARINPAL_SANDBOX",
    "ZARINPAL_MERCHANT_ID",
  ];
  const missing = expected.filter((term) => !output.includes(term));
  if (missing.length) {
    console.error("Production config smoke failed. Missing expected output:", missing.join(", "));
    console.error(output);
    process.exit(1);
  }

  console.log("Production config smoke passed: missing storage and live Zarinpal config fail loudly.");
});
