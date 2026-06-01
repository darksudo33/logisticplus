import {
  shipmentProgressBlockerBodySchema,
  shipmentProgressCurrentBodySchema,
  shipmentProgressParamsSchema,
  shipmentProgressStartBodySchema,
  shipmentProgressUnblockBodySchema,
} from "../request-schemas.js";
import { parseRequestValue } from "../validation.js";
import {
  addShipmentWorkflowBlocker,
  getShipmentWorkflowProgress,
  resolveShipmentWorkflowBlocker,
  startShipmentWorkflow,
  updateShipmentWorkflowCurrent,
} from "../repositories/shipment-progress.js";

async function permissionSet(getUserPermissions, user) {
  return new Set(await getUserPermissions(user.id));
}

async function hasAny(getUserPermissions, user, permissions) {
  const granted = await permissionSet(getUserPermissions, user);
  return permissions.some((permission) => granted.has(permission));
}

async function canViewShipmentProgress({ user, shipment, getUserPermissions }) {
  const granted = await permissionSet(getUserPermissions, user);
  if (granted.has("shipments.view_all")) return true;
  if (!granted.has("shipments.view_assigned")) return false;
  return shipment.owner_user_id === user.id || shipment.assigned_manager_id === user.id;
}

function isWorkflowSchemaMissing(error) {
  return (
    error?.code === "42P01" ||
    error?.code === "42703" ||
    /shipment_workflow_|task_events|workflow_instance_id/i.test(String(error?.message || ""))
  );
}

export function registerShipmentProgressRoutes(
  app,
  {
    auditLog,
    createApiError,
    getShipmentRecord,
    getUserPermissions,
    pool,
    requestContext,
    requireAuthenticatedUser,
    requireTenantContext,
  }
) {
  async function loadShipmentForProgress(req, res, user) {
    const params = parseRequestValue(res, shipmentProgressParamsSchema, req.params);
    if (!params) return null;
    const tenantContext = requireTenantContext(req, res, "load shipment progress");
    if (!tenantContext) return null;
    const shipment = await getShipmentRecord(params.shipmentId, { organizationId: tenantContext.organizationId });
    if (!shipment) {
      createApiError(res, 404, "NOT_FOUND", "Shipment was not found.");
      return null;
    }
    if (!(await canViewShipmentProgress({ user, shipment, getUserPermissions }))) {
      createApiError(res, 403, "FORBIDDEN", "You cannot view this shipment progress.");
      return null;
    }
    return { params, shipment, tenantContext };
  }

  async function requireProgressMutation(user, res) {
    if (await hasAny(getUserPermissions, user, ["shipments.update", "shipment_steps.update"])) {
      return true;
    }
    createApiError(res, 403, "FORBIDDEN", "Missing permission: shipment progress update.");
    return false;
  }

  function handleProgressError(res, error, logLabel, fallbackCode, fallbackMessage) {
    console.error(`${logLabel}:`, error);
    if (isWorkflowSchemaMissing(error)) {
      return createApiError(
        res,
        503,
        "WORKFLOW_SCHEMA_NOT_READY",
        "Shipment workflow database migration has not been applied yet."
      );
    }
    return createApiError(res, 500, fallbackCode, fallbackMessage);
  }

  app.get("/api/shipments/:shipmentId/progress", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      const loaded = await loadShipmentForProgress(req, res, user);
      if (!loaded) return;
      const data = await getShipmentWorkflowProgress(pool, {
        shipmentId: loaded.params.shipmentId,
        organizationId: loaded.tenantContext.organizationId,
      });
      res.json({ ok: true, data });
    } catch (error) {
      handleProgressError(res, error, "Get shipment progress failed", "SHIPMENT_PROGRESS_FAILED", "Could not load shipment progress.");
    }
  });

  app.post("/api/shipments/:shipmentId/progress/start", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      const loaded = await loadShipmentForProgress(req, res, user);
      if (!loaded) return;
      if (!(await requireProgressMutation(user, res))) return;
      const body = parseRequestValue(res, shipmentProgressStartBodySchema, req.body || {});
      if (!body) return;
      const data = await startShipmentWorkflow(pool, {
        shipmentId: loaded.params.shipmentId,
        organizationId: loaded.tenantContext.organizationId,
        actorUserId: user.id,
        metadata: body.metadata || {},
      });
      if (!data) return createApiError(res, 404, "NOT_FOUND", "Shipment was not found.");
      await auditLog({
        actorUserId: user.id,
        action: "shipment_workflow.start",
        entityType: "SHIPMENT_WORKFLOW",
        entityId: data.workflow?.id || loaded.params.shipmentId,
        summary: "Shipment import workflow was started.",
        after: data.workflow,
        requestContext: requestContext(req),
      });
      res.status(201).json({ ok: true, data });
    } catch (error) {
      handleProgressError(res, error, "Start shipment progress failed", "SHIPMENT_PROGRESS_START_FAILED", "Could not start shipment progress.");
    }
  });

  app.patch("/api/shipments/:shipmentId/progress/current", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      const loaded = await loadShipmentForProgress(req, res, user);
      if (!loaded) return;
      if (!(await requireProgressMutation(user, res))) return;
      const body = parseRequestValue(res, shipmentProgressCurrentBodySchema, req.body || {});
      if (!body) return;
      const data = await updateShipmentWorkflowCurrent(pool, {
        shipmentId: loaded.params.shipmentId,
        organizationId: loaded.tenantContext.organizationId,
        actorUserId: user.id,
        ...body,
      });
      if (!data) return createApiError(res, 404, "WORKFLOW_NOT_STARTED", "Shipment workflow has not been started.");
      if (data.invalidStep) return createApiError(res, 400, "INVALID_WORKFLOW_STEP", "Workflow step is not valid.", "stepCode");
      if (data.invalidRoute) return createApiError(res, 400, "INVALID_CUSTOMS_ROUTE", "Customs route is not valid.", "customsRoute");
      await auditLog({
        actorUserId: user.id,
        action: "shipment_workflow.update",
        entityType: "SHIPMENT_WORKFLOW",
        entityId: data.workflow?.id || loaded.params.shipmentId,
        summary: "Shipment import workflow was updated.",
        after: data.summary,
        requestContext: requestContext(req),
      });
      res.json({ ok: true, data });
    } catch (error) {
      handleProgressError(res, error, "Update shipment progress failed", "SHIPMENT_PROGRESS_UPDATE_FAILED", "Could not update shipment progress.");
    }
  });

  app.post("/api/shipments/:shipmentId/progress/blockers", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      const loaded = await loadShipmentForProgress(req, res, user);
      if (!loaded) return;
      if (!(await requireProgressMutation(user, res))) return;
      const body = parseRequestValue(res, shipmentProgressBlockerBodySchema, req.body || {});
      if (!body) return;
      const data = await addShipmentWorkflowBlocker(pool, {
        shipmentId: loaded.params.shipmentId,
        organizationId: loaded.tenantContext.organizationId,
        actorUserId: user.id,
        ...body,
      });
      if (!data) return createApiError(res, 404, "WORKFLOW_NOT_STARTED", "Shipment workflow has not been started.");
      if (data.invalidBlocker) return createApiError(res, 400, "INVALID_BLOCKER", "Blocker code is not valid.", "blockerCode");
      if (data.invalidStep) return createApiError(res, 400, "INVALID_WORKFLOW_STEP", "Workflow step is not valid.", "stepCode");
      await auditLog({
        actorUserId: user.id,
        action: "shipment_workflow.blocker_add",
        entityType: "SHIPMENT_WORKFLOW_BLOCKER",
        entityId: data.blocker.id,
        summary: "Shipment workflow blocker was added.",
        after: data.blocker,
        requestContext: requestContext(req),
      });
      res.status(201).json({ ok: true, data });
    } catch (error) {
      handleProgressError(res, error, "Add shipment progress blocker failed", "SHIPMENT_BLOCKER_FAILED", "Could not add workflow blocker.");
    }
  });

  app.post("/api/shipments/:shipmentId/progress/unblock", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      const loaded = await loadShipmentForProgress(req, res, user);
      if (!loaded) return;
      if (!(await requireProgressMutation(user, res))) return;
      const body = parseRequestValue(res, shipmentProgressUnblockBodySchema, req.body || {});
      if (!body) return;
      const data = await resolveShipmentWorkflowBlocker(pool, {
        shipmentId: loaded.params.shipmentId,
        organizationId: loaded.tenantContext.organizationId,
        actorUserId: user.id,
        ...body,
      });
      if (!data) return createApiError(res, 404, "WORKFLOW_NOT_STARTED", "Shipment workflow has not been started.");
      if (data.invalidBlocker) return createApiError(res, 400, "INVALID_BLOCKER", "Blocker code is not valid.", "blockerCode");
      if (data.notFound) return createApiError(res, 404, "BLOCKER_NOT_FOUND", "Workflow blocker was not found.");
      await auditLog({
        actorUserId: user.id,
        action: "shipment_workflow.blocker_resolve",
        entityType: "SHIPMENT_WORKFLOW_BLOCKER",
        entityId: data.blocker.id,
        summary: "Shipment workflow blocker was resolved.",
        after: data.blocker,
        requestContext: requestContext(req),
      });
      res.json({ ok: true, data });
    } catch (error) {
      handleProgressError(res, error, "Resolve shipment progress blocker failed", "SHIPMENT_UNBLOCK_FAILED", "Could not resolve workflow blocker.");
    }
  });
}
