import {
  customerCreateBodySchema,
  customerParamsSchema,
  customerRelatedParamsSchema,
  customerUpdateBodySchema,
} from "../request-schemas.js";
import { parseRequestValue } from "../validation.js";

function requireCompanyCeoRole(user) {
  if (user?.role === "CEO") return;
  const error = new Error("Company CEO access is required.");
  error.statusCode = 403;
  throw error;
}

export function registerCustomerRoutes(
  app,
  {
    archiveCustomerRecord,
    auditLog,
    createApiError,
    createCustomerRecord,
    getCustomerRecord,
    listCustomerRelated,
    listCustomersDetailed,
    requestContext,
    requireAuthenticatedUser,
    requireTenantContext,
    requirePermission,
    updateCustomerRecord,
  }
) {
  app.get("/api/customers", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      const tenantContext = requireTenantContext(req, res, "list customers");
      if (!tenantContext) return;
      await requirePermission(user, "customers.view");
      const data = await listCustomersDetailed({
        includeArchived: req.query.includeArchived === "true",
        search: req.query.search || "",
        organizationId: tenantContext.organizationId,
        includePrivateDetails: user.role === "CEO",
      });
      res.json({ ok: true, data });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      console.error("List customers failed:", error);
      createApiError(res, 500, "CUSTOMERS_LIST_FAILED", "Could not load customers.");
    }
  });

  app.post("/api/customers", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      const tenantContext = requireTenantContext(req, res, "create customer");
      if (!tenantContext) return;
      await requirePermission(user, "customers.create");
      requireCompanyCeoRole(user);
      const body = parseRequestValue(res, customerCreateBodySchema, req.body || {});
      if (!body) return;
      const created = await createCustomerRecord({ ownerUserId: user.id, actorUserId: user.id, customer: body });
      await auditLog({
        actorUserId: user.id,
        action: "customer.create",
        entityType: "customer",
        entityId: created.id,
        summary: "Customer was created.",
        after: created,
        requestContext: requestContext(req),
      });
      res.status(201).json({ ok: true, data: created });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      if (error.statusCode === 409) return createApiError(res, 409, error.code || "DUPLICATE", error.message, "email");
      console.error("Create customer failed:", error);
      createApiError(res, 500, "CUSTOMER_CREATE_FAILED", "Could not create customer.");
    }
  });

  app.get("/api/customers/:id", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      const tenantContext = requireTenantContext(req, res, "get customer");
      if (!tenantContext) return;
      await requirePermission(user, "customers.view");
      const params = parseRequestValue(res, customerParamsSchema, req.params);
      if (!params) return;
      const customer = await getCustomerRecord(params.id, {
        organizationId: tenantContext.organizationId,
        includePrivateDetails: user.role === "CEO",
      });
      if (!customer) return createApiError(res, 404, "NOT_FOUND", "Customer was not found.");
      res.json({ ok: true, data: customer });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      console.error("Get customer failed:", error);
      createApiError(res, 500, "CUSTOMER_GET_FAILED", "Could not load customer.");
    }
  });

  app.patch("/api/customers/:id", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      const tenantContext = requireTenantContext(req, res, "update customer");
      if (!tenantContext) return;
      await requirePermission(user, "customers.update");
      requireCompanyCeoRole(user);
      const params = parseRequestValue(res, customerParamsSchema, req.params);
      if (!params) return;
      const body = parseRequestValue(res, customerUpdateBodySchema, req.body || {});
      if (!body) return;
      const result = await updateCustomerRecord(params.id, body, {
        organizationId: tenantContext.organizationId,
        actorUserId: user.id,
      });
      if (!result.after) return createApiError(res, 404, "NOT_FOUND", "Customer was not found.");
      await auditLog({
        actorUserId: user.id,
        action: "customer.update",
        entityType: "customer",
        entityId: params.id,
        summary: "Customer was updated.",
        before: result.before,
        after: result.after,
        requestContext: requestContext(req),
      });
      res.json({ ok: true, data: result.after });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      if (error.statusCode === 409) return createApiError(res, 409, error.code || "DUPLICATE", error.message, "email");
      console.error("Update customer failed:", error);
      createApiError(res, 500, "CUSTOMER_UPDATE_FAILED", "Could not update customer.");
    }
  });

  app.get("/api/customers/:id/:related", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      const tenantContext = requireTenantContext(req, res, "load customer related records");
      if (!tenantContext) return;
      await requirePermission(user, "customers.view");
      const params = parseRequestValue(res, customerRelatedParamsSchema, req.params);
      if (!params) return;
      const data = await listCustomerRelated(params.id, params.related, {
        organizationId: tenantContext.organizationId,
        includePrivateDetails: user.role === "CEO",
      });
      if (!data) return createApiError(res, 404, "NOT_FOUND", "Customer was not found.");
      res.json({ ok: true, data });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      console.error(`Get customer ${req.params.related} failed:`, error);
      createApiError(res, 500, "CUSTOMER_RELATED_FAILED", `Could not load customer ${req.params.related}.`);
    }
  });

  app.post("/api/customers/:id/archive", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      const tenantContext = requireTenantContext(req, res, "archive customer");
      if (!tenantContext) return;
      await requirePermission(user, "customers.update");
      requireCompanyCeoRole(user);
      const params = parseRequestValue(res, customerParamsSchema, req.params);
      if (!params) return;
      const result = await archiveCustomerRecord(params.id, { organizationId: tenantContext.organizationId });
      if (!result.after) return createApiError(res, 404, "NOT_FOUND", "Customer was not found.");
      await auditLog({
        actorUserId: user.id,
        action: "customer.archive",
        entityType: "customer",
        entityId: params.id,
        summary: "Customer was archived.",
        before: result.before,
        after: result.after,
        requestContext: requestContext(req),
      });
      res.json({ ok: true, data: result.after });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      console.error("Archive customer failed:", error);
      createApiError(res, 500, "CUSTOMER_ARCHIVE_FAILED", "Could not archive customer.");
    }
  });
}
