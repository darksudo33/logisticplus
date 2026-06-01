import crypto from "node:crypto";
import {
  IR_IMPORT_CUSTOMS_BLOCKERS,
  IR_IMPORT_CUSTOMS_PHASES,
  IR_IMPORT_CUSTOMS_STEPS,
  IR_IMPORT_CUSTOMS_WORKFLOW_KEY,
  getIranImportBlocker,
  getIranImportPhase,
  getIranImportStep,
  isValidIranImportBlockerCode,
  isValidIranImportRoute,
  isValidIranImportStepCode,
  isVisibleForCustomsRoute,
  publicLabelForStep,
  publicPhaseForStep,
  safePublicBlockerMessage,
} from "../../shared/iran-import-customs-workflow.js";
import { requireOrganizationScope } from "../tenant-scope.js";
import { withTransaction } from "../transaction.js";

const TERMINAL_STEP_CODE = "066";

function normalizeInstance(row) {
  if (!row) return null;
  return {
    id: row.id,
    workflowKey: row.workflow_key,
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

function normalizeStep(row) {
  const definition = getIranImportStep(row.step_code);
  const phase = definition ? getIranImportPhase(definition.phaseId) : null;
  return {
    code: row.step_code,
    phaseId: definition?.phaseId || null,
    phaseLabelFa: phase?.labelFa || "",
    phaseLabelEn: phase?.labelEn || "",
    labelFa: definition?.labelFa || row.step_code,
    labelEn: definition?.labelEn || row.step_code,
    order: definition?.order || 0,
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

function normalizeBlocker(row) {
  const definition = getIranImportBlocker(row.blocker_code);
  return {
    id: row.id,
    workflowInstanceId: row.workflow_instance_id,
    shipmentId: row.shipment_id,
    stepCode: row.step_code || null,
    blockerCode: row.blocker_code,
    labelFa: definition?.labelFa || row.blocker_code,
    labelEn: definition?.labelEn || row.blocker_code,
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

function workflowDefinition() {
  return {
    key: IR_IMPORT_CUSTOMS_WORKFLOW_KEY,
    phases: IR_IMPORT_CUSTOMS_PHASES,
    steps: IR_IMPORT_CUSTOMS_STEPS,
    blockers: IR_IMPORT_CUSTOMS_BLOCKERS,
  };
}

function nextVisibleStepCode(steps, currentCode) {
  const current = getIranImportStep(currentCode);
  if (!current) return currentCode;
  const next = steps
    .filter((step) => step.isVisible && step.status !== "completed" && step.status !== "skipped")
    .sort((a, b) => a.order - b.order)
    .find((step) => step.order > current.order);
  return next?.code || currentCode;
}

function progressSummary(steps, currentStepCode, blockers) {
  const publicSteps = steps.filter((step) => step.isVisible);
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
    currentPublicPhase: currentStep ? publicPhaseForStep(currentStep.code) : "",
    currentPublicLabel: currentStep ? publicLabelForStep(currentStep.code) : "",
    completedStepsCount: completed,
    totalStepsCount: publicSteps.length,
    openBlockersCount: openBlockers.length,
    isBlocked: openBlockers.length > 0,
  };
}

async function getShipment(queryable, shipmentId, organizationId, { lock = false } = {}) {
  const result = await queryable.query(
    `SELECT id, organization_id, owner_user_id, assigned_manager_id, shipment_code
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
       AND workflow_key = $3
     LIMIT 1`,
    [shipmentId, organizationId, IR_IMPORT_CUSTOMS_WORKFLOW_KEY]
  );
  return result.rows[0] || null;
}

async function createWorkflowInstance(queryable, { shipmentId, organizationId, actorUserId, metadata = {} } = {}) {
  const instanceId = crypto.randomUUID();
  const instanceResult = await queryable.query(
    `INSERT INTO shipment_workflow_instances (
       id, organization_id, shipment_id, workflow_key, status, current_step_code,
       started_by_user_id, metadata
     )
     VALUES ($1, $2, $3, $4, 'active', '001', $5, $6::jsonb)
     RETURNING *`,
    [
      instanceId,
      organizationId,
      shipmentId,
      IR_IMPORT_CUSTOMS_WORKFLOW_KEY,
      actorUserId || null,
      JSON.stringify(metadata || {}),
    ]
  );
  const instance = instanceResult.rows[0];

  for (const step of IR_IMPORT_CUSTOMS_STEPS) {
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
        step.code === "001" ? "active" : "pending",
        isVisibleForCustomsRoute(step.code, null),
      ]
    );
  }

  await insertEvent(queryable, instance, {
    eventType: "workflow.started",
    stepCode: "001",
    actorUserId,
    metadata,
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

async function writePublicProjection(queryable, instance, { stepCode, publicNote, actorUserId }) {
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
      publicLabelForStep(stepCode),
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
    return {
      definition: workflowDefinition(),
      shipmentId,
      workflow: null,
      phases: IR_IMPORT_CUSTOMS_PHASES,
      steps: [],
      blockers: [],
      history: [],
      summary: null,
    };
  }

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
    .map(normalizeStep)
    .sort((a, b) => a.order - b.order);
  const blockers = blockersResult.rows.map(normalizeBlocker);
  return {
    definition: workflowDefinition(),
    shipmentId,
    workflow: normalizeInstance(instance),
    phases: IR_IMPORT_CUSTOMS_PHASES,
    steps: normalizedSteps.map((step) => ({
      ...step,
      blockers: blockers.filter((blocker) => blocker.stepCode === step.code),
    })),
    blockers,
    history: eventsResult.rows.map(normalizeEvent),
    summary: progressSummary(normalizedSteps, instance.current_step_code, blockers),
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

    await createWorkflowInstance(client, {
      shipmentId,
      organizationId: scopedOrganizationId,
      actorUserId,
      metadata,
    });
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
  return withTransaction(pool, async (client) => {
    let instance = await getInstance(client, shipmentId, scopedOrganizationId);
    const code = String(stepCode || instance?.current_step_code || "001");
    if (!isValidIranImportStepCode(code)) return { invalidStep: true };
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
    }

    const nextRoute = customsRoute || instance.customs_route || null;
    if (customsRoute) {
      await client.query(
        `UPDATE shipment_workflow_instances
         SET customs_route = $3, updated_at = NOW()
         WHERE id = $1 AND organization_id = $2`,
        [instance.id, scopedOrganizationId, customsRoute]
      );
      for (const step of IR_IMPORT_CUSTOMS_STEPS) {
        await client.query(
          `UPDATE shipment_workflow_step_states
           SET is_visible = CASE WHEN is_exceptional THEN TRUE ELSE $4 END,
               updated_at = NOW()
           WHERE workflow_instance_id = $1
             AND organization_id = $2
             AND step_code = $3`,
          [instance.id, scopedOrganizationId, step.code, isVisibleForCustomsRoute(step.code, customsRoute)]
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
    const normalizedSteps = stepsResult.rows.map(normalizeStep);
    const nextCurrent =
      storedStatus === "completed"
        ? nextVisibleStepCode(normalizedSteps, code)
        : hasStatusUpdate && storedStatus === "active"
          ? code
          : instance.current_step_code;
    const instanceStatus = code === TERMINAL_STEP_CODE && storedStatus === "completed" ? "completed" : "active";
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
    await writePublicProjection(client, refreshedInstance, {
      stepCode: code,
      publicNote,
      actorUserId,
    });
    return buildProgressPayload(client, shipmentId, scopedOrganizationId);
  });
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
  return withTransaction(pool, async (client) => {
    if (!isValidIranImportBlockerCode(blockerCode)) return { invalidBlocker: true };
    if (stepCode && !isValidIranImportStepCode(stepCode)) return { invalidStep: true };
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
    }

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
    await writePublicProjection(client, instance, {
      stepCode: stepCode || instance.current_step_code,
      publicNote: publicNote ? safePublicBlockerMessage(publicNote) : "",
      actorUserId,
    });
    return {
      blocker: normalizeBlocker(result.rows[0]),
      progress: await buildProgressPayload(client, shipmentId, scopedOrganizationId),
    };
  });
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
  return withTransaction(pool, async (client) => {
    const instance = await getInstance(client, shipmentId, scopedOrganizationId);
    if (!instance) return null;
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
    await writePublicProjection(client, instance, {
      stepCode: blocker.step_code || instance.current_step_code,
      publicNote,
      actorUserId,
    });
    return {
      blocker: normalizeBlocker(blocker),
      progress: await buildProgressPayload(client, shipmentId, scopedOrganizationId),
    };
  });
}

export async function getPublicWorkflowSummary(queryable, shipmentId) {
  try {
    const instanceResult = await queryable.query(
      `SELECT *
       FROM shipment_workflow_instances
       WHERE shipment_id = $1
         AND workflow_key = $2
         AND status <> 'cancelled'
       ORDER BY created_at DESC
       LIMIT 1`,
      [shipmentId, IR_IMPORT_CUSTOMS_WORKFLOW_KEY]
    );
    const instance = instanceResult.rows[0];
    if (!instance) return null;
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
    const steps = stepsResult.rows.map(normalizeStep).sort((a, b) => a.order - b.order);
    const blockers = blockersResult.rows.map(normalizeBlocker);
    const summary = progressSummary(steps, instance.current_step_code, blockers);
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
