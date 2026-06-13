// @ts-nocheck
import "dotenv/config";
import pg from "pg";
import { rebuildCompanyBrainForOrganization } from "../src/server/ai/company-brain.js";

const { Pool } = pg;

function argValue(name: string) {
  const prefix = `--${name}=`;
  const match = process.argv.find((item) => item.startsWith(prefix));
  return match ? match.slice(prefix.length).trim() : "";
}

function positionalOrganizationId() {
  const value = process.argv.slice(2).find((item) => item && !item.startsWith("--"));
  return value || "";
}

function printHelp() {
  console.log(`Usage: tsx scripts/rebuild-company-brain.ts [--organization-id=<id>]

Rebuilds derived company brain rows for all organizations, or one organization when provided.
Only organization_ai_memory and organization_ai_memory_items are cleared/rebuilt.`);
}

function assertNotAccidentalProduction(databaseUrl: string) {
  const explicitAllow = process.env.COMPANY_BRAIN_ALLOW_PRODUCTION_REBUILD === "true";
  const productionLike =
    process.env.NODE_ENV === "production" ||
    /liara|render|railway|supabase|neon|amazonaws|rds/i.test(databaseUrl);
  if (productionLike && !explicitAllow) {
    throw new Error(
      "Refusing to rebuild company brain against a production-like DATABASE_URL without COMPANY_BRAIN_ALLOW_PRODUCTION_REBUILD=true."
    );
  }
}

async function organizationIds(pool: Pool, organizationId: string) {
  if (organizationId) {
    return [{ id: organizationId, name: organizationId }];
  }
  const result = await pool.query(
    `SELECT id, name
     FROM organizations
     ORDER BY created_at ASC, name ASC`
  );
  return result.rows;
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printHelp();
    return;
  }

  const databaseUrl = process.env.DATABASE_URL || "postgres://postgres@localhost:5432/logisticplus";
  assertNotAccidentalProduction(databaseUrl);

  const requestedOrganizationId =
    argValue("organization-id") ||
    process.env.COMPANY_BRAIN_ORGANIZATION_ID ||
    positionalOrganizationId();

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const organizations = await organizationIds(pool, requestedOrganizationId);
    const results = [];
    for (const organization of organizations) {
      const counts = await rebuildCompanyBrainForOrganization(pool, organization.id);
      const summary = {
        organizationId: organization.id,
        organizationName: organization.name,
        counts,
      };
      results.push(summary);
      console.log(JSON.stringify(summary, null, 2));
    }
    console.log(JSON.stringify({ ok: true, organizations: results.length }, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Company brain rebuild failed:", error);
  process.exitCode = 1;
});
