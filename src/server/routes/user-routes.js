import {
  adminOrganizationParamsSchema,
  adminOrganizationUserParamsSchema,
  userCreateBodySchema,
  userParamsSchema,
  userPasswordBodySchema,
  userRoleBodySchema,
  userUpdateBodySchema,
} from "../request-schemas.js";
import { parseRequestValue } from "../validation.js";

function apiBlockerMessage(blockers = []) {
  return blockers[0]?.message || "User cannot be permanently deleted.";
}

function userStatus(user) {
  return user?.status || "active";
}

function hasOtherActiveCeo(users, targetId) {
  return users.some((item) => item.id !== targetId && item.role === "CEO" && userStatus(item) === "active");
}

function removesActiveCeo(target, updates, organizationUsers) {
  if (!target || target.role !== "CEO" || userStatus(target) !== "active") return false;
  const nextRole = updates.role || target.role;
  const nextStatus = updates.status || userStatus(target);
  if (nextRole === "CEO" && nextStatus === "active") return false;
  return !hasOtherActiveCeo(organizationUsers, target.id);
}

async function requireTarget({ actor, targetId, organizationId, listAppUsers, createApiError, res }) {
  const users = await listAppUsers({ organizationId });
  const target = users.find((item) => item.id === targetId);
  if (!target) {
    createApiError(res, 404, "NOT_FOUND", "User was not found.");
    return null;
  }
  return { target, users, isSelf: actor?.id === targetId };
}

function sendDeletionBlocker(res, { code = "USER_DELETE_BLOCKED", blockers = [] } = {}) {
  return res.status(409).json({
    ok: false,
    error: {
      code,
      message: apiBlockerMessage(blockers),
      blockers,
    },
  });
}

export function registerUserRoutes(
  app,
  {
    auditLog,
    bcrypt,
    createApiError,
    createAppUserRecord,
    deleteAppUserRecord,
    grantUserPermission,
    listAppUsers,
    listRoles,
    previewAppUserDeletion,
    requestContext,
    requireAuthenticatedUser,
    requireCompanyCeo,
    requirePermission,
    requirePlatformAdmin,
    revokeUserPermission,
    updateAppUserRecord,
    updateUserPassword,
  }
) {
  const loadCompanyTarget = async (req, res, actor, params) => {
    return requireTarget({
      actor,
      targetId: params.id,
      organizationId: actor.organizationId,
      listAppUsers,
      createApiError,
      res,
    });
  };

  app.get("/api/users/online", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      await requirePermission(user, "users.manage");
      const data = (await listAppUsers({ includeSuspended: false, organizationId: user.organizationId })).filter((item) => item.isOnline);
      res.json({ ok: true, data });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      console.error("Online users failed:", error);
      createApiError(res, 500, "ONLINE_USERS_FAILED", "Could not load online users.");
    }
  });

  app.get("/api/users", async (req, res) => {
    try {
      const user = await requireCompanyCeo(req, res);
      if (!user) return;
      res.json({ ok: true, data: await listAppUsers({ organizationId: user.organizationId }) });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      console.error("List users failed:", error);
      createApiError(res, 500, "USERS_LIST_FAILED", "Could not load users.");
    }
  });

  app.post("/api/users", async (req, res) => {
    try {
      const user = await requireCompanyCeo(req, res);
      if (!user) return;
      const body = parseRequestValue(res, userCreateBodySchema, req.body || {});
      if (!body) return;
      const passwordHash = await bcrypt.hash(body.password, 10);
      const created = await createAppUserRecord({
        actorUserId: user.id,
        user: {
          name: body.name,
          email: body.email,
          role: body.role,
          avatar: body.avatar || "",
          department: body.department || null,
          status: "active",
        },
        passwordHash,
      });
      await auditLog({
        actorUserId: user.id,
        action: "user.create",
        entityType: "user",
        entityId: created.id,
        summary: "User was created.",
        after: created,
        requestContext: requestContext(req),
      });
      res.status(201).json({ ok: true, data: created });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      if (error.statusCode === 402) return createApiError(res, 402, error.code || "PLAN_LIMIT_REACHED", error.message);
      if (error.code === "23505") return createApiError(res, 409, "DUPLICATE_EMAIL", "A user with this email already exists.", "email");
      console.error("Create user failed:", error);
      createApiError(res, 500, "USER_CREATE_FAILED", "Could not create user.");
    }
  });

  app.get("/api/users/:id", async (req, res) => {
    try {
      const user = await requireCompanyCeo(req, res);
      if (!user) return;
      const params = parseRequestValue(res, userParamsSchema, req.params);
      if (!params) return;
      const target = await loadCompanyTarget(req, res, user, params);
      if (!target) return;
      res.json({ ok: true, data: target.target });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      console.error("Get user failed:", error);
      createApiError(res, 500, "USER_GET_FAILED", "Could not load user.");
    }
  });

  app.patch("/api/users/:id", async (req, res) => {
    try {
      const user = await requireCompanyCeo(req, res);
      if (!user) return;
      const params = parseRequestValue(res, userParamsSchema, req.params);
      if (!params) return;
      const body = parseRequestValue(res, userUpdateBodySchema, req.body || {});
      if (!body) return;
      const target = await loadCompanyTarget(req, res, user, params);
      if (!target) return;
      if (target.isSelf && body.status && body.status !== "active") {
        return createApiError(res, 400, "SELF_SUSPEND_BLOCKED", "You cannot suspend yourself.");
      }
      if (target.isSelf && body.role && body.role !== "CEO") {
        return createApiError(res, 400, "SELF_ROLE_CHANGE_BLOCKED", "You cannot change your own CEO role.");
      }
      if (removesActiveCeo(target.target, body, target.users)) {
        return createApiError(res, 400, "LAST_CEO_BLOCKED", "At least one active CEO must remain in the organization.");
      }
      const result = await updateAppUserRecord(params.id, body, user.id, {
        organizationId: user.organizationId,
        syncOrganizationId: user.organizationId,
      });
      if (!result.after) return createApiError(res, 404, "NOT_FOUND", "User was not found.");
      await auditLog({
        actorUserId: user.id,
        action: "user.update",
        entityType: "user",
        entityId: params.id,
        summary: "User was updated.",
        before: result.before,
        after: result.after,
        requestContext: requestContext(req),
      });
      res.json({ ok: true, data: result.after });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      if (error.code === "23505") return createApiError(res, 409, "DUPLICATE_EMAIL", "A user with this email already exists.", "email");
      console.error("Update user failed:", error);
      createApiError(res, 500, "USER_UPDATE_FAILED", "Could not update user.");
    }
  });

  app.patch("/api/users/:id/role", async (req, res) => {
    try {
      const user = await requireCompanyCeo(req, res);
      if (!user) return;
      const params = parseRequestValue(res, userParamsSchema, req.params);
      if (!params) return;
      const body = parseRequestValue(res, userRoleBodySchema, req.body || {});
      if (!body) return;
      const target = await loadCompanyTarget(req, res, user, params);
      if (!target) return;
      if (target.isSelf && body.role !== "CEO") {
        return createApiError(res, 400, "SELF_ROLE_CHANGE_BLOCKED", "You cannot change your own CEO role.");
      }
      if (removesActiveCeo(target.target, { role: body.role }, target.users)) {
        return createApiError(res, 400, "LAST_CEO_BLOCKED", "At least one active CEO must remain in the organization.");
      }
      const result = await updateAppUserRecord(params.id, { role: body.role }, user.id, {
        organizationId: user.organizationId,
        syncOrganizationId: user.organizationId,
      });
      await auditLog({ actorUserId: user.id, action: "user.role_change", entityType: "user", entityId: params.id, summary: "User role was changed.", before: result.before, after: result.after, requestContext: requestContext(req) });
      res.json({ ok: true, data: result.after });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      createApiError(res, 500, "USER_ROLE_FAILED", "Could not update user role.");
    }
  });

  app.post("/api/users/:id/suspend", async (req, res) => {
    try {
      const user = await requireCompanyCeo(req, res);
      if (!user) return;
      const params = parseRequestValue(res, userParamsSchema, req.params);
      if (!params) return;
      const target = await loadCompanyTarget(req, res, user, params);
      if (!target) return;
      if (target.isSelf) return createApiError(res, 400, "SELF_SUSPEND_BLOCKED", "You cannot suspend yourself.");
      if (removesActiveCeo(target.target, { status: "suspended" }, target.users)) {
        return createApiError(res, 400, "LAST_CEO_BLOCKED", "At least one active CEO must remain in the organization.");
      }
      const result = await updateAppUserRecord(params.id, { status: "suspended" }, user.id, {
        organizationId: user.organizationId,
        syncOrganizationId: user.organizationId,
      });
      await auditLog({ actorUserId: user.id, action: "user.suspend", entityType: "user", entityId: params.id, summary: "User was suspended.", before: result.before, after: result.after, requestContext: requestContext(req) });
      res.json({ ok: true, data: result.after });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      createApiError(res, 500, "USER_SUSPEND_FAILED", "Could not suspend user.");
    }
  });

  app.post("/api/users/:id/activate", async (req, res) => {
    try {
      const user = await requireCompanyCeo(req, res);
      if (!user) return;
      const params = parseRequestValue(res, userParamsSchema, req.params);
      if (!params) return;
      const target = await loadCompanyTarget(req, res, user, params);
      if (!target) return;
      const result = await updateAppUserRecord(params.id, { status: "active" }, user.id, {
        organizationId: user.organizationId,
        syncOrganizationId: user.organizationId,
      });
      await auditLog({ actorUserId: user.id, action: "user.activate", entityType: "user", entityId: params.id, summary: "User was activated.", before: result.before, after: result.after, requestContext: requestContext(req) });
      res.json({ ok: true, data: result.after });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      createApiError(res, 500, "USER_ACTIVATE_FAILED", "Could not activate user.");
    }
  });

  app.post("/api/users/:id/password", async (req, res) => {
    try {
      const user = await requireCompanyCeo(req, res);
      if (!user) return;
      const params = parseRequestValue(res, userParamsSchema, req.params);
      if (!params) return;
      const body = parseRequestValue(res, userPasswordBodySchema, req.body || {});
      if (!body) return;
      const target = await loadCompanyTarget(req, res, user, params);
      if (!target) return;
      const passwordHash = await bcrypt.hash(body.password, 10);
      const updated = await updateUserPassword(params.id, passwordHash, { organizationId: user.organizationId });
      if (!updated) return createApiError(res, 404, "NOT_FOUND", "User was not found.");
      await auditLog({ actorUserId: user.id, action: "user.password_reset", entityType: "user", entityId: params.id, summary: "User password was reset by company CEO.", requestContext: requestContext(req) });
      res.json({ ok: true, data: { id: params.id, passwordUpdated: true } });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      createApiError(res, 500, "USER_PASSWORD_FAILED", "Could not update user password.");
    }
  });

  app.get("/api/users/:id/delete-preview", async (req, res) => {
    try {
      const user = await requireCompanyCeo(req, res);
      if (!user) return;
      const params = parseRequestValue(res, userParamsSchema, req.params);
      if (!params) return;
      const preview = await previewAppUserDeletion(params.id, { organizationId: user.organizationId, actorUserId: user.id });
      if (!preview) return createApiError(res, 404, "NOT_FOUND", "User was not found.");
      res.json({ ok: true, data: preview });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      createApiError(res, 500, "USER_DELETE_PREVIEW_FAILED", "Could not preview user deletion.");
    }
  });

  app.delete("/api/users/:id", async (req, res) => {
    try {
      const user = await requireCompanyCeo(req, res);
      if (!user) return;
      const params = parseRequestValue(res, userParamsSchema, req.params);
      if (!params) return;
      const result = await deleteAppUserRecord(params.id, { organizationId: user.organizationId, actorUserId: user.id });
      if (!result.deleted) return createApiError(res, 404, "NOT_FOUND", "User was not found.");
      await auditLog({ actorUserId: user.id, action: "user.delete", entityType: "user", entityId: params.id, summary: "User was permanently deleted.", before: result.before, requestContext: requestContext(req) });
      res.json({ ok: true, data: { id: params.id, deleted: true } });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      if (error.statusCode === 409) return sendDeletionBlocker(res, { code: error.code, blockers: error.blockers });
      createApiError(res, 500, "USER_DELETE_FAILED", "Could not delete user.");
    }
  });

  app.get("/api/roles", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      await requirePermission(user, "users.manage");
      res.json({ ok: true, data: await listRoles() });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      createApiError(res, 500, "ROLES_FAILED", "Could not load roles.");
    }
  });

  // Platform-admin boundary: orgId path params below are privileged admin targeting
  // after requirePlatformAdmin, not tenant scope for normal company user APIs.
  app.get("/api/admin/organizations/:orgId/users", async (req, res) => {
    try {
      const admin = await requirePlatformAdmin(req, res);
      if (!admin) return;
      const params = parseRequestValue(res, adminOrganizationParamsSchema, req.params);
      if (!params) return;
      res.json({ ok: true, data: await listAppUsers({ organizationId: params.orgId }) });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      createApiError(res, 500, "ADMIN_USERS_LIST_FAILED", "Could not load organization users.");
    }
  });

  const mutateAdminUser = async (req, res, updates, action) => {
    const admin = await requirePlatformAdmin(req, res);
    if (!admin) return null;
    const params = parseRequestValue(res, adminOrganizationUserParamsSchema, req.params);
    if (!params) return null;
    const target = await requireTarget({
      actor: admin,
      targetId: params.id,
      organizationId: params.orgId,
      listAppUsers,
      createApiError,
      res,
    });
    if (!target) return null;
    if (target.isSelf) return createApiError(res, 400, "SELF_ACTION_BLOCKED", "You cannot apply this action to yourself.");
    if (removesActiveCeo(target.target, updates, target.users)) {
      return createApiError(res, 400, "LAST_CEO_BLOCKED", "At least one active CEO must remain in the organization.");
    }
    const result = await updateAppUserRecord(params.id, updates, admin.id, {
      organizationId: params.orgId,
      syncOrganizationId: params.orgId,
    });
    await auditLog({ actorUserId: admin.id, action, entityType: "user", entityId: params.id, summary: "User was updated by platform admin.", before: result.before, after: result.after, requestContext: requestContext(req) });
    res.json({ ok: true, data: result.after });
    return result.after;
  };

  app.patch("/api/admin/organizations/:orgId/users/:id", async (req, res) => {
    try {
      const body = parseRequestValue(res, userUpdateBodySchema, req.body || {});
      if (!body) return;
      await mutateAdminUser(req, res, body, "admin.user.update");
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      if (error.code === "23505") return createApiError(res, 409, "DUPLICATE_EMAIL", "A user with this email already exists.", "email");
      createApiError(res, 500, "ADMIN_USER_UPDATE_FAILED", "Could not update organization user.");
    }
  });

  app.post("/api/admin/organizations/:orgId/users/:id/suspend", async (req, res) => {
    try {
      await mutateAdminUser(req, res, { status: "suspended" }, "admin.user.suspend");
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      createApiError(res, 500, "ADMIN_USER_SUSPEND_FAILED", "Could not suspend organization user.");
    }
  });

  app.post("/api/admin/organizations/:orgId/users/:id/activate", async (req, res) => {
    try {
      await mutateAdminUser(req, res, { status: "active" }, "admin.user.activate");
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      createApiError(res, 500, "ADMIN_USER_ACTIVATE_FAILED", "Could not activate organization user.");
    }
  });

  app.post("/api/admin/organizations/:orgId/users/:id/password", async (req, res) => {
    try {
      const admin = await requirePlatformAdmin(req, res);
      if (!admin) return;
      const params = parseRequestValue(res, adminOrganizationUserParamsSchema, req.params);
      if (!params) return;
      const body = parseRequestValue(res, userPasswordBodySchema, req.body || {});
      if (!body) return;
      const target = await requireTarget({ actor: admin, targetId: params.id, organizationId: params.orgId, listAppUsers, createApiError, res });
      if (!target) return;
      const passwordHash = await bcrypt.hash(body.password, 10);
      const updated = await updateUserPassword(params.id, passwordHash, { organizationId: params.orgId });
      if (!updated) return createApiError(res, 404, "NOT_FOUND", "User was not found.");
      await auditLog({ actorUserId: admin.id, action: "admin.user.password_reset", entityType: "user", entityId: params.id, summary: "User password was reset by platform admin.", requestContext: requestContext(req) });
      res.json({ ok: true, data: { id: params.id, passwordUpdated: true } });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      createApiError(res, 500, "ADMIN_USER_PASSWORD_FAILED", "Could not update organization user password.");
    }
  });

  app.get("/api/admin/organizations/:orgId/users/:id/delete-preview", async (req, res) => {
    try {
      const admin = await requirePlatformAdmin(req, res);
      if (!admin) return;
      const params = parseRequestValue(res, adminOrganizationUserParamsSchema, req.params);
      if (!params) return;
      const preview = await previewAppUserDeletion(params.id, { organizationId: params.orgId, actorUserId: admin.id });
      if (!preview) return createApiError(res, 404, "NOT_FOUND", "User was not found.");
      res.json({ ok: true, data: preview });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      createApiError(res, 500, "ADMIN_USER_DELETE_PREVIEW_FAILED", "Could not preview organization user deletion.");
    }
  });

  app.delete("/api/admin/organizations/:orgId/users/:id", async (req, res) => {
    try {
      const admin = await requirePlatformAdmin(req, res);
      if (!admin) return;
      const params = parseRequestValue(res, adminOrganizationUserParamsSchema, req.params);
      if (!params) return;
      const result = await deleteAppUserRecord(params.id, { organizationId: params.orgId, actorUserId: admin.id });
      if (!result.deleted) return createApiError(res, 404, "NOT_FOUND", "User was not found.");
      await auditLog({ actorUserId: admin.id, action: "admin.user.delete", entityType: "user", entityId: params.id, summary: "User was permanently deleted by platform admin.", before: result.before, requestContext: requestContext(req) });
      res.json({ ok: true, data: { id: params.id, deleted: true } });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      if (error.statusCode === 409) return sendDeletionBlocker(res, { code: error.code, blockers: error.blockers });
      createApiError(res, 500, "ADMIN_USER_DELETE_FAILED", "Could not delete organization user.");
    }
  });

  app.post("/api/admin/users/:id/platform-admin/grant", async (req, res) => {
    try {
      const admin = await requirePlatformAdmin(req, res);
      if (!admin) return;
      const params = parseRequestValue(res, userParamsSchema, req.params);
      if (!params) return;
      const result = await grantUserPermission(params.id, "platform.admin", {
        grantedById: admin.id,
        reason: "Granted by platform admin API",
        audit: {
          actorUserId: admin.id,
          actorType: "platform_admin",
          action: "permission.platform_admin.grant",
          entityType: "USER_PERMISSION",
          entityId: params.id,
          summary: "platform.admin permission was granted.",
          requestContext: requestContext(req),
        },
      });
      if (!result) return createApiError(res, 404, "NOT_FOUND", "User was not found.");
      res.json({ ok: true, data: { userId: params.id, permission: "platform.admin", granted: true } });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      if (error.statusCode === 404) return createApiError(res, 404, error.code || "NOT_FOUND", error.message);
      createApiError(res, 500, "PLATFORM_ADMIN_GRANT_FAILED", "Could not grant platform admin permission.");
    }
  });

  app.post("/api/admin/users/:id/platform-admin/revoke", async (req, res) => {
    try {
      const admin = await requirePlatformAdmin(req, res);
      if (!admin) return;
      const params = parseRequestValue(res, userParamsSchema, req.params);
      if (!params) return;
      if (params.id === admin.id) {
        return createApiError(res, 400, "SELF_PLATFORM_ADMIN_REVOKE_BLOCKED", "You cannot revoke your own platform admin permission.");
      }
      const result = await revokeUserPermission(params.id, "platform.admin", {
        audit: {
          actorUserId: admin.id,
          actorType: "platform_admin",
          action: "permission.platform_admin.revoke",
          entityType: "USER_PERMISSION",
          entityId: params.id,
          summary: "platform.admin permission was revoked.",
          requestContext: requestContext(req),
        },
      });
      if (!result) return createApiError(res, 404, "NOT_FOUND", "User was not found.");
      res.json({ ok: true, data: { userId: params.id, permission: "platform.admin", granted: false } });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      if (error.statusCode === 404) return createApiError(res, 404, error.code || "NOT_FOUND", error.message);
      createApiError(res, 500, "PLATFORM_ADMIN_REVOKE_FAILED", "Could not revoke platform admin permission.");
    }
  });
}
