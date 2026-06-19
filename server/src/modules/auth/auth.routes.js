import { normalizePasswordLoginBody } from "./auth.service.js";

export function registerAuthRoutes(app, deps) {
  const {
    PASSWORD_LOGIN_IP_LIMIT,
    PASSWORD_LOGIN_LIMIT,
    auditIdentifierHash,
    auditLog,
    bcrypt,
    clearRateLimit,
    clearSessionCookie,
    consumeRateLimit,
    createApiError,
    createAuthenticatedSessionResponse,
    deleteSessionByToken,
    getSessionByToken,
    getSessionCookie,
    getUserByEmail,
    getUserPermissions,
    loginBlockForUser,
    rateLimitKey,
    requestContext,
    requireAuthenticatedUser,
    sendLoginBlock,
    updateUserNotificationPreferences,
    updateUserPassword,
    updateUserProfile,
    updateUserSecurity,
  } = deps;

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password, loginEmailKey } = normalizePasswordLoginBody(req.body || {});
      const loginLimitMessage = "Too many login attempts. Please wait before trying again.";
      const ipAllowed = await consumeRateLimit(req, res, "login-ip", {
        ...PASSWORD_LOGIN_IP_LIMIT,
        message: loginLimitMessage,
      });
      if (!ipAllowed) {
        await auditLog({
          actorType: "public",
          action: "auth.login_rate_limited",
          entityType: "AUTH",
          summary: "Login was rate-limited by IP.",
          metadata: { reason: "ip_limit", identifierHash: auditIdentifierHash(loginEmailKey) },
          requestContext: requestContext(req),
        });
        return;
      }

      const accountAllowed = await consumeRateLimit(req, res, "login-account", {
        ...PASSWORD_LOGIN_LIMIT,
        discriminator: loginEmailKey,
        message: loginLimitMessage,
        field: "email",
      });
      if (!accountAllowed) {
        await auditLog({
          actorType: "public",
          action: "auth.login_rate_limited",
          entityType: "AUTH",
          summary: "Login was rate-limited by account.",
          metadata: { reason: "account_limit", identifierHash: auditIdentifierHash(loginEmailKey) },
          requestContext: requestContext(req),
        });
        return;
      }

      if (!email || !password) {
        await auditLog({
          actorType: "public",
          action: "auth.login_failed",
          entityType: "AUTH",
          summary: "Login failed validation.",
          metadata: { reason: "missing_credentials", identifierHash: auditIdentifierHash(loginEmailKey) },
          requestContext: requestContext(req),
        });
        return createApiError(res, 400, "VALIDATION_ERROR", "Email and password are required.");
      }

      const user = await getUserByEmail(email);
      if (!user) {
        await auditLog({
          actorType: "public",
          action: "auth.login_failed",
          entityType: "AUTH",
          summary: "Login failed with invalid credentials.",
          metadata: { reason: "unknown_user", identifierHash: auditIdentifierHash(loginEmailKey) },
          requestContext: requestContext(req),
        });
        return createApiError(res, 401, "INVALID_CREDENTIALS", "Invalid email or password.");
      }

      const loginBlock = await loginBlockForUser(user);
      if (loginBlock) {
        await auditLog({
          actorUserId: user.id,
          organizationId: user.organization_id || user.organizationId || null,
          action: "auth.login_failed",
          entityType: "AUTH",
          entityId: user.id,
          summary: "Login was blocked by account or subscription state.",
          metadata: { reason: loginBlock.code },
          requestContext: requestContext(req),
        });
        return sendLoginBlock(res, loginBlock);
      }

      const passwordMatches = await bcrypt.compare(password, user.password_hash);
      if (!passwordMatches) {
        await auditLog({
          actorUserId: user.id,
          organizationId: user.organization_id || user.organizationId || null,
          action: "auth.login_failed",
          entityType: "AUTH",
          entityId: user.id,
          summary: "Login failed with invalid credentials.",
          metadata: { reason: "bad_password", identifierHash: auditIdentifierHash(loginEmailKey) },
          requestContext: requestContext(req),
        });
        return createApiError(res, 401, "INVALID_CREDENTIALS", "Invalid email or password.");
      }

      await clearRateLimit(rateLimitKey(req, "login-ip"));
      await clearRateLimit(rateLimitKey(req, "login-account", loginEmailKey));
      await createAuthenticatedSessionResponse(req, res, user, {
        method: "password",
        auditMetadata: { identifierHash: auditIdentifierHash(loginEmailKey) },
      });
    } catch (error) {
      console.error("Login failed:", error);
      createApiError(res, 500, "LOGIN_FAILED", "Login failed.");
    }
  });

  app.get("/api/auth/me", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      const permissions = await getUserPermissions(user.id);
      res.json({ ok: true, data: { user, permissions } });
    } catch (error) {
      console.error("Auth me failed:", error);
      createApiError(res, 500, "AUTH_ME_FAILED", "Could not load current user.");
    }
  });

  app.post("/api/auth/logout", async (req, res) => {
    try {
      const sessionToken = getSessionCookie(req);
      const session = await getSessionByToken(sessionToken).catch(() => null);
      await deleteSessionByToken(sessionToken);
      if (session?.user) {
        await auditLog({
          actorUserId: session.user.id,
          organizationId: session.user.organizationId || session.user.organization_id || null,
          action: "auth.logout",
          entityType: "SESSION",
          entityId: session.sessionId,
          summary: "User session was revoked by logout.",
          metadata: { reason: "logout" },
          requestContext: requestContext(req),
        });
      }
      clearSessionCookie(res);
      res.json({ ok: true, data: { loggedOut: true } });
    } catch (error) {
      console.error("Logout failed:", error);
      createApiError(res, 500, "LOGOUT_FAILED", "Could not log out.");
    }
  });

  app.patch("/api/profile", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;

      const nextUser = await updateUserProfile(user.id, req.body || {});
      await auditLog({
        actorUserId: user.id,
        action: "profile.update",
        entityType: "USER",
        entityId: user.id,
        summary: "User profile was updated.",
        before: user,
        after: nextUser,
        requestContext: requestContext(req),
      });
      res.json({ ok: true, data: nextUser });
    } catch (error) {
      console.error("Profile update failed:", error);
      createApiError(res, 500, "PROFILE_UPDATE_FAILED", "Could not update profile.");
    }
  });

  app.post("/api/profile/password", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;

      const { currentPassword, newPassword } = req.body || {};
      if (!currentPassword || !newPassword) {
        return createApiError(res, 400, "VALIDATION_ERROR", "Current and new password are required.");
      }
      if (String(newPassword).length < 8) {
        return createApiError(res, 400, "VALIDATION_ERROR", "New password must be at least 8 characters.", "newPassword");
      }

      const dbUser = await getUserByEmail(user.email);
      const passwordMatches = await bcrypt.compare(currentPassword, dbUser.password_hash);
      if (!passwordMatches) {
        return createApiError(res, 400, "INVALID_PASSWORD", "Current password is incorrect.", "currentPassword");
      }

      const passwordHash = await bcrypt.hash(newPassword, 12);
      await updateUserPassword(user.id, passwordHash);
      await auditLog({
        actorUserId: user.id,
        action: "profile.password_change",
        entityType: "USER",
        entityId: user.id,
        summary: "User password was changed.",
        requestContext: requestContext(req),
      });
      res.json({ ok: true, data: { changed: true } });
    } catch (error) {
      console.error("Password update failed:", error);
      createApiError(res, 500, "PASSWORD_UPDATE_FAILED", "Could not update password.");
    }
  });

  app.patch("/api/profile/security", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;

      const nextUser = await updateUserSecurity(user.id, {
        twoFactorEnabled: Boolean(req.body?.twoFactorEnabled),
      });
      await auditLog({
        actorUserId: user.id,
        action: "profile.security_update",
        entityType: "USER",
        entityId: user.id,
        summary: "User security settings were updated.",
        before: { twoFactorEnabled: user.two_factor_enabled },
        after: { twoFactorEnabled: nextUser.two_factor_enabled },
        requestContext: requestContext(req),
      });
      res.json({ ok: true, data: nextUser });
    } catch (error) {
      console.error("Security update failed:", error);
      createApiError(res, 500, "SECURITY_UPDATE_FAILED", "Could not update security settings.");
    }
  });

  app.patch("/api/profile/notifications", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;

      const nextUser = await updateUserNotificationPreferences(user.id, req.body?.preferences || {});
      await auditLog({
        actorUserId: user.id,
        action: "profile.notifications_update",
        entityType: "USER",
        entityId: user.id,
        summary: "User notification preferences were updated.",
        after: nextUser.notification_preferences,
        requestContext: requestContext(req),
      });
      res.json({ ok: true, data: nextUser });
    } catch (error) {
      console.error("Notification preferences update failed:", error);
      createApiError(res, 500, "NOTIFICATIONS_UPDATE_FAILED", "Could not update notification preferences.");
    }
  });
}
