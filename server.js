import express from "express";
import compression from "compression";
import path from "path";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import http from "node:http";
import { WebSocketServer } from "ws";
import {
  addChatThreadMember,
  assignTaskRecord,
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
  createChatAttachmentMessage,
  createBillingInvoice,
  createChatMessage,
  createChatMessageNotifications,
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
  createShipmentRecord,
  createAppErrorLog,
  createQuotationRecord,
  createShipmentTaskRecord,
  createTaskRecord,
  deleteSessionByToken,
  deleteAbandonedSignupRequest,
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
  getFeatureConfig,
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
  getSmsAnalytics,
  getDashboardData,
  getCustomerRecord,
  getBillingInvoice,
  getOrganizationDetail,
  getOrganizationBilling,
  getOrganizationSubscription,
  getUserById,
  getUserByEmail,
  getUserByPhone,
  getUserPermissions,
  getBillingPayment,
  getBillingPaymentByAuthority,
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
  listContactRequests,
  listCustomersDetailed,
  listDocuments,
  listFeatureRecords,
  listDueSoonCheques,
  listAppErrorLogs,
  listBillingInvoices,
  listBillingPayments,
  listRoles,
  listOrganizationMembers,
  listSignupRequests,
  listSmsDeliveries,
  listSmsTemplates,
  listSubscriptionPlans,
  listShipmentSteps,
  listTasks,
  listTaskEvents,
  markChatThreadRead,
  markChatAttachmentStorageCleanup,
  markBillingPaymentManually,
  markPaymentRequested,
  markPaymentVerifiedByAuthorityWithResult,
  pool,
  previewAppUserDeletion,
  replaceRecordsForUser,
  replaceDocumentFileRecord,
  recordImmediateSmsDelivery,
  reviewSignupRequest,
  resolveContactRequest,
  resolveAppErrorLog,
  removeChatThreadMember,
  requirePermission,
  renewOrganizationSubscription,
  grantUserPermission,
  restoreEntityRecord,
  revokeUserPermission,
  normalizeOperationalSearchQuery,
  searchOperationalRecords,
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
  moveShipmentToExitedArchive,
  updateMeetingRequiredDocument,
  updateQuotationRecord,
  restoreShipmentFromExitedArchive,
  updateShipmentOperationalFields,
  updateShipmentPostExitFields,
  updateShipmentPublicStatus,
  updateShipmentStepRecord,
  updateSmsTemplate,
  updateTaskRecord,
  updateTaskStatusRecord,
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
  deleteStoredChatAttachmentFiles,
  deleteStoredDocumentFiles,
  persistChatAttachmentFile,
  persistDocumentFile,
  sendStoredChatAttachment,
  sendStoredDocument,
  uploadChatAttachmentSingle,
  uploadSingle,
} from "./src/server/document-storage.js";
import {
  aiChatBodySchema,
  archiveEntityParamsSchema,
  billingPaymentStartParamsSchema,
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
  documentMetadataSchema,
  documentParamsSchema,
  documentVisibilitySchema,
  exitedShipmentArchiveBodySchema,
  exitedShipmentsListQuerySchema,
  organizationMembersQuerySchema,
  postExitUpdateBodySchema,
  shipmentCreateBodySchema,
  shipmentOperationalFieldsBodySchema,
  shipmentParamsSchema,
  shipmentProgressBlockerBodySchema,
  shipmentProgressCurrentBodySchema,
  shipmentProgressParamsSchema,
  shipmentProgressStartBodySchema,
  shipmentProgressUnblockBodySchema,
  shipmentPublicStatusBodySchema,
  shipmentStepParamsSchema,
  shipmentTaskBodySchema,
  signupRequestParamsSchema,
  taskAssignBodySchema,
  taskListQuerySchema,
  taskParamsSchema,
  taskStatusBodySchema,
} from "./src/server/request-schemas.js";
import { registerCustomerRoutes } from "./src/server/routes/customer-routes.js";
import { registerNotificationRoutes } from "./src/server/routes/notification-routes.js";
import { registerPublicTrackingRoutes } from "./src/server/routes/public-tracking-routes.js";
import { registerShipmentProgressRoutes } from "./src/server/routes/shipment-progress-routes.js";
import { registerDailyStatusRoutes } from "./src/server/routes/daily-status-routes.js";
import { registerBusinessEntityRoutes } from "./src/server/routes/business-entity-routes.js";
import { registerDocumentManagementCenterRoutes } from "./src/server/routes/document-management-center-routes.js";
import { registerShipmentV2Routes } from "./src/server/routes/shipment-v2-routes.js";
import { registerShipmentFormTemplateRoutes } from "./src/server/routes/shipment-form-template-routes.js";
import { registerShipmentWorkflowTemplateRoutes } from "./src/server/routes/shipment-workflow-template-routes.js";
import { registerUserRoutes } from "./src/server/routes/user-routes.js";
import { registerRatesRoutes } from "./src/server/routes/rates-routes.js";
import { registerChequeReadRoutes } from "./src/server/routes/cheque-read-routes.js";
import { registerQuotationReadRoutes } from "./src/server/routes/quotation-read-routes.js";
import {
  getChequeRecord as getChequeRecordFromRepository,
  listCheques as listChequesFromRepository,
} from "./src/server/repositories/cheques.js";
import {
  getComplianceMeetingRecord as getComplianceMeetingRecordFromRepository,
  listComplianceMeetings as listComplianceMeetingsFromRepository,
} from "./src/server/repositories/compliance-meetings.js";
import { listCustomerRelated as listCustomerRelatedFromRepository } from "./src/server/repositories/customers.js";
import {
  getShipmentOperationalRecord as getShipmentOperationalRecordFromRepository,
  listExitedShipmentRecords as listExitedShipmentRecordsFromRepository,
} from "./src/server/repositories/shipments.js";
import {
  getQuotationRecord as getQuotationRecordFromRepository,
  listQuotations as listQuotationsFromRepository,
} from "./src/server/repositories/quotations.js";
import { startShipmentWorkflow as startShipmentWorkflowRecord } from "./src/server/repositories/shipment-progress.js";
import { parseRequestValue } from "./src/server/validation.js";
import {
  attachTenantContext,
  findClientTenantIdentifiers,
  requireNoClientTenantScopeConflict,
  requireTenantContext,
} from "./src/server/tenant-context.js";
import {
  clearRateLimit,
  consumeRateLimit,
  consumeRateLimitKey,
  rateLimitKey,
} from "./src/server/rate-limit.js";
import { runStartupChecks, shouldTrustProxy } from "./src/server/startup-checks.js";
import { runSmsWorkerOnce, startSmsWorker } from "./src/server/sms-worker.js";
import { startCurrencyRatesWorker } from "./src/server/rates-worker.js";
import { sendSmsMessage } from "./src/server/sms-provider.js";
import { AI_MESSAGES, runAiChat } from "./src/server/ai/ai-orchestrator.js";

const listExitedShipmentRecords = ({ organizationId, filters = {} } = {}) =>
  listExitedShipmentRecordsFromRepository(pool, { organizationId, filters });
const getShipmentOperationalRecord = (shipmentId, { organizationId, includeCustomerPrivateDetails = true } = {}) =>
  getShipmentOperationalRecordFromRepository(pool, shipmentId, { organizationId, includeCustomerPrivateDetails });
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
const PHONE_LOGIN_REQUEST_COOLDOWN = { limit: 1, windowMs: 60 * 1000 };
const PHONE_LOGIN_REQUEST_LIMIT = { limit: 3, windowMs: 10 * 60 * 1000 };
const PHONE_LOGIN_REQUEST_IP_LIMIT = { limit: 10, windowMs: 60 * 60 * 1000 };
const PHONE_LOGIN_VERIFY_LIMIT = { limit: 6, windowMs: 15 * 60 * 1000 };
const DOCUMENT_DOWNLOAD_LIMIT = { limit: 60, windowMs: 10 * 60 * 1000 };
const PUBLIC_DOCUMENT_DOWNLOAD_LIMIT = { limit: 30, windowMs: 10 * 60 * 1000 };
const PUBLIC_TRACK_LOOKUP_LIMIT = { limit: 60, windowMs: 10 * 60 * 1000 };
const PUBLIC_TRACK_SEARCH_LIMIT = { limit: 20, windowMs: 15 * 60 * 1000 };
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
const ZARINPAL_MIN_AMOUNT_IRR = 10000;

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

function phoneSuffix(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits ? digits.slice(-4) : "";
}

function wantsRemember(body = {}) {
  return body.remember === true || body.remember === "true";
}

function hasPlatformAdminPermission(permissions = []) {
  return permissions.includes("platform.admin");
}

async function isPlatformAdminUser(user) {
  if (!user?.id) return false;
  const permissions = user.permissions || await getUserPermissions(user.id);
  user.permissions = permissions;
  return hasPlatformAdminPermission(permissions);
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

async function createAuthenticatedSessionResponse(req, res, user, { method = "password", auditMetadata = {} } = {}) {
  const remember = wantsRemember(req.body || {});
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

function normalizeZarinpalAmount(amount) {
  return Math.max(ZARINPAL_MIN_AMOUNT_IRR, Math.round(Number(amount || 0)));
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

async function canAccessTask(user, task, action = "view") {
  if (!task) return false;
  const taskOrganizationId = task.organization_id || task.organizationId;
  if (taskOrganizationId && taskOrganizationId !== user.organizationId) return false;
  const permissions = await getUserPermissions(user.id);
  const canViewAll = permissions.includes("tasks.view_all");
  const assignedToId = task.assigned_to_id || task.assignedToUserId;
  const assignedById = task.assigned_by_id || task.assignedByUserId;
  const ownerUserId = task.owner_user_id || task.ownerUserId;
  const isAssigned = assignedToId === user.id;
  const isCreator = ownerUserId === user.id || assignedById === user.id;
  if (canViewAll) return true;
  if (action === "status" && (isAssigned || isCreator)) return true;
  return permissions.includes("tasks.view_own") && (isAssigned || isCreator);
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
  app.use(compression());
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
      const params = parseRequestValue(res, billingPaymentStartParamsSchema, req.params);
      if (!params) return;
      if (!(await consumeRateLimit(req, res, "payment-start", {
        limit: 12,
        windowMs: 10 * 60 * 1000,
        discriminator: params.id,
      }))) return;
      const payment = await getBillingPayment(params.id);
      if (!payment) return createApiError(res, 404, "PAYMENT_NOT_FOUND", "Payment was not found.");
      if (!payment.signup_request_id || !payment.subscription_id || !payment.organization_id) {
        return createApiError(res, 404, "PAYMENT_NOT_FOUND", "Payment was not found.");
      }
      if (payment.status === "paid") return createApiError(res, 409, "PAYMENT_ALREADY_PAID", "Payment is already verified.");
      if (payment.status === "superseded") return createApiError(res, 409, "PAYMENT_SUPERSEDED", "A newer payment attempt is available for this signup.");
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
      if (payment.status === "paid") {
        return res.redirect(`/signup/pending?payment=paid&request=${encodeURIComponent(payment.signup_request_id || "")}`);
      }
      if (payment.status === "superseded") {
        return res.redirect(`/signup/pending?payment=failed&request=${encodeURIComponent(payment.signup_request_id || "")}`);
      }
      if (payment.status === "failed" && status.toUpperCase() !== "OK") {
        return res.redirect(`/signup/pending?payment=failed&request=${encodeURIComponent(payment.signup_request_id || "")}`);
      }
      const verification = await verifyZarinpalPayment(payment, authority, status);
      const result = await markPaymentVerifiedByAuthorityWithResult(authority, verification);
      const updated = result.payment;
      if (result.transitioned) {
        await auditLog({
          organizationId: updated?.organization_id,
          action: verification.ok ? "billing.payment_verified" : "billing.payment_failed",
          entityType: "billing_payment",
          entityId: updated?.id,
          summary: verification.ok ? "Payment was verified by Zarinpal." : "Payment verification failed.",
          after: { authority, refId: verification.refId, ok: verification.ok },
          requestContext: requestContext(req),
        });
      }
      const redirectStatus = updated?.status === "paid" ? "paid" : "failed";
      res.redirect(`/signup/pending?payment=${redirectStatus}&request=${encodeURIComponent(updated?.signup_request_id || "")}`);
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
      const email = String(req.body?.email || "").trim();
      const password = String(req.body?.password || "");
      const loginEmailKey = email.toLowerCase() || "missing";
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

      // TODO(phase-3): add Argon2id verification/rehash while preserving bcrypt login compatibility.
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

  app.post("/api/auth/phone/request-code", async (req, res) => {
    const rawPhone = String(req.body?.phone || "").trim();
    try {
      if (!rawPhone) {
        return createApiError(res, 400, "VALIDATION_ERROR", "Phone number is required.", "phone");
      }
      const ipAllowed = await consumeRateLimit(req, res, "phone-login-request-ip", {
        ...PHONE_LOGIN_REQUEST_IP_LIMIT,
        message: "Too many SMS login code requests. Please try again later.",
        field: "phone",
      });
      if (!ipAllowed) {
        await auditLog({
          actorType: "public",
          action: "auth.sms_code_request_rate_limited",
          entityType: "AUTH",
          summary: "SMS login code request was rate-limited by IP.",
          metadata: { reason: "ip_limit", phoneHash: auditIdentifierHash(rawPhone), phoneLast4: phoneSuffix(rawPhone) },
          requestContext: requestContext(req),
        });
        return;
      }

      const cooldownAllowed = await consumeRateLimit(req, res, "phone-login-request-cooldown", {
        ...PHONE_LOGIN_REQUEST_COOLDOWN,
        discriminator: rawPhone,
        message: "Please wait before requesting another SMS login code.",
        field: "phone",
      });
      if (!cooldownAllowed) {
        await auditLog({
          actorType: "public",
          action: "auth.sms_code_request_rate_limited",
          entityType: "AUTH",
          summary: "SMS login code request was rate-limited by cooldown.",
          metadata: { reason: "cooldown", phoneHash: auditIdentifierHash(rawPhone), phoneLast4: phoneSuffix(rawPhone) },
          requestContext: requestContext(req),
        });
        return;
      }

      const allowed = await consumeRateLimit(req, res, "phone-login-request", {
        ...PHONE_LOGIN_REQUEST_LIMIT,
        discriminator: rawPhone,
        message: "Too many SMS login code requests for this phone number. Please try again later.",
        field: "phone",
      });
      if (!allowed) {
        await auditLog({
          actorType: "public",
          action: "auth.sms_code_request_rate_limited",
          entityType: "AUTH",
          summary: "SMS login code request was rate-limited by phone.",
          metadata: { reason: "phone_limit", phoneHash: auditIdentifierHash(rawPhone), phoneLast4: phoneSuffix(rawPhone) },
          requestContext: requestContext(req),
        });
        return;
      }

      const user = await getUserByPhone(rawPhone);
      if (!user) {
        await auditLog({
          actorType: "public",
          action: "auth.sms_code_requested",
          entityType: "AUTH",
          summary: "SMS login code was requested for an unknown phone.",
          metadata: { knownUser: false, phoneHash: auditIdentifierHash(rawPhone), phoneLast4: phoneSuffix(rawPhone) },
          requestContext: requestContext(req),
        });
        return res.json({
          ok: true,
          data: {
            codeSent: false,
            message: "If this phone belongs to an active user, a login code will be sent.",
          },
        });
      }

      const loginBlock = await loginBlockForUser(user);
      if (loginBlock) {
        await auditLog({
          actorUserId: user.id,
          organizationId: user.organization_id || user.organizationId || null,
          action: "auth.sms_code_request_blocked",
          entityType: "AUTH",
          entityId: user.id,
          summary: "SMS login code request was blocked by account or subscription state.",
          metadata: { reason: loginBlock.code, phoneHash: auditIdentifierHash(rawPhone), phoneLast4: phoneSuffix(rawPhone) },
          requestContext: requestContext(req),
        });
        return sendLoginBlock(res, loginBlock);
      }

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
        await auditLog({
          actorUserId: user.id,
          organizationId: user.organization_id || user.organizationId || null,
          action: "auth.sms_code_requested",
          entityType: "LOGIN_SMS_CHALLENGE",
          entityId: challenge.id,
          summary: "SMS login code was requested.",
          metadata: {
            phoneHash: auditIdentifierHash(rawPhone),
            phoneLast4: phoneSuffix(rawPhone),
            providerStatus: providerResult.skipped ? "skipped" : "sent",
            skipReason: providerResult.reason || null,
          },
          requestContext: requestContext(req),
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
        await auditLog({
          actorUserId: user.id,
          organizationId: user.organization_id || user.organizationId || null,
          action: "auth.sms_code_request_failed",
          entityType: "LOGIN_SMS_CHALLENGE",
          entityId: challenge.id,
          summary: "SMS login code request failed.",
          metadata: {
            phoneHash: auditIdentifierHash(rawPhone),
            phoneLast4: phoneSuffix(rawPhone),
            errorCode: sendError.code || null,
          },
          requestContext: requestContext(req),
        });
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
        ...PHONE_LOGIN_VERIFY_LIMIT,
        discriminator: rawPhone,
        message: "Too many SMS code attempts. Please wait before trying again.",
        field: "code",
      });
      if (!allowed) {
        await auditLog({
          actorType: "public",
          action: "auth.sms_verify_rate_limited",
          entityType: "AUTH",
          summary: "SMS login verification was rate-limited.",
          metadata: { reason: "verify_limit", phoneHash: auditIdentifierHash(rawPhone), phoneLast4: phoneSuffix(rawPhone) },
          requestContext: requestContext(req),
        });
        return;
      }

      const result = await verifyLoginSmsChallenge({ phone: rawPhone, code });
      if (!result.ok || !result.user) {
        if (result.reason === "too_many_attempts") {
          res.setHeader("Retry-After", "300");
        }
        await auditLog({
          actorType: "public",
          action: "auth.sms_verify_failed",
          entityType: "AUTH",
          summary: "SMS login verification failed.",
          metadata: { reason: result.reason || "invalid_code", phoneHash: auditIdentifierHash(rawPhone), phoneLast4: phoneSuffix(rawPhone) },
          requestContext: requestContext(req),
        });
        return createApiError(
          res,
          result.reason === "too_many_attempts" ? 429 : 401,
          result.reason === "too_many_attempts" ? "SMS_CODE_LOCKED" : "INVALID_SMS_CODE",
          "Invalid or expired SMS code."
        );
      }

      const loginBlock = await loginBlockForUser(result.user);
      if (loginBlock) {
        await auditLog({
          actorUserId: result.user.id,
          organizationId: result.user.organization_id || result.user.organizationId || null,
          action: "auth.sms_verify_failed",
          entityType: "LOGIN_SMS_CHALLENGE",
          entityId: result.challengeId,
          summary: "SMS login verification was blocked by account or subscription state.",
          metadata: { reason: loginBlock.code, phoneHash: auditIdentifierHash(rawPhone), phoneLast4: phoneSuffix(rawPhone) },
          requestContext: requestContext(req),
        });
        return sendLoginBlock(res, loginBlock);
      }

      await clearRateLimit(rateLimitKey(req, "phone-login-verify", rawPhone));
      await auditLog({
        actorUserId: result.user.id,
        organizationId: result.user.organization_id || result.user.organizationId || null,
        action: "auth.sms_verify_success",
        entityType: "LOGIN_SMS_CHALLENGE",
        entityId: result.challengeId,
        summary: "SMS login verification succeeded.",
        metadata: { phoneHash: auditIdentifierHash(rawPhone), phoneLast4: phoneSuffix(rawPhone) },
        requestContext: requestContext(req),
      });
      await createAuthenticatedSessionResponse(req, res, result.user, {
        method: "sms",
        auditMetadata: { challengeId: result.challengeId, phoneHash: auditIdentifierHash(rawPhone), phoneLast4: phoneSuffix(rawPhone) },
      });
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

  app.get("/api/users/:userId/bootstrap", async (req, res) => {
    try {
      const tenantRequest = await requireAuthenticatedTenantUser(req, res, "compatibility bootstrap API");
      if (!tenantRequest) return;
      const { user, tenantContext, organizationId } = tenantRequest;
      const targetUser = req.params.userId === user.id ? user : await getUserById(req.params.userId);
      const targetOrganizationId = targetUser?.organizationId || targetUser?.organization_id;
      const sameOrganization = targetOrganizationId === organizationId;
      const canManageUsers = await userHasPermission(user, "users.manage");
      if (req.params.userId !== user.id && (!sameOrganization || !canManageUsers)) {
        return createApiError(res, 403, "FORBIDDEN", "You cannot load records for this user.");
      }
      const records = await getRecordsForUser(req.params.userId, { tenantContext });
      if (!records) return createApiError(res, 404, "NOT_FOUND", "User records were not found.");
      res.json({ records });
    } catch (error) {
      console.error("Bootstrap failed:", error);
      res.status(500).json({ message: "Could not load user records." });
    }
  });

  app.put("/api/users/:userId/records", async (req, res) => {
    try {
      const tenantRequest = await requireAuthenticatedTenantUser(req, res, "compatibility records API");
      if (!tenantRequest) return;
      const { user, tenantContext, organizationId } = tenantRequest;
      const targetUser = req.params.userId === user.id ? user : await getUserById(req.params.userId);
      const targetOrganizationId = targetUser?.organizationId || targetUser?.organization_id;
      const sameOrganization = targetOrganizationId === organizationId;
      const canManageUsers = await userHasPermission(user, "users.manage");
      if (req.params.userId !== user.id && (!sameOrganization || !canManageUsers)) {
        return createApiError(res, 403, "FORBIDDEN", "You cannot save records for this user.");
      }
      const result = await replaceRecordsForUser(req.params.userId, req.body?.records, { tenantContext });
      if (!result) return createApiError(res, 404, "NOT_FOUND", "User records were not found.");
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
        const tenantRequest = await requireAuthenticatedTenantUser(req, res, `${feature} list API`);
        if (!tenantRequest) return;
        const { user, organizationId } = tenantRequest;
        const config = getFeatureConfig(feature);
        await requirePermission(user, config.permission);
        const data = await listFeatureRecords(feature, {
          organizationId,
          includeCustomerPrivateDetails: user.role === "CEO",
        });
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

  app.post("/api/shipments", async (req, res) => {
    try {
      const tenantRequest = await requireAuthenticatedTenantUser(req, res, "shipment create API");
      if (!tenantRequest) return;
      const { user, tenantContext } = tenantRequest;
      await requirePermission(user, "shipments.create");
      const body = parseRequestValue(res, shipmentCreateBodySchema, req.body || {});
      if (!body) return;
      const data = await createShipmentRecord({
        ownerUserId: user.id,
        actorUserId: user.id,
        tenantContext,
        shipment: body,
        includeCustomerPrivateDetails: user.role === "CEO",
      });
      await auditLog({
        actorUserId: user.id,
        action: "shipment.create",
        entityType: "SHIPMENT",
        entityId: data.id,
        summary: "Shipment was created.",
        after: data,
        requestContext: requestContext(req),
      });
      res.status(201).json({ ok: true, data });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      if (error.statusCode === 404) return createApiError(res, 404, error.code || "NOT_FOUND", error.message);
      if (error.statusCode === 409) return createApiError(res, 409, error.code || "CONFLICT", error.message, "trackingNumber");
      console.error("Create shipment failed:", error);
      createApiError(res, 500, "CREATE_SHIPMENT_FAILED", "Could not create shipment.");
    }
  });

  app.get("/api/shipments/exited", async (req, res) => {
    try {
      const tenantRequest = await requireAuthenticatedTenantUser(req, res, "exited shipments list API");
      if (!tenantRequest) return;
      const { user, organizationId } = tenantRequest;
      await requirePermission(user, "shipments.view_all");
      const query = parseRequestValue(res, exitedShipmentsListQuerySchema, req.query || {});
      if (!query) return;
      const data = await listExitedShipmentRecords({
        organizationId,
        filters: query,
      });
      res.json({ ok: true, data });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      console.error("List exited shipments failed:", error);
      createApiError(res, 500, "EXITED_SHIPMENTS_LIST_FAILED", "Could not load exited shipments.");
    }
  });

  app.post("/api/shipments/:id/exited-archive", async (req, res) => {
    try {
      const tenantRequest = await requireAuthenticatedTenantUser(req, res, "exited shipment archive API");
      if (!tenantRequest) return;
      const { user, organizationId } = tenantRequest;
      await requirePermission(user, "shipments.archive");
      const params = parseRequestValue(res, shipmentParamsSchema, req.params);
      if (!params) return;
      const body = parseRequestValue(res, exitedShipmentArchiveBodySchema, req.body || {});
      if (!body) return;
      const result = await moveShipmentToExitedArchive(params.id, {
        organizationId,
        actorUserId: user.id,
        reason: body.reason,
      });
      if (!result) return createApiError(res, 404, "NOT_FOUND", "Shipment was not found.");
      await auditLog({
        actorUserId: user.id,
        organizationId,
        action: "shipment.exited_archive",
        entityType: "SHIPMENT",
        entityId: params.id,
        summary: "Shipment was moved to exited archive.",
        before: result.before,
        after: result.after,
        metadata: {
          reason: body.reason || null,
          previousPostExitStatus: result.before?.postExitStatus || null,
          newPostExitStatus: result.after?.postExitStatus || null,
        },
        requestContext: requestContext(req),
      });
      res.json({ ok: true, data: result.after });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      console.error("Move shipment to exited archive failed:", error);
      createApiError(res, 500, "EXITED_SHIPMENT_ARCHIVE_FAILED", "Could not move shipment to exited archive.");
    }
  });

  app.post("/api/shipments/:id/exited-restore", async (req, res) => {
    try {
      const tenantRequest = await requireAuthenticatedTenantUser(req, res, "exited shipment restore API");
      if (!tenantRequest) return;
      const { user, organizationId } = tenantRequest;
      await requirePermission(user, "shipments.archive");
      const params = parseRequestValue(res, shipmentParamsSchema, req.params);
      if (!params) return;
      const result = await restoreShipmentFromExitedArchive(params.id, {
        organizationId,
        actorUserId: user.id,
      });
      if (!result) return createApiError(res, 404, "NOT_FOUND", "Shipment was not found.");
      await auditLog({
        actorUserId: user.id,
        organizationId,
        action: "shipment.exited_restore",
        entityType: "SHIPMENT",
        entityId: params.id,
        summary: "Shipment was restored from exited archive.",
        before: result.before,
        after: result.after,
        metadata: {
          previousPostExitStatus: result.before?.postExitStatus || null,
          newPostExitStatus: result.after?.postExitStatus || null,
        },
        requestContext: requestContext(req),
      });
      res.json({ ok: true, data: result.after });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      console.error("Restore exited shipment failed:", error);
      createApiError(res, 500, "EXITED_SHIPMENT_RESTORE_FAILED", "Could not restore shipment from exited archive.");
    }
  });

  app.patch("/api/shipments/:id/post-exit", async (req, res) => {
    try {
      const tenantRequest = await requireAuthenticatedTenantUser(req, res, "shipment post-exit update API");
      if (!tenantRequest) return;
      const { user, organizationId } = tenantRequest;
      await requirePermission(user, "shipments.update");
      const params = parseRequestValue(res, shipmentParamsSchema, req.params);
      if (!params) return;
      const body = parseRequestValue(res, postExitUpdateBodySchema, req.body || {});
      if (!body) return;
      const result = await updateShipmentPostExitFields(params.id, body, {
        organizationId,
        actorUserId: user.id,
      });
      if (!result) return createApiError(res, 404, "NOT_FOUND", "Shipment was not found.");
      await auditLog({
        actorUserId: user.id,
        organizationId,
        action: "shipment.post_exit_update",
        entityType: "SHIPMENT",
        entityId: params.id,
        summary: "Shipment post-exit follow-up was updated.",
        before: result.before,
        after: result.after,
        metadata: {
          previousPostExitStatus: result.before?.postExitStatus || null,
          newPostExitStatus: result.after?.postExitStatus || null,
          noteUpdated: body.postExitNote !== undefined,
          followUpUpdated: body.postExitFollowUpAt !== undefined,
        },
        requestContext: requestContext(req),
      });
      res.json({ ok: true, data: result.after });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      if (error.statusCode === 404) return createApiError(res, 404, error.code || "NOT_FOUND", error.message);
      if (error.statusCode === 409) return createApiError(res, 409, error.code || "CONFLICT", error.message);
      console.error("Update shipment post-exit fields failed:", error);
      createApiError(res, 500, "SHIPMENT_POST_EXIT_UPDATE_FAILED", "Could not update post-exit follow-up.");
    }
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

  app.get("/api/shipments/:id", async (req, res) => {
    try {
      const tenantRequest = await requireAuthenticatedTenantUser(req, res, "shipment get API");
      if (!tenantRequest) return;
      const { user, organizationId } = tenantRequest;
      await requirePermission(user, "shipments.view_all");
      const params = parseRequestValue(res, shipmentParamsSchema, req.params);
      if (!params) return;
      const data = await getShipmentOperationalRecord(params.id, {
        organizationId,
        includeCustomerPrivateDetails: user.role === "CEO",
      });
      if (!data) return createApiError(res, 404, "NOT_FOUND", "Shipment was not found.");
      res.json({ ok: true, data });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      console.error("Get shipment failed:", error);
      createApiError(res, 500, "GET_SHIPMENT_FAILED", "Could not load shipment.");
    }
  });

  async function updateShipmentOperationalEndpoint(req, res) {
    try {
      const tenantRequest = await requireAuthenticatedTenantUser(req, res, "shipment operational update API");
      if (!tenantRequest) return;
      const { user, organizationId } = tenantRequest;
      await requirePermission(user, "shipments.update");
      const params = parseRequestValue(res, shipmentParamsSchema, req.params);
      if (!params) return;
      const body = parseRequestValue(res, shipmentOperationalFieldsBodySchema, req.body || {});
      if (!body) return;
      const result = await updateShipmentOperationalFields(params.id, body, {
        organizationId,
        actorUserId: user.id,
        includeCustomerPrivateDetails: user.role === "CEO",
      });
      if (!result) return createApiError(res, 404, "NOT_FOUND", "Shipment was not found.");
      await auditLog({
        actorUserId: user.id,
        action: body.status && body.status !== result.before?.status ? "shipment.status.update" : "shipment.update",
        entityType: "SHIPMENT",
        entityId: params.id,
        summary: "Shipment operational fields were updated.",
        before: result.before,
        after: result.after,
        requestContext: requestContext(req),
      });
      res.json({ ok: true, data: result.after });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      if (error.statusCode === 404) return createApiError(res, 404, error.code || "NOT_FOUND", error.message);
      if (error.statusCode === 409) return createApiError(res, 409, error.code || "CONFLICT", error.message, "trackingNumber");
      console.error("Update shipment failed:", error);
      createApiError(res, 500, "UPDATE_SHIPMENT_FAILED", "Could not update shipment.");
    }
  }

  app.patch("/api/shipments/:id/operational-fields", updateShipmentOperationalEndpoint);
  app.patch("/api/shipments/:id", updateShipmentOperationalEndpoint);

  app.get("/api/search", async (req, res) => {
    const startedAt = Date.now();
    const type = String(req.query.type || "all");
    const limit = req.query.limit || 20;
    const offset = req.query.offset || 0;
    const normalizedQuery = normalizeOperationalSearchQuery(req.query.q || "");

    try {
      const tenantRequest = await requireAuthenticatedTenantUser(req, res, "search API");
      if (!tenantRequest) return;
      const { user, tenantContext } = tenantRequest;

      if (!normalizedQuery) {
        return createApiError(res, 400, "SEARCH_QUERY_REQUIRED", "Search query is required.", "q");
      }
      if (normalizedQuery.length < 2) {
        return createApiError(res, 400, "SEARCH_QUERY_TOO_SHORT", "Search query must be at least 2 characters.", "q");
      }

      const data = await searchOperationalRecords({
        user,
        tenantContext,
        q: normalizedQuery,
        type,
        limit,
        offset,
      });

      if (process.env.QA_SEARCH_LOGS === "true" || process.env.QA_MODE) {
        console.info("Search query completed", {
          queryLength: normalizedQuery.length,
          type,
          limit: data.limit,
          offset: data.offset,
          resultCount: data.results.length,
          total: data.total,
          durationMs: Date.now() - startedAt,
          statusCode: 200,
        });
      }

      res.json(data);
    } catch (error) {
      if (process.env.QA_SEARCH_LOGS === "true" || process.env.QA_MODE) {
        console.info("Search query failed", {
          queryLength: normalizedQuery.length,
          type,
          durationMs: Date.now() - startedAt,
          statusCode: error.statusCode || 500,
        });
      }
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      console.error("Global search failed:", error);
      createApiError(res, 500, "SEARCH_FAILED", "Could not run search.");
    }
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

  registerShipmentV2Routes(app, {
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
    grantUserPermission,
    listAppUsers,
    listRoles,
    previewAppUserDeletion,
    requestContext,
    requireAuthenticatedUser,
    requireCompanyCeo,
    requirePermission,
    requirePlatformAdmin,
    requireTenantContext: requireRequestTenant,
    revokeUserPermission,
    updateAppUserRecord,
    updateUserPassword,
  });

  registerRatesRoutes(app, {
    auditLog,
    createApiError,
    pool,
    requestContext,
    requireAuthenticatedUser,
    requirePlatformAdmin,
  });

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

  // Platform-admin boundary: organizationId filters below are privileged admin targeting
  // after requirePlatformAdmin, not tenant scope for normal protected APIs.
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
      const data = await markBillingPaymentManually(req.params.id, {
        actorUserId: user.id,
        status: "paid",
        note: req.body?.note,
        audit: {
          actorUserId: user.id,
          action: "billing.payment_manual_paid",
          entityType: "billing_payment",
          entityId: req.params.id,
          summary: "Payment was manually marked paid.",
          requestContext: requestContext(req),
        },
      });
      if (!data) return createApiError(res, 404, "NOT_FOUND", "Payment was not found.");
      res.json({ ok: true, data });
    } catch (error) {
      createApiError(res, 500, "PAYMENT_MARK_PAID_FAILED", "Could not mark payment paid.");
    }
  });

  app.post("/api/admin/billing/payments/:id/mark-failed", async (req, res) => {
    try {
      const user = await requirePlatformAdmin(req, res);
      if (!user) return;
      const data = await markBillingPaymentManually(req.params.id, {
        actorUserId: user.id,
        status: "failed",
        note: req.body?.note,
        audit: {
          actorUserId: user.id,
          action: "billing.payment_manual_failed",
          entityType: "billing_payment",
          entityId: req.params.id,
          summary: "Payment was manually marked failed.",
          requestContext: requestContext(req),
        },
      });
      if (!data) return createApiError(res, 404, "NOT_FOUND", "Payment was not found.");
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

  app.delete("/api/admin/signup-requests/:id/abandoned", async (req, res) => {
    try {
      const user = await requirePlatformAdmin(req, res);
      if (!user) return;
      const params = parseRequestValue(res, signupRequestParamsSchema, req.params);
      if (!params) return;
      const data = await deleteAbandonedSignupRequest(params.id, { actorUserId: user.id });
      if (!data) return createApiError(res, 404, "NOT_FOUND", "Signup request was not found.");
      await auditLog({
        actorUserId: user.id,
        action: "signup.abandoned_delete",
        entityType: "signup_request",
        entityId: params.id,
        summary: "Abandoned unpaid signup was deleted and the owner email was released.",
        after: data,
        requestContext: requestContext(req),
      });
      res.json({ ok: true, data });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      if (error.statusCode === 409) {
        return res.status(409).json({
          ok: false,
          error: {
            code: error.code || "ABANDONED_SIGNUP_DELETE_BLOCKED",
            message: error.message || "This signup cannot be deleted.",
            blockers: error.blockers || [],
          },
        });
      }
      console.error("Abandoned signup delete failed:", error);
      createApiError(res, 500, "ABANDONED_SIGNUP_DELETE_FAILED", "Could not delete abandoned signup.");
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

  registerQuotationReadRoutes(app, {
    createApiError,
    getQuotationRecord,
    listQuotations,
    requireAuthenticatedTenantUser,
    requirePermission,
  });

  app.post("/api/quotations", async (req, res) => {
    try {
      const tenantRequest = await requireAuthenticatedTenantUser(req, res, "quotation create API");
      if (!tenantRequest) return;
      const { user, tenantContext } = tenantRequest;
      await requirePermission(user, "quotations.manage");
      if (!req.body?.customerName) return createApiError(res, 400, "VALIDATION_FAILED", "Customer name is required.", "customerName");
      const created = await createQuotationRecord({
        ownerUserId: user.id,
        actorUserId: user.id,
        tenantContext,
        quote: req.body,
        includeCustomerPrivateDetails: user.role === "CEO",
      });
      await auditLog({ actorUserId: user.id, action: "quotation.create", entityType: "quotation", entityId: created.id, summary: "Quotation was created.", after: created, requestContext: requestContext(req) });
      res.status(201).json({ ok: true, data: created });
    } catch (error) {
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      if (error.code === "23505") return createApiError(res, 409, "DUPLICATE_QUOTATION", "Quotation number already exists.");
      console.error("Create quotation failed:", error);
      createApiError(res, 500, "QUOTATION_CREATE_FAILED", "Could not create quotation.");
    }
  });

  app.patch("/api/quotations/:id", async (req, res) => {
    try {
      const tenantRequest = await requireAuthenticatedTenantUser(req, res, "quotation update API");
      if (!tenantRequest) return;
      const { user, organizationId } = tenantRequest;
      await requirePermission(user, "quotations.manage");
      const result = await updateQuotationRecord(req.params.id, req.body || {}, {
        organizationId,
        includeCustomerPrivateDetails: user.role === "CEO",
      });
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
        const tenantRequest = await requireAuthenticatedTenantUser(req, res, `quotation ${pathName} API`);
        if (!tenantRequest) return;
        const { user, organizationId } = tenantRequest;
        await requirePermission(user, "quotations.manage");
        const result = await setQuotationStatus(req.params.id, status, req.body || {}, {
          organizationId,
          includeCustomerPrivateDetails: user.role === "CEO",
        });
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
      const tenantRequest = await requireAuthenticatedTenantUser(req, res, "quotation convert API");
      if (!tenantRequest) return;
      const { user, organizationId } = tenantRequest;
      await requirePermission(user, "quotations.manage");
      const result = await convertQuotationToShipment(req.params.id, user.id, {
        organizationId,
        includeCustomerPrivateDetails: user.role === "CEO",
      });
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
        return createApiError(res, 413, "FILE_TOO_LARGE", "حجم فایل بیش از حد مجاز است", "file");
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
      if (assignedToUserId !== user.id) {
        await requirePermission(user, "tasks.assign");
      }
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

  app.get("/api/documents", async (req, res) => {
    try {
      const tenantRequest = await requireAuthenticatedTenantUser(req, res, "documents list API");
      if (!tenantRequest) return;
      const { user, organizationId } = tenantRequest;
      await requirePermission(user, "documents.view_all");
      const data = await listDocuments({
        organizationId,
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
      const tenantRequest = await requireAuthenticatedTenantUser(req, res, "document upload API");
      if (!tenantRequest) return;
      const { user, tenantContext, organizationId } = tenantRequest;
      await requirePermission(user, "documents.upload");
      if (!(await consumeRateLimit(req, res, "document-upload", {
        limit: 20,
        windowMs: 15 * 60 * 1000,
        discriminator: user.id,
      }))) return;
      await uploadSingle(req, res);
      const metadata = parseRequestValue(res, documentMetadataSchema, req.body || {});
      if (!metadata) return;

      await validateDocumentAssociations({
        shipmentId: metadata.shipmentId || null,
        customerId: metadata.customerId || null,
        organizationId,
      });

      const persisted = await persistDocumentFile(req.file, { organizationId });
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
          tenantContext,
          title: metadata.title || persisted.sanitizedName,
          type: metadata.type || "OTHER",
          fileName: persisted.sanitizedName,
          mimeType: persisted.mimeType,
          fileSize: persisted.fileSize,
          storageKey: persisted.storageKey,
          storageProvider: persisted.storageProvider,
          objectKey: persisted.objectKey,
          storageBucket: persisted.storageBucket,
          storageRegion: persisted.storageRegion,
          localPath: persisted.localPath,
          checksum: persisted.checksum,
          checksumSha256: persisted.checksumSha256,
          sizeBytes: persisted.sizeBytes,
          contentType: persisted.contentType,
          storageMigratedAt: persisted.storageMigratedAt,
          storageVerifiedAt: persisted.storageVerifiedAt,
          storageMigrationStatus: persisted.storageMigrationStatus,
          storageMigrationError: persisted.storageMigrationError,
          uploadedById: user.id,
          uploadedByName: user.name,
          shipmentId: metadata.shipmentId || null,
          customerId: metadata.customerId || null,
          note: metadata.note || "",
          visibility: metadata.visibility,
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
        metadata: documentStorageAuditMetadata(persisted),
        requestContext: requestContext(req),
      });

      res.json({ ok: true, data: sanitizeDocumentForApi(document) });
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
      const params = parseRequestValue(res, documentParamsSchema, req.params);
      if (!params) return;
      const data = await getDocumentDetail(params.id, { organizationId: user.organizationId });
      if (!data) {
        return createApiError(res, 404, "NOT_FOUND", "Document was not found.");
      }
      res.json({ ok: true, data: sanitizeDocumentForApi(data) });
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
      const params = parseRequestValue(res, documentParamsSchema, req.params);
      if (!params) return;
      if (!(await consumeRateLimit(req, res, "document-download", {
        ...DOCUMENT_DOWNLOAD_LIMIT,
        discriminator: user.id,
      }))) return;
      const document = await getDocumentForDownload(params.id, { organizationId: user.organizationId });
      if (!document) {
        await auditLog({
          actorUserId: user.id,
          organizationId: user.organizationId,
          action: "document.download_denied",
          entityType: "DOCUMENT",
          entityId: params.id,
          summary: "Internal document download was denied.",
          metadata: { reason: "not_found_or_forbidden" },
          requestContext: requestContext(req),
        });
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
      const params = parseRequestValue(res, documentParamsSchema, req.params);
      if (!params) return;
      const metadata = parseRequestValue(res, documentMetadataSchema, req.body || {});
      if (!metadata) return;
      await validateDocumentAssociations({
        shipmentId: metadata.shipmentId || null,
        customerId: metadata.customerId || null,
        organizationId: user.organizationId,
      });
      const result = await updateDocumentMetadata(
        params.id,
        {
          title: metadata.title,
          type: metadata.type,
          shipmentId: metadata.shipmentId,
          customerId: metadata.customerId,
          visibility: metadata.visibility,
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
        entityId: params.id,
        summary: "Document metadata was updated.",
        before: sanitizeDocumentForApi(result.before),
        after: sanitizeDocumentForApi(result.after),
        requestContext: requestContext(req),
      });
      res.json({ ok: true, data: sanitizeDocumentForApi(result.after) });
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
      const params = parseRequestValue(res, documentParamsSchema, req.params);
      if (!params) return;
      if (!(await consumeRateLimit(req, res, "document-replace", {
        limit: 20,
        windowMs: 15 * 60 * 1000,
        discriminator: user.id,
      }))) return;
      await uploadSingle(req, res);

      const persisted = await persistDocumentFile(req.file, { organizationId: user.organizationId });
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
          documentId: params.id,
          fileName: persisted.sanitizedName,
          mimeType: persisted.mimeType,
          fileSize: persisted.fileSize,
          storageKey: persisted.storageKey,
          storageProvider: persisted.storageProvider,
          objectKey: persisted.objectKey,
          storageBucket: persisted.storageBucket,
          storageRegion: persisted.storageRegion,
          localPath: persisted.localPath,
          checksum: persisted.checksum,
          checksumSha256: persisted.checksumSha256,
          sizeBytes: persisted.sizeBytes,
          contentType: persisted.contentType,
          storageMigratedAt: persisted.storageMigratedAt,
          storageVerifiedAt: persisted.storageVerifiedAt,
          storageMigrationStatus: persisted.storageMigrationStatus,
          storageMigrationError: persisted.storageMigrationError,
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
        entityId: params.id,
        summary: "Document file was replaced.",
        before: { id: result.before.id, version: result.before.version, fileName: result.before.file_name },
        after: { id: result.after.id, version: result.after.version, fileName: result.after.file_name },
        metadata: documentStorageAuditMetadata(persisted),
        requestContext: requestContext(req),
      });
      res.json({ ok: true, data: sanitizeDocumentForApi(result.after) });
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
      const params = parseRequestValue(res, documentParamsSchema, req.params);
      if (!params) return;
      const result = await archiveDocumentRecord(params.id, {
        organizationId: user.organizationId,
        actorUserId: user.id,
      });
      if (!result) {
        return createApiError(res, 404, "NOT_FOUND", "Document was not found.");
      }
      await auditLog({
        actorUserId: user.id,
        action: "document.archive",
        entityType: "DOCUMENT",
        entityId: params.id,
        summary: "Document was archived.",
        before: sanitizeDocumentForApi(result.before),
        after: sanitizeDocumentForApi(result.after),
        requestContext: requestContext(req),
      });
      res.json({ ok: true, data: sanitizeDocumentForApi(result.after) });
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
      const params = parseRequestValue(res, shipmentParamsSchema, req.params);
      if (!params) return;
      const data = await listDocuments({ organizationId: user.organizationId, shipmentId: params.id });
      res.json({ ok: true, data });
    } catch (error) {
      if (error.statusCode === 403) {
        return createApiError(res, 403, "FORBIDDEN", error.message);
      }
      console.error("List shipment documents failed:", error);
      createApiError(res, 500, "LIST_SHIPMENT_DOCUMENTS_FAILED", "Could not load shipment documents.");
    }
  });

  app.get("/api/shipments/:id/customer-access", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      await requirePermission(user, "customer_access.manage");
      const params = parseRequestValue(res, shipmentParamsSchema, req.params);
      if (!params) return;
      const data = await getShipmentCustomerAccess(params.id, { organizationId: user.organizationId, ownerUserId: user.id });
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
      const params = parseRequestValue(res, shipmentParamsSchema, req.params);
      if (!params) return;
      const result = await generateShipmentCustomerAccess(params.id, {
        organizationId: user.organizationId,
        ownerUserId: user.id,
        rotate: false,
        audit: {
          actorUserId: user.id,
          action: "customer_access.generate",
          entityType: "SHIPMENT",
          entityId: params.id,
          summary: "Customer tracking access was generated.",
          requestContext: requestContext(req),
        },
      });
      if (!result) {
        return createApiError(res, 404, "NOT_FOUND", "Shipment was not found.");
      }
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
      const params = parseRequestValue(res, shipmentParamsSchema, req.params);
      if (!params) return;
      const result = await generateShipmentCustomerAccess(params.id, {
        organizationId: user.organizationId,
        ownerUserId: user.id,
        audit: {
          actorUserId: user.id,
          action: "customer_access.reset",
          entityType: "SHIPMENT",
          entityId: params.id,
          summary: "Customer tracking access was reset.",
          requestContext: requestContext(req),
        },
      });
      if (!result) {
        return createApiError(res, 404, "NOT_FOUND", "Shipment was not found.");
      }
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
      const params = parseRequestValue(res, shipmentParamsSchema, req.params);
      if (!params) return;
      const result = await disableShipmentCustomerAccess(params.id, {
        organizationId: user.organizationId,
        ownerUserId: user.id,
        audit: {
          actorUserId: user.id,
          action: "customer_access.disable",
          entityType: "SHIPMENT",
          entityId: params.id,
          summary: "Customer tracking access was disabled.",
          requestContext: requestContext(req),
        },
      });
      if (!result) {
        return createApiError(res, 404, "NOT_FOUND", "Shipment was not found.");
      }
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
      const params = parseRequestValue(res, shipmentParamsSchema, req.params);
      if (!params) return;
      const body = parseRequestValue(res, shipmentPublicStatusBodySchema, req.body || {});
      if (!body) return;
      const event = await updateShipmentPublicStatus({
        shipmentId: params.id,
        publicLabel: body.publicLabel,
        publicDescription: body.publicDescription || "",
        isCustomerVisible: body.isCustomerVisible !== false,
        createdById: user.id,
        organizationId: user.organizationId,
        ownerUserId: user.id,
      });
      if (!event) {
        return createApiError(res, 404, "NOT_FOUND", "Shipment was not found.");
      }
      await auditLog({
        actorUserId: user.id,
        action: "shipment.public_status.update",
        entityType: "SHIPMENT",
        entityId: params.id,
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
      const params = parseRequestValue(res, documentParamsSchema, req.params);
      if (!params) return;
      const body = parseRequestValue(res, documentVisibilitySchema, req.body || {});
      if (!body) return;
      const result = await updateDocumentVisibility(params.id, body.visibility, {
        organizationId: user.organizationId,
        audit: {
          actorUserId: user.id,
          action: "document.visibility.update",
          entityType: "DOCUMENT",
          entityId: params.id,
          summary: "Document customer visibility was updated.",
          requestContext: requestContext(req),
        },
      });
      if (!result) {
        return createApiError(res, 404, "NOT_FOUND", "Document was not found.");
      }
      res.json({ ok: true, data: sanitizeDocumentForApi(result.after) });
    } catch (error) {
      if (error.statusCode === 403) {
        return createApiError(res, 403, "FORBIDDEN", error.message);
      }
      console.error("Document visibility update failed:", error);
      createApiError(res, 500, "DOCUMENT_VISIBILITY_FAILED", "Could not update document visibility.");
    }
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
    publicTrackSearchLimit: PUBLIC_TRACK_SEARCH_LIMIT,
    requestContext,
    searchPublicTracking,
    sendStoredDocument,
  });

  app.get("/api/audit-logs", async (req, res) => {
    try {
      const tenantRequest = await requireAuthenticatedTenantUser(req, res, "audit log list API");
      if (!tenantRequest) return;
      const { user, organizationId } = tenantRequest;
      await requirePermission(user, "changes.view");
      const data = await listAuditLogs({
        organizationId,
        limit: req.query.limit,
        eventType: req.query.eventType || undefined,
        resourceType: req.query.resourceType || undefined,
        resourceId: req.query.resourceId || undefined,
      });
      res.json({ ok: true, data });
    } catch (error) {
      if (error.statusCode === 403) {
        return createApiError(res, 403, "FORBIDDEN", error.message);
      }
      console.error("List audit logs failed:", error);
      createApiError(res, 500, "LIST_AUDIT_LOGS_FAILED", "Could not load audit logs.");
    }
  });

  app.get("/api/admin/audit-logs", async (req, res) => {
    try {
      const admin = await requirePlatformAdmin(req, res);
      if (!admin) return;
      const data = await listAuditLogs({
        organizationId: req.query.organizationId === undefined ? undefined : String(req.query.organizationId || ""),
        actorUserId: req.query.actorUserId || undefined,
        eventType: req.query.eventType || undefined,
        resourceType: req.query.resourceType || undefined,
        resourceId: req.query.resourceId || undefined,
        limit: req.query.limit,
      });
      res.json({ ok: true, data });
    } catch (error) {
      if (error.statusCode === 403) {
        return createApiError(res, 403, "FORBIDDEN", error.message);
      }
      console.error("List platform audit logs failed:", error);
      createApiError(res, 500, "LIST_PLATFORM_AUDIT_LOGS_FAILED", "Could not load platform audit logs.");
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
    startSmsWorker();
    startCurrencyRatesWorker(pool);
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
