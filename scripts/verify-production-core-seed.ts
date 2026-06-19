// @ts-nocheck
import "dotenv/config";
import bcrypt from "bcryptjs";
import { spawn } from "node:child_process";
import pg from "pg";
import {
  rolePermissions,
  runProductionCoreSeed,
  tenantPermissionDescriptions,
} from "./seed-production-core.ts";
import { runProductionAdminBootstrap } from "./seed-production-admin.ts";
import { runFreshProductionVerification } from "./verify-fresh-production.ts";
import { pricingPlans } from "../src/lib/pricing.ts";
import { DEFAULT_SMS_TEMPLATES } from "../src/server/sms-templates.js";
import { SYSTEM_CUSTOMS_STEP_CATALOG } from "../src/shared/shipment-workflow-step-catalog.js";

const { Client } = pg;

const defaultDatabaseUrl = "postgres://postgres@localhost:5432/logisticplus_production_core_seed_test";
const databaseUrl = process.env.PRODUCTION_CORE_SEED_TEST_DATABASE_URL || defaultDatabaseUrl;
const adminUrl = process.env.POSTGRES_ADMIN_URL || withDatabase(databaseUrl, "postgres");
const keepDatabase = process.env.KEEP_PRODUCTION_CORE_SEED_TEST_DB === "true";

const baseEnv = {
  DATABASE_URL: databaseUrl,
  INITIAL_ADMIN_EMAIL: `core-admin-${Date.now()}@example.test`,
  INITIAL_ADMIN_PASSWORD: "CoreSeedBootstrap!2026",
  INITIAL_ADMIN_NAME: "Core Seed Admin",
  INITIAL_ORG_NAME: `Core Seed Organization ${Date.now()}`,
  INITIAL_ADMIN_PHONE: "+989123456789",
  INITIAL_ORG_PLAN_ID: "enterprise",
  INITIAL_ORG_BILLING_CYCLE: "annual",
};

let shipmentCodeSequence = 700 + (Date.now() % 200);

function nextValidShipmentCode() {
  shipmentCodeSequence = shipmentCodeSequence >= 998 ? 700 : shipmentCodeSequence + 1;
  return `14050316${String(shipmentCodeSequence).padStart(3, "0")}`;
}

function withDatabase(connectionString: string, databaseName: string) {
  const parsed = new URL(connectionString);
  parsed.pathname = `/${databaseName}`;
  return parsed.toString();
}

function getDatabaseName(connectionString: string) {
  const parsed = new URL(connectionString);
  const databaseName = parsed.pathname.replace(/^\//, "");
  if (!/^[a-zA-Z0-9_]+$/.test(databaseName)) {
    throw new Error(`Unsafe production core seed test database name: ${databaseName}`);
  }
  const lowered = databaseName.toLowerCase();
  if (!lowered.includes("test") || !lowered.includes("core")) {
    throw new Error(`Refusing to reset non-core test database: ${databaseName}`);
  }
  return databaseName;
}

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function createCaptureLogger() {
  const lines: string[] = [];
  const push = (...args: unknown[]) => lines.push(args.map(String).join(" "));
  return {
    logger: {
      log: push,
      warn: push,
      error: push,
    },
    lines,
  };
}

async function resetDatabase() {
  const databaseName = getDatabaseName(databaseUrl);
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

async function dropDatabase() {
  if (keepDatabase) return;
  const databaseName = getDatabaseName(databaseUrl);
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
  } finally {
    await admin.end();
  }
}

function runMigrationCommand() {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", "scripts/migrate.ts", "up"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`scripts/migrate.ts exited with code ${code}\n${stdout}\n${stderr}`));
    });
  });
}

async function tableCounts(client: any) {
  const result = await client.query(
    `SELECT
       (SELECT COUNT(*)::int FROM subscription_plans) AS plans,
       (SELECT COUNT(*)::int FROM permissions) AS permissions,
       (SELECT COUNT(*)::int FROM roles) AS roles,
       (SELECT COUNT(*)::int FROM role_permissions) AS role_permissions,
       (SELECT COUNT(*)::int FROM sms_templates) AS sms_templates,
       (SELECT COUNT(*)::int FROM shipment_workflow_step_catalog WHERE organization_id IS NULL AND is_system = TRUE AND category = 'customs_import') AS workflow_catalog_steps,
       (SELECT COUNT(*)::int FROM shipment_workflow_templates WHERE organization_id IS NULL AND is_system = TRUE AND archived_at IS NULL) AS workflow_templates,
       (SELECT COUNT(*)::int FROM shipment_workflow_template_steps WHERE template_id = 'swt-ir-import-customs-v1' AND catalog_step_id IS NOT NULL AND archived_at IS NULL) AS import_customs_template_steps,
       (SELECT COUNT(*)::int FROM organizations) AS organizations,
       (SELECT COUNT(*)::int FROM customers) AS customers,
       (SELECT COUNT(*)::int FROM shipments) AS shipments,
       (SELECT COUNT(*)::int FROM documents) AS documents`
  );
  return result.rows[0];
}

async function loadState() {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const counts = await tableCounts(client);
    const planResult = await client.query("SELECT id FROM subscription_plans ORDER BY id ASC");
    const roleResult = await client.query("SELECT name FROM roles ORDER BY name ASC");
    const permissionResult = await client.query("SELECT key FROM permissions ORDER BY key ASC");
    const templateResult = await client.query("SELECT key FROM sms_templates ORDER BY key ASC");
    const platformRoleGrant = await client.query(
      `SELECT COUNT(*)::int AS count
       FROM role_permissions rp
       JOIN permissions p ON p.id = rp.permission_id
       WHERE p.key = 'platform.admin'`
    );
    const adminState = await client.query(
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
       FROM app_users u
       JOIN organizations o ON o.id = u.organization_id
       LEFT JOIN organization_members om ON om.organization_id = o.id AND om.user_id = u.id
       LEFT JOIN organization_subscriptions os ON os.organization_id = o.id
       WHERE lower(u.email) = lower($1)
       ORDER BY os.created_at DESC NULLS LAST
       LIMIT 1`,
      [baseEnv.INITIAL_ADMIN_EMAIL]
    );
    const demoState = await client.query(
      `SELECT
         (SELECT COUNT(*)::int FROM organizations WHERE id = 'org-parsrah-international' OR slug = 'parsrah-international') AS demo_organizations,
         (SELECT COUNT(*)::int FROM app_users WHERE lower(email) LIKE '%.parsrah@logisticplus.ir') AS demo_users,
         (SELECT COUNT(*)::int FROM customers WHERE id LIKE 'prs-%') AS demo_customers,
         (SELECT COUNT(*)::int FROM shipments WHERE shipment_code LIKE 'PRR-%') AS demo_shipments`
    );
    return {
      counts,
      plans: planResult.rows.map((row) => row.id),
      roles: roleResult.rows.map((row) => row.name),
      permissions: permissionResult.rows.map((row) => row.key),
      templates: templateResult.rows.map((row) => row.key),
      platformRoleGrants: platformRoleGrant.rows[0].count,
      admin: adminState.rows[0] || null,
      demo: demoState.rows[0],
    };
  } finally {
    await client.end();
  }
}

async function expectRolePermission(role: string, permission: string) {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const result = await client.query(
      `SELECT COUNT(*)::int AS count
       FROM roles r
       JOIN role_permissions rp ON rp.role_id = r.id
       JOIN permissions p ON p.id = rp.permission_id
       WHERE r.name = $1 AND p.key = $2`,
      [role, permission]
    );
    expect(result.rows[0].count === 1, `${role} should include ${permission}`);
  } finally {
    await client.end();
  }
}

function assertNoSecretOutput(lines: string[], secrets: string[]) {
  const output = lines.join("\n");
  for (const secret of secrets) {
    expect(!output.includes(secret), "Seed output leaked a secret.");
  }
}

async function runCapturedCore(args: string[]) {
  const capture = createCaptureLogger();
  await runProductionCoreSeed({
    args,
    env: { ...process.env, ...baseEnv },
    databaseUrl,
    logger: capture.logger,
  });
  return capture.lines;
}

async function runCapturedAdmin(args: string[]) {
  const capture = createCaptureLogger();
  await runProductionAdminBootstrap({
    args,
    env: { ...process.env, ...baseEnv },
    databaseUrl,
    logger: capture.logger,
  });
  return capture.lines;
}

async function exerciseFreshFlows() {
  process.env.DATABASE_URL = databaseUrl;
  const db = await import(`../src/server/db.js?core-seed-test=${Date.now()}`);
  const user = await db.getUserByEmail(baseEnv.INITIAL_ADMIN_EMAIL);
  expect(user?.id, "Initial admin should be queryable by email.");
  const permissions = await db.getUserPermissions(user.id);
  for (const permission of [
    "platform.admin",
    "dashboard.view",
    "customers.create",
    "customers.view",
    "shipments.create",
    "shipments.view_all",
    "documents.upload",
    "users.manage",
  ]) {
    expect(permissions.includes(permission), `Initial admin should have ${permission}`);
  }

  const customer = await db.createCustomerRecord({
    ownerUserId: user.id,
    actorUserId: user.id,
    customer: {
      companyName: "Fresh Production Customer",
      contactName: "Fresh Contact",
      email: `fresh-customer-${Date.now()}@example.test`,
      phone: "+989120000000",
    },
  });
  expect(customer?.id, "Initial admin should be able to create a customer.");

  const shipment = await db.createShipmentRecord({
    ownerUserId: user.id,
    actorUserId: user.id,
    organizationId: user.organization_id,
    shipment: {
      trackingNumber: nextValidShipmentCode(),
      customerId: customer.id,
      origin: "Origin",
      destination: "Destination",
      status: "LOADING",
    },
  });
  expect(shipment?.id, "Initial admin should be able to create a shipment.");

  const passwordHash = await bcrypt.hash("ManualCompany!2026", 12);
  const manual = await db.createManualCompanySignup({
    signup: {
      companyName: `Manual Company ${Date.now()}`,
      ownerName: "Manual Owner",
      ownerEmail: `manual-owner-${Date.now()}@example.test`,
      password: "ManualCompany!2026",
      planId: "business",
      billingCycle: "monthly",
    },
    passwordHash,
    reviewerId: user.id,
  });
  expect(manual?.organizationId, "Platform admin should be able to create a company manually.");

  await db.pool.end();
}

async function main() {
  const allOutput: string[] = [];
  await resetDatabase();
  try {
    await runMigrationCommand();

    const beforeDryRun = await loadState();
    allOutput.push(...(await runCapturedCore(["--dry-run"])));
    const afterDryRun = await loadState();
    expect(JSON.stringify(beforeDryRun.counts) === JSON.stringify(afterDryRun.counts), "Core dry-run should not change row counts.");

    allOutput.push(...(await runCapturedCore([])));
    let state = await loadState();
    for (const plan of pricingPlans) expect(state.plans.includes(plan.id), `Missing plan: ${plan.id}`);
    for (const role of Object.keys(rolePermissions)) expect(state.roles.includes(role), `Missing role: ${role}`);
    for (const permission of [...Object.keys(tenantPermissionDescriptions), "platform.admin"]) {
      expect(state.permissions.includes(permission), `Missing permission: ${permission}`);
    }
    for (const template of DEFAULT_SMS_TEMPLATES) expect(state.templates.includes(template.key), `Missing SMS template: ${template.key}`);
    expect(state.platformRoleGrants === 0, "No role should grant platform.admin.");
    await expectRolePermission("CEO", "customers.create");
    await expectRolePermission("CEO", "shipments.create");
    await expectRolePermission("CEO", "documents.upload");
    await expectRolePermission("CEO", "users.manage");
    await expectRolePermission("MANAGER", "shipments.create");
    await expectRolePermission("OPERATIONS", "customers.create");

    const countsAfterFirstCore = state.counts;
    allOutput.push(...(await runCapturedCore([])));
    state = await loadState();
    expect(state.counts.plans === countsAfterFirstCore.plans, "Second core run should not duplicate plans.");
    expect(state.counts.permissions === countsAfterFirstCore.permissions, "Second core run should not duplicate permissions.");
    expect(state.counts.roles === countsAfterFirstCore.roles, "Second core run should not duplicate roles.");
    expect(state.counts.role_permissions === countsAfterFirstCore.role_permissions, "Second core run should not duplicate role permissions.");
    expect(state.counts.sms_templates === countsAfterFirstCore.sms_templates, "Second core run should not duplicate SMS templates.");
    expect(state.counts.workflow_catalog_steps === countsAfterFirstCore.workflow_catalog_steps, "Second core run should not duplicate workflow catalog steps.");
    expect(state.counts.workflow_catalog_steps === SYSTEM_CUSTOMS_STEP_CATALOG.length, "Core seed should ensure all system customs catalog steps.");
    expect(state.counts.import_customs_template_steps === SYSTEM_CUSTOMS_STEP_CATALOG.length, "Core seed should ensure the import customs workflow has catalog steps.");

    allOutput.push(...(await runCapturedAdmin(["--dry-run"])));
    state = await loadState();
    expect(!state.admin, "Admin dry-run should not create the initial user.");

    allOutput.push(...(await runCapturedAdmin([])));
    state = await loadState();
    expect(state.admin?.email?.toLowerCase() === baseEnv.INITIAL_ADMIN_EMAIL.toLowerCase(), "Initial admin should exist.");
    expect(state.admin.role === "CEO", "Initial admin should have CEO role.");
    expect(state.admin.user_status === "active", "Initial admin should be active.");
    expect(state.admin.organization_status === "active", "Initial organization should be active.");
    expect(state.admin.owner_user_id === state.admin.user_id, "Initial organization should point to the admin owner.");
    expect(state.admin.membership_role === "owner", "Initial admin should have owner membership.");
    expect(state.admin.membership_status === "active", "Initial admin membership should be active.");
    expect(state.admin.plan_id === baseEnv.INITIAL_ORG_PLAN_ID, "Initial organization should have the selected plan.");
    expect(state.admin.subscription_plan_id === baseEnv.INITIAL_ORG_PLAN_ID, "Initial subscription should have the selected plan.");
    expect(["active", "trial", "trialing"].includes(state.admin.subscription_status), "Initial subscription should be active or trial.");

    await runFreshProductionVerification({
      databaseUrl,
      env: {
        ...process.env,
        ...baseEnv,
        DOCUMENT_STORAGE_MODE: "local",
        OBJECT_STORAGE_ENABLED: "false",
      },
      logger: { log: () => {} },
    });

    await exerciseFreshFlows();
    state = await loadState();
    expect(state.demo.demo_organizations === 0, "Production core seed should not create demo organizations.");
    expect(state.demo.demo_users === 0, "Production core seed should not create demo users.");
    expect(state.demo.demo_customers === 0, "Production core seed should not create demo customers.");
    expect(state.demo.demo_shipments === 0, "Production core seed should not create demo shipments.");
    expect(state.counts.documents === 0, "Production core flow test should not create demo documents.");

    assertNoSecretOutput(allOutput, [baseEnv.INITIAL_ADMIN_PASSWORD]);
    console.log(`Production core seed verifier passed for ${getDatabaseName(databaseUrl)}.`);
  } finally {
    await dropDatabase();
  }
}

main().catch((error) => {
  console.error("Production core seed verifier failed:", error.message || error);
  process.exit(1);
});
