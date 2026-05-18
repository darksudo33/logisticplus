import express from "express";
import path from "path";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import http from "node:http";
import { WebSocketServer } from "ws";
import {
  addChatThreadMember,
  archiveDocumentRecord,
  archiveChequeRecord,
  archiveComplianceMeetingRecord,
  archiveCustomerRecord,
  archiveEntityRecord,
  auditLog,
  checkDatabase,
  convertQuotationToShipment,
  createApiError,
  createAppUserRecord,
  createBillingInvoice,
  createChatMessage,
  createChatThread,
  createContactRequest,
  createLoginSmsChallenge,
  createCustomerRecord,
  createSession,
  createManualCompanySignup,
  createSignupWithPayment,
  createDocumentRecord,
  createChequeRecord,
  createComplianceMeetingRecord,
  createAppErrorLog,
  createQuotationRecord,
  createShipmentTaskRecord,
  createTaskRecord,
  deleteSessionByToken,
  deleteArchivedEntityRecord,
  disableShipmentCustomerAccess,
  ensureDirectChat,
  generateShipmentCustomerAccess,
  expireOrganizationSubscription,
  getChangeLog,
  getDocumentDetail,
  getDocumentForDownload,
  getFeatureConfig,
  listDocumentStorageKeysForCleanup,
  getPublicDocument,
  getPublicDocumentByTrackingToken,
  getPublicTrackingByToken,
  getRecordsForUser,
  getSessionByToken,
  getShipmentCustomerAccess,
  getShipmentRecord,
  getTaskRecord,
  getChequeRecord,
  getComplianceMeetingRecord,
  getAdminOverview,
  getAppErrorLog,
  getSmsAnalytics,
  getDashboardData,
  getCustomerRecord,
  getBillingInvoice,
  getOrganizationDetail,
  getOrganizationBilling,
  getOrganizationSubscription,
  getQuotationRecord,
  getUserById,
  getUserByEmail,
  getUserByPhone,
  getUserPermissions,
  getBillingPayment,
  getBillingPaymentByAuthority,
  listOrganizations,
  listAppUsers,
  listArchiveRecords,
  listChangeLogs,
  listChatMessages,
  listChatThreadMemberIds,
  listChatThreads,
  listContactRequests,
  listCustomerRelated,
  listCustomersDetailed,
  listDocuments,
  listFeatureRecords,
  listCheques,
  listComplianceMeetings,
  listDueSoonCheques,
  listAppErrorLogs,
  listBillingInvoices,
  listBillingPayments,
  listQuotations,
  listRoles,
  listSignupRequests,
  listSmsDeliveries,
  listSmsTemplates,
  listSubscriptionPlans,
  listShipmentSteps,
  listTasks,
  markChatThreadRead,
  markBillingPaymentManually,
  markPaymentRequested,
  markPaymentVerifiedByAuthority,
  replaceRecordsForUser,
  replaceDocumentFileRecord,
  recordImmediateSmsDelivery,
  reviewSignupRequest,
  resolveContactRequest,
  resolveAppErrorLog,
  removeChatThreadMember,
  requirePermission,
  renewOrganizationSubscription,
  restoreEntityRecord,
  searchPublicTracking,
  setQuotationStatus,
  setTaskStatus,
  updateDocumentMetadata,
  updateDocumentVisibility,
  updateChequeRecord,
  updateComplianceMeetingRecord,
  updateAppUserRecord,
  updateOrganizationRecord,
  updateOrganizationStatus,
  updateOrganizationSubscription,
  updateCustomerRecord,
  updateMeetingRequiredDocument,
  updateQuotationRecord,
  updateShipmentPublicStatus,
  updateShipmentStepRecord,
  updateSmsTemplate,
  updateTaskRecord,
  upsertMeetingRequiredDocument,
  updateUserNotificationPreferences,
  updateUserPassword,
  updateUserProfile,
  updateUserSecurity,
  userCanAccessThread,
  verifyLoginSmsChallenge,
  voidBillingInvoice,
} from "./src/server/db.js";
import {
  cleanupPersistedDocument,
  deleteStoredDocumentFiles,
  persistDocumentFile,
  sendStoredDocument,
  uploadSingle,
} from "./src/server/document-storage.js";
import {
  clearRateLimit,
  consumeRateLimit,
  isRateLimited,
  rateLimitKey,
  recordRateLimitHit,
} from "./src/server/rate-limit.js";
import { runStartupChecks, shouldTrustProxy } from "./src/server/startup-checks.js";
import { runSmsWorkerOnce, startSmsWorker } from "./src/server/sms-worker.js";
import { sendSmsMessage } from "./src/server/sms-provider.js";

const SESSION_COOKIE = "logisticplus_session";

const chatClients = new Map();

function broadcastChat(event, userIds) {
  const message = JSON.stringify(event);
  for (const [ws, client] of chatClients.entries()) {
    if (ws.readyState !== ws.OPEN) continue;
    if (userIds && !userIds.includes(client.user.id)) continue;
    ws.send(message);
  }
}

function parseCookies(cookieHeader = "") {
  return Object.fromEntries(
    cookieHeader
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [key, ...value] = part.split("=");
        return [decodeURIComponent(key), decodeURIComponent(value.join("="))];
      })
  );
}

function getSessionCookie(req) {
  return parseCookies(req.headers.cookie || "")[SESSION_COOKIE];
}

function setSessionCookie(res, token, expiresAt, { remember = false } = {}) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  const expiry = remember ? `; Expires=${expiresAt.toUTCString()}` : "";
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/${expiry}${secure}`
  );
}

function clearSessionCookie(res) {
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`
  );
}

function requestContext(req) {
  return {
    ip: req.ip || req.socket?.remoteAddress,
    userAgent: req.headers["user-agent"],
  };
}

function wantsRemember(body = {}) {
  return body.remember === true || body.remember === "true";
}

function loginBlockForUser(user) {
  if (user.status && user.status !== "active") {
    return {
      status: 403,
      code: user.status === "pending" ? "PENDING_REVIEW" : "USER_INACTIVE",
      message: user.status === "pending" ? "Your workspace is waiting for admin approval." : "User account is not active.",
    };
  }

  if (user.organization_status && user.organization_status !== "active") {
    return {
      status: 403,
      code: "ORGANIZATION_INACTIVE",
      message: "Your organization is not active yet.",
    };
  }

  if (
    String(user.email || "").toLowerCase() !== "darksudo22@gmail.com" &&
    ["expired", "suspended", "cancelled", "rejected"].includes(user.subscription_status || "")
  ) {
    return {
      status: 403,
      code: "SUBSCRIPTION_INACTIVE",
      message: "Your subscription is not active.",
    };
  }

  return null;
}

function isMissingSmsSchemaError(error) {
  const message = String(error?.message || "");
  return (
    error?.code === "42P01" &&
    (message.includes("login_sms_challenges") || message.includes("sms_deliveries"))
  );
}

function sendSmsSchemaNotReady(res) {
  const localHint =
    process.env.NODE_ENV === "production"
      ? ""
      : " Run npm run db:schema, or npm run db:seed && npm run db:bridge if you want to reset local seed data.";
  return createApiError(
    res,
    503,
    "SMS_SCHEMA_NOT_READY",
    `SMS login storage is not ready.${localHint}`
  );
}

function sendLoginBlock(res, block) {
  return res.status(block.status).json({
    ok: false,
    error: {
      code: block.code,
      message: block.message,
    },
  });
}

async function createAuthenticatedSessionResponse(req, res, user) {
  const remember = wantsRemember(req.body || {});
  const { password_hash, ...safeUser } = user;
  const session = await createSession(user.id, { remember });
  setSessionCookie(res, session.token, session.expiresAt, { remember });
  const records = await getRecordsForUser(user.id);
  res.json({ user: safeUser, records });
}

function normalizeContactRequestBody(body = {}) {
  const preferredContactMethod = ["phone", "email", "either"].includes(body.preferredContactMethod)
    ? body.preferredContactMethod
    : "phone";
  return {
    companyName: String(body.companyName || "").trim(),
    contactName: String(body.contactName || "").trim(),
    contactEmail: String(body.contactEmail || "").trim(),
    contactPhone: String(body.contactPhone || "").trim(),
    preferredContactMethod,
    message: String(body.message || "").trim(),
  };
}

function publicTrackLink(req, token) {
  return `${appBaseUrl(req)}/track/${encodeURIComponent(token)}`;
}

function appBaseUrl(req) {
  return process.env.APP_PUBLIC_URL || `${req.protocol}://${req.get("host")}`;
}

function normalizeZarinpalAmount(amount) {
  return Math.max(1000, Math.round(Number(amount || 0)));
}

function zarinpalTimeoutMs() {
  const parsed = Number(process.env.ZARINPAL_TIMEOUT_MS || 10000);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 10000;
}

async function postZarinpalJson(url, body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), zarinpalTimeoutMs());
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const raw = await response.json().catch(() => ({}));
    return { response, raw };
  } catch (error) {
    const gatewayError = new Error(
      error.name === "AbortError"
        ? "Zarinpal request timed out."
        : "Could not reach Zarinpal."
    );
    gatewayError.statusCode = error.name === "AbortError" ? 504 : 502;
    gatewayError.raw = { name: error.name, message: error.message };
    throw gatewayError;
  } finally {
    clearTimeout(timeout);
  }
}

async function validateDocumentAssociations({ shipmentId, customerId, organizationId }) {
  if (shipmentId) {
    const shipment = await getShipmentRecord(shipmentId, { organizationId });
    if (!shipment) {
      const error = new Error("Shipment was not found.");
      error.statusCode = 404;
      error.code = "SHIPMENT_NOT_FOUND";
      throw error;
    }
  }
  if (customerId) {
    const customer = await getCustomerRecord(customerId, { organizationId });
    if (!customer) {
      const error = new Error("Customer was not found.");
      error.statusCode = 404;
      error.code = "CUSTOMER_NOT_FOUND";
      throw error;
    }
  }
}

async function requestZarinpalPayment(req, payment) {
  const amount = normalizeZarinpalAmount(payment.amount_irr);
  const callbackUrl = `${appBaseUrl(req)}/api/billing/zarinpal/callback`;
  const sandbox = process.env.ZARINPAL_SANDBOX !== "false";
  const merchantId = process.env.ZARINPAL_MERCHANT_ID;

  if (!merchantId || sandbox) {
    const authority = `SANDBOX-${payment.id}-${crypto.randomBytes(6).toString("hex")}`;
    const gatewayUrl = `${appBaseUrl(req)}/api/billing/zarinpal/callback?Authority=${encodeURIComponent(authority)}&Status=OK`;
    return { authority, gatewayUrl, raw: { sandbox: true, amount, callbackUrl } };
  }

  const { response, raw } = await postZarinpalJson("https://api.zarinpal.com/pg/v4/payment/request.json", {
    merchant_id: merchantId,
    amount,
    callback_url: callbackUrl,
    description: payment.description || "اشتراک لجستیک پلاس",
    metadata: {},
  });
  const authority = raw?.data?.authority;
  if (!response.ok || !authority) {
    const error = new Error(raw?.errors?.message || "Could not start Zarinpal payment.");
    error.statusCode = 502;
    error.raw = raw;
    throw error;
  }
  return {
    authority,
    gatewayUrl: `https://www.zarinpal.com/pg/StartPay/${authority}`,
    raw,
  };
}

async function verifyZarinpalPayment(payment, authority, status) {
  const amount = normalizeZarinpalAmount(payment.amount_irr);
  const sandbox = process.env.ZARINPAL_SANDBOX !== "false";
  const merchantId = process.env.ZARINPAL_MERCHANT_ID;
  if (status !== "OK") {
    const rawVerify = { status, message: "Gateway returned a non-OK status." };
    return { ok: false, refId: null, raw: rawVerify, rawVerify };
  }
  if (!merchantId || sandbox || String(authority).startsWith("SANDBOX-")) {
    const rawVerify = { sandbox: true, amount, authority };
    return { ok: true, refId: `SANDBOX-${crypto.randomBytes(5).toString("hex")}`, raw: rawVerify, rawVerify };
  }

  const { response, raw } = await postZarinpalJson("https://api.zarinpal.com/pg/v4/payment/verify.json", {
    merchant_id: merchantId,
    amount,
    authority,
  });
  const code = Number(raw?.data?.code);
  return {
    ok: response.ok && (code === 100 || code === 101),
    refId: raw?.data?.ref_id || null,
    raw,
    rawVerify: raw,
  };
}

async function getAuthenticatedSession(req) {
  return getSessionByToken(getSessionCookie(req));
}

async function requireAuthenticatedUser(req, res) {
  const session = await getAuthenticatedSession(req);
  if (!session?.user) {
    createApiError(res, 401, "UNAUTHENTICATED", "Authentication is required.");
    return null;
  }
  if (session.user.status && session.user.status !== "active") {
    createApiError(res, 403, "FORBIDDEN", "User account is not active.");
    return null;
  }
  if (session.user.organizationStatus && session.user.organizationStatus !== "active") {
    createApiError(res, 403, "ORGANIZATION_INACTIVE", "Organization is not active yet.");
    return null;
  }
  if (
    String(session.user.email || "").toLowerCase() !== "darksudo22@gmail.com" &&
    ["expired", "suspended", "cancelled", "rejected"].includes(session.user.subscriptionStatus || "")
  ) {
    createApiError(res, 403, "SUBSCRIPTION_INACTIVE", "Subscription is not active.");
    return null;
  }
  return session.user;
}

async function userHasPermission(user, permissionKey) {
  const permissions = await getUserPermissions(user.id);
  return permissions.includes(permissionKey);
}

async function requirePlatformAdmin(req, res) {
  const user = await requireAuthenticatedUser(req, res);
  if (!user) return null;
  try {
    await requirePermission(user, "platform.admin");
    return user;
  } catch (error) {
    createApiError(res, 403, "FORBIDDEN", "Platform owner access is required.");
    return null;
  }
}

async function requireCompanyCeo(req, res) {
  const user = await requireAuthenticatedUser(req, res);
  if (!user) return null;
  if (user.role !== "CEO" || !user.organizationId) {
    createApiError(res, 403, "FORBIDDEN", "Company CEO access is required.");
    return null;
  }
  return user;
}

async function requireCompanyUserTarget(actor, targetUserId, res) {
  const target = await getUserById(targetUserId);
  const targetOrganizationId = target?.organizationId || target?.organization_id;
  if (!target || targetOrganizationId !== actor.organizationId) {
    createApiError(res, 404, "NOT_FOUND", "User was not found.");
    return null;
  }
  return target;
}

function redactSensitive(value) {
  if (Array.isArray(value)) return value.map(redactSensitive).slice(0, 20);
  if (typeof value === "string" && value.length > 500) return `${value.slice(0, 500)}...[truncated ${value.length - 500} chars]`;
  if (!value || typeof value !== "object") return value;
  const sensitive = new Set(["password", "token", "cookie", "authorization", "authority", "merchant_id", "session", "secret"]);
  return Object.fromEntries(
    Object.entries(value)
      .slice(0, 50)
      .map(([key, nested]) => [
        key,
        sensitive.has(key.toLowerCase()) ? "[redacted]" : redactSensitive(nested),
      ])
  );
}

function errorForLog(error) {
  return {
    message: error?.message || String(error),
    statusCode: error?.statusCode,
    code: error?.code,
    raw: error?.raw ? redactSensitive(error.raw) : undefined,
  };
}

async function canAccessTask(user, task, action = "view") {
  if (!task) return false;
  const taskOrganizationId = task.organization_id || task.organizationId;
  if (taskOrganizationId && taskOrganizationId !== user.organizationId) return false;
  const permissions = await getUserPermissions(user.id);
  const canViewAll = permissions.includes("tasks.view_all");
  const isAssigned = task.assigned_to_id === user.id;
  if (canViewAll) return true;
  if (action === "status" && isAssigned) return true;
  return permissions.includes("tasks.view_own") && isAssigned;
}

async function startServer() {
  await runStartupChecks();
  if (process.env.CONFIG_SMOKE_ONLY === "true") {
    console.log("Startup configuration checks passed.");
    return;
  }

  const app = express();
  const PORT = Number.parseInt(process.env.PORT || "3000", 10);
  if (!Number.isFinite(PORT) || PORT <= 0) {
    throw new Error(`Invalid PORT value: ${process.env.PORT}`);
  }
  app.set("trust proxy", shouldTrustProxy());
  app.use(express.json({ limit: "1mb" }));
  app.use((req, res, next) => {
    res.on("finish", async () => {
      if (!req.path.startsWith("/api") || req.path === "/api/client-errors" || res.statusCode < 500) return;
      try {
        const session = await getAuthenticatedSession(req).catch(() => null);
        await createAppErrorLog({
          organizationId: session?.user?.organizationId,
          userId: session?.user?.id,
          severity: "error",
          source: "server",
          message: `API returned ${res.statusCode}`,
          route: req.headers.referer || "",
          apiEndpoint: `${req.method} ${req.originalUrl}`,
          httpStatus: res.statusCode,
          userAgent: req.headers["user-agent"] || "",
          context: { body: redactSensitive(req.body || {}) },
        });
      } catch (error) {
        console.error("Server error logging failed:", error);
      }
    });
    next();
  });

  // Add basic security headers
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });

  // Health check endpoint
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  app.get("/api/db/health", async (req, res) => {
    try {
      const database = await checkDatabase();
      res.json({ status: "ok", database });
    } catch (error) {
      res.status(503).json({
        status: "error",
        message: "Database is not reachable",
      });
    }
  });

  app.get("/api/plans", async (_req, res) => {
    try {
      res.json({ ok: true, data: await listSubscriptionPlans() });
    } catch (error) {
      console.error("Plans failed:", error);
      createApiError(res, 500, "PLANS_FAILED", "Could not load subscription plans.");
    }
  });

  app.post("/api/contact-requests", async (req, res) => {
    try {
      if (!(await consumeRateLimit(req, res, "contact-request", { limit: 8, windowMs: 15 * 60 * 1000 }))) return;
      const body = normalizeContactRequestBody(req.body || {});
      if (!body.companyName) {
        return createApiError(res, 400, "VALIDATION_ERROR", "Company name is required.", "companyName");
      }
      if (!body.contactName) {
        return createApiError(res, 400, "VALIDATION_ERROR", "Contact name is required.", "contactName");
      }
      if (!body.contactEmail && !body.contactPhone) {
        return createApiError(res, 400, "VALIDATION_ERROR", "Phone or email is required.", "contactPhone");
      }
      if (body.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.contactEmail)) {
        return createApiError(res, 400, "VALIDATION_ERROR", "Email is not valid.", "contactEmail");
      }

      const data = await createContactRequest(body, requestContext(req));
      await auditLog({
        action: "contact_request.created",
        entityType: "contact_request",
        entityId: data.id,
        summary: "Public contact request was created.",
        after: data,
        requestContext: requestContext(req),
      });
      res.status(201).json({ ok: true, data });
    } catch (error) {
      console.error("Contact request failed:", error);
      createApiError(res, 500, "CONTACT_REQUEST_FAILED", "Could not create contact request.");
    }
  });

  app.post("/api/signup", async (req, res) => {
    try {
      if (!(await consumeRateLimit(req, res, "signup", { limit: 10, windowMs: 15 * 60 * 1000 }))) return;
      const body = req.body || {};
      const required = ["companyName", "ownerName", "ownerEmail", "password", "planId"];
      for (const field of required) {
        if (!body[field]) return createApiError(res, 400, "VALIDATION_ERROR", "Required signup field is missing.", field);
      }
      if (String(body.password).length < 8) {
        return createApiError(res, 400, "VALIDATION_ERROR", "Password must be at least 8 characters.", "password");
      }
      const passwordHash = await bcrypt.hash(String(body.password), 12);
      const data = await createSignupWithPayment({ signup: body, passwordHash });
      await auditLog({
        action: "signup.created",
        entityType: "signup_request",
        entityId: data.signupRequestId,
        summary: "SaaS signup request was created.",
        after: { companyName: body.companyName, planId: body.planId, paymentId: data.paymentId },
        requestContext: requestContext(req),
      });
      res.status(201).json({ ok: true, data });
    } catch (error) {
      if (error.statusCode === 409) return createApiError(res, 409, error.code || "CONFLICT", error.message, "ownerEmail");
      if (error.statusCode === 400) return createApiError(res, 400, error.code || "VALIDATION_ERROR", error.message);
      console.error("Signup failed:", error);
      createApiError(res, 500, "SIGNUP_FAILED", "Could not create signup request.");
    }
  });

  app.post("/api/billing/payments/:id/start", async (req, res) => {
    try {
      if (!(await consumeRateLimit(req, res, "payment-start", {
        limit: 12,
        windowMs: 10 * 60 * 1000,
        discriminator: req.params.id,
      }))) return;
      const payment = await getBillingPayment(req.params.id);
      if (!payment) return createApiError(res, 404, "PAYMENT_NOT_FOUND", "Payment was not found.");
      if (!payment.signup_request_id || !payment.subscription_id || !payment.organization_id) {
        return createApiError(res, 404, "PAYMENT_NOT_FOUND", "Payment was not found.");
      }
      if (payment.status === "paid") return createApiError(res, 409, "PAYMENT_ALREADY_PAID", "Payment is already verified.");
      const gateway = await requestZarinpalPayment(req, payment);
      const updated = await markPaymentRequested(payment.id, {
        authority: gateway.authority,
        gatewayUrl: gateway.gatewayUrl,
        rawRequest: gateway.raw,
      });
      res.json({ ok: true, data: { paymentId: updated.id, gatewayUrl: updated.gateway_url, authority: updated.gateway_authority } });
    } catch (error) {
      console.error("Payment start failed:", errorForLog(error));
      createApiError(res, error.statusCode || 500, "PAYMENT_START_FAILED", "Could not start payment.");
    }
  });

  app.get("/api/billing/zarinpal/callback", async (req, res) => {
    try {
      const authority = String(req.query.Authority || req.query.authority || "");
      const status = String(req.query.Status || req.query.status || "");
      if (!authority) return res.redirect("/signup/pending?payment=missing");
      const payment = await getBillingPaymentByAuthority(authority);
      if (!payment) return res.redirect("/signup/pending?payment=unknown");
      const verification = await verifyZarinpalPayment(payment, authority, status);
      const updated = await markPaymentVerifiedByAuthority(authority, verification);
      await auditLog({
        organizationId: updated?.organization_id,
        action: verification.ok ? "billing.payment_verified" : "billing.payment_failed",
        entityType: "billing_payment",
        entityId: updated?.id,
        summary: verification.ok ? "Payment was verified by Zarinpal." : "Payment verification failed.",
        after: { authority, refId: verification.refId, ok: verification.ok },
        requestContext: requestContext(req),
      });
      res.redirect(`/signup/pending?payment=${verification.ok ? "paid" : "failed"}&request=${encodeURIComponent(updated?.signup_request_id || "")}`);
    } catch (error) {
      console.error("Zarinpal callback failed:", errorForLog(error));
      res.redirect("/signup/pending?payment=failed");
    }
  });

  app.get("/api/billing/my-subscription", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      res.json({ ok: true, data: await getOrganizationSubscription(user.organizationId) });
    } catch (error) {
      createApiError(res, 500, "MY_SUBSCRIPTION_FAILED", "Could not load subscription.");
    }
  });

  app.get("/api/billing/my-invoices", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      res.json({ ok: true, data: await listBillingInvoices({ organizationId: user.organizationId, limit: 50 }) });
    } catch (error) {
      createApiError(res, 500, "MY_INVOICES_FAILED", "Could not load invoices.");
    }
  });

  app.get("/api/billing/my-payments", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      res.json({ ok: true, data: await listBillingPayments({ organizationId: user.organizationId, limit: 50 }) });
    } catch (error) {
      createApiError(res, 500, "MY_PAYMENTS_FAILED", "Could not load payments.");
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body || {};
      const loginLimit = { limit: 5, windowMs: 15 * 60 * 1000 };
      const loginKey = rateLimitKey(req, "login", email || "missing");
      if (await isRateLimited(loginKey, loginLimit)) {
        res.setHeader("Retry-After", "900");
        return createApiError(res, 429, "RATE_LIMITED", "Too many login attempts. Please try again later.");
      }
      if (!email || !password) {
        await recordRateLimitHit(loginKey, loginLimit);
        return res.status(400).json({ message: "Email and password are required." });
      }

      const user = await getUserByEmail(email);
      if (!user) {
        await recordRateLimitHit(loginKey, loginLimit);
        return res.status(401).json({ message: "Invalid email or password." });
      }

      const loginBlock = loginBlockForUser(user);
      if (loginBlock) {
        await recordRateLimitHit(loginKey, loginLimit);
        return sendLoginBlock(res, loginBlock);
      }

      const passwordMatches = await bcrypt.compare(password, user.password_hash);
      if (!passwordMatches) {
        await recordRateLimitHit(loginKey, loginLimit);
        return res.status(401).json({ message: "Invalid email or password." });
      }

      await clearRateLimit(loginKey);
      await createAuthenticatedSessionResponse(req, res, user);
    } catch (error) {
      console.error("Login failed:", error);
      res.status(500).json({ message: "Login failed." });
    }
  });

  app.post("/api/auth/phone/request-code", async (req, res) => {
    const rawPhone = String(req.body?.phone || "").trim();
    try {
      if (!rawPhone) {
        return createApiError(res, 400, "VALIDATION_ERROR", "Phone number is required.", "phone");
      }
      const allowed = await consumeRateLimit(req, res, "phone-login-request", {
        limit: 3,
        windowMs: 10 * 60 * 1000,
        discriminator: rawPhone,
      });
      if (!allowed) return;

      const user = await getUserByPhone(rawPhone);
      if (!user) {
        return res.json({
          ok: true,
          data: {
            codeSent: false,
            message: "If this phone belongs to an active user, a login code will be sent.",
          },
        });
      }

      const loginBlock = loginBlockForUser(user);
      if (loginBlock) return sendLoginBlock(res, loginBlock);

      const challenge = await createLoginSmsChallenge({
        userId: user.id,
        phone: rawPhone,
        requestContext: requestContext(req),
      });
      const message = `کد ورود لاجستیک پلاس: ${challenge.code}\nاین کد تا ۵ دقیقه معتبر است.`;
      const logMessage = "کد ورود لاجستیک پلاس ارسال شد.";

      try {
        const providerResult = await sendSmsMessage({ to: challenge.phone, message });
        await recordImmediateSmsDelivery({
          organizationId: user.organization_id || user.organizationId || null,
          userId: user.id,
          recipientType: "user",
          recipientName: user.name,
          recipientPhone: challenge.phone,
          message: logMessage,
          sourceType: "auth_otp",
          sourceId: challenge.id,
          eventKey: `auth_otp:${challenge.id}`,
          status: providerResult.skipped ? "skipped" : "sent",
          providerResult: {
            messageId: providerResult.messageId,
            raw: {
              dryRun: Boolean(providerResult.raw?.dryRun),
              skipped: Boolean(providerResult.skipped),
              reason: providerResult.reason || null,
            },
          },
          skipReason: providerResult.reason || "sms_provider_skipped",
        });
      } catch (sendError) {
        try {
          await recordImmediateSmsDelivery({
            organizationId: user.organization_id || user.organizationId || null,
            userId: user.id,
            recipientType: "user",
            recipientName: user.name,
            recipientPhone: challenge.phone,
            message: logMessage,
            sourceType: "auth_otp",
            sourceId: challenge.id,
            eventKey: `auth_otp:${challenge.id}`,
            status: "failed",
            providerResult: { raw: sendError.raw || {} },
            errorMessage: sendError.message,
          });
        } catch (logError) {
          if (isMissingSmsSchemaError(logError)) throw logError;
          console.error("Phone login SMS failure log failed:", logError);
        }
        throw sendError;
      }

      res.json({
        ok: true,
        data: {
          codeSent: true,
          expiresAt: challenge.expiresAt,
          ...(process.env.NODE_ENV !== "production" ? { debugCode: challenge.code } : {}),
        },
      });
    } catch (error) {
      if (error.statusCode === 400) {
        return createApiError(res, 400, error.code || "VALIDATION_ERROR", error.message);
      }
      if (isMissingSmsSchemaError(error)) {
        console.error("Phone login SMS schema missing:", error);
        return sendSmsSchemaNotReady(res);
      }
      console.error("Phone login code failed:", error);
      createApiError(res, 503, "PHONE_LOGIN_SMS_FAILED", "Could not send the login SMS code.");
    }
  });

  app.post("/api/auth/phone/verify", async (req, res) => {
    const rawPhone = String(req.body?.phone || "").trim();
    const code = String(req.body?.code || "").trim();
    try {
      if (!rawPhone || !code) {
        return createApiError(res, 400, "VALIDATION_ERROR", "Phone number and SMS code are required.");
      }
      const allowed = await consumeRateLimit(req, res, "phone-login-verify", {
        limit: 6,
        windowMs: 15 * 60 * 1000,
        discriminator: rawPhone,
      });
      if (!allowed) return;

      const result = await verifyLoginSmsChallenge({ phone: rawPhone, code });
      if (!result.ok || !result.user) {
        return createApiError(
          res,
          result.reason === "too_many_attempts" ? 429 : 401,
          result.reason === "too_many_attempts" ? "RATE_LIMITED" : "INVALID_SMS_CODE",
          "Invalid or expired SMS code."
        );
      }

      const loginBlock = loginBlockForUser(result.user);
      if (loginBlock) return sendLoginBlock(res, loginBlock);

      await clearRateLimit(rateLimitKey(req, "phone-login-verify", rawPhone));
      await createAuthenticatedSessionResponse(req, res, result.user);
    } catch (error) {
      console.error("Phone login verify failed:", error);
      createApiError(res, 500, "PHONE_LOGIN_VERIFY_FAILED", "Could not verify SMS login code.");
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
      await deleteSessionByToken(getSessionCookie(req));
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

  app.get("/api/users/:userId/bootstrap", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      const targetUser = req.params.userId === user.id ? user : await getUserById(req.params.userId);
      const sameOrganization = targetUser?.organizationId === user.organizationId;
      const canManageUsers = await userHasPermission(user, "users.manage");
      if (req.params.userId !== user.id && (!sameOrganization || !canManageUsers)) {
        return createApiError(res, 403, "FORBIDDEN", "You cannot load records for this user.");
      }
      const records = await getRecordsForUser(req.params.userId);
      res.json({ records });
    } catch (error) {
      console.error("Bootstrap failed:", error);
      res.status(500).json({ message: "Could not load user records." });
    }
  });

  app.put("/api/users/:userId/records", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      const targetUser = req.params.userId === user.id ? user : await getUserById(req.params.userId);
      const sameOrganization = targetUser?.organizationId === user.organizationId;
      const canManageUsers = await userHasPermission(user, "users.manage");
      if (req.params.userId !== user.id && (!sameOrganization || !canManageUsers)) {
        return createApiError(res, 403, "FORBIDDEN", "You cannot save records for this user.");
      }
      const result = await replaceRecordsForUser(req.params.userId, req.body?.records);
      await auditLog({
        actorUserId: user.id,
        action: "records.replace",
        entityType: "user_records",
        entityId: req.params.userId,
        summary: "Compatibility records were saved.",
        after: {
          collections: Object.keys(req.body?.records || {}),
          total: result.total,
        },
        requestContext: requestContext(req),
      });
      res.json({ status: "ok", ...result });
    } catch (error) {
      console.error("Save records failed:", error);
      res.status(500).json({ message: "Could not save user records." });
    }
  });

  for (const feature of ["shipments"]) {
    app.get(`/api/${feature}`, async (req, res) => {
      try {
        const user = await requireAuthenticatedUser(req, res);
        if (!user) return;
        const config = getFeatureConfig(feature);
        await requirePermission(user, config.permission);
        const data = await listFeatureRecords(feature, { organizationId: user.organizationId });
        res.json({ ok: true, data });
      } catch (error) {
        if (error.statusCode === 403) {
          return createApiError(res, 403, "FORBIDDEN", error.message);
        }
        console.error(`List ${feature} failed:`, error);
        createApiError(res, 500, "LIST_FAILED", `Could not load ${feature}.`);
      }
    });
  }

  app.get("/api/customers", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      await requirePermission(user, "customers.view");
      const data = await listCustomersDetailed({
        includeArchived: req.query.includeArchived === "true",
        search: req.query.search || "",
        organizationId: user.organizationId,
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
      await requirePermission(user, "customers.create");
      if (!req.body?.company && !req.body?.name) {
        return createApiError(res, 400, "VALIDATION_FAILED", "Customer name or company is required.", "name");
      }
      const created = await createCustomerRecord({ ownerUserId: user.id, actorUserId: user.id, customer: req.body });
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
      await requirePermission(user, "customers.view");
      const customer = await getCustomerRecord(req.params.id, { organizationId: user.organizationId });
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
      await requirePermission(user, "customers.update");
      const result = await updateCustomerRecord(req.params.id, req.body || {}, { organizationId: user.organizationId });
      if (!result.after) return createApiError(res, 404, "NOT_FOUND", "Customer was not found.");
      await auditLog({
        actorUserId: user.id,
        action: "customer.update",
        entityType: "customer",
        entityId: req.params.id,
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

  for (const related of ["shipments", "documents", "quotations", "cheques"]) {
    app.get(`/api/customers/:id/${related}`, async (req, res) => {
      try {
        const user = await requireAuthenticatedUser(req, res);
        if (!user) return;
        await requirePermission(user, "customers.view");
        const data = await listCustomerRelated(req.params.id, related, { organizationId: user.organizationId });
        if (!data) return createApiError(res, 404, "NOT_FOUND", "Customer was not found.");
        res.json({ ok: true, data });
      } catch (error) {
        if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
        console.error(`Get customer ${related} failed:`, error);
        createApiError(res, 500, "CUSTOMER_RELATED_FAILED", `Could not load customer ${related}.`);
      }
    });
  }

  app.post("/api/customers/:id/archive", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      await requirePermission(user, "customers.update");
      const result = await archiveCustomerRecord(req.params.id, { organizationId: user.organizationId });
      if (!result.after) return createApiError(res, 404, "NOT_FOUND", "Customer was not found.");
      await auditLog({
        actorUserId: user.id,
        action: "customer.archive",
        entityType: "customer",
        entityId: req.params.id,
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
      const allowedRoles = new Set(["CEO", "MANAGER", "OPERATIONS", "CUSTOMER_SERVICE", "FINANCE"]);
      const role = String(req.body?.role || "OPERATIONS").toUpperCase();
      const password = String(req.body?.password || "");
      if (!req.body?.name || !req.body?.email || !password) {
        return createApiError(res, 400, "VALIDATION_ERROR", "Name, email and password are required.");
      }
      if (password.length < 8) {
        return createApiError(res, 400, "VALIDATION_ERROR", "Password must be at least 8 characters.", "password");
      }
      if (!allowedRoles.has(role)) {
        return createApiError(res, 400, "VALIDATION_ERROR", "Selected role is not valid.", "role");
      }
      const passwordHash = await bcrypt.hash(password, 10);
      const created = await createAppUserRecord({
        actorUserId: user.id,
        user: {
          name: req.body.name,
          email: req.body.email,
          role,
          avatar: req.body.avatar || "",
          department: req.body.department || null,
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
      const data = (await listAppUsers({ organizationId: user.organizationId })).find((item) => item.id === req.params.id);
      if (!data) return createApiError(res, 404, "NOT_FOUND", "User was not found.");
      res.json({ ok: true, data });
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
      const target = await requireCompanyUserTarget(user, req.params.id, res);
      if (!target) return;
      if (req.params.id === user.id && req.body?.status && req.body.status !== "active") {
        return createApiError(res, 400, "SELF_SUSPEND_BLOCKED", "You cannot suspend yourself.");
      }
      if (req.params.id === user.id && req.body?.role && req.body.role !== "CEO") {
        return createApiError(res, 400, "SELF_ROLE_CHANGE_BLOCKED", "You cannot change your own CEO role.");
      }
      const result = await updateAppUserRecord(req.params.id, req.body || {}, user.id);
      if (!result.after) return createApiError(res, 404, "NOT_FOUND", "User was not found.");
      await auditLog({
        actorUserId: user.id,
        action: "user.update",
        entityType: "user",
        entityId: req.params.id,
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

  app.post("/api/users/:id/suspend", async (req, res) => {
    try {
      const user = await requireCompanyCeo(req, res);
      if (!user) return;
      const target = await requireCompanyUserTarget(user, req.params.id, res);
      if (!target) return;
      if (req.params.id === user.id) {
        return createApiError(res, 400, "SELF_SUSPEND_BLOCKED", "You cannot suspend yourself.");
      }
      const result = await updateAppUserRecord(req.params.id, { status: "suspended" }, user.id);
      await auditLog({ actorUserId: user.id, action: "user.suspend", entityType: "user", entityId: req.params.id, summary: "User was suspended.", before: result.before, after: result.after, requestContext: requestContext(req) });
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
      const target = await requireCompanyUserTarget(user, req.params.id, res);
      if (!target) return;
      const result = await updateAppUserRecord(req.params.id, { status: "active" }, user.id);
      await auditLog({ actorUserId: user.id, action: "user.activate", entityType: "user", entityId: req.params.id, summary: "User was activated.", before: result.before, after: result.after, requestContext: requestContext(req) });
      res.json({ ok: true, data: result.after });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      createApiError(res, 500, "USER_ACTIVATE_FAILED", "Could not activate user.");
    }
  });

  app.patch("/api/users/:id/role", async (req, res) => {
    try {
      const user = await requireCompanyCeo(req, res);
      if (!user) return;
      const target = await requireCompanyUserTarget(user, req.params.id, res);
      if (!target) return;
      const allowedRoles = new Set(["CEO", "MANAGER", "OPERATIONS", "CUSTOMER_SERVICE", "FINANCE"]);
      const role = String(req.body?.role || "").toUpperCase();
      if (!allowedRoles.has(role)) return createApiError(res, 400, "VALIDATION_ERROR", "Selected role is not valid.", "role");
      if (req.params.id === user.id && role !== "CEO") {
        return createApiError(res, 400, "SELF_ROLE_CHANGE_BLOCKED", "You cannot change your own CEO role.");
      }
      const result = await updateAppUserRecord(req.params.id, { role }, user.id);
      await auditLog({ actorUserId: user.id, action: "user.role_change", entityType: "user", entityId: req.params.id, summary: "User role was changed.", before: result.before, after: result.after, requestContext: requestContext(req) });
      res.json({ ok: true, data: result.after });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      createApiError(res, 500, "USER_ROLE_FAILED", "Could not update user role.");
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
      const required = ["companyName", "ownerName", "ownerEmail", "password", "planId"];
      for (const field of required) {
        if (!body[field]) return createApiError(res, 400, "VALIDATION_ERROR", "Required company signup field is missing.", field);
      }
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

  app.get("/api/admin/overview", async (req, res) => {
    try {
      const user = await requirePlatformAdmin(req, res);
      if (!user) return;
      res.json({ ok: true, data: await getAdminOverview() });
    } catch (error) {
      createApiError(res, 500, "ADMIN_OVERVIEW_FAILED", "Could not load admin overview.");
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

  app.get("/api/admin/payments", async (req, res) => {
    try {
      const user = await requirePlatformAdmin(req, res);
      if (!user) return;
      res.json({ ok: true, data: await listBillingPayments({ limit: req.query.limit || 100 }) });
    } catch (error) {
      createApiError(res, 500, "PAYMENTS_FAILED", "Could not load payments.");
    }
  });

  app.get("/api/admin/billing/invoices", async (req, res) => {
    try {
      const user = await requirePlatformAdmin(req, res);
      if (!user) return;
      res.json({
        ok: true,
        data: await listBillingInvoices({
          organizationId: req.query.organizationId || undefined,
          status: req.query.status || undefined,
          limit: req.query.limit || 100,
        }),
      });
    } catch (error) {
      createApiError(res, 500, "INVOICES_FAILED", "Could not load invoices.");
    }
  });

  app.get("/api/admin/billing/invoices/:id", async (req, res) => {
    try {
      const user = await requirePlatformAdmin(req, res);
      if (!user) return;
      const data = await getBillingInvoice(req.params.id);
      if (!data) return createApiError(res, 404, "NOT_FOUND", "Invoice was not found.");
      res.json({ ok: true, data });
    } catch (error) {
      createApiError(res, 500, "INVOICE_FAILED", "Could not load invoice.");
    }
  });

  app.post("/api/admin/billing/invoices", async (req, res) => {
    try {
      const user = await requirePlatformAdmin(req, res);
      if (!user) return;
      if (!req.body?.organizationId || !Number(req.body?.amountIrr)) {
        return createApiError(res, 400, "VALIDATION_ERROR", "Organization and amount are required.");
      }
      const data = await createBillingInvoice({
        actorUserId: user.id,
        organizationId: req.body.organizationId,
        subscriptionId: req.body.subscriptionId,
        amountIrr: req.body.amountIrr,
        description: req.body.description,
        dueAt: req.body.dueAt,
        notes: req.body.notes,
      });
      await auditLog({ actorUserId: user.id, action: "billing.invoice_issued", entityType: "billing_invoice", entityId: data.id, summary: "Invoice was issued.", after: data, requestContext: requestContext(req) });
      res.status(201).json({ ok: true, data });
    } catch (error) {
      createApiError(res, 500, "INVOICE_CREATE_FAILED", "Could not create invoice.");
    }
  });

  app.post("/api/admin/billing/invoices/:id/void", async (req, res) => {
    try {
      const user = await requirePlatformAdmin(req, res);
      if (!user) return;
      const data = await voidBillingInvoice(req.params.id, { actorUserId: user.id });
      if (!data) return createApiError(res, 404, "NOT_FOUND", "Invoice was not found.");
      await auditLog({ actorUserId: user.id, action: "billing.invoice_voided", entityType: "billing_invoice", entityId: req.params.id, summary: "Invoice was voided.", after: data, requestContext: requestContext(req) });
      res.json({ ok: true, data });
    } catch (error) {
      createApiError(res, 500, "INVOICE_VOID_FAILED", "Could not void invoice.");
    }
  });

  app.post("/api/admin/billing/payments/:id/mark-paid", async (req, res) => {
    try {
      const user = await requirePlatformAdmin(req, res);
      if (!user) return;
      const data = await markBillingPaymentManually(req.params.id, { actorUserId: user.id, status: "paid", note: req.body?.note });
      if (!data) return createApiError(res, 404, "NOT_FOUND", "Payment was not found.");
      await auditLog({ actorUserId: user.id, action: "billing.payment_manual_paid", entityType: "billing_payment", entityId: req.params.id, summary: "Payment was manually marked paid.", after: data, requestContext: requestContext(req) });
      res.json({ ok: true, data });
    } catch (error) {
      createApiError(res, 500, "PAYMENT_MARK_PAID_FAILED", "Could not mark payment paid.");
    }
  });

  app.post("/api/admin/billing/payments/:id/mark-failed", async (req, res) => {
    try {
      const user = await requirePlatformAdmin(req, res);
      if (!user) return;
      const data = await markBillingPaymentManually(req.params.id, { actorUserId: user.id, status: "failed", note: req.body?.note });
      if (!data) return createApiError(res, 404, "NOT_FOUND", "Payment was not found.");
      await auditLog({ actorUserId: user.id, action: "billing.payment_manual_failed", entityType: "billing_payment", entityId: req.params.id, summary: "Payment was manually marked failed.", after: data, requestContext: requestContext(req) });
      res.json({ ok: true, data });
    } catch (error) {
      createApiError(res, 500, "PAYMENT_MARK_FAILED_FAILED", "Could not mark payment failed.");
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

  app.get("/api/admin/signup-requests", async (req, res) => {
    try {
      const user = await requirePlatformAdmin(req, res);
      if (!user) return;
      res.json({ ok: true, data: await listSignupRequests({ status: req.query.status || undefined }) });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      createApiError(res, 500, "SIGNUP_REQUESTS_FAILED", "Could not load signup requests.");
    }
  });

  app.get("/api/admin/contact-requests", async (req, res) => {
    try {
      const user = await requirePlatformAdmin(req, res);
      if (!user) return;
      res.json({ ok: true, data: await listContactRequests({ status: req.query.status || undefined }) });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      console.error("Contact requests failed:", error);
      createApiError(res, 500, "CONTACT_REQUESTS_FAILED", "Could not load contact requests.");
    }
  });

  app.post("/api/admin/contact-requests/:id/resolve", async (req, res) => {
    try {
      const user = await requirePlatformAdmin(req, res);
      if (!user) return;
      const data = await resolveContactRequest(req.params.id, user.id);
      if (!data) return createApiError(res, 404, "NOT_FOUND", "Contact request was not found.");
      await auditLog({
        actorUserId: user.id,
        action: "contact_request.resolve",
        entityType: "contact_request",
        entityId: req.params.id,
        summary: "Contact request was resolved by platform admin.",
        after: data,
        requestContext: requestContext(req),
      });
      res.json({ ok: true, data });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      console.error("Resolve contact request failed:", error);
      createApiError(res, 500, "CONTACT_REQUEST_RESOLVE_FAILED", "Could not resolve contact request.");
    }
  });

  app.get("/api/admin/sms-deliveries", async (req, res) => {
    try {
      const user = await requirePlatformAdmin(req, res);
      if (!user) return;
      const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
      res.json({
        ok: true,
        data: await listSmsDeliveries({
          organizationId: req.query.organizationId || undefined,
          status: req.query.status || undefined,
          limit,
        }),
      });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      console.error("SMS deliveries failed:", error);
      createApiError(res, 500, "SMS_DELIVERIES_FAILED", "Could not load SMS deliveries.");
    }
  });

  app.get("/api/admin/sms-analytics", async (req, res) => {
    try {
      const user = await requirePlatformAdmin(req, res);
      if (!user) return;
      res.json({
        ok: true,
        data: await getSmsAnalytics({
          organizationId: req.query.organizationId || undefined,
        }),
      });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      console.error("SMS analytics failed:", error);
      createApiError(res, 500, "SMS_ANALYTICS_FAILED", "Could not load SMS analytics.");
    }
  });

  app.get("/api/admin/sms-templates", async (req, res) => {
    try {
      const user = await requirePlatformAdmin(req, res);
      if (!user) return;
      res.json({ ok: true, data: await listSmsTemplates() });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      console.error("SMS templates failed:", error);
      createApiError(res, 500, "SMS_TEMPLATES_FAILED", "Could not load SMS templates.");
    }
  });

  app.patch("/api/admin/sms-templates/:key", async (req, res) => {
    try {
      const user = await requirePlatformAdmin(req, res);
      if (!user) return;
      const data = await updateSmsTemplate(req.params.key, req.body || {}, user.id);
      await auditLog({
        actorUserId: user.id,
        action: "sms.template_update",
        entityType: "sms_template",
        entityId: req.params.key,
        summary: "SMS template was updated.",
        after: data,
        requestContext: requestContext(req),
      });
      res.json({ ok: true, data });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      if (error.statusCode === 404) return createApiError(res, 404, error.code || "NOT_FOUND", error.message);
      if (error.statusCode === 400) return createApiError(res, 400, error.code || "VALIDATION_ERROR", error.message);
      console.error("SMS template update failed:", error);
      createApiError(res, 500, "SMS_TEMPLATE_UPDATE_FAILED", "Could not update SMS template.");
    }
  });

  app.post("/api/admin/sms-deliveries/run-worker", async (req, res) => {
    try {
      const user = await requirePlatformAdmin(req, res);
      if (!user) return;
      const limit = Math.min(Math.max(Number(req.body?.limit) || 50, 1), 200);
      const data = await runSmsWorkerOnce({ limit });
      await auditLog({
        actorUserId: user.id,
        action: "sms.worker_run",
        entityType: "sms_delivery",
        summary: "SMS worker was run manually by platform admin.",
        after: data,
        requestContext: requestContext(req),
      });
      res.json({ ok: true, data });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      console.error("Run SMS worker failed:", error);
      createApiError(res, 500, "SMS_WORKER_FAILED", "Could not run SMS worker.");
    }
  });

  app.post("/api/admin/signup-requests/:id/approve", async (req, res) => {
    try {
      const user = await requirePlatformAdmin(req, res);
      if (!user) return;
      const data = await reviewSignupRequest(req.params.id, { approved: true, reviewerId: user.id });
      if (!data) return createApiError(res, 404, "NOT_FOUND", "Signup request was not found.");
      await auditLog({
        actorUserId: user.id,
        action: "signup.approved",
        entityType: "signup_request",
        entityId: req.params.id,
        summary: "SaaS signup request was approved.",
        after: data,
        requestContext: requestContext(req),
      });
      res.json({ ok: true, data });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      if (error.statusCode === 409) return createApiError(res, 409, error.code || "CONFLICT", error.message);
      createApiError(res, 500, "SIGNUP_APPROVE_FAILED", "Could not approve signup request.");
    }
  });

  app.post("/api/admin/signup-requests/:id/reject", async (req, res) => {
    try {
      const user = await requirePlatformAdmin(req, res);
      if (!user) return;
      const data = await reviewSignupRequest(req.params.id, { approved: false, reviewerId: user.id });
      if (!data) return createApiError(res, 404, "NOT_FOUND", "Signup request was not found.");
      await auditLog({
        actorUserId: user.id,
        action: "signup.rejected",
        entityType: "signup_request",
        entityId: req.params.id,
        summary: "SaaS signup request was rejected.",
        after: data,
        requestContext: requestContext(req),
      });
      res.json({ ok: true, data });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      createApiError(res, 500, "SIGNUP_REJECT_FAILED", "Could not reject signup request.");
    }
  });

  app.post("/api/client-errors", async (req, res) => {
    try {
      const session = await getAuthenticatedSession(req).catch(() => null);
      const body = req.body || {};
      const data = await createAppErrorLog({
        organizationId: session?.user?.organizationId,
        userId: session?.user?.id,
        severity: body.severity || "error",
        source: body.source || "client",
        message: body.message || "Client error",
        stack: body.stack || "",
        route: body.route || req.headers.referer || "",
        apiEndpoint: body.apiEndpoint || "",
        httpStatus: body.httpStatus,
        browser: body.browser || "",
        userAgent: req.headers["user-agent"] || body.userAgent || "",
        context: redactSensitive(body.context || {}),
      });
      res.status(201).json({ ok: true, data: { id: data.id } });
    } catch (error) {
      console.error("Client error logging failed:", error);
      createApiError(res, 500, "CLIENT_ERROR_LOG_FAILED", "Could not log client error.");
    }
  });

  app.get("/api/admin/error-logs", async (req, res) => {
    try {
      const user = await requirePlatformAdmin(req, res);
      if (!user) return;
      const data = await listAppErrorLogs({
        organizationId: req.query.organizationId || undefined,
        source: req.query.source || undefined,
        severity: req.query.severity || undefined,
        resolved: req.query.resolved || undefined,
        route: req.query.route || undefined,
        status: req.query.status || undefined,
        limit: req.query.limit || 100,
      });
      res.json({ ok: true, data });
    } catch (error) {
      createApiError(res, 500, "ERROR_LOGS_FAILED", "Could not load error logs.");
    }
  });

  app.get("/api/admin/error-logs/:id", async (req, res) => {
    try {
      const user = await requirePlatformAdmin(req, res);
      if (!user) return;
      const data = await getAppErrorLog(req.params.id);
      if (!data) return createApiError(res, 404, "NOT_FOUND", "Error log was not found.");
      res.json({ ok: true, data });
    } catch (error) {
      createApiError(res, 500, "ERROR_LOG_FAILED", "Could not load error log.");
    }
  });

  app.post("/api/admin/error-logs/:id/resolve", async (req, res) => {
    try {
      const user = await requirePlatformAdmin(req, res);
      if (!user) return;
      const data = await resolveAppErrorLog(req.params.id, user.id);
      if (!data) return createApiError(res, 404, "NOT_FOUND", "Error log was not found.");
      res.json({ ok: true, data });
    } catch (error) {
      createApiError(res, 500, "ERROR_LOG_RESOLVE_FAILED", "Could not resolve error log.");
    }
  });

  app.get("/api/quotations", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      await requirePermission(user, "quotations.manage");
      const data = await listQuotations({ organizationId: user.organizationId, ownerUserId: user.role === "CEO" || user.role === "MANAGER" ? undefined : user.id, includeArchived: req.query.includeArchived === "true" });
      res.json({ ok: true, data });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      console.error("List quotations failed:", error);
      createApiError(res, 500, "QUOTATIONS_LIST_FAILED", "Could not load quotations.");
    }
  });

  app.post("/api/quotations", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      await requirePermission(user, "quotations.manage");
      if (!req.body?.customerName) return createApiError(res, 400, "VALIDATION_FAILED", "Customer name is required.", "customerName");
      const created = await createQuotationRecord({ ownerUserId: user.id, actorUserId: user.id, quote: req.body });
      await auditLog({ actorUserId: user.id, action: "quotation.create", entityType: "quotation", entityId: created.id, summary: "Quotation was created.", after: created, requestContext: requestContext(req) });
      res.status(201).json({ ok: true, data: created });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      if (error.code === "23505") return createApiError(res, 409, "DUPLICATE_QUOTATION", "Quotation number already exists.");
      console.error("Create quotation failed:", error);
      createApiError(res, 500, "QUOTATION_CREATE_FAILED", "Could not create quotation.");
    }
  });

  app.get("/api/quotations/:id", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      await requirePermission(user, "quotations.manage");
      const data = await getQuotationRecord(req.params.id, { organizationId: user.organizationId });
      if (!data) return createApiError(res, 404, "NOT_FOUND", "Quotation was not found.");
      res.json({ ok: true, data });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      createApiError(res, 500, "QUOTATION_GET_FAILED", "Could not load quotation.");
    }
  });

  app.patch("/api/quotations/:id", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      await requirePermission(user, "quotations.manage");
      const result = await updateQuotationRecord(req.params.id, req.body || {}, { organizationId: user.organizationId });
      if (!result.after) return createApiError(res, 404, "NOT_FOUND", "Quotation was not found.");
      await auditLog({ actorUserId: user.id, action: "quotation.update", entityType: "quotation", entityId: req.params.id, summary: "Quotation was updated.", before: result.before, after: result.after, requestContext: requestContext(req) });
      res.json({ ok: true, data: result.after });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      createApiError(res, 500, "QUOTATION_UPDATE_FAILED", "Could not update quotation.");
    }
  });

  for (const [pathName, status] of Object.entries({ accept: "ACCEPTED", reject: "REJECTED", expire: "EXPIRED", archive: "ARCHIVED" })) {
    app.post(`/api/quotations/:id/${pathName}`, async (req, res) => {
      try {
        const user = await requireAuthenticatedUser(req, res);
        if (!user) return;
        await requirePermission(user, "quotations.manage");
        const result = await setQuotationStatus(req.params.id, status, req.body || {}, { organizationId: user.organizationId });
        if (!result.after) return createApiError(res, 404, "NOT_FOUND", "Quotation was not found.");
        await auditLog({ actorUserId: user.id, action: `quotation.${pathName}`, entityType: "quotation", entityId: req.params.id, summary: `Quotation was ${pathName}ed.`, before: result.before, after: result.after, requestContext: requestContext(req) });
        res.json({ ok: true, data: result.after });
      } catch (error) {
        if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
        createApiError(res, 500, "QUOTATION_STATUS_FAILED", "Could not update quotation status.");
      }
    });
  }

  app.post("/api/quotations/:id/convert-to-shipment", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      await requirePermission(user, "quotations.manage");
      const result = await convertQuotationToShipment(req.params.id, user.id, { organizationId: user.organizationId });
      if (!result) return createApiError(res, 404, "NOT_FOUND", "Quotation was not found.");
      await auditLog({ actorUserId: user.id, action: "quotation.convert_to_shipment", entityType: "quotation", entityId: req.params.id, summary: "Quotation was converted to shipment.", after: result, requestContext: requestContext(req) });
      res.json({ ok: true, data: result });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      console.error("Convert quotation failed:", error);
      createApiError(res, 500, "QUOTATION_CONVERT_FAILED", "Could not convert quotation.");
    }
  });

  app.get("/api/archive", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      await requirePermission(user, "archive.view");
      res.json({ ok: true, data: await listArchiveRecords({ organizationId: user.organizationId, search: req.query.search || "" }) });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      createApiError(res, 500, "ARCHIVE_LIST_FAILED", "Could not load archive.");
    }
  });

  app.get("/api/archive/search", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      await requirePermission(user, "archive.view");
      res.json({ ok: true, data: await listArchiveRecords({ organizationId: user.organizationId, search: req.query.q || req.query.search || "" }) });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      createApiError(res, 500, "ARCHIVE_SEARCH_FAILED", "Could not search archive.");
    }
  });

  app.get("/api/archive/:id", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      await requirePermission(user, "archive.view");
      const data = (await listArchiveRecords({ organizationId: user.organizationId })).find((item) => item.id === req.params.id || item.entityId === req.params.id);
      if (!data) return createApiError(res, 404, "NOT_FOUND", "Archive record was not found.");
      res.json({ ok: true, data });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      createApiError(res, 500, "ARCHIVE_GET_FAILED", "Could not load archive record.");
    }
  });

  app.post("/api/archive/:entityType/:entityId", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      await requirePermission(user, "archive.view");
      const data = await archiveEntityRecord(req.params.entityType, req.params.entityId, user.id, {
        organizationId: user.organizationId,
      });
      if (!data) return createApiError(res, 404, "NOT_FOUND", "Record was not found.");
      await auditLog({ actorUserId: user.id, action: "archive.create", entityType: req.params.entityType, entityId: req.params.entityId, summary: "Record was archived.", after: data, requestContext: requestContext(req) });
      res.json({ ok: true, data });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      createApiError(res, 500, "ARCHIVE_FAILED", "Could not archive record.");
    }
  });

  app.post("/api/archive/:entityType/:entityId/restore", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      await requirePermission(user, "archive.view");
      const data = await restoreEntityRecord(req.params.entityType, req.params.entityId, {
        organizationId: user.organizationId,
      });
      if (!data) return createApiError(res, 404, "NOT_FOUND", "Record was not found.");
      await auditLog({ actorUserId: user.id, action: "archive.restore", entityType: req.params.entityType, entityId: req.params.entityId, summary: "Record was restored.", after: data, requestContext: requestContext(req) });
      res.json({ ok: true, data });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      createApiError(res, 500, "RESTORE_FAILED", "Could not restore record.");
    }
  });

  app.delete("/api/archive/:entityType/:entityId", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      await requirePermission(user, "archive.view");
      const documentStorageKeys =
        req.params.entityType === "document"
          ? await listDocumentStorageKeysForCleanup(req.params.entityId, { organizationId: user.organizationId })
          : [];
      const data = await deleteArchivedEntityRecord(req.params.entityType, req.params.entityId, {
        organizationId: user.organizationId,
      });
      if (!data) return createApiError(res, 404, "NOT_FOUND", "Archived record was not found.");
      let storageCleanup = null;
      if (documentStorageKeys.length) {
        storageCleanup = await deleteStoredDocumentFiles(documentStorageKeys);
      }
      await auditLog({
        actorUserId: user.id,
        action: "archive.delete",
        entityType: req.params.entityType,
        entityId: req.params.entityId,
        summary: "Archived record was permanently deleted.",
        before: { ...data, storageCleanup },
        requestContext: requestContext(req),
      });
      res.json({ ok: true, data });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      console.error("Archive delete failed:", error);
      createApiError(res, 500, "ARCHIVE_DELETE_FAILED", "Could not delete archived record.");
    }
  });

  app.get("/api/chat/threads", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      await requirePermission(user, "chat.use");
      res.json({ ok: true, data: await listChatThreads(user.id) });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      console.error("List chat threads failed:", error);
      createApiError(res, 500, "CHAT_THREADS_FAILED", "Could not load chat threads.");
    }
  });

  app.post("/api/chat/threads", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      await requirePermission(user, req.body?.type === "GROUP" ? "chat.manage_groups" : "chat.use");
      const id = req.body?.type === "DM"
        ? await ensureDirectChat(user.id, req.body.memberId)
        : await createChatThread({ actorUserId: user.id, type: req.body?.type || "GROUP", name: req.body?.name, description: req.body?.description, memberIds: req.body?.memberIds || [] });
      await auditLog({ actorUserId: user.id, action: "chat.thread_create", entityType: "chat_thread", entityId: id, summary: "Chat thread was created.", requestContext: requestContext(req) });
      res.status(201).json({ ok: true, data: { id } });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      console.error("Create chat thread failed:", error);
      createApiError(res, 500, "CHAT_THREAD_CREATE_FAILED", "Could not create chat thread.");
    }
  });

  app.get("/api/chat/threads/:id/messages", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      await requirePermission(user, "chat.use");
      res.json({ ok: true, data: await listChatMessages(req.params.id, user.id, req.query.limit) });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      createApiError(res, 500, "CHAT_MESSAGES_FAILED", "Could not load messages.");
    }
  });

  app.post("/api/chat/threads/:id/read", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      await requirePermission(user, "chat.use");
      const data = await markChatThreadRead(req.params.id, user.id);
      const memberIds = await listChatThreadMemberIds(req.params.id);
      broadcastChat({ type: "message.read", payload: data }, memberIds);
      res.json({ ok: true, data });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      createApiError(res, 500, "CHAT_READ_FAILED", "Could not mark thread read.");
    }
  });

  app.post("/api/chat/threads/:id/members", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      await requirePermission(user, "chat.manage_groups");
      if (!(await userCanAccessThread(user.id, req.params.id))) {
        return createApiError(res, 403, "FORBIDDEN", "You cannot manage this chat thread.");
      }
      await addChatThreadMember(req.params.id, req.body?.userId);
      await auditLog({ actorUserId: user.id, action: "chat.member_add", entityType: "chat_thread", entityId: req.params.id, summary: "Chat member was added.", after: req.body, requestContext: requestContext(req) });
      const memberIds = await listChatThreadMemberIds(req.params.id);
      broadcastChat({ type: "thread.updated", payload: { threadId: req.params.id } }, memberIds);
      res.json({ ok: true, data: { threadId: req.params.id, userId: req.body?.userId } });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      createApiError(res, 500, "CHAT_MEMBER_ADD_FAILED", "Could not add chat member.");
    }
  });

  app.delete("/api/chat/threads/:id/members/:userId", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      await requirePermission(user, "chat.manage_groups");
      if (!(await userCanAccessThread(user.id, req.params.id))) {
        return createApiError(res, 403, "FORBIDDEN", "You cannot manage this chat thread.");
      }
      const memberIds = await listChatThreadMemberIds(req.params.id);
      await removeChatThreadMember(req.params.id, req.params.userId);
      await auditLog({ actorUserId: user.id, action: "chat.member_remove", entityType: "chat_thread", entityId: req.params.id, summary: "Chat member was removed.", after: { userId: req.params.userId }, requestContext: requestContext(req) });
      broadcastChat({ type: "thread.updated", payload: { threadId: req.params.id } }, memberIds);
      res.json({ ok: true, data: { threadId: req.params.id, userId: req.params.userId } });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      createApiError(res, 500, "CHAT_MEMBER_REMOVE_FAILED", "Could not remove chat member.");
    }
  });

  app.get("/api/tasks", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      const canViewAll = await userHasPermission(user, "tasks.view_all");
      const canViewOwn = canViewAll || (await userHasPermission(user, "tasks.view_own"));
      if (!canViewOwn) {
        return createApiError(res, 403, "FORBIDDEN", "Missing permission: tasks.view_own");
      }
      const data = await listTasks(
        canViewAll ? { organizationId: user.organizationId, includeAll: true } : { organizationId: user.organizationId, assignedToId: user.id, includeAll: true }
      );
      res.json({ ok: true, data });
    } catch (error) {
      console.error("List tasks failed:", error);
      createApiError(res, 500, "LIST_TASKS_FAILED", "Could not load tasks.");
    }
  });

  app.get("/api/tasks/my", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      await requirePermission(user, "tasks.view_own");
      const data = await listTasks({ organizationId: user.organizationId, assignedToId: user.id, includeAll: true });
      res.json({ ok: true, data });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      console.error("List my tasks failed:", error);
      createApiError(res, 500, "LIST_MY_TASKS_FAILED", "Could not load tasks.");
    }
  });

  app.get("/api/tasks/team", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      await requirePermission(user, "tasks.view_all");
      const data = await listTasks({ organizationId: user.organizationId, includeAll: true });
      res.json({ ok: true, data });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      console.error("List team tasks failed:", error);
      createApiError(res, 500, "LIST_TEAM_TASKS_FAILED", "Could not load team tasks.");
    }
  });

  app.get("/api/tasks/:id", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      const task = await getTaskRecord(req.params.id, { organizationId: user.organizationId });
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
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      await requirePermission(user, "tasks.create");
      const title = String(req.body?.title || "").trim();
      if (!title) return createApiError(res, 400, "VALIDATION_ERROR", "Task title is required.", "title");
      const assignedToUserId = req.body?.assignedToUserId || user.id;
      if (assignedToUserId !== user.id) {
        await requirePermission(user, "tasks.assign");
      }
      const task = await createTaskRecord({
        ownerUserId: user.id,
        title,
        description: req.body?.description,
        status: req.body?.status,
        priority: req.body?.priority,
        assignedToUserId,
        assignedToName: req.body?.assignedToName || user.name,
        assignedByUserId: user.id,
        assignedByName: user.name,
        dueDate: req.body?.dueDate,
        deadline: req.body?.deadline,
        shipmentId: req.body?.shipmentId || null,
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
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      const before = await getTaskRecord(req.params.id, { organizationId: user.organizationId });
      if (!before) return createApiError(res, 404, "NOT_FOUND", "Task was not found.");
      if (!(await canAccessTask(user, before))) {
        return createApiError(res, 403, "FORBIDDEN", "You cannot update this task.");
      }
      if (req.body?.assignedToUserId && req.body.assignedToUserId !== before.assigned_to_id) {
        await requirePermission(user, "tasks.assign");
      }
      const result = await updateTaskRecord(req.params.id, req.body || {}, { organizationId: user.organizationId });
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

  async function updateTaskStatusEndpoint(req, res, status, action) {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      const before = await getTaskRecord(req.params.id, { organizationId: user.organizationId });
      if (!before) return createApiError(res, 404, "NOT_FOUND", "Task was not found.");
      if (!(await canAccessTask(user, before, "status"))) {
        return createApiError(res, 403, "FORBIDDEN", "You cannot update this task status.");
      }
      const result = await setTaskStatus(req.params.id, status, { organizationId: user.organizationId });
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

  app.get("/api/shipments/:id/steps", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      const data = await listShipmentSteps(req.params.id, user.id, { organizationId: user.organizationId });
      res.json({ ok: true, data });
    } catch (error) {
      console.error("List shipment steps failed:", error);
      createApiError(res, 500, "LIST_SHIPMENT_STEPS_FAILED", "Could not load shipment steps.");
    }
  });

  app.patch("/api/shipments/:id/steps/:stepId", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      await requirePermission(user, "shipment_steps.update");
      const result = await updateShipmentStepRecord({
        shipmentId: req.params.id,
        stepId: req.params.stepId,
        updates: req.body || {},
        actorUser: user,
      });
      if (!result) return createApiError(res, 404, "NOT_FOUND", "Shipment step was not found.");
      await auditLog({
        actorUserId: user.id,
        action: "shipment_step.update",
        entityType: "SHIPMENT_STEP",
        entityId: req.params.stepId,
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

  app.post("/api/shipments/:id/tasks", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      await requirePermission(user, "tasks.create");
      const assignedToUserId = req.body?.assignedToUserId || user.id;
      if (assignedToUserId !== user.id) {
        await requirePermission(user, "tasks.assign");
      }
      const result = await createShipmentTaskRecord({
        shipmentId: req.params.id,
        stepId: req.body?.stepId,
        actorUser: user,
        task: req.body || {},
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

  app.get("/api/cheques/due-soon", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      await requirePermission(user, "cheques.manage");
      const data = await listDueSoonCheques({
        organizationId: user.organizationId,
        ownerUserId: user.id,
        days: req.query.days || 7,
      });
      res.json({ ok: true, data });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      console.error("List due soon cheques failed:", error);
      createApiError(res, 500, "LIST_DUE_CHEQUES_FAILED", "Could not load due cheques.");
    }
  });

  app.get("/api/cheques", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      await requirePermission(user, "cheques.manage");
      const data = await listCheques({
        organizationId: user.organizationId,
        ownerUserId: user.id,
        includeArchived: req.query.includeArchived === "true",
      });
      res.json({ ok: true, data });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      console.error("List cheques failed:", error);
      createApiError(res, 500, "LIST_CHEQUES_FAILED", "Could not load cheques.");
    }
  });

  app.post("/api/cheques", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      await requirePermission(user, "cheques.manage");
      if (!req.body?.bankName || !req.body?.chequeNumber || Number(req.body?.amount || 0) <= 0) {
        return createApiError(res, 400, "VALIDATION_ERROR", "Bank, cheque number, and positive amount are required.");
      }
      const data = await createChequeRecord({ ownerUserId: user.id, actorUserId: user.id, cheque: req.body });
      await auditLog({
        actorUserId: user.id,
        action: "cheque.create",
        entityType: "CHEQUE",
        entityId: data.id,
        summary: "Cheque was created.",
        after: data,
        requestContext: requestContext(req),
      });
      res.json({ ok: true, data });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      console.error("Create cheque failed:", error);
      createApiError(res, 500, "CREATE_CHEQUE_FAILED", "Could not create cheque.");
    }
  });

  app.get("/api/cheques/:id", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      await requirePermission(user, "cheques.manage");
      const data = await getChequeRecord(req.params.id, { organizationId: user.organizationId });
      if (!data) return createApiError(res, 404, "NOT_FOUND", "Cheque was not found.");
      res.json({ ok: true, data });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      console.error("Get cheque failed:", error);
      createApiError(res, 500, "GET_CHEQUE_FAILED", "Could not load cheque.");
    }
  });

  app.patch("/api/cheques/:id", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      await requirePermission(user, "cheques.manage");
      const result = await updateChequeRecord(req.params.id, req.body || {}, { organizationId: user.organizationId });
      if (!result) return createApiError(res, 404, "NOT_FOUND", "Cheque was not found.");
      await auditLog({
        actorUserId: user.id,
        action: "cheque.update",
        entityType: "CHEQUE",
        entityId: req.params.id,
        summary: "Cheque was updated.",
        before: result.before,
        after: result.after,
        requestContext: requestContext(req),
      });
      res.json({ ok: true, data: result.after });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      console.error("Update cheque failed:", error);
      createApiError(res, 500, "UPDATE_CHEQUE_FAILED", "Could not update cheque.");
    }
  });

  app.post("/api/cheques/:id/status", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      await requirePermission(user, "cheques.manage");
      const result = await updateChequeRecord(req.params.id, { status: req.body?.status }, { organizationId: user.organizationId });
      if (!result) return createApiError(res, 404, "NOT_FOUND", "Cheque was not found.");
      await auditLog({
        actorUserId: user.id,
        action: "cheque.status_change",
        entityType: "CHEQUE",
        entityId: req.params.id,
        summary: "Cheque status was changed.",
        before: result.before,
        after: result.after,
        requestContext: requestContext(req),
      });
      res.json({ ok: true, data: result.after });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      console.error("Update cheque status failed:", error);
      createApiError(res, 500, "UPDATE_CHEQUE_STATUS_FAILED", "Could not update cheque status.");
    }
  });

  app.post("/api/cheques/:id/archive", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      await requirePermission(user, "cheques.manage");
      const result = await archiveChequeRecord(req.params.id, { organizationId: user.organizationId });
      if (!result) return createApiError(res, 404, "NOT_FOUND", "Cheque was not found.");
      await auditLog({
        actorUserId: user.id,
        action: "cheque.archive",
        entityType: "CHEQUE",
        entityId: req.params.id,
        summary: "Cheque was archived.",
        before: result.before,
        after: result.after,
        requestContext: requestContext(req),
      });
      res.json({ ok: true, data: result.after });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      console.error("Archive cheque failed:", error);
      createApiError(res, 500, "ARCHIVE_CHEQUE_FAILED", "Could not archive cheque.");
    }
  });

  app.get("/api/compliance-meetings", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      const canManage = await userHasPermission(user, "compliance.manage");
      const data = await listComplianceMeetings(
        canManage ? { organizationId: user.organizationId, ownerUserId: user.id } : { organizationId: user.organizationId, assignedToId: user.id }
      );
      res.json({ ok: true, data });
    } catch (error) {
      console.error("List compliance meetings failed:", error);
      createApiError(res, 500, "LIST_COMPLIANCE_FAILED", "Could not load compliance meetings.");
    }
  });

  app.post("/api/compliance-meetings", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      await requirePermission(user, "compliance.manage");
      if (!req.body?.dateTime || !req.body?.purpose) {
        return createApiError(res, 400, "VALIDATION_ERROR", "Meeting date/time and purpose are required.");
      }
      const data = await createComplianceMeetingRecord({ ownerUserId: user.id, actorUser: user, meeting: req.body });
      if (req.body?.assignedPersonId) {
        await createTaskRecord({
          ownerUserId: user.id,
          title: `جلسه: ${req.body.purpose}`,
          description: `آماده‌سازی جلسه ${req.body.purpose}`,
          status: "TODO",
          priority: "HIGH",
          assignedToUserId: req.body.assignedPersonId,
          assignedToName: req.body.assignedPersonName,
          assignedByUserId: user.id,
          assignedByName: user.name,
          dueDate: String(req.body.dateTime).split(" ")[0],
          deadline: String(req.body.dateTime).split(" ")[1] || "",
          sourceType: "COMPLIANCE_MEETING",
          sourceId: data.id,
        });
      }
      await auditLog({
        actorUserId: user.id,
        action: "compliance_meeting.create",
        entityType: "COMPLIANCE_MEETING",
        entityId: data.id,
        summary: "Compliance meeting was created.",
        after: data,
        requestContext: requestContext(req),
      });
      res.json({ ok: true, data });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      console.error("Create compliance meeting failed:", error);
      createApiError(res, 500, "CREATE_COMPLIANCE_FAILED", "Could not create compliance meeting.");
    }
  });

  app.get("/api/compliance-meetings/:id", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      const data = await getComplianceMeetingRecord(req.params.id, { organizationId: user.organizationId });
      if (!data) return createApiError(res, 404, "NOT_FOUND", "Compliance meeting was not found.");
      const canManage = await userHasPermission(user, "compliance.manage");
      if (!canManage && data.assigned_to_id !== user.id) {
        return createApiError(res, 403, "FORBIDDEN", "You cannot view this meeting.");
      }
      res.json({ ok: true, data });
    } catch (error) {
      console.error("Get compliance meeting failed:", error);
      createApiError(res, 500, "GET_COMPLIANCE_FAILED", "Could not load compliance meeting.");
    }
  });

  app.patch("/api/compliance-meetings/:id", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      await requirePermission(user, "compliance.manage");
      const result = await updateComplianceMeetingRecord(req.params.id, req.body || {}, { organizationId: user.organizationId });
      if (!result) return createApiError(res, 404, "NOT_FOUND", "Compliance meeting was not found.");
      await auditLog({
        actorUserId: user.id,
        action: "compliance_meeting.update",
        entityType: "COMPLIANCE_MEETING",
        entityId: req.params.id,
        summary: "Compliance meeting was updated.",
        before: result.before,
        after: result.after,
        requestContext: requestContext(req),
      });
      res.json({ ok: true, data: result.after });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      console.error("Update compliance meeting failed:", error);
      createApiError(res, 500, "UPDATE_COMPLIANCE_FAILED", "Could not update compliance meeting.");
    }
  });

  app.post("/api/compliance-meetings/:id/required-documents", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      await requirePermission(user, "compliance.manage");
      const data = await upsertMeetingRequiredDocument(req.params.id, req.body || {}, { organizationId: user.organizationId });
      if (!data) return createApiError(res, 404, "NOT_FOUND", "Compliance meeting was not found.");
      await auditLog({
        actorUserId: user.id,
        action: "compliance_meeting.required_document.upsert",
        entityType: "COMPLIANCE_MEETING",
        entityId: req.params.id,
        summary: "Meeting required document was saved.",
        after: data,
        requestContext: requestContext(req),
      });
      res.json({ ok: true, data });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      console.error("Save meeting document failed:", error);
      createApiError(res, 500, "SAVE_MEETING_DOCUMENT_FAILED", "Could not save meeting document.");
    }
  });

  app.patch("/api/compliance-meetings/:id/required-documents/:documentRequirementId", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      await requirePermission(user, "compliance.manage");
      const result = await updateMeetingRequiredDocument(req.params.id, req.params.documentRequirementId, req.body || {}, {
        organizationId: user.organizationId,
      });
      if (!result) return createApiError(res, 404, "NOT_FOUND", "Required document was not found.");
      await auditLog({
        actorUserId: user.id,
        action: "compliance_meeting.required_document.update",
        entityType: "COMPLIANCE_MEETING",
        entityId: req.params.id,
        summary: "Meeting required document was updated.",
        before: result.before,
        after: result.after,
        requestContext: requestContext(req),
      });
      res.json({ ok: true, data: result.after });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      console.error("Update meeting document failed:", error);
      createApiError(res, 500, "UPDATE_MEETING_DOCUMENT_FAILED", "Could not update meeting document.");
    }
  });

  app.post("/api/compliance-meetings/:id/outcome", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      await requirePermission(user, "compliance.manage");
      const result = await updateComplianceMeetingRecord(
        req.params.id,
        {
          outcome: req.body?.outcome,
          nextActionItems: req.body?.nextActionItems,
          status: req.body?.status,
        },
        { organizationId: user.organizationId }
      );
      if (!result) return createApiError(res, 404, "NOT_FOUND", "Compliance meeting was not found.");
      await auditLog({
        actorUserId: user.id,
        action: "compliance_meeting.outcome",
        entityType: "COMPLIANCE_MEETING",
        entityId: req.params.id,
        summary: "Compliance meeting outcome was recorded.",
        before: result.before,
        after: result.after,
        requestContext: requestContext(req),
      });
      res.json({ ok: true, data: result.after });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      console.error("Record meeting outcome failed:", error);
      createApiError(res, 500, "MEETING_OUTCOME_FAILED", "Could not record meeting outcome.");
    }
  });

  app.post("/api/compliance-meetings/:id/cancel", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      await requirePermission(user, "compliance.manage");
      const result = await updateComplianceMeetingRecord(req.params.id, { status: "CANCELLED" }, {
        organizationId: user.organizationId,
      });
      if (!result) return createApiError(res, 404, "NOT_FOUND", "Compliance meeting was not found.");
      await auditLog({
        actorUserId: user.id,
        action: "compliance_meeting.cancel",
        entityType: "COMPLIANCE_MEETING",
        entityId: req.params.id,
        summary: "Compliance meeting was cancelled.",
        before: result.before,
        after: result.after,
        requestContext: requestContext(req),
      });
      res.json({ ok: true, data: result.after });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      console.error("Cancel compliance meeting failed:", error);
      createApiError(res, 500, "CANCEL_COMPLIANCE_FAILED", "Could not cancel meeting.");
    }
  });

  app.post("/api/compliance-meetings/:id/archive", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      await requirePermission(user, "compliance.manage");
      const result = await archiveComplianceMeetingRecord(req.params.id, { organizationId: user.organizationId });
      if (!result) return createApiError(res, 404, "NOT_FOUND", "Compliance meeting was not found.");
      await auditLog({
        actorUserId: user.id,
        action: "compliance_meeting.archive",
        entityType: "COMPLIANCE_MEETING",
        entityId: req.params.id,
        summary: "Compliance meeting was archived.",
        before: result.before,
        after: result.after,
        requestContext: requestContext(req),
      });
      res.json({ ok: true, data: result.after });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      console.error("Archive compliance meeting failed:", error);
      createApiError(res, 500, "ARCHIVE_COMPLIANCE_FAILED", "Could not archive meeting.");
    }
  });

  const dashboardSections = {
    summary: "summary",
    "latest-shipments": "latestShipments",
    "priority-shipments": "priorityShipments",
    "my-tasks": "myTasks",
    alerts: "alerts",
    management: "management",
  };

  for (const [pathName, dataKey] of Object.entries(dashboardSections)) {
    app.get(`/api/dashboard/${pathName}`, async (req, res) => {
      try {
        const user = await requireAuthenticatedUser(req, res);
        if (!user) return;
        await requirePermission(user, "dashboard.view");
        if (dataKey === "management") {
          const allowed = (await userHasPermission(user, "tasks.view_all")) || user.role === "CEO" || user.role === "MANAGER";
          if (!allowed) return createApiError(res, 403, "FORBIDDEN", "Management dashboard is not available.");
        }
        const permissions = await getUserPermissions(user.id);
        const data = await getDashboardData(user, permissions);
        res.json({ ok: true, data: data[dataKey] });
      } catch (error) {
        if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
        console.error(`Dashboard ${pathName} failed:`, error);
        createApiError(res, 500, "DASHBOARD_FAILED", "Could not load dashboard data.");
      }
    });
  }

  app.get("/api/documents", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      await requirePermission(user, "documents.view_all");
      const data = await listDocuments({
        organizationId: user.organizationId,
        ownerUserId: user.id,
        includeArchived: req.query.includeArchived === "true",
      });
      res.json({ ok: true, data });
    } catch (error) {
      if (error.statusCode === 403) {
        return createApiError(res, 403, "FORBIDDEN", error.message);
      }
      console.error("List documents failed:", error);
      createApiError(res, 500, "LIST_DOCUMENTS_FAILED", "Could not load documents.");
    }
  });

  app.post("/api/documents/upload", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      await requirePermission(user, "documents.upload");
      if (!(await consumeRateLimit(req, res, "document-upload", {
        limit: 20,
        windowMs: 15 * 60 * 1000,
        discriminator: user.id,
      }))) return;
      await uploadSingle(req, res);

      await validateDocumentAssociations({
        shipmentId: req.body?.shipmentId || null,
        customerId: req.body?.customerId || null,
        organizationId: user.organizationId,
      });

      const persisted = await persistDocumentFile(req.file);
      if (persisted.error) {
        return createApiError(
          res,
          persisted.error.statusCode || 415,
          persisted.error.code,
          persisted.error.message,
          persisted.error.field
        );
      }

      let document = null;
      try {
        document = await createDocumentRecord({
          ownerUserId: user.id,
          title: String(req.body?.title || persisted.sanitizedName).trim(),
          type: String(req.body?.type || "OTHER"),
          fileName: persisted.sanitizedName,
          mimeType: persisted.mimeType,
          fileSize: persisted.fileSize,
          storageKey: persisted.storageKey,
          checksum: persisted.checksum,
          uploadedById: user.id,
          uploadedByName: user.name,
          shipmentId: req.body?.shipmentId || null,
          customerId: req.body?.customerId || null,
          visibility: req.body?.visibility,
        });
      } catch (error) {
        await cleanupPersistedDocument(persisted);
        throw error;
      }
      if (!document) {
        await cleanupPersistedDocument(persisted);
        return createApiError(res, 500, "DOCUMENT_UPLOAD_FAILED", "Could not upload document.");
      }

      await auditLog({
        actorUserId: user.id,
        action: "document.upload",
        entityType: "DOCUMENT",
        entityId: document.id,
        summary: "Document was uploaded.",
        after: { id: document.id, title: document.title, fileName: document.file_name, shipmentId: document.shipment_id },
        requestContext: requestContext(req),
      });

      res.json({ ok: true, data: document });
    } catch (error) {
      if (error.statusCode === 403) {
        return createApiError(res, 403, "FORBIDDEN", error.message);
      }
      if (error.statusCode === 404) {
        return createApiError(res, 404, error.code || "NOT_FOUND", error.message);
      }
      if (error?.code === "LIMIT_FILE_SIZE") {
        return createApiError(res, 413, "FILE_TOO_LARGE", "Document file is too large.", "file");
      }
      console.error("Upload document failed:", error);
      createApiError(res, 500, "DOCUMENT_UPLOAD_FAILED", "Could not upload document.");
    }
  });

  app.get("/api/documents/:id", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      await requirePermission(user, "documents.view_all");
      const data = await getDocumentDetail(req.params.id, { organizationId: user.organizationId });
      if (!data) {
        return createApiError(res, 404, "NOT_FOUND", "Document was not found.");
      }
      res.json({ ok: true, data });
    } catch (error) {
      if (error.statusCode === 403) {
        return createApiError(res, 403, "FORBIDDEN", error.message);
      }
      console.error("Get document failed:", error);
      createApiError(res, 500, "GET_DOCUMENT_FAILED", "Could not load document.");
    }
  });

  app.get("/api/documents/:id/download", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      await requirePermission(user, "documents.view_all");
      const document = await getDocumentForDownload(req.params.id, { organizationId: user.organizationId });
      if (!document) {
        return createApiError(res, 404, "NOT_FOUND", "Document was not found.");
      }
      await sendStoredDocument(res, document);
    } catch (error) {
      if (error.statusCode === 403) {
        return createApiError(res, 403, "FORBIDDEN", error.message);
      }
      console.error("Download document failed:", error);
      createApiError(res, 500, "DOCUMENT_DOWNLOAD_FAILED", "Could not download document.");
    }
  });

  app.patch("/api/documents/:id", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      await requirePermission(user, "documents.view_all");
      await validateDocumentAssociations({
        shipmentId: req.body?.shipmentId || null,
        customerId: req.body?.customerId || null,
        organizationId: user.organizationId,
      });
      const result = await updateDocumentMetadata(
        req.params.id,
        {
          title: req.body?.title,
          type: req.body?.type,
          shipmentId: req.body?.shipmentId,
          customerId: req.body?.customerId,
          visibility: req.body?.visibility,
        },
        { organizationId: user.organizationId }
      );
      if (!result) {
        return createApiError(res, 404, "NOT_FOUND", "Document was not found.");
      }
      await auditLog({
        actorUserId: user.id,
        action: "document.update",
        entityType: "DOCUMENT",
        entityId: req.params.id,
        summary: "Document metadata was updated.",
        before: result.before,
        after: result.after,
        requestContext: requestContext(req),
      });
      res.json({ ok: true, data: result.after });
    } catch (error) {
      if (error.statusCode === 403) {
        return createApiError(res, 403, "FORBIDDEN", error.message);
      }
      if (error.statusCode === 404) {
        return createApiError(res, 404, error.code || "NOT_FOUND", error.message);
      }
      console.error("Update document failed:", error);
      createApiError(res, 500, "DOCUMENT_UPDATE_FAILED", "Could not update document.");
    }
  });

  app.post("/api/documents/:id/replace", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      await requirePermission(user, "documents.upload");
      if (!(await consumeRateLimit(req, res, "document-replace", {
        limit: 20,
        windowMs: 15 * 60 * 1000,
        discriminator: user.id,
      }))) return;
      await uploadSingle(req, res);

      const persisted = await persistDocumentFile(req.file);
      if (persisted.error) {
        return createApiError(
          res,
          persisted.error.statusCode || 415,
          persisted.error.code,
          persisted.error.message,
          persisted.error.field
        );
      }

      let result = null;
      try {
        result = await replaceDocumentFileRecord({
          documentId: req.params.id,
          fileName: persisted.sanitizedName,
          mimeType: persisted.mimeType,
          fileSize: persisted.fileSize,
          storageKey: persisted.storageKey,
          checksum: persisted.checksum,
          uploadedById: user.id,
          organizationId: user.organizationId,
        });
      } catch (error) {
        await cleanupPersistedDocument(persisted);
        throw error;
      }
      if (!result) {
        await cleanupPersistedDocument(persisted);
        return createApiError(res, 404, "NOT_FOUND", "Document was not found.");
      }
      await auditLog({
        actorUserId: user.id,
        action: "document.replace",
        entityType: "DOCUMENT",
        entityId: req.params.id,
        summary: "Document file was replaced.",
        before: { id: result.before.id, version: result.before.version, fileName: result.before.file_name },
        after: { id: result.after.id, version: result.after.version, fileName: result.after.file_name },
        requestContext: requestContext(req),
      });
      res.json({ ok: true, data: result.after });
    } catch (error) {
      if (error.statusCode === 403) {
        return createApiError(res, 403, "FORBIDDEN", error.message);
      }
      if (error?.code === "LIMIT_FILE_SIZE") {
        return createApiError(res, 413, "FILE_TOO_LARGE", "Document file is too large.", "file");
      }
      console.error("Replace document failed:", error);
      createApiError(res, 500, "DOCUMENT_REPLACE_FAILED", "Could not replace document.");
    }
  });

  app.post("/api/documents/:id/archive", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      await requirePermission(user, "documents.archive");
      const result = await archiveDocumentRecord(req.params.id, { organizationId: user.organizationId });
      if (!result) {
        return createApiError(res, 404, "NOT_FOUND", "Document was not found.");
      }
      await auditLog({
        actorUserId: user.id,
        action: "document.archive",
        entityType: "DOCUMENT",
        entityId: req.params.id,
        summary: "Document was archived.",
        before: result.before,
        after: result.after,
        requestContext: requestContext(req),
      });
      res.json({ ok: true, data: result.after });
    } catch (error) {
      if (error.statusCode === 403) {
        return createApiError(res, 403, "FORBIDDEN", error.message);
      }
      console.error("Archive document failed:", error);
      createApiError(res, 500, "DOCUMENT_ARCHIVE_FAILED", "Could not archive document.");
    }
  });

  app.get("/api/shipments/:id/documents", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      await requirePermission(user, "documents.view_all");
      const data = await listDocuments({ organizationId: user.organizationId, ownerUserId: user.id, shipmentId: req.params.id });
      res.json({ ok: true, data });
    } catch (error) {
      if (error.statusCode === 403) {
        return createApiError(res, 403, "FORBIDDEN", error.message);
      }
      console.error("List shipment documents failed:", error);
      createApiError(res, 500, "LIST_SHIPMENT_DOCUMENTS_FAILED", "Could not load shipment documents.");
    }
  });

  app.get("/api/customers/:id/documents", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      await requirePermission(user, "documents.view_all");
      const data = await listDocuments({ organizationId: user.organizationId, ownerUserId: user.id, customerId: req.params.id });
      res.json({ ok: true, data });
    } catch (error) {
      if (error.statusCode === 403) {
        return createApiError(res, 403, "FORBIDDEN", error.message);
      }
      console.error("List customer documents failed:", error);
      createApiError(res, 500, "LIST_CUSTOMER_DOCUMENTS_FAILED", "Could not load customer documents.");
    }
  });

  app.get("/api/shipments/:id/customer-access", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      await requirePermission(user, "customer_access.manage");
      const data = await getShipmentCustomerAccess(req.params.id, { organizationId: user.organizationId });
      if (!data) {
        return createApiError(res, 404, "NOT_FOUND", "Shipment was not found.");
      }
      res.json({
        ok: true,
        data: data.token
          ? { ...data, url: publicTrackLink(req, data.token) }
          : data,
      });
    } catch (error) {
      if (error.statusCode === 403) {
        return createApiError(res, 403, "FORBIDDEN", error.message);
      }
      console.error("Get customer access failed:", error);
      createApiError(res, 500, "CUSTOMER_ACCESS_FAILED", "Could not load customer access.");
    }
  });

  app.post("/api/shipments/:id/customer-access/generate", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      await requirePermission(user, "customer_access.manage");
      const result = await generateShipmentCustomerAccess(req.params.id, { organizationId: user.organizationId, rotate: false });
      if (!result) {
        return createApiError(res, 404, "NOT_FOUND", "Shipment was not found.");
      }
      await auditLog({
        actorUserId: user.id,
        action: "customer_access.generate",
        entityType: "SHIPMENT",
        entityId: req.params.id,
        summary: "Customer tracking access was generated.",
        before: result.before,
        after: result.after,
        requestContext: requestContext(req),
      });
      res.json({
        ok: true,
        data: {
          ...result.after,
          token: result.token,
          url: publicTrackLink(req, result.token),
        },
      });
    } catch (error) {
      if (error.statusCode === 403) {
        return createApiError(res, 403, "FORBIDDEN", error.message);
      }
      console.error("Generate customer access failed:", error);
      createApiError(res, 500, "CUSTOMER_ACCESS_GENERATE_FAILED", "Could not generate customer access.");
    }
  });

  app.post("/api/shipments/:id/customer-access/reset", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      await requirePermission(user, "customer_access.manage");
      const result = await generateShipmentCustomerAccess(req.params.id, { organizationId: user.organizationId });
      if (!result) {
        return createApiError(res, 404, "NOT_FOUND", "Shipment was not found.");
      }
      await auditLog({
        actorUserId: user.id,
        action: "customer_access.reset",
        entityType: "SHIPMENT",
        entityId: req.params.id,
        summary: "Customer tracking access was reset.",
        before: result.before,
        after: result.after,
        requestContext: requestContext(req),
      });
      res.json({
        ok: true,
        data: {
          ...result.after,
          token: result.token,
          url: publicTrackLink(req, result.token),
        },
      });
    } catch (error) {
      if (error.statusCode === 403) {
        return createApiError(res, 403, "FORBIDDEN", error.message);
      }
      console.error("Reset customer access failed:", error);
      createApiError(res, 500, "CUSTOMER_ACCESS_RESET_FAILED", "Could not reset customer access.");
    }
  });

  app.post("/api/shipments/:id/customer-access/disable", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      await requirePermission(user, "customer_access.manage");
      const result = await disableShipmentCustomerAccess(req.params.id, { organizationId: user.organizationId });
      if (!result) {
        return createApiError(res, 404, "NOT_FOUND", "Shipment was not found.");
      }
      await auditLog({
        actorUserId: user.id,
        action: "customer_access.disable",
        entityType: "SHIPMENT",
        entityId: req.params.id,
        summary: "Customer tracking access was disabled.",
        before: result.before,
        after: result.after,
        requestContext: requestContext(req),
      });
      res.json({ ok: true, data: result.after });
    } catch (error) {
      if (error.statusCode === 403) {
        return createApiError(res, 403, "FORBIDDEN", error.message);
      }
      console.error("Disable customer access failed:", error);
      createApiError(res, 500, "CUSTOMER_ACCESS_DISABLE_FAILED", "Could not disable customer access.");
    }
  });

  app.patch("/api/shipments/:id/public-status", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      await requirePermission(user, "customer_access.manage");
      const publicLabel = String(req.body?.publicLabel || "").trim();
      const publicDescription = String(req.body?.publicDescription || "").trim();
      if (!publicLabel) {
        return createApiError(res, 400, "VALIDATION_ERROR", "Public status label is required.", "publicLabel");
      }
      const event = await updateShipmentPublicStatus({
        shipmentId: req.params.id,
        publicLabel,
        publicDescription,
        isCustomerVisible: req.body?.isCustomerVisible !== false,
        createdById: user.id,
        organizationId: user.organizationId,
      });
      if (!event) {
        return createApiError(res, 404, "NOT_FOUND", "Shipment was not found.");
      }
      await auditLog({
        actorUserId: user.id,
        action: "shipment.public_status.update",
        entityType: "SHIPMENT",
        entityId: req.params.id,
        summary: "Public shipment status was updated.",
        after: event,
        requestContext: requestContext(req),
      });
      res.json({ ok: true, data: event });
    } catch (error) {
      if (error.statusCode === 403) {
        return createApiError(res, 403, "FORBIDDEN", error.message);
      }
      console.error("Public status update failed:", error);
      createApiError(res, 500, "PUBLIC_STATUS_UPDATE_FAILED", "Could not update public status.");
    }
  });

  app.patch("/api/documents/:id/visibility", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      await requirePermission(user, "documents.view_all");
      const result = await updateDocumentVisibility(req.params.id, req.body?.visibility, {
        organizationId: user.organizationId,
      });
      if (!result) {
        return createApiError(res, 404, "NOT_FOUND", "Document was not found.");
      }
      await auditLog({
        actorUserId: user.id,
        action: "document.visibility.update",
        entityType: "DOCUMENT",
        entityId: req.params.id,
        summary: "Document customer visibility was updated.",
        before: result.before,
        after: result.after,
        requestContext: requestContext(req),
      });
      res.json({ ok: true, data: result.after });
    } catch (error) {
      if (error.statusCode === 403) {
        return createApiError(res, 403, "FORBIDDEN", error.message);
      }
      console.error("Document visibility update failed:", error);
      createApiError(res, 500, "DOCUMENT_VISIBILITY_FAILED", "Could not update document visibility.");
    }
  });

  app.get("/api/public/track/:token/documents/:documentId", async (req, res) => {
    try {
      const document = await getPublicDocumentByTrackingToken(req.params.token, req.params.documentId);
      if (!document) {
        return createApiError(res, 404, "TRACKING_DOCUMENT_UNAVAILABLE", "Document is unavailable.");
      }
      await sendStoredDocument(res, document);
    } catch (error) {
      console.error("Public tracking document failed:", error);
      createApiError(res, 500, "PUBLIC_TRACK_DOCUMENT_FAILED", "Could not load document.");
    }
  });

  app.get("/api/public/track/:token", async (req, res) => {
    try {
      const data = await getPublicTrackingByToken(req.params.token);
      if (!data) {
        return createApiError(res, 404, "TRACKING_UNAVAILABLE", "Tracking is unavailable.");
      }
      res.json({ ok: true, data });
    } catch (error) {
      console.error("Public track failed:", error);
      createApiError(res, 500, "PUBLIC_TRACK_FAILED", "Could not load tracking.");
    }
  });

  app.post("/api/public/track/search", async (req, res) => {
    try {
      const data = await searchPublicTracking({
        shipmentCode: req.body?.shipmentCode,
        verification: req.body?.verification,
      });
      if (!data) {
        return createApiError(res, 404, "TRACKING_UNAVAILABLE", "Tracking is unavailable for the provided details.");
      }
      res.json({ ok: true, data });
    } catch (error) {
      console.error("Public track search failed:", error);
      createApiError(res, 500, "PUBLIC_TRACK_SEARCH_FAILED", "Could not search tracking.");
    }
  });

  app.get("/api/public/documents/:id", async (req, res) => {
    try {
      const document = await getPublicDocument(req.params.id);
      if (!document) {
        return createApiError(res, 404, "NOT_FOUND", "Document was not found.");
      }
      await sendStoredDocument(res, document);
    } catch (error) {
      console.error("Public document failed:", error);
      createApiError(res, 500, "PUBLIC_DOCUMENT_FAILED", "Could not load document.");
    }
  });

  app.get("/api/changes", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      await requirePermission(user, "changes.view");
      const data = await listChangeLogs({ organizationId: user.organizationId, limit: req.query.limit });
      res.json({ ok: true, data });
    } catch (error) {
      if (error.statusCode === 403) {
        return createApiError(res, 403, "FORBIDDEN", error.message);
      }
      console.error("List changes failed:", error);
      createApiError(res, 500, "LIST_CHANGES_FAILED", "Could not load changes.");
    }
  });

  app.get("/api/changes/:id", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      await requirePermission(user, "changes.view");
      const data = await getChangeLog(req.params.id, { organizationId: user.organizationId });
      if (!data) {
        return createApiError(res, 404, "NOT_FOUND", "Change log was not found.");
      }
      res.json({ ok: true, data });
    } catch (error) {
      if (error.statusCode === 403) {
        return createApiError(res, 403, "FORBIDDEN", error.message);
      }
      console.error("Get change failed:", error);
      createApiError(res, 500, "GET_CHANGE_FAILED", "Could not load change.");
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { 
        middlewareMode: true,
        host: '0.0.0.0',
        port: PORT,
        hmr: process.env.DISABLE_HMR === "true" ? false : undefined
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
    console.log("Development mode: Vite middleware enabled.");
  } else {
    // Serve static files in production
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
    console.log("Production mode: Serving static files from dist.");
  }

  const httpServer = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", async (req, socket, head) => {
    try {
      const pathname = new URL(req.url || "", `http://${req.headers.host}`).pathname;
      if (pathname !== "/ws/chat") {
        socket.destroy();
        return;
      }
      const session = await getSessionByToken(parseCookies(req.headers.cookie || "")[SESSION_COOKIE]);
      if (!session?.user || (session.user.status && session.user.status !== "active")) {
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        chatClients.set(ws, { user: session.user });
        ws.send(JSON.stringify({ type: "connection.ready", payload: { userId: session.user.id } }));
        broadcastChat({ type: "presence.updated", payload: { userId: session.user.id, isOnline: true } });

        ws.on("message", async (raw) => {
          let event;
          try {
            event = JSON.parse(raw.toString());
          } catch {
            ws.send(JSON.stringify({ type: "error", ok: false, error: { code: "BAD_JSON", message: "Invalid WebSocket message." } }));
            return;
          }

          try {
            if (event.type === "message.send") {
              const payload = event.payload || {};
              const message = await createChatMessage({
                threadId: payload.threadId,
                sender: session.user,
                content: payload.content,
                legacyData: payload.legacyData || {},
              });
              const memberIds = await listChatThreadMemberIds(payload.threadId);
              const outgoing = { type: "message.created", ok: true, requestId: event.requestId, payload: message };
              broadcastChat(outgoing, memberIds);
              broadcastChat({ type: "thread.updated", payload: { threadId: payload.threadId, lastMessage: message } }, memberIds);
              return;
            }

            if (event.type === "message.read") {
              const data = await markChatThreadRead(event.payload?.threadId, session.user.id);
              const memberIds = await listChatThreadMemberIds(event.payload?.threadId);
              broadcastChat({ type: "message.read", ok: true, requestId: event.requestId, payload: data }, memberIds);
              return;
            }

            ws.send(JSON.stringify({ type: "error", requestId: event.requestId, ok: false, error: { code: "UNKNOWN_EVENT", message: "Unknown chat event." } }));
          } catch (error) {
            ws.send(JSON.stringify({ type: "error", requestId: event.requestId, ok: false, error: { code: error.code || "CHAT_EVENT_FAILED", message: error.message || "Chat event failed." } }));
          }
        });

        ws.on("close", () => {
          chatClients.delete(ws);
          broadcastChat({ type: "presence.updated", payload: { userId: session.user.id, isOnline: false } });
        });
      });
    } catch {
      socket.destroy();
    }
  });

  httpServer.listen(PORT, "0.0.0.0", () => {
    startSmsWorker();
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
