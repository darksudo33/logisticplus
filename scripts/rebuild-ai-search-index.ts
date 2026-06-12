// @ts-nocheck
import "dotenv/config";
import pg from "pg";
import { rebuildAiBusinessSearchIndex } from "../src/server/ai/ai-search-index.js";

const { Pool } = pg;

function argValue(name: string) {
  const prefix = `--${name}=`;
  const match = process.argv.find((item) => item.startsWith(prefix));
  return match ? match.slice(prefix.length).trim() : "";
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL || "postgres://postgres@localhost:5432/logisticplus";
  const organizationId = argValue("organization-id") || process.env.AI_SEARCH_INDEX_ORGANIZATION_ID || "";
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const counts = await rebuildAiBusinessSearchIndex(pool, { organizationId });
    console.log(JSON.stringify({ ok: true, organizationId: organizationId || "all", counts }, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("AI business search index rebuild failed:", error);
  process.exitCode = 1;
});
