// @ts-nocheck
import "dotenv/config";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const { Client } = pg;

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL || "postgres://postgres@localhost:5432/logisticplus_test";
const adminUrl = process.env.POSTGRES_ADMIN_URL || withDatabase(testDatabaseUrl, "postgres");
const testSeedPassword = process.env.TEST_SEED_USER_PASSWORD || "playwright-owner-pass";
const testDocumentStorageDir = process.env.TEST_DOCUMENT_STORAGE_DIR || "storage/test-documents";

function withDatabase(connectionString: string, databaseName: string) {
  const parsed = new URL(connectionString);
  parsed.pathname = `/${databaseName}`;
  return parsed.toString();
}

function getDatabaseName(connectionString: string) {
  const parsed = new URL(connectionString);
  const databaseName = parsed.pathname.replace(/^\//, "");
  if (!/^[a-zA-Z0-9_]+$/.test(databaseName)) {
    throw new Error(`Unsafe test database name: ${databaseName}`);
  }
  if (!databaseName.toLowerCase().includes("test")) {
    throw new Error(`Refusing to reset database without "test" in its name: ${databaseName}`);
  }
  return databaseName;
}

async function resetDatabase() {
  const databaseName = getDatabaseName(testDatabaseUrl);
  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();

  try {
    await admin.query(
      `SELECT pg_terminate_backend(pid)
       FROM pg_stat_activity
       WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [databaseName]
    );
    await admin.query(`DROP DATABASE IF EXISTS ${databaseName}`);
    await admin.query(`CREATE DATABASE ${databaseName}`);
  } finally {
    await admin.end();
  }
}

async function resetDocumentStorage() {
  const resolved = path.resolve(testDocumentStorageDir);
  if (!resolved.toLowerCase().includes("test")) {
    throw new Error(`Refusing to clear document storage without "test" in its path: ${resolved}`);
  }
  await fs.rm(resolved, { recursive: true, force: true });
  await fs.mkdir(resolved, { recursive: true });
}

function runTsxScript(scriptPath: string) {
  const env = {
    ...process.env,
    APP_PUBLIC_URL: `http://127.0.0.1:${process.env.TEST_PORT || process.env.PORT || 3010}`,
    DATABASE_URL: testDatabaseUrl,
    DOCUMENT_STORAGE_DIR: testDocumentStorageDir,
    POSTGRES_ADMIN_URL: adminUrl,
    SEED_USER_PASSWORD: testSeedPassword,
    ZARINPAL_SANDBOX: "true",
  };

  return new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", scriptPath], {
      cwd: process.cwd(),
      env,
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${scriptPath} exited with code ${code}`));
      }
    });
  });
}

async function main() {
  await resetDocumentStorage();
  await resetDatabase();
  await runTsxScript("scripts/seed-db.ts");
  await runTsxScript("scripts/bridge-canonical-db.ts");
  console.log(`Reset Playwright test database: ${getDatabaseName(testDatabaseUrl)}`);
}

main().catch((error) => {
  console.error("Playwright test database reset failed:", error);
  process.exit(1);
});
