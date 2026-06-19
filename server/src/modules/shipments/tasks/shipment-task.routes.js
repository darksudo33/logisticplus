import { parseRequestValue } from "../../../shared/middleware/validate.middleware.js";
import {
  shipmentParamsSchema,
  shipmentTaskBodySchema,
} from "../shipment.validation.js";

export function registerShipmentTaskRoutes(
  app,
  {
    auditLog,
    createApiError,
    createShipmentTaskRecord,
    getUserById,
    pool,
    requestContext,
    requireAuthenticatedTenantUser,
    requirePermission,
  }
) {
  app.post("/api/shipments/:id/tasks", async (req, res) => {
    try {
      const tenantRequest = await requireAuthenticatedTenantUser(req, res, "shipment task create API");
      if (!tenantRequest) return;
      const { user, tenantContext, organizationId } = tenantRequest;
      await requirePermission(user, "tasks.create");
      const params = parseRequestValue(res, shipmentParamsSchema, req.params);
      if (!params) return;
      const body = parseRequestValue(res, shipmentTaskBodySchema, req.body || {});
      if (!body) return;
      const assignedToUserId = body.assignedToUserId || user.id;
      if (assignedToUserId !== user.id) await requirePermission(user, "tasks.assign");
      const assignee = await getUserById(assignedToUserId);
      if (!assignee || assignee.organization_id !== organizationId || assignee.status === "suspended") {
        return createApiError(res, 404, "ASSIGNEE_NOT_FOUND", "Assignee was not found.", "assignedToUserId");
      }
      if (body.workflowInstanceId) {
        const workflowResult = await pool.query(
          `SELECT id
           FROM shipment_workflow_instances
           WHERE id = $1
             AND organization_id = $2
             AND shipment_id = $3
           LIMIT 1`,
          [body.workflowInstanceId, organizationId, params.id]
        );
        if (!workflowResult.rows[0]) {
          return createApiError(res, 404, "WORKFLOW_NOT_FOUND", "Workflow instance was not found.", "workflowInstanceId");
        }
      }
      if (body.workflowBlockerId) {
        const blockerResult = await pool.query(
          `SELECT id
           FROM shipment_workflow_blockers
           WHERE id = $1
             AND organization_id = $2
             AND shipment_id = $3
           LIMIT 1`,
          [body.workflowBlockerId, organizationId, params.id]
        );
        if (!blockerResult.rows[0]) {
          return createApiError(res, 404, "BLOCKER_NOT_FOUND", "Workflow blocker was not found.", "workflowBlockerId");
        }
      }
      body.assignedToName = assignee.name || body.assignedToName;
      const result = await createShipmentTaskRecord({
        shipmentId: params.id,
        stepId: body.stepId,
        actorUser: user,
        tenantContext,
        task: body,
      });
      if (!result) return createApiError(res, 404, "NOT_FOUND", "Shipment was not found.");
      await auditLog({
        actorUserId: user.id,
        action: "shipment_task.create_or_activate",
        entityType: "TASK",
        entityId: result.after.id,
        summary: "Shipment workflow task was created or activated.",
        before: result.before,
        after: result.after,
        requestContext: requestContext(req),
      });
      res.json({ ok: true, data: result.after });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      console.error("Create shipment task failed:", error);
      createApiError(res, 500, "SHIPMENT_TASK_FAILED", "Could not create shipment task.");
    }
  });
}
