import { parseRequestValue } from "../../../shared/middleware/validate.middleware.js";
import {
  shipmentParamsSchema,
  shipmentStepParamsSchema,
} from "../shipment.validation.js";

export function registerShipmentStepRoutes(
  app,
  {
    auditLog,
    createApiError,
    listShipmentSteps,
    requestContext,
    requireAuthenticatedTenantUser,
    requirePermission,
    updateShipmentStepRecord,
  }
) {
  app.get("/api/shipments/:id/steps", async (req, res) => {
    try {
      const tenantRequest = await requireAuthenticatedTenantUser(req, res, "shipment steps API");
      if (!tenantRequest) return;
      const { organizationId } = tenantRequest;
      const params = parseRequestValue(res, shipmentParamsSchema, req.params);
      if (!params) return;
      const data = await listShipmentSteps(params.id, null, { organizationId });
      res.json({ ok: true, data });
    } catch (error) {
      console.error("List shipment steps failed:", error);
      createApiError(res, 500, "LIST_SHIPMENT_STEPS_FAILED", "Could not load shipment steps.");
    }
  });

  app.patch("/api/shipments/:id/steps/:stepId", async (req, res) => {
    try {
      const tenantRequest = await requireAuthenticatedTenantUser(req, res, "shipment step update API");
      if (!tenantRequest) return;
      const { user } = tenantRequest;
      await requirePermission(user, "shipment_steps.update");
      const params = parseRequestValue(res, shipmentStepParamsSchema, req.params);
      if (!params) return;
      const result = await updateShipmentStepRecord({
        shipmentId: params.id,
        stepId: params.stepId,
        updates: req.body || {},
        actorUser: user,
      });
      if (!result) return createApiError(res, 404, "NOT_FOUND", "Shipment step was not found.");
      await auditLog({
        actorUserId: user.id,
        action: "shipment_step.update",
        entityType: "SHIPMENT_STEP",
        entityId: params.stepId,
        summary: "Shipment step was updated.",
        before: result.before,
        after: { step: result.after, workflowTask: result.workflowTask },
        requestContext: requestContext(req),
      });
      res.json({ ok: true, data: result });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      console.error("Update shipment step failed:", error);
      createApiError(res, 500, "SHIPMENT_STEP_UPDATE_FAILED", "Could not update shipment step.");
    }
  });
}
