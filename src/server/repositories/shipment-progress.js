import crypto from "node:crypto";
import {
  IR_IMPORT_CUSTOMS_BLOCKERS,
  IR_IMPORT_CUSTOMS_PHASES,
  IR_IMPORT_CUSTOMS_STEPS,
  IR_IMPORT_CUSTOMS_WORKFLOW_KEY,
  getIranImportBlocker,
  isValidIranImportBlockerCode,
  isValidIranImportRoute,
  isVisibleForCustomsRoute,
  safePublicBlockerMessage,
} from "../../shared/iran-import-customs-workflow.js";
import {
  getActiveShipmentWorkflowTemplateForShipment,
  getWorkflowDefinitionForInstance,
  getWorkflowDefinitionForShipment,
  normalizeWorkflowDefinition,
  workflowDefinitionFromTemplate,
} from "./shipment-workflow-templates.js";
import { requireOrganizationScope } from "../tenant-scope.js";
import { withTransaction } from "../transaction.js";

function fallbackWorkflowDefinition() {
  return normalizeWorkflowDefinition({
    key: IR_IMPORT_CUSTOMS_WORKFLOW_KEY,
    code: IR_IMPORT_CUSTOMS_WORKFLOW_KEY,
    version: 1,
    titleFa: "فرآیند واردات و ترخیص ایران",
    titleEn: "Iran import customs progression",
    phases: IR_IMPORT_CUSTOMS_PHASES,
    steps: IR_IMPORT_CUSTOMS_STEPS.map((step) => ({
      ...step,
      phaseKey: step.phaseId,
      stepKey: step.code,
      publicLabel: step.phaseId === "customs_route" ? "پرونده در حال بررسی گمرکی است" : step.labelFa,
      isRequired: true,
      isVisible: true,
      isCustomerVisible: true,
      visibilityRule: step.phaseId === "customs_route" ? { type: "iran_customs_route_v1" } : {},
    })),
    blockers: IR_IMPORT_CUSTOMS_BLOCKERS,
    routeVisibilityRule: "iran_customs_route_v1",
  });
}

function stepByCode(definition, code) {
  return (definition?.steps || []).find((step) => step.code === String(code || "") || step.stepKey === String(code || "")) || null;
}

function phaseById(definition, id) {
  return (definition?.phases || []).find((phase) => phase.id === String(id || "") || phase.phaseKey === String(id || "")) || null;
}

function blockerByCode(definition, code) {
  return (definition?.blockers || IR_IMPORT_CUSTOMS_BLOCKERS).find((blocker) => blocker.code === String(code || "")) || null;
}

function isValidWorkflowStepCode(definition, code) {
  return Boolean(stepByCode(definition, code));
}

function isVisibleForWorkflowRoute(step, customsRoute) {
  if (step?.visibilityRule?.type === "iran_customs_route_v1") {
    return isVisibleForCustomsRoute(step.code, customsRoute);
  }
  return step?.isVisible !== false;
}

function publicLabelForWorkflowStep(definition, stepCode) {
  const step = stepByCode(definition, stepCode);
  return step?.publicLabel || step?.labelFa || "وضعیت محموله به‌روزرسانی شد";
}

function publicPhaseForWorkflowStep(definition, stepCode) {
  const step = stepByCode(definition, stepCode);
  const phase = step ? phaseById(definition, step.phaseId || step.phaseKey) : null;
  return phase?.labelFa || "پیگیری محموله";
}

function terminalStepCode(definition) {
  const ordered = [...(definition?.steps || [])].sort((a, b) => a.order - b.order);
  return ordered[ordered.length - 1]?.code || "066";
}

function normalizeInstance(row) {
  if (!row) return null;
  return {
    id: row.id,
    workflowKey: row.workflow_key,
    workflowTemplateId: row.workflow_template_id || null,
    workflowTemplateCode: row.workflow_template_code || null,
    workflowTemplateVersion: row.workflow_template_version || null,
    status: row.status,
    shipmentId: row.shipment_id,
    currentStepCode: row.current_step_code,
    customsRoute: row.customs_route || null,
    startedByUserId: row.started_by_user_id || null,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    metadata: row.metadata || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeStep(row, definition) {
  const stepDefinition = stepByCode(definition, row.step_code);
  const phase = stepDefinition ? phaseById(definition, stepDefinition.phaseId || stepDefinition.phaseKey) : null;
  return {
    code: row.step_code,
    phaseId: stepDefinition?.phaseId || stepDefinition?.phaseKey || null,
    phaseLabelFa: phase?.labelFa || "",
    phaseLabelEn: phase?.labelEn || "",
    labelFa: stepDefinition?.labelFa || row.step_code,
    labelEn: stepDefinition?.labelEn || row.step_code,
    publicLabel: stepDefinition?.publicLabel || stepDefinition?.labelFa || row.step_code,
    isRequired: stepDefinition?.isRequired !== false,
    isCustomerVisible: stepDefinition?.isCustomerVisible !== false,
    roleSuggestion: stepDefinition?.roleSuggestion || "",
    expectedDurationHours: stepDefinition?.expectedDurationHours ?? null,
    taskPolicy: stepDefinition?.taskPolicy || {},
    expectedDocuments: stepDefinition?.expectedDocuments || [],
    expectedFormFields: stepDefinition?.expectedFormFields || [],
    order: stepDefinition?.order || 0,
    status: row.status,
    isVisible: row.is_visible !== false,
    isExceptional: Boolean(row.is_exceptional),
    internalNote: row.internal_note || "",
    publicNote: row.public_note || "",
    metadata: row.metadata || {},
    completedByUserId: row.completed_by_user_id || null,
    completedAt: row.completed_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeBlocker(row, definition) {
  const blockerDefinition = blockerByCode(definition, row.blocker_code) || getIranImportBlocker(row.blocker_code);
  return {
    id: row.id,
    workflowInstanceId: row.workflow_instance_id,
    shipmentId: row.shipment_id,
    stepCode: row.step_code || null,
    blockerCode: row.blocker_code,
    labelFa: blockerDefinition?.labelFa || row.blocker_code,
    labelEn: blockerDefinition?.labelEn || row.blocker_code,
    status: row.status,
    internalNote: row.internal_note || "",
    publicNote: row.public_note || "",
    metadata: row.metadata || {},
    createdByUserId: row.created_by_user_id || null,
    createdAt: row.created_at,
    resolvedByUserId: row.resolved_by_user_id || null,
    resolvedAt: row.resolved_at || null,
    updatedAt: row.updated_at,
  };
}

function normalizeEvent(row) {
  return {
    id: row.id,
    workflowInstanceId: row.workflow_instance_id,
    shipmentId: row.shipment_id,
    eventType: row.event_type,
    stepCode: row.step_code || null,
    blockerId: row.blocker_id || null,
    blockerCode: row.blocker_code || null,
    actorUserId: row.actor_user_id || null,
    actorName: row.actor_name || "",
    internalNote: row.internal_note || "",
    publicNote: row.public_note || "",
    publicVisible: Boolean(row.public_visible),
    metadata: row.metadata || {},
    createdAt: row.created_at,
  };
}

function nextVisibleStepCode(steps, currentCode) {
  const current = steps.find((step) => step.code === currentCode);
  if (!current) return currentCode;
  const next = steps
    .filter((step) => step.isVisible && step.status !== "completed" && step.status !== "skipped")
    .sort((a, b) => a.order - b.order)
    .find((step) => step.order > current.order);
  return next?.code || currentCode;
}

function progressSummary(steps, currentStepCode, blockers, definition) {
  const publicSteps = steps.filter((step) => step.isVisible && step.isCustomerVisible !== false);
  const completed = publicSteps.filter((step) => step.status === "completed").length;
  const currentStep =
    steps.find((step) => step.code === currentStepCode) ||
    publicSteps.find((step) => step.status === "active") ||
    publicSteps.find((step) => step.status !== "completed") ||
    publicSteps[publicSteps.length - 1] ||
    null;
  const openBlockers = blockers.filter((blocker) => blocker.status === "open");
  return {
    currentStepCode: currentStep?.code || null,
    currentLabelFa: currentStep?.labelFa || "",
    currentLabelEn: currentStep?.labelEn || "",
    currentPublicPhase: currentStep ? publicPhaseForWorkflowStep(definition, currentStep.code) : "",
    currentPublicLabel: currentStep ? publicLabelForWorkflowStep(definition, currentStep.code) : "",
    completedStepsCount: completed,
    totalStepsCount: publicSteps.length,
    openBlockersCount: openBlockers.length,
    isBlocked: openBlockers.length > 0,
  };
}

async function getShipment(queryable, shipmentId, organizationId, { lock = false } = {}) {
  const result = await queryable.query(
    `SELECT id, organization_id, owner_user_id, assigned_manager_id, shipment_code,
            shipment_type_code, shipment_direction, transport_mode
     FROM shipments
     WHERE id = $1 AND organization_id = $2
     ${lock ? "FOR UPDATE" : ""}
     LIMIT 1`,
    [shipmentId, organizationId]
  );
  return result.rows[0] || null;
}

async function getInstance(queryable, shipmentId, organizationId) {
  const result = await queryable.query(
    `SELECT *
     FROM shipment_workflow_instances
     WHERE shipment_id = $1
       AND organization_id = $2
       AND status <> 'cancelled'
     ORDER BY created_at DESC
     LIMIT 1`,
    [shipmentId, organizationId]
  );
  return result.rows[0] || null;
}

async function createWorkflowInstance(queryable, { shipmentId, organizationId, actorUserId, metadata = {} } = {}) {
  const activeTemplate = await getActiveShipmentWorkflowTemplateForShipment(queryable, {
    organizationId,
    shipmentId,
  });
  if (!activeTemplate) return null;
  if (!activeTemplate.template && activeTemplate.shipment?.shipmentDirection !== "import") return null;
  const definition = activeTemplate?.template
    ? workflowDefinitionFromTemplate(activeTemplate.template)
    : fallbackWorkflowDefinition();
  if (!definition?.steps?.length) return null;
  const firstStep = [...definition.steps].sort((a, b) => a.order - b.order)[0];
  const instanceId = crypto.randomUUID();
  const instanceResult = await queryable.query(
    `INSERT INTO shipment_workflow_instances (
       id, organization_id, shipment_id, workflow_key, workflow_template_id,
       workflow_template_code, workflow_template_version, workflow_definition_snapshot_json,
       status, current_step_code, started_by_user_id, metadata
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, 'active', $9, $10, $11::jsonb)
     RETURNING *`,
    [
      instanceId,
      organizationId,
      shipmentId,
      definition.code || definition.key || IR_IMPORT_CUSTOMS_WORKFLOW_KEY,
      definition.templateId || activeTemplate?.template?.id || null,
      definition.code || definition.key || IR_IMPORT_CUSTOMS_WORKFLOW_KEY,
      definition.version || activeTemplate?.template?.version || 1,
      JSON.stringify(definition),
      firstStep.code,
      actorUserId || null,
      JSON.stringify(metadata || {}),
    ]
  );
  const instance = instanceResult.rows[0];

  for (const step of definition.steps) {
    await queryable.query(
      `INSERT INTO shipment_workflow_step_states (
         workflow_instance_id, organization_id, shipment_id, step_code, status, is_visible
       )
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        instanceId,
        organizationId,
        shipmentId,
        step.code,
        step.code === firstStep.code ? "active" : "pending",
        isVisibleForWorkflowRoute(step, null),
      ]
    );
  }

  await insertEvent(queryable, instance, {
    eventType: "workflow.started",
    stepCode: firstStep.code,
    actorUserId,
    metadata: { ...metadata, workflowTemplateCode: definition.code, workflowTemplateVersion: definition.version },
  });
  return instance;
}

async function insertEvent(queryable, instance, {
  eventType,
  stepCode,
  blockerId,
  blockerCode,
  actorUserId,
  internalNote,
  publicNote,
  publicVisible = false,
  metadata = {},
}) {
  await queryable.query(
    `INSERT INTO shipment_workflow_events (
       id, organization_id, workflow_instance_id, shipment_id, event_type, step_code,
       blocker_id, blocker_code, actor_user_id, internal_note, public_note, public_visible, metadata
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb)`,
    [
      crypto.randomUUID(),
      instance.organization_id,
      instance.id,
      instance.shipment_id,
      eventType,
      stepCode || null,
      blockerId || null,
      blockerCode || null,
      actorUserId || null,
      internalNote || null,
      publicNote || null,
      Boolean(publicVisible),
      JSON.stringify(metadata || {}),
    ]
  );
}

async function writePublicProjection(queryable, instance, definition, { stepCode, publicNote, actorUserId }) {
  const trimmed = String(publicNote || "").trim();
  if (!trimmed) return;
  await queryable.query(
    `INSERT INTO shipment_status_events (
       id, organization_id, shipment_id, public_label, public_description, is_customer_visible, created_by_id
     )
     VALUES ($1, $2, $3, $4, $5, TRUE, $6)`,
    [
      crypto.randomUUID(),
      instance.organization_id,
      instance.shipment_id,
      publicLabelForWorkflowStep(definition, stepCode),
      trimmed,
      actorUserId || null,
    ]
  );
}

async function buildProgressPayload(queryable, shipmentId, organizationId) {
  const shipment = await getShipment(queryable, shipmentId, organizationId);
  if (!shipment) return null;
  const instance = await getInstance(queryable, shipmentId, organizationId);
  if (!instance) {
    const definition = await getWorkflowDefinitionForShipment(queryable, {
      organizationId,
      shipmentId,
    });
    return {
      definition,
      shipmentId,
      workflow: null,
      phases: definition?.phases || [],
      steps: [],
      blockers: [],
      history: [],
      summary: null,
    };
  }
  const definition = await getWorkflowDefinitionForInstance(queryable, {
    organizationId,
    instance,
  }) || fallbackWorkflowDefinition();

  const stepsResult = await queryable.query(
    `SELECT *
     FROM shipment_workflow_step_states
     WHERE workflow_instance_id = $1 AND organization_id = $2
     ORDER BY step_code ASC`,
    [instance.id, organizationId]
  );
  const blockersResult = await queryable.query(
    `SELECT *
     FROM shipment_workflow_blockers
     WHERE workflow_instance_id = $1 AND organization_id = $2
     ORDER BY created_at DESC`,
    [instance.id, organizationId]
  );
  const eventsResult = await queryable.query(
    `SELECT e.*, u.name AS actor_name
     FROM shipment_workflow_events e
     LEFT JOIN app_users u ON u.id = e.actor_user_id
     WHERE e.workflow_instance_id = $1 AND e.organization_id = $2
     ORDER BY e.created_at DESC
     LIMIT 100`,
    [instance.id, organizationId]
  );

  const normalizedSteps = stepsResult.rows
    .map((row) => normalizeStep(row, definition))
    .sort((a, b) => a.order - b.order);
  const blockers = blockersResult.rows.map((row) => normalizeBlocker(row, definition));
  return {
    definition,
    shipmentId,
    workflow: normalizeInstance(instance),
    phases: definition.phases || [],
    steps: normalizedSteps.map((step) => ({
      ...step,
      blockers: blockers.filter((blocker) => blocker.stepCode === step.code),
    })),
    blockers,
    history: eventsResult.rows.map(normalizeEvent),
    summary: progressSummary(normalizedSteps, instance.current_step_code, blockers, definition),
  };
}

export async function getShipmentWorkflowProgress(pool, { shipmentId, organizationId } = {}) {
  const scopedOrganizationId = requireOrganizationScope(organizationId, "getShipmentWorkflowProgress");
  return buildProgressPayload(pool, shipmentId, scopedOrganizationId);
}

export async function startShipmentWorkflow(pool, { shipmentId, organizationId, actorUserId, metadata = {} } = {}) {
  const scopedOrganizationId = requireOrganizationScope(organizationId, "startShipmentWorkflow");
  return withTransaction(pool, async (client) => {
    const shipment = await getShipment(client, shipmentId, scopedOrganizationId, { lock: true });
    if (!shipment) return null;

    const existing = await getInstance(client, shipmentId, scopedOrganizationId);
    if (existing) return buildProgressPayload(client, shipmentId, scopedOrganizationId);

    const created = await createWorkflowInstance(client, {
      shipmentId,
      organizationId: scopedOrganizationId,
      actorUserId,
      metadata,
    });
    if (!created) return { noWorkflowTemplate: true };
    return buildProgressPayload(client, shipmentId, scopedOrganizationId);
  });
}

export async function updateShipmentWorkflowCurrent(pool, {
  shipmentId,
  organizationId,
  actorUserId,
  stepCode,
  status,
  customsRoute,
  internalNote,
  publicNote,
  publicVisible = false,
  isVisible,
  isExceptional,
  metadata = {},
} = {}) {
  const scopedOrganizationId = requireOrganizationScope(organizationId, "updateShipmentWorkflowCurrent");
  const payload = await withTransaction(pool, async (client) => {
    let instance = await getInstance(client, shipmentId, scopedOrganizationId);
    if (customsRoute && !isValidIranImportRoute(customsRoute)) return { invalidRoute: true };
    if (!instance) {
      const shipment = await getShipment(client, shipmentId, scopedOrganizationId, { lock: true });
      if (!shipment) return null;
      instance = await createWorkflowInstance(client, {
        shipmentId,
        organizationId: scopedOrganizationId,
        actorUserId,
        metadata: { autoStartedBy: "progress_mutation", ...metadata },
      });
      if (!instance) return { noWorkflowTemplate: true };
    }
    const definition = await getWorkflowDefinitionForInstance(client, {
      organizationId: scopedOrganizationId,
      instance,
    }) || fallbackWorkflowDefinition();
    const firstStepCode = [...(definition.steps || [])].sort((a, b) => a.order - b.order)[0]?.code || "001";
    const code = String(stepCode || instance?.current_step_code || firstStepCode);
    if (!isValidWorkflowStepCode(definition, code)) return { invalidStep: true };

    const nextRoute = customsRoute || instance.customs_route || null;
    if (customsRoute) {
      await client.query(
        `UPDATE shipment_workflow_instances
         SET customs_route = $3, updated_at = NOW()
         WHERE id = $1 AND organization_id = $2`,
        [instance.id, scopedOrganizationId, customsRoute]
      );
      for (const step of definition.steps || []) {
        await client.query(
          `UPDATE shipment_workflow_step_states
           SET is_visible = CASE WHEN is_exceptional THEN TRUE ELSE $4 END,
               updated_at = NOW()
           WHERE workflow_instance_id = $1
             AND organization_id = $2
             AND step_code = $3`,
          [instance.id, scopedOrganizationId, step.code, isVisibleForWorkflowRoute(step, customsRoute)]
        );
      }
    }

    const currentStateResult = await client.query(
      `SELECT *
       FROM shipment_workflow_step_states
       WHERE workflow_instance_id = $1 AND organization_id = $2 AND step_code = $3
       LIMIT 1`,
      [instance.id, scopedOrganizationId, code]
    );
    const currentState = currentStateResult.rows[0];
    if (!currentState) return { invalidStep: true };

    const hasStatusUpdate = status !== undefined;
    const nextStatus = hasStatusUpdate ? String(status).toLowerCase() : currentState.status;
    let eventType = customsRoute && !hasStatusUpdate ? "workflow.route.selected" : "workflow.step.updated";
    let completedAt = null;
    let completedBy = null;

    if (nextStatus === "completed" || nextStatus === "done") {
      eventType = "workflow.step.completed";
      completedAt = new Date();
      completedBy = actorUserId || null;
    } else if (nextStatus === "skipped") {
      eventType = "workflow.step.skipped";
    } else if (hasStatusUpdate && (nextStatus === "active" || nextStatus === "current" || nextStatus === "in_progress")) {
      eventType = "workflow.current_step.set";
      await client.query(
        `UPDATE shipment_workflow_step_states
         SET status = 'pending', updated_at = NOW()
         WHERE workflow_instance_id = $1
           AND organization_id = $2
           AND status = 'active'
           AND step_code <> $3`,
        [instance.id, scopedOrganizationId, code]
      );
    }

    const storedStatus =
      nextStatus === "completed" || nextStatus === "done"
        ? "completed"
        : nextStatus === "skipped"
          ? "skipped"
          : "active";

    await client.query(
      `UPDATE shipment_workflow_step_states
       SET status = $4,
           internal_note = CASE WHEN $5::text IS NULL THEN internal_note ELSE $5 END,
           public_note = CASE WHEN $6::text IS NULL THEN public_note ELSE $6 END,
           is_visible = COALESCE($7::boolean, is_visible),
           is_exceptional = COALESCE($8::boolean, is_exceptional),
           completed_at = CASE WHEN $4 = 'completed' THEN COALESCE(completed_at, $9) ELSE completed_at END,
           completed_by_user_id = CASE WHEN $4 = 'completed' THEN COALESCE(completed_by_user_id, $10) ELSE completed_by_user_id END,
           metadata = metadata || $11::jsonb,
           updated_at = NOW()
       WHERE workflow_instance_id = $1
         AND organization_id = $2
         AND step_code = $3`,
      [
        instance.id,
        scopedOrganizationId,
        code,
        storedStatus,
        internalNote === undefined ? null : internalNote || "",
        publicNote === undefined ? null : publicNote || "",
        isVisible === undefined ? null : Boolean(isVisible),
        isExceptional === undefined ? null : Boolean(isExceptional),
        completedAt,
        completedBy,
        JSON.stringify(metadata || {}),
      ]
    );

    const stepsResult = await client.query(
      `SELECT *
       FROM shipment_workflow_step_states
       WHERE workflow_instance_id = $1 AND organization_id = $2`,
      [instance.id, scopedOrganizationId]
    );
    const normalizedSteps = stepsResult.rows.map((row) => normalizeStep(row, definition));
    const nextCurrent =
      storedStatus === "completed"
        ? nextVisibleStepCode(normalizedSteps, code)
        : hasStatusUpdate && storedStatus === "active"
          ? code
          : instance.current_step_code;
    const instanceStatus = code === terminalStepCode(definition) && storedStatus === "completed" ? "completed" : "active";
    if (storedStatus === "completed" && nextCurrent && nextCurrent !== code && instanceStatus === "active") {
      await client.query(
        `UPDATE shipment_workflow_step_states
         SET status = 'pending', updated_at = NOW()
         WHERE workflow_instance_id = $1
           AND organization_id = $2
           AND status = 'active'
           AND step_code <> $3`,
        [instance.id, scopedOrganizationId, nextCurrent]
      );
      await client.query(
        `UPDATE shipment_workflow_step_states
         SET status = 'active', updated_at = NOW()
         WHERE workflow_instance_id = $1
           AND organization_id = $2
           AND step_code = $3
           AND status NOT IN ('completed', 'skipped')`,
        [instance.id, scopedOrganizationId, nextCurrent]
      );
    }
    await client.query(
      `UPDATE shipment_workflow_instances
       SET current_step_code = $3,
           customs_route = COALESCE($4, customs_route),
           status = $5,
           completed_at = CASE WHEN $5 = 'completed' THEN COALESCE(completed_at, NOW()) ELSE completed_at END,
           updated_at = NOW()
       WHERE id = $1 AND organization_id = $2`,
      [instance.id, scopedOrganizationId, nextCurrent, nextRoute, instanceStatus]
    );

    const refreshedInstance = {
      ...instance,
      current_step_code: nextCurrent,
      customs_route: nextRoute,
      status: instanceStatus,
    };
    await insertEvent(client, refreshedInstance, {
      eventType,
      stepCode: code,
      actorUserId,
      internalNote,
      publicNote,
      publicVisible: Boolean(publicVisible || publicNote),
      metadata: { ...metadata, status: storedStatus, customsRoute: nextRoute },
    });
    await writePublicProjection(client, refreshedInstance, definition, {
      stepCode: code,
      publicNote,
      actorUserId,
    });
    return buildProgressPayload(client, shipmentId, scopedOrganizationId);
  });
  return payload;
}

export async function addShipmentWorkflowBlocker(pool, {
  shipmentId,
  organizationId,
  actorUserId,
  stepCode,
  blockerCode,
  internalNote,
  publicNote,
  metadata = {},
} = {}) {
  const scopedOrganizationId = requireOrganizationScope(organizationId, "addShipmentWorkflowBlocker");
  const payload = await withTransaction(pool, async (client) => {
    if (!isValidIranImportBlockerCode(blockerCode)) return { invalidBlocker: true };
    let instance = await getInstance(client, shipmentId, scopedOrganizationId);
    if (!instance) {
      const shipment = await getShipment(client, shipmentId, scopedOrganizationId, { lock: true });
      if (!shipment) return null;
      instance = await createWorkflowInstance(client, {
        shipmentId,
        organizationId: scopedOrganizationId,
        actorUserId,
        metadata: { autoStartedBy: "blocker_mutation", ...metadata },
      });
      if (!instance) return { noWorkflowTemplate: true };
    }
    const definition = await getWorkflowDefinitionForInstance(client, {
      organizationId: scopedOrganizationId,
      instance,
    }) || fallbackWorkflowDefinition();
    if (stepCode && !isValidWorkflowStepCode(definition, stepCode)) return { invalidStep: true };

    const blockerId = crypto.randomUUID();
    const result = await client.query(
      `INSERT INTO shipment_workflow_blockers (
         id, organization_id, workflow_instance_id, shipment_id, step_code, blocker_code,
         status, internal_note, public_note, metadata, created_by_user_id
       )
       VALUES ($1, $2, $3, $4, $5, $6, 'open', $7, $8, $9::jsonb, $10)
       RETURNING *`,
      [
        blockerId,
        scopedOrganizationId,
        instance.id,
        shipmentId,
        stepCode || instance.current_step_code || null,
        blockerCode,
        internalNote || null,
        publicNote || null,
        JSON.stringify(metadata || {}),
        actorUserId || null,
      ]
    );
    await insertEvent(client, instance, {
      eventType: "workflow.blocker.added",
      stepCode: stepCode || instance.current_step_code,
      blockerId,
      blockerCode,
      actorUserId,
      internalNote,
      publicNote,
      publicVisible: Boolean(publicNote),
      metadata,
    });
    await writePublicProjection(client, instance, definition, {
      stepCode: stepCode || instance.current_step_code,
      publicNote: publicNote ? safePublicBlockerMessage(publicNote) : "",
      actorUserId,
    });
    return {
      blocker: normalizeBlocker(result.rows[0], definition),
      progress: await buildProgressPayload(client, shipmentId, scopedOrganizationId),
    };
  });
  return payload;
}

export async function resolveShipmentWorkflowBlocker(pool, {
  shipmentId,
  organizationId,
  actorUserId,
  blockerId,
  blockerCode,
  internalNote,
  publicNote,
  status = "resolved",
  metadata = {},
} = {}) {
  const scopedOrganizationId = requireOrganizationScope(organizationId, "resolveShipmentWorkflowBlocker");
  const payload = await withTransaction(pool, async (client) => {
    const instance = await getInstance(client, shipmentId, scopedOrganizationId);
    if (!instance) return null;
    const definition = await getWorkflowDefinitionForInstance(client, {
      organizationId: scopedOrganizationId,
      instance,
    }) || fallbackWorkflowDefinition();
    const nextStatus = status === "cancelled" ? "cancelled" : "resolved";
    const values = [
      scopedOrganizationId,
      instance.id,
      shipmentId,
      nextStatus,
      actorUserId || null,
      internalNote || null,
      publicNote || null,
      JSON.stringify(metadata || {}),
    ];
    let filter = "";
    if (blockerId) {
      values.push(blockerId);
      filter = `AND id = $${values.length}`;
    } else {
      if (!isValidIranImportBlockerCode(blockerCode)) return { invalidBlocker: true };
      values.push(blockerCode);
      filter = `AND blocker_code = $${values.length} AND status = 'open'`;
    }
    const result = await client.query(
      `UPDATE shipment_workflow_blockers
       SET status = $4,
           resolved_by_user_id = $5,
           resolved_at = NOW(),
           internal_note = COALESCE($6, internal_note),
           public_note = COALESCE($7, public_note),
           metadata = metadata || $8::jsonb,
           updated_at = NOW()
       WHERE organization_id = $1
         AND workflow_instance_id = $2
         AND shipment_id = $3
         ${filter}
       RETURNING *`,
      values
    );
    const blocker = result.rows[0];
    if (!blocker) return { notFound: true };
    await insertEvent(client, instance, {
      eventType: nextStatus === "cancelled" ? "workflow.blocker.cancelled" : "workflow.blocker.resolved",
      stepCode: blocker.step_code,
      blockerId: blocker.id,
      blockerCode: blocker.blocker_code,
      actorUserId,
      internalNote,
      publicNote,
      publicVisible: Boolean(publicNote),
      metadata,
    });
    await writePublicProjection(client, instance, definition, {
      stepCode: blocker.step_code || instance.current_step_code,
      publicNote,
      actorUserId,
    });
    return {
      blocker: normalizeBlocker(blocker, definition),
      progress: await buildProgressPayload(client, shipmentId, scopedOrganizationId),
    };
  });
  return payload;
}

export async function getPublicWorkflowSummary(queryable, shipmentId) {
  try {
    const instanceResult = await queryable.query(
      `SELECT *
       FROM shipment_workflow_instances
       WHERE shipment_id = $1
         AND status <> 'cancelled'
       ORDER BY created_at DESC
       LIMIT 1`,
      [shipmentId]
    );
    const instance = instanceResult.rows[0];
    if (!instance) return null;
    const definition = await getWorkflowDefinitionForInstance(queryable, {
      organizationId: instance.organization_id,
      instance,
    }) || fallbackWorkflowDefinition();
    const [stepsResult, blockersResult, publicEventResult] = await Promise.all([
      queryable.query(
        `SELECT *
         FROM shipment_workflow_step_states
         WHERE workflow_instance_id = $1
           AND organization_id = $2
           AND is_visible = TRUE
         ORDER BY step_code ASC`,
        [instance.id, instance.organization_id]
      ),
      queryable.query(
        `SELECT *
         FROM shipment_workflow_blockers
         WHERE workflow_instance_id = $1
           AND organization_id = $2
           AND status = 'open'`,
        [instance.id, instance.organization_id]
      ),
      queryable.query(
        `SELECT public_note, created_at
         FROM shipment_workflow_events
         WHERE workflow_instance_id = $1
           AND organization_id = $2
           AND public_visible = TRUE
           AND public_note IS NOT NULL
         ORDER BY created_at DESC
         LIMIT 1`,
        [instance.id, instance.organization_id]
      ),
    ]);
    const steps = stepsResult.rows.map((row) => normalizeStep(row, definition)).sort((a, b) => a.order - b.order);
    const blockers = blockersResult.rows.map((row) => normalizeBlocker(row, definition));
    const summary = progressSummary(steps, instance.current_step_code, blockers, definition);
    return {
      currentPublicPhase: summary.currentPublicPhase,
      currentPublicLabel: blockers.length
        ? safePublicBlockerMessage(publicEventResult.rows[0]?.public_note)
        : summary.currentPublicLabel,
      completedPublicStepsCount: summary.completedStepsCount,
      totalPublicStepsCount: summary.totalStepsCount,
      publicNote: publicEventResult.rows[0]?.public_note || "",
      lastPublicUpdate: publicEventResult.rows[0]?.created_at || instance.updated_at || instance.started_at,
    };
  } catch (error) {
    if (error?.code === "42P01" || error?.code === "42703") {
      return null;
    }
    throw error;
  }
}
