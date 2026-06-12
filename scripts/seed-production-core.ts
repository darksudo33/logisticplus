// @ts-nocheck
import "dotenv/config";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { pricingPlans } from "../src/lib/pricing.ts";
import { DEFAULT_SMS_TEMPLATES } from "../src/server/sms-templates.js";
import {
  PREDEFINED_SHIPMENT_TYPE_WORKFLOW_MAPPINGS,
  SEEDED_SHIPMENT_WORKFLOW_TEMPLATES,
} from "../src/shared/shipment-workflow-template-presets.js";
import { SYSTEM_CUSTOMS_STEP_CATALOG } from "../src/shared/shipment-workflow-step-catalog.js";

const { Client } = pg;

const __filename = fileURLToPath(import.meta.url);
const DEFAULT_INITIAL_PLAN_ID = "enterprise";
const DEFAULT_INITIAL_BILLING_CYCLE = "annual";
const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trial", "trialing"]);

export const tenantPermissionDescriptions = {
  "dashboard.view": "View tenant dashboard",
  "shipments.view_all": "View company shipments",
  "shipments.view_assigned": "View assigned shipments",
  "shipments.create": "Create shipments",
  "shipments.update": "Update shipments",
  "shipments.archive": "Archive shipments",
  "shipment_forms.manage": "Manage shipment type form templates",
  "shipment_workflows.manage": "Manage shipment workflow templates",
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
  "chat.media.view": "View company chat media library",
  "chat.media.delete": "Delete company chat media files",
  "users.manage": "Manage company users",
  "users.promote": "Promote company users",
  "cheques.manage": "Manage cheques",
  "compliance.manage": "Manage compliance meetings",
  "quotations.manage": "Manage quotations",
  "archive.view": "View company archive",
  "customer_access.manage": "Manage customer tracking access",
};

export const platformPermissionDescriptions = {
  "platform.admin": "Access platform-wide administration APIs",
};

const allTenantPermissions = Object.keys(tenantPermissionDescriptions);
const ceoOnlyTenantPermissions = new Set([
  "chat.media.view",
  "chat.media.delete",
  "shipment_forms.manage",
  "shipment_workflows.manage",
]);
const companyOperationalPermissions = [
  "archive.view",
  "changes.view",
  "chat.use",
  "compliance.manage",
  "customer_access.manage",
  "customers.create",
  "customers.update",
  "customers.view",
  "documents.archive",
  "documents.upload",
  "documents.view_all",
  "documents.view_related",
  "quotations.manage",
  "shipment_steps.update",
  "shipments.archive",
  "shipments.create",
  "shipments.update",
  "shipments.view_all",
  "shipments.view_assigned",
  "tasks.assign",
  "tasks.create",
  "tasks.view_all",
  "tasks.view_own",
];

export const rolePermissions = {
  CEO: allTenantPermissions,
  MANAGER: allTenantPermissions.filter((key) => key !== "users.promote" && !ceoOnlyTenantPermissions.has(key)),
  OPERATIONS: ["dashboard.view", ...companyOperationalPermissions],
  CUSTOMER_SERVICE: ["dashboard.view", ...companyOperationalPermissions],
  FINANCE: ["dashboard.view", "cheques.manage", ...companyOperationalPermissions],
  QUOTATION_MANAGER: ["dashboard.view", ...companyOperationalPermissions],
  COMPLIANCE_STAFF: ["dashboard.view", ...companyOperationalPermissions],
  EMPLOYEE: ["dashboard.view", ...companyOperationalPermissions],
  CUSTOMER_VIEWER: [],
};

export const roleDescriptions = {
  CEO: "Full tenant owner access",
  MANAGER: "Operational management access",
  OPERATIONS: "Shipment operations access",
  CUSTOMER_SERVICE: "Customer service access",
  FINANCE: "Finance and cheque access",
  QUOTATION_MANAGER: "Quotation management access",
  COMPLIANCE_STAFF: "Compliance meeting access",
  EMPLOYEE: "Assigned work access",
  CUSTOMER_VIEWER: "External customer-safe access",
};

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

function parseArgs(args: string[]) {
  const options = { dryRun: false, help: false };
  for (const arg of args) {
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else fail(`Unknown option: ${arg}`);
  }
  return options;
}

function permissionId(permissionKey: string) {
  return `perm-${permissionKey.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase()}`;
}

function roleId(role: string) {
  return `role-${role.toLowerCase().replace(/_/g, "-")}`;
}

function asJson(value: unknown) {
  return JSON.stringify(value ?? {});
}

function asJsonArray(value: unknown) {
  return JSON.stringify(Array.isArray(value) ? value : []);
}

function clean(value: unknown) {
  return String(value || "").trim();
}

function normalizeEmail(value: unknown) {
  return clean(value).toLowerCase();
}

function selectedPlanId(env = process.env) {
  return clean(env.INITIAL_ORG_PLAN_ID) || DEFAULT_INITIAL_PLAN_ID;
}

function selectedBillingCycle(env = process.env) {
  const billingCycle = clean(env.INITIAL_ORG_BILLING_CYCLE).toLowerCase();
  return billingCycle === "monthly" ? "monthly" : DEFAULT_INITIAL_BILLING_CYCLE;
}

function selectedSubscriptionStatus(env = process.env) {
  const status = clean(env.INITIAL_ORG_SUBSCRIPTION_STATUS).toLowerCase();
  return ACTIVE_SUBSCRIPTION_STATUSES.has(status) ? status : "active";
}

export function planRows() {
  return pricingPlans.map((plan, index) => ({
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
  }));
}

export async function ensurePermission(client: any, key: string, description: string) {
  await client.query(
    `INSERT INTO permissions (id, key, description)
     VALUES ($1, $2, $3)
     ON CONFLICT (key) DO UPDATE SET description = EXCLUDED.description`,
    [permissionId(key), key, description]
  );
  const result = await client.query("SELECT id, key FROM permissions WHERE key = $1 LIMIT 1", [key]);
  if (!result.rows[0]) fail(`Permission was not created: ${key}`);
  return result.rows[0];
}

async function ensureRole(client: any, role: string, description: string) {
  await client.query(
    `INSERT INTO roles (id, name, description, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (name) DO UPDATE SET
       description = EXCLUDED.description,
       updated_at = NOW()`,
    [roleId(role), role, description]
  );
  const result = await client.query("SELECT id, name FROM roles WHERE name = $1 LIMIT 1", [role]);
  if (!result.rows[0]) fail(`Role was not created: ${role}`);
  return result.rows[0];
}

async function ensurePlans(client: any) {
  const rows = planRows();
  for (const row of rows) {
    await client.query(
      `INSERT INTO subscription_plans (
         id, name, description, monthly_price_irr, annual_price_irr,
         limits, features, is_public, sort_order, updated_at
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
  return rows.map((row) => row.id);
}

async function ensurePermissionsAndRoles(client: any) {
  const permissionDescriptions = {
    ...tenantPermissionDescriptions,
    ...platformPermissionDescriptions,
  };
  for (const [key, description] of Object.entries(permissionDescriptions)) {
    await ensurePermission(client, key, description);
  }

  for (const [role, description] of Object.entries(roleDescriptions)) {
    const roleRow = await ensureRole(client, role, description);
    for (const permissionKey of rolePermissions[role] || []) {
      const permission = await ensurePermission(
        client,
        permissionKey,
        permissionDescriptions[permissionKey] || permissionKey
      );
      await client.query(
        `INSERT INTO role_permissions (role_id, permission_id)
         VALUES ($1, $2)
         ON CONFLICT (role_id, permission_id) DO NOTHING`,
        [roleRow.id, permission.id]
      );
    }
  }

  return {
    permissions: Object.keys(permissionDescriptions),
    roles: Object.keys(roleDescriptions),
  };
}

async function ensureSmsTemplates(client: any) {
  for (const template of DEFAULT_SMS_TEMPLATES) {
    await client.query(
      `INSERT INTO sms_templates (key, label, body, enabled, updated_at)
       VALUES ($1, $2, $3, TRUE, NOW())
       ON CONFLICT (key) DO UPDATE SET
         label = EXCLUDED.label`,
      [template.key, template.label, template.body]
    );
  }
  return DEFAULT_SMS_TEMPLATES.map((template) => template.key);
}

function slug(value: unknown) {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || crypto.randomUUID();
}

async function ensureWorkflowStepCatalog(client: any) {
  for (const step of SYSTEM_CUSTOMS_STEP_CATALOG) {
    await client.query(
      `INSERT INTO shipment_workflow_step_catalog (
         id, organization_id, code, title, title_fa, description, category, stage_key, stage_title_fa,
         default_order, default_required, default_customer_visible, default_internal_only,
         default_checklist, default_required_documents, default_form_fields, metadata, is_system,
         created_at, updated_at
       )
       VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
         $13::jsonb, $14::jsonb, $15::jsonb, $16::jsonb, TRUE, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET
         code = EXCLUDED.code,
         title = EXCLUDED.title,
         title_fa = EXCLUDED.title_fa,
         description = EXCLUDED.description,
         category = EXCLUDED.category,
         stage_key = EXCLUDED.stage_key,
         stage_title_fa = EXCLUDED.stage_title_fa,
         default_order = EXCLUDED.default_order,
         default_required = EXCLUDED.default_required,
         default_customer_visible = EXCLUDED.default_customer_visible,
         default_internal_only = EXCLUDED.default_internal_only,
         default_checklist = EXCLUDED.default_checklist,
         default_required_documents = EXCLUDED.default_required_documents,
         default_form_fields = EXCLUDED.default_form_fields,
         metadata = EXCLUDED.metadata,
         is_system = TRUE,
         archived_at = NULL,
         archived_by_id = NULL,
         updated_at = NOW()`,
      [
        step.id,
        step.code,
        step.title,
        step.titleFa,
        step.description || "",
        step.category,
        step.stageKey,
        step.stageTitleFa,
        step.defaultOrder,
        step.defaultRequired,
        step.defaultCustomerVisible,
        step.defaultInternalOnly,
        asJsonArray(step.defaultChecklist),
        asJsonArray(step.defaultRequiredDocuments),
        asJsonArray(step.defaultFormFields),
        asJson(step.metadata || {}),
      ]
    );
  }
  return SYSTEM_CUSTOMS_STEP_CATALOG.length;
}

async function ensureWorkflowTemplates(client: any) {
  for (const template of SEEDED_SHIPMENT_WORKFLOW_TEMPLATES) {
    await client.query(
      `INSERT INTO shipment_workflow_templates (
         id, organization_id, code, shipment_direction, transport_mode, shipment_type_hint,
         title_fa, title_en, description, is_system, is_active, version, published_at, created_at, updated_at
       )
       VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, $8, TRUE, $9, $10, NOW(), NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET
         code = EXCLUDED.code,
         shipment_direction = EXCLUDED.shipment_direction,
         transport_mode = EXCLUDED.transport_mode,
         shipment_type_hint = EXCLUDED.shipment_type_hint,
         title_fa = EXCLUDED.title_fa,
         title_en = EXCLUDED.title_en,
         description = EXCLUDED.description,
         is_system = TRUE,
         is_active = EXCLUDED.is_active,
         archived_at = NULL,
         archived_by_id = NULL,
         archived_reason = NULL,
         updated_at = NOW()`,
      [
        template.id,
        template.code,
        template.shipmentDirection || null,
        template.transportMode || null,
        template.shipmentTypeHint || template.shipmentTypeCode || null,
        template.titleFa,
        template.titleEn || "",
        template.description || "",
        template.isActive !== false,
        template.version || 1,
      ]
    );

    const phaseIds = new Map<string, string>();
    for (const phase of template.phases || []) {
      const phaseId = `${template.id}-phase-${slug(phase.phaseKey)}`;
      const result = await client.query(
        `INSERT INTO shipment_workflow_template_phases (
           id, template_id, phase_key, label_fa, label_en, sort_order, is_visible, created_at, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
         ON CONFLICT (template_id, phase_key) DO UPDATE SET
           label_fa = EXCLUDED.label_fa,
           label_en = EXCLUDED.label_en,
           sort_order = EXCLUDED.sort_order,
           is_visible = EXCLUDED.is_visible,
           updated_at = NOW()
         RETURNING id`,
        [
          phaseId,
          template.id,
          phase.phaseKey,
          phase.labelFa,
          phase.labelEn || "",
          phase.sortOrder || phase.order || 0,
          phase.isVisible !== false,
        ]
      );
      phaseIds.set(phase.phaseKey, result.rows[0].id);
    }

    const activeStepKeys = new Set<string>();
    for (const step of template.steps || []) {
      const phaseId = phaseIds.get(step.phaseKey || step.phaseId);
      if (!phaseId) continue;
      activeStepKeys.add(step.stepKey);
      await client.query(
        `INSERT INTO shipment_workflow_template_steps (
           id, template_id, phase_id, phase_key, step_key, catalog_step_id, label_fa, label_en, public_label,
           sort_order, is_required, is_visible, is_customer_visible, role_suggestion,
           expected_duration_hours, task_policy_json, checklist_json, expected_documents_json,
           expected_form_fields_json, next_step_rules_json, visibility_rule_json, created_at, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
           $15, $16::jsonb, $17::jsonb, $18::jsonb, $19::jsonb, $20::jsonb, $21::jsonb, NOW(), NOW())
         ON CONFLICT (template_id, step_key) WHERE archived_at IS NULL DO UPDATE SET
           phase_id = EXCLUDED.phase_id,
           phase_key = EXCLUDED.phase_key,
           catalog_step_id = EXCLUDED.catalog_step_id,
           label_fa = EXCLUDED.label_fa,
           label_en = EXCLUDED.label_en,
           public_label = EXCLUDED.public_label,
           sort_order = EXCLUDED.sort_order,
           is_required = EXCLUDED.is_required,
           is_visible = EXCLUDED.is_visible,
           is_customer_visible = EXCLUDED.is_customer_visible,
           role_suggestion = EXCLUDED.role_suggestion,
           expected_duration_hours = EXCLUDED.expected_duration_hours,
           task_policy_json = EXCLUDED.task_policy_json,
           checklist_json = EXCLUDED.checklist_json,
           expected_documents_json = EXCLUDED.expected_documents_json,
           expected_form_fields_json = EXCLUDED.expected_form_fields_json,
           next_step_rules_json = EXCLUDED.next_step_rules_json,
           visibility_rule_json = EXCLUDED.visibility_rule_json,
           archived_at = NULL,
           updated_at = NOW()`,
        [
          `${template.id}-step-${slug(step.stepKey)}`,
          template.id,
          phaseId,
          step.phaseKey || step.phaseId,
          step.stepKey,
          step.catalogStepId || null,
          step.labelFa,
          step.labelEn || "",
          step.publicLabel || step.labelFa,
          step.sortOrder || step.order || 0,
          step.isRequired !== false,
          step.isVisible !== false,
          step.isCustomerVisible !== false,
          step.roleSuggestion || null,
          step.expectedDurationHours ?? null,
          asJson(step.taskPolicy || { mode: "suggested" }),
          asJsonArray(step.checklist),
          asJsonArray(step.expectedDocuments),
          asJsonArray(step.expectedFormFields),
          asJson(step.nextStepRules || {}),
          asJson(step.visibilityRule || {}),
        ]
      );
    }

    if (template.id === "swt-ir-import-customs-v1") {
      await client.query(
        `UPDATE shipment_workflow_template_steps
         SET archived_at = COALESCE(archived_at, NOW()),
             is_visible = FALSE,
             is_customer_visible = FALSE,
             updated_at = NOW()
         WHERE template_id = $1
           AND archived_at IS NULL
           AND step_key <> ALL($2::text[])`,
        [template.id, [...activeStepKeys]]
      );
      await client.query(
        `UPDATE shipment_workflow_template_phases
         SET is_visible = FALSE,
             updated_at = NOW()
         WHERE template_id = $1
           AND phase_key <> ALL($2::text[])`,
        [template.id, (template.phases || []).map((phase) => phase.phaseKey)]
      );
    }
  }

  for (const mapping of PREDEFINED_SHIPMENT_TYPE_WORKFLOW_MAPPINGS) {
    await client.query(
      `INSERT INTO shipment_type_workflow_templates (
         id, organization_id, shipment_type_code, workflow_template_id,
         workflow_template_code, workflow_template_version, created_at, updated_at
       )
       VALUES ($1, NULL, $2, $3, $4, $5, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET
         workflow_template_id = EXCLUDED.workflow_template_id,
         workflow_template_code = EXCLUDED.workflow_template_code,
         workflow_template_version = EXCLUDED.workflow_template_version,
         archived_at = NULL,
         updated_at = NOW()`,
      [
        `stwt-global-${mapping.shipmentTypeCode.toLowerCase().replace(/_/g, "-")}`,
        mapping.shipmentTypeCode,
        mapping.templateId,
        mapping.workflowTemplateCode,
        mapping.workflowTemplateVersion,
      ]
    );
  }

  return {
    catalogSteps: SYSTEM_CUSTOMS_STEP_CATALOG.length,
    workflowTemplates: SEEDED_SHIPMENT_WORKFLOW_TEMPLATES.length,
    workflowMappings: PREDEFINED_SHIPMENT_TYPE_WORKFLOW_MAPPINGS.length,
  };
}

async function findInitialOrganization(client: any, env = process.env) {
  const organizationName = clean(env.INITIAL_ORG_NAME);
  const adminEmail = normalizeEmail(env.INITIAL_ADMIN_EMAIL);

  if (organizationName) {
    const byName = await client.query(
      `SELECT *
       FROM organizations
       WHERE lower(name) = lower($1)
       ORDER BY created_at ASC
       LIMIT 1
       FOR UPDATE`,
      [organizationName]
    );
    if (byName.rows[0]) return byName.rows[0];
  }

  if (adminEmail) {
    const byAdmin = await client.query(
      `SELECT o.*
       FROM app_users u
       JOIN organizations o ON o.id = u.organization_id
       WHERE lower(u.email) = lower($1)
       ORDER BY o.created_at ASC
       LIMIT 1
       FOR UPDATE`,
      [adminEmail]
    );
    if (byAdmin.rows[0]) return byAdmin.rows[0];
  }

  return null;
}

export async function ensureInitialOrganizationSubscription(
  client: any,
  { organization = null, env = process.env } = {}
) {
  const targetOrganization = organization || await findInitialOrganization(client, env);
  if (!targetOrganization?.id) {
    return { skipped: true, reason: "initial_organization_not_found" };
  }

  const planId = selectedPlanId(env);
  const plan = await client.query("SELECT id FROM subscription_plans WHERE id = $1 LIMIT 1", [planId]);
  if (!plan.rows[0]) {
    fail(`Initial organization plan was not found: ${planId}. Run seed:production-core first.`);
  }

  const existing = await client.query(
    `SELECT *
     FROM organization_subscriptions
     WHERE organization_id = $1
     ORDER BY created_at DESC
     LIMIT 1
     FOR UPDATE`,
    [targetOrganization.id]
  );

  await client.query(
    `UPDATE organizations
     SET plan_id = COALESCE(plan_id, $2),
         status = CASE WHEN status IN ('pending_review', 'pending_payment', 'payment_failed') THEN 'active' ELSE status END,
         approved_at = COALESCE(approved_at, NOW()),
         updated_at = NOW()
     WHERE id = $1`,
    [targetOrganization.id, planId]
  );

  if (existing.rows[0]) {
    return {
      skipped: false,
      created: false,
      organizationId: targetOrganization.id,
      subscriptionId: existing.rows[0].id,
      planId: existing.rows[0].plan_id,
      status: existing.rows[0].status,
    };
  }

  const billingCycle = selectedBillingCycle(env);
  const status = selectedSubscriptionStatus(env);
  const subscriptionId = `sub-${targetOrganization.id}`;
  const periodEndSql = billingCycle === "annual" ? "NOW() + INTERVAL '1 year'" : "NOW() + INTERVAL '1 month'";

  await client.query(
    `INSERT INTO organization_subscriptions (
       id, organization_id, plan_id, status, billing_cycle, current_period_start,
       current_period_end, activated_at, created_at, updated_at
     )
     VALUES ($1, $2, $3, $4, $5, NOW(), ${periodEndSql}, NOW(), NOW(), NOW())
     ON CONFLICT (id) DO NOTHING`,
    [subscriptionId, targetOrganization.id, planId, status, billingCycle]
  );

  return {
    skipped: false,
    created: true,
    organizationId: targetOrganization.id,
    subscriptionId,
    planId,
    status,
    billingCycle,
  };
}

export async function ensureProductionCoreCatalog(client: any, { env = process.env, includeInitialOrgSubscription = true } = {}) {
  const plans = await ensurePlans(client);
  const access = await ensurePermissionsAndRoles(client);
  const smsTemplates = await ensureSmsTemplates(client);
  const workflowStepCatalog = await ensureWorkflowStepCatalog(client);
  const workflowTemplates = await ensureWorkflowTemplates(client);
  const initialSubscription = includeInitialOrgSubscription
    ? await ensureInitialOrganizationSubscription(client, { env })
    : { skipped: true, reason: "disabled" };

  return {
    plans,
    permissions: access.permissions,
    roles: access.roles,
    smsTemplates,
    workflowStepCatalog,
    workflowTemplates,
    initialSubscription,
  };
}

function printHelp(logger = console) {
  logger.log("Usage: npm run seed:production-core -- [--dry-run]");
  logger.log("");
  logger.log("Required env var:");
  logger.log("  DATABASE_URL");
  logger.log("Optional env vars for initial organization subscription:");
  logger.log("  INITIAL_ADMIN_EMAIL");
  logger.log("  INITIAL_ORG_NAME");
  logger.log("  INITIAL_ORG_PLAN_ID (default: enterprise)");
  logger.log("  INITIAL_ORG_BILLING_CYCLE (monthly or annual; default: annual)");
}

function printSummary(summary: any, logger = console) {
  const mode = summary.dryRun ? "dry-run; no changes committed" : "committed";
  logger.log(`Production core seed completed (${mode}).`);
  logger.log(`Plans ensured: ${summary.plans.join(", ")}`);
  logger.log(`Permissions ensured: ${summary.permissions.length}`);
  logger.log(`Roles ensured: ${summary.roles.join(", ")}`);
  logger.log(`SMS templates ensured: ${summary.smsTemplates.length}`);
  logger.log(`Workflow catalog steps ensured: ${summary.workflowStepCatalog}`);
  logger.log(`Workflow templates ensured: ${summary.workflowTemplates.workflowTemplates}`);
  logger.log(`Workflow type mappings ensured: ${summary.workflowTemplates.workflowMappings}`);
  if (summary.initialSubscription?.created) {
    logger.log(`Initial organization subscription created: ${summary.initialSubscription.planId}`);
  } else if (summary.initialSubscription?.skipped) {
    logger.log(`Initial organization subscription skipped: ${summary.initialSubscription.reason}`);
  } else {
    logger.log(`Initial organization subscription already present: ${summary.initialSubscription.planId}`);
  }
}

export async function runProductionCoreSeed({
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

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    await client.query("BEGIN");
    const summary = {
      dryRun: options.dryRun,
      ...(await ensureProductionCoreCatalog(client, { env })),
    };
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
  runProductionCoreSeed().catch((error) => {
    console.error(`Production core seed failed: ${safeErrorMessage(error)}`);
    process.exit(1);
  });
}
