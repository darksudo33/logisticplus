import { canAccessTask as canAccessTaskService } from "./task.service.js";

export function registerTaskRoutes(app, deps) {
  const {
    assignTaskRecord,
    auditLog,
    createApiError,
    createTaskRecord,
    crypto,
    getShipmentRecord,
    getTaskRecord,
    getUserById,
    getUserPermissions,
    listTaskEvents,
    listTasks,
    parseRequestValue,
    pool,
    requireAuthenticatedTenantUser,
    requirePermission,
    requestContext,
    startShipmentWorkflowRecord,
    taskAssignBodySchema,
    taskListQuerySchema,
    taskParamsSchema,
    taskStatusBodySchema,
    updateTaskRecord,
    updateTaskStatusRecord,
    userHasPermission,
  } = deps;
  const canAccessTask = (user, task, action = "view") =>
    canAccessTaskService(user, task, action, { getUserPermissions });

  app.get("/api/tasks", async (req, res) => {
    try {
      const tenantRequest = await requireAuthenticatedTenantUser(req, res, "tasks list API");
      if (!tenantRequest) return;
      const { user, organizationId } = tenantRequest;
      const query = parseRequestValue(res, taskListQuerySchema, req.query || {});
      if (!query) return;
      const canViewAll = await userHasPermission(user, "tasks.view_all");
      const canViewOwn = canViewAll || (await userHasPermission(user, "tasks.view_own"));
      if (!canViewOwn) {
        return createApiError(res, 403, "FORBIDDEN", "Missing permission: tasks.view_own");
      }
      const data = await listTasks(
        canViewAll
            ? {
              organizationId,
              includeAll: true,
              shipmentId: query.shipmentId,
              assignedToId: query.assignedTo === "me" ? user.id : undefined,
              assignedById: query.assignedBy === "me" ? user.id : undefined,
              status: query.status,
              blocked: query.blocked,
              overdue: query.overdue,
            }
            : {
              organizationId,
              participantUserId: user.id,
              includeAll: true,
              shipmentId: query.shipmentId,
              status: query.status,
              blocked: query.blocked,
              overdue: query.overdue,
            }
      );
      res.json({ ok: true, data });
    } catch (error) {
      console.error("List tasks failed:", error);
      createApiError(res, 500, "LIST_TASKS_FAILED", "Could not load tasks.");
    }
  });

  app.get("/api/tasks/my", async (req, res) => {
    try {
      const tenantRequest = await requireAuthenticatedTenantUser(req, res, "my tasks API");
      if (!tenantRequest) return;
      const { user, organizationId } = tenantRequest;
      await requirePermission(user, "tasks.view_own");
      const data = await listTasks({ organizationId, assignedToId: user.id, includeAll: true });
      res.json({ ok: true, data });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      console.error("List my tasks failed:", error);
      createApiError(res, 500, "LIST_MY_TASKS_FAILED", "Could not load tasks.");
    }
  });

  app.get("/api/tasks/team", async (req, res) => {
    try {
      const tenantRequest = await requireAuthenticatedTenantUser(req, res, "team tasks API");
      if (!tenantRequest) return;
      const { user, organizationId } = tenantRequest;
      await requirePermission(user, "tasks.view_all");
      const data = await listTasks({ organizationId, includeAll: true });
      res.json({ ok: true, data });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      console.error("List team tasks failed:", error);
      createApiError(res, 500, "LIST_TEAM_TASKS_FAILED", "Could not load team tasks.");
    }
  });

  app.get("/api/tasks/:id", async (req, res) => {
    try {
      const tenantRequest = await requireAuthenticatedTenantUser(req, res, "task get API");
      if (!tenantRequest) return;
      const { user, organizationId } = tenantRequest;
      const task = await getTaskRecord(req.params.id, { organizationId });
      if (!task) return createApiError(res, 404, "NOT_FOUND", "Task was not found.");
      if (!(await canAccessTask(user, task))) {
        return createApiError(res, 403, "FORBIDDEN", "You cannot view this task.");
      }
      res.json({ ok: true, data: task });
    } catch (error) {
      console.error("Get task failed:", error);
      createApiError(res, 500, "GET_TASK_FAILED", "Could not load task.");
    }
  });

  app.post("/api/tasks", async (req, res) => {
    try {
      const tenantRequest = await requireAuthenticatedTenantUser(req, res, "task create API");
      if (!tenantRequest) return;
      const { user, tenantContext, organizationId } = tenantRequest;
      const body = req.body || {};
      const isWorkflowLinkedTask = Boolean(
        body.workflowInstanceId || body.workflowStepCode || body.workflowBlockerId || body.blockerCode
      );
      const canCreateTask = await userHasPermission(user, "tasks.create");
      const canCreateWorkflowTask =
        isWorkflowLinkedTask &&
        ((await userHasPermission(user, "shipments.update")) || (await userHasPermission(user, "shipment_steps.update")));
      if (!canCreateTask && !canCreateWorkflowTask) {
        return createApiError(res, 403, "FORBIDDEN", "Missing permission: tasks.create");
      }
      const title = String(body.title || "").trim();
      if (!title) return createApiError(res, 400, "VALIDATION_ERROR", "Task title is required.", "title");
      const assignedToUserId = body.assignedToUserId || user.id;
      if (assignedToUserId !== user.id) {
        await requirePermission(user, "tasks.assign");
      }
      const assignee = await getUserById(assignedToUserId);
      if (!assignee || assignee.organization_id !== organizationId || assignee.status === "suspended") {
        return createApiError(res, 404, "ASSIGNEE_NOT_FOUND", "Assignee was not found.");
      }
      if (body.shipmentId) {
        const linkedShipment = await getShipmentRecord(body.shipmentId, { organizationId });
        if (!linkedShipment) {
          return createApiError(res, 404, "SHIPMENT_NOT_FOUND", "Linked shipment was not found.", "shipmentId");
        }
      }
      let workflowInstanceId = body.workflowInstanceId || null;
      let currentWorkflow = null;
      if (workflowInstanceId) {
        const submittedWorkflowResult = await pool.query(
          `SELECT id
           FROM shipment_workflow_instances
           WHERE id = $1
             AND organization_id = $2
             AND ($3::text IS NULL OR shipment_id = $3)
           LIMIT 1`,
          [workflowInstanceId, organizationId, body.shipmentId || null]
        );
        currentWorkflow = submittedWorkflowResult.rows[0] || null;
        if (!currentWorkflow) workflowInstanceId = null;
      }
      if (body.shipmentId && isWorkflowLinkedTask) {
        if (!currentWorkflow) {
          const currentWorkflowResult = await pool.query(
            `SELECT id
             FROM shipment_workflow_instances
             WHERE shipment_id = $1
               AND organization_id = $2
             ORDER BY updated_at DESC
             LIMIT 1`,
            [body.shipmentId, organizationId]
          );
          currentWorkflow = currentWorkflowResult.rows[0] || null;
        }
        if (!currentWorkflow) {
          const startedWorkflow = await startShipmentWorkflowRecord(pool, {
            shipmentId: body.shipmentId,
            organizationId,
            actorUserId: user.id,
            metadata: { source: "task.create" },
          });
          currentWorkflow = startedWorkflow?.workflow ? { id: startedWorkflow.workflow.id } : null;
        }
        if (currentWorkflow?.id) workflowInstanceId = currentWorkflow.id;
      }
      if (body.workflowInstanceId && !workflowInstanceId && !currentWorkflow?.id && !body.shipmentId) {
        return createApiError(res, 404, "WORKFLOW_NOT_FOUND", "Workflow instance was not found.", "workflowInstanceId");
      }
      let workflowBlockerId = body.workflowBlockerId || null;
      if (body.workflowBlockerId) {
        const blockerResult = await pool.query(
          `SELECT id
           FROM shipment_workflow_blockers
           WHERE id = $1
             AND organization_id = $2
             AND ($3::text IS NULL OR shipment_id = $3)
          LIMIT 1`,
          [body.workflowBlockerId, organizationId, body.shipmentId || null]
        );
        if (blockerResult.rows[0]) {
          workflowBlockerId = blockerResult.rows[0].id;
        } else if (body.shipmentId && body.blockerCode) {
          const fallbackBlockerResult = await pool.query(
            `SELECT id
             FROM shipment_workflow_blockers
             WHERE organization_id = $1
               AND shipment_id = $2
               AND blocker_code = $3
               AND ($4::text IS NULL OR step_code = $4)
               AND ($5::text IS NULL OR workflow_instance_id = $5)
               AND status = 'open'
             ORDER BY updated_at DESC, created_at DESC
             LIMIT 1`,
            [
              organizationId,
              body.shipmentId,
              body.blockerCode,
              body.workflowStepCode || null,
              workflowInstanceId || null,
            ]
          );
          if (fallbackBlockerResult.rows[0]) {
            workflowBlockerId = fallbackBlockerResult.rows[0].id;
          } else {
            if (!workflowInstanceId) {
              return createApiError(res, 404, "BLOCKER_NOT_FOUND", "Workflow blocker was not found.", "workflowBlockerId");
            }
            const recoveredBlockerResult = await pool.query(
              `INSERT INTO shipment_workflow_blockers (
                 id, organization_id, workflow_instance_id, shipment_id, step_code, blocker_code,
                 status, internal_note, metadata, created_by_user_id
               )
               VALUES ($1, $2, $3, $4, $5, $6, 'open', $7, $8::jsonb, $9)
               ON CONFLICT (id) DO NOTHING
               RETURNING id`,
              [
                body.workflowBlockerId,
                organizationId,
                workflowInstanceId,
                body.shipmentId,
                body.workflowStepCode || null,
                body.blockerCode,
                body.description || body.assignmentNote || null,
                JSON.stringify({ source: "task.create", recovered: true }),
                user.id,
              ]
            );
            if (recoveredBlockerResult.rows[0]) {
              workflowBlockerId = recoveredBlockerResult.rows[0].id;
            } else {
              const recoveredVerification = await pool.query(
                `SELECT id
                 FROM shipment_workflow_blockers
                 WHERE id = $1
                   AND organization_id = $2
                   AND shipment_id = $3
                 LIMIT 1`,
                [body.workflowBlockerId, organizationId, body.shipmentId]
              );
              if (!recoveredVerification.rows[0]) {
                return createApiError(res, 404, "BLOCKER_NOT_FOUND", "Workflow blocker was not found.", "workflowBlockerId");
              }
              workflowBlockerId = recoveredVerification.rows[0].id;
            }
            await pool.query(
              `INSERT INTO shipment_workflow_events (
                 id, organization_id, workflow_instance_id, shipment_id, event_type,
                 step_code, blocker_id, blocker_code, actor_user_id, internal_note, metadata
               )
               VALUES ($1, $2, $3, $4, 'workflow.blocker.recovered_for_task',
                       $5, $6, $7, $8, $9, $10::jsonb)
               ON CONFLICT (id) DO NOTHING`,
              [
                crypto.randomUUID(),
                organizationId,
                workflowInstanceId,
                body.shipmentId,
                body.workflowStepCode || null,
                workflowBlockerId,
                body.blockerCode,
                user.id,
                "Recovered a missing blocker while assigning a workflow task.",
                JSON.stringify({ source: "task.create" }),
              ]
            );
          }
        } else {
          return createApiError(res, 404, "BLOCKER_NOT_FOUND", "Workflow blocker was not found.", "workflowBlockerId");
        }
      }
      const task = await createTaskRecord({
        ownerUserId: user.id,
        tenantContext,
        title,
        description: body.description,
        status: body.status,
        priority: body.priority,
        assignedToUserId,
        assignedToName: assignee.name || body.assignedToName || user.name,
        assignedByUserId: user.id,
        assignedByName: user.name,
        dueDate: body.dueDate,
        deadline: body.deadline,
        shipmentId: body.shipmentId || null,
        assignmentNote: body.assignmentNote,
        workflowInstanceId,
        workflowStepCode: body.workflowStepCode || null,
        workflowBlockerId,
        blockerCode: body.blockerCode || null,
      });
      await auditLog({
        actorUserId: user.id,
        action: "task.create",
        entityType: "TASK",
        entityId: task.id,
        summary: "Task was created.",
        after: task,
        requestContext: requestContext(req),
      });
      res.json({ ok: true, data: task });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      console.error("Create task failed:", error);
      createApiError(res, 500, "CREATE_TASK_FAILED", "Could not create task.");
    }
  });

  app.patch("/api/tasks/:id", async (req, res) => {
    try {
      const tenantRequest = await requireAuthenticatedTenantUser(req, res, "task update API");
      if (!tenantRequest) return;
      const { user, organizationId } = tenantRequest;
      const before = await getTaskRecord(req.params.id, { organizationId });
      if (!before) return createApiError(res, 404, "NOT_FOUND", "Task was not found.");
      if (!(await canAccessTask(user, before))) {
        return createApiError(res, 403, "FORBIDDEN", "You cannot update this task.");
      }
      if (req.body?.assignedToUserId && req.body.assignedToUserId !== before.assigned_to_id) {
        await requirePermission(user, "tasks.assign");
        const assignee = await getUserById(req.body.assignedToUserId);
        if (!assignee || assignee.organization_id !== organizationId || assignee.status === "suspended") {
          return createApiError(res, 404, "ASSIGNEE_NOT_FOUND", "Assignee was not found.", "assignedToUserId");
        }
        req.body.assignedToName = assignee.name;
      }
      const result = await updateTaskRecord(req.params.id, { ...(req.body || {}), actorUserId: user.id }, { organizationId });
      await auditLog({
        actorUserId: user.id,
        action: "task.update",
        entityType: "TASK",
        entityId: req.params.id,
        summary: "Task was updated.",
        before: result.before,
        after: result.after,
        requestContext: requestContext(req),
      });
      res.json({ ok: true, data: result.after });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      console.error("Update task failed:", error);
      createApiError(res, 500, "UPDATE_TASK_FAILED", "Could not update task.");
    }
  });

  app.patch("/api/tasks/:taskId/assign", async (req, res) => {
    try {
      const tenantRequest = await requireAuthenticatedTenantUser(req, res, "task assign API");
      if (!tenantRequest) return;
      const { user, organizationId } = tenantRequest;
      const params = parseRequestValue(res, taskParamsSchema, req.params);
      if (!params) return;
      const body = parseRequestValue(res, taskAssignBodySchema, req.body || {});
      if (!body) return;
      const before = await getTaskRecord(params.taskId, { organizationId });
      if (!before) return createApiError(res, 404, "NOT_FOUND", "Task was not found.");
      const canAssign = (await userHasPermission(user, "tasks.assign")) || before.owner_user_id === user.id || before.assigned_by_id === user.id;
      if (!canAssign) {
        return createApiError(res, 403, "FORBIDDEN", "Missing permission: tasks.assign");
      }
      const result = await assignTaskRecord(params.taskId, {
        assignedToUserId: body.assignedToUserId,
        actorUser: user,
        dueAt: body.dueAt,
        dueDate: body.dueDate,
        priority: body.priority,
        assignmentNote: body.assignmentNote,
        status: body.status || "assigned",
        organizationId,
      });
      if (!result) return createApiError(res, 404, "NOT_FOUND", "Task was not found.");
      if (result.invalidAssignee) return createApiError(res, 404, "ASSIGNEE_NOT_FOUND", "Assignee was not found.", "assignedToUserId");
      await auditLog({
        actorUserId: user.id,
        action: "task.assign",
        entityType: "TASK",
        entityId: params.taskId,
        summary: "Task was assigned.",
        before: result.before,
        after: result.after,
        requestContext: requestContext(req),
      });
      res.json({ ok: true, data: result.after });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      console.error("Assign task failed:", error);
      createApiError(res, 500, "TASK_ASSIGN_FAILED", "Could not assign task.");
    }
  });

  app.patch("/api/tasks/:taskId/status", async (req, res) => {
    try {
      const tenantRequest = await requireAuthenticatedTenantUser(req, res, "task status API");
      if (!tenantRequest) return;
      const { user, organizationId } = tenantRequest;
      const params = parseRequestValue(res, taskParamsSchema, req.params);
      if (!params) return;
      const body = parseRequestValue(res, taskStatusBodySchema, req.body || {});
      if (!body) return;
      const before = await getTaskRecord(params.taskId, { organizationId });
      if (!before) return createApiError(res, 404, "NOT_FOUND", "Task was not found.");
      if (!(await canAccessTask(user, before, "status"))) {
        return createApiError(res, 403, "FORBIDDEN", "You cannot update this task status.");
      }
      const result = await updateTaskStatusRecord(params.taskId, {
        status: body.status,
        note: body.note,
        actorUser: user,
        organizationId,
      });
      if (!result) return createApiError(res, 404, "NOT_FOUND", "Task was not found.");
      await auditLog({
        actorUserId: user.id,
        action: "task.status_update",
        entityType: "TASK",
        entityId: params.taskId,
        summary: `Task status changed to ${result.after.status}.`,
        before: result.before,
        after: result.after,
        requestContext: requestContext(req),
      });
      res.json({ ok: true, data: result.after });
    } catch (error) {
      console.error("Update task status failed:", error);
      createApiError(res, 500, "TASK_STATUS_UPDATE_FAILED", "Could not update task status.");
    }
  });

  app.get("/api/tasks/:taskId/events", async (req, res) => {
    try {
      const tenantRequest = await requireAuthenticatedTenantUser(req, res, "task events API");
      if (!tenantRequest) return;
      const { user, organizationId } = tenantRequest;
      const params = parseRequestValue(res, taskParamsSchema, req.params);
      if (!params) return;
      const task = await getTaskRecord(params.taskId, { organizationId });
      if (!task) return createApiError(res, 404, "NOT_FOUND", "Task was not found.");
      if (!(await canAccessTask(user, task))) {
        return createApiError(res, 403, "FORBIDDEN", "You cannot view this task.");
      }
      const data = await listTaskEvents(params.taskId, { organizationId });
      res.json({ ok: true, data });
    } catch (error) {
      console.error("List task events failed:", error);
      createApiError(res, 500, "TASK_EVENTS_FAILED", "Could not load task events.");
    }
  });

  async function updateTaskStatusEndpoint(req, res, status, action) {
    try {
      const tenantRequest = await requireAuthenticatedTenantUser(req, res, `${action} API`);
      if (!tenantRequest) return;
      const { user, organizationId } = tenantRequest;
      const before = await getTaskRecord(req.params.id, { organizationId });
      if (!before) return createApiError(res, 404, "NOT_FOUND", "Task was not found.");
      if (!(await canAccessTask(user, before, "status"))) {
        return createApiError(res, 403, "FORBIDDEN", "You cannot update this task status.");
      }
      const result = await updateTaskStatusRecord(req.params.id, {
        status,
        actorUser: user,
        organizationId,
      });
      await auditLog({
        actorUserId: user.id,
        action,
        entityType: "TASK",
        entityId: req.params.id,
        summary: `Task status changed to ${status}.`,
        before: result.before,
        after: result.after,
        requestContext: requestContext(req),
      });
      res.json({ ok: true, data: result.after });
    } catch (error) {
      console.error(`${action} failed:`, error);
      createApiError(res, 500, "TASK_STATUS_FAILED", "Could not update task status.");
    }
  }

  app.post("/api/tasks/:id/complete", (req, res) =>
    updateTaskStatusEndpoint(req, res, "DONE", "task.complete")
  );
  app.post("/api/tasks/:id/block", (req, res) =>
    updateTaskStatusEndpoint(req, res, "BLOCKED", "task.block")
  );
  app.post("/api/tasks/:id/cancel", (req, res) =>
    updateTaskStatusEndpoint(req, res, "CANCELLED", "task.cancel")
  );
}
