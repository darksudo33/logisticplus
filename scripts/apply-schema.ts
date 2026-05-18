// @ts-nocheck
import "dotenv/config";
import pg from "pg";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const { Client } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const databaseUrl =
  process.env.DATABASE_URL || "postgres://postgres@localhost:5432/logisticplus";

function getDatabaseName(url: string) {
  try {
    return new URL(url).pathname.replace(/^\//, "") || "(unknown)";
  } catch {
    return "(unknown)";
  }
}

async function applySchema() {
  const schema = await fs.readFile(path.join(rootDir, "db", "schema.sql"), "utf8");
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    await client.query("BEGIN");
    await client.query(schema);
    await client.query("COMMIT");
    console.log(`Applied db/schema.sql to ${getDatabaseName(databaseUrl)}.`);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

applySchema().catch((error) => {
  console.error(error);
  process.exit(1);
});
