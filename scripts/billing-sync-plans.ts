// @ts-nocheck
import "dotenv/config";
import pg from "pg";
import { subscriptionPlans } from "../src/lib/subscriptionPlans.ts";

const { Client } = pg;

const databaseUrl = process.env.DATABASE_URL || process.env.QA_DATABASE_URL || "";
const mode = process.env.PLAN_SYNC_MODE || "local";
const confirmed = ["1", "true", "yes", "on"].includes(String(process.env.PLAN_SYNC_CONFIRM || "").toLowerCase());
const dryRun = ["1", "true", "yes", "on"].includes(String(process.env.PLAN_SYNC_DRY_RUN || "").toLowerCase());

function fail(message) {
  console.error(`[billing:sync-plans] ${message}`);
  process.exit(1);
}

function asJson(value) {
  return JSON.stringify(value ?? {});
}

function planRow(plan, index) {
  return {
    id: plan.id,
    name: plan.name,
    description: plan.description || plan.audience || "",
    monthlyPriceIrr: plan.monthlyPriceIrr,
    annualPriceIrr: plan.annualPriceIrr,
    limits: {
      users: plan.limits.users,
      monthlyShipments: plan.limits.monthlyShipments,
      storageMb: plan.limits.storageMb,
    },
    features: plan.backendFeatures,
    sortOrder: index + 1,
  };
}

function assertGuards() {
  if (!databaseUrl) {
    fail("DATABASE_URL or QA_DATABASE_URL is required.");
  }
  if (mode === "production" && !confirmed) {
    fail("Production plan sync requires PLAN_SYNC_CONFIRM=true.");
  }
}

async function readCurrentPlans(client) {
  const result = await client.query(
    `SELECT id, name, description, monthly_price_irr, annual_price_irr, limits, features, sort_order, is_public
     FROM subscription_plans
     WHERE id = ANY($1::text[])
     ORDER BY sort_order ASC, id ASC`,
    [subscriptionPlans.map((plan) => plan.id)]
  );
  return result.rows;
}

async function main() {
  assertGuards();
  const rows = subscriptionPlans.map(planRow);
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const before = await readCurrentPlans(client);
    if (dryRun) {
      console.log(JSON.stringify({ ok: true, dryRun: true, mode, before, planned: rows }, null, 2));
      return;
    }

    await client.query("BEGIN");
    for (const row of rows) {
      await client.query(
        `INSERT INTO subscription_plans (
           id, name, description, monthly_price_irr, annual_price_irr, limits, features, is_public, sort_order, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, TRUE, $8, NOW())
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           description = EXCLUDED.description,
           monthly_price_irr = EXCLUDED.monthly_price_irr,
           annual_price_irr = EXCLUDED.annual_price_irr,
           limits = EXCLUDED.limits,
           features = EXCLUDED.features,
           is_public = TRUE,
           sort_order = EXCLUDED.sort_order,
           updated_at = NOW()`,
        [
          row.id,
          row.name,
          row.description,
          row.monthlyPriceIrr,
          row.annualPriceIrr,
          asJson(row.limits),
          asJson(row.features),
          row.sortOrder,
        ]
      );
    }
    await client.query("COMMIT");

    const after = await readCurrentPlans(client);
    console.log(JSON.stringify({ ok: true, dryRun: false, mode, synced: rows.map((row) => row.id), before, after }, null, 2));
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Plan sync failed:", error);
  process.exit(1);
});
