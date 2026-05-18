#!/usr/bin/env node
import crypto from "node:crypto";
import pg from "pg";
import { createTaskRecord, getSmsAnalytics, listSmsDeliveries } from "../src/server/db.js";
import { runSmsWorkerOnce } from "../src/server/sms-worker.js";

const { Client } = pg;

const OWNER_EMAIL = process.env.SMS_SMOKE_OWNER_EMAIL || "darksudo22@gmail.com";
const TARGET_PHONE_LOCAL = process.env.SMS_SMOKE_TARGET_PHONE || "09365683694";
const TARGET_PHONE_NORMALIZED = "989365683694";
const EXPOSED_KEY_SHA256 = "3e3db185556b491b9fd94ab5e38b726faace150b600e0eba7afbfccc10c13bcc";

function assertProductionTarget() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  if (process.env.APP_PUBLIC_URL !== "https://logisticplus.liara.run") {
    throw new Error(`Refusing SMS smoke for unexpected APP_PUBLIC_URL: ${process.env.APP_PUBLIC_URL || "(empty)"}`);
  }
}

function assertLiveSmsConfig({ requireRotatedKey = false } = {}) {
  if (process.env.SMS_ENABLED !== "true") throw new Error("SMS_ENABLED must be true.");
  if (process.env.SMS_DRY_RUN !== "false") throw new Error("SMS_DRY_RUN must be false for live smoke.");
  if (process.env.SMSIR_USE_DEFAULT_LINE !== "true" && !process.env.SMSIR_LINE_NUMBER) {
    throw new Error("SMSIR_USE_DEFAULT_LINE must be true or SMSIR_LINE_NUMBER must be set.");
  }
  if (requireRotatedKey) {
    const keyHash = crypto.createHash("sha256").update(String(process.env.SMSIR_API_KEY || "")).digest("hex");
    const currentKeyExplicitlyApproved = process.env.SMS_SMOKE_ALLOW_CURRENT_KEY === "true";
    if (!process.env.SMSIR_API_KEY || (keyHash === EXPOSED_KEY_SHA256 && !currentKeyExplicitlyApproved)) {
      throw new Error("Refusing live SMS send until the exposed SMS.ir API key is rotated in Liara env.");
    }
  }
}

async function withClient(fn) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function getOwner(client) {
  const result = await client.query(
    `SELECT u.id, u.organization_id, u.name, u.email, u.role, u.status, u.phone,
            o.name AS organization_name,
            s.status AS subscription_status,
            s.plan_id,
            s.limits_override
     FROM app_users u
     LEFT JOIN organizations o ON o.owner_user_id = u.id
     LEFT JOIN organization_subscriptions s ON s.organization_id = o.id
     WHERE lower(u.email) = lower($1)
     LIMIT 1`,
    [OWNER_EMAIL]
  );
  const owner = result.rows[0];
  if (!owner?.id || !owner.organization_id) throw new Error(`Owner ${OWNER_EMAIL} was not found.`);
  return owner;
}

async function buildPrecheck(client) {
  const [owner, smsCounts, queued, meetings, shipments] = await Promise.all([
    getOwner(client),
    client.query(
      `SELECT status, source_type, COUNT(*)::int AS count
       FROM sms_deliveries
       GROUP BY status, source_type
       ORDER BY status, source_type`
    ),
    client.query(
      `SELECT id, organization_id, source_type, recipient_phone, created_at
       FROM sms_deliveries
       WHERE status = 'queued'
       ORDER BY created_at ASC
       LIMIT 20`
    ),
    client.query(
      `SELECT id, organization_id, title, meeting_at, assigned_to_id
       FROM compliance_meetings
       WHERE archived_at IS NULL
         AND status NOT IN ('COMPLETED', 'CANCELLED', 'ARCHIVED')
         AND assigned_to_id IS NOT NULL
         AND organization_id IS NOT NULL
       ORDER BY created_at DESC
       LIMIT 20`
    ),
    client.query(
      `SELECT id, organization_id, shipment_code, status, free_time_ends_at, estimated_delivery_at, assigned_manager_id
       FROM shipments
       WHERE archived_at IS NULL
         AND organization_id IS NOT NULL
         AND status IN ('ARRIVED', 'CUSTOMS', 'CLEARED')
       ORDER BY created_at DESC
       LIMIT 20`
    ),
  ]);

  return {
    owner: {
      id: owner.id,
      organizationId: owner.organization_id,
      role: owner.role,
      status: owner.status,
      phone: owner.phone || "",
      subscriptionStatus: owner.subscription_status || "",
      planId: owner.plan_id || "",
      limitsOverride: owner.limits_override || {},
    },
    smsCounts: smsCounts.rows,
    queued: queued.rows,
    scheduledCandidates: {
      meetings: meetings.rows,
      shipments: shipments.rows,
    },
  };
}

function assertCleanPrecheck(precheck) {
  if (precheck.queued.length) throw new Error(`Expected no queued SMS rows, found ${precheck.queued.length}.`);
  if (precheck.scheduledCandidates.meetings.length) {
    throw new Error(`Expected no active meeting SMS candidates, found ${precheck.scheduledCandidates.meetings.length}.`);
  }
  if (precheck.scheduledCandidates.shipments.length) {
    throw new Error(`Expected no active demurrage SMS candidates, found ${precheck.scheduledCandidates.shipments.length}.`);
  }
  if (precheck.owner.role !== "CEO" || precheck.owner.status !== "active") {
    throw new Error(`Owner must be an active CEO, got role=${precheck.owner.role} status=${precheck.owner.status}.`);
  }
  if (precheck.owner.subscriptionStatus !== "active") {
    throw new Error(`Owner subscription must be active, got ${precheck.owner.subscriptionStatus || "(empty)"}.`);
  }
}

async function precheck() {
  assertProductionTarget();
  assertLiveSmsConfig();
  return withClient(buildPrecheck);
}

async function prepare() {
  assertProductionTarget();
  assertLiveSmsConfig();
  const before = await precheck();
  assertCleanPrecheck(before);

  const owner = await withClient(async (client) => {
    const currentOwner = await getOwner(client);
    if (currentOwner.phone !== TARGET_PHONE_LOCAL) {
      await client.query("UPDATE app_users SET phone = $2, updated_at = NOW() WHERE id = $1", [
        currentOwner.id,
        TARGET_PHONE_LOCAL,
      ]);
    }
    return getOwner(client);
  });

  const task = await createTaskRecord({
    ownerUserId: owner.id,
    title: "تست ارسال پیامک لاجستیک پلاس",
    description: "Controlled production SMS.ir live verification task.",
    status: "TODO",
    priority: "URGENT",
    assignedToUserId: owner.id,
    assignedToName: owner.name,
    assignedByUserId: owner.id,
    assignedByName: owner.name,
    dueDate: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    sourceType: "SMS_SMOKE",
    sourceId: `sms-smoke-${Date.now()}`,
  });

  const deliveries = await listSmsDeliveries({
    organizationId: owner.organization_id,
    status: "queued",
    limit: 20,
  });
  const delivery = deliveries.find((item) => item.sourceType === "task" && item.sourceId === task.id);
  if (!delivery) throw new Error("Smoke task was created but no queued SMS delivery was found.");
  if (delivery.recipientPhone !== TARGET_PHONE_NORMALIZED) {
    throw new Error(`Queued SMS recipient mismatch: ${delivery.recipientPhone || "(empty)"}.`);
  }

  return {
    owner: { id: owner.id, organizationId: owner.organization_id, phone: owner.phone },
    task: { id: task.id, title: task.title },
    delivery: {
      id: delivery.id,
      status: delivery.status,
      sourceType: delivery.sourceType,
      sourceId: delivery.sourceId,
      recipientPhone: delivery.recipientPhone,
    },
  };
}

async function runWorker() {
  assertProductionTarget();
  assertLiveSmsConfig({ requireRotatedKey: true });
  const check = await precheck();
  if (check.queued.length !== 1) throw new Error(`Expected exactly one queued SMS row, found ${check.queued.length}.`);
  if (check.queued[0].source_type !== "task" || check.queued[0].recipient_phone !== TARGET_PHONE_NORMALIZED) {
    throw new Error("Queued SMS row is not the controlled smoke task.");
  }
  if (check.scheduledCandidates.meetings.length || check.scheduledCandidates.shipments.length) {
    throw new Error("Scheduled SMS candidates exist; refusing to run worker.");
  }

  const result = await runSmsWorkerOnce({ limit: 1 });
  const deliveries = await listSmsDeliveries({
    organizationId: check.owner.organizationId,
    limit: 10,
  });
  const delivery = deliveries.find((item) => item.id === check.queued[0].id);
  if (delivery?.status !== "sent") {
    throw new Error(`Smoke SMS was not sent. Current status: ${delivery?.status || "(missing)"}.`);
  }
  if (delivery.providerResponse?.dryRun) throw new Error("Smoke SMS used dry-run provider response.");

  return {
    workerResult: result,
    delivery: {
      id: delivery.id,
      status: delivery.status,
      providerMessageId: delivery.providerMessageId,
      providerResponse: delivery.providerResponse,
      sentAt: delivery.sentAt,
      recipientPhone: delivery.recipientPhone,
    },
    analytics: await getSmsAnalytics({ organizationId: check.owner.organizationId }),
  };
}

async function report() {
  assertProductionTarget();
  const check = await precheck();
  return {
    precheck: check,
    analytics: await getSmsAnalytics({ organizationId: check.owner.organizationId }),
  };
}

async function main() {
  const mode = process.argv[2] || "precheck";
  const data =
    mode === "precheck" ? await precheck() :
    mode === "prepare" ? await prepare() :
    mode === "run-worker" ? await runWorker() :
    mode === "report" ? await report() :
    null;
  if (!data) throw new Error(`Unknown mode: ${mode}`);
  console.log(JSON.stringify({ mode, ok: true, data }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
