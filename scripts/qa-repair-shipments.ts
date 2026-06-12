// @ts-nocheck
import "dotenv/config";
import crypto from "node:crypto";
import pg from "pg";
import { DEFAULT_SHIPMENT_STEP_NAMES } from "../src/lib/shipmentWorkflow.ts";

const { Client } = pg;

const mode = process.env.QA_MODE || "production";
const confirmed = ["1", "true", "yes"].includes(String(process.env.QA_REPAIR_CONFIRM || "").toLowerCase());
const databaseUrl = process.env.QA_DATABASE_URL || process.env.DATABASE_URL || "";
const shipmentId = String(process.env.REPAIR_SHIPMENT_ID || "").trim();
const shipmentCode = String(process.env.REPAIR_SHIPMENT_CODE || "").trim();
const generateTracking = ["1", "true", "yes"].includes(String(process.env.REPAIR_GENERATE_TRACKING || "").toLowerCase());
const findCandidates = ["1", "true", "yes"].includes(String(process.env.REPAIR_FIND_CANDIDATES || "").toLowerCase());
const publicBaseUrl = String(process.env.APP_PUBLIC_URL || process.env.QA_TARGET_URL || "https://logisticplus.liara.run").replace(/\/$/, "");

function fail(message) {
  console.error(`[qa:repair-shipments] ${message}`);
  process.exit(1);
}

function hashCustomerAccessToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function makeCustomerAccessToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function assertGuards() {
  if (mode !== "production" && process.env.QA_ALLOW_NON_PROD_REPAIR !== "true") {
    fail("Refusing repair unless QA_MODE=production or QA_ALLOW_NON_PROD_REPAIR=true.");
  }
  if (findCandidates) {
    if (!databaseUrl) {
      fail("DATABASE_URL or QA_DATABASE_URL is required.");
    }
    return;
  }
  if (!confirmed) {
    fail("Refusing repair unless QA_REPAIR_CONFIRM=true.");
  }
  if (!databaseUrl) {
    fail("DATABASE_URL or QA_DATABASE_URL is required.");
  }
  if (!shipmentId && !shipmentCode) {
    fail("REPAIR_SHIPMENT_ID or REPAIR_SHIPMENT_CODE is required.");
  }
}

async function listCandidates(client) {
  const result = await client.query(
    `WITH step_counts AS (
       SELECT data->>'shipmentId' AS shipment_id, COUNT(*)::int AS step_count
       FROM user_records
       WHERE collection = 'shipmentSteps'
       GROUP BY data->>'shipmentId'
     )
     SELECT
       s.id,
       s.shipment_code,
       s.organization_id,
       s.owner_user_id,
       u.email AS owner_email,
       u.organization_id AS owner_organization_id,
       COALESCE(sc.step_count, 0)::int AS step_count,
       s.customer_access_enabled,
       (s.customer_access_token_hash IS NOT NULL OR s.customer_access_token IS NOT NULL) AS has_tracking_token,
       s.updated_at
     FROM shipments s
     LEFT JOIN app_users u ON u.id = s.owner_user_id
     LEFT JOIN step_counts sc ON sc.shipment_id = s.id
     WHERE s.organization_id IS NULL OR COALESCE(sc.step_count, 0) = 0
     ORDER BY s.updated_at DESC NULLS LAST
     LIMIT 25`
  );

  console.log(JSON.stringify({
    ok: true,
    readOnly: true,
    candidateCount: result.rows.length,
    candidates: result.rows,
  }, null, 2));
}

function workflowStepData(shipmentId, order) {
  return {
    id: `step-${shipmentId}-${order}`,
    shipmentId,
    name: DEFAULT_SHIPMENT_STEP_NAMES[order],
    order,
    status: order === 0 ? "IN_PROGRESS" : "PENDING",
  };
}

async function readShipment(client) {
  const values = [];
  const filters = [];
  if (shipmentId) {
    values.push(shipmentId);
    filters.push(`s.id = $${values.length}`);
  }
  if (shipmentCode) {
    values.push(shipmentCode);
    filters.push(`s.shipment_code = $${values.length}`);
  }
  const result = await client.query(
    `SELECT s.*, u.organization_id AS owner_organization_id
     FROM shipments s
     LEFT JOIN app_users u ON u.id = s.owner_user_id
     WHERE ${filters.join(" OR ")}
     ORDER BY s.updated_at DESC
     LIMIT 2`,
    values
  );
  if (result.rows.length === 0) fail("Shipment was not found.");
  if (result.rows.length > 1) fail("Shipment selector matched more than one record; use REPAIR_SHIPMENT_ID.");
  return result.rows[0];
}

async function countSteps(client, id) {
  const result = await client.query(
    `SELECT COUNT(*)::int AS count
     FROM user_records
     WHERE collection = 'shipmentSteps'
       AND data->>'shipmentId' = $1`,
    [id]
  );
  return result.rows[0]?.count || 0;
}

async function insertMissingSteps(client, shipment) {
  const organizationId = shipment.organization_id || shipment.owner_organization_id || null;
  const existingResult = await client.query(
    `SELECT item_id, data
     FROM user_records
     WHERE owner_user_id = $1
       AND collection = 'shipmentSteps'
       AND data->>'shipmentId' = $2`,
    [shipment.owner_user_id, shipment.id]
  );
  const existingStepIds = new Set(existingResult.rows.map((row) => row.item_id));
  let inserted = 0;

  for (let order = 0; order < DEFAULT_SHIPMENT_STEP_NAMES.length; order += 1) {
    const step = workflowStepData(shipment.id, order);
    if (existingStepIds.has(step.id)) continue;
    await client.query(
      `INSERT INTO user_records (owner_user_id, organization_id, collection, item_id, data, updated_at)
       VALUES ($1, $2, 'shipmentSteps', $3, $4::jsonb, NOW())
       ON CONFLICT (owner_user_id, collection, item_id)
       DO UPDATE SET organization_id = EXCLUDED.organization_id, data = EXCLUDED.data, updated_at = NOW()`,
      [shipment.owner_user_id, organizationId, step.id, JSON.stringify(step)]
    );
    inserted += 1;
  }
  return inserted;
}

async function main() {
  assertGuards();
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    if (findCandidates) {
      await listCandidates(client);
      return;
    }

    await client.query("BEGIN");
    const before = await readShipment(client);
    const beforeStepCount = await countSteps(client, before.id);
    const organizationId = before.organization_id || before.owner_organization_id || null;

    if (organizationId && !before.organization_id) {
      await client.query(
        `UPDATE shipments
         SET organization_id = $2, updated_at = NOW()
         WHERE id = $1 AND organization_id IS NULL`,
        [before.id, organizationId]
      );
    }

    const insertedSteps = await insertMissingSteps(client, before);
    let trackingUrl = null;
    if (generateTracking) {
      const token = before.customer_access_token || makeCustomerAccessToken();
      await client.query(
        `UPDATE shipments
         SET customer_access_token = $2,
             customer_access_token_hash = COALESCE(customer_access_token_hash, $3),
             customer_access_enabled = TRUE,
             updated_at = NOW()
         WHERE id = $1`,
        [before.id, token, hashCustomerAccessToken(token)]
      );
      trackingUrl = `${publicBaseUrl}/track/${encodeURIComponent(token)}`;
    }

    const after = await readShipment(client);
    const afterStepCount = await countSteps(client, after.id);
    await client.query("COMMIT");

    console.log(JSON.stringify({
      ok: true,
      shipmentId: after.id,
      shipmentCode: after.shipment_code,
      organizationBackfilled: !before.organization_id && Boolean(after.organization_id),
      generatedTracking: generateTracking,
      trackingUrl,
      before: {
        organizationId: before.organization_id,
        stepCount: beforeStepCount,
        customerAccessEnabled: before.customer_access_enabled,
        hasToken: Boolean(before.customer_access_token_hash || before.customer_access_token),
      },
      repaired: {
        insertedSteps,
      },
      after: {
        organizationId: after.organization_id,
        stepCount: afterStepCount,
        customerAccessEnabled: after.customer_access_enabled,
        hasToken: Boolean(after.customer_access_token_hash || after.customer_access_token),
      },
    }, null, 2));
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("QA shipment repair failed:", error);
  process.exit(1);
});
