import crypto from "node:crypto";
import { IR_IMPORT_CUSTOMS_BLOCKERS } from "../../shared/iran-import-customs-workflow.js";
import {
  DEFAULT_SHIPMENT_TYPE_CODE,
  SHIPMENT_TYPES,
  normalizeShipmentTypeCode,
  shipmentTypeByCode,
} from "../../shared/shipment-form-fields.js";
import { requireOrganizationScope } from "../tenant-scope.js";
import { withTransaction } from "../transaction.js";

const SYSTEM_IR_IMPORT_TEMPLATE_ID = "swt-ir-import-customs-v1";
export const DEFAULT_WORKFLOW_TEMPLATE_CODE = "IR_IMPORT_CUSTOMS_V1";

function jsonValue(value, fallback) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }
  return value;
}

function templateTypeDefaults(shipmentTypeCode) {
  const type = shipmentTypeByCode.get(normalizeShipmentTypeCode(shipmentTypeCode));
  return {
    shipmentTypeCode: type?.code || DEFAULT_SHIPMENT_TYPE_CODE,
    shipmentDirection: type?.direction || "import",
    transportMode: type?.transportMode || null,
  };
}

function toTemplateSummary(row) {
  if (!row) return null;
  const workflowInstanceCount = Number(row.workflow_instance_count || 0);
  const activeMappingCount = Number(row.active_mapping_count || 0);
  const auditEventCount = Number(row.audit_event_count || 0);
  return {
    id: row.id,
    organizationId: row.organization_id || null,
    code: row.code,
    shipmentTypeHint: row.shipment_type_hint || null,
    shipmentDirection: row.shipment_direction || null,
    transportMode: row.transport_mode || null,
    titleFa: row.title_fa,
    titleEn: row.title_en || "",
    description: row.description || "",
    isSystem: Boolean(row.is_system),
    isActive: Boolean(row.is_active),
    version: Number(row.version || 1),
    createdById: row.created_by_id || null,
    updatedById: row.updated_by_id || null,
    publishedById: row.published_by_id || null,
    publishedAt: row.published_at || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    archivedAt: row.archived_at || null,
    archivedById: row.archived_by_id || null,
    archivedReason: row.archived_reason || "",
    workflowInstanceCount,
    activeMappingCount,
    auditEventCount,
    canDelete: !row.is_system && workflowInstanceCount === 0 && activeMappingCount === 0 && auditEventCount === 0,
  };
}

function toCatalogStep(row) {
  return {
    id: row.id,
    organizationId: row.organization_id || null,
    code: row.code,
    title: row.title,
    titleFa: row.title_fa || row.title,
    description: row.description || "",
    category: row.category || "",
    stageKey: row.stage_key || "",
    stageTitleFa: row.stage_title_fa || "",
    defaultOrder: Number(row.default_order || 0),
    defaultRequired: row.default_required !== false,
    defaultCustomerVisible: row.default_customer_visible !== false,
    defaultInternalOnly: Boolean(row.default_internal_only),
    defaultChecklist: jsonValue(row.default_checklist, []),
    defaultRequiredDocuments: jsonValue(row.default_required_documents, []),
    defaultFormFields: jsonValue(row.default_form_fields, []),
    metadata: jsonValue(row.metadata, {}),
    isSystem: Boolean(row.is_system),
    archivedAt: row.archived_at || null,
    archivedById: row.archived_by_id || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

function toPhase(row) {
  return {
    id: row.id,
    templateId: row.template_id,
    phaseKey: row.phase_key,
    labelFa: row.label_fa,
    labelEn: row.label_en || "",
    sortOrder: Number(row.sort_order || 0),
    isVisible: row.is_visible !== false,
    steps: [],
  };
}

function toStep(row) {
  return {
    id: row.id,
    templateId: row.template_id,
    phaseId: row.phase_id,
    phaseKey: row.phase_key,
    stepKey: row.step_key,
    catalogStepId: row.catalog_step_id || null,
    labelFa: row.label_fa,
    labelEn: row.label_en || "",
    publicLabel: row.public_label || row.label_fa,
    sortOrder: Number(row.sort_order || 0),
    isRequired: row.is_required !== false,
    isVisible: row.is_visible !== false,
    isCustomerVisible: row.is_customer_visible !== false,
    roleSuggestion: row.role_suggestion || "",
    expectedDurationHours: row.expected_duration_hours === null || row.expected_duration_hours === undefined
      ? null
      : Number(row.expected_duration_hours),
    taskPolicy: jsonValue(row.task_policy_json, {}),
    checklist: jsonValue(row.checklist_json, []),
    expectedDocuments: jsonValue(row.expected_documents_json, []),
    expectedFormFields: jsonValue(row.expected_form_fields_json, []),
    nextStepRules: jsonValue(row.next_step_rules_json, {}),
    visibilityRule: jsonValue(row.visibility_rule_json, {}),
    catalogStep: row.catalog_step_id
      ? {
          id: row.catalog_step_id,
          code: row.catalog_code || "",
          titleFa: row.catalog_title_fa || "",
          stageKey: row.catalog_stage_key || "",
          isSystem: Boolean(row.catalog_is_system),
          archivedAt: row.catalog_archived_at || null,
        }
      : null,
    archivedAt: row.archived_at || null,
  };
}

export function workflowDefinitionFromTemplate(template) {
  if (!template) return null;
  const steps = template.phases
    .flatMap((phase) => phase.steps || [])
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((step) => ({
      phaseId: step.phaseKey,
      phaseKey: step.phaseKey,
      code: step.stepKey,
      stepKey: step.stepKey,
      labelFa: step.labelFa,
      labelEn: step.labelEn,
      publicLabel: step.publicLabel || step.labelFa,
      order: step.sortOrder,
      isRequired: step.isRequired,
      isVisible: step.isVisible,
      isCustomerVisible: step.isCustomerVisible,
      roleSuggestion: step.roleSuggestion || "",
      expectedDurationHours: step.expectedDurationHours,
      taskPolicy: step.taskPolicy || {},
      checklist: step.checklist || [],
      expectedDocuments: step.expectedDocuments || [],
      expectedFormFields: step.expectedFormFields || [],
      nextStepRules: step.nextStepRules || {},
      visibilityRule: step.visibilityRule || {},
    }));
  return {
    key: template.code,
    code: template.code,
    version: template.version,
    templateId: template.id,
    titleFa: template.titleFa,
    titleEn: template.titleEn,
    phases: template.phases.map((phase) => ({
      id: phase.phaseKey,
      phaseKey: phase.phaseKey,
      labelFa: phase.labelFa,
      labelEn: phase.labelEn,
      order: phase.sortOrder,
      isVisible: phase.isVisible,
    })),
    steps,
    blockers: IR_IMPORT_CUSTOMS_BLOCKERS,
    routeVisibilityRule: steps.some((step) => step.visibilityRule?.type === "iran_customs_route_v1")
      ? "iran_customs_route_v1"
      : null,
  };
}

export function normalizeWorkflowDefinition(definition) {
  if (!definition) return null;
  const phases = Array.isArray(definition.phases) ? definition.phases : [];
  const steps = Array.isArray(definition.steps) ? definition.steps : [];
  return {
    key: definition.key || definition.code || DEFAULT_WORKFLOW_TEMPLATE_CODE,
    code: definition.code || definition.key || DEFAULT_WORKFLOW_TEMPLATE_CODE,
    version: Number(definition.version || 1),
    templateId: definition.templateId || definition.workflowTemplateId || null,
    titleFa: definition.titleFa || definition.labelFa || "",
    titleEn: definition.titleEn || definition.labelEn || "",
    phases: phases.map((phase, index) => ({
      id: phase.id || phase.phaseKey,
      phaseKey: phase.phaseKey || phase.id,
      labelFa: phase.labelFa || phase.label || phase.id || phase.phaseKey,
      labelEn: phase.labelEn || "",
      order: Number(phase.order || phase.sortOrder || index + 1),
      isVisible: phase.isVisible !== false,
    })),
    steps: steps.map((step, index) => ({
      phaseId: step.phaseId || step.phaseKey,
      phaseKey: step.phaseKey || step.phaseId,
      code: step.code || step.stepKey,
      stepKey: step.stepKey || step.code,
      labelFa: step.labelFa || step.label || step.code || step.stepKey,
      labelEn: step.labelEn || "",
      publicLabel: step.publicLabel || step.labelFa || step.label || "",
      order: Number(step.order || step.sortOrder || index + 1),
      isRequired: step.isRequired !== false,
      isVisible: step.isVisible !== false,
      isCustomerVisible: step.isCustomerVisible !== false,
      roleSuggestion: step.roleSuggestion || "",
      expectedDurationHours: step.expectedDurationHours ?? null,
      taskPolicy: step.taskPolicy || {},
      checklist: Array.isArray(step.checklist) ? step.checklist : [],
      expectedDocuments: Array.isArray(step.expectedDocuments) ? step.expectedDocuments : [],
      expectedFormFields: Array.isArray(step.expectedFormFields) ? step.expectedFormFields : [],
      nextStepRules: step.nextStepRules || {},
      visibilityRule: step.visibilityRule || {},
    })),
    blockers: Array.isArray(definition.blockers) ? definition.blockers : IR_IMPORT_CUSTOMS_BLOCKERS,
    routeVisibilityRule: definition.routeVisibilityRule || null,
  };
}

async function composeTemplate(queryable, row) {
  const summary = toTemplateSummary(row);
  if (!summary) return null;
  const [phasesResult, stepsResult, usageResult] = await Promise.all([
    queryable.query(
      `SELECT *
       FROM shipment_workflow_template_phases
       WHERE template_id = $1
         AND (
           is_visible = TRUE
           OR EXISTS (
             SELECT 1
             FROM shipment_workflow_template_steps active_steps
             WHERE active_steps.template_id = shipment_workflow_template_phases.template_id
               AND active_steps.phase_id = shipment_workflow_template_phases.id
               AND active_steps.archived_at IS NULL
           )
         )
       ORDER BY sort_order ASC, created_at ASC`,
      [summary.id]
    ),
    queryable.query(
      `SELECT steps.*,
              catalog.code AS catalog_code,
              catalog.title_fa AS catalog_title_fa,
              catalog.stage_key AS catalog_stage_key,
              catalog.is_system AS catalog_is_system,
              catalog.archived_at AS catalog_archived_at
       FROM shipment_workflow_template_steps steps
       LEFT JOIN shipment_workflow_step_catalog catalog
         ON catalog.id = steps.catalog_step_id
       WHERE steps.template_id = $1
         AND steps.archived_at IS NULL
       ORDER BY steps.sort_order ASC, steps.created_at ASC`,
      [summary.id]
    ),
    queryable.query(
      `SELECT
         (SELECT COUNT(*)::int FROM shipment_workflow_instances WHERE workflow_template_id = $1) AS workflow_instance_count,
         (SELECT COUNT(*)::int FROM shipment_type_workflow_templates WHERE workflow_template_id = $1 AND archived_at IS NULL) AS active_mapping_count,
         (SELECT COUNT(*)::int FROM audit_logs WHERE resource_type = 'shipment_workflow_template' AND resource_id = $1) AS audit_event_count`,
      [summary.id]
    ),
  ]);
  Object.assign(summary, {
    workflowInstanceCount: Number(usageResult.rows[0]?.workflow_instance_count || 0),
    activeMappingCount: Number(usageResult.rows[0]?.active_mapping_count || 0),
    auditEventCount: Number(usageResult.rows[0]?.audit_event_count || 0),
  });
  summary.canDelete = !summary.isSystem
    && summary.workflowInstanceCount === 0
    && summary.activeMappingCount === 0
    && summary.auditEventCount === 0;
  const phaseMap = new Map();
  const phases = phasesResult.rows.map((phaseRow) => {
    const phase = toPhase(phaseRow);
    phaseMap.set(phase.id, phase);
    return phase;
  });
  for (const stepRow of stepsResult.rows) {
    const phase = phaseMap.get(stepRow.phase_id);
    if (phase) phase.steps.push(toStep(stepRow));
  }
  return { ...summary, phases };
}

async function findTemplateRow(queryable, { organizationId, templateId, includeArchived = false } = {}) {
  const result = await queryable.query(
    `SELECT *
     FROM shipment_workflow_templates
     WHERE id = $1
       AND ($3::boolean = TRUE OR archived_at IS NULL)
       AND (organization_id = $2 OR organization_id IS NULL)
     LIMIT 1`,
    [templateId, organizationId, Boolean(includeArchived)]
  );
  return result.rows[0] || null;
}

export async function listShipmentWorkflowTemplates(queryable, { organizationId, shipmentTypeCode, includeArchived = false } = {}) {
  const scopedOrganizationId = requireOrganizationScope(organizationId, "listShipmentWorkflowTemplates");
  const values = [scopedOrganizationId, Boolean(includeArchived)];
  let mappingJoin = "";
  let typeFilter = "";
  if (shipmentTypeCode) {
    values.push(normalizeShipmentTypeCode(shipmentTypeCode));
    mappingJoin = `
      LEFT JOIN shipment_type_workflow_templates mapping
        ON mapping.workflow_template_id = templates.id
       AND mapping.archived_at IS NULL
       AND mapping.shipment_type_code = $3
       AND (mapping.organization_id = $1 OR mapping.organization_id IS NULL)
    `;
    typeFilter = `AND (templates.shipment_type_hint = $3 OR mapping.id IS NOT NULL)`;
  }
  const result = await queryable.query(
    `SELECT templates.*
     FROM shipment_workflow_templates templates
     ${mappingJoin}
     WHERE ($2::boolean = TRUE OR templates.archived_at IS NULL)
       AND (templates.organization_id = $1 OR templates.organization_id IS NULL)
       ${typeFilter}
     ORDER BY
       CASE WHEN templates.archived_at IS NULL THEN 0 ELSE 1 END ASC,
       CASE WHEN templates.organization_id = $1 THEN 0 ELSE 1 END ASC,
       templates.code ASC,
       templates.version DESC,
       templates.updated_at DESC`,
    values
  );
  const templates = [];
  for (const row of result.rows) templates.push(await composeTemplate(queryable, row));
  return templates;
}

export async function getShipmentWorkflowTemplate(queryable, { organizationId, templateId } = {}) {
  const scopedOrganizationId = requireOrganizationScope(organizationId, "getShipmentWorkflowTemplate");
  return composeTemplate(queryable, await findTemplateRow(queryable, {
    organizationId: scopedOrganizationId,
    templateId,
  }));
}

export async function listShipmentWorkflowStepCatalog(queryable, {
  organizationId,
  search,
  stageKey,
  category = "customs_import",
  includeArchived = false,
} = {}) {
  const scopedOrganizationId = requireOrganizationScope(organizationId, "listShipmentWorkflowStepCatalog");
  const values = [scopedOrganizationId, Boolean(includeArchived)];
  const filters = [
    "(organization_id = $1 OR organization_id IS NULL)",
    "($2::boolean = TRUE OR archived_at IS NULL)",
  ];
  if (category) {
    values.push(category);
    filters.push(`category = $${values.length}`);
  }
  if (stageKey) {
    values.push(stageKey);
    filters.push(`stage_key = $${values.length}`);
  }
  if (search) {
    values.push(`%${search}%`);
    filters.push(`(code ILIKE $${values.length} OR title ILIKE $${values.length} OR title_fa ILIKE $${values.length} OR description ILIKE $${values.length})`);
  }
  const result = await queryable.query(
    `SELECT *
     FROM shipment_workflow_step_catalog
     WHERE ${filters.join(" AND ")}
     ORDER BY
       CASE WHEN organization_id = $1 THEN 0 ELSE 1 END ASC,
       category ASC,
       default_order ASC,
       code ASC`,
    values
  );
  return result.rows.map(toCatalogStep);
}

async function getWorkflowTemplateByCodeVersion(queryable, { organizationId, code, version } = {}) {
  const result = await queryable.query(
    `SELECT *
     FROM shipment_workflow_templates
     WHERE code = $2
       AND version = $3
       AND archived_at IS NULL
       AND (organization_id = $1 OR organization_id IS NULL)
     ORDER BY CASE WHEN organization_id = $1 THEN 0 ELSE 1 END ASC
     LIMIT 1`,
    [organizationId, code, Number(version || 1)]
  );
  return composeTemplate(queryable, result.rows[0] || null);
}

async function cloneTemplateForOrganization(client, sourceTemplate, { organizationId, actorUserId, overrides = {}, forceVersion } = {}) {
  const clonedTemplateId = crypto.randomUUID();
  const code = overrides.code || sourceTemplate.code;
  const versionResult = await client.query(
    `SELECT COALESCE(MAX(version), 0)::int AS max_version
     FROM shipment_workflow_templates
     WHERE organization_id = $1
       AND code = $2
       AND archived_at IS NULL`,
    [organizationId, code]
  );
  const maxVersion = Number(versionResult.rows[0]?.max_version || 0);
  const version = forceVersion || (maxVersion ? maxVersion + 1 : sourceTemplate.version || 1);
  const templateResult = await client.query(
    `INSERT INTO shipment_workflow_templates (
       id, organization_id, code, shipment_direction, transport_mode, shipment_type_hint,
       title_fa, title_en, description, is_system, is_active, version,
       created_by_id, updated_by_id, created_at, updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, FALSE, $10, $11, $12, $12, NOW(), NOW())
     RETURNING *`,
    [
      clonedTemplateId,
      organizationId,
      code,
      overrides.shipmentDirection ?? sourceTemplate.shipmentDirection,
      overrides.transportMode ?? sourceTemplate.transportMode,
      overrides.shipmentTypeCode ?? sourceTemplate.shipmentTypeHint,
      overrides.titleFa || sourceTemplate.titleFa,
      overrides.titleEn ?? sourceTemplate.titleEn,
      overrides.description ?? sourceTemplate.description,
      overrides.isActive ?? sourceTemplate.isActive,
      version,
      actorUserId || null,
    ]
  );
  const phaseIdMap = new Map();
  for (const phase of sourceTemplate.phases) {
    const phaseId = crypto.randomUUID();
    phaseIdMap.set(phase.id, phaseId);
    await client.query(
      `INSERT INTO shipment_workflow_template_phases (
         id, template_id, phase_key, label_fa, label_en, sort_order, is_visible, created_at, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`,
      [
        phaseId,
        clonedTemplateId,
        phase.phaseKey,
        phase.labelFa,
        phase.labelEn,
        phase.sortOrder,
        phase.isVisible,
      ]
    );
  }
  for (const phase of sourceTemplate.phases) {
    for (const step of phase.steps || []) {
      await client.query(
        `INSERT INTO shipment_workflow_template_steps (
           id, template_id, phase_id, phase_key, step_key, catalog_step_id, label_fa, label_en, public_label,
           sort_order, is_required, is_visible, is_customer_visible, role_suggestion,
           expected_duration_hours, task_policy_json, checklist_json, expected_documents_json,
           expected_form_fields_json, next_step_rules_json, visibility_rule_json, created_at, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
           $15, $16::jsonb, $17::jsonb, $18::jsonb, $19::jsonb, $20::jsonb, $21::jsonb, NOW(), NOW())`,
        [
          crypto.randomUUID(),
          clonedTemplateId,
          phaseIdMap.get(phase.id),
          phase.phaseKey,
          step.stepKey,
          step.catalogStepId || null,
          step.labelFa,
          step.labelEn,
          step.publicLabel,
          step.sortOrder,
          step.isRequired,
          step.isVisible,
          step.isCustomerVisible,
          step.roleSuggestion || null,
          step.expectedDurationHours,
          JSON.stringify(step.taskPolicy || {}),
          JSON.stringify(step.checklist || []),
          JSON.stringify(step.expectedDocuments || []),
          JSON.stringify(step.expectedFormFields || []),
          JSON.stringify(step.nextStepRules || {}),
          JSON.stringify(step.visibilityRule || {}),
        ]
      );
    }
  }
  return composeTemplate(client, templateResult.rows[0]);
}

async function ensureMutableTemplate(client, { organizationId, templateId, actorUserId } = {}) {
  const source = await getShipmentWorkflowTemplate(client, { organizationId, templateId });
  if (!source) {
    const error = new Error("Shipment workflow template was not found.");
    error.statusCode = 404;
    error.code = "SHIPMENT_WORKFLOW_TEMPLATE_NOT_FOUND";
    throw error;
  }
  if (source.organizationId === organizationId) return source;
  return cloneTemplateForOrganization(client, source, { organizationId, actorUserId });
}

async function resolvePhase(client, template, { phaseId, phaseKey } = {}) {
  let key = phaseKey || null;
  if (!key && phaseId) {
    const result = await client.query(
      `SELECT phase_key
       FROM shipment_workflow_template_phases
       WHERE id = $1 AND template_id = $2
       LIMIT 1`,
      [phaseId, template.id]
    );
    key = result.rows[0]?.phase_key || null;
  }
  const phase = key
    ? template.phases.find((item) => item.phaseKey === key)
    : template.phases.find((item) => item.id === phaseId);
  if (!phase) {
    const error = new Error("Workflow template phase was not found.");
    error.statusCode = 404;
    error.code = "SHIPMENT_WORKFLOW_TEMPLATE_PHASE_NOT_FOUND";
    throw error;
  }
  return phase;
}

export async function createShipmentWorkflowTemplate(pool, { organizationId, actorUserId, body } = {}) {
  const scopedOrganizationId = requireOrganizationScope(organizationId, "createShipmentWorkflowTemplate");
  return withTransaction(pool, async (client) => {
    if (body.sourceTemplateId) {
      const source = await getShipmentWorkflowTemplate(client, {
        organizationId: scopedOrganizationId,
        templateId: body.sourceTemplateId,
      });
      if (!source) {
        const error = new Error("Source shipment workflow template was not found.");
        error.statusCode = 404;
        error.code = "SHIPMENT_WORKFLOW_TEMPLATE_NOT_FOUND";
        throw error;
      }
      return cloneTemplateForOrganization(client, source, {
        organizationId: scopedOrganizationId,
        actorUserId,
        overrides: body,
      });
    }

    const defaults = templateTypeDefaults(body.shipmentTypeCode);
    const code = body.code || `custom-${defaults.shipmentTypeCode.toLowerCase().replace(/_/g, "-")}-workflow`;
    const result = await client.query(
      `INSERT INTO shipment_workflow_templates (
         id, organization_id, code, shipment_direction, transport_mode, shipment_type_hint,
         title_fa, title_en, description, is_system, is_active, version,
         created_by_id, updated_by_id, created_at, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, FALSE, $10, 1, $11, $11, NOW(), NOW())
       RETURNING *`,
      [
        crypto.randomUUID(),
        scopedOrganizationId,
        code,
        body.shipmentDirection || defaults.shipmentDirection,
        body.transportMode || defaults.transportMode,
        defaults.shipmentTypeCode,
        body.titleFa,
        body.titleEn || "",
        body.description || "",
        body.isActive !== false,
        actorUserId || null,
      ]
    );
    const phaseResult = await client.query(
      `INSERT INTO shipment_workflow_template_phases (
         id, template_id, phase_key, label_fa, label_en, sort_order, is_visible, created_at, updated_at
       )
       VALUES ($1, $2, 'base', 'فرآیند اصلی', 'Main workflow', 1, TRUE, NOW(), NOW())`,
      [crypto.randomUUID(), result.rows[0].id]
    );
    void phaseResult;
    return composeTemplate(client, result.rows[0]);
  });
}

export async function updateShipmentWorkflowTemplate(pool, { organizationId, templateId, actorUserId, body } = {}) {
  const scopedOrganizationId = requireOrganizationScope(organizationId, "updateShipmentWorkflowTemplate");
  return withTransaction(pool, async (client) => {
    const before = await ensureMutableTemplate(client, { organizationId: scopedOrganizationId, templateId, actorUserId });
    const values = [before.id, scopedOrganizationId];
    const columns = [];
    const addColumn = (column, value) => {
      values.push(value);
      columns.push(`${column} = $${values.length}`);
    };
    if (body.titleFa !== undefined) addColumn("title_fa", body.titleFa);
    if (body.titleEn !== undefined) addColumn("title_en", body.titleEn || "");
    if (body.description !== undefined) addColumn("description", body.description || "");
    if (body.isActive !== undefined) addColumn("is_active", body.isActive);
    addColumn("updated_by_id", actorUserId || null);
    if (columns.length) {
      await client.query(
        `UPDATE shipment_workflow_templates
         SET ${columns.join(", ")}, updated_at = NOW()
         WHERE id = $1 AND organization_id = $2`,
        values
      );
    }
    const after = await getShipmentWorkflowTemplate(client, {
      organizationId: scopedOrganizationId,
      templateId: before.id,
    });
    return { before, after, templateId: before.id, forked: before.id !== templateId };
  });
}

async function upsertWorkflowTypeMapping(client, { organizationId, shipmentTypeCode, template, actorUserId } = {}) {
  const typeCode = normalizeShipmentTypeCode(shipmentTypeCode);
  const id = `stwt-org-${organizationId}-${typeCode}`.slice(0, 180);
  await client.query(
    `INSERT INTO shipment_type_workflow_templates (
       id, organization_id, shipment_type_code, workflow_template_id,
       workflow_template_code, workflow_template_version, created_by_id, updated_by_id, created_at, updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $7, NOW(), NOW())
     ON CONFLICT (id) DO UPDATE SET
       workflow_template_id = EXCLUDED.workflow_template_id,
       workflow_template_code = EXCLUDED.workflow_template_code,
       workflow_template_version = EXCLUDED.workflow_template_version,
       updated_by_id = EXCLUDED.updated_by_id,
       archived_at = NULL,
       updated_at = NOW()`,
    [
      id,
      organizationId,
      typeCode,
      template.id,
      template.code,
      template.version,
      actorUserId || null,
    ]
  );
}

export async function publishShipmentWorkflowTemplate(pool, { organizationId, templateId, actorUserId, body = {} } = {}) {
  const scopedOrganizationId = requireOrganizationScope(organizationId, "publishShipmentWorkflowTemplate");
  return withTransaction(pool, async (client) => {
    const source = await ensureMutableTemplate(client, { organizationId: scopedOrganizationId, templateId, actorUserId });
    const maxResult = await client.query(
      `SELECT COALESCE(MAX(version), 0)::int AS max_version
       FROM shipment_workflow_templates
       WHERE code = $2
         AND archived_at IS NULL
         AND organization_id = $1`,
      [scopedOrganizationId, source.code]
    );
    const nextVersion = Math.max(Number(maxResult.rows[0]?.max_version || 0) + 1, source.version + 1);
    const published = await cloneTemplateForOrganization(client, source, {
      organizationId: scopedOrganizationId,
      actorUserId,
      forceVersion: nextVersion,
      overrides: {
        titleFa: body.titleFa || source.titleFa,
        titleEn: body.titleEn ?? source.titleEn,
        description: body.description ?? source.description,
        isActive: true,
      },
    });
    await client.query(
      `UPDATE shipment_workflow_templates
       SET is_active = FALSE, updated_at = NOW()
       WHERE organization_id = $1
         AND code = $2
         AND id <> $3`,
      [scopedOrganizationId, published.code, published.id]
    );
    if (body.shipmentTypeCode || source.shipmentTypeHint) {
      await upsertWorkflowTypeMapping(client, {
        organizationId: scopedOrganizationId,
        shipmentTypeCode: body.shipmentTypeCode || source.shipmentTypeHint,
        template: published,
        actorUserId,
      });
    }
    await client.query(
      `UPDATE shipment_workflow_templates
       SET published_by_id = $2, published_at = NOW(), updated_by_id = $2, updated_at = NOW()
       WHERE id = $1 AND organization_id = $3`,
      [published.id, actorUserId || null, scopedOrganizationId]
    );
    const after = await getShipmentWorkflowTemplate(client, {
      organizationId: scopedOrganizationId,
      templateId: published.id,
    });
    return { before: source, after, templateId: published.id, forked: source.id !== templateId };
  });
}

export async function addShipmentWorkflowTemplateStep(pool, { organizationId, templateId, actorUserId, body } = {}) {
  const scopedOrganizationId = requireOrganizationScope(organizationId, "addShipmentWorkflowTemplateStep");
  return withTransaction(pool, async (client) => {
    const before = await ensureMutableTemplate(client, { organizationId: scopedOrganizationId, templateId, actorUserId });
    const phase = await resolvePhase(client, before, body);
    const result = await client.query(
      `INSERT INTO shipment_workflow_template_steps (
         id, template_id, phase_id, phase_key, step_key, catalog_step_id, label_fa, label_en, public_label,
         sort_order, is_required, is_visible, is_customer_visible, role_suggestion,
         expected_duration_hours, task_policy_json, checklist_json, expected_documents_json,
         expected_form_fields_json, next_step_rules_json, visibility_rule_json, created_at, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, NULL, $6, $7, $8, $9, $10, $11, $12, $13,
         $14, $15::jsonb, $16::jsonb, $17::jsonb, $18::jsonb, $19::jsonb, '{}'::jsonb, NOW(), NOW())
       RETURNING *`,
      [
        crypto.randomUUID(),
        before.id,
        phase.id,
        phase.phaseKey,
        body.stepKey,
        body.labelFa,
        body.labelEn || "",
        body.publicLabel || body.labelFa,
        Math.trunc(Number(body.sortOrder || 0)) || before.phases.flatMap((item) => item.steps).length + 1,
        body.isRequired !== false,
        body.isVisible !== false,
        body.isCustomerVisible !== false,
        body.roleSuggestion || null,
        body.expectedDurationHours === undefined ? null : Math.trunc(Number(body.expectedDurationHours)),
        JSON.stringify(body.taskPolicy || { mode: "suggested" }),
        JSON.stringify(body.checklist || []),
        JSON.stringify(body.expectedDocuments || []),
        JSON.stringify(body.expectedFormFields || []),
        JSON.stringify(body.nextStepRules || {}),
      ]
    );
    await client.query(
      "UPDATE shipment_workflow_templates SET updated_by_id = $2, updated_at = NOW() WHERE id = $1",
      [before.id, actorUserId || null]
    );
    const after = await getShipmentWorkflowTemplate(client, {
      organizationId: scopedOrganizationId,
      templateId: before.id,
    });
    return { before, after, step: toStep(result.rows[0]), templateId: before.id, forked: before.id !== templateId };
  });
}

function catalogStepKey(catalogStep, existingKeys) {
  const raw = String(catalogStep.code || catalogStep.id || "CATALOG_STEP")
    .replace(/^IR_IMPORT_CUSTOMS_/i, "")
    .replace(/[^A-Za-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 28) || "CATALOG_STEP";
  let candidate = raw;
  let suffix = 2;
  while (existingKeys.has(candidate)) {
    const suffixText = `-${suffix}`;
    candidate = `${raw.slice(0, 32 - suffixText.length)}${suffixText}`;
    suffix += 1;
  }
  existingKeys.add(candidate);
  return candidate;
}

async function ensurePhaseForCatalogStep(client, template, catalogStep) {
  const phaseKey = catalogStep.stageKey || "catalog";
  const existing = template.phases.find((phase) => phase.phaseKey === phaseKey);
  if (existing) return existing;
  const maxSortOrder = template.phases.reduce((max, phase) => Math.max(max, Number(phase.sortOrder || 0)), 0);
  const phaseId = crypto.randomUUID();
  const result = await client.query(
    `INSERT INTO shipment_workflow_template_phases (
       id, template_id, phase_key, label_fa, label_en, sort_order, is_visible, created_at, updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, TRUE, NOW(), NOW())
     ON CONFLICT (template_id, phase_key) DO UPDATE SET
       label_fa = EXCLUDED.label_fa,
       label_en = EXCLUDED.label_en,
       is_visible = TRUE,
       updated_at = NOW()
     RETURNING *`,
    [
      phaseId,
      template.id,
      phaseKey,
      catalogStep.stageTitleFa || catalogStep.stageKey || "مراحل کاتالوگ",
      catalogStep.stageKey || "",
      maxSortOrder + 1,
    ]
  );
  const phase = toPhase(result.rows[0]);
  template.phases.push(phase);
  return phase;
}

export async function addShipmentWorkflowTemplateStepsFromCatalog(pool, {
  organizationId,
  templateId,
  actorUserId,
  body,
} = {}) {
  const scopedOrganizationId = requireOrganizationScope(organizationId, "addShipmentWorkflowTemplateStepsFromCatalog");
  return withTransaction(pool, async (client) => {
    const before = await ensureMutableTemplate(client, { organizationId: scopedOrganizationId, templateId, actorUserId });
    const requestedIds = [...new Set(body.catalogStepIds || [])];
    if (!requestedIds.length) {
      const error = new Error("At least one catalog step is required.");
      error.statusCode = 400;
      error.code = "CATALOG_STEPS_REQUIRED";
      throw error;
    }
    const catalogResult = await client.query(
      `SELECT *
       FROM shipment_workflow_step_catalog
       WHERE id = ANY($1::text[])
         AND archived_at IS NULL
         AND (organization_id = $2 OR organization_id IS NULL)`,
      [requestedIds, scopedOrganizationId]
    );
    const catalogById = new Map(catalogResult.rows.map((row) => [row.id, toCatalogStep(row)]));
    const missingIds = requestedIds.filter((id) => !catalogById.has(id));
    if (missingIds.length) {
      const error = new Error("One or more catalog steps were not found.");
      error.statusCode = 404;
      error.code = "SHIPMENT_WORKFLOW_CATALOG_STEPS_NOT_FOUND";
      error.metadata = { missingIds };
      throw error;
    }

    const activeSteps = before.phases.flatMap((phase) => phase.steps || []);
    const duplicateCatalogIds = requestedIds.filter((id) => activeSteps.some((step) => step.catalogStepId === id));
    if (duplicateCatalogIds.length && !body.allowDuplicates) {
      const error = new Error("Some selected catalog steps already exist in this template.");
      error.statusCode = 409;
      error.code = "SHIPMENT_WORKFLOW_TEMPLATE_DUPLICATE_CATALOG_STEPS";
      error.metadata = { duplicateCatalogIds };
      throw error;
    }

    const existingKeys = new Set(activeSteps.map((step) => step.stepKey));
    const maxSortOrder = activeSteps.reduce((max, step) => Math.max(max, Number(step.sortOrder || 0)), 0);
    const addedSteps = [];
    let orderOffset = 1;
    for (const catalogStepId of requestedIds) {
      const catalogStep = catalogById.get(catalogStepId);
      const phase = await ensurePhaseForCatalogStep(client, before, catalogStep);
      const result = await client.query(
        `INSERT INTO shipment_workflow_template_steps (
           id, template_id, phase_id, phase_key, step_key, catalog_step_id, label_fa, label_en, public_label,
           sort_order, is_required, is_visible, is_customer_visible, role_suggestion,
           expected_duration_hours, task_policy_json, checklist_json, expected_documents_json,
           expected_form_fields_json, next_step_rules_json, visibility_rule_json, created_at, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, TRUE, $12, NULL,
           NULL, '{"mode":"suggested"}'::jsonb, $13::jsonb, $14::jsonb, $15::jsonb, '{}'::jsonb, '{}'::jsonb, NOW(), NOW())
         RETURNING *`,
        [
          crypto.randomUUID(),
          before.id,
          phase.id,
          phase.phaseKey,
          catalogStepKey(catalogStep, existingKeys),
          catalogStep.id,
          catalogStep.titleFa,
          catalogStep.title,
          catalogStep.defaultCustomerVisible ? catalogStep.titleFa : "",
          maxSortOrder + orderOffset,
          catalogStep.defaultRequired,
          catalogStep.defaultCustomerVisible && !catalogStep.defaultInternalOnly,
          JSON.stringify(catalogStep.defaultChecklist || []),
          JSON.stringify(catalogStep.defaultRequiredDocuments || []),
          JSON.stringify(catalogStep.defaultFormFields || []),
        ]
      );
      addedSteps.push(toStep(result.rows[0]));
      orderOffset += 1;
    }
    await client.query(
      "UPDATE shipment_workflow_templates SET updated_by_id = $2, updated_at = NOW() WHERE id = $1",
      [before.id, actorUserId || null]
    );
    const after = await getShipmentWorkflowTemplate(client, {
      organizationId: scopedOrganizationId,
      templateId: before.id,
    });
    return { before, after, addedSteps, templateId: before.id, forked: before.id !== templateId };
  });
}

export async function updateShipmentWorkflowTemplateStep(pool, { organizationId, templateId, stepId, actorUserId, body } = {}) {
  const scopedOrganizationId = requireOrganizationScope(organizationId, "updateShipmentWorkflowTemplateStep");
  return withTransaction(pool, async (client) => {
    const before = await ensureMutableTemplate(client, { organizationId: scopedOrganizationId, templateId, actorUserId });
    let mutableStepId = stepId;
    let step = before.phases.flatMap((phase) => phase.steps).find((item) => item.id === mutableStepId);
    if (!step) {
      const original = await client.query("SELECT step_key FROM shipment_workflow_template_steps WHERE id = $1 LIMIT 1", [stepId]);
      const stepKey = original.rows[0]?.step_key;
      step = before.phases.flatMap((phase) => phase.steps).find((item) => item.stepKey === stepKey);
      mutableStepId = step?.id || stepId;
    }
    if (!step) {
      const error = new Error("Workflow template step was not found.");
      error.statusCode = 404;
      error.code = "SHIPMENT_WORKFLOW_TEMPLATE_STEP_NOT_FOUND";
      throw error;
    }
    const values = [mutableStepId, before.id];
    const columns = [];
    const addColumn = (column, value) => {
      values.push(value);
      columns.push(`${column} = $${values.length}`);
    };
    if (body.phaseId !== undefined || body.phaseKey !== undefined) {
      const phase = await resolvePhase(client, before, body);
      addColumn("phase_id", phase.id);
      addColumn("phase_key", phase.phaseKey);
    }
    if (body.labelFa !== undefined) addColumn("label_fa", body.labelFa);
    if (body.labelEn !== undefined) addColumn("label_en", body.labelEn || "");
    if (body.publicLabel !== undefined) addColumn("public_label", body.publicLabel || "");
    if (body.sortOrder !== undefined) addColumn("sort_order", Math.trunc(Number(body.sortOrder)));
    if (body.isRequired !== undefined) addColumn("is_required", body.isRequired);
    if (body.isVisible !== undefined) addColumn("is_visible", body.isVisible);
    if (body.isCustomerVisible !== undefined) addColumn("is_customer_visible", body.isCustomerVisible);
    if (body.roleSuggestion !== undefined) addColumn("role_suggestion", body.roleSuggestion || null);
    if (body.expectedDurationHours !== undefined) addColumn("expected_duration_hours", body.expectedDurationHours === null ? null : Math.trunc(Number(body.expectedDurationHours)));
    if (body.taskPolicy !== undefined) {
      values.push(JSON.stringify(body.taskPolicy || {}));
      columns.push(`task_policy_json = $${values.length}::jsonb`);
    }
    if (body.checklist !== undefined) {
      values.push(JSON.stringify(body.checklist || []));
      columns.push(`checklist_json = $${values.length}::jsonb`);
    }
    if (body.expectedDocuments !== undefined) {
      values.push(JSON.stringify(body.expectedDocuments || []));
      columns.push(`expected_documents_json = $${values.length}::jsonb`);
    }
    if (body.expectedFormFields !== undefined) {
      values.push(JSON.stringify(body.expectedFormFields || []));
      columns.push(`expected_form_fields_json = $${values.length}::jsonb`);
    }
    if (body.nextStepRules !== undefined) {
      values.push(JSON.stringify(body.nextStepRules || {}));
      columns.push(`next_step_rules_json = $${values.length}::jsonb`);
    }
    if (columns.length) {
      await client.query(
        `UPDATE shipment_workflow_template_steps
         SET ${columns.join(", ")}, updated_at = NOW()
         WHERE id = $1 AND template_id = $2`,
        values
      );
      await client.query(
        "UPDATE shipment_workflow_templates SET updated_by_id = $2, updated_at = NOW() WHERE id = $1",
        [before.id, actorUserId || null]
      );
    }
    const after = await getShipmentWorkflowTemplate(client, {
      organizationId: scopedOrganizationId,
      templateId: before.id,
    });
    return { before, after, templateId: before.id, stepId: mutableStepId, forked: before.id !== templateId };
  });
}

export async function archiveShipmentWorkflowTemplateStep(pool, { organizationId, templateId, stepId, actorUserId } = {}) {
  const scopedOrganizationId = requireOrganizationScope(organizationId, "archiveShipmentWorkflowTemplateStep");
  return withTransaction(pool, async (client) => {
    const before = await ensureMutableTemplate(client, { organizationId: scopedOrganizationId, templateId, actorUserId });
    let mutableStepId = stepId;
    let step = before.phases.flatMap((phase) => phase.steps).find((item) => item.id === mutableStepId);
    if (!step) {
      const original = await client.query("SELECT step_key FROM shipment_workflow_template_steps WHERE id = $1 LIMIT 1", [stepId]);
      const stepKey = original.rows[0]?.step_key;
      step = before.phases.flatMap((phase) => phase.steps).find((item) => item.stepKey === stepKey);
      mutableStepId = step?.id || stepId;
    }
    if (!step) {
      const error = new Error("Workflow template step was not found.");
      error.statusCode = 404;
      error.code = "SHIPMENT_WORKFLOW_TEMPLATE_STEP_NOT_FOUND";
      throw error;
    }
    if (step.isRequired) {
      const error = new Error("Required workflow steps can only be hidden, not archived.");
      error.statusCode = 400;
      error.code = "REQUIRED_WORKFLOW_STEP_ARCHIVE_BLOCKED";
      throw error;
    }
    const result = await client.query(
      `UPDATE shipment_workflow_template_steps
       SET is_visible = FALSE,
           is_customer_visible = FALSE,
           archived_at = NOW(),
           updated_at = NOW()
       WHERE id = $1 AND template_id = $2
       RETURNING *`,
      [mutableStepId, before.id]
    );
    await client.query(
      "UPDATE shipment_workflow_templates SET updated_by_id = $2, updated_at = NOW() WHERE id = $1",
      [before.id, actorUserId || null]
    );
    const after = await getShipmentWorkflowTemplate(client, {
      organizationId: scopedOrganizationId,
      templateId: before.id,
    });
    return { before, after, step: toStep(result.rows[0]), templateId: before.id, forked: before.id !== templateId };
  });
}

export async function archiveShipmentWorkflowTemplate(pool, { organizationId, templateId, actorUserId, body = {} } = {}) {
  const scopedOrganizationId = requireOrganizationScope(organizationId, "archiveShipmentWorkflowTemplate");
  return withTransaction(pool, async (client) => {
    const before = await getShipmentWorkflowTemplate(client, {
      organizationId: scopedOrganizationId,
      templateId,
    });
    if (!before) {
      const error = new Error("Shipment workflow template was not found.");
      error.statusCode = 404;
      error.code = "SHIPMENT_WORKFLOW_TEMPLATE_NOT_FOUND";
      throw error;
    }
    if (!before.organizationId || before.isSystem) {
      const error = new Error("System workflow templates cannot be archived by tenant admins.");
      error.statusCode = 400;
      error.code = "SYSTEM_WORKFLOW_TEMPLATE_ARCHIVE_BLOCKED";
      throw error;
    }
    if (before.organizationId !== scopedOrganizationId) {
      const error = new Error("Shipment workflow template is outside this organization.");
      error.statusCode = 403;
      error.code = "SHIPMENT_WORKFLOW_TEMPLATE_SCOPE_MISMATCH";
      throw error;
    }
    const result = await client.query(
      `UPDATE shipment_workflow_templates
       SET archived_at = COALESCE(archived_at, NOW()),
           archived_by_id = $2,
           archived_reason = $3,
           is_active = FALSE,
           updated_by_id = $2,
           updated_at = NOW()
       WHERE id = $1
         AND organization_id = $4
       RETURNING *`,
      [
        before.id,
        actorUserId || null,
        body.reason || body.archivedReason || null,
        scopedOrganizationId,
      ]
    );
    await client.query(
      `UPDATE shipment_type_workflow_templates
       SET archived_at = COALESCE(archived_at, NOW()),
           updated_by_id = $2,
           updated_at = NOW()
       WHERE workflow_template_id = $1
         AND organization_id = $3
         AND archived_at IS NULL`,
      [before.id, actorUserId || null, scopedOrganizationId]
    );
    const after = await composeTemplate(client, result.rows[0]);
    return { before, after, templateId: before.id };
  });
}

export async function deleteShipmentWorkflowTemplate(pool, { organizationId, templateId } = {}) {
  const scopedOrganizationId = requireOrganizationScope(organizationId, "deleteShipmentWorkflowTemplate");
  return withTransaction(pool, async (client) => {
    const row = await findTemplateRow(client, {
      organizationId: scopedOrganizationId,
      templateId,
      includeArchived: true,
    });
    const template = await composeTemplate(client, row);
    if (!template) {
      const error = new Error("Shipment workflow template was not found.");
      error.statusCode = 404;
      error.code = "SHIPMENT_WORKFLOW_TEMPLATE_NOT_FOUND";
      throw error;
    }
    if (template.isSystem || !template.organizationId) {
      const error = new Error("System workflow templates cannot be hard deleted.");
      error.statusCode = 400;
      error.code = "SYSTEM_WORKFLOW_TEMPLATE_DELETE_BLOCKED";
      throw error;
    }
    if (template.organizationId !== scopedOrganizationId) {
      const error = new Error("Shipment workflow template is outside this organization.");
      error.statusCode = 403;
      error.code = "SHIPMENT_WORKFLOW_TEMPLATE_SCOPE_MISMATCH";
      throw error;
    }
    if (!template.canDelete) {
      const error = new Error("This workflow template is referenced by shipments, mappings, or audit history. Archive it instead.");
      error.statusCode = 409;
      error.code = "SHIPMENT_WORKFLOW_TEMPLATE_DELETE_BLOCKED";
      error.metadata = {
        workflowInstanceCount: template.workflowInstanceCount,
        activeMappingCount: template.activeMappingCount,
        auditEventCount: template.auditEventCount,
      };
      throw error;
    }
    await client.query("DELETE FROM shipment_workflow_templates WHERE id = $1 AND organization_id = $2", [
      template.id,
      scopedOrganizationId,
    ]);
    return { before: template, templateId: template.id };
  });
}

export async function setShipmentTypeWorkflowTemplate(pool, { organizationId, shipmentTypeCode, templateId, actorUserId } = {}) {
  const scopedOrganizationId = requireOrganizationScope(organizationId, "setShipmentTypeWorkflowTemplate");
  return withTransaction(pool, async (client) => {
    const template = await getShipmentWorkflowTemplate(client, {
      organizationId: scopedOrganizationId,
      templateId,
    });
    if (!template) {
      const error = new Error("Shipment workflow template was not found.");
      error.statusCode = 404;
      error.code = "SHIPMENT_WORKFLOW_TEMPLATE_NOT_FOUND";
      throw error;
    }
    await upsertWorkflowTypeMapping(client, {
      organizationId: scopedOrganizationId,
      shipmentTypeCode,
      template,
      actorUserId,
    });
    return {
      shipmentTypeCode: normalizeShipmentTypeCode(shipmentTypeCode),
      template,
    };
  });
}

export async function getActiveShipmentWorkflowTemplateForShipment(queryable, { organizationId, shipmentId } = {}) {
  const scopedOrganizationId = requireOrganizationScope(organizationId, "getActiveShipmentWorkflowTemplateForShipment");
  const shipmentResult = await queryable.query(
    `SELECT id, shipment_type_code, shipment_direction, transport_mode
     FROM shipments
     WHERE id = $1
       AND organization_id = $2
       AND archived_at IS NULL
     LIMIT 1`,
    [shipmentId, scopedOrganizationId]
  );
  const shipment = shipmentResult.rows[0];
  if (!shipment) return null;
  const defaults = templateTypeDefaults(shipment.shipment_type_code);
  const typeCode = normalizeShipmentTypeCode(shipment.shipment_type_code || defaults.shipmentTypeCode);
  const mappingResult = await queryable.query(
    `SELECT templates.*
     FROM shipment_type_workflow_templates mapping
     JOIN shipment_workflow_templates templates
       ON templates.id = mapping.workflow_template_id
      AND templates.archived_at IS NULL
     WHERE mapping.shipment_type_code = $2
       AND mapping.archived_at IS NULL
       AND (mapping.organization_id = $1 OR mapping.organization_id IS NULL)
     ORDER BY CASE WHEN mapping.organization_id = $1 THEN 0 ELSE 1 END ASC,
              mapping.updated_at DESC
     LIMIT 1`,
    [scopedOrganizationId, typeCode]
  );
  let template = await composeTemplate(queryable, mappingResult.rows[0] || null);
  const direction = shipment.shipment_direction || defaults.shipmentDirection;
  if (!template && direction === "import") {
    template = await getShipmentWorkflowTemplate(queryable, {
      organizationId: scopedOrganizationId,
      templateId: SYSTEM_IR_IMPORT_TEMPLATE_ID,
    });
  }
  return {
    shipment: {
      id: shipment.id,
      shipmentTypeCode: typeCode,
      shipmentDirection: direction,
      transportMode: shipment.transport_mode || defaults.transportMode,
    },
    template,
  };
}

export async function getWorkflowDefinitionForShipment(queryable, { organizationId, shipmentId } = {}) {
  const active = await getActiveShipmentWorkflowTemplateForShipment(queryable, { organizationId, shipmentId });
  return active?.template ? workflowDefinitionFromTemplate(active.template) : null;
}

export async function getWorkflowDefinitionForInstance(queryable, { organizationId, instance } = {}) {
  const scopedOrganizationId = requireOrganizationScope(organizationId, "getWorkflowDefinitionForInstance");
  if (!instance) return null;
  const snapshot = normalizeWorkflowDefinition(jsonValue(instance.workflow_definition_snapshot_json, null));
  if (snapshot) return snapshot;
  if (instance.workflow_template_id) {
    const template = await getShipmentWorkflowTemplate(queryable, {
      organizationId: scopedOrganizationId,
      templateId: instance.workflow_template_id,
    });
    if (template) return workflowDefinitionFromTemplate(template);
  }
  if (instance.workflow_template_code && instance.workflow_template_version) {
    const template = await getWorkflowTemplateByCodeVersion(queryable, {
      organizationId: scopedOrganizationId,
      code: instance.workflow_template_code,
      version: instance.workflow_template_version,
    });
    if (template) return workflowDefinitionFromTemplate(template);
  }
  if (instance.workflow_key === DEFAULT_WORKFLOW_TEMPLATE_CODE) {
    const template = await getShipmentWorkflowTemplate(queryable, {
      organizationId: scopedOrganizationId,
      templateId: SYSTEM_IR_IMPORT_TEMPLATE_ID,
    });
    if (template) return workflowDefinitionFromTemplate(template);
  }
  return null;
}

export const shipmentWorkflowTemplateCatalog = {
  shipmentTypes: SHIPMENT_TYPES,
};
