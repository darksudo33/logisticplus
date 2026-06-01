// @ts-nocheck
import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const { Client } = pg;

const prefix = String(process.env.QA_PREFIX || "").trim();
const cleanupEnabled = ["1", "true", "yes", "on"].includes(String(process.env.QA_CLEANUP || "").toLowerCase());
const mode = process.env.QA_MODE || "production";
const databaseUrl = process.env.QA_DATABASE_URL || process.env.DATABASE_URL || "";
const documentStorageDir = process.env.DOCUMENT_STORAGE_DIR || path.join(process.cwd(), "storage", "documents");
const documentStorageRoot = path.resolve(documentStorageDir);
const like = `${prefix}%`;
const contains = `%${prefix}%`;
const params = [like, contains, prefix];

const tableSpecs = [
  {
    name: "billing_invoice_items",
    where: `invoice_id IN (
      SELECT id FROM billing_invoices
      WHERE invoice_number LIKE $2 OR notes LIKE $2 OR metadata::text LIKE $2
         OR organization_id IN (SELECT id FROM organizations WHERE id LIKE $1 OR name LIKE $2 OR slug LIKE $2)
         OR signup_request_id IN (SELECT id FROM signup_requests WHERE id LIKE $1 OR company_name LIKE $2 OR contact_email LIKE $2)
    ) OR description LIKE $2 OR metadata::text LIKE $2`,
  },
  {
    name: "billing_receipts",
    where: `receipt_number LIKE $2 OR metadata::text LIKE $2
      OR organization_id IN (SELECT id FROM organizations WHERE id LIKE $1 OR name LIKE $2 OR slug LIKE $2)
      OR invoice_id IN (SELECT id FROM billing_invoices WHERE invoice_number LIKE $2 OR notes LIKE $2 OR metadata::text LIKE $2)
      OR payment_id IN (SELECT id FROM billing_payments WHERE description LIKE $2 OR raw_request::text LIKE $2 OR raw_verify::text LIKE $2)`,
  },
  {
    name: "billing_invoices",
    where: `invoice_number LIKE $2 OR notes LIKE $2 OR metadata::text LIKE $2
      OR organization_id IN (SELECT id FROM organizations WHERE id LIKE $1 OR name LIKE $2 OR slug LIKE $2)
      OR signup_request_id IN (SELECT id FROM signup_requests WHERE id LIKE $1 OR company_name LIKE $2 OR contact_email LIKE $2)
      OR payment_id IN (SELECT id FROM billing_payments WHERE description LIKE $2 OR raw_request::text LIKE $2 OR raw_verify::text LIKE $2)`,
  },
  {
    name: "billing_payments",
    where: `id LIKE $1 OR description LIKE $2 OR gateway_authority LIKE $2 OR gateway_url LIKE $2 OR raw_request::text LIKE $2 OR raw_verify::text LIKE $2
      OR organization_id IN (SELECT id FROM organizations WHERE id LIKE $1 OR name LIKE $2 OR slug LIKE $2)
      OR signup_request_id IN (SELECT id FROM signup_requests WHERE id LIKE $1 OR company_name LIKE $2 OR contact_email LIKE $2)`,
  },
  {
    name: "subscription_events",
    where: `summary LIKE $2 OR before_json::text LIKE $2 OR after_json::text LIKE $2
      OR organization_id IN (SELECT id FROM organizations WHERE id LIKE $1 OR name LIKE $2 OR slug LIKE $2)`,
  },
  {
    name: "signup_requests",
    where: "id LIKE $1 OR company_name LIKE $2 OR contact_name LIKE $2 OR contact_email LIKE $2 OR notes LIKE $2",
  },
  {
    name: "app_error_logs",
    where: "message LIKE $2 OR stack LIKE $2 OR route LIKE $2 OR api_endpoint LIKE $2 OR context::text LIKE $2 OR user_id LIKE $1",
  },
  {
    name: "user_records",
    where: "owner_user_id LIKE $1 OR item_id LIKE $1 OR data::text LIKE $2",
  },
  {
    name: "app_sessions",
    where: "id LIKE $1 OR user_id LIKE $1",
  },
  {
    name: "login_sms_challenges",
    where: "id LIKE $1 OR user_id LIKE $1 OR user_agent LIKE $2",
  },
  {
    name: "rate_limit_buckets",
    where: "key LIKE $1 OR key LIKE $2",
  },
  {
    name: "sms_deliveries",
    where: "id LIKE $1 OR event_key LIKE $1 OR source_id LIKE $1 OR message LIKE $2 OR provider_response::text LIKE $2",
  },
  {
    name: "notifications",
    where: "id LIKE $1 OR title LIKE $2 OR body LIKE $2 OR source_id LIKE $1 OR legacy_data::text LIKE $2",
  },
  {
    name: "change_logs",
    where: "id LIKE $1 OR entity_id LIKE $1 OR summary LIKE $2 OR before_json::text LIKE $2 OR after_json::text LIKE $2",
  },
  {
    name: "document_versions",
    where: `document_id LIKE $1 OR storage_key LIKE $2 OR file_name LIKE $2
      OR document_id IN (SELECT id FROM documents WHERE id LIKE $1 OR title LIKE $2 OR file_name LIKE $2 OR storage_key LIKE $2 OR legacy_data::text LIKE $2)`,
  },
  {
    name: "meeting_required_documents",
    where: `id LIKE $1 OR name LIKE $2 OR file_name LIKE $2 OR legacy_data::text LIKE $2
      OR meeting_id IN (SELECT id FROM compliance_meetings WHERE id LIKE $1 OR title LIKE $2 OR organization_name LIKE $2 OR legacy_data::text LIKE $2)`,
  },
  {
    name: "shipment_status_events",
    where: `id LIKE $1 OR public_label LIKE $2 OR public_description LIKE $2
      OR shipment_id IN (SELECT id FROM shipments WHERE id LIKE $1 OR shipment_code LIKE $2 OR customer_name LIKE $2 OR legacy_data::text LIKE $2)`,
  },
  {
    name: "archive_records",
    where: "id LIKE $2 OR entity_id LIKE $1 OR title LIKE $2 OR summary LIKE $2 OR customer_name LIKE $2 OR legacy_data::text LIKE $2",
  },
  {
    name: "documents",
    where: "id LIKE $1 OR title LIKE $2 OR file_name LIKE $2 OR storage_key LIKE $2 OR checksum LIKE $2 OR legacy_data::text LIKE $2",
  },
  {
    name: "tasks",
    where: "id LIKE $1 OR title LIKE $2 OR description LIKE $2 OR legacy_data::text LIKE $2",
  },
  {
    name: "cheques",
    where: "id LIKE $1 OR cheque_number LIKE $2 OR location LIKE $2 OR receiver LIKE $2 OR description LIKE $2 OR legacy_data::text LIKE $2",
  },
  {
    name: "compliance_meetings",
    where: "id LIKE $1 OR title LIKE $2 OR organization_name LIKE $2 OR location LIKE $2 OR description LIKE $2 OR legacy_data::text LIKE $2",
  },
  {
    name: "quotations",
    where: "id LIKE $1 OR quotation_number LIKE $2 OR customer_name LIKE $2 OR customer_phone LIKE $2 OR notes LIKE $2 OR legacy_data::text LIKE $2",
  },
  {
    name: "shipments",
    where: "id LIKE $1 OR shipment_code LIKE $2 OR customer_name LIKE $2 OR legacy_data::text LIKE $2",
  },
  {
    name: "customers",
    where: "id LIKE $1 OR company_name LIKE $2 OR contact_name LIKE $2 OR email LIKE $2 OR notes LIKE $2 OR legacy_data::text LIKE $2",
  },
  {
    name: "contact_requests",
    where: "id LIKE $1 OR company_name LIKE $2 OR contact_name LIKE $2 OR contact_email LIKE $2 OR message LIKE $2",
  },
  {
    name: "organization_members",
    where: "organization_id LIKE $1 OR user_id LIKE $1",
  },
  {
    name: "organization_subscriptions",
    where: "organization_id LIKE $1 OR limits_override::text LIKE $2",
  },
  {
    name: "app_users",
    where: "id LIKE $1 OR name LIKE $2 OR email LIKE $2",
  },
  {
    name: "organizations",
    where: "id LIKE $1 OR name LIKE $2 OR slug LIKE $2 OR contact_name LIKE $2 OR contact_email LIKE $2 OR legacy_data::text LIKE $2",
  },
];

function assertSafePrefix() {
  if (!cleanupEnabled) {
    throw new Error("Refusing cleanup unless QA_CLEANUP=true.");
  }
  if (!/^QA-[A-Za-z0-9:.-]{6,96}$/.test(prefix)) {
    throw new Error("QA_PREFIX must start with QA- and contain only letters, numbers, dot, colon, or hyphen.");
  }
  if (mode !== "production" && process.env.QA_ALLOW_NON_PROD_CLEANUP !== "true") {
    throw new Error("qa:cleanup-prod requires QA_MODE=production unless QA_ALLOW_NON_PROD_CLEANUP=true.");
  }
}

function remoteCleanupHint() {
  const envPrefix = `QA_PREFIX=${prefix} QA_CLEANUP=true QA_MODE=production`;
  return [
    "DATABASE_URL is not available locally.",
    "After this script is deployed, run the guarded cleanup inside Liara with:",
    `liara shell --app logisticplus --command "${envPrefix} npm run qa:cleanup-prod"`,
  ].join("\n");
}

function isPathInside(root, target) {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function resolveStoragePath(storageKey) {
  if (!storageKey || path.isAbsolute(storageKey) || path.basename(storageKey) !== storageKey) return null;
  const resolved = path.resolve(documentStorageRoot, storageKey);
  return isPathInside(documentStorageRoot, resolved) ? resolved : null;
}

async function deleteStorageKeys(storageKeys) {
  const unique = [...new Set(storageKeys.filter(Boolean))];
  const result = { attempted: unique.length, deleted: 0, missing: 0, skipped: 0, errors: [] };
  let storageStat = null;
  try {
    storageStat = await fs.stat(documentStorageRoot);
  } catch {
    result.skipped = unique.length;
    result.skipReason = `DOCUMENT_STORAGE_DIR not accessible: ${documentStorageRoot}`;
    return result;
  }
  if (!storageStat.isDirectory()) {
    result.skipped = unique.length;
    result.skipReason = `DOCUMENT_STORAGE_DIR is not a directory: ${documentStorageRoot}`;
    return result;
  }

  for (const storageKey of unique) {
    const filePath = resolveStoragePath(storageKey);
    if (!filePath) {
      result.skipped += 1;
      continue;
    }
    try {
      await fs.unlink(filePath);
      result.deleted += 1;
    } catch (error) {
      if (error?.code === "ENOENT") {
        result.missing += 1;
      } else {
        result.errors.push({ storageKey, message: error?.message || String(error) });
      }
    }
  }
  return result;
}

async function tableCount(client, spec) {
  try {
    const result = await client.query(
      `SELECT COUNT(*)::int AS count FROM ${spec.name} WHERE ${typedParams(spec.where)}`,
      paramsForWhere(spec.where)
    );
    return result.rows[0]?.count || 0;
  } catch (error) {
    error.message = `${spec.name}: ${error.message}`;
    throw error;
  }
}

function typedParams(sql) {
  return String(sql).replace(/\$(\d+)/g, (_match, index) => `$${index}::text`);
}

function paramsForWhere(where) {
  const matches = [...String(where).matchAll(/\$(\d+)/g)];
  const max = Math.max(0, ...matches.map((match) => Number(match[1])));
  return params.slice(0, max);
}

async function countAll(client) {
  const counts = {};
  for (const spec of tableSpecs) {
    counts[spec.name] = await tableCount(client, spec);
  }
  return counts;
}

async function collectStorageKeys(client) {
  const result = await client.query(
    typedParams(`SELECT DISTINCT storage_key
     FROM (
       SELECT d.storage_key
       FROM documents d
       WHERE d.id LIKE $1 OR d.title LIKE $2 OR d.file_name LIKE $2 OR d.storage_key LIKE $2 OR d.legacy_data::text LIKE $2
       UNION ALL
       SELECT v.storage_key
       FROM document_versions v
       LEFT JOIN documents d ON d.id = v.document_id
       WHERE v.document_id LIKE $1 OR v.storage_key LIKE $2 OR v.file_name LIKE $2
          OR d.id LIKE $1 OR d.title LIKE $2 OR d.file_name LIKE $2 OR d.storage_key LIKE $2 OR d.legacy_data::text LIKE $2
     ) keys
     WHERE storage_key IS NOT NULL AND storage_key <> ''`),
    params.slice(0, 2)
  );
  return result.rows.map((row) => row.storage_key).filter(Boolean);
}

async function deleteRows(client) {
  const deleted = {};
  for (const spec of tableSpecs) {
    try {
      const result = await client.query(`DELETE FROM ${spec.name} WHERE ${typedParams(spec.where)}`, paramsForWhere(spec.where));
      deleted[spec.name] = result.rowCount || 0;
    } catch (error) {
      error.message = `${spec.name}: ${error.message}`;
      throw error;
    }
  }
  return deleted;
}

function sumCounts(counts) {
  return Object.values(counts).reduce((sum, count) => sum + Number(count || 0), 0);
}

async function main() {
  assertSafePrefix();
  if (!databaseUrl) {
    console.error(remoteCleanupHint());
    process.exit(2);
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const before = await countAll(client);
    const storageKeys = await collectStorageKeys(client);
    await client.query("BEGIN");
    const deleted = await deleteRows(client);
    await client.query("COMMIT");
    const storage = await deleteStorageKeys(storageKeys);
    const after = await countAll(client);
    const remaining = sumCounts(after);
    const report = {
      prefix,
      mode,
      before,
      deleted,
      after,
      storage,
      ok: remaining === 0 && storage.errors.length === 0,
    };
    console.log(JSON.stringify(report, null, 2));
    if (!report.ok) {
      process.exitCode = 3;
    }
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("QA production cleanup failed:", error);
  process.exit(1);
});
