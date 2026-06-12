// @ts-nocheck
import "dotenv/config";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import {
  getActiveShipmentWorkflowTemplateForShipment,
  workflowDefinitionFromTemplate,
} from "../src/server/repositories/shipment-workflow-templates.js";

const { Client } = pg;
const __filename = fileURLToPath(import.meta.url);

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
  const options = {
    apply: false,
    allTenants: false,
    organizationId: "",
    help: false,
  };
  for (const arg of args) {
    if (arg === "--apply") options.apply = true;
    else if (arg === "--all-tenants") options.allTenants = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg.startsWith("--organization-id=")) options.organizationId = arg.slice("--organization-id=".length).trim();
    else fail(`Unknown option: ${arg}`);
  }
  if (options.allTenants && options.organizationId) {
    fail("Use either --all-tenants or --organization-id=<id>, not both.");
  }
  if (!options.allTenants && !options.organizationId && !options.help) {
    fail("Scope is required. Pass --organization-id=<id> or --all-tenants.");
  }
  return options;
}

function printHelp(logger = console) {
  logger.log("Usage: npm exec tsx scripts/reset-empty-shipment-workflows-to-default.ts -- [--organization-id=<id> | --all-tenants] [--apply]");
  logger.log("");
  logger.log("Dry-run is the default. The script only mutates when --apply is present.");
}

function snapshotHasNoSteps(snapshot: unknown) {
  if (!snapshot || typeof snapshot !== "object") return true;
  const steps = (snapshot as any).steps;
  return !Array.isArray(steps) || steps.length === 0;
}

async function findBlankWorkflowInstances(client: any, options: any) {
  const params: unknown[] = [];
  const filters = ["wi.status = 'active'"];
  if (options.organizationId) {
    params.push(options.organizationId);
    filters.push(`wi.organization_id = $${params.length}`);
  }
  const result = await client.query(
    `SELECT
       wi.*,
       s.shipment_type_code,
       s.shipment_code,
       COALESCE(step_counts.total_steps, 0)::int AS total_steps,
       COALESCE(step_counts.active_steps, 0)::int AS active_steps,
       COALESCE(step_counts.touched_steps, 0)::int AS touched_steps,
       COALESCE(event_counts.user_events, 0)::int AS user_events,
       COALESCE(blocker_counts.blockers, 0)::int AS blockers,
       COALESCE(task_counts.tasks, 0)::int AS tasks
     FROM shipment_workflow_instances wi
     JOIN shipments s
       ON s.id = wi.shipment_id
      AND s.organization_id = wi.organization_id
      AND s.archived_at IS NULL
     LEFT JOIN LATERAL (
       SELECT
         COUNT(*) AS total_steps,
         COUNT(*) FILTER (WHERE status <> 'pending') AS active_steps,
         COUNT(*) FILTER (
           WHERE status <> 'pending'
              OR completed_at IS NOT NULL
              OR NULLIF(trim(COALESCE(internal_note, '')), '') IS NOT NULL
              OR NULLIF(trim(COALESCE(public_note, '')), '') IS NOT NULL
         ) AS touched_steps
       FROM shipment_workflow_step_states states
       WHERE states.workflow_instance_id = wi.id
     ) step_counts ON TRUE
     LEFT JOIN LATERAL (
       SELECT COUNT(*) FILTER (WHERE event_type <> 'workflow.started') AS user_events
       FROM shipment_workflow_events events
       WHERE events.workflow_instance_id = wi.id
     ) event_counts ON TRUE
     LEFT JOIN LATERAL (
       SELECT COUNT(*) AS blockers
       FROM shipment_workflow_blockers blockers
       WHERE blockers.workflow_instance_id = wi.id
     ) blocker_counts ON TRUE
     LEFT JOIN LATERAL (
       SELECT COUNT(*) AS tasks
       FROM tasks
       WHERE tasks.workflow_instance_id = wi.id
     ) task_counts ON TRUE
     WHERE ${filters.join(" AND ")}
       AND (
         wi.workflow_definition_snapshot_json IS NULL
         OR jsonb_typeof(wi.workflow_definition_snapshot_json->'steps') <> 'array'
         OR jsonb_array_length(wi.workflow_definition_snapshot_json->'steps') = 0
         OR NOT EXISTS (
           SELECT 1
           FROM shipment_workflow_step_states states
           WHERE states.workflow_instance_id = wi.id
         )
       )
     ORDER BY wi.organization_id, wi.created_at ASC`,
    params
  );
  return result.rows;
}

function skipReason(row: any) {
  if (Number(row.user_events || 0) > 0) return "has workflow events after start";
  if (Number(row.touched_steps || 0) > 1) return "has step activity";
  if (Number(row.blockers || 0) > 0) return "has blockers";
  if (Number(row.tasks || 0) > 0) return "has linked tasks";
  return "";
}

async function resetInstance(client: any, row: any, definition: any, activeTemplate: any) {
  const orderedSteps = [...definition.steps].sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
  const firstStep = orderedSteps[0];
  await client.query("DELETE FROM shipment_workflow_step_states WHERE workflow_instance_id = $1", [row.id]);
  await client.query(
    `UPDATE shipment_workflow_instances
     SET workflow_key = $2,
         workflow_template_id = $3,
         workflow_template_code = $4,
         workflow_template_version = $5,
         workflow_definition_snapshot_json = $6::jsonb,
         current_step_code = $7,
         updated_at = NOW()
     WHERE id = $1
       AND organization_id = $8`,
    [
      row.id,
      definition.code || definition.key,
      activeTemplate.template.id,
      activeTemplate.template.code,
      activeTemplate.template.version,
      JSON.stringify(definition),
      firstStep.code,
      row.organization_id,
    ]
  );
  for (const step of orderedSteps) {
    await client.query(
      `INSERT INTO shipment_workflow_step_states (
         workflow_instance_id, organization_id, shipment_id, step_code, status, is_visible
       )
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (workflow_instance_id, step_code) DO UPDATE SET
         status = EXCLUDED.status,
         is_visible = EXCLUDED.is_visible,
         updated_at = NOW()`,
      [
        row.id,
        row.organization_id,
        row.shipment_id,
        step.code,
        step.code === firstStep.code ? "active" : "pending",
        step.isVisible !== false,
      ]
    );
  }
  await client.query(
    `INSERT INTO shipment_workflow_events (
       id, organization_id, workflow_instance_id, shipment_id, event_type, step_code,
       actor_user_id, internal_note, public_visible, metadata
     )
     VALUES ($1, $2, $3, $4, 'workflow.reset_to_default_template', $5, NULL, $6, FALSE, $7::jsonb)`,
    [
      crypto.randomUUID(),
      row.organization_id,
      row.id,
      row.shipment_id,
      firstStep.code,
      "Blank workflow reset to the active default template by maintenance script.",
      JSON.stringify({
        workflowTemplateId: activeTemplate.template.id,
        workflowTemplateCode: activeTemplate.template.code,
        workflowTemplateVersion: activeTemplate.template.version,
      }),
    ]
  );
}

export async function runResetEmptyShipmentWorkflows({
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
  if (!databaseUrl) fail("Missing required environment variable: DATABASE_URL");

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  const summary = {
    dryRun: !options.apply,
    scanned: 0,
    candidates: 0,
    reset: 0,
    skipped: [] as Array<{ workflowInstanceId: string; shipmentId: string; reason: string }>,
  };

  try {
    await client.query("BEGIN");
    const rows = await findBlankWorkflowInstances(client, options);
    summary.scanned = rows.length;
    for (const row of rows) {
      const reason = skipReason(row);
      if (reason) {
        summary.skipped.push({ workflowInstanceId: row.id, shipmentId: row.shipment_id, reason });
        logger.log(`SKIP ${row.id} shipment=${row.shipment_code || row.shipment_id}: ${reason}`);
        continue;
      }
      const activeTemplate = await getActiveShipmentWorkflowTemplateForShipment(client, {
        organizationId: row.organization_id,
        shipmentId: row.shipment_id,
      });
      const definition = activeTemplate?.template ? workflowDefinitionFromTemplate(activeTemplate.template) : null;
      if (!definition?.steps?.length || snapshotHasNoSteps(definition)) {
        const missingReason = "no non-empty default workflow template";
        summary.skipped.push({ workflowInstanceId: row.id, shipmentId: row.shipment_id, reason: missingReason });
        logger.log(`SKIP ${row.id} shipment=${row.shipment_code || row.shipment_id}: ${missingReason}`);
        continue;
      }
      summary.candidates += 1;
      logger.log(`CANDIDATE ${row.id} shipment=${row.shipment_code || row.shipment_id} template=${activeTemplate.template.code} steps=${definition.steps.length}`);
      if (options.apply) {
        await resetInstance(client, row, definition, activeTemplate);
        summary.reset += 1;
      }
    }
    if (options.apply) await client.query("COMMIT");
    else await client.query("ROLLBACK");
    logger.log(JSON.stringify(summary, null, 2));
    return summary;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

if (isDirectRun()) {
  runResetEmptyShipmentWorkflows().catch((error) => {
    console.error(`Reset empty shipment workflows failed: ${safeErrorMessage(error)}`);
    process.exit(1);
  });
}
