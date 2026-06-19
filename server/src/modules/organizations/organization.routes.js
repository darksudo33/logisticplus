import { parseRequestValue } from "../../shared/middleware/validate.middleware.js";
import { manualSignupMissingField } from "./organization.service.js";
import { organizationMembersQuerySchema } from "./organization.validation.js";

export function registerOrganizationRoutes(app, deps) {
  const {
    auditLog,
    bcrypt,
    createApiError,
    createManualCompanySignup,
    expireOrganizationSubscription,
    getOrganizationBilling,
    getOrganizationDetail,
    getOrganizationSubscription,
    listOrganizationMembers,
    listOrganizations,
    renewOrganizationSubscription,
    requestContext,
    requireAuthenticatedUser,
    requirePlatformAdmin,
    updateOrganizationRecord,
    updateOrganizationStatus,
    updateOrganizationSubscription,
    userHasPermission,
  } = deps;

  app.get("/api/organization/members", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      const canAssignTasks = await userHasPermission(user, "tasks.assign");
      const allowed = await Promise.all([
        userHasPermission(user, "tasks.create"),
        Promise.resolve(canAssignTasks),
        userHasPermission(user, "shipment_steps.update"),
        userHasPermission(user, "users.manage"),
      ]);
      if (!allowed.some(Boolean)) {
        return createApiError(res, 403, "FORBIDDEN", "Missing permission: organization member lookup.");
      }
      const query = parseRequestValue(res, organizationMembersQuerySchema, req.query || {});
      if (!query) return;
      const data = canAssignTasks
        ? await listOrganizationMembers({
            organizationId: user.organizationId,
            includeInactive: query.includeInactive,
          })
        : [{
            userId: user.id,
            displayName: user.name,
            email: user.email,
            roleName: user.role,
            active: user.status !== "suspended",
          }];
      res.json({ ok: true, data });
    } catch (error) {
      console.error("List organization members failed:", error);
      createApiError(res, 500, "ORGANIZATION_MEMBERS_FAILED", "Could not load organization members.");
    }
  });

  app.get("/api/admin/organizations", async (req, res) => {
    try {
      const user = await requirePlatformAdmin(req, res);
      if (!user) return;
      res.json({ ok: true, data: await listOrganizations() });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      createApiError(res, 500, "ORGANIZATIONS_FAILED", "Could not load organizations.");
    }
  });

  app.post("/api/admin/organizations/manual-signup", async (req, res) => {
    try {
      const user = await requirePlatformAdmin(req, res);
      if (!user) return;
      const body = req.body || {};
      const missingField = manualSignupMissingField(body);
      if (missingField) return createApiError(res, 400, "VALIDATION_ERROR", "Required company signup field is missing.", missingField);
      if (String(body.password).length < 8) {
        return createApiError(res, 400, "VALIDATION_ERROR", "Password must be at least 8 characters.", "password");
      }
      const passwordHash = await bcrypt.hash(String(body.password), 12);
      const data = await createManualCompanySignup({ signup: body, passwordHash, reviewerId: user.id });
      await auditLog({
        actorUserId: user.id,
        action: "signup.manual_created",
        entityType: "organization",
        entityId: data.organizationId,
        summary: "Company was manually created by platform admin.",
        after: { companyName: body.companyName, ownerEmail: body.ownerEmail, planId: body.planId },
        requestContext: requestContext(req),
      });
      res.status(201).json({ ok: true, data });
    } catch (error) {
      if (error.statusCode === 409) return createApiError(res, 409, error.code || "CONFLICT", error.message, "ownerEmail");
      if (error.statusCode === 400) return createApiError(res, 400, error.code || "VALIDATION_ERROR", error.message);
      console.error("Manual company signup failed:", error);
      createApiError(res, 500, "MANUAL_SIGNUP_FAILED", "Could not create company manually.");
    }
  });

  app.get("/api/admin/organizations/:id", async (req, res) => {
    try {
      const user = await requirePlatformAdmin(req, res);
      if (!user) return;
      const data = await getOrganizationDetail(req.params.id);
      if (!data) return createApiError(res, 404, "NOT_FOUND", "Organization was not found.");
      res.json({ ok: true, data });
    } catch (error) {
      createApiError(res, 500, "ORGANIZATION_DETAIL_FAILED", "Could not load organization.");
    }
  });

  app.patch("/api/admin/organizations/:id", async (req, res) => {
    try {
      const user = await requirePlatformAdmin(req, res);
      if (!user) return;
      const data = await updateOrganizationRecord(req.params.id, req.body || {});
      if (!data) return createApiError(res, 404, "NOT_FOUND", "Organization was not found.");
      await auditLog({ actorUserId: user.id, action: "organization.update", entityType: "organization", entityId: req.params.id, summary: "Organization was updated by platform admin.", after: data, requestContext: requestContext(req) });
      res.json({ ok: true, data });
    } catch (error) {
      createApiError(res, 500, "ORGANIZATION_UPDATE_FAILED", "Could not update organization.");
    }
  });

  app.post("/api/admin/organizations/:id/suspend", async (req, res) => {
    try {
      const user = await requirePlatformAdmin(req, res);
      if (!user) return;
      const data = await updateOrganizationStatus(req.params.id, "suspended");
      await auditLog({ actorUserId: user.id, action: "organization.suspend", entityType: "organization", entityId: req.params.id, summary: "Organization was suspended by platform admin.", after: data, requestContext: requestContext(req) });
      res.json({ ok: true, data });
    } catch (error) {
      createApiError(res, 500, "ORGANIZATION_SUSPEND_FAILED", "Could not suspend organization.");
    }
  });

  app.post("/api/admin/organizations/:id/activate", async (req, res) => {
    try {
      const user = await requirePlatformAdmin(req, res);
      if (!user) return;
      const data = await updateOrganizationStatus(req.params.id, "active");
      await auditLog({ actorUserId: user.id, action: "organization.activate", entityType: "organization", entityId: req.params.id, summary: "Organization was activated by platform admin.", after: data, requestContext: requestContext(req) });
      res.json({ ok: true, data });
    } catch (error) {
      createApiError(res, 500, "ORGANIZATION_ACTIVATE_FAILED", "Could not activate organization.");
    }
  });

  app.get("/api/admin/organizations/:id/subscription", async (req, res) => {
    try {
      const user = await requirePlatformAdmin(req, res);
      if (!user) return;
      const data = await getOrganizationSubscription(req.params.id);
      if (!data) return createApiError(res, 404, "NOT_FOUND", "Subscription was not found.");
      res.json({ ok: true, data });
    } catch (error) {
      createApiError(res, 500, "SUBSCRIPTION_FAILED", "Could not load subscription.");
    }
  });

  app.patch("/api/admin/organizations/:id/subscription", async (req, res) => {
    try {
      const user = await requirePlatformAdmin(req, res);
      if (!user) return;
      const data = await updateOrganizationSubscription(req.params.id, req.body || {});
      await auditLog({ actorUserId: user.id, action: "subscription.update", entityType: "organization_subscription", entityId: data?.id || req.params.id, summary: "Subscription limits were updated by platform admin.", after: data, requestContext: requestContext(req) });
      res.json({ ok: true, data });
    } catch (error) {
      createApiError(res, 500, "SUBSCRIPTION_UPDATE_FAILED", "Could not update subscription.");
    }
  });

  app.get("/api/admin/organizations/:id/billing", async (req, res) => {
    try {
      const user = await requirePlatformAdmin(req, res);
      if (!user) return;
      res.json({ ok: true, data: await getOrganizationBilling(req.params.id) });
    } catch (error) {
      createApiError(res, 500, "ORGANIZATION_BILLING_FAILED", "Could not load organization billing.");
    }
  });

  app.post("/api/admin/organizations/:id/subscription/renew", async (req, res) => {
    try {
      const user = await requirePlatformAdmin(req, res);
      if (!user) return;
      const data = await renewOrganizationSubscription(req.params.id, { actorUserId: user.id });
      if (!data) return createApiError(res, 404, "NOT_FOUND", "Subscription was not found.");
      await auditLog({ actorUserId: user.id, action: "subscription.renew", entityType: "organization_subscription", entityId: data.id, summary: "Subscription was renewed.", after: data, requestContext: requestContext(req) });
      res.json({ ok: true, data });
    } catch (error) {
      createApiError(res, 500, "SUBSCRIPTION_RENEW_FAILED", "Could not renew subscription.");
    }
  });

  app.post("/api/admin/organizations/:id/subscription/expire", async (req, res) => {
    try {
      const user = await requirePlatformAdmin(req, res);
      if (!user) return;
      const data = await expireOrganizationSubscription(req.params.id, { actorUserId: user.id });
      if (!data) return createApiError(res, 404, "NOT_FOUND", "Subscription was not found.");
      await auditLog({ actorUserId: user.id, action: "subscription.expire", entityType: "organization_subscription", entityId: data.id, summary: "Subscription was expired.", after: data, requestContext: requestContext(req) });
      res.json({ ok: true, data });
    } catch (error) {
      console.error("Subscription expire failed:", error);
      createApiError(res, 500, "SUBSCRIPTION_EXPIRE_FAILED", "Could not expire subscription.");
    }
  });
}
