#!/usr/bin/env node
import pg from "pg";

const { Client } = pg;

const args = new Set(process.argv.slice(2));
const shouldApply = args.has("--apply");
const ownerEmail = process.env.CLEAN_OWNER_EMAIL || "darksudo22@gmail.com";

const tablesToCount = [
  "app_users",
  "organizations",
  "organization_members",
  "organization_subscriptions",
  "user_records",
  "customers",
  "shipments",
  "tasks",
  "documents",
  "cheques",
  "compliance_meetings",
  "quotations",
  "archive_records",
  "chat_threads",
  "chat_messages",
  "notifications",
  "change_logs",
  "app_error_logs",
  "contact_requests",
  "signup_requests",
  "billing_payments",
  "billing_invoices",
  "billing_receipts",
  "subscription_events",
  "rate_limit_buckets",
  "app_sessions",
];

const deleteStatements = [
  ["DELETE FROM app_sessions"],
  ["DELETE FROM rate_limit_buckets"],
  ["DELETE FROM chat_messages"],
  ["DELETE FROM chat_thread_members"],
  ["DELETE FROM chat_threads"],
  ["DELETE FROM document_versions"],
  ["DELETE FROM meeting_required_documents"],
  ["DELETE FROM shipment_status_events"],
  ["DELETE FROM documents"],
  ["DELETE FROM archive_records"],
  ["DELETE FROM tasks"],
  ["DELETE FROM cheques"],
  ["DELETE FROM compliance_meetings"],
  ["DELETE FROM quotations"],
  ["DELETE FROM shipments"],
  ["DELETE FROM customers"],
  ["DELETE FROM notifications"],
  ["DELETE FROM change_logs"],
  ["DELETE FROM app_error_logs"],
  ["DELETE FROM contact_requests"],
  ["DELETE FROM billing_invoice_items"],
  ["DELETE FROM billing_receipts"],
  ["DELETE FROM billing_invoices"],
  ["DELETE FROM billing_payments"],
  ["DELETE FROM signup_requests"],
  ["DELETE FROM subscription_events"],
  ["DELETE FROM user_records"],
];

function assertSafeTarget() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required.");
  }

  if (!shouldApply) return;

  const publicUrl = process.env.APP_PUBLIC_URL || "";
  if (publicUrl !== "https://logisticplus.liara.run") {
    throw new Error(`Refusing production cleanup for unexpected APP_PUBLIC_URL: ${publicUrl || "(empty)"}`);
  }
}

async function countTables(client) {
  const counts = {};
  for (const table of tablesToCount) {
    const result = await client.query(`SELECT COUNT(*)::int AS count FROM ${table}`);
    counts[table] = result.rows[0].count;
  }
  return counts;
}

async function main() {
  assertSafeTarget();

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const before = await countTables(client);
    if (!shouldApply) {
      console.log(JSON.stringify({ mode: "counts", ownerEmail, counts: before }, null, 2));
      return;
    }

    const ownerResult = await client.query(
      "SELECT id, organization_id FROM app_users WHERE lower(email) = lower($1) LIMIT 1",
      [ownerEmail]
    );
    const owner = ownerResult.rows[0];
    if (!owner?.id || !owner?.organization_id) {
      throw new Error(`Owner ${ownerEmail} was not found with an organization.`);
    }

    await client.query("BEGIN");
    for (const [sql, params] of deleteStatements) {
      await client.query(sql, params);
    }
    await client.query("DELETE FROM organization_members WHERE user_id <> $1 OR organization_id <> $2", [
      owner.id,
      owner.organization_id,
    ]);
    await client.query("DELETE FROM app_users WHERE id <> $1", [owner.id]);
    await client.query("DELETE FROM organization_subscriptions WHERE organization_id <> $1", [owner.organization_id]);
    await client.query("DELETE FROM organizations WHERE id <> $1", [owner.organization_id]);
    await client.query(
      "UPDATE app_users SET organization_id = $2, status = 'active', is_online = FALSE WHERE id = $1",
      [owner.id, owner.organization_id]
    );
    await client.query(
      "UPDATE organizations SET owner_user_id = $1, status = 'active', updated_at = NOW() WHERE id = $2",
      [owner.id, owner.organization_id]
    );
    await client.query(
      `INSERT INTO organization_members (organization_id, user_id, role, status)
       VALUES ($2, $1, 'owner', 'active')
       ON CONFLICT (organization_id, user_id) DO UPDATE SET role = 'owner', status = 'active'`,
      [owner.id, owner.organization_id]
    );
    await client.query("COMMIT");

    const after = await countTables(client);
    console.log(JSON.stringify({ mode: "applied", ownerEmail, preservedOwnerId: owner.id, preservedOrganizationId: owner.organization_id, before, after }, null, 2));
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
