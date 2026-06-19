import express from "express";
import path from "path";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import http from "node:http";
import { WebSocketServer } from "ws";
import { createApp } from "./app.js";
import { isConfigSmokeOnly, isHmrDisabled, isProductionMode, resolveServerPort } from "./config/env.js";
import { checkDatabase, pool } from "./db/pool.js";
import {
  registerAuthRoutes,
  registerBillingRoutes,
  registerBusinessEntityRoutes,
  listCustomerRelated as listCustomerRelatedFromRepository,
  registerAuditRoutes,
  registerCustomerRoutes,
  registerDailyStatusRoutes,
  registerDocumentManagementCenterRoutes,
  registerDocumentRoutes,
  registerNotificationRoutes,
  registerOrganizationRoutes,
  registerQuotationRoutes,
  registerRatesRoutes,
  registerSearchRoutes,
  registerShipmentRoutes,
  registerTaskRoutes,
  registerUserRoutes,
} from "./modules/index.js";
import { createApiError } from "./shared/errors/api-error.js";
import { requirePermission } from "./shared/middleware/permission.middleware.js";
import { parseRequestValue } from "./shared/middleware/validate.middleware.js";
import {
  addChatThreadMember,
  assignTaskRecord,
  archiveDocumentRecord,
  archiveChequeRecord,
  archiveComplianceMeetingRecord,
  archiveCustomerRecord,
  archiveEntityRecord,
  auditLog,
  convertQuotationToShipment,
  createAppUserRecord,
  createChatAttachmentMessage,
  createBillingInvoice,
  createChatMessage,
  createChatMessageNotifications,
  createChatThread,
  createCustomerRecord,
  createSession,
  createManualCompanySignup,
  createDocumentRecord,
  createChequeRecord,
  createComplianceMeetingRecord,
  createShipmentRecord,
  createAppErrorLog,
  createQuotationRecord,
  createShipmentTaskRecord,
  createTaskRecord,
  deleteSessionByToken,
  deleteAppUserRecord,
  deleteArchivedEntityRecord,
  deleteChatAttachment,
  disableShipmentCustomerAccess,
  ensureDirectChat,
  ensureShipmentChatThread,
  generateShipmentCustomerAccess,
  expireOrganizationSubscription,
  getChangeLog,
  getChatThreadForUser,
  getChatAttachmentForDelivery,
  getDocumentDetail,
  getDocumentForDownload,
  listDocumentStorageKeysForCleanup,
  getPublicDocument,
  getPublicDocumentByTrackingToken,
  getPublicTrackingByToken,
  getPublicTrackingTokenAuditState,
  getRecordsForUser,
  getSessionByToken,
  getSessionAuditStateByToken,
  getShipmentCustomerAccess,
  getShipmentRecord,
  getTaskRecord,
  getAdminOverview,
  getAppErrorLog,
  getDashboardData,
  getCustomerRecord,
  getBillingInvoice,
  getOrganizationDetail,
  getOrganizationBilling,
  getOrganizationSubscription,
  getUserById,
  getUserByEmail,
  getUserPermissions,
  listOrganizations,
  listAppUsers,
  listArchiveRecords,
  listAuditLogs,
  listChangeLogs,
  listChatMessages,
  listChatMediaAttachments,
  listChatParticipants,
  listChatThreadMemberIds,
  listChatThreads,
  listCustomersDetailed,
  listDocuments,
  listDueSoonCheques,
  listAppErrorLogs,
  listBillingInvoices,
  listBillingPayments,
  listRoles,
  listOrganizationMembers,
  listSubscriptionPlans,
  listShipmentSteps,
  listTasks,
  listTaskEvents,
  markChatThreadRead,
  markChatAttachmentStorageCleanup,
  markBillingPaymentManually,
  previewAppUserDeletion,
  replaceRecordsForUser,
  replaceDocumentFileRecord,
  resolveAppErrorLog,
  removeChatThreadMember,
  renewOrganizationSubscription,
  grantUserPermission,
  restoreEntityRecord,
  revokeUserPermission,
  normalizeOperationalSearchQuery,
  searchOperationalRecords,
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
  moveShipmentToExitedArchive,
  updateMeetingRequiredDocument,
  updateQuotationRecord,
  restoreShipmentFromExitedArchive,
  updateShipmentOperationalFields,
  updateShipmentPostExitFields,
  updateShipmentPublicStatus,
  updateShipmentStepRecord,
  updateTaskRecord,
  updateTaskStatusRecord,
  upsertMeetingRequiredDocument,
  updateUserNotificationPreferences,
  updateUserPassword,
  updateUserProfile,
  updateUserSecurity,
  userCanAccessThread,
  voidBillingInvoice,
} from "../../src/server/db.js";
import {
  cleanupPersistedDocument,
  deleteStoredChatAttachmentFiles,
  deleteStoredDocumentFiles,
  persistChatAttachmentFile,
  sendStoredChatAttachment,
  sendStoredDocument,
  uploadChatAttachmentSingle,
} from "../../src/server/document-storage.js";
import {
  aiChatBodySchema,
  archiveEntityParamsSchema,
  chatDirectBodySchema,
  chatAttachmentUploadBodySchema,
  chatMediaListQuerySchema,
  chatMessageAttachmentParamsSchema,
  chatMessageListQuerySchema,
  chatMessageSendBodySchema,
  chatParticipantBodySchema,
  chatParticipantsQuerySchema,
  chatReadBodySchema,
  chatThreadCreateBodySchema,
  chatThreadAttachmentParamsSchema,
  chatThreadParamsSchema,
  chatThreadParticipantParamsSchema,
  chatTypingBodySchema,
  shipmentParamsSchema,
  shipmentProgressBlockerBodySchema,
  shipmentProgressCurrentBodySchema,
  shipmentProgressParamsSchema,
  shipmentProgressStartBodySchema,
  shipmentProgressUnblockBodySchema,
  signupRequestParamsSchema,
  taskAssignBodySchema,
  taskListQuerySchema,
  taskParamsSchema,
  taskStatusBodySchema,
} from "../../src/server/request-schemas.js";
import { registerPublicTrackingRoutes } from "../../src/server/routes/public-tracking-routes.js";
import { registerShipmentProgressRoutes } from "../../src/server/routes/shipment-progress-routes.js";
import { registerShipmentFormTemplateRoutes } from "../../src/server/routes/shipment-form-template-routes.js";
import { registerShipmentWorkflowTemplateRoutes } from "../../src/server/routes/shipment-workflow-template-routes.js";
import { registerChequeReadRoutes } from "../../src/server/routes/cheque-read-routes.js";
import {
  getChequeRecord as getChequeRecordFromRepository,
  listCheques as listChequesFromRepository,
} from "../../src/server/repositories/cheques.js";
import {
  getComplianceMeetingRecord as getComplianceMeetingRecordFromRepository,
  listComplianceMeetings as listComplianceMeetingsFromRepository,
} from "../../src/server/repositories/compliance-meetings.js";
import {
  getQuotationRecord as getQuotationRecordFromRepository,
  listQuotations as listQuotationsFromRepository,
} from "./modules/quotations/quotation.repository.js";
import { startShipmentWorkflow as startShipmentWorkflowRecord } from "../../src/server/repositories/shipment-progress.js";
import {
  attachTenantContext,
  findClientTenantIdentifiers,
  requireNoClientTenantScopeConflict,
  requireTenantContext,
} from "../../src/server/tenant-context.js";
import {
  clearRateLimit,
  consumeRateLimit,
  consumeRateLimitKey,
  rateLimitKey,
} from "../../src/server/rate-limit.js";
import { runStartupChecks, shouldTrustProxy } from "../../src/server/startup-checks.js";
import { startCurrencyRatesWorker } from "../../src/server/rates-worker.js";
import { AI_MESSAGES, runAiChat } from "../../src/server/ai/ai-orchestrator.js";

const listCustomerRelated = (id, type, { organizationId, includePrivateDetails = true } = {}) =>
  listCustomerRelatedFromRepository(pool, id, type, { organizationId, includePrivateDetails });
const listQuotations = ({
  ownerUserId,
  customerId,
  organizationId,
  includeArchived = false,
  includeCustomerPrivateDetails = true,
} = {}) =>
  listQuotationsFromRepository(pool, {
    ownerUserId,
    customerId,
    organizationId,
    includeArchived,
    includeCustomerPrivateDetails,
  });
const getQuotationRecord = (id, { organizationId, includeCustomerPrivateDetails = true } = {}) =>
  getQuotationRecordFromRepository(pool, id, { organizationId, includeCustomerPrivateDetails });
const listCheques = ({ ownerUserId, organizationId, includeArchived = false } = {}) =>
  listChequesFromRepository(pool, { ownerUserId, organizationId, includeArchived });
const getChequeRecord = (id, { organizationId } = {}) => getChequeRecordFromRepository(pool, id, { organizationId });
const listComplianceMeetings = ({ ownerUserId, assignedToId, organizationId, includeArchived = false } = {}) =>
  listComplianceMeetingsFromRepository(pool, { ownerUserId, assignedToId, organizationId, includeArchived });
const getComplianceMeetingRecord = (id, { organizationId } = {}) =>
  getComplianceMeetingRecordFromRepository(pool, id, { organizationId });

const SESSION_COOKIE = "logisticplus_session";
const PASSWORD_LOGIN_LIMIT = { limit: 5, windowMs: 15 * 60 * 1000 };
const PASSWORD_LOGIN_IP_LIMIT = { limit: 20, windowMs: 15 * 60 * 1000 };
const DOCUMENT_DOWNLOAD_LIMIT = { limit: 60, windowMs: 10 * 60 * 1000 };
const PUBLIC_DOCUMENT_DOWNLOAD_LIMIT = { limit: 30, windowMs: 10 * 60 * 1000 };
const PUBLIC_TRACK_LOOKUP_LIMIT = { limit: 60, windowMs: 10 * 60 * 1000 };
const CHAT_THREAD_CREATE_LIMIT = { limit: 20, windowMs: 60 * 60 * 1000 };
const CHAT_PARTICIPANT_CHANGE_LIMIT = { limit: 60, windowMs: 60 * 60 * 1000 };
const CHAT_ATTACHMENT_UPLOAD_LIMIT = { limit: 20, windowMs: 15 * 60 * 1000 };
const CHAT_MESSAGE_SEND_LIMITS = [
  { scope: "user_short", limit: 5, windowMs: 5 * 1000 },
  { scope: "user_minute", limit: 30, windowMs: 60 * 1000 },
  { scope: "thread_minute", limit: 60, windowMs: 60 * 1000 },
];
const CHAT_TYPING_LIMIT = { limit: 1, windowMs: 2 * 1000 };
const CHAT_SOCKET_EVENT_LIMIT = { limit: 180, windowMs: 60 * 1000 };
const CHAT_SOCKET_CONNECTION_LIMIT = { limit: 12, windowMs: 60 * 1000 };
const CHAT_SOCKET_MAX_BYTES = 8 * 1024;
const AI_CHAT_LIMIT = { limit: 30, windowMs: 15 * 60 * 1000 };

const chatClients = new Map();
const chatRateLimitBuckets = new Map();
const CHAT_SOCKET_OPEN = 1;

function sendChatSocket(ws, event) {
  if (ws.readyState !== CHAT_SOCKET_OPEN) return;
  ws.send(JSON.stringify(event));
}

function chatRateLimitRetryAfterMs(resetAt, now = Date.now()) {
  return Math.max(250, resetAt - now);
}

function chatRateLimitBucket(key, windowMs, now = Date.now()) {
  const existing = chatRateLimitBuckets.get(key);
  if (!existing || existing.resetAt <= now) {
    const fresh = { count: 0, resetAt: now + windowMs };
    chatRateLimitBuckets.set(key, fresh);
    return fresh;
  }
  return existing;
}

function pruneChatRateLimitBuckets(now = Date.now()) {
  if (chatRateLimitBuckets.size < 5000) return;
  for (const [key, bucket] of chatRateLimitBuckets.entries()) {
    if (bucket.resetAt <= now) chatRateLimitBuckets.delete(key);
  }
}

function consumeChatRateLimits(limits) {
  const now = Date.now();
  pruneChatRateLimitBuckets(now);
  const buckets = limits.map((item) => ({
    ...item,
    bucket: chatRateLimitBucket(item.key, item.windowMs, now),
  }));
  const blocked = buckets.filter((item) => item.bucket.count >= item.limit);
  if (blocked.length) {
    return {
      limited: true,
      retryAfterMs: Math.max(...blocked.map((item) => chatRateLimitRetryAfterMs(item.bucket.resetAt, now))),
    };
  }
  for (const item of buckets) {
    item.bucket.count += 1;
  }
  return { limited: false, retryAfterMs: 0 };
}

function chatMessageLimitKey({ organizationId, userId, threadId, scope }) {
  return `chat:${scope}:org:${String(organizationId)}:user:${String(userId)}:thread:${String(threadId || "")}`;
}

function consumeChatMessageSendLimit({ organizationId, userId, threadId }) {
  return consumeChatRateLimits(CHAT_MESSAGE_SEND_LIMITS.map((limit) => {
    const keyScope = limit.scope === "thread_minute" ? "thread_minute" : limit.scope;
    return {
      ...limit,
      key: chatMessageLimitKey({
        organizationId,
        userId: limit.scope === "thread_minute" ? "" : userId,
        threadId: limit.scope === "thread_minute" ? threadId : "",
        scope: keyScope,
      }),
    };
  }));
}

function consumeChatTypingLimit({ organizationId, userId, threadId }) {
  return consumeChatRateLimits([
    {
      ...CHAT_TYPING_LIMIT,
      key: chatMessageLimitKey({ organizationId, userId, threadId, scope: "typing" }),
    },
  ]);
}

function chatForbiddenError(message = "Thread access denied.") {
  return Object.assign(new Error(message), { statusCode: 403, code: "FORBIDDEN" });
}

async function requireChatThreadMembership(userId, threadId, { organizationId } = {}) {
  const memberIds = await listChatThreadMemberIds(threadId, { organizationId });
  if (!memberIds.includes(userId)) throw chatForbiddenError();
  return memberIds;
}

function sendChatRateLimitedResponse(res, { retryAfterMs }) {
  res.setHeader("Retry-After", String(Math.max(1, Math.ceil(Number(retryAfterMs || 0) / 1000))));
  return res.status(429).json({
    ok: false,
    error: {
      code: "CHAT_RATE_LIMITED",
      message: "Too many chat messages. Please slow down.",
      retryAfterMs: Math.max(250, Number(retryAfterMs || 0)),
    },
  });
}

function connectedChatUserIds(organizationId, userIds = []) {
  const allowed = new Set(userIds);
  const connected = new Set();
  for (const [, client] of chatClients.entries()) {
    if (client.organizationId !== organizationId) continue;
    if (allowed.size && !allowed.has(client.user.id)) continue;
    connected.add(client.user.id);
  }
  return connected;
}

function broadcastChat(event, { organizationId, userIds } = {}) {
  if (!organizationId) return;
  const message = JSON.stringify(event);
  const allowedUserIds = userIds ? new Set(userIds) : null;
  for (const [ws, client] of chatClients.entries()) {
    if (ws.readyState !== CHAT_SOCKET_OPEN) continue;
    if (client.organizationId !== organizationId) continue;
    if (allowedUserIds && !allowedUserIds.has(client.user.id)) continue;
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
  const maxAgeSeconds = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (remember) parts.push(`Expires=${expiresAt.toUTCString()}`);
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

function clearSessionCookie(res) {
  const parts = [
    `${SESSION_COOKIE}=`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
  ];
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

function requestContext(req) {
  return {
    ip: req.ip || req.socket?.remoteAddress,
    userAgent: req.headers["user-agent"],
    requestId: req.headers["x-request-id"] || null,
  };
}

function auditIdentifierHash(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "";
  return crypto.createHash("sha256").update(normalized).digest("hex").slice(0, 24);
}

async function isPlatformAdminUser(user) {
  if (!user?.id) return false;
  const permissions = user.permissions || await getUserPermissions(user.id);
  user.permissions = permissions;
  return permissions.includes("platform.admin");
}

async function loginBlockForUser(user) {
  const isPlatformAdmin = await isPlatformAdminUser(user);

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
    !isPlatformAdmin &&
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

function sendLoginBlock(res, block) {
  return res.status(block.status).json({
    ok: false,
    error: {
      code: block.code,
      message: block.message,
    },
  });
}

async function createAuthenticatedSessionResponse(req, res, user, { method = "password", auditMetadata = {} } = {}) {
  const remember = Boolean(req.body?.remember);
  const { password_hash, ...safeUser } = user;
  const permissions = user.permissions || await getUserPermissions(user.id);
  const session = await createSession(user.id, { remember });
  setSessionCookie(res, session.token, session.expiresAt, { remember });
  const records = await getRecordsForUser(user.id);
  await auditLog({
    actorUserId: user.id,
    organizationId: user.organization_id || user.organizationId || null,
    action: "auth.login_success",
    entityType: "SESSION",
    entityId: session.id,
    summary: "User login succeeded.",
    after: { remember, expiresAt: session.expiresAt, method },
    metadata: { method, ...auditMetadata },
    requestContext: requestContext(req),
  });
  res.json({ user: { ...safeUser, permissions }, records });
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

const documentStorageResponseKeys = new Set([
  "storage_key",
  "storage_provider",
  "object_key",
  "storage_bucket",
  "storage_region",
  "local_path",
  "checksum",
  "checksum_sha256",
  "size_bytes",
  "content_type",
  "storage_migrated_at",
  "storage_verified_at",
  "storage_migration_status",
  "storage_migration_error",
]);

function sanitizeDocumentForApi(document) {
  if (!document || typeof document !== "object" || Array.isArray(document)) return document;
  const sanitized = {};
  for (const [key, value] of Object.entries(document)) {
    if (documentStorageResponseKeys.has(key)) continue;
    sanitized[key] = value;
  }
  if (Array.isArray(document.versions)) {
    sanitized.versions = document.versions.map(sanitizeDocumentForApi);
  }
  return sanitized;
}

function sanitizeDocumentEntityResponse(entityType, data) {
  return entityType === "document" ? sanitizeDocumentForApi(data) : data;
}

function documentStorageAuditMetadata(persisted) {
  return {
    storageMode: persisted?.objectWrite?.attempted ? "object-capable" : "local",
    migrationStatus: persisted?.storageMigrationStatus || "local",
    objectWrite: {
      attempted: Boolean(persisted?.objectWrite?.attempted),
      verified: Boolean(persisted?.objectWrite?.verified),
      failed: Boolean(persisted?.objectWrite?.failed),
      required: Boolean(persisted?.objectWrite?.required),
      provider: persisted?.objectWrite?.provider || null,
    },
  };
}

function safeStorageCleanupMessage(error) {
  return String(error?.message || error || "storage_cleanup_failed")
    .replace(/(access[_-]?key|secret|signature|credential|token|authorization)[^,\s]*/gi, "[redacted]")
    .replace(/https?:\/\/\S+/gi, "[redacted-url]")
    .slice(0, 300);
}

async function getAuthenticatedSession(req) {
  return getSessionByToken(getSessionCookie(req));
}

function hasPlatformAdminPermission(permissions = []) {
  return Array.isArray(permissions) && permissions.includes("platform.admin");
}

async function requireAuthenticatedUser(req, res) {
  const sessionToken = getSessionCookie(req);
  const session = await getSessionByToken(sessionToken);
  if (!session?.user) {
    if (sessionToken) {
      const sessionState = await getSessionAuditStateByToken(sessionToken).catch(() => null);
      await auditLog({
        actorUserId: sessionState?.userId || null,
        organizationId: sessionState?.organizationId || null,
        actorType: sessionState?.userId ? "user" : "public",
        action: "auth.session_restore_rejected",
        entityType: "SESSION",
        entityId: sessionState?.sessionId || null,
        summary: "Session restore was rejected.",
        metadata: {
          reason: sessionState?.reason || "unknown_session",
          matched: Boolean(sessionState?.matched),
          apiEndpoint: `${req.method} ${req.path}`,
        },
        requestContext: requestContext(req),
      });
    }
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
  const permissions = await getUserPermissions(session.user.id);
  session.user.permissions = permissions;
  if (
    !hasPlatformAdminPermission(permissions) &&
    ["expired", "suspended", "cancelled", "rejected"].includes(session.user.subscriptionStatus || "")
  ) {
    createApiError(res, 403, "SUBSCRIPTION_INACTIVE", "Subscription is not active.");
    return null;
  }
  const tenantContext = attachTenantContext(req, session.user, { permissions });
  if ((session.user.organizationId || session.user.organization_id) && !tenantContext) {
    createApiError(res, 403, "ORGANIZATION_MEMBERSHIP_REQUIRED", "Active organization membership is required.");
    return null;
  }
  session.user.organizationId = tenantContext?.organizationId || null;
  session.user.organization_id = tenantContext?.organizationId || null;
  req.clientTenantIdentifiers = findClientTenantIdentifiers(req);
  return session.user;
}

async function userHasPermission(user, permissionKey) {
  const permissions = user.permissions || await getUserPermissions(user.id);
  return permissions.includes(permissionKey);
}

function requireRequestTenant(req, res, operation) {
  const tenantContext = requireTenantContext(req, res, { createApiError, operation });
  if (!tenantContext) return null;
  if (!requireNoClientTenantScopeConflict(req, res, { createApiError, tenantContext })) return null;
  return tenantContext;
}

async function requireAuthenticatedTenantUser(req, res, operation) {
  const user = await requireAuthenticatedUser(req, res);
  if (!user) return null;
  const tenantContext = requireRequestTenant(req, res, operation);
  if (!tenantContext) return null;
  return { user, tenantContext, organizationId: tenantContext.organizationId };
}

function rejectClientTenantScope(req, res) {
  const identifiers = findClientTenantIdentifiers(req);
  if (!identifiers.length) return false;
  createApiError(
    res,
    403,
    "TENANT_SCOPE_REJECTED",
    "This API derives tenant scope from the authenticated session.",
    identifiers[0]
  );
  return true;
}

async function requireChatTenantUser(req, res, operation, permission = "chat.use") {
  const tenantRequest = await requireAuthenticatedTenantUser(req, res, operation);
  if (!tenantRequest) return null;
  if (rejectClientTenantScope(req, res)) return null;
  await requirePermission(tenantRequest.user, permission);
  return tenantRequest;
}

function handleChatRouteError(res, error, fallbackCode, fallbackMessage) {
  if (error.statusCode) {
    return createApiError(res, error.statusCode, error.code || fallbackCode, error.message || fallbackMessage);
  }
  console.error(`${fallbackCode}:`, error);
  return createApiError(res, 500, fallbackCode, fallbackMessage);
}

async function authenticateChatSocket(req) {
  const sessionToken = parseCookies(req.headers.cookie || "")[SESSION_COOKIE];
  const session = await getSessionByToken(sessionToken);
  if (!session?.user) throw Object.assign(new Error("Authentication is required."), { statusCode: 401, code: "UNAUTHENTICATED" });
  if (session.user.status && session.user.status !== "active") {
    throw Object.assign(new Error("User account is not active."), { statusCode: 403, code: "FORBIDDEN" });
  }
  if (session.user.organizationStatus && session.user.organizationStatus !== "active") {
    throw Object.assign(new Error("Organization is not active yet."), { statusCode: 403, code: "ORGANIZATION_INACTIVE" });
  }
  const permissions = await getUserPermissions(session.user.id);
  session.user.permissions = permissions;
  if (
    !hasPlatformAdminPermission(permissions) &&
    ["expired", "suspended", "cancelled", "rejected"].includes(session.user.subscriptionStatus || "")
  ) {
    throw Object.assign(new Error("Subscription is not active."), { statusCode: 403, code: "SUBSCRIPTION_INACTIVE" });
  }
  const tenantContext = attachTenantContext(req, session.user, { permissions });
  if (!tenantContext) {
    throw Object.assign(new Error("Active organization membership is required."), { statusCode: 403, code: "ORGANIZATION_MEMBERSHIP_REQUIRED" });
  }
  session.user.organizationId = tenantContext?.organizationId || null;
  session.user.organization_id = tenantContext?.organizationId || null;
  await requirePermission(session.user, "chat.use");
  return { user: session.user, tenantContext, organizationId: tenantContext?.organizationId || null };
}

function sendChatSocketError(ws, { requestId, code = "CHAT_EVENT_FAILED", message = "Chat event failed.", ...details } = {}) {
  sendChatSocket(ws, { type: "error", requestId, ok: false, error: { code, message, ...details } });
}

function parseChatSocketPayload(ws, schema, payload, requestId) {
  const result = schema.safeParse(payload || {});
  if (result.success) return result.data;
  const issue = result.error?.issues?.[0];
  sendChatSocketError(ws, {
    requestId,
    code: "VALIDATION_ERROR",
    message: issue?.message || "Invalid chat event payload.",
  });
  return null;
}

function rejectChatSocketTenantScope(ws, payload, requestId) {
  const identifiers = findClientTenantIdentifiers({ body: payload || {}, query: {}, params: {} });
  if (!identifiers.length) return false;
  sendChatSocketError(ws, {
    requestId,
    code: "TENANT_SCOPE_REJECTED",
    message: "Chat tenant scope is derived from the authenticated session.",
  });
  return true;
}

async function requirePlatformAdmin(req, res) {
  const user = await requireAuthenticatedUser(req, res);
  if (!user) return null;
  try {
    await assertPlatformPermission(user);
    return user;
  } catch (error) {
    await auditLog({
      actorUserId: user.id,
      organizationId: user.organizationId || user.organization_id || null,
      action: "platform_admin.access_denied",
      entityType: "PLATFORM_ADMIN",
      entityId: user.id,
      summary: "Platform admin access was denied.",
      metadata: { apiEndpoint: `${req.method} ${req.path}` },
      requestContext: requestContext(req),
    });
    createApiError(res, 403, "FORBIDDEN", "Platform owner access is required.");
    return null;
  }
}

async function assertPlatformPermission(user, permissionKey = "platform.admin") {
  const permissions = user.permissions || await getUserPermissions(user.id);
  user.permissions = permissions;
  if (!permissions.includes(permissionKey)) {
    const error = new Error(`Missing permission: ${permissionKey}`);
    error.statusCode = 403;
    error.code = "FORBIDDEN";
    throw error;
  }
  return user;
}

async function requireCompanyCeo(req, res) {
  const user = await requireAuthenticatedUser(req, res);
  if (!user) return null;
  const tenantContext = requireRequestTenant(req, res, "company CEO API");
  if (!tenantContext) return null;
  if (user.role !== "CEO") {
    createApiError(res, 403, "FORBIDDEN", "Company CEO access is required.");
    return null;
  }
  user.organizationId = tenantContext.organizationId;
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

async function canAccessShipment(user, shipment) {
  if (!shipment) return false;
  const shipmentOrganizationId = shipment.organization_id || shipment.organizationId;
  if (shipmentOrganizationId && shipmentOrganizationId !== user.organizationId) return false;
  const permissions = user.permissions || await getUserPermissions(user.id);
  user.permissions = permissions;
  if (permissions.includes("shipments.view_all")) return true;
  if (!permissions.includes("shipments.view_assigned")) return false;
  const ownerUserId = shipment.owner_user_id || shipment.ownerUserId;
  const assignedManagerId = shipment.assigned_manager_id || shipment.assignedManagerId;
  return ownerUserId === user.id || assignedManagerId === user.id;
}

function safeCount(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}

function toDashboardHomeDto(user, dashboardData = {}) {
  const summary = dashboardData.summary || {};
  const users = Array.isArray(dashboardData.management?.users) ? dashboardData.management.users : [];
  const activeEmployees = users.filter((item) => {
    const status = String(item.status || "active").toLowerCase();
    return status === "active" || item.is_online === true;
  }).length;

  const myActiveTasks = (dashboardData.myTasks || [])
    .filter((task) => !["DONE", "CANCELLED"].includes(String(task.status || "").toUpperCase()))
    .slice(0, 5)
    .map((task) => ({
      id: task.id,
      title: task.title || "وظیفه",
      status: task.status || "TODO",
      priority: task.priority || "MEDIUM",
      dueDate: task.dueDate || "",
      shipmentId: task.shipmentId || null,
      actionUrl: task.shipmentId ? `/shipments/${task.shipmentId}` : "/tasks",
    }));

  const lastUpdatedShipments = (dashboardData.latestShipments || []).slice(0, 5).map((shipment) => ({
    id: shipment.id,
    shipmentCode: shipment.trackingNumber || shipment.shipmentCode || shipment.id,
    customerCode: shipment.customerCode || shipment.customerId || "",
    status: shipment.status || "PENDING",
    destination: shipment.destination || "",
    estimatedDelivery: shipment.estimatedDelivery || "",
    updatedAt: shipment.updatedAt || "",
    actionUrl: `/shipments/${shipment.id}`,
  }));

  return {
    currentUser: {
      id: user.id,
      name: user.name || user.email || "کاربر",
      role: user.role || "",
    },
    metrics: [
      {
        key: "activeShipments",
        label: "محموله‌های فعال",
        value: safeCount(summary.activeShipments),
        actionUrl: "/shipments",
      },
      {
        key: "documents",
        label: "اسناد",
        value: safeCount(summary.documents),
        actionUrl: "/documents",
      },
      {
        key: "activeEmployees",
        label: "کارمندان فعال",
        value: activeEmployees,
        actionUrl: null,
      },
      {
        key: "tasks",
        label: "وظایف",
        value: safeCount(summary.openTasks),
        actionUrl: "/tasks",
      },
    ],
    myActiveTasks,
    lastUpdatedShipments,
    aiAssistant: {
      name: AI_MESSAGES.ASSISTANT_NAME,
      status: "ready",
      subtitle: "از وضعیت محموله‌ها، اسناد و وظایف بپرسید",
    },
  };
}

async function startServer() {
  await runStartupChecks();
  if (isConfigSmokeOnly()) {
    console.log("Startup configuration checks passed.");
    return;
  }

  const PORT = resolveServerPort();
  const app = createApp({
    trustProxy: shouldTrustProxy(),
    onApiErrorResponse: async (req, res) => {
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
    },
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

  const unavailablePublicReleaseEndpoint = (_req, res) =>
    createApiError(res, 404, "NOT_FOUND", "This endpoint is not available in the public release app.");

  [
    "/api/contact-requests",
    "/api/signup",
    "/api/billing/payments/:id/start",
    "/api/billing/zarinpal/callback",
    "/api/auth/phone/request-code",
    "/api/auth/phone/verify",
    "/api/admin/signup-requests",
    "/api/admin/signup-requests/:id/review",
    "/api/admin/signup-requests/:id",
    "/api/admin/contact-requests",
    "/api/admin/contact-requests/:id/resolve",
    "/api/admin/sms-deliveries",
    "/api/admin/sms-analytics",
    "/api/admin/sms-templates",
    "/api/admin/sms-templates/:key",
    "/api/admin/sms-deliveries/run-worker",
  ].forEach((route) => app.all(route, unavailablePublicReleaseEndpoint));

  app.get("/api/plans", async (_req, res) => {
    try {
      res.json({ ok: true, data: await listSubscriptionPlans() });
    } catch (error) {
      console.error("Plans failed:", error);
      createApiError(res, 500, "PLANS_FAILED", "Could not load subscription plans.");
    }
  });

  registerBillingRoutes(app, {
    auditLog,
    createApiError,
    createBillingInvoice,
    getBillingInvoice,
    getOrganizationSubscription,
    listBillingInvoices,
    listBillingPayments,
    markBillingPaymentManually,
    requestContext,
    requireAuthenticatedUser,
    requirePlatformAdmin,
    voidBillingInvoice,
  });
  registerAuthRoutes(app, {
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
  });

  registerShipmentRoutes(app, {
    auditLog,
    createApiError,
    createShipmentRecord,
    createShipmentTaskRecord,
    disableShipmentCustomerAccess,
    generateShipmentCustomerAccess,
    getShipmentCustomerAccess,
    getUserById,
    listShipmentSteps,
    moveShipmentToExitedArchive,
    pool,
    publicTrackLink,
    requestContext,
    requireAuthenticatedTenantUser,
    requireAuthenticatedUser,
    requirePermission,
    restoreShipmentFromExitedArchive,
    updateShipmentOperationalFields,
    updateShipmentPostExitFields,
    updateShipmentPublicStatus,
    updateShipmentStepRecord,
  });

  app.get("/api/shipments/:shipmentId/chat-thread", async (req, res) => {
    try {
      const tenantRequest = await requireChatTenantUser(req, res, "shipment chat thread API");
      if (!tenantRequest) return;
      const { user, organizationId } = tenantRequest;
      const params = parseRequestValue(res, shipmentProgressParamsSchema, req.params);
      if (!params) return;

      const shipment = await getShipmentRecord(params.shipmentId, { organizationId });
      if (!shipment) {
        await auditLog({
          actorUserId: user.id,
          organizationId,
          action: "chat.shipment_access_denied",
          entityType: "SHIPMENT",
          entityId: params.shipmentId,
          summary: "Shipment chat access was denied.",
          metadata: { reason: "shipment_not_found_or_cross_tenant" },
          requestContext: requestContext(req),
        });
        return createApiError(res, 404, "NOT_FOUND", "Shipment was not found.");
      }
      if (!(await canAccessShipment(user, shipment))) {
        await auditLog({
          actorUserId: user.id,
          organizationId,
          action: "chat.shipment_access_denied",
          entityType: "SHIPMENT",
          entityId: params.shipmentId,
          summary: "Shipment chat access was denied.",
          metadata: { reason: "missing_shipment_access" },
          requestContext: requestContext(req),
        });
        return createApiError(res, 403, "FORBIDDEN", "You cannot access this shipment chat.");
      }

      const ensured = await ensureShipmentChatThread({
        actorUserId: user.id,
        organizationId,
        shipmentId: shipment.id,
      });
      if (ensured.created) {
        await auditLog({
          actorUserId: user.id,
          organizationId,
          action: "chat.shipment_thread_create",
          entityType: "chat_thread",
          entityId: ensured.id,
          summary: "Shipment chat thread was created.",
          after: { shipmentId: shipment.id, participantCount: ensured.participantCount },
          requestContext: requestContext(req),
        });
      }
      const thread = await getChatThreadForUser(ensured.id, user.id, { organizationId });
      if (!thread) return createApiError(res, 404, "NOT_FOUND", "Shipment chat thread was not found.");
      const memberIds = await listChatThreadMemberIds(ensured.id, { organizationId });
      broadcastChat({ type: "thread.updated", payload: { threadId: ensured.id } }, { organizationId, userIds: memberIds });
      res.status(ensured.created ? 201 : 200).json({ ok: true, data: thread });
    } catch (error) {
      handleChatRouteError(res, error, "SHIPMENT_CHAT_THREAD_FAILED", "Could not open shipment chat.");
    }
  });

  registerSearchRoutes(app, {
    createApiError,
    normalizeOperationalSearchQuery,
    requireAuthenticatedTenantUser,
    searchOperationalRecords,
  });

  registerCustomerRoutes(app, {
    archiveCustomerRecord,
    auditLog,
    createApiError,
    createCustomerRecord,
    getCustomerRecord,
    listCustomerRelated,
    listCustomersDetailed,
    requestContext,
    requireAuthenticatedUser,
    requireTenantContext: requireRequestTenant,
    requirePermission,
    updateCustomerRecord,
  });

  registerNotificationRoutes(app, {
    createApiError,
    pool,
    requireAuthenticatedUser,
    requireTenantContext: requireRequestTenant,
  });

  registerShipmentProgressRoutes(app, {
    auditLog,
    createApiError,
    getShipmentRecord,
    getUserPermissions,
    pool,
    requestContext,
    requireAuthenticatedUser,
    requireTenantContext: requireRequestTenant,
  });

  registerDailyStatusRoutes(app, {
    auditLog,
    createApiError,
    pool,
    requestContext,
    requireAuthenticatedTenantUser,
    requirePermission,
  });

  registerBusinessEntityRoutes(app, {
    auditLog,
    createApiError,
    pool,
    requestContext,
    requireAuthenticatedTenantUser,
  });

  registerDocumentManagementCenterRoutes(app, {
    createApiError,
    pool,
    requireAuthenticatedTenantUser,
    requirePermission,
  });

  registerShipmentFormTemplateRoutes(app, {
    auditLog,
    createApiError,
    pool,
    requestContext,
    requireAuthenticatedTenantUser,
    requirePermission,
  });

  registerShipmentWorkflowTemplateRoutes(app, {
    auditLog,
    createApiError,
    pool,
    requestContext,
    requireAuthenticatedTenantUser,
    requirePermission,
  });

  registerUserRoutes(app, {
    auditLog,
    bcrypt,
    createApiError,
    createAppUserRecord,
    deleteAppUserRecord,
    getRecordsForUser,
    getUserById,
    grantUserPermission,
    listAppUsers,
    listRoles,
    previewAppUserDeletion,
    replaceRecordsForUser,
    requestContext,
    requireAuthenticatedUser,
    requireAuthenticatedTenantUser,
    requireCompanyCeo,
    requirePermission,
    requirePlatformAdmin,
    requireTenantContext: requireRequestTenant,
    revokeUserPermission,
    updateAppUserRecord,
    updateUserPassword,
    userHasPermission,
  });

  registerRatesRoutes(app, {
    auditLog,
    createApiError,
    pool,
    requestContext,
    requireAuthenticatedUser,
    requirePlatformAdmin,
  });

  registerOrganizationRoutes(app, {
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

  registerQuotationRoutes(app, {
    auditLog,
    convertQuotationToShipment,
    createApiError,
    createQuotationRecord,
    getQuotationRecord,
    listQuotations,
    requestContext,
    requireAuthenticatedTenantUser,
    requirePermission,
    setQuotationStatus,
    updateQuotationRecord,
  });
  app.get("/api/archive", async (req, res) => {
    try {
      const tenantRequest = await requireAuthenticatedTenantUser(req, res, "archive list API");
      if (!tenantRequest) return;
      const { user, organizationId } = tenantRequest;
      await requirePermission(user, "archive.view");
      res.json({ ok: true, data: await listArchiveRecords({ organizationId, search: req.query.search || "" }) });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      createApiError(res, 500, "ARCHIVE_LIST_FAILED", "Could not load archive.");
    }
  });

  app.get("/api/archive/search", async (req, res) => {
    try {
      const tenantRequest = await requireAuthenticatedTenantUser(req, res, "archive search API");
      if (!tenantRequest) return;
      const { user, organizationId } = tenantRequest;
      await requirePermission(user, "archive.view");
      res.json({ ok: true, data: await listArchiveRecords({ organizationId, search: req.query.q || req.query.search || "" }) });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      createApiError(res, 500, "ARCHIVE_SEARCH_FAILED", "Could not search archive.");
    }
  });

  app.get("/api/archive/:id", async (req, res) => {
    try {
      const tenantRequest = await requireAuthenticatedTenantUser(req, res, "archive get API");
      if (!tenantRequest) return;
      const { user, organizationId } = tenantRequest;
      await requirePermission(user, "archive.view");
      const data = (await listArchiveRecords({ organizationId })).find((item) => item.id === req.params.id || item.entityId === req.params.id);
      if (!data) return createApiError(res, 404, "NOT_FOUND", "Archive record was not found.");
      res.json({ ok: true, data });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      createApiError(res, 500, "ARCHIVE_GET_FAILED", "Could not load archive record.");
    }
  });

  app.post("/api/archive/:entityType/:entityId", async (req, res) => {
    try {
      const tenantRequest = await requireAuthenticatedTenantUser(req, res, "archive create API");
      if (!tenantRequest) return;
      const { user, organizationId } = tenantRequest;
      await requirePermission(user, "archive.view");
      const params = parseRequestValue(res, archiveEntityParamsSchema, req.params);
      if (!params) return;
      const data = await archiveEntityRecord(params.entityType, params.entityId, user.id, {
        organizationId,
        audit: {
          actorUserId: user.id,
          action: "archive.create",
          entityType: params.entityType,
          entityId: params.entityId,
          summary: "Record was archived.",
          requestContext: requestContext(req),
        },
      });
      if (!data) return createApiError(res, 404, "NOT_FOUND", "Record was not found.");
      res.json({ ok: true, data: sanitizeDocumentEntityResponse(params.entityType, data) });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      createApiError(res, 500, "ARCHIVE_FAILED", "Could not archive record.");
    }
  });

  app.post("/api/archive/:entityType/:entityId/restore", async (req, res) => {
    try {
      const tenantRequest = await requireAuthenticatedTenantUser(req, res, "archive restore API");
      if (!tenantRequest) return;
      const { user, organizationId } = tenantRequest;
      await requirePermission(user, "archive.view");
      const params = parseRequestValue(res, archiveEntityParamsSchema, req.params);
      if (!params) return;
      const data = await restoreEntityRecord(params.entityType, params.entityId, {
        organizationId,
        audit: {
          actorUserId: user.id,
          action: "archive.restore",
          entityType: params.entityType,
          entityId: params.entityId,
          summary: "Record was restored.",
          requestContext: requestContext(req),
        },
      });
      if (!data) return createApiError(res, 404, "NOT_FOUND", "Record was not found.");
      res.json({ ok: true, data: sanitizeDocumentEntityResponse(params.entityType, data) });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      createApiError(res, 500, "RESTORE_FAILED", "Could not restore record.");
    }
  });

  app.delete("/api/archive/:entityType/:entityId", async (req, res) => {
    try {
      const tenantRequest = await requireAuthenticatedTenantUser(req, res, "archive delete API");
      if (!tenantRequest) return;
      const { user, organizationId } = tenantRequest;
      await requirePermission(user, "archive.view");
      const params = parseRequestValue(res, archiveEntityParamsSchema, req.params);
      if (!params) return;
      const documentStorageKeys =
        params.entityType === "document"
          ? await listDocumentStorageKeysForCleanup(params.entityId, { organizationId })
          : [];
      const data = await deleteArchivedEntityRecord(params.entityType, params.entityId, {
        organizationId,
        audit: {
          actorUserId: user.id,
          action: "archive.delete",
          entityType: params.entityType,
          entityId: params.entityId,
          summary: "Archived record was permanently deleted.",
          metadata: {
            documentStorageCleanup: documentStorageKeys.length ? "deferred_after_db_commit" : "not_applicable",
          },
          requestContext: requestContext(req),
        },
      });
      if (!data) return createApiError(res, 404, "NOT_FOUND", "Archived record was not found.");
      if (documentStorageKeys.length) {
        await deleteStoredDocumentFiles(documentStorageKeys);
      }
      res.json({ ok: true, data: sanitizeDocumentEntityResponse(params.entityType, data) });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      console.error("Archive delete failed:", error);
      createApiError(res, 500, "ARCHIVE_DELETE_FAILED", "Could not delete archived record.");
    }
  });

  app.get("/api/chat/participants", async (req, res) => {
    try {
      const tenantRequest = await requireChatTenantUser(req, res, "chat participants API");
      if (!tenantRequest) return;
      const { user, organizationId } = tenantRequest;
      const query = parseRequestValue(res, chatParticipantsQuerySchema, req.query || {});
      if (!query) return;
      const data = await listChatParticipants({
        organizationId,
        search: query.q,
        limit: query.limit,
        excludeUserId: user.id,
      });
      res.json({ ok: true, data });
    } catch (error) {
      handleChatRouteError(res, error, "CHAT_PARTICIPANTS_FAILED", "Could not load chat participants.");
    }
  });

  app.get("/api/chat/threads", async (req, res) => {
    try {
      const tenantRequest = await requireChatTenantUser(req, res, "chat threads API");
      if (!tenantRequest) return;
      const { user, organizationId } = tenantRequest;
      res.json({ ok: true, data: await listChatThreads(user.id, { organizationId }) });
    } catch (error) {
      handleChatRouteError(res, error, "CHAT_THREADS_FAILED", "Could not load chat threads.");
    }
  });

  app.get("/api/chat/media", async (req, res) => {
    try {
      const tenantRequest = await requireChatTenantUser(req, res, "chat media library API");
      if (!tenantRequest) return;
      const { user, organizationId } = tenantRequest;
      await requirePermission(user, "chat.media.view");
      const query = parseRequestValue(res, chatMediaListQuerySchema, req.query || {});
      if (!query) return;
      const data = await listChatMediaAttachments({
        organizationId,
        search: query.q,
        type: query.type,
        includeDeleted: query.includeDeleted,
        limit: query.limit,
      });
      res.json({ ok: true, data });
    } catch (error) {
      handleChatRouteError(res, error, "CHAT_MEDIA_FAILED", "Could not load chat media.");
    }
  });

  app.post("/api/chat/direct", async (req, res) => {
    try {
      const tenantRequest = await requireChatTenantUser(req, res, "chat direct thread API");
      if (!tenantRequest) return;
      if (!(await consumeRateLimit(req, res, "chat_thread_create", { ...CHAT_THREAD_CREATE_LIMIT, discriminator: tenantRequest.user.id }))) return;
      const body = parseRequestValue(res, chatDirectBodySchema, req.body || {});
      if (!body) return;
      const id = await ensureDirectChat(tenantRequest.user.id, body.userId, { organizationId: tenantRequest.organizationId });
      await auditLog({
        actorUserId: tenantRequest.user.id,
        organizationId: tenantRequest.organizationId,
        action: "chat.direct_ensure",
        entityType: "chat_thread",
        entityId: id,
        summary: "Direct chat was opened.",
        requestContext: requestContext(req),
      });
      const memberIds = await listChatThreadMemberIds(id, { organizationId: tenantRequest.organizationId });
      broadcastChat({ type: "thread.updated", payload: { threadId: id } }, { organizationId: tenantRequest.organizationId, userIds: memberIds });
      res.status(201).json({ ok: true, data: { id } });
    } catch (error) {
      handleChatRouteError(res, error, "CHAT_DIRECT_FAILED", "Could not open direct chat.");
    }
  });

  app.post("/api/chat/threads", async (req, res) => {
    try {
      const tenantRequest = await requireChatTenantUser(req, res, "chat group thread API", "chat.manage_groups");
      if (!tenantRequest) return;
      if (!(await consumeRateLimit(req, res, "chat_thread_create", { ...CHAT_THREAD_CREATE_LIMIT, discriminator: tenantRequest.user.id }))) return;
      const body = parseRequestValue(res, chatThreadCreateBodySchema, req.body || {});
      if (!body) return;
      const id = await createChatThread({
        actorUserId: tenantRequest.user.id,
        organizationId: tenantRequest.organizationId,
        type: "GROUP",
        name: body.name,
        description: body.description,
        participantUserIds: body.participantUserIds,
      });
      await auditLog({
        actorUserId: tenantRequest.user.id,
        organizationId: tenantRequest.organizationId,
        action: "chat.thread_create",
        entityType: "chat_thread",
        entityId: id,
        summary: "Chat group was created.",
        after: { type: "GROUP", participantCount: body.participantUserIds.length + 1 },
        requestContext: requestContext(req),
      });
      const memberIds = await listChatThreadMemberIds(id, { organizationId: tenantRequest.organizationId });
      broadcastChat({ type: "thread.updated", payload: { threadId: id } }, { organizationId: tenantRequest.organizationId, userIds: memberIds });
      res.status(201).json({ ok: true, data: { id } });
    } catch (error) {
      handleChatRouteError(res, error, "CHAT_THREAD_CREATE_FAILED", "Could not create chat thread.");
    }
  });

  app.get("/api/chat/threads/:id/messages", async (req, res) => {
    try {
      const tenantRequest = await requireChatTenantUser(req, res, "chat messages API");
      if (!tenantRequest) return;
      const params = parseRequestValue(res, chatThreadParamsSchema, req.params);
      const query = parseRequestValue(res, chatMessageListQuerySchema, req.query || {});
      if (!params || !query) return;
      res.json({
        ok: true,
        data: await listChatMessages(params.id, tenantRequest.user.id, {
          organizationId: tenantRequest.organizationId,
          limit: query.limit,
          before: query.before,
        }),
      });
    } catch (error) {
      handleChatRouteError(res, error, "CHAT_MESSAGES_FAILED", "Could not load messages.");
    }
  });

  app.post("/api/chat/threads/:id/messages", async (req, res) => {
    try {
      const tenantRequest = await requireChatTenantUser(req, res, "chat message send API");
      if (!tenantRequest) return;
      const params = parseRequestValue(res, chatThreadParamsSchema, req.params);
      const body = parseRequestValue(res, chatMessageSendBodySchema, req.body || {});
      if (!params || !body) return;
      await requireChatThreadMembership(tenantRequest.user.id, params.id, { organizationId: tenantRequest.organizationId });
      const sendLimit = consumeChatMessageSendLimit({
        organizationId: tenantRequest.organizationId,
        userId: tenantRequest.user.id,
        threadId: params.id,
      });
      if (sendLimit.limited) {
        sendChatRateLimitedResponse(res, sendLimit);
        return;
      }
      const message = await createChatMessage({
        threadId: params.id,
        sender: tenantRequest.user,
        organizationId: tenantRequest.organizationId,
        body: body.body,
        clientMessageId: body.clientMessageId,
      });
      const memberIds = await listChatThreadMemberIds(params.id, { organizationId: tenantRequest.organizationId });
      const connectedRecipients = connectedChatUserIds(tenantRequest.organizationId, memberIds);
      const missedRecipientIds = memberIds.filter((userId) => userId !== tenantRequest.user.id && !connectedRecipients.has(userId));
      await createChatMessageNotifications({
        organizationId: tenantRequest.organizationId,
        threadId: params.id,
        messageId: message.id,
        senderId: tenantRequest.user.id,
        senderName: tenantRequest.user.name,
        recipientUserIds: missedRecipientIds,
      });
      broadcastChat({ type: "message.created", ok: true, payload: message }, { organizationId: tenantRequest.organizationId, userIds: memberIds });
      broadcastChat({ type: "thread.updated", payload: { threadId: params.id, lastMessage: message } }, { organizationId: tenantRequest.organizationId, userIds: memberIds });
      res.status(201).json({ ok: true, data: message });
    } catch (error) {
      handleChatRouteError(res, error, "CHAT_MESSAGE_SEND_FAILED", "Could not send message.");
    }
  });

  app.post("/api/chat/threads/:threadId/attachments", async (req, res) => {
    try {
      const tenantRequest = await requireChatTenantUser(req, res, "chat attachment upload API");
      if (!tenantRequest) return;
      const params = parseRequestValue(res, chatThreadAttachmentParamsSchema, req.params);
      if (!params) return;
      if (!(await consumeRateLimit(req, res, "chat_attachment_upload", {
        ...CHAT_ATTACHMENT_UPLOAD_LIMIT,
        discriminator: tenantRequest.user.id,
      }))) return;
      await requireChatThreadMembership(tenantRequest.user.id, params.threadId, { organizationId: tenantRequest.organizationId });
      await uploadChatAttachmentSingle(req, res);
      const body = parseRequestValue(res, chatAttachmentUploadBodySchema, req.body || {});
      if (!body) return;

      const persisted = await persistChatAttachmentFile(req.file, { organizationId: tenantRequest.organizationId });
      if (persisted.error) {
        return createApiError(
          res,
          persisted.error.statusCode || 415,
          persisted.error.code,
          persisted.error.message,
          persisted.error.field
        );
      }

      let message = null;
      try {
        message = await createChatAttachmentMessage({
          threadId: params.threadId,
          sender: tenantRequest.user,
          organizationId: tenantRequest.organizationId,
          caption: body.caption || "",
          clientMessageId: body.clientMessageId,
          attachment: persisted,
        });
      } catch (error) {
        await cleanupPersistedDocument(persisted);
        throw error;
      }
      const attachment = message.attachments?.[0] || null;
      await auditLog({
        actorUserId: tenantRequest.user.id,
        organizationId: tenantRequest.organizationId,
        action: "chat.attachment.upload",
        entityType: "chat_attachment",
        entityId: attachment?.id || message.id,
        summary: "Chat attachment was uploaded.",
        after: {
          attachmentId: attachment?.id,
          messageId: message.id,
          threadId: params.threadId,
          attachmentType: attachment?.attachmentType,
          contentType: attachment?.contentType,
          sizeBytes: attachment?.sizeBytes,
          fileName: attachment?.filename,
        },
        metadata: documentStorageAuditMetadata(persisted),
        requestContext: requestContext(req),
      });
      const memberIds = await listChatThreadMemberIds(params.threadId, { organizationId: tenantRequest.organizationId });
      const connectedRecipients = connectedChatUserIds(tenantRequest.organizationId, memberIds);
      const missedRecipientIds = memberIds.filter((userId) => userId !== tenantRequest.user.id && !connectedRecipients.has(userId));
      await createChatMessageNotifications({
        organizationId: tenantRequest.organizationId,
        threadId: params.threadId,
        messageId: message.id,
        senderId: tenantRequest.user.id,
        senderName: tenantRequest.user.name,
        recipientUserIds: missedRecipientIds,
      });
      broadcastChat({ type: "message.created", ok: true, payload: message }, { organizationId: tenantRequest.organizationId, userIds: memberIds });
      broadcastChat({ type: "thread.updated", payload: { threadId: params.threadId, lastMessage: message } }, { organizationId: tenantRequest.organizationId, userIds: memberIds });
      res.status(201).json({ ok: true, data: message });
    } catch (error) {
      if (error?.code === "LIMIT_FILE_SIZE") {
        return createApiError(res, 413, "FILE_TOO_LARGE", "Ø­Ø¬Ù… ÙØ§ÛŒÙ„ Ø¨ÛŒØ´ Ø§Ø² Ø­Ø¯ Ù…Ø¬Ø§Ø² Ø§Ø³Øª", "file");
      }
      handleChatRouteError(res, error, "CHAT_ATTACHMENT_UPLOAD_FAILED", "Could not upload chat attachment.");
    }
  });

  app.get("/api/chat/messages/:messageId/attachments/:attachmentId/preview", async (req, res) => {
    try {
      const tenantRequest = await requireChatTenantUser(req, res, "chat attachment preview API");
      if (!tenantRequest) return;
      const params = parseRequestValue(res, chatMessageAttachmentParamsSchema, req.params);
      if (!params) return;
      if (!(await consumeRateLimit(req, res, "chat-attachment-preview", {
        ...DOCUMENT_DOWNLOAD_LIMIT,
        discriminator: tenantRequest.user.id,
      }))) return;
      const attachment = await getChatAttachmentForDelivery(params.messageId, params.attachmentId, tenantRequest.user.id, {
        organizationId: tenantRequest.organizationId,
        previewOnly: true,
      });
      await sendStoredChatAttachment(res, attachment, { disposition: "inline" });
    } catch (error) {
      handleChatRouteError(res, error, "CHAT_ATTACHMENT_PREVIEW_FAILED", "Could not preview chat attachment.");
    }
  });

  app.get("/api/chat/messages/:messageId/attachments/:attachmentId/download", async (req, res) => {
    try {
      const tenantRequest = await requireChatTenantUser(req, res, "chat attachment download API");
      if (!tenantRequest) return;
      const params = parseRequestValue(res, chatMessageAttachmentParamsSchema, req.params);
      if (!params) return;
      if (!(await consumeRateLimit(req, res, "chat-attachment-download", {
        ...DOCUMENT_DOWNLOAD_LIMIT,
        discriminator: tenantRequest.user.id,
      }))) return;
      const attachment = await getChatAttachmentForDelivery(params.messageId, params.attachmentId, tenantRequest.user.id, {
        organizationId: tenantRequest.organizationId,
      });
      await sendStoredChatAttachment(res, attachment, { disposition: "attachment" });
    } catch (error) {
      handleChatRouteError(res, error, "CHAT_ATTACHMENT_DOWNLOAD_FAILED", "Could not download chat attachment.");
    }
  });

  app.delete("/api/chat/messages/:messageId/attachments/:attachmentId", async (req, res) => {
    try {
      const tenantRequest = await requireChatTenantUser(req, res, "chat attachment delete API");
      if (!tenantRequest) return;
      const params = parseRequestValue(res, chatMessageAttachmentParamsSchema, req.params);
      if (!params) return;
      const canManageMedia = await userHasPermission(tenantRequest.user, "chat.media.delete");
      const result = await deleteChatAttachment({
        messageId: params.messageId,
        attachmentId: params.attachmentId,
        actorUserId: tenantRequest.user.id,
        organizationId: tenantRequest.organizationId,
        reason: canManageMedia ? "deleted_by_manager" : "deleted_by_sender",
        allowAny: canManageMedia,
      });
      let storageCleanup = "already_deleted";
      if (!result.alreadyDeleted) {
        try {
          await deleteStoredChatAttachmentFiles(result.before);
          await markChatAttachmentStorageCleanup(params.attachmentId, { organizationId: tenantRequest.organizationId });
          storageCleanup = "deleted";
        } catch (cleanupError) {
          const safeReason = safeStorageCleanupMessage(cleanupError);
          await markChatAttachmentStorageCleanup(params.attachmentId, {
            organizationId: tenantRequest.organizationId,
            error: safeReason,
          });
          storageCleanup = "failed";
        }
      }
      await auditLog({
        actorUserId: tenantRequest.user.id,
        organizationId: tenantRequest.organizationId,
        action: "chat.attachment.delete",
        entityType: "chat_attachment",
        entityId: params.attachmentId,
        summary: "Chat attachment was deleted.",
        before: {
          attachmentId: result.before.id,
          messageId: result.before.message_id,
          threadId: result.before.thread_id,
          attachmentType: result.before.attachment_type,
          contentType: result.before.content_type,
          sizeBytes: Number(result.before.size_bytes || 0),
          fileName: result.before.original_filename,
        },
        after: {
          attachmentId: result.ui.id,
          deletedAt: result.ui.deletedAt,
          storageCleanup,
        },
        requestContext: requestContext(req),
      });
      const memberIds = await listChatThreadMemberIds(result.before.thread_id, { organizationId: tenantRequest.organizationId });
      broadcastChat(
        { type: "message.updated", ok: true, payload: { threadId: result.before.thread_id, messageId: params.messageId, attachment: result.ui } },
        { organizationId: tenantRequest.organizationId, userIds: memberIds }
      );
      res.json({ ok: true, data: { attachment: result.ui, storageCleanup } });
    } catch (error) {
      handleChatRouteError(res, error, "CHAT_ATTACHMENT_DELETE_FAILED", "Could not delete chat attachment.");
    }
  });

  app.post("/api/chat/threads/:id/read", async (req, res) => {
    try {
      const tenantRequest = await requireChatTenantUser(req, res, "chat read API");
      if (!tenantRequest) return;
      const params = parseRequestValue(res, chatThreadParamsSchema, req.params);
      const body = parseRequestValue(res, chatReadBodySchema, req.body || {});
      if (!params || !body) return;
      const data = await markChatThreadRead(params.id, tenantRequest.user.id, {
        organizationId: tenantRequest.organizationId,
        messageId: body.messageId,
      });
      const memberIds = await listChatThreadMemberIds(params.id, { organizationId: tenantRequest.organizationId });
      broadcastChat({ type: "message.read", payload: data }, { organizationId: tenantRequest.organizationId, userIds: memberIds });
      res.json({ ok: true, data });
    } catch (error) {
      handleChatRouteError(res, error, "CHAT_READ_FAILED", "Could not mark thread read.");
    }
  });

  app.post("/api/chat/threads/:id/participants", async (req, res) => {
    try {
      const tenantRequest = await requireChatTenantUser(req, res, "chat participant add API", "chat.manage_groups");
      if (!tenantRequest) return;
      if (!(await consumeRateLimit(req, res, "chat_participant_change", { ...CHAT_PARTICIPANT_CHANGE_LIMIT, discriminator: tenantRequest.user.id }))) return;
      const params = parseRequestValue(res, chatThreadParamsSchema, req.params);
      const body = parseRequestValue(res, chatParticipantBodySchema, req.body || {});
      if (!params || !body) return;
      const data = await addChatThreadMember(params.id, body.userId, {
        organizationId: tenantRequest.organizationId,
        actorUserId: tenantRequest.user.id,
      });
      await auditLog({
        actorUserId: tenantRequest.user.id,
        organizationId: tenantRequest.organizationId,
        action: "chat.participant_add",
        entityType: "chat_thread",
        entityId: params.id,
        summary: "Chat participant was added.",
        after: { userId: body.userId },
        requestContext: requestContext(req),
      });
      const memberIds = await listChatThreadMemberIds(params.id, { organizationId: tenantRequest.organizationId });
      broadcastChat({ type: "participant.updated", payload: data }, { organizationId: tenantRequest.organizationId, userIds: memberIds });
      broadcastChat({ type: "thread.updated", payload: { threadId: params.id } }, { organizationId: tenantRequest.organizationId, userIds: memberIds });
      res.json({ ok: true, data });
    } catch (error) {
      handleChatRouteError(res, error, "CHAT_PARTICIPANT_ADD_FAILED", "Could not add chat participant.");
    }
  });

  app.delete("/api/chat/threads/:id/participants/:userId", async (req, res) => {
    try {
      const tenantRequest = await requireChatTenantUser(req, res, "chat participant remove API", "chat.manage_groups");
      if (!tenantRequest) return;
      if (!(await consumeRateLimit(req, res, "chat_participant_change", { ...CHAT_PARTICIPANT_CHANGE_LIMIT, discriminator: tenantRequest.user.id }))) return;
      const params = parseRequestValue(res, chatThreadParticipantParamsSchema, req.params);
      if (!params) return;
      const memberIdsBefore = await listChatThreadMemberIds(params.id, { organizationId: tenantRequest.organizationId });
      const data = await removeChatThreadMember(params.id, params.userId, {
        organizationId: tenantRequest.organizationId,
        actorUserId: tenantRequest.user.id,
      });
      await auditLog({
        actorUserId: tenantRequest.user.id,
        organizationId: tenantRequest.organizationId,
        action: "chat.participant_remove",
        entityType: "chat_thread",
        entityId: params.id,
        summary: "Chat participant was removed.",
        after: { userId: params.userId },
        requestContext: requestContext(req),
      });
      broadcastChat({ type: "participant.updated", payload: data }, { organizationId: tenantRequest.organizationId, userIds: memberIdsBefore });
      broadcastChat({ type: "thread.updated", payload: { threadId: params.id } }, { organizationId: tenantRequest.organizationId, userIds: memberIdsBefore });
      res.json({ ok: true, data });
    } catch (error) {
      handleChatRouteError(res, error, "CHAT_PARTICIPANT_REMOVE_FAILED", "Could not remove chat participant.");
    }
  });

  registerTaskRoutes(app, {
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
  });

  registerChequeReadRoutes(app, {
    createApiError,
    getChequeRecord,
    listCheques,
    listDueSoonCheques,
    requireAuthenticatedTenantUser,
    requirePermission,
  });

  app.post("/api/cheques", async (req, res) => {
    try {
      const tenantRequest = await requireAuthenticatedTenantUser(req, res, "cheque create API");
      if (!tenantRequest) return;
      const { user, tenantContext } = tenantRequest;
      await requirePermission(user, "cheques.manage");
      if (!req.body?.bankName || !req.body?.chequeNumber || Number(req.body?.amount || 0) <= 0) {
        return createApiError(res, 400, "VALIDATION_ERROR", "Bank, cheque number, and positive amount are required.");
      }
      const data = await createChequeRecord({ ownerUserId: user.id, actorUserId: user.id, tenantContext, cheque: req.body });
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

  app.patch("/api/cheques/:id", async (req, res) => {
    try {
      const tenantRequest = await requireAuthenticatedTenantUser(req, res, "cheque update API");
      if (!tenantRequest) return;
      const { user, organizationId } = tenantRequest;
      await requirePermission(user, "cheques.manage");
      const result = await updateChequeRecord(req.params.id, req.body || {}, { organizationId });
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
      const tenantRequest = await requireAuthenticatedTenantUser(req, res, "cheque status API");
      if (!tenantRequest) return;
      const { user, organizationId } = tenantRequest;
      await requirePermission(user, "cheques.manage");
      const result = await updateChequeRecord(req.params.id, { status: req.body?.status }, { organizationId });
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
      const tenantRequest = await requireAuthenticatedTenantUser(req, res, "cheque archive API");
      if (!tenantRequest) return;
      const { user, organizationId } = tenantRequest;
      await requirePermission(user, "cheques.manage");
      const result = await archiveChequeRecord(req.params.id, { organizationId });
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
        canManage ? { organizationId: user.organizationId } : { organizationId: user.organizationId, assignedToId: user.id }
      );
      res.json({ ok: true, data });
    } catch (error) {
      console.error("List compliance meetings failed:", error);
      createApiError(res, 500, "LIST_COMPLIANCE_FAILED", "Could not load compliance meetings.");
    }
  });

  app.post("/api/compliance-meetings", async (req, res) => {
    try {
      const tenantRequest = await requireAuthenticatedTenantUser(req, res, "compliance meeting create API");
      if (!tenantRequest) return;
      const { user, tenantContext } = tenantRequest;
      await requirePermission(user, "compliance.manage");
      if (!req.body?.dateTime || !req.body?.purpose) {
        return createApiError(res, 400, "VALIDATION_ERROR", "Meeting date/time and purpose are required.");
      }
      const data = await createComplianceMeetingRecord({ ownerUserId: user.id, actorUser: user, tenantContext, meeting: req.body });
      if (req.body?.assignedPersonId) {
        await createTaskRecord({
          ownerUserId: user.id,
          tenantContext,
          title: `Ø¬Ù„Ø³Ù‡: ${req.body.purpose}`,
          description: `Ø¢Ù…Ø§Ø¯Ù‡â€ŒØ³Ø§Ø²ÛŒ Ø¬Ù„Ø³Ù‡ ${req.body.purpose}`,
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

  app.get("/api/dashboard", async (req, res) => {
    try {
      const tenantRequest = await requireAuthenticatedTenantUser(req, res, "dashboard API");
      if (!tenantRequest) return;
      const { user } = tenantRequest;
      const permissions = await requirePermission(user, "dashboard.view");
      const data = await getDashboardData(user, permissions);
      res.json({ ok: true, data: toDashboardHomeDto(user, data) });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      console.error("Dashboard failed:", error);
      createApiError(res, 500, "DASHBOARD_FAILED", "Could not load dashboard data.");
    }
  });

  app.post("/api/ai/chat", async (req, res) => {
    try {
      const tenantRequest = await requireAuthenticatedTenantUser(req, res, "AI assistant chat API");
      if (!tenantRequest) return;
      const { user, organizationId } = tenantRequest;
      await requirePermission(user, "dashboard.view");
      if (String(user.role || "").toUpperCase() !== "CEO") {
        return createApiError(res, 403, "FORBIDDEN", AI_MESSAGES.CEO_ONLY_MESSAGE);
      }
      if (!(await consumeRateLimit(req, res, "ai-chat", { ...AI_CHAT_LIMIT, discriminator: user.id }))) return;
      const body = parseRequestValue(res, aiChatBodySchema, req.body || {});
      if (!body) return;

      const result = await runAiChat({
        pool,
        user,
        organizationId,
        message: body.message,
        context: body.context,
        conversationId: body.conversationId,
        recentMessages: body.recentMessages,
        activeEntity: body.activeEntity,
      });
      const responseId = crypto.randomUUID();
      const createdAt = new Date().toISOString();
      const responseData = {
        id: responseId,
        assistantName: AI_MESSAGES.ASSISTANT_NAME,
        status: result.audit?.success ? "answered" : "ready",
        answer: result.data?.answer || AI_MESSAGES.NO_CODE_DETECTED,
        tone: result.data?.tone || "direct",
        responseMode: result.data?.responseMode || "direct_answer",
        activeEntity: result.data?.activeEntity,
        suggestions: result.data?.suggestions || [],
        sources: result.data?.sources || [],
        createdAt,
      };

      await auditLog({
        organizationId,
        actorUserId: user.id,
        action: "ai.chat.ask",
        entityType: "AI_ASSISTANT",
        entityId: responseId,
        summary: "AI assistant read-only question was processed.",
        metadata: {
          route: "/api/ai/chat",
          context: body.context,
          conversationId: body.conversationId,
          queryType: result.audit?.queryType,
          toolsCalled: result.audit?.toolsCalled || [],
          success: Boolean(result.audit?.success),
          reason: result.audit?.reason || null,
          activeEntityType: body.activeEntity?.type || null,
        },
        requestContext: requestContext(req),
      });

      res.json({ ok: true, data: responseData });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      console.error("AI assistant chat failed:", error);
      createApiError(res, 500, "AI_CHAT_FAILED", "Could not answer the AI assistant question.");
    }
  });

  for (const [pathName, dataKey] of Object.entries(dashboardSections)) {
    app.get(`/api/dashboard/${pathName}`, async (req, res) => {
      try {
        const user = await requireAuthenticatedUser(req, res);
        if (!user) return;
        const permissions = await requirePermission(user, "dashboard.view");
        if (dataKey === "management") {
          const allowed = permissions.includes("tasks.view_all") || user.role === "CEO" || user.role === "MANAGER";
          if (!allowed) return createApiError(res, 403, "FORBIDDEN", "Management dashboard is not available.");
        }
        const data = await getDashboardData(user, permissions);
        res.json({ ok: true, data: data[dataKey] });
      } catch (error) {
        if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
        console.error(`Dashboard ${pathName} failed:`, error);
        createApiError(res, 500, "DASHBOARD_FAILED", "Could not load dashboard data.");
      }
    });
  }

  registerDocumentRoutes(app, {
    DOCUMENT_DOWNLOAD_LIMIT,
    archiveDocumentRecord,
    auditLog,
    consumeRateLimit,
    createApiError,
    createDocumentRecord,
    getDocumentDetail,
    getDocumentForDownload,
    listDocuments,
    replaceDocumentFileRecord,
    requestContext,
    requireAuthenticatedTenantUser,
    requireAuthenticatedUser,
    requirePermission,
    updateDocumentMetadata,
    updateDocumentVisibility,
    validateDocumentAssociations,
  });

  registerPublicTrackingRoutes(app, {
    auditLog,
    createApiError,
    consumeRateLimit,
    getPublicDocument,
    getPublicDocumentByTrackingToken,
    getPublicTrackingByToken,
    getPublicTrackingTokenAuditState,
    publicDocumentDownloadLimit: PUBLIC_DOCUMENT_DOWNLOAD_LIMIT,
    publicTrackLookupLimit: PUBLIC_TRACK_LOOKUP_LIMIT,
    requestContext,
    sendStoredDocument,
  });

  registerAuditRoutes(app, {
    createApiError,
    listAuditLogs,
    requireAuthenticatedTenantUser,
    requirePermission,
    requirePlatformAdmin,
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

  app.use("/api", (_req, res) =>
    createApiError(res, 404, "NOT_FOUND", "API endpoint was not found.")
  );

  // Vite middleware for development
  if (!isProductionMode()) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        host: "0.0.0.0",
        port: PORT,
        hmr: isHmrDisabled() ? false : undefined
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
    console.log("Development mode: Vite middleware enabled.");
  } else {
    // Serve static files in production
    const distPath = path.join(process.cwd(), 'dist');
    app.use(
      "/assets",
      express.static(path.join(distPath, "assets"), {
        immutable: true,
        maxAge: "1y",
      })
    );
    app.use(express.static(distPath, { maxAge: "1h" }));
    app.get('*', (req, res) => {
      res.setHeader("Cache-Control", "no-cache");
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
      const auth = await authenticateChatSocket(req);
      const connectionLimit = await consumeRateLimitKey(
        rateLimitKey(req, "chat_socket_connection", auth.user.id),
        CHAT_SOCKET_CONNECTION_LIMIT
      );
      if (connectionLimit.limited) {
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        const clientState = {
          user: auth.user,
          organizationId: auth.organizationId,
          joinedThreads: new Set(),
        };
        chatClients.set(ws, clientState);
        sendChatSocket(ws, {
          type: "connection.ready",
          ok: true,
          payload: { userId: auth.user.id, organizationId: auth.organizationId },
        });
        broadcastChat(
          { type: "presence.updated", payload: { userId: auth.user.id, isOnline: true } },
          { organizationId: auth.organizationId }
        );

        ws.on("message", async (raw) => {
          let event;
          const rawText = raw.toString();
          if (Buffer.byteLength(rawText, "utf8") > CHAT_SOCKET_MAX_BYTES) {
            sendChatSocketError(ws, { code: "MESSAGE_TOO_LARGE", message: "Chat event is too large." });
            return;
          }
          const eventLimit = await consumeRateLimitKey(
            rateLimitKey(req, "chat_socket_event", auth.user.id),
            CHAT_SOCKET_EVENT_LIMIT
          );
          if (eventLimit.limited) {
            sendChatSocketError(ws, { code: "RATE_LIMITED", message: "Too many chat events. Please slow down." });
            return;
          }
          try {
            event = JSON.parse(rawText);
          } catch {
            sendChatSocketError(ws, { code: "BAD_JSON", message: "Invalid WebSocket message." });
            return;
          }

          try {
            if (event.type === "message.send") {
              if (rejectChatSocketTenantScope(ws, event.payload, event.requestId)) return;
              const payload = parseChatSocketPayload(ws, chatMessageSendBodySchema, event.payload, event.requestId);
              if (!payload) return;
              if (!payload.threadId) {
                sendChatSocketError(ws, { requestId: event.requestId, code: "THREAD_REQUIRED", message: "Thread id is required." });
                return;
              }
              await requireChatThreadMembership(auth.user.id, payload.threadId, { organizationId: auth.organizationId });
              const sendLimit = consumeChatMessageSendLimit({
                organizationId: auth.organizationId,
                userId: auth.user.id,
                threadId: payload.threadId,
              });
              if (sendLimit.limited) {
                sendChatSocketError(ws, {
                  requestId: event.requestId,
                  code: "CHAT_RATE_LIMITED",
                  message: "Too many chat messages. Please slow down.",
                  retryAfterMs: sendLimit.retryAfterMs,
                });
                return;
              }
              const message = await createChatMessage({
                threadId: payload.threadId,
                sender: auth.user,
                organizationId: auth.organizationId,
                body: payload.body,
                clientMessageId: payload.clientMessageId,
              });
              const memberIds = await listChatThreadMemberIds(payload.threadId, { organizationId: auth.organizationId });
              const connectedRecipients = connectedChatUserIds(auth.organizationId, memberIds);
              const missedRecipientIds = memberIds.filter((userId) => userId !== auth.user.id && !connectedRecipients.has(userId));
              await createChatMessageNotifications({
                organizationId: auth.organizationId,
                threadId: payload.threadId,
                messageId: message.id,
                senderId: auth.user.id,
                senderName: auth.user.name,
                recipientUserIds: missedRecipientIds,
              });
              sendChatSocket(ws, {
                type: "message.ack",
                ok: true,
                requestId: event.requestId,
                payload: { id: message.id, clientMessageId: payload.clientMessageId },
              });
              const outgoing = { type: "message.created", ok: true, requestId: event.requestId, payload: message };
              broadcastChat(outgoing, { organizationId: auth.organizationId, userIds: memberIds });
              broadcastChat(
                { type: "thread.updated", payload: { threadId: payload.threadId, lastMessage: message } },
                { organizationId: auth.organizationId, userIds: memberIds }
              );
              return;
            }

            if (event.type === "message.read") {
              if (rejectChatSocketTenantScope(ws, event.payload, event.requestId)) return;
              const payload = parseChatSocketPayload(ws, chatReadBodySchema, event.payload, event.requestId);
              if (!payload) return;
              if (!payload.threadId) {
                sendChatSocketError(ws, { requestId: event.requestId, code: "THREAD_REQUIRED", message: "Thread id is required." });
                return;
              }
              const data = await markChatThreadRead(payload.threadId, auth.user.id, {
                organizationId: auth.organizationId,
                messageId: payload.messageId,
              });
              const memberIds = await listChatThreadMemberIds(payload.threadId, { organizationId: auth.organizationId });
              broadcastChat(
                { type: "message.read", ok: true, requestId: event.requestId, payload: data },
                { organizationId: auth.organizationId, userIds: memberIds }
              );
              return;
            }

            if (event.type === "thread.join") {
              if (rejectChatSocketTenantScope(ws, event.payload, event.requestId)) return;
              const payload = parseChatSocketPayload(ws, chatTypingBodySchema, event.payload, event.requestId);
              if (!payload) return;
              if (!(await userCanAccessThread(auth.user.id, payload.threadId, { organizationId: auth.organizationId }))) {
                sendChatSocketError(ws, { requestId: event.requestId, code: "FORBIDDEN", message: "Thread access denied." });
                return;
              }
              clientState.joinedThreads.add(payload.threadId);
              sendChatSocket(ws, { type: "thread.joined", ok: true, requestId: event.requestId, payload });
              return;
            }

            if (event.type === "thread.leave") {
              if (rejectChatSocketTenantScope(ws, event.payload, event.requestId)) return;
              const payload = parseChatSocketPayload(ws, chatTypingBodySchema, event.payload, event.requestId);
              if (!payload) return;
              clientState.joinedThreads.delete(payload.threadId);
              sendChatSocket(ws, { type: "thread.left", ok: true, requestId: event.requestId, payload });
              return;
            }

            if (event.type === "typing.start" || event.type === "typing.stop") {
              if (rejectChatSocketTenantScope(ws, event.payload, event.requestId)) return;
              const payload = parseChatSocketPayload(ws, chatTypingBodySchema, event.payload, event.requestId);
              if (!payload) return;
              if (!(await userCanAccessThread(auth.user.id, payload.threadId, { organizationId: auth.organizationId }))) {
                sendChatSocketError(ws, { requestId: event.requestId, code: "FORBIDDEN", message: "Thread access denied." });
                return;
              }
              const typingLimit = consumeChatTypingLimit({
                organizationId: auth.organizationId,
                userId: auth.user.id,
                threadId: payload.threadId,
              });
              if (typingLimit.limited) return;
              const memberIds = (await listChatThreadMemberIds(payload.threadId, { organizationId: auth.organizationId }))
                .filter((userId) => userId !== auth.user.id);
              broadcastChat(
                {
                  type: "typing.updated",
                  payload: {
                    threadId: payload.threadId,
                    userId: auth.user.id,
                    isTyping: event.type === "typing.start",
                  },
                },
                { organizationId: auth.organizationId, userIds: memberIds }
              );
              return;
            }

            sendChatSocketError(ws, { requestId: event.requestId, code: "UNKNOWN_EVENT", message: "Unknown chat event." });
          } catch (error) {
            sendChatSocketError(ws, {
              requestId: event.requestId,
              code: error.code || "CHAT_EVENT_FAILED",
              message: error.message || "Chat event failed.",
            });
          }
        });

        ws.on("close", () => {
          chatClients.delete(ws);
          if (!connectedChatUserIds(auth.organizationId, [auth.user.id]).has(auth.user.id)) {
            broadcastChat(
              { type: "presence.updated", payload: { userId: auth.user.id, isOnline: false } },
              { organizationId: auth.organizationId }
            );
          }
        });
      });
    } catch {
      socket.destroy();
    }
  });

  httpServer.listen(PORT, "0.0.0.0", () => {
    startCurrencyRatesWorker(pool);
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
