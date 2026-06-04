// @ts-nocheck
import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { pricingPlans } from "../src/lib/pricing.ts";
import {
  rolePermissions,
  tenantPermissionDescriptions,
} from "./seed-production-core.ts";
import { PREDEFINED_SHIPMENT_TYPE_WORKFLOW_MAPPINGS } from "../src/shared/shipment-workflow-template-presets.js";
import {
  resolveDocumentStorageConfig,
  validateObjectStorageConfig,
} from "../src/server/storage/storage-config.js";

const { Client } = pg;

const __filename = fileURLToPath(import.meta.url);

function isDirectRun() {
  return Boolean(process.argv[1]) && path.resolve(process.argv[1]) === __filename;
}

function fail(message: string) {
  throw new Error(message);
}

function clean(value: unknown) {
  return String(value || "").trim();
}

function normalizeEmail(value: unknown) {
  return clean(value).toLowerCase();
}

function safeErrorMessage(error: unknown) {
  return String(error?.message || error || "Unknown error")
    .replace(/postgres(?:ql)?:\/\/\S+/gi, "[redacted database url]")
    .replace(/DATABASE_URL=\S+/gi, "DATABASE_URL=[redacted]");
}

async function countQuery(client: any, sql: string, params: unknown[] = []) {
  const result = await client.query(sql, params);
  return Number(result.rows[0]?.count || 0);
}

async function requireCount(client: any, sql: string, params: unknown[], message: string) {
  const count = await countQuery(client, sql, params);
  if (count < 1) fail(message);
  return count;
}

async function verifySchema(client: any) {
  const migrations = await countQuery(client, "SELECT COUNT(*)::int AS count FROM schema_migrations");
  if (migrations < 1) fail("No migrations are recorded in schema_migrations.");
  const requiredTables = [
    "app_users",
    "organizations",
    "organization_members",
    "subscription_plans",
    "organization_subscriptions",
    "permissions",
    "roles",
    "role_permissions",
    "user_permissions",
    "customers",
    "shipments",
    "documents",
    "change_logs",
    "audit_logs",
    "shipment_workflow_templates",
    "shipment_type_workflow_templates",
  ];
  for (const table of requiredTables) {
    await requireCount(
      client,
      "SELECT COUNT(*)::int AS count FROM pg_class WHERE oid = to_regclass($1)",
      [`public.${table}`],
      `Missing required table: ${table}`
    );
  }
  return { migrations };
}

async function verifyCatalog(client: any) {
  for (const plan of pricingPlans) {
    await requireCount(
      client,
      "SELECT COUNT(*)::int AS count FROM subscription_plans WHERE id = $1 AND is_public = TRUE",
      [plan.id],
      `Missing public subscription plan: ${plan.id}`
    );
  }

  for (const permission of [...Object.keys(tenantPermissionDescriptions), "platform.admin"]) {
    await requireCount(
      client,
      "SELECT COUNT(*)::int AS count FROM permissions WHERE key = $1",
      [permission],
      `Missing permission: ${permission}`
    );
  }

  for (const role of Object.keys(rolePermissions)) {
    await requireCount(
      client,
      "SELECT COUNT(*)::int AS count FROM roles WHERE name = $1",
      [role],
      `Missing role: ${role}`
    );
    for (const permission of rolePermissions[role] || []) {
      await requireCount(
        client,
        `SELECT COUNT(*)::int AS count
         FROM roles r
         JOIN role_permissions rp ON rp.role_id = r.id
         JOIN permissions p ON p.id = rp.permission_id
         WHERE r.name = $1 AND p.key = $2`,
        [role, permission],
        `Missing role permission: ${role} -> ${permission}`
      );
    }
  }

  for (const mapping of PREDEFINED_SHIPMENT_TYPE_WORKFLOW_MAPPINGS) {
    await requireCount(
      client,
      `SELECT COUNT(*)::int AS count
       FROM shipment_workflow_templates
       WHERE id = $1
         AND code = $2
         AND is_system = TRUE
         AND is_active = TRUE
         AND organization_id IS NULL
         AND archived_at IS NULL`,
      [mapping.templateId, mapping.workflowTemplateCode],
      `Missing workflow template: ${mapping.workflowTemplateCode}`
    );
    await requireCount(
      client,
      `SELECT COUNT(*)::int AS count
       FROM shipment_type_workflow_templates
       WHERE organization_id IS NULL
         AND shipment_type_code = $1
         AND workflow_template_id = $2
         AND workflow_template_code = $3
         AND workflow_template_version = $4
         AND archived_at IS NULL`,
      [
        mapping.shipmentTypeCode,
        mapping.templateId,
        mapping.workflowTemplateCode,
        mapping.workflowTemplateVersion,
      ],
      `Missing workflow template mapping: ${mapping.shipmentTypeCode}`
    );
  }

  const platformRoleGrants = await countQuery(
    client,
    `SELECT COUNT(*)::int AS count
     FROM role_permissions rp
     JOIN permissions p ON p.id = rp.permission_id
     WHERE p.key = 'platform.admin'`
  );
  if (platformRoleGrants > 0) fail("platform.admin must not be granted through tenant roles.");

  return {
    plans: pricingPlans.length,
    permissions: Object.keys(tenantPermissionDescriptions).length + 1,
    roles: Object.keys(rolePermissions).length,
    workflowTemplates: PREDEFINED_SHIPMENT_TYPE_WORKFLOW_MAPPINGS.length,
  };
}

async function verifyInitialAdmin(client: any, env = process.env) {
  const email = normalizeEmail(env.INITIAL_ADMIN_EMAIL);
  const organizationName = clean(env.INITIAL_ORG_NAME);
  if (!email && !organizationName) {
    return { skipped: true, reason: "INITIAL_ADMIN_EMAIL and INITIAL_ORG_NAME are not set" };
  }

  const result = await client.query(
    `SELECT
       u.id AS user_id,
       u.email,
       u.role,
       u.status AS user_status,
       o.id AS organization_id,
       o.name AS organization_name,
       o.status AS organization_status,
       o.owner_user_id,
       o.plan_id,
       om.role AS membership_role,
       om.status AS membership_status,
       os.id AS subscription_id,
       os.plan_id AS subscription_plan_id,
       os.status AS subscription_status
     FROM organizations o
     LEFT JOIN app_users u ON u.organization_id = o.id
     LEFT JOIN organization_members om ON om.organization_id = o.id AND om.user_id = u.id
     LEFT JOIN organization_subscriptions os ON os.organization_id = o.id
     WHERE ($1 = '' OR lower(u.email) = lower($1))
       AND ($2 = '' OR lower(o.name) = lower($2))
     ORDER BY os.created_at DESC NULLS LAST
     LIMIT 1`,
    [email, organizationName]
  );
  const row = result.rows[0];
  if (!row) fail("Initial admin/organization was not found.");
  if (row.user_status !== "active") fail("Initial admin is not active.");
  if (row.organization_status !== "active") fail("Initial organization is not active.");
  if (row.owner_user_id !== row.user_id) fail("Initial organization owner_user_id does not match the admin user.");
  if (row.membership_role !== "owner" || row.membership_status !== "active") {
    fail("Initial admin does not have an active owner membership.");
  }
  if (!row.plan_id) fail("Initial organization does not have a plan_id.");
  if (!row.subscription_id) fail("Initial organization does not have a subscription.");
  if (!["active", "trial", "trialing"].includes(row.subscription_status)) {
    fail(`Initial organization subscription is not active/trial: ${row.subscription_status}`);
  }

  await requireCount(
    client,
    `SELECT COUNT(*)::int AS count
     FROM user_permissions up
     JOIN permissions p ON p.id = up.permission_id
     WHERE up.user_id = $1 AND p.key = 'platform.admin'`,
    [row.user_id],
    "Initial admin does not have a direct platform.admin grant."
  );

  return {
    skipped: false,
    email: row.email,
    organizationName: row.organization_name,
    planId: row.plan_id,
    subscriptionStatus: row.subscription_status,
  };
}

async function verifyNoDemoData(client: any) {
  const result = await client.query(
    `SELECT
       (SELECT COUNT(*)::int
        FROM organizations
        WHERE id = 'org-parsrah-international'
           OR slug = 'parsrah-international'
           OR legacy_data->>'seedKey' = 'parsrah-showcase-company') AS demo_organizations,
       (SELECT COUNT(*)::int
        FROM app_users
        WHERE id LIKE 'usr-parsrah-%'
           OR lower(email) LIKE '%.parsrah@logisticplus.ir') AS demo_users,
       (SELECT COUNT(*)::int
        FROM customers
        WHERE id LIKE 'prs-%'
           OR legacy_data->>'seedKey' = 'parsrah-showcase-company') AS demo_customers,
       (SELECT COUNT(*)::int
        FROM shipments
        WHERE id LIKE 'prs-%'
           OR shipment_code LIKE 'PRR-%'
           OR legacy_data->>'seedKey' = 'parsrah-showcase-company') AS demo_shipments,
       (SELECT COUNT(*)::int
        FROM documents
        WHERE id LIKE 'prs-%'
           OR legacy_data->>'seedKey' = 'parsrah-showcase-company') AS demo_documents`
  );
  const row = result.rows[0];
  for (const [key, value] of Object.entries(row)) {
    if (Number(value) > 0) fail(`Demo data check failed: ${key}=${value}`);
  }
  return row;
}

function verifyObjectStorageConfig(env = process.env) {
  const config = resolveDocumentStorageConfig(env);
  const errors = validateObjectStorageConfig(config);
  if (errors.length) fail(errors.join(" "));
  if (config.objectEnabled && !config.endpoint) {
    fail("S3_ENDPOINT is required when object storage is enabled.");
  }
  return {
    mode: config.mode,
    objectEnabled: config.objectEnabled,
    provider: config.provider,
    endpointConfigured: Boolean(config.endpoint),
    bucketConfigured: Boolean(config.bucket),
    regionConfigured: Boolean(config.region),
    forcePathStyle: config.forcePathStyle,
    dualWriteRequired: config.dualWriteRequired,
  };
}

export async function runFreshProductionVerification({
  env = process.env,
  databaseUrl = env.DATABASE_URL,
  logger = console,
} = {}) {
  if (!databaseUrl) fail("DATABASE_URL is required.");

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const schema = await verifySchema(client);
    const catalog = await verifyCatalog(client);
    const initialAdmin = await verifyInitialAdmin(client, env);
    const noDemoData = await verifyNoDemoData(client);
    const objectStorage = verifyObjectStorageConfig(env);

    const summary = {
      ok: true,
      schema,
      catalog,
      initialAdmin,
      noDemoData,
      objectStorage,
    };
    logger?.log?.(JSON.stringify(summary, null, 2));
    return summary;
  } finally {
    await client.end();
  }
}

if (isDirectRun()) {
  runFreshProductionVerification().catch((error) => {
    console.error(`Fresh production verification failed: ${safeErrorMessage(error)}`);
    process.exit(1);
  });
}
