// @ts-nocheck
import "dotenv/config";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import {
  ensureInitialOrganizationSubscription,
  ensureProductionCoreCatalog,
} from "./seed-production-core.ts";

const { Client } = pg;

const __filename = fileURLToPath(import.meta.url);

const BCRYPT_COST = 12;
const PLATFORM_ADMIN_PERMISSION = "platform.admin";

const tenantPermissionDescriptions = {
  "dashboard.view": "View tenant dashboard",
  "shipments.view_all": "View company shipments",
  "shipments.view_assigned": "View assigned shipments",
  "shipments.create": "Create shipments",
  "shipments.update": "Update shipments",
  "shipments.archive": "Archive shipments",
  "shipment_steps.update": "Update shipment steps",
  "customers.view": "View customers",
  "customers.create": "Create customers",
  "customers.update": "Update customers",
  "tasks.create": "Create tasks",
  "tasks.assign": "Assign tasks",
  "tasks.view_all": "View company tasks",
  "tasks.view_own": "View own tasks",
  "documents.upload": "Upload documents",
  "documents.view_all": "View company documents",
  "documents.view_related": "View related documents",
  "documents.archive": "Archive documents",
  "changes.view": "View company change log",
  "chat.use": "Use company chat",
  "chat.manage_groups": "Manage company chat groups",
  "users.manage": "Manage company users",
  "users.promote": "Promote company users",
  "cheques.manage": "Manage cheques",
  "compliance.manage": "Manage compliance meetings",
  "quotations.manage": "Manage quotations",
  "archive.view": "View company archive",
  "customer_access.manage": "Manage customer tracking access",
};

const ceoTenantPermissions = Object.keys(tenantPermissionDescriptions);

function isDirectRun() {
  return Boolean(process.argv[1]) && path.resolve(process.argv[1]) === __filename;
}

function fail(message: string) {
  const error = new Error(message);
  error.safe = true;
  throw error;
}

function safeErrorMessage(error: unknown) {
  return String(error?.message || error || "Unknown error")
    .replace(/postgres(?:ql)?:\/\/\S+/gi, "[redacted database url]")
    .replace(/DATABASE_URL=\S+/gi, "DATABASE_URL=[redacted]");
}

function readRequiredEnv(env: Record<string, string | undefined>, key: string, { trim = true } = {}) {
  const raw = env[key];
  const value = trim ? String(raw || "").trim() : String(raw || "");
  if (!value) {
    fail(`Missing required environment variable: ${key}`);
  }
  return value;
}

function normalizeEmail(value: string) {
  const email = String(value || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    fail("INITIAL_ADMIN_EMAIL must be a valid email address.");
  }
  return email;
}

function assertStrongPassword(password: string) {
  const missing = [];
  if (password.length < 12) missing.push("at least 12 characters");
  if (!/[a-z]/.test(password)) missing.push("a lowercase letter");
  if (!/[A-Z]/.test(password)) missing.push("an uppercase letter");
  if (!/\d/.test(password)) missing.push("a number");
  if (!/[^A-Za-z0-9]/.test(password)) missing.push("a symbol");
  if (missing.length) {
    fail(`INITIAL_ADMIN_PASSWORD is not strong enough; include ${missing.join(", ")}.`);
  }
}

function parseArgs(args: string[]) {
  const options = { dryRun: false, resetPassword: false };
  for (const arg of args) {
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--reset-password") options.resetPassword = true;
    else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else {
      fail(`Unknown option: ${arg}`);
    }
  }
  return options;
}

function permissionId(permissionKey: string) {
  return `perm-${permissionKey.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase()}`;
}

function roleId(role: string) {
  return `role-${role.toLowerCase().replace(/_/g, "-")}`;
}

function slugifyOrganizationName(name = "organization") {
  const base = String(name)
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || `organization-${crypto.randomUUID().slice(0, 8)}`;
}

async function tableExists(client: any, tableName: string) {
  const result = await client.query("SELECT to_regclass($1) AS name", [`public.${tableName}`]);
  return Boolean(result.rows[0]?.name);
}

async function ensurePermission(client: any, key: string, description: string) {
  await client.query(
    `INSERT INTO permissions (id, key, description)
     VALUES ($1, $2, $3)
     ON CONFLICT (key) DO UPDATE SET description = EXCLUDED.description`,
    [permissionId(key), key, description]
  );
  const result = await client.query("SELECT id, key FROM permissions WHERE key = $1 LIMIT 1", [key]);
  return result.rows[0];
}

async function ensureCeoRole(client: any) {
  await client.query(
    `INSERT INTO roles (id, name, description, updated_at)
     VALUES ($1, 'CEO', 'Full tenant owner access', NOW())
     ON CONFLICT (name) DO UPDATE SET
       description = EXCLUDED.description,
       updated_at = NOW()`,
    [roleId("CEO")]
  );

  const roleResult = await client.query("SELECT id FROM roles WHERE name = 'CEO' LIMIT 1");
  const role = roleResult.rows[0];
  if (!role) fail("Could not create or load CEO role.");

  for (const permissionKey of ceoTenantPermissions) {
    const permission = await ensurePermission(
      client,
      permissionKey,
      tenantPermissionDescriptions[permissionKey]
    );
    await client.query(
      `INSERT INTO role_permissions (role_id, permission_id)
       VALUES ($1, $2)
       ON CONFLICT (role_id, permission_id) DO NOTHING`,
      [role.id, permission.id]
    );
  }

  return role;
}

async function ensurePlatformAdminPermission(client: any) {
  return ensurePermission(
    client,
    PLATFORM_ADMIN_PERMISSION,
    "Access platform-wide administration APIs"
  );
}

async function findOrCreateOrganization(client: any, { organizationName, adminName, email, phone }: any) {
  const existingResult = await client.query(
    `SELECT *
     FROM organizations
     WHERE lower(name) = lower($1)
     ORDER BY created_at ASC
     LIMIT 1
     FOR UPDATE`,
    [organizationName]
  );

  if (existingResult.rows[0]) {
    const organization = existingResult.rows[0];
    await client.query(
      `UPDATE organizations
       SET status = 'active',
           contact_name = COALESCE(NULLIF(contact_name, ''), $2),
           contact_email = COALESCE(NULLIF(contact_email, ''), $3),
           contact_phone = COALESCE(NULLIF(contact_phone, ''), $4),
           approved_at = COALESCE(approved_at, NOW()),
           updated_at = NOW()
       WHERE id = $1`,
      [organization.id, adminName, email, phone || ""]
    );
    return { organization: { ...organization, status: "active" }, created: false };
  }

  const organizationId = crypto.randomUUID();
  const slug = await uniqueOrganizationSlug(client, organizationName);
  const result = await client.query(
    `INSERT INTO organizations (
       id, name, slug, status, contact_name, contact_email, contact_phone,
       notes, approved_at, legacy_data, created_at, updated_at
     )
     VALUES ($1, $2, $3, 'active', $4, $5, $6, $7, NOW(), $8::jsonb, NOW(), NOW())
     RETURNING *`,
    [
      organizationId,
      organizationName,
      slug,
      adminName,
      email,
      phone || "",
      "Created by production admin bootstrap.",
      JSON.stringify({ source: "production_admin_bootstrap" }),
    ]
  );
  return { organization: result.rows[0], created: true };
}

async function uniqueOrganizationSlug(client: any, organizationName: string) {
  const base = slugifyOrganizationName(organizationName);
  let candidate = base;
  for (let index = 2; index <= 20; index += 1) {
    const result = await client.query("SELECT 1 FROM organizations WHERE slug = $1 LIMIT 1", [candidate]);
    if (result.rowCount === 0) return candidate;
    candidate = `${base.slice(0, 42)}-${index}`;
  }
  return `${base.slice(0, 39)}-${crypto.randomUUID().slice(0, 8)}`;
}

async function findUserByEmailForUpdate(client: any, email: string) {
  const result = await client.query(
    `SELECT *
     FROM app_users
     WHERE lower(email) = lower($1)
     ORDER BY created_at ASC
     FOR UPDATE`,
    [email]
  );
  if (result.rowCount > 1) {
    fail("Multiple users match INITIAL_ADMIN_EMAIL case-insensitively; resolve duplicate emails before bootstrapping.");
  }
  return result.rows[0] || null;
}

async function createOrUpdateAdminUser(client: any, { email, password, name, phone, organization, resetPassword }: any) {
  const existing = await findUserByEmailForUpdate(client, email);
  const passwordHash = !existing || resetPassword ? await bcrypt.hash(password, BCRYPT_COST) : null;

  if (!existing) {
    const userId = crypto.randomUUID();
    const result = await client.query(
      `INSERT INTO app_users (
         id, organization_id, name, email, password_hash, role, avatar, is_online,
         department, status, phone, notification_preferences, created_at, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, 'CEO', NULL, FALSE, NULL, 'active', $6, '{}'::jsonb, NOW(), NOW())
       RETURNING *`,
      [userId, organization.id, name, email, passwordHash, phone || null]
    );
    return {
      user: result.rows[0],
      created: true,
      passwordChanged: true,
      passwordPreserved: false,
    };
  }

  if (existing.organization_id && existing.organization_id !== organization.id) {
    fail("INITIAL_ADMIN_EMAIL already belongs to a different organization. This app has a single primary organization per user, so the bootstrap refuses to move it.");
  }

  const values = [existing.id, organization.id, name, phone || null];
  let passwordSetSql = "";
  if (passwordHash) {
    values.push(passwordHash);
    passwordSetSql = `password_hash = $${values.length},`;
  }

  const result = await client.query(
    `UPDATE app_users
     SET organization_id = $2,
         name = $3,
         role = 'CEO',
         status = 'active',
         phone = COALESCE($4, phone),
         ${passwordSetSql}
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    values
  );

  return {
    user: result.rows[0],
    created: false,
    passwordChanged: Boolean(passwordHash),
    passwordPreserved: !passwordHash,
  };
}

async function ensureOrganizationOwner(client: any, organization: any, user: any) {
  let ownerUpdated = false;
  if (!organization.owner_user_id || organization.owner_user_id === user.id) {
    await client.query(
      `UPDATE organizations
       SET owner_user_id = $2,
           status = 'active',
           approved_at = COALESCE(approved_at, NOW()),
           updated_at = NOW()
       WHERE id = $1`,
      [organization.id, user.id]
    );
    ownerUpdated = organization.owner_user_id !== user.id;
  }

  return ownerUpdated;
}

async function ensureMembership(client: any, organizationId: string, userId: string) {
  const result = await client.query(
    `INSERT INTO organization_members (organization_id, user_id, role, status, joined_at)
     VALUES ($1, $2, 'owner', 'active', NOW())
     ON CONFLICT (organization_id, user_id) DO UPDATE SET
       role = 'owner',
       status = 'active'
     RETURNING *`,
    [organizationId, userId]
  );
  return result.rows[0];
}

async function grantPlatformAdmin(client: any, userId: string, permissionIdValue: string) {
  const before = await client.query(
    `SELECT 1
     FROM user_permissions
     WHERE user_id = $1
       AND permission_id = $2
     LIMIT 1`,
    [userId, permissionIdValue]
  );
  await client.query(
    `INSERT INTO user_permissions (user_id, permission_id, granted_by_id, reason)
     VALUES ($1, $2, NULL, 'Production bootstrap explicit platform.admin grant')
     ON CONFLICT (user_id, permission_id) DO NOTHING`,
    [userId, permissionIdValue]
  );
  return before.rowCount === 0;
}

async function writeAuditLog(client: any, summary: any) {
  const metadata = {
    source: "seed-production-admin",
    createdUser: summary.user.created,
    createdOrganization: summary.organization.created,
    passwordChanged: summary.user.passwordChanged,
    passwordPreserved: summary.user.passwordPreserved,
    platformAdminGranted: summary.platformAdminGranted,
    organizationOwnerUpdated: summary.organization.ownerUpdated,
  };
  const after = {
    userId: summary.user.id,
    organizationId: summary.organization.id,
    membershipRole: "owner",
    appRole: "CEO",
    permission: PLATFORM_ADMIN_PERMISSION,
  };

  const hasChangeLogs = await tableExists(client, "change_logs");
  const hasAuditLogs = await tableExists(client, "audit_logs");

  if (hasChangeLogs) {
    await client.query(
      `INSERT INTO change_logs (
         id, organization_id, actor_user_id, action, entity_type, entity_id,
         summary, after_json, created_at
       )
       VALUES ($1, $2, $3, 'production_admin.bootstrap', 'organization', $2, $4, $5::jsonb, NOW())`,
      [
        crypto.randomUUID(),
        summary.organization.id,
        summary.user.id,
        "Production initial admin bootstrap ran.",
        JSON.stringify({ ...after, metadata }),
      ]
    );
  }

  if (hasAuditLogs) {
    await client.query(
      `INSERT INTO audit_logs (
         id, organization_id, actor_user_id, actor_type, event_type, resource_type,
         resource_id, after_json, metadata_json, created_at
       )
       VALUES ($1, $2, $3, 'system', 'production_admin.bootstrap', 'organization', $2, $4::jsonb, $5::jsonb, NOW())`,
      [
        crypto.randomUUID(),
        summary.organization.id,
        summary.user.id,
        JSON.stringify(after),
        JSON.stringify(metadata),
      ]
    );
  }

  return hasChangeLogs || hasAuditLogs;
}

function printHelp(logger = console) {
  logger.log("Usage: npm run seed:production-admin -- [--dry-run] [--reset-password]");
  logger.log("");
  logger.log("Required env vars:");
  logger.log("  DATABASE_URL");
  logger.log("  INITIAL_ADMIN_EMAIL");
  logger.log("  INITIAL_ADMIN_PASSWORD");
  logger.log("  INITIAL_ADMIN_NAME");
  logger.log("  INITIAL_ORG_NAME");
  logger.log("Optional env var:");
  logger.log("  INITIAL_ADMIN_PHONE");
}

function printSummary(summary: any, logger = console) {
  const mode = summary.dryRun ? "dry-run; no changes committed" : "committed";
  const userAction = summary.dryRun
    ? summary.user.created
      ? "would create"
      : "would reuse"
    : summary.user.created
      ? "created"
      : "reused";
  const orgAction = summary.dryRun
    ? summary.organization.created
      ? "would create"
      : "would reuse"
    : summary.organization.created
      ? "created"
      : "reused";
  const passwordAction = summary.user.passwordChanged
    ? summary.dryRun
      ? summary.user.created
        ? "would set for new user"
        : "would reset by explicit flag"
      : summary.user.created
        ? "set for new user"
        : "reset by explicit flag"
    : "preserved";

  logger.log(`Production admin bootstrap completed (${mode}).`);
  logger.log(`Admin user ${userAction}: ${summary.user.email}`);
  logger.log(`Organization ${orgAction}: ${summary.organization.name}`);
  logger.log(`Tenant role ensured: CEO / owner membership`);
  logger.log(`Platform permission ensured: ${PLATFORM_ADMIN_PERMISSION}`);
  if (summary.subscription?.created) {
    logger.log(`Initial subscription created: ${summary.subscription.planId}`);
  } else if (summary.subscription?.skipped) {
    logger.log(`Initial subscription skipped: ${summary.subscription.reason}`);
  } else {
    logger.log(`Initial subscription ensured: ${summary.subscription?.planId || "existing"}`);
  }
  logger.log(`Password action: ${passwordAction}`);
}

export async function runProductionAdminBootstrap({
  env = process.env,
  args = process.argv.slice(2),
  databaseUrl = env.DATABASE_URL,
  logger = console,
} = {}) {
  const options = parseArgs(args);
  if (options.help) {
    printHelp(logger);
    return { help: true };
  }

  if (!databaseUrl) {
    fail("Missing required environment variable: DATABASE_URL");
  }

  const email = normalizeEmail(readRequiredEnv(env, "INITIAL_ADMIN_EMAIL"));
  const password = readRequiredEnv(env, "INITIAL_ADMIN_PASSWORD", { trim: false });
  assertStrongPassword(password);
  const name = readRequiredEnv(env, "INITIAL_ADMIN_NAME");
  const organizationName = readRequiredEnv(env, "INITIAL_ORG_NAME");
  const phone = String(env.INITIAL_ADMIN_PHONE || "").trim() || null;

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    await client.query("BEGIN");

    const coreCatalog = await ensureProductionCoreCatalog(client, {
      env,
      includeInitialOrgSubscription: false,
    });
    const ceoRole = await ensureCeoRole(client);
    const platformPermission = await ensurePlatformAdminPermission(client);
    const organizationResult = await findOrCreateOrganization(client, {
      organizationName,
      adminName: name,
      email,
      phone,
    });
    const userResult = await createOrUpdateAdminUser(client, {
      email,
      password,
      name,
      phone,
      organization: organizationResult.organization,
      resetPassword: options.resetPassword,
    });
    const ownerUpdated = await ensureOrganizationOwner(
      client,
      organizationResult.organization,
      userResult.user
    );
    await ensureMembership(client, organizationResult.organization.id, userResult.user.id);
    const platformAdminGranted = await grantPlatformAdmin(
      client,
      userResult.user.id,
      platformPermission.id
    );
    const subscription = await ensureInitialOrganizationSubscription(client, {
      organization: organizationResult.organization,
      env,
    });

    const summary = {
      dryRun: options.dryRun,
      resetPassword: options.resetPassword,
      coreCatalog: {
        plans: coreCatalog.plans,
        roles: coreCatalog.roles,
        permissions: coreCatalog.permissions.length,
        smsTemplates: coreCatalog.smsTemplates.length,
      },
      user: {
        id: userResult.user.id,
        email: userResult.user.email,
        created: userResult.created,
        passwordChanged: userResult.passwordChanged,
        passwordPreserved: userResult.passwordPreserved,
      },
      organization: {
        id: organizationResult.organization.id,
        name: organizationResult.organization.name,
        created: organizationResult.created,
        ownerUpdated,
      },
      ceoRoleId: ceoRole.id,
      platformAdminGranted,
      subscription,
      auditWritten: false,
    };

    summary.auditWritten = await writeAuditLog(client, summary);

    if (options.dryRun) {
      await client.query("ROLLBACK");
    } else {
      await client.query("COMMIT");
    }

    printSummary(summary, logger);
    return summary;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

if (isDirectRun()) {
  runProductionAdminBootstrap().catch((error) => {
    console.error(`Production admin bootstrap failed: ${safeErrorMessage(error)}`);
    process.exit(1);
  });
}
