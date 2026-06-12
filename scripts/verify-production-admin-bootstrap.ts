// @ts-nocheck
import "dotenv/config";
import bcrypt from "bcryptjs";
import { spawn } from "node:child_process";
import pg from "pg";
import { runProductionAdminBootstrap } from "./seed-production-admin.ts";

const { Client } = pg;

const defaultDatabaseUrl =
  "postgres://postgres@localhost:5432/logisticplus_production_admin_bootstrap_test";
const databaseUrl = process.env.PRODUCTION_ADMIN_BOOTSTRAP_TEST_DATABASE_URL || defaultDatabaseUrl;
const adminUrl = process.env.POSTGRES_ADMIN_URL || withDatabase(databaseUrl, "postgres");
const keepDatabase = process.env.KEEP_PRODUCTION_ADMIN_BOOTSTRAP_TEST_DB === "true";

const baseEnv = {
  DATABASE_URL: databaseUrl,
  INITIAL_ADMIN_EMAIL: `bootstrap-admin-${Date.now()}@example.test`,
  INITIAL_ADMIN_PASSWORD: "StrongBootstrap!2026",
  INITIAL_ADMIN_NAME: "Bootstrap Admin",
  INITIAL_ORG_NAME: `Bootstrap Organization ${Date.now()}`,
  INITIAL_ADMIN_PHONE: "+989123456789",
};

function withDatabase(connectionString: string, databaseName: string) {
  const parsed = new URL(connectionString);
  parsed.pathname = `/${databaseName}`;
  return parsed.toString();
}

function getDatabaseName(connectionString: string) {
  const parsed = new URL(connectionString);
  const databaseName = parsed.pathname.replace(/^\//, "");
  if (!/^[a-zA-Z0-9_]+$/.test(databaseName)) {
    throw new Error(`Unsafe bootstrap test database name: ${databaseName}`);
  }
  const lowered = databaseName.toLowerCase();
  if (!lowered.includes("test") || !lowered.includes("bootstrap")) {
    throw new Error(`Refusing to reset non-bootstrap test database: ${databaseName}`);
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

async function loadBootstrapState(email: string, organizationName: string) {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const result = await client.query(
      `SELECT
         (SELECT COUNT(*)::int FROM app_users WHERE lower(email) = lower($1)) AS users,
         (SELECT COUNT(*)::int FROM organizations WHERE lower(name) = lower($2)) AS organizations,
         (SELECT COUNT(*)::int
          FROM organization_members om
          JOIN app_users u ON u.id = om.user_id
          JOIN organizations o ON o.id = om.organization_id
          WHERE lower(u.email) = lower($1)
            AND lower(o.name) = lower($2)
            AND om.role = 'owner'
            AND om.status = 'active') AS memberships,
         (SELECT COUNT(*)::int FROM permissions WHERE key = 'platform.admin') AS platform_permissions,
         (SELECT COUNT(*)::int
          FROM user_permissions up
          JOIN permissions p ON p.id = up.permission_id
          JOIN app_users u ON u.id = up.user_id
          WHERE lower(u.email) = lower($1)
            AND p.key = 'platform.admin') AS platform_grants,
         (SELECT COUNT(*)::int
          FROM role_permissions rp
          JOIN permissions p ON p.id = rp.permission_id
          JOIN roles r ON r.id = rp.role_id
          WHERE r.name = 'CEO'
            AND p.key = 'platform.admin') AS ceo_platform_role_grants,
         (SELECT COUNT(*)::int
          FROM role_permissions rp
          JOIN permissions p ON p.id = rp.permission_id
          JOIN roles r ON r.id = rp.role_id
          WHERE r.name = 'CEO'
            AND p.key = 'dashboard.view') AS ceo_dashboard_grants,
         (SELECT COUNT(*)::int
          FROM audit_logs
          WHERE event_type = 'production_admin.bootstrap') AS audit_events`,
      [email, organizationName]
    );
    const userResult = await client.query(
      `SELECT id, organization_id, email, password_hash, role, status
       FROM app_users
       WHERE lower(email) = lower($1)
       LIMIT 1`,
      [email]
    );
    const organizationResult = await client.query(
      `SELECT id, name, status, owner_user_id
       FROM organizations
       WHERE lower(name) = lower($1)
       LIMIT 1`,
      [organizationName]
    );
    return {
      counts: result.rows[0],
      user: userResult.rows[0] || null,
      organization: organizationResult.rows[0] || null,
    };
  } finally {
    await client.end();
  }
}

async function runCaptured(args: string[], envOverrides = {}) {
  const capture = createCaptureLogger();
  await runProductionAdminBootstrap({
    args,
    env: { ...process.env, ...baseEnv, ...envOverrides },
    databaseUrl,
    logger: capture.logger,
  });
  return capture.lines;
}

function assertNoSecretOutput(lines: string[], secrets: string[]) {
  const output = lines.join("\n");
  for (const secret of secrets) {
    expect(!output.includes(secret), "Bootstrap output leaked a password.");
  }
}

async function main() {
  const allOutput: string[] = [];
  const secondPassword = "DifferentBootstrap!2027";
  const resetPassword = "ResetBootstrap!2028";

  await resetDatabase();
  try {
    await runMigrationCommand();

    allOutput.push(...(await runCaptured([])));
    let state = await loadBootstrapState(baseEnv.INITIAL_ADMIN_EMAIL, baseEnv.INITIAL_ORG_NAME);
    expect(state.counts.users === 1, "Fresh bootstrap should create exactly one matching user.");
    expect(state.counts.organizations === 1, "Fresh bootstrap should create exactly one matching organization.");
    expect(state.counts.memberships === 1, "Fresh bootstrap should create one active owner membership.");
    expect(state.counts.platform_permissions === 1, "platform.admin permission should exist once.");
    expect(state.counts.platform_grants === 1, "User should receive one direct platform.admin grant.");
    expect(state.counts.ceo_platform_role_grants === 0, "CEO role must not grant platform.admin.");
    expect(state.counts.ceo_dashboard_grants === 1, "CEO role should grant dashboard.view tenant access.");
    expect(state.user.role === "CEO", "Bootstrap user should have CEO app role.");
    expect(state.user.status === "active", "Bootstrap user should be active.");
    expect(state.organization.status === "active", "Bootstrap organization should be active.");
    expect(state.organization.owner_user_id === state.user.id, "Bootstrap organization should point to the admin owner.");
    expect(/^\$2[aby]\$\d{2}\$/.test(state.user.password_hash), "Password hash should use bcrypt format.");
    expect(await bcrypt.compare(baseEnv.INITIAL_ADMIN_PASSWORD, state.user.password_hash), "Initial password should verify.");

    const firstHash = state.user.password_hash;
    allOutput.push(...(await runCaptured([])));
    state = await loadBootstrapState(baseEnv.INITIAL_ADMIN_EMAIL, baseEnv.INITIAL_ORG_NAME);
    expect(state.counts.users === 1, "Second run should not duplicate the user.");
    expect(state.counts.organizations === 1, "Second run should not duplicate the organization.");
    expect(state.counts.memberships === 1, "Second run should not duplicate the membership.");
    expect(state.counts.platform_grants === 1, "Second run should not duplicate platform.admin grant.");
    expect(state.user.password_hash === firstHash, "Second run should preserve existing password hash.");

    allOutput.push(...(await runCaptured([], { INITIAL_ADMIN_PASSWORD: secondPassword })));
    state = await loadBootstrapState(baseEnv.INITIAL_ADMIN_EMAIL, baseEnv.INITIAL_ORG_NAME);
    expect(state.user.password_hash === firstHash, "Existing password should not change without --reset-password.");
    expect(!(await bcrypt.compare(secondPassword, state.user.password_hash)), "New password should not verify without reset flag.");

    allOutput.push(...(await runCaptured(["--reset-password"], { INITIAL_ADMIN_PASSWORD: resetPassword })));
    state = await loadBootstrapState(baseEnv.INITIAL_ADMIN_EMAIL, baseEnv.INITIAL_ORG_NAME);
    expect(state.user.password_hash !== firstHash, "Password hash should change with --reset-password.");
    expect(await bcrypt.compare(resetPassword, state.user.password_hash), "Reset password should verify after reset flag.");

    const dryRunEnv = {
      INITIAL_ADMIN_EMAIL: `dry-run-${Date.now()}@example.test`,
      INITIAL_ADMIN_PASSWORD: "DryRunBootstrap!2029",
      INITIAL_ADMIN_NAME: "Dry Run Admin",
      INITIAL_ORG_NAME: `Dry Run Organization ${Date.now()}`,
    };
    allOutput.push(...(await runCaptured(["--dry-run"], dryRunEnv)));
    const dryRunState = await loadBootstrapState(dryRunEnv.INITIAL_ADMIN_EMAIL, dryRunEnv.INITIAL_ORG_NAME);
    expect(dryRunState.counts.users === 0, "Dry-run should not commit a new user.");
    expect(dryRunState.counts.organizations === 0, "Dry-run should not commit a new organization.");

    assertNoSecretOutput(allOutput, [
      baseEnv.INITIAL_ADMIN_PASSWORD,
      secondPassword,
      resetPassword,
      dryRunEnv.INITIAL_ADMIN_PASSWORD,
    ]);

    console.log(`Production admin bootstrap verifier passed for ${getDatabaseName(databaseUrl)}.`);
  } finally {
    await dropDatabase();
  }
}

main().catch((error) => {
  console.error("Production admin bootstrap verifier failed:", error.message || error);
  process.exit(1);
});
