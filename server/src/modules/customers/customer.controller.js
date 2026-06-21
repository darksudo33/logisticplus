import { parseRequestValue } from "../../shared/middleware/validate.middleware.js";
import {
  customerCreateBodySchema,
  customerParamsSchema,
  customerRelatedParamsSchema,
  customerUpdateBodySchema,
} from "./customer.validation.js";
import {
  archiveCustomerService,
  createCustomerService,
  getCustomerService,
  listCustomerRelatedService,
  listCustomersService,
  requireCompanyCeoRole,
  requireCustomerManagerRole,
  updateCustomerService,
} from "./customer.service.js";

function forbidden(error, createApiError, res) {
  return error.statusCode === 403
    ? createApiError(res, 403, "FORBIDDEN", error.message)
    : null;
}

export function createCustomerController(deps) {
  return {
    listCustomers: async (req, res) => {
      try {
        const user = await deps.requireAuthenticatedUser(req, res);
        if (!user) return;
        const tenantContext = deps.requireTenantContext(req, res, "list customers");
        if (!tenantContext) return;
        const data = await listCustomersService({
          user,
          tenantContext,
          query: req.query || {},
          listCustomersDetailed: deps.listCustomersDetailed,
        });
        res.json({ ok: true, data });
      } catch (error) {
        if (forbidden(error, deps.createApiError, res)) return;
        console.error("List customers failed:", error);
        deps.createApiError(res, 500, "CUSTOMERS_LIST_FAILED", "Could not load customers.");
      }
    },

    createCustomer: async (req, res) => {
      try {
        const user = await deps.requireAuthenticatedUser(req, res);
        if (!user) return;
        const tenantContext = deps.requireTenantContext(req, res, "create customer");
        if (!tenantContext) return;
        await deps.requirePermission(user, "customers.create");
        requireCustomerManagerRole(user);
        const body = parseRequestValue(res, customerCreateBodySchema, req.body || {});
        if (!body) return;
        const created = await createCustomerService({
          user,
          body,
          createCustomerRecord: deps.createCustomerRecord,
          auditLog: deps.auditLog,
          requestContext: deps.requestContext(req),
        });
        res.status(201).json({ ok: true, data: created });
      } catch (error) {
        if (forbidden(error, deps.createApiError, res)) return;
        if (error.statusCode === 409) return deps.createApiError(res, 409, error.code || "DUPLICATE", error.message, "email");
        console.error("Create customer failed:", error);
        deps.createApiError(res, 500, "CUSTOMER_CREATE_FAILED", "Could not create customer.");
      }
    },

    getCustomer: async (req, res) => {
      try {
        const user = await deps.requireAuthenticatedUser(req, res);
        if (!user) return;
        const tenantContext = deps.requireTenantContext(req, res, "get customer");
        if (!tenantContext) return;
        await deps.requirePermission(user, "customers.view");
        const params = parseRequestValue(res, customerParamsSchema, req.params);
        if (!params) return;
        const customer = await getCustomerService({
          user,
          tenantContext,
          params,
          getCustomerRecord: deps.getCustomerRecord,
        });
        if (!customer) return deps.createApiError(res, 404, "NOT_FOUND", "Customer was not found.");
        res.json({ ok: true, data: customer });
      } catch (error) {
        if (forbidden(error, deps.createApiError, res)) return;
        console.error("Get customer failed:", error);
        deps.createApiError(res, 500, "CUSTOMER_GET_FAILED", "Could not load customer.");
      }
    },

    updateCustomer: async (req, res) => {
      try {
        const user = await deps.requireAuthenticatedUser(req, res);
        if (!user) return;
        const tenantContext = deps.requireTenantContext(req, res, "update customer");
        if (!tenantContext) return;
        await deps.requirePermission(user, "customers.update");
        requireCustomerManagerRole(user);
        const params = parseRequestValue(res, customerParamsSchema, req.params);
        if (!params) return;
        const body = parseRequestValue(res, customerUpdateBodySchema, req.body || {});
        if (!body) return;
        const result = await updateCustomerService({
          user,
          tenantContext,
          params,
          body,
          updateCustomerRecord: deps.updateCustomerRecord,
          auditLog: deps.auditLog,
          requestContext: deps.requestContext(req),
        });
        if (!result.after) return deps.createApiError(res, 404, "NOT_FOUND", "Customer was not found.");
        res.json({ ok: true, data: result.after });
      } catch (error) {
        if (forbidden(error, deps.createApiError, res)) return;
        if (error.statusCode === 409) return deps.createApiError(res, 409, error.code || "DUPLICATE", error.message, "email");
        console.error("Update customer failed:", error);
        deps.createApiError(res, 500, "CUSTOMER_UPDATE_FAILED", "Could not update customer.");
      }
    },

    listCustomerRelated: async (req, res) => {
      try {
        const user = await deps.requireAuthenticatedUser(req, res);
        if (!user) return;
        const tenantContext = deps.requireTenantContext(req, res, "load customer related records");
        if (!tenantContext) return;
        await deps.requirePermission(user, "customers.view");
        const params = parseRequestValue(res, customerRelatedParamsSchema, req.params);
        if (!params) return;
        const data = await listCustomerRelatedService({
          user,
          tenantContext,
          params,
          listCustomerRelated: deps.listCustomerRelated,
        });
        if (!data) return deps.createApiError(res, 404, "NOT_FOUND", "Customer was not found.");
        res.json({ ok: true, data });
      } catch (error) {
        if (forbidden(error, deps.createApiError, res)) return;
        console.error(`Get customer ${req.params.related} failed:`, error);
        deps.createApiError(res, 500, "CUSTOMER_RELATED_FAILED", `Could not load customer ${req.params.related}.`);
      }
    },

    archiveCustomer: async (req, res) => {
      try {
        const user = await deps.requireAuthenticatedUser(req, res);
        if (!user) return;
        const tenantContext = deps.requireTenantContext(req, res, "archive customer");
        if (!tenantContext) return;
        await deps.requirePermission(user, "customers.update");
        requireCompanyCeoRole(user);
        const params = parseRequestValue(res, customerParamsSchema, req.params);
        if (!params) return;
        const result = await archiveCustomerService({
          user,
          tenantContext,
          params,
          archiveCustomerRecord: deps.archiveCustomerRecord,
          auditLog: deps.auditLog,
          requestContext: deps.requestContext(req),
        });
        if (!result.after) return deps.createApiError(res, 404, "NOT_FOUND", "Customer was not found.");
        res.json({ ok: true, data: result.after });
      } catch (error) {
        if (forbidden(error, deps.createApiError, res)) return;
        console.error("Archive customer failed:", error);
        deps.createApiError(res, 500, "CUSTOMER_ARCHIVE_FAILED", "Could not archive customer.");
      }
    },
  };
}
