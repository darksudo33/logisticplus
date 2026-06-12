import crypto from "node:crypto";
import pg from "pg";
import {
  getPublicDocument as getPublicDocumentFromRepository,
  getPublicDocumentByTrackingToken as getPublicDocumentByTrackingTokenFromRepository,
  getPublicTrackingTokenAuditState as getPublicTrackingTokenAuditStateFromRepository,
  getPublicTrackingByToken as getPublicTrackingByTokenFromRepository,
  searchPublicTracking as searchPublicTrackingFromRepository,
} from "./public-tracking.js";
import {
  markPaymentVerifiedByAuthority as markPaymentVerifiedByAuthorityInRepository,
} from "./repositories/billing.js";
import {
  DEFAULT_SHIPMENT_TYPE_CODE,
  normalizeShipmentTypeCode,
  shipmentTypeByCode,
} from "../shared/shipment-form-fields.js";
import {
  getDocumentDetail as getDocumentDetailFromRepository,
  getDocumentForDownload as getDocumentForDownloadFromRepository,
  listDocuments as listDocumentsFromRepository,
  listDocumentStorageKeysForCleanup as listDocumentStorageKeysForCleanupFromRepository,
} from "./repositories/documents.js";
import {
  canViewCustomerPrivateDetails,
  getCustomerRecord as getCustomerRecordFromRepository,
  listCustomerPhoneNumbers,
  listCustomersDetailed as listCustomersDetailedFromRepository,
  toUiCustomer as toUiCustomerFromRepository,
} from "./repositories/customers.js";
import {
  getShipmentRecord as getShipmentRecordFromRepository,
  listShipmentRecords as listShipmentRecordsFromRepository,
} from "./repositories/shipments.js";
import {
  parseShipmentCode,
  resolveManualShipmentCode,
  SHIPMENT_CODE_ERRORS,
} from "./shipment-codes.js";
import {
  previewUserDeletion as previewUserDeletionFromRepository,
} from "./repositories/users.js";
import { DEFAULT_SMS_TEMPLATE_MAP, renderSmsTemplateBody } from "./sms-templates.js";
import { organizationIdFromTenantContext, organizationScopeClause, requireOrganizationScope } from "./tenant-scope.js";
import { withTransaction } from "./transaction.js";

const { Pool } = pg;

const connectionString =
  process.env.DATABASE_URL || "postgres://postgres@localhost:5432/logisticplus";

export const pool = new Pool({ connectionString });

const TRANSIENT_SESSION_HOURS = 12;
const REMEMBER_SESSION_DAYS = 30;
const LOGIN_SMS_CODE_TTL_MINUTES = 5;
const LOGIN_SMS_MAX_ATTEMPTS = 5;
const QUOTATIONS_UI_SURFACE_ENABLED = false;

export function hashSessionToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function createApiError(res, status, code, message, field) {
  return res.status(status).json({
    ok: false,
    error: { code, message, ...(field ? { field } : {}) },
  });
}

export async function checkDatabase() {
  const result = await pool.query("SELECT NOW() AS now");
  return result.rows[0];
}

export async function getUserByEmail(email) {
  const result = await pool.query(
    `SELECT u.id, u.name, u.email, u.password_hash, u.role, u.avatar, u.is_online, u.department, u.status, u.last_seen_at,
            u.phone, u.location, u.bio, u.two_factor_enabled, u.notification_preferences,
            u.organization_id,
            o.status AS organization_status,
            o.name AS organization_name,
            o.plan_id AS organization_plan_id,
            os.status AS subscription_status
     FROM app_users u
     LEFT JOIN organizations o ON o.id = u.organization_id
     LEFT JOIN organization_subscriptions os ON os.organization_id = o.id
     WHERE lower(u.email) = lower($1)
     LIMIT 1`,
    [email]
  );
  return result.rows[0] || null;
}

function normalizeDigits(value) {
  const persianDigits = "۰۱۲۳۴۵۶۷۸۹";
  const arabicDigits = "٠١٢٣٤٥٦٧٨٩";
  return String(value || "").replace(/[۰-۹٠-٩]/g, (digit) => {
    const persianIndex = persianDigits.indexOf(digit);
    if (persianIndex >= 0) return String(persianIndex);
    const arabicIndex = arabicDigits.indexOf(digit);
    return arabicIndex >= 0 ? String(arabicIndex) : digit;
  });
}

function phoneDigitsSql(columnExpression) {
  return `regexp_replace(translate(COALESCE(${columnExpression}, ''), '۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩', '01234567890123456789'), '\\D', '', 'g')`;
}

const SEARCH_REQUEST_TYPES = new Set([
  "all",
  "shipments",
  "customers",
  "documents",
  "tasks",
  "archive",
  "tracking",
  "users",
]);
const SEARCH_TYPES_FOR_ALL = ["shipments", "customers", "documents", "tasks", "tracking", "users"];
const MAX_SEARCH_LIMIT = 50;
const MAX_SEARCH_OFFSET = 500;

export function normalizeOperationalSearchQuery(value) {
  return normalizeDigits(value)
    .replace(/\u064a/g, "\u06cc")
    .replace(/\u0649/g, "\u06cc")
    .replace(/\u0643/g, "\u06a9")
    .replace(/[\u200c\u200d\u200e\u200f\u00a0]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizedSearchSql(expression) {
  let sql = `translate(COALESCE(${expression}, ''), '۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩', '01234567890123456789')`;
  sql = `replace(${sql}, 'ي', 'ی')`;
  sql = `replace(${sql}, 'ى', 'ی')`;
  sql = `replace(${sql}, 'ك', 'ک')`;
  for (const codePoint of [8204, 8205, 8206, 8207, 160]) {
    sql = `replace(${sql}, chr(${codePoint}), ' ')`;
  }
  sql = `replace(${sql}, chr(65279), '')`;
  return `lower(regexp_replace(${sql}, '\\s+', ' ', 'g'))`;
}

function appendSearchMatcher(values, normalizedQuery, fieldExpressions) {
  const exactParam = `$${values.push(normalizedQuery)}`;
  const prefixParam = `$${values.push(`${normalizedQuery}%`)}`;
  const containsParam = `$${values.push(`%${normalizedQuery}%`)}`;
  const containsChecks = fieldExpressions.map((expression) => `${expression} LIKE ${containsParam}`);
  const exactChecks = fieldExpressions.map((expression) => `${expression} = ${exactParam}`);
  const prefixChecks = fieldExpressions.map((expression) => `${expression} LIKE ${prefixParam}`);
  return {
    condition: `(${containsChecks.join(" OR ")})`,
    score: `(CASE WHEN ${exactChecks.join(" OR ")} THEN 300 WHEN ${prefixChecks.join(" OR ")} THEN 200 ELSE 100 END)`,
  };
}

function collectMatchedFields(fieldValues, normalizedQuery) {
  return Object.entries(fieldValues || {})
    .filter(([, value]) => normalizeOperationalSearchQuery(value).includes(normalizedQuery))
    .map(([key]) => key);
}

function toSearchResult(row, normalizedQuery) {
  return {
    id: row.id,
    type: row.result_type,
    title: row.title || row.id,
    subtitle: row.subtitle || "",
    description: row.description || "",
    url: row.url || "/dashboard",
    badges: Array.isArray(row.badges) ? row.badges.filter(Boolean) : [],
    matchedFields: collectMatchedFields(row.field_values, normalizedQuery),
    updatedAt: new Date(row.updated_at || Date.now()).toISOString(),
  };
}

async function runOperationalSearchQuery(sql, values, normalizedQuery) {
  const result = await pool.query(sql, values);
  return {
    total: Number(result.rows[0]?.total_count || 0),
    rows: result.rows.map((row) => ({
      result: toSearchResult(row, normalizedQuery),
      score: Number(row.search_score || 0),
      updatedAt: new Date(row.updated_at || 0).getTime(),
    })),
  };
}

function createForbiddenSearchError(type) {
  const error = new Error(`Search access denied for ${type}.`);
  error.statusCode = 403;
  error.code = "FORBIDDEN";
  return error;
}

function hasSearchPermission(permissions, permissionKey) {
  return permissions.includes(permissionKey) || permissions.includes("platform.admin");
}

function getSearchAccess(permissions) {
  const canViewAllTasks = hasSearchPermission(permissions, "tasks.view_all");
  const canViewOwnTasks = hasSearchPermission(permissions, "tasks.view_own");
  return {
    shipments: hasSearchPermission(permissions, "shipments.view_all"),
    customers: hasSearchPermission(permissions, "customers.view"),
    documents: hasSearchPermission(permissions, "documents.view_all"),
    tasks: canViewAllTasks || canViewOwnTasks,
    tasksOwnOnly: !canViewAllTasks && canViewOwnTasks,
    archive: hasSearchPermission(permissions, "archive.view"),
    tracking: hasSearchPermission(permissions, "shipments.view_all"),
    users: hasSearchPermission(permissions, "users.manage"),
  };
}

function clampSearchLimit(limit) {
  const parsed = Number.parseInt(String(limit || ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 20;
  return Math.min(parsed, MAX_SEARCH_LIMIT);
}

function clampSearchOffset(offset) {
  const parsed = Number.parseInt(String(offset || ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.min(parsed, MAX_SEARCH_OFFSET);
}

async function searchShipments({ user, normalizedQuery, fetchLimit }) {
  const values = [];
  const organizationParam = `$${values.push(user.organizationId)}`;
  const ownerParam = `$${values.push(user.id)}`;
  const includePrivateCustomerDetails = canViewCustomerPrivateDetails(user);
  const customerSearchExpression = includePrivateCustomerDetails
    ? "CONCAT_WS(' ', s.customer_name, c.company_name, c.contact_name, c.customer_code)"
    : "COALESCE(c.customer_code, s.customer_id, '')";
  const customerDisplayExpression = "COALESCE(c.customer_code, s.customer_id)";
  const fields = {
    shipmentNumber: normalizedSearchSql("s.shipment_code"),
    trackingNumber: normalizedSearchSql("s.legacy_data->>'trackingNumber'"),
    referenceNumber: normalizedSearchSql("CONCAT_WS(' ', s.legacy_data->>'referenceNumber', s.legacy_data->>'containerNumber')"),
    customerName: normalizedSearchSql(customerSearchExpression),
    origin: normalizedSearchSql("s.origin"),
    destination: normalizedSearchSql("s.destination"),
    status: normalizedSearchSql("s.status"),
    recipientSender: normalizedSearchSql("CONCAT_WS(' ', s.legacy_data->>'recipient', s.legacy_data->>'sender')"),
    notes: normalizedSearchSql("s.legacy_data->>'notes'"),
    cotageNumber: normalizedSearchSql("k.cotage_number"),
    declarationReference: normalizedSearchSql("k.declaration_reference"),
  };
  const matcher = appendSearchMatcher(values, normalizedQuery, Object.values(fields));
  const limitParam = `$${values.push(fetchLimit)}`;
  return runOperationalSearchQuery(
    `SELECT
       s.id,
       'shipment' AS result_type,
       COALESCE(NULLIF(s.shipment_code, ''), s.id) AS title,
       CONCAT_WS(' · ', NULLIF(${customerDisplayExpression}, ''), NULLIF(CONCAT_WS(' → ', s.origin, s.destination), '')) AS subtitle,
       CONCAT(
         CASE WHEN s.exited_archived_at IS NOT NULL THEN 'خروج‌شده · ' ELSE '' END,
         'وضعیت فعلی: ',
         COALESCE(NULLIF(s.status, ''), 'ثبت نشده')
       ) AS description,
       CONCAT('/shipments/', s.id) AS url,
       COALESCE(s.updated_at, s.created_at) AS updated_at,
       ${matcher.score} AS search_score,
       CASE WHEN s.exited_archived_at IS NOT NULL THEN ARRAY['خروج‌شده']::text[] ELSE ARRAY[]::text[] END AS badges,
       jsonb_build_object(
         'shipmentNumber', s.shipment_code,
         'trackingNumber', s.legacy_data->>'trackingNumber',
         'referenceNumber', CONCAT_WS(' ', s.legacy_data->>'referenceNumber', s.legacy_data->>'containerNumber'),
         'customerName', ${customerDisplayExpression},
         'customerCode', COALESCE(c.customer_code, s.customer_id),
         'origin', s.origin,
         'destination', s.destination,
         'status', s.status,
         'recipientSender', CONCAT_WS(' ', s.legacy_data->>'recipient', s.legacy_data->>'sender'),
         'notes', s.legacy_data->>'notes',
         'cotageNumber', k.cotage_number,
         'declarationReference', k.declaration_reference
       ) AS field_values,
       COUNT(*) OVER()::int AS total_count
     FROM shipments s
     LEFT JOIN customers c ON c.id = s.customer_id AND c.organization_id = s.organization_id
     LEFT JOIN shipment_kootaj_details k
       ON k.shipment_id = s.id
      AND k.organization_id = s.organization_id
     WHERE (s.organization_id = ${organizationParam} OR (s.organization_id IS NULL AND s.owner_user_id = ${ownerParam}))
       AND s.archived_at IS NULL
       AND ${matcher.condition}
     ORDER BY search_score DESC, COALESCE(s.updated_at, s.created_at) DESC
     LIMIT ${limitParam}`,
    values,
    normalizedQuery
  );
}

async function searchCustomers({ user, normalizedQuery, fetchLimit }) {
  const values = [];
  const organizationParam = `$${values.push(user.organizationId)}`;
  const includePrivateDetails = canViewCustomerPrivateDetails(user);
  const fields = {
    customerCode: normalizedSearchSql("COALESCE(c.customer_code, c.id)"),
  };
  if (includePrivateDetails) {
    Object.assign(fields, {
      customerName: normalizedSearchSql("CONCAT_WS(' ', c.company_name, c.contact_name)"),
      phone: normalizedSearchSql("c.phone"),
      email: normalizedSearchSql("c.email"),
      address: normalizedSearchSql("c.address"),
      referrer: normalizedSearchSql("c.referrer"),
      nationalId: normalizedSearchSql("CONCAT_WS(' ', c.legacy_data->>'nationalId', c.legacy_data->>'taxId', c.legacy_data->>'nationalCode')"),
    });
  }
  const matcher = appendSearchMatcher(values, normalizedQuery, Object.values(fields));
  const limitParam = `$${values.push(fetchLimit)}`;
  const subtitleExpression = "''";
  const descriptionExpression = "'پرونده مشتری'";
  const fieldValuesExpression = `jsonb_build_object(
         'customerCode', COALESCE(c.customer_code, c.id),
         'customerName', COALESCE(c.customer_code, c.id)
       )`;
  const titleExpression = "COALESCE(NULLIF(c.customer_code, ''), c.id)";
  return runOperationalSearchQuery(
    `SELECT
       c.id,
       'customer' AS result_type,
       ${titleExpression} AS title,
       ${subtitleExpression} AS subtitle,
       ${descriptionExpression} AS description,
       CONCAT('/customers/', c.id) AS url,
       COALESCE(c.updated_at, c.created_at) AS updated_at,
       ${matcher.score} AS search_score,
       ${fieldValuesExpression} AS field_values,
       COUNT(*) OVER()::int AS total_count
     FROM customers c
     WHERE c.organization_id = ${organizationParam}
       AND c.archived_at IS NULL
       AND ${matcher.condition}
     ORDER BY search_score DESC, COALESCE(c.updated_at, c.created_at) DESC
     LIMIT ${limitParam}`,
    values,
    normalizedQuery
  );
}

async function searchDocuments({ user, normalizedQuery, fetchLimit }) {
  const values = [];
  const organizationParam = `$${values.push(user.organizationId)}`;
  const fields = {
    title: normalizedSearchSql("d.title"),
    fileName: normalizedSearchSql("d.file_name"),
    documentType: normalizedSearchSql("d.legacy_data->>'type'"),
    relatedShipment: normalizedSearchSql("s.shipment_code"),
    relatedCustomer: normalizedSearchSql("CONCAT_WS(' ', c.customer_code, c.company_name, c.contact_name)"),
  };
  const matcher = appendSearchMatcher(values, normalizedQuery, Object.values(fields));
  const limitParam = `$${values.push(fetchLimit)}`;
  return runOperationalSearchQuery(
    `SELECT
       d.id,
       'document' AS result_type,
       COALESCE(NULLIF(d.title, ''), NULLIF(d.file_name, ''), d.id) AS title,
       CONCAT_WS(' · ', NULLIF(d.file_name, ''), NULLIF(s.shipment_code, ''), NULLIF(c.customer_code, '')) AS subtitle,
       CONCAT('نوع سند: ', COALESCE(NULLIF(d.legacy_data->>'type', ''), 'OTHER')) AS description,
       '/documents' AS url,
       COALESCE(d.updated_at, d.created_at) AS updated_at,
       ${matcher.score} AS search_score,
       jsonb_build_object(
         'title', d.title,
         'fileName', d.file_name,
         'documentType', d.legacy_data->>'type',
         'relatedShipment', s.shipment_code,
         'relatedCustomer', COALESCE(c.customer_code, d.customer_id)
       ) AS field_values,
       COUNT(*) OVER()::int AS total_count
     FROM documents d
     LEFT JOIN shipments s ON s.id = d.shipment_id
     LEFT JOIN customers c ON c.id = d.customer_id
     WHERE d.organization_id = ${organizationParam}
       AND d.archived_at IS NULL
       AND ${matcher.condition}
     ORDER BY search_score DESC, COALESCE(d.updated_at, d.created_at) DESC
     LIMIT ${limitParam}`,
    values,
    normalizedQuery
  );
}

async function searchDocumentVersions({ user, normalizedQuery, fetchLimit }) {
  const values = [];
  const organizationParam = `$${values.push(user.organizationId)}`;
  const fields = {
    title: normalizedSearchSql("d.title"),
    fileName: normalizedSearchSql("dv.file_name"),
    versionNumber: normalizedSearchSql("dv.version::text"),
    relatedShipment: normalizedSearchSql("s.shipment_code"),
  };
  const matcher = appendSearchMatcher(values, normalizedQuery, Object.values(fields));
  const limitParam = `$${values.push(fetchLimit)}`;
  return runOperationalSearchQuery(
    `SELECT
       CONCAT(d.id, ':v', dv.version::text) AS id,
       'document' AS result_type,
       CONCAT(COALESCE(NULLIF(d.title, ''), NULLIF(dv.file_name, ''), d.id), ' v', dv.version::text) AS title,
       CONCAT_WS(' · ', NULLIF(dv.file_name, ''), NULLIF(s.shipment_code, '')) AS subtitle,
       'نسخه سند' AS description,
       '/documents' AS url,
       COALESCE(dv.created_at, d.updated_at, d.created_at) AS updated_at,
       ${matcher.score} AS search_score,
       jsonb_build_object(
         'title', d.title,
         'fileName', dv.file_name,
         'versionNumber', dv.version::text,
         'relatedShipment', s.shipment_code
       ) AS field_values,
       COUNT(*) OVER()::int AS total_count
     FROM document_versions dv
     JOIN documents d ON d.id = dv.document_id
     LEFT JOIN shipments s ON s.id = d.shipment_id
     WHERE d.organization_id = ${organizationParam}
       AND d.archived_at IS NULL
       AND ${matcher.condition}
     ORDER BY search_score DESC, COALESCE(dv.created_at, d.updated_at, d.created_at) DESC
     LIMIT ${limitParam}`,
    values,
    normalizedQuery
  );
}

async function searchTasks({ user, normalizedQuery, fetchLimit, ownOnly }) {
  const values = [];
  const organizationParam = `$${values.push(user.organizationId)}`;
  const fields = {
    title: normalizedSearchSql("t.title"),
    description: normalizedSearchSql("t.description"),
    status: normalizedSearchSql("t.status"),
    assignedUser: normalizedSearchSql("t.assigned_to_name"),
    dueDate: normalizedSearchSql("t.due_at"),
  };
  const matcher = appendSearchMatcher(values, normalizedQuery, Object.values(fields));
  const assignedFilter = ownOnly ? `AND t.assigned_to_id = $${values.push(user.id)}` : "";
  const limitParam = `$${values.push(fetchLimit)}`;
  return runOperationalSearchQuery(
    `SELECT
       t.id,
       'task' AS result_type,
       t.title AS title,
       CONCAT_WS(' · ', NULLIF(t.assigned_to_name, ''), NULLIF(t.status, ''), NULLIF(t.due_at, '')) AS subtitle,
       COALESCE(NULLIF(t.description, ''), 'وظیفه عملیاتی') AS description,
       '/tasks' AS url,
       COALESCE(t.updated_at, t.created_at) AS updated_at,
       ${matcher.score} AS search_score,
       jsonb_build_object(
         'title', t.title,
         'description', t.description,
         'status', t.status,
         'assignedUser', t.assigned_to_name,
         'dueDate', t.due_at
       ) AS field_values,
       COUNT(*) OVER()::int AS total_count
     FROM tasks t
     WHERE t.organization_id = ${organizationParam}
       ${assignedFilter}
       AND ${matcher.condition}
     ORDER BY search_score DESC, COALESCE(t.updated_at, t.created_at) DESC
     LIMIT ${limitParam}`,
    values,
    normalizedQuery
  );
}

async function searchTracking({ user, normalizedQuery, fetchLimit }) {
  const values = [];
  const organizationParam = `$${values.push(user.organizationId)}`;
  const ownerParam = `$${values.push(user.id)}`;
  const fields = {
    trackingCode: normalizedSearchSql("s.shipment_code"),
    shipmentNumber: normalizedSearchSql("s.shipment_code"),
    publicStatus: normalizedSearchSql("CONCAT_WS(' ', s.legacy_data->>'publicStatusLabel', s.legacy_data->>'publicStatusDescription', events.event_text)"),
    publicRoute: normalizedSearchSql("CONCAT_WS(' ', s.origin, s.destination)"),
  };
  const matcher = appendSearchMatcher(values, normalizedQuery, Object.values(fields));
  const limitParam = `$${values.push(fetchLimit)}`;
  return runOperationalSearchQuery(
    `SELECT
       s.id,
       'tracking' AS result_type,
       COALESCE(NULLIF(s.shipment_code, ''), s.id) AS title,
       CONCAT_WS(' · ', NULLIF(s.origin, ''), NULLIF(s.destination, '')) AS subtitle,
       COALESCE(NULLIF(s.legacy_data->>'publicStatusLabel', ''), NULLIF(events.latest_label, ''), 'رهگیری مشتری') AS description,
       CONCAT('/shipments/', s.id) AS url,
       GREATEST(COALESCE(s.updated_at, s.created_at), COALESCE(events.last_event_at, s.created_at)) AS updated_at,
       ${matcher.score} AS search_score,
       jsonb_build_object(
         'trackingCode', s.shipment_code,
         'shipmentNumber', s.shipment_code,
         'publicStatus', CONCAT_WS(' ', s.legacy_data->>'publicStatusLabel', s.legacy_data->>'publicStatusDescription', events.event_text),
         'publicRoute', CONCAT_WS(' ', s.origin, s.destination)
       ) AS field_values,
       COUNT(*) OVER()::int AS total_count
     FROM shipments s
     LEFT JOIN LATERAL (
       SELECT
         STRING_AGG(CONCAT_WS(' ', e.public_label, e.public_description), ' ') AS event_text,
         (ARRAY_AGG(e.public_label ORDER BY e.created_at DESC))[1] AS latest_label,
         MAX(e.created_at) AS last_event_at
       FROM shipment_status_events e
       WHERE e.shipment_id = s.id
         AND e.organization_id = ${organizationParam}
         AND e.is_customer_visible = TRUE
     ) events ON TRUE
     WHERE (s.organization_id = ${organizationParam} OR (s.organization_id IS NULL AND s.owner_user_id = ${ownerParam}))
       AND s.archived_at IS NULL
       AND s.customer_access_enabled = TRUE
       AND ${matcher.condition}
     ORDER BY search_score DESC, GREATEST(COALESCE(s.updated_at, s.created_at), COALESCE(events.last_event_at, s.created_at)) DESC
     LIMIT ${limitParam}`,
    values,
    normalizedQuery
  );
}

async function searchArchive({ user, normalizedQuery, fetchLimit }) {
  const values = [];
  const organizationParam = `$${values.push(user.organizationId)}`;
  const fields = {
    title: normalizedSearchSql("ar.title"),
    summary: normalizedSearchSql("ar.summary"),
    customerName: normalizedSearchSql("CONCAT_WS(' ', ar.customer_name, c.customer_code, s.customer_id)"),
    entityType: normalizedSearchSql("ar.entity_type"),
    entityId: normalizedSearchSql("ar.entity_id"),
  };
  const matcher = appendSearchMatcher(values, normalizedQuery, Object.values(fields));
  const limitParam = `$${values.push(fetchLimit)}`;
  const includeQuotationArchiveParam = `$${values.push(QUOTATIONS_UI_SURFACE_ENABLED)}`;
  const archiveCustomerDisplayExpression = "COALESCE(c.customer_code, s.customer_id, CASE WHEN ar.entity_type = 'customer' THEN ar.entity_id END, ar.customer_name)";
  return runOperationalSearchQuery(
    `SELECT
       ar.id,
       'archive' AS result_type,
       COALESCE(NULLIF(ar.title, ''), ar.entity_id, ar.id) AS title,
       CONCAT_WS(' · ', NULLIF(${archiveCustomerDisplayExpression}, ''), NULLIF(ar.entity_type, '')) AS subtitle,
       COALESCE(NULLIF(ar.summary, ''), 'رکورد بایگانی شده') AS description,
       '/archive' AS url,
       COALESCE(ar.archived_at, NOW()) AS updated_at,
       ${matcher.score} AS search_score,
       jsonb_build_object(
         'title', ar.title,
         'summary', ar.summary,
         'customerName', ${archiveCustomerDisplayExpression},
         'entityType', ar.entity_type,
         'entityId', ar.entity_id
       ) AS field_values,
       COUNT(*) OVER()::int AS total_count
     FROM archive_records ar
     LEFT JOIN shipments s
       ON s.id = ar.shipment_id
      AND s.organization_id = ar.organization_id
     LEFT JOIN customers c
       ON c.organization_id = ar.organization_id
      AND (
        c.id = s.customer_id
        OR (ar.entity_type = 'customer' AND c.id = ar.entity_id)
      )
     WHERE ar.organization_id = ${organizationParam}
       AND ar.restored_at IS NULL
       AND (${includeQuotationArchiveParam}::boolean OR ar.entity_type <> 'quotation')
       AND ${matcher.condition}
     ORDER BY search_score DESC, COALESCE(ar.archived_at, NOW()) DESC
     LIMIT ${limitParam}`,
    values,
    normalizedQuery
  );
}

async function searchUsers({ user, normalizedQuery, fetchLimit }) {
  const values = [];
  const organizationParam = `$${values.push(user.organizationId)}`;
  const fields = {
    name: normalizedSearchSql("u.name"),
    email: normalizedSearchSql("u.email"),
    role: normalizedSearchSql("u.role"),
    department: normalizedSearchSql("u.department"),
    phone: normalizedSearchSql("u.phone"),
  };
  const matcher = appendSearchMatcher(values, normalizedQuery, Object.values(fields));
  const limitParam = `$${values.push(fetchLimit)}`;
  return runOperationalSearchQuery(
    `SELECT
       u.id,
       'user' AS result_type,
       COALESCE(NULLIF(u.name, ''), u.email, u.id) AS title,
       CONCAT_WS(' · ', NULLIF(u.role, ''), NULLIF(u.department, ''), NULLIF(u.email, '')) AS subtitle,
       COALESCE(NULLIF(u.phone, ''), 'کاربر شرکت') AS description,
       '/management' AS url,
       COALESCE(u.updated_at, u.created_at) AS updated_at,
       ${matcher.score} AS search_score,
       jsonb_build_object(
         'name', u.name,
         'email', u.email,
         'role', u.role,
         'department', u.department,
         'phone', u.phone
       ) AS field_values,
       COUNT(*) OVER()::int AS total_count
     FROM app_users u
     WHERE u.organization_id = ${organizationParam}
       AND COALESCE(u.status, 'active') <> 'deleted'
       AND ${matcher.condition}
     ORDER BY search_score DESC, COALESCE(u.updated_at, u.created_at) DESC
     LIMIT ${limitParam}`,
    values,
    normalizedQuery
  );
}

export async function searchOperationalRecords({ user, tenantContext, q, type = "all", limit = 20, offset = 0 } = {}) {
  const scopedOrganizationId = tenantContext
    ? organizationIdFromTenantContext(tenantContext, "searchOperationalRecords")
    : user?.organizationId;
  if (!scopedOrganizationId) {
    throw createForbiddenSearchError("organization");
  }
  const scopedUser = { ...user, organizationId: scopedOrganizationId, organization_id: scopedOrganizationId };

  const requestedType = SEARCH_REQUEST_TYPES.has(String(type)) ? String(type) : "all";
  const normalizedQuery = normalizeOperationalSearchQuery(q);
  const safeLimit = clampSearchLimit(limit);
  const safeOffset = clampSearchOffset(offset);
  const fetchLimit = Math.min(MAX_SEARCH_OFFSET + MAX_SEARCH_LIMIT, safeOffset + safeLimit);
  const permissions = await getUserPermissions(user.id);
  const access = getSearchAccess(permissions);
  const selectedTypes = requestedType === "all" ? SEARCH_TYPES_FOR_ALL : [requestedType];

  if (requestedType !== "all" && !access[requestedType]) {
    throw createForbiddenSearchError(requestedType);
  }

  const searches = [];
  for (const selectedType of selectedTypes) {
    if (!access[selectedType]) continue;
    if (selectedType === "shipments") searches.push(searchShipments({ user: scopedUser, normalizedQuery, fetchLimit }));
    if (selectedType === "customers") searches.push(searchCustomers({ user: scopedUser, normalizedQuery, fetchLimit }));
    if (selectedType === "documents") {
      searches.push(searchDocuments({ user: scopedUser, normalizedQuery, fetchLimit }));
      searches.push(searchDocumentVersions({ user: scopedUser, normalizedQuery, fetchLimit }));
    }
    if (selectedType === "tasks") searches.push(searchTasks({ user: scopedUser, normalizedQuery, fetchLimit, ownOnly: access.tasksOwnOnly }));
    if (selectedType === "archive") searches.push(searchArchive({ user: scopedUser, normalizedQuery, fetchLimit }));
    if (selectedType === "tracking") searches.push(searchTracking({ user: scopedUser, normalizedQuery, fetchLimit }));
    if (selectedType === "users") searches.push(searchUsers({ user: scopedUser, normalizedQuery, fetchLimit }));
  }

  const settled = await Promise.all(searches);
  const combined = settled.flatMap((item) => item.rows);
  combined.sort((a, b) => b.score - a.score || b.updatedAt - a.updatedAt);

  return {
    query: normalizedQuery,
    total: settled.reduce((sum, item) => sum + item.total, 0),
    limit: safeLimit,
    offset: safeOffset,
    results: combined.slice(safeOffset, safeOffset + safeLimit).map((item) => item.result),
  };
}

export function normalizeSmsPhone(phone) {
  const digits = normalizeDigits(phone).replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("0098") && digits.length === 14) return digits.slice(2);
  if (digits.startsWith("98") && digits.length === 12) return digits;
  if (digits.startsWith("0") && digits.length === 11) return `98${digits.slice(1)}`;
  if (digits.length === 10 && digits.startsWith("9")) return `98${digits}`;
  return "";
}

export async function getUserByPhone(phone) {
  const normalizedPhone = normalizeSmsPhone(phone);
  if (!normalizedPhone) return null;
  const localPhone = normalizedPhone.startsWith("98") ? `0${normalizedPhone.slice(2)}` : normalizedPhone;
  const nationalPhone = normalizedPhone.startsWith("98") ? normalizedPhone.slice(2) : normalizedPhone;
  const phoneExpression = phoneDigitsSql("u.phone");
  const result = await pool.query(
    `SELECT u.id, u.name, u.email, u.password_hash, u.role, u.avatar, u.is_online, u.department, u.status, u.last_seen_at,
            u.phone, u.location, u.bio, u.two_factor_enabled, u.notification_preferences,
            u.organization_id,
            o.status AS organization_status,
            o.name AS organization_name,
            o.plan_id AS organization_plan_id,
            os.status AS subscription_status
     FROM app_users u
     LEFT JOIN organizations o ON o.id = u.organization_id
     LEFT JOIN organization_subscriptions os ON os.organization_id = o.id
     WHERE ${phoneExpression} = ANY($1::text[])
     ORDER BY u.created_at ASC
     LIMIT 1`,
    [[normalizedPhone, localPhone, nationalPhone]]
  );
  return result.rows[0] || null;
}

export async function getUserById(userId) {
  const result = await pool.query(
    `SELECT u.id, u.name, u.email, u.role, u.avatar, u.is_online, u.department, u.status, u.last_seen_at,
            u.phone, u.location, u.bio, u.two_factor_enabled, u.notification_preferences,
            u.organization_id,
            o.status AS organization_status,
            o.name AS organization_name,
            o.plan_id AS organization_plan_id,
            os.status AS subscription_status
     FROM app_users u
     LEFT JOIN organizations o ON o.id = u.organization_id
     LEFT JOIN organization_subscriptions os ON os.organization_id = o.id
     WHERE u.id = $1
     LIMIT 1`,
    [userId]
  );
  return result.rows[0] || null;
}

function recordsFromRows(rows) {
  return rows.reduce((acc, row) => {
    if (!acc[row.collection]) acc[row.collection] = [];
    acc[row.collection].push(row.data);
    return acc;
  }, {});
}

async function listOrganizationUserRecords(organizationId, collection) {
  if (!organizationId) return [];
  const result = await pool.query(
    `SELECT DISTINCT ON (item_id) data
     FROM user_records
     WHERE organization_id = $1
       AND collection = $2
     ORDER BY item_id, updated_at DESC`,
    [organizationId, collection]
  );
  return result.rows.map((row) => row.data);
}

async function listOrganizationUsersForBootstrap(organizationId) {
  const result = await pool.query(
    `SELECT u.id, u.name, u.email, u.role, u.avatar, u.is_online, u.department, u.status, u.last_seen_at,
            u.phone, u.location, u.bio, u.two_factor_enabled, u.notification_preferences, u.organization_id,
            o.status AS organization_status,
            o.name AS organization_name,
            o.plan_id AS organization_plan_id,
            os.status AS subscription_status
     FROM app_users u
     LEFT JOIN organizations o ON o.id = u.organization_id
     LEFT JOIN organization_subscriptions os ON os.organization_id = o.id
     WHERE u.organization_id = $1
     ORDER BY u.name ASC`,
    [organizationId]
  );
  return result.rows.map(toUiUser);
}

async function listBootstrapShipments(ownerUserId, organizationId, { includeCustomerPrivateDetails = true } = {}) {
  if (!organizationId) {
    const result = await pool.query(
      `SELECT *
       FROM shipments
       WHERE owner_user_id = $1
         AND exited_archived_at IS NULL
       ORDER BY updated_at DESC, created_at DESC`,
      [ownerUserId]
    );
    return result.rows.map((row) => toUiShipment(row, { includeCustomerPrivateDetails }));
  }
  const result = await pool.query(
    `SELECT
       s.*,
       c.customer_code,
       COALESCE(c.company_name, c.contact_name, s.customer_name, s.legacy_data->>'customerName') AS customer_display_name,
       p.id AS v2_profile_id,
       p.flow_code AS v2_flow_code,
       p.sections_json AS v2_sections_json,
       p.updated_at AS v2_profile_updated_at
     FROM shipments s
     LEFT JOIN customers c
       ON c.id = s.customer_id
      AND c.organization_id = s.organization_id
      AND c.archived_at IS NULL
     LEFT JOIN shipment_v2_profiles p
       ON p.shipment_id = s.id
      AND p.organization_id = s.organization_id
     WHERE s.exited_archived_at IS NULL
       AND (
          s.organization_id = $1
          OR (s.owner_user_id = $2 AND s.organization_id IS NULL)
        )
      ORDER BY COALESCE(p.updated_at, s.updated_at) DESC, s.created_at DESC`,
    [organizationId, ownerUserId]
  );
  return result.rows.map((row) => toUiShipment(row, { includeCustomerPrivateDetails }));
}

export async function getRecordsForUser(ownerUserId, { organizationId, tenantContext } = {}) {
  const scopedOrganizationId = tenantContext
    ? organizationIdFromTenantContext(tenantContext, "getRecordsForUser")
    : organizationId
      ? requireOrganizationScope(organizationId, "getRecordsForUser")
      : null;
  const user = await getUserById(ownerUserId);
  if (scopedOrganizationId && user?.organization_id !== scopedOrganizationId) return null;

  const values = [ownerUserId];
  const organizationFilter = scopedOrganizationId ? ` AND (organization_id = $${values.push(scopedOrganizationId)} OR organization_id IS NULL)` : "";
  const result = await pool.query(
    `SELECT collection, item_id, data
     FROM user_records
     WHERE owner_user_id = $1${organizationFilter}
     ORDER BY collection, item_id`,
    values
  );

  const records = recordsFromRows(result.rows);
  const userOrganizationId = user?.organization_id || null;
  if (!userOrganizationId || String(user?.role || "").toUpperCase() === "CUSTOMER_VIEWER") {
    return records;
  }

  const [
    users,
    customers,
    shipments,
    tasks,
    documents,
    appointments,
    quotes,
    shipmentSteps,
    commercialCards,
  ] = await Promise.all([
    listOrganizationUsersForBootstrap(userOrganizationId),
    listCustomersDetailed({
      organizationId: userOrganizationId,
      includeArchived: true,
      includePrivateDetails: canViewCustomerPrivateDetails(user),
    }),
    listBootstrapShipments(ownerUserId, userOrganizationId, {
      includeCustomerPrivateDetails: canViewCustomerPrivateDetails(user),
    }),
    listTasks({ organizationId: userOrganizationId, includeAll: true }),
    listDocuments({ organizationId: userOrganizationId, includeArchived: true }),
    listComplianceMeetings({ organizationId: userOrganizationId, includeArchived: true }),
    QUOTATIONS_UI_SURFACE_ENABLED
      ? listQuotations({
          organizationId: userOrganizationId,
          includeArchived: true,
          includeCustomerPrivateDetails: canViewCustomerPrivateDetails(user),
        })
      : Promise.resolve([]),
    listOrganizationUserRecords(userOrganizationId, "shipmentSteps"),
    listOrganizationUserRecords(userOrganizationId, "commercialCards"),
  ]);

  return {
    ...records,
    users,
    customers,
    shipments,
    tasks,
    documents,
    appointments,
    quotes,
    shipmentSteps,
    commercialCards,
  };
}

export async function replaceRecordsForUser(ownerUserId, recordsByCollection, { organizationId, tenantContext } = {}) {
  const client = await pool.connect();
  const entries = Object.entries(recordsByCollection || {}).filter(([, records]) =>
    Array.isArray(records)
  );
  const scopedOrganizationId = tenantContext
    ? organizationIdFromTenantContext(tenantContext, "replaceRecordsForUser")
    : organizationId
      ? requireOrganizationScope(organizationId, "replaceRecordsForUser")
      : null;

  try {
    await client.query("BEGIN");
    const ownerResult = await client.query("SELECT organization_id FROM app_users WHERE id = $1", [
      ownerUserId,
    ]);
    const ownerOrganizationId = ownerResult.rows[0]?.organization_id || null;
    if (scopedOrganizationId && ownerOrganizationId !== scopedOrganizationId) {
      await client.query("ROLLBACK");
      return null;
    }

    let total = 0;
    for (const [collection, records] of entries) {
      if (
        collection === "notifications" ||
        collection === "customers" ||
        collection === "channels" ||
        collection === "messages" ||
        (!QUOTATIONS_UI_SURFACE_ENABLED && collection === "quotes")
      ) {
        // Notifications are canonical in the notifications table; the compatibility
        // bridge must not overwrite real read state or resurrect seed/demo rows.
        // Customers are canonical and may be privacy-sanitized in bootstrap payloads.
        // Live chat is canonical in chat_* tables and must not be reseeded from
        // legacy channels/messages collections.
        // Quotations are temporarily hidden from the UI and must be managed only
        // through the canonical quotation API while the UI surface is disabled.
        continue;
      }
      const uniqueRecords = Array.from(
        records
          .reduce((items, record, index) => {
            const itemId = record?.id || `${collection}-${index}`;
            items.set(itemId, { itemId, record });
            return items;
          }, new Map())
          .values()
      );
      await client.query(
        "DELETE FROM user_records WHERE owner_user_id = $1 AND collection = $2",
        [ownerUserId, collection]
      );

      for (const { itemId, record } of uniqueRecords) {
        await client.query(
          `INSERT INTO user_records (owner_user_id, organization_id, collection, item_id, data, updated_at)
           VALUES ($1, $2, $3, $4, $5::jsonb, NOW())
           ON CONFLICT (owner_user_id, collection, item_id)
           DO UPDATE SET
             organization_id = EXCLUDED.organization_id,
             data = EXCLUDED.data,
             updated_at = NOW()`,
          [ownerUserId, ownerOrganizationId, collection, itemId, JSON.stringify(record)]
        );
        total += 1;
      }

      await syncCanonicalCollection(
        client,
        ownerUserId,
        ownerOrganizationId,
        collection,
        uniqueRecords.map((item) => item.record)
      );
    }

    await client.query("COMMIT");
    return { total };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function createSession(userId, { remember = false } = {}) {
  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = hashSessionToken(token);
  const id = crypto.randomUUID();
  const expiresAt = new Date(
    Date.now() +
      (remember
        ? REMEMBER_SESSION_DAYS * 24 * 60 * 60 * 1000
        : TRANSIENT_SESSION_HOURS * 60 * 60 * 1000)
  );

  await pool.query(
    `INSERT INTO app_sessions (id, user_id, token_hash, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [id, userId, tokenHash, expiresAt]
  );

  await pool.query(
    "UPDATE app_users SET last_seen_at = NOW(), is_online = TRUE WHERE id = $1",
    [userId]
  );

  return { id, token, expiresAt, remember };
}

function createLoginSmsCode() {
  return String(crypto.randomInt(100000, 1000000));
}

function hashLoginSmsCode(code, salt) {
  return crypto.createHash("sha256").update(`${salt}:${String(code || "").trim()}`).digest("hex");
}

export async function createLoginSmsChallenge({ userId, phone, requestContext = {} }) {
  const normalizedPhone = normalizeSmsPhone(phone);
  if (!userId || !normalizedPhone) {
    const error = new Error("A valid phone number is required.");
    error.statusCode = 400;
    error.code = "VALIDATION_ERROR";
    throw error;
  }

  const id = crypto.randomUUID();
  const code = createLoginSmsCode();
  const salt = crypto.randomBytes(16).toString("hex");
  const expiresAt = new Date(Date.now() + LOGIN_SMS_CODE_TTL_MINUTES * 60 * 1000);

  await pool.query(
    `UPDATE login_sms_challenges
     SET consumed_at = COALESCE(consumed_at, NOW()),
         updated_at = NOW()
     WHERE user_id = $1
       AND phone = $2
       AND consumed_at IS NULL`,
    [userId, normalizedPhone]
  );

  await pool.query(
    `INSERT INTO login_sms_challenges (
       id, user_id, phone, code_hash, code_salt, expires_at, ip_address, user_agent, updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
    [
      id,
      userId,
      normalizedPhone,
      hashLoginSmsCode(code, salt),
      salt,
      expiresAt,
      requestContext.ip || null,
      requestContext.userAgent || null,
    ]
  );

  return { id, code, phone: normalizedPhone, expiresAt };
}

export async function verifyLoginSmsChallenge({ phone, code }) {
  const normalizedPhone = normalizeSmsPhone(phone);
  const normalizedCode = normalizeDigits(code).replace(/\D/g, "");
  if (!normalizedPhone || !normalizedCode) {
    return { ok: false, reason: "invalid_code" };
  }

  const result = await pool.query(
    `SELECT *
     FROM login_sms_challenges
     WHERE phone = $1
       AND consumed_at IS NULL
       AND expires_at > NOW()
     ORDER BY created_at DESC
     LIMIT 1`,
    [normalizedPhone]
  );
  const challenge = result.rows[0];
  if (!challenge) return { ok: false, reason: "expired_or_missing" };
  if (Number(challenge.attempt_count || 0) >= LOGIN_SMS_MAX_ATTEMPTS) {
    return { ok: false, reason: "too_many_attempts" };
  }

  const matches = hashLoginSmsCode(normalizedCode, challenge.code_salt) === challenge.code_hash;
  if (!matches) {
    await pool.query(
      `UPDATE login_sms_challenges
       SET attempt_count = attempt_count + 1,
           updated_at = NOW()
       WHERE id = $1`,
      [challenge.id]
    );
    return { ok: false, reason: "invalid_code" };
  }

  await pool.query(
    `UPDATE login_sms_challenges
     SET consumed_at = NOW(),
         updated_at = NOW()
     WHERE id = $1`,
    [challenge.id]
  );

  return { ok: true, user: await getUserById(challenge.user_id), challengeId: challenge.id };
}

export async function getSessionByToken(token) {
  if (!token) return null;
  const tokenHash = hashSessionToken(token);
  const result = await pool.query(
    `SELECT
       s.id AS session_id,
       s.expires_at,
       s.revoked_at,
       s.last_seen_at AS session_last_seen_at,
       u.id,
       u.name,
       u.email,
       u.role,
       u.avatar,
       u.is_online,
       u.department,
       u.status,
       u.last_seen_at,
       u.phone,
       u.location,
       u.bio,
       u.two_factor_enabled,
       u.notification_preferences,
        u.organization_id,
        om.role AS membership_role,
        om.status AS membership_status,
        o.status AS organization_status,
        o.name AS organization_name,
        o.plan_id AS organization_plan_id,
        os.status AS subscription_status
      FROM app_sessions s
      JOIN app_users u ON u.id = s.user_id
      LEFT JOIN organization_members om
        ON om.organization_id = u.organization_id
       AND om.user_id = u.id
      LEFT JOIN organizations o ON o.id = u.organization_id
      LEFT JOIN organization_subscriptions os ON os.organization_id = o.id
     WHERE s.token_hash = $1
       AND s.expires_at > NOW()
       AND s.revoked_at IS NULL
     LIMIT 1`,
    [tokenHash]
  );

  const row = result.rows[0];
  if (!row) return null;

  const lastSeenAt = row.session_last_seen_at ? new Date(row.session_last_seen_at).getTime() : 0;
  if (!lastSeenAt || Date.now() - lastSeenAt > 60_000) {
    pool
      .query("UPDATE app_sessions SET last_seen_at = NOW() WHERE id = $1", [row.session_id])
      .catch((error) => {
        console.error("Session last_seen update failed:", error);
      });
  }

  return {
    sessionId: row.session_id,
    user: {
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      avatar: row.avatar,
      is_online: row.is_online,
      department: row.department,
      status: row.status,
      last_seen_at: row.last_seen_at,
      phone: row.phone,
      location: row.location,
      bio: row.bio,
      two_factor_enabled: row.two_factor_enabled,
      notification_preferences: row.notification_preferences,
      organization_id: row.organization_id,
      organizationId: row.organization_id,
      membershipId: row.organization_id ? `${row.organization_id}:${row.id}` : null,
      membershipRole: row.membership_role,
      membershipStatus: row.membership_status,
      organizationStatus: row.organization_status,
      organizationName: row.organization_name,
      organizationPlanId: row.organization_plan_id,
      subscriptionStatus: row.subscription_status,
    },
  };
}

export async function getSessionAuditStateByToken(token) {
  if (!token) return null;
  const tokenHash = hashSessionToken(token);
  const result = await pool.query(
    `SELECT
       s.id,
       s.user_id,
       s.expires_at,
       s.revoked_at,
       u.organization_id
     FROM app_sessions s
     LEFT JOIN app_users u ON u.id = s.user_id
     WHERE s.token_hash = $1
     LIMIT 1`,
    [tokenHash]
  );
  const session = result.rows[0];
  if (!session) return { matched: false, reason: "unknown_session" };
  const expired = session.expires_at && new Date(session.expires_at).getTime() <= Date.now();
  return {
    matched: true,
    sessionId: session.id,
    userId: session.user_id,
    organizationId: session.organization_id,
    reason: session.revoked_at ? "revoked" : expired ? "expired" : "not_active",
  };
}

export async function updateUserProfile(userId, updates) {
  const allowed = {
    name: updates.name,
    avatar: updates.avatar,
    phone: updates.phone,
    location: updates.location,
    bio: updates.bio,
  };

  const result = await pool.query(
    `UPDATE app_users
     SET name = COALESCE($2, name),
         avatar = $3,
         phone = $4,
         location = $5,
         bio = $6,
         updated_at = NOW()
     WHERE id = $1
     RETURNING id, name, email, role, avatar, is_online, department, status, last_seen_at,
               phone, location, bio, two_factor_enabled, notification_preferences`,
    [
      userId,
      allowed.name || null,
      allowed.avatar || null,
      allowed.phone || null,
      allowed.location || null,
      allowed.bio || null,
    ]
  );
  return result.rows[0] || null;
}

export async function updateUserPassword(userId, passwordHash, { organizationId } = {}) {
  const values = [userId, passwordHash];
  const organizationFilter = organizationId ? ` AND organization_id = $${values.push(organizationId)}` : "";
  const result = await pool.query(
    `UPDATE app_users
     SET password_hash = $2, updated_at = NOW()
     WHERE id = $1 ${organizationFilter}
     RETURNING id`,
    values
  );
  return result.rows[0] || null;
}

export async function updateUserSecurity(userId, updates) {
  const result = await pool.query(
    `UPDATE app_users
     SET two_factor_enabled = COALESCE($2, two_factor_enabled),
         updated_at = NOW()
     WHERE id = $1
     RETURNING id, name, email, role, avatar, is_online, department, status, last_seen_at,
               phone, location, bio, two_factor_enabled, notification_preferences`,
    [userId, updates.twoFactorEnabled]
  );
  return result.rows[0] || null;
}

export async function updateUserNotificationPreferences(userId, preferences) {
  const result = await pool.query(
    `UPDATE app_users
     SET notification_preferences = $2::jsonb,
         updated_at = NOW()
     WHERE id = $1
     RETURNING id, name, email, role, avatar, is_online, department, status, last_seen_at,
               phone, location, bio, two_factor_enabled, notification_preferences`,
    [userId, JSON.stringify(preferences || {})]
  );
  return result.rows[0] || null;
}

export async function deleteSessionByToken(token) {
  if (!token) return;
  await pool.query("UPDATE app_sessions SET revoked_at = COALESCE(revoked_at, NOW()) WHERE token_hash = $1", [
    hashSessionToken(token),
  ]);
}

export async function getUserPermissions(userId) {
  const result = await pool.query(
    `SELECT key
     FROM (
       SELECT p.key
       FROM app_users u
       JOIN roles r ON lower(r.name) = lower(u.role)
       JOIN role_permissions rp ON rp.role_id = r.id
       JOIN permissions p ON p.id = rp.permission_id
       WHERE u.id = $1
       UNION
       SELECT p.key
       FROM user_permissions up
       JOIN permissions p ON p.id = up.permission_id
       WHERE up.user_id = $1
     ) granted_permissions
     ORDER BY key`,
    [userId]
  );
  return result.rows.map((row) => row.key);
}

async function getUserPermissionsWithClient(queryable, userId) {
  const result = await queryable.query(
    `SELECT key
     FROM (
       SELECT p.key
       FROM app_users u
       JOIN roles r ON lower(r.name) = lower(u.role)
       JOIN role_permissions rp ON rp.role_id = r.id
       JOIN permissions p ON p.id = rp.permission_id
       WHERE u.id = $1
       UNION
       SELECT p.key
       FROM user_permissions up
       JOIN permissions p ON p.id = up.permission_id
       WHERE up.user_id = $1
     ) granted_permissions
     ORDER BY key`,
    [userId]
  );
  return result.rows.map((row) => row.key);
}

export async function grantUserPermission(userId, permissionKey, { grantedById, reason, audit } = {}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const targetResult = await client.query(
      "SELECT id, organization_id, role, status FROM app_users WHERE id = $1 LIMIT 1",
      [userId]
    );
    const target = targetResult.rows[0];
    if (!target) {
      await client.query("ROLLBACK");
      return null;
    }
    const permissionResult = await client.query("SELECT id, key FROM permissions WHERE key = $1 LIMIT 1", [permissionKey]);
    const permission = permissionResult.rows[0];
    if (!permission) {
      const error = new Error("Permission was not found.");
      error.statusCode = 404;
      error.code = "PERMISSION_NOT_FOUND";
      throw error;
    }
    const before = { permissions: await getUserPermissionsWithClient(client, userId) };
    await client.query(
      `INSERT INTO user_permissions (user_id, permission_id, granted_by_id, reason)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, permission_id) DO UPDATE SET
         granted_by_id = EXCLUDED.granted_by_id,
         reason = EXCLUDED.reason`,
      [userId, permission.id, grantedById || null, reason || null]
    );
    const after = { permissions: await getUserPermissionsWithClient(client, userId) };
    if (audit) {
      await auditLog({
        ...audit,
        organizationId: audit.organizationId ?? target.organization_id ?? null,
        before,
        after,
        metadata: { ...(audit.metadata || {}), permissionKey },
        queryable: client,
        required: true,
      });
    }
    await client.query("COMMIT");
    return { target, permissionKey, before, after };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function revokeUserPermission(userId, permissionKey, { audit } = {}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const targetResult = await client.query(
      "SELECT id, organization_id, role, status FROM app_users WHERE id = $1 LIMIT 1",
      [userId]
    );
    const target = targetResult.rows[0];
    if (!target) {
      await client.query("ROLLBACK");
      return null;
    }
    const permissionResult = await client.query("SELECT id, key FROM permissions WHERE key = $1 LIMIT 1", [permissionKey]);
    const permission = permissionResult.rows[0];
    if (!permission) {
      const error = new Error("Permission was not found.");
      error.statusCode = 404;
      error.code = "PERMISSION_NOT_FOUND";
      throw error;
    }
    const before = { permissions: await getUserPermissionsWithClient(client, userId) };
    await client.query(
      "DELETE FROM user_permissions WHERE user_id = $1 AND permission_id = $2",
      [userId, permission.id]
    );
    const after = { permissions: await getUserPermissionsWithClient(client, userId) };
    if (audit) {
      await auditLog({
        ...audit,
        organizationId: audit.organizationId ?? target.organization_id ?? null,
        before,
        after,
        metadata: { ...(audit.metadata || {}), permissionKey },
        queryable: client,
        required: true,
      });
    }
    await client.query("COMMIT");
    return { target, permissionKey, before, after };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function requirePermission(user, permissionKey) {
  const permissions = await getUserPermissions(user.id);
  if (!permissions.includes(permissionKey)) {
    const error = new Error(`Missing permission: ${permissionKey}`);
    error.statusCode = 403;
    error.code = "FORBIDDEN";
    throw error;
  }
  return permissions;
}

const featureTables = {
  customers: {
    table: "customers",
    permission: "customers.view",
    orderBy: "updated_at DESC",
  },
  shipments: {
    table: "shipments",
    permission: "shipments.view_all",
    orderBy: "updated_at DESC",
  },
  tasks: {
    table: "tasks",
    permission: "tasks.view_all",
    orderBy: "updated_at DESC",
  },
  documents: {
    table: "documents",
    permission: "documents.view_all",
    orderBy: "updated_at DESC",
  },
};

export function getFeatureConfig(feature) {
  return featureTables[feature] || null;
}

export async function listFeatureRecords(feature, { organizationId, includeCustomerPrivateDetails = true } = {}) {
  const config = getFeatureConfig(feature);
  if (!config) {
    const error = new Error(`Unknown feature: ${feature}`);
    error.statusCode = 404;
    error.code = "NOT_FOUND";
    throw error;
  }
  if (feature === "shipments") {
    const rows = await listShipmentRecordsFromRepository(pool, { organizationId });
    return rows.map((row) => toUiShipment(row, { includeCustomerPrivateDetails }));
  }

  const scopedOrganizationId = requireOrganizationScope(organizationId, `listFeatureRecords:${feature}`);
  const values = [];
  const where = "WHERE organization_id = $1";
  values.push(scopedOrganizationId);
  const result = await pool.query(
    `SELECT * FROM ${config.table} ${where} ORDER BY ${config.orderBy}`,
    values
  );
  return result.rows;
}

export async function getShipmentRecord(shipmentId, { organizationId } = {}) {
  return getShipmentRecordFromRepository(pool, shipmentId, { organizationId });
}

export async function getShipmentOperationalRecord(shipmentId, { organizationId, includeCustomerPrivateDetails = true } = {}) {
  const row = await getShipmentRecordFromRepository(pool, shipmentId, { organizationId });
  return toUiShipment(row, { includeCustomerPrivateDetails });
}

function jsonObjectValue(value) {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function textValue(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function toUiShipment(row, { includeCustomerPrivateDetails = true } = {}) {
  if (!row) return null;
  const legacy = row.legacy_data || {};
  const v2Sections = jsonObjectValue(row.v2_sections_json);
  const v2Base = jsonObjectValue(v2Sections.base);
  const hasV2Profile = Boolean(row.v2_profile_id || row.v2_flow_code);
  const v2StatusText = textValue(v2Base.statusText);
  const v2CurrentStage = textValue(v2Base.currentStage);
  const v2Origin = textValue(v2Base.origin);
  const v2DischargePort = textValue(v2Base.dischargePort);
  const v2DeliveryPort = textValue(v2Base.deliveryPort);
  const freeTimeDays = Number(legacy.freeTimeDays || row.free_time_days || 0);
  const customerCode = row.customer_code || legacy.customerCode || legacy.customer_code || row.customer_id || legacy.customerId || "";
  const customerName = customerCode;
  return {
    id: row.id,
    trackingNumber: row.shipment_code || legacy.trackingNumber || row.id,
    containerNumber: legacy.containerNumber || "",
    customerId: row.customer_id || legacy.customerId || "",
    customerCode,
    customerName,
    origin: v2Origin || row.origin || legacy.origin || "",
    destination: v2DeliveryPort || row.destination || legacy.destination || "",
    status: row.status || legacy.status || "PENDING",
    v2ProfileId: row.v2_profile_id || null,
    v2FlowCode: row.v2_flow_code || null,
    hasV2Profile,
    displayStatusText: v2StatusText,
    currentStage: v2CurrentStage,
    dischargePort: v2DischargePort,
    deliveryPort: v2DeliveryPort || row.destination || legacy.destination || "",
    shipmentDirection: row.shipment_direction || legacy.shipmentDirection || legacy.shipment_direction || "import",
    transportMode: row.transport_mode || legacy.transportMode || legacy.transport_mode || "",
    shipmentTypeCode: row.shipment_type_code || legacy.shipmentTypeCode || legacy.shipment_type_code || DEFAULT_SHIPMENT_TYPE_CODE,
    createdAt: row.created_at || legacy.createdAt || new Date().toISOString(),
    estimatedDelivery: row.estimated_delivery_at || legacy.estimatedDelivery || "",
    actualDelivery: row.actual_delivery_at || legacy.actualDelivery || undefined,
    freeTimeDays: Number.isFinite(freeTimeDays) ? freeTimeDays : 0,
    isArchived: Boolean(row.archived_at || legacy.isArchived),
    isExitedArchived: Boolean(row.exited_archived_at),
    exitedArchivedAt: row.exited_archived_at || null,
    exitedArchivedById: row.exited_archived_by_id || null,
    exitedArchiveReason: row.exited_archive_reason || "",
    postExitStatus: row.post_exit_status || "needs_follow_up",
    postExitNote: row.post_exit_note || "",
    postExitFollowUpAt: row.post_exit_follow_up_at || null,
    postExitClosedAt: row.post_exit_closed_at || null,
    postExitClosedById: row.post_exit_closed_by_id || null,
    customerAccessEnabled: Boolean(row.customer_access_enabled || legacy.customerAccessEnabled),
    hasCustomerAccess: Boolean(
      row.customer_access_enabled ||
        legacy.customerAccessEnabled ||
        legacy.publicTrackingToken ||
        legacy.customerAccessToken
    ),
    priority: row.priority || legacy.priority || "normal",
    assignedManagerId: row.assigned_manager_id || legacy.assignedManagerId || undefined,
    updatedAt: row.updated_at || legacy.updatedAt || row.created_at || new Date().toISOString(),
    notes: legacy.notes || "",
    containerCount: legacy.containerCount ?? undefined,
    grossWeightKg: legacy.grossWeightKg ?? legacy.weight ?? undefined,
    weight: legacy.weight ?? legacy.grossWeightKg ?? undefined,
    customsDeclarationNumber: legacy.customsDeclarationNumber || "",
    customsStatus: legacy.customsStatus || "",
    importPermitNumber: legacy.importPermitNumber || "",
  };
}

function shipmentTypeColumnsFromMutation(updates = {}, fallback = {}) {
  const requestedType =
    updates.shipmentTypeCode ??
    updates.shipment_type_code ??
    fallback.shipment_type_code ??
    fallback.shipmentTypeCode ??
    DEFAULT_SHIPMENT_TYPE_CODE;
  const shipmentTypeCode = normalizeShipmentTypeCode(requestedType);
  const shipmentType = shipmentTypeByCode.get(shipmentTypeCode);
  const shipmentDirection =
    updates.shipmentDirection ??
    updates.shipment_direction ??
    fallback.shipment_direction ??
    fallback.shipmentDirection ??
    shipmentType?.direction ??
    "import";
  const transportMode =
    updates.transportMode ??
    updates.transport_mode ??
    fallback.transport_mode ??
    fallback.transportMode ??
    shipmentType?.transportMode ??
    null;
  return {
    shipmentTypeCode,
    shipmentDirection,
    transportMode,
  };
}

function cleanShipmentLegacyPatch(updates = {}) {
  const legacyPatch = {};
  for (const key of [
    "containerNumber",
    "containerCount",
    "grossWeightKg",
    "weight",
    "actualDelivery",
    "freeTimeDays",
    "notes",
    "customsDeclarationNumber",
    "customsStatus",
    "importPermitNumber",
  ]) {
    if (updates[key] !== undefined) legacyPatch[key] = updates[key] ?? "";
  }
  if (updates.shipmentTypeCode !== undefined || updates.shipment_type_code !== undefined) {
    legacyPatch.shipmentTypeCode = updates.shipmentTypeCode ?? updates.shipment_type_code ?? "";
  }
  if (updates.shipmentDirection !== undefined || updates.shipment_direction !== undefined) {
    legacyPatch.shipmentDirection = updates.shipmentDirection ?? updates.shipment_direction ?? "";
  }
  if (updates.transportMode !== undefined || updates.transport_mode !== undefined) {
    legacyPatch.transportMode = updates.transportMode ?? updates.transport_mode ?? "";
  }
  return legacyPatch;
}

async function validateShipmentMutationRelations(client, { organizationId, ownerUserId, customerId, assignedManagerId }) {
  if (ownerUserId) {
    const owner = await client.query("SELECT organization_id FROM app_users WHERE id = $1", [ownerUserId]);
    if (owner.rows[0]?.organization_id !== organizationId) {
      const error = new Error("Shipment owner does not belong to the authenticated organization.");
      error.code = "TENANT_SCOPE_REQUIRED";
      error.statusCode = 403;
      throw error;
    }
  }

  let customerRow = null;
  if (customerId) {
    const customer = await client.query(
      "SELECT id, customer_code, company_name, contact_name FROM customers WHERE id = $1 AND organization_id = $2 AND archived_at IS NULL",
      [customerId, organizationId]
    );
    if (!customer.rows[0]) {
      const error = new Error("Shipment customer was not found.");
      error.code = "CUSTOMER_NOT_FOUND";
      error.statusCode = 404;
      throw error;
    }
    customerRow = customer.rows[0];
  }

  if (assignedManagerId) {
    const manager = await client.query(
      "SELECT id FROM app_users WHERE id = $1 AND organization_id = $2 AND status <> 'suspended'",
      [assignedManagerId, organizationId]
    );
    if (!manager.rows[0]) {
      const error = new Error("Assigned manager was not found.");
      error.code = "ASSIGNED_MANAGER_NOT_FOUND";
      error.statusCode = 404;
      throw error;
    }
  }

  return customerRow;
}

export async function createShipmentRecord({ ownerUserId, actorUserId, organizationId, tenantContext, shipment, includeCustomerPrivateDetails = true }) {
  const scopedOrganizationId = tenantContext
    ? organizationIdFromTenantContext(tenantContext, "createShipmentRecord")
    : requireOrganizationScope(organizationId, "createShipmentRecord");
  const client = await pool.connect();
  const id = crypto.randomUUID();
  const shipmentCode = String(shipment.shipmentCode || shipment.trackingNumber || "").trim();
  const legacyPatch = cleanShipmentLegacyPatch(shipment);
  const typeColumns = shipmentTypeColumnsFromMutation(shipment);

  try {
    await client.query("BEGIN");
    const customer = await validateShipmentMutationRelations(client, {
      organizationId: scopedOrganizationId,
      ownerUserId,
      customerId: shipment.customerId || null,
      assignedManagerId: shipment.assignedManagerId || null,
    });
    const codeParts = await resolveManualShipmentCode(client, {
      organizationId: scopedOrganizationId,
      shipmentCode,
    });
    const result = await client.query(
      `INSERT INTO shipments (
         id, organization_id, owner_user_id, shipment_code, customer_id, customer_name, status,
         shamsi_year, shamsi_date, shamsi_sequence,
         shipment_direction, transport_mode, shipment_type_code,
         origin, destination, estimated_delivery_at, assigned_manager_id, legacy_data, created_by_id, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18::jsonb, $19, NOW())
       RETURNING *`,
      [
        id,
        scopedOrganizationId,
        ownerUserId,
        codeParts.shipmentCode,
        shipment.customerId || null,
        shipment.customerName || customer?.company_name || customer?.contact_name || null,
        shipment.status || "PENDING",
        codeParts.shamsiYear,
        codeParts.shamsiDate,
        codeParts.shamsiSequence,
        typeColumns.shipmentDirection,
        typeColumns.transportMode,
        typeColumns.shipmentTypeCode,
        shipment.origin || null,
        shipment.destination || null,
        shipment.estimatedDelivery || null,
        shipment.assignedManagerId || null,
        JSON.stringify({
          ...legacyPatch,
          trackingNumber: codeParts.shipmentCode,
          customerId: shipment.customerId || undefined,
          customerName: shipment.customerName || customer?.company_name || customer?.contact_name || undefined,
          shipmentTypeCode: typeColumns.shipmentTypeCode,
          shipmentDirection: typeColumns.shipmentDirection,
          transportMode: typeColumns.transportMode,
        }),
        actorUserId || ownerUserId,
      ]
    );
    await client.query("COMMIT");
    return toUiShipment(
      {
        ...result.rows[0],
        customer_code: customer?.customer_code || null,
        customer_display_name: customer?.company_name || customer?.contact_name || result.rows[0].customer_name || "",
      },
      { includeCustomerPrivateDetails }
    );
  } catch (error) {
    await client.query("ROLLBACK");
    if (error?.code === "23505") {
      error.statusCode = 409;
      error.code = "SHIPMENT_CODE_EXISTS";
      error.message = SHIPMENT_CODE_ERRORS.duplicate;
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function updateShipmentOperationalFields(id, updates = {}, { organizationId, actorUserId, includeCustomerPrivateDetails = true } = {}) {
  const scopedOrganizationId = requireOrganizationScope(organizationId, "updateShipmentOperationalFields");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const beforeResult = await client.query(
      `SELECT
         s.*,
         c.customer_code,
         COALESCE(c.company_name, c.contact_name, s.customer_name, s.legacy_data->>'customerName') AS customer_display_name
       FROM shipments s
       LEFT JOIN customers c
         ON c.id = s.customer_id
        AND c.organization_id = s.organization_id
        AND c.archived_at IS NULL
       WHERE s.id = $1
         AND s.organization_id = $2
       FOR UPDATE OF s`,
      [id, scopedOrganizationId]
    );
    const before = beforeResult.rows[0];
    if (!before) {
      await client.query("ROLLBACK");
      return null;
    }

    const customer = await validateShipmentMutationRelations(client, {
      organizationId: scopedOrganizationId,
      customerId: updates.customerId || null,
      assignedManagerId: updates.assignedManagerId || null,
    });
    const legacyPatch = cleanShipmentLegacyPatch(updates);
    const hasShipmentTypeUpdate =
      updates.shipmentTypeCode !== undefined ||
      updates.shipment_type_code !== undefined ||
      updates.shipmentDirection !== undefined ||
      updates.shipment_direction !== undefined ||
      updates.transportMode !== undefined ||
      updates.transport_mode !== undefined;
    const typeColumns = shipmentTypeColumnsFromMutation(updates, before);
    let nextShipmentCode = before.shipment_code;
    let nextShipmentCodeParts = null;
    if (updates.trackingNumber !== undefined || updates.shipmentCode !== undefined) {
      const requestedShipmentCode = String(updates.shipmentCode || updates.trackingNumber || "").trim();
      if (!requestedShipmentCode) {
        parseShipmentCode(requestedShipmentCode);
      }
      if (requestedShipmentCode && requestedShipmentCode !== before.shipment_code) {
        nextShipmentCodeParts = await resolveManualShipmentCode(client, {
          organizationId: scopedOrganizationId,
          shipmentCode: requestedShipmentCode,
          excludeShipmentId: id,
        });
        nextShipmentCode = nextShipmentCodeParts.shipmentCode;
      }
    }
    const nextLegacy = {
      ...(before.legacy_data || {}),
      ...legacyPatch,
      ...(updates.trackingNumber !== undefined || updates.shipmentCode !== undefined
        ? { trackingNumber: nextShipmentCode }
        : {}),
      ...(updates.customerId !== undefined ? { customerId: updates.customerId || "" } : {}),
      ...(updates.customerName !== undefined ? { customerName: updates.customerName || "" } : {}),
      ...(hasShipmentTypeUpdate
        ? {
            shipmentTypeCode: typeColumns.shipmentTypeCode,
            shipmentDirection: typeColumns.shipmentDirection,
            transportMode: typeColumns.transportMode,
          }
        : {}),
    };

    const columns = [];
    const values = [id, scopedOrganizationId];
    const addColumn = (column, value) => {
      values.push(value);
      columns.push(`${column} = $${values.length}`);
    };

    if (updates.trackingNumber !== undefined || updates.shipmentCode !== undefined) {
      addColumn("shipment_code", nextShipmentCode);
      if (nextShipmentCodeParts) {
        addColumn("shamsi_year", nextShipmentCodeParts.shamsiYear);
        addColumn("shamsi_date", nextShipmentCodeParts.shamsiDate);
        addColumn("shamsi_sequence", nextShipmentCodeParts.shamsiSequence);
      }
    }
    if (updates.customerId !== undefined) addColumn("customer_id", updates.customerId || null);
    if (updates.customerName !== undefined || customer) {
      addColumn("customer_name", updates.customerName || customer?.company_name || customer?.contact_name || null);
    }
    if (updates.status !== undefined) addColumn("status", updates.status);
    if (hasShipmentTypeUpdate) {
      addColumn("shipment_direction", typeColumns.shipmentDirection || null);
      addColumn("transport_mode", typeColumns.transportMode || null);
      addColumn("shipment_type_code", typeColumns.shipmentTypeCode);
    }
    if (updates.origin !== undefined) addColumn("origin", updates.origin || null);
    if (updates.destination !== undefined) addColumn("destination", updates.destination || null);
    if (updates.estimatedDelivery !== undefined) addColumn("estimated_delivery_at", updates.estimatedDelivery || null);
    if (updates.assignedManagerId !== undefined) addColumn("assigned_manager_id", updates.assignedManagerId || null);
    addColumn("legacy_data", JSON.stringify(nextLegacy));

    const result = await client.query(
      `UPDATE shipments
       SET ${columns.join(", ")},
           updated_at = NOW()
       WHERE id = $1 AND organization_id = $2
       RETURNING *`,
      values
    );
    await client.query("COMMIT");
    return {
      before: toUiShipment(before, { includeCustomerPrivateDetails }),
      after: toUiShipment(
        {
          ...result.rows[0],
          customer_code: customer?.customer_code || before.customer_code || null,
          customer_display_name: customer?.company_name || customer?.contact_name || result.rows[0].customer_name || "",
        },
        { includeCustomerPrivateDetails }
      ),
    };
  } catch (error) {
    await client.query("ROLLBACK");
    if (error?.code === "23505") {
      error.statusCode = 409;
      error.code = "SHIPMENT_CODE_EXISTS";
      error.message = SHIPMENT_CODE_ERRORS.duplicate;
    }
    throw error;
  } finally {
    client.release();
  }
}

const POST_EXIT_STATUS_VALUES = new Set(["needs_follow_up", "in_progress", "settled", "closed"]);

function normalizePostExitStatus(value, fallback = "needs_follow_up") {
  const normalized = String(value || fallback || "needs_follow_up").trim();
  return POST_EXIT_STATUS_VALUES.has(normalized) ? normalized : "needs_follow_up";
}

function toExitedShipment(row) {
  if (!row) return null;
  const customerCode = row.customer_code || row.customer_id || "";
  return {
    ...toUiShipment(row),
    customerDisplayName: customerCode,
    cotageNumber: row.cotage_number || "",
    declarationReference: row.declaration_reference || "",
    exitDate: row.exit_date || "",
    releaseStatus: row.release_status || "",
    customsStatus: row.customs_status || "",
    assignedManagerName: row.assigned_manager_name || "",
    lastUpdatedAt: row.shipment_updated_at || row.updated_at || row.exited_archived_at || row.created_at,
  };
}

export async function listExitedShipmentRecords({
  organizationId,
  filters = {},
} = {}) {
  const scopedOrganizationId = requireOrganizationScope(organizationId, "listExitedShipmentRecords");
  const values = [scopedOrganizationId];
  const conditions = [
    "s.organization_id = $1",
    "s.archived_at IS NULL",
    "s.exited_archived_at IS NOT NULL",
  ];
  const addValue = (value) => `$${values.push(value)}`;

  if (filters.customerId) conditions.push(`s.customer_id = ${addValue(filters.customerId)}`);
  if (filters.shipmentTypeCode) conditions.push(`s.shipment_type_code = ${addValue(filters.shipmentTypeCode)}`);
  if (filters.postExitStatus) conditions.push(`s.post_exit_status = ${addValue(filters.postExitStatus)}`);
  if (filters.assignedManagerId) conditions.push(`s.assigned_manager_id = ${addValue(filters.assignedManagerId)}`);
  if (filters.exitDateFrom) conditions.push(`k.exit_date >= ${addValue(filters.exitDateFrom)}`);
  if (filters.exitDateTo) conditions.push(`k.exit_date <= ${addValue(filters.exitDateTo)}`);
  if (filters.q) {
    const queryParam = addValue(`%${filters.q}%`);
    conditions.push(`(
      s.shipment_code ILIKE ${queryParam}
      OR s.customer_name ILIKE ${queryParam}
      OR c.company_name ILIKE ${queryParam}
      OR c.contact_name ILIKE ${queryParam}
      OR k.cotage_number ILIKE ${queryParam}
      OR k.declaration_reference ILIKE ${queryParam}
      OR k.bill_of_lading_number ILIKE ${queryParam}
      OR k.order_registration_number ILIKE ${queryParam}
    )`);
  }

  const limitParam = addValue(filters.limit || 100);
  const result = await pool.query(
    `SELECT
       s.*,
       s.updated_at AS shipment_updated_at,
       c.customer_code,
       COALESCE(c.customer_code, s.customer_id) AS customer_display_name,
       k.cotage_number,
       k.declaration_reference,
       k.exit_date,
       k.release_status,
       k.customs_status,
       assigned_manager.name AS assigned_manager_name
     FROM shipments s
     LEFT JOIN customers c
       ON c.id = s.customer_id
      AND c.organization_id = s.organization_id
     LEFT JOIN shipment_kootaj_details k
       ON k.shipment_id = s.id
      AND k.organization_id = s.organization_id
     LEFT JOIN app_users assigned_manager
       ON assigned_manager.id = s.assigned_manager_id
      AND assigned_manager.organization_id = s.organization_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY COALESCE(s.post_exit_follow_up_at, s.exited_archived_at, s.updated_at) DESC, s.updated_at DESC
     LIMIT ${limitParam}`,
    values
  );
  return result.rows.map(toExitedShipment);
}

export async function moveShipmentToExitedArchive(id, { organizationId, actorUserId, reason } = {}) {
  const scopedOrganizationId = requireOrganizationScope(organizationId, "moveShipmentToExitedArchive");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const beforeResult = await client.query(
      `SELECT *
       FROM shipments
       WHERE id = $1
         AND organization_id = $2
         AND archived_at IS NULL
       FOR UPDATE`,
      [id, scopedOrganizationId]
    );
    const before = beforeResult.rows[0];
    if (!before) {
      await client.query("ROLLBACK");
      return null;
    }
    const result = await client.query(
      `UPDATE shipments
       SET exited_archived_at = COALESCE(exited_archived_at, NOW()),
           exited_archived_by_id = COALESCE(exited_archived_by_id, $3),
           exited_archive_reason = $4,
           post_exit_status = COALESCE(post_exit_status, 'needs_follow_up'),
           updated_at = NOW()
       WHERE id = $1
         AND organization_id = $2
       RETURNING *`,
      [id, scopedOrganizationId, actorUserId || null, reason || null]
    );
    await client.query("COMMIT");
    return {
      before: toUiShipment(before),
      after: toUiShipment(result.rows[0]),
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function restoreShipmentFromExitedArchive(id, { organizationId, actorUserId } = {}) {
  const scopedOrganizationId = requireOrganizationScope(organizationId, "restoreShipmentFromExitedArchive");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const beforeResult = await client.query(
      `SELECT *
       FROM shipments
       WHERE id = $1
         AND organization_id = $2
         AND archived_at IS NULL
       FOR UPDATE`,
      [id, scopedOrganizationId]
    );
    const before = beforeResult.rows[0];
    if (!before) {
      await client.query("ROLLBACK");
      return null;
    }
    const result = await client.query(
      `UPDATE shipments
       SET exited_archived_at = NULL,
           updated_at = NOW()
       WHERE id = $1
         AND organization_id = $2
       RETURNING *`,
      [id, scopedOrganizationId]
    );
    await client.query("COMMIT");
    return {
      before: toUiShipment(before),
      after: toUiShipment(result.rows[0]),
      actorUserId,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function updateShipmentPostExitFields(id, updates = {}, { organizationId, actorUserId } = {}) {
  const scopedOrganizationId = requireOrganizationScope(organizationId, "updateShipmentPostExitFields");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const beforeResult = await client.query(
      `SELECT *
       FROM shipments
       WHERE id = $1
         AND organization_id = $2
         AND archived_at IS NULL
       FOR UPDATE`,
      [id, scopedOrganizationId]
    );
    const before = beforeResult.rows[0];
    if (!before) {
      await client.query("ROLLBACK");
      return null;
    }
    if (!before.exited_archived_at) {
      const error = new Error("Shipment is not in exited archive.");
      error.statusCode = 409;
      error.code = "SHIPMENT_NOT_EXITED_ARCHIVED";
      throw error;
    }

    const nextStatus = updates.postExitStatus !== undefined
      ? normalizePostExitStatus(updates.postExitStatus, before.post_exit_status)
      : before.post_exit_status || "needs_follow_up";
    const nextNote = updates.postExitNote !== undefined ? updates.postExitNote || null : before.post_exit_note;
    const nextFollowUpAt = updates.postExitFollowUpAt !== undefined ? updates.postExitFollowUpAt || null : before.post_exit_follow_up_at;
    const closeNow = nextStatus === "closed" && before.post_exit_status !== "closed";
    const reopen = nextStatus !== "closed";

    const result = await client.query(
      `UPDATE shipments
       SET post_exit_status = $3,
           post_exit_note = $4,
           post_exit_follow_up_at = $5,
           post_exit_closed_at = CASE
             WHEN $3 = 'closed' THEN COALESCE(post_exit_closed_at, NOW())
             WHEN $6::boolean THEN NULL
             ELSE post_exit_closed_at
           END,
           post_exit_closed_by_id = CASE
             WHEN $3 = 'closed' AND $7::boolean THEN $8
             WHEN $6::boolean THEN NULL
             ELSE post_exit_closed_by_id
           END,
           updated_at = NOW()
       WHERE id = $1
         AND organization_id = $2
       RETURNING *`,
      [
        id,
        scopedOrganizationId,
        nextStatus,
        nextNote,
        nextFollowUpAt,
        reopen,
        closeNow,
        actorUserId || null,
      ]
    );
    await client.query("COMMIT");
    return {
      before: toUiShipment(before),
      after: toUiShipment(result.rows[0]),
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function toUiDocument(row) {
  if (!row) return null;
  const legacy = row.legacy_data || {};
  return {
    id: row.id,
    shipmentId: row.shipment_id || legacy.shipmentId || undefined,
    customerId: row.customer_id || legacy.customerId || undefined,
    name: row.title || row.file_name || legacy.name || row.id,
    type: legacy.type || "OTHER",
    note: legacy.note || legacy.notes || "",
    fileSize: row.file_size || legacy.fileSize || "",
    uploadedBy: row.uploaded_by_name || legacy.uploadedBy || "",
    createdAt: row.created_at || legacy.createdAt || new Date().toISOString(),
    url: `/api/documents/${encodeURIComponent(row.id)}/download`,
    visibility: row.visibility || "internal",
    isArchived: Boolean(row.archived_at),
    version: row.version || 1,
  };
}

const documentStorageAuditKeys = new Set([
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

function sanitizeDocumentAuditSnapshot(value) {
  if (Array.isArray(value)) return value.map(sanitizeDocumentAuditSnapshot);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !documentStorageAuditKeys.has(key))
      .map(([key, nested]) => [key, sanitizeDocumentAuditSnapshot(nested)])
  );
}

function toUiTask(row) {
  if (!row) return null;
  const legacy = row.legacy_data || {};
  return {
    id: row.id,
    organizationId: row.organization_id || legacy.organizationId || undefined,
    ownerUserId: row.owner_user_id || legacy.ownerUserId || undefined,
    title: row.title,
    description: row.description || "",
    assignedToUserId: row.assigned_to_id || legacy.assignedToUserId || "",
    assignedToName: row.assigned_to_name || legacy.assignedToName || "",
    assignedByUserId: row.assigned_by_id || legacy.assignedByUserId || "",
    assignedByName: row.assigned_by_name || legacy.assignedByName || "",
    assignedAt: row.assigned_at || legacy.assignedAt || "",
    assignmentNote: row.assignment_note || legacy.assignmentNote || "",
    status: row.status || legacy.status || "TODO",
    priority: row.priority || legacy.priority || "MEDIUM",
    dueDate: row.due_at || legacy.dueDate || "",
    deadline: legacy.deadline || "",
    shipmentId: row.shipment_id || legacy.shipmentId || undefined,
    createdAt: row.created_at || legacy.createdAt || new Date().toISOString(),
    completedAt: row.completed_at || legacy.completedAt || undefined,
    completedByUserId: row.completed_by_user_id || legacy.completedByUserId || undefined,
    sourceType: row.source_type || legacy.sourceType || "MANUAL",
    sourceId: row.source_id || legacy.sourceId || undefined,
    workflowInstanceId: row.workflow_instance_id || legacy.workflowInstanceId || undefined,
    workflowStepCode: row.workflow_step_code || legacy.workflowStepCode || undefined,
    workflowBlockerId: row.workflow_blocker_id || legacy.workflowBlockerId || undefined,
    blockerCode: row.blocker_code || legacy.blockerCode || undefined,
  };
}

function toUiUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    avatar: row.avatar || undefined,
    isOnline: Boolean(row.is_online),
    phone: row.phone || undefined,
    location: row.location || undefined,
    bio: row.bio || undefined,
    department: row.department || undefined,
    status: row.status || "active",
    lastSeenAt: row.last_seen_at || undefined,
    twoFactorEnabled: Boolean(row.two_factor_enabled),
    notificationPreferences: row.notification_preferences || {},
    organizationId: row.organization_id || undefined,
    organizationStatus: row.organization_status || undefined,
    organizationName: row.organization_name || undefined,
    organizationPlanId: row.organization_plan_id || undefined,
  };
}

function toUiCustomer(row, options = {}) {
  return toUiCustomerFromRepository(row, options);
}

function toUiQuote(row, { includeCustomerPrivateDetails = true } = {}) {
  if (!row) return null;
  const legacy = row.legacy_data || {};
  const quote = {
    id: row.id,
    customerId: row.customer_id || legacy.customerId || undefined,
    customerName: row.customer_name || legacy.customerName || "",
    customerPhone: row.customer_phone || legacy.customerPhone || "",
    originCity: row.origin_city || legacy.originCity || "",
    destinationCity: row.destination_city || legacy.destinationCity || "",
    cargoType: row.cargo_type || legacy.cargoType || "GENERAL",
    weight: Number(row.weight || legacy.weight || 0),
    dimensions: row.dimensions || legacy.dimensions || "",
    pickupDate: row.pickup_date || legacy.pickupDate || "",
    deliveryDate: row.delivery_date || legacy.deliveryDate || "",
    requirements: Array.isArray(row.requirements) ? row.requirements : legacy.requirements || [],
    baseRate: Number(row.base_rate || legacy.baseRate || 0),
    fuelSurcharge: Number(row.fuel_surcharge || legacy.fuelSurcharge || 0),
    loadingFees: Number(row.loading_fees || legacy.loadingFees || 0),
    tollFees: Number(row.toll_fees || legacy.tollFees || 0),
    insurancePercentage: Number(row.insurance_percentage || legacy.insurancePercentage || 0),
    profitMargin: Number(row.profit_margin || legacy.profitMargin || 0),
    totalPrice: Number(row.total_price || legacy.totalPrice || 0),
    validUntil: row.valid_until || legacy.validUntil || "",
    status: row.status || legacy.status || "PENDING",
    notes: row.notes || legacy.notes || "",
    createdAt: row.created_at || legacy.createdAt || new Date().toISOString(),
    convertedShipmentId: row.converted_shipment_id || legacy.convertedShipmentId || undefined,
    isArchived: Boolean(row.archived_at),
  };
  if (includeCustomerPrivateDetails) return quote;
  return { ...quote, customerPhone: "" };
}

function toUiCheque(row) {
  if (!row) return null;
  const legacy = row.legacy_data || {};
  return {
    id: row.id,
    bankName: row.bank_name || legacy.bankName || "",
    chequeNumber: row.cheque_number || legacy.chequeNumber || "",
    amount: Number(row.amount || legacy.amount || 0),
    dueDate: row.due_date || legacy.dueDate || "",
    location: row.location || legacy.location || "",
    receiver: row.receiver || legacy.receiver || "",
    status: row.status || legacy.status || "ACTIVE",
    description: row.description || legacy.description || "",
    createdAt: row.created_at || legacy.createdAt || new Date().toISOString(),
  };
}

function toUiAppointment(row, documents = []) {
  if (!row) return null;
  const legacy = row.legacy_data || {};
  const legacyRequiredDocuments = Array.isArray(legacy.requiredDocuments) ? legacy.requiredDocuments : [];
  return {
    id: row.id,
    dateTime: row.meeting_at || legacy.dateTime || "",
    departmentName: row.organization_name || legacy.departmentName || "",
    purpose: row.title || legacy.purpose || "",
    requiredDocuments: documents.length ? documents.map(toUiAppointmentDocument) : legacyRequiredDocuments,
    assignedPersonId: row.assigned_to_id || legacy.assignedPersonId || "",
    assignedPersonName: row.assigned_to_name || legacy.assignedPersonName || "",
    status: row.status || legacy.status || "SCHEDULED",
    outcome: row.outcome || legacy.outcome || "",
    nextActionItems: row.next_action_items || legacy.nextActionItems || "",
    reminderSent: Boolean(row.reminder_sent ?? legacy.reminderSent),
    createdAt: row.created_at || legacy.createdAt || new Date().toISOString(),
    isArchived: Boolean(row.archived_at),
  };
}

function toUiAppointmentDocument(row) {
  const legacy = row?.legacy_data || {};
  return {
    id: row.id,
    name: row.name || legacy.name || "",
    required: Boolean(row.required ?? legacy.required),
    completed: Boolean(row.completed ?? legacy.completed),
    fileName: row.file_name || legacy.fileName || undefined,
  };
}

async function syncDocumentUserRecord(client, ownerUserId, documentRow) {
  if (!ownerUserId || !documentRow) return;
  const uiDocument = toUiDocument(documentRow);
  await client.query(
    `INSERT INTO user_records (owner_user_id, organization_id, collection, item_id, data, updated_at)
     VALUES ($1, $2, 'documents', $3, $4::jsonb, NOW())
     ON CONFLICT (owner_user_id, collection, item_id) DO UPDATE SET
       organization_id = EXCLUDED.organization_id,
       data = EXCLUDED.data,
       updated_at = NOW()`,
    [ownerUserId, documentRow.organization_id || null, documentRow.id, JSON.stringify(uiDocument)]
  );
}

async function syncTaskUserRecord(client, ownerUserId, taskRow) {
  if (!ownerUserId || !taskRow) return;
  const uiTask = toUiTask(taskRow);
  await client.query(
    `INSERT INTO user_records (owner_user_id, organization_id, collection, item_id, data, updated_at)
     VALUES ($1, $2, 'tasks', $3, $4::jsonb, NOW())
     ON CONFLICT (owner_user_id, collection, item_id) DO UPDATE SET
       organization_id = EXCLUDED.organization_id,
       data = EXCLUDED.data,
       updated_at = NOW()`,
    [ownerUserId, taskRow.organization_id || null, taskRow.id, JSON.stringify(uiTask)]
  );
}

async function syncNotificationUserRecord(client, userId, notificationRow) {
  if (!userId || !notificationRow) return;
  const uiNotification = {
    id: notificationRow.id,
    title: notificationRow.title,
    message: notificationRow.body || "",
    type: notificationRow.type || "INFO",
    isRead: Boolean(notificationRow.read_at),
    createdAt: notificationRow.created_at || new Date().toISOString(),
    link: notificationRow.legacy_data?.link || notificationRow.source_id || "/dashboard",
  };
  await client.query(
    `INSERT INTO user_records (owner_user_id, collection, item_id, data, updated_at)
     VALUES ($1, 'notifications', $2, $3::jsonb, NOW())
     ON CONFLICT (owner_user_id, collection, item_id) DO UPDATE SET
       data = EXCLUDED.data,
       updated_at = NOW()`,
    [userId, notificationRow.id, JSON.stringify(uiNotification)]
  );
}

async function syncChequeUserRecord(client, ownerUserId, chequeRow) {
  if (!ownerUserId || !chequeRow) return;
  const uiCheque = toUiCheque(chequeRow);
  await client.query(
    `INSERT INTO user_records (owner_user_id, organization_id, collection, item_id, data, updated_at)
     VALUES ($1, $2, 'cheques', $3, $4::jsonb, NOW())
     ON CONFLICT (owner_user_id, collection, item_id) DO UPDATE SET
       organization_id = EXCLUDED.organization_id,
       data = EXCLUDED.data,
       updated_at = NOW()`,
    [ownerUserId, chequeRow.organization_id || null, chequeRow.id, JSON.stringify(uiCheque)]
  );
}

async function syncMeetingUserRecord(client, ownerUserId, meetingRow) {
  if (!ownerUserId || !meetingRow) return;
  const docs = await client.query(
    `SELECT *
     FROM meeting_required_documents
     WHERE meeting_id = $1
     ORDER BY created_at ASC`,
    [meetingRow.id]
  );
  const uiMeeting = toUiAppointment(meetingRow, docs.rows);
  await client.query(
    `INSERT INTO user_records (owner_user_id, organization_id, collection, item_id, data, updated_at)
     VALUES ($1, $2, 'appointments', $3, $4::jsonb, NOW())
     ON CONFLICT (owner_user_id, collection, item_id) DO UPDATE SET
       organization_id = EXCLUDED.organization_id,
       data = EXCLUDED.data,
       updated_at = NOW()`,
    [ownerUserId, meetingRow.organization_id || null, meetingRow.id, JSON.stringify(uiMeeting)]
  );
}

async function syncQuoteUserRecord(client, ownerUserId, quoteRow) {
  if (!ownerUserId || !quoteRow) return;
  const uiQuote = toUiQuote(quoteRow);
  await client.query(
    `INSERT INTO user_records (owner_user_id, organization_id, collection, item_id, data, updated_at)
     VALUES ($1, $2, 'quotes', $3, $4::jsonb, NOW())
     ON CONFLICT (owner_user_id, collection, item_id) DO UPDATE SET
       organization_id = EXCLUDED.organization_id,
       data = EXCLUDED.data,
       updated_at = NOW()`,
    [ownerUserId, quoteRow.organization_id || null, quoteRow.id, JSON.stringify(uiQuote)]
  );
}

async function syncCustomerUserRecord(client, ownerUserId, customerRow) {
  if (!ownerUserId || !customerRow) return;
  const phoneNumbers = await listCustomerPhoneNumbers(client, {
    organizationId: customerRow.organization_id,
    customerId: customerRow.id,
  });
  const uiCustomer = toUiCustomer(customerRow, { phoneNumbers });
  await client.query(
    `INSERT INTO user_records (owner_user_id, organization_id, collection, item_id, data, updated_at)
     VALUES ($1, $2, 'customers', $3, $4::jsonb, NOW())
     ON CONFLICT (owner_user_id, collection, item_id) DO UPDATE SET
       organization_id = EXCLUDED.organization_id,
       data = EXCLUDED.data,
       updated_at = NOW()`,
    [ownerUserId, customerRow.organization_id || null, customerRow.id, JSON.stringify(uiCustomer)]
  );
}

async function syncUsersCollection(client, ownerUserId) {
  if (!ownerUserId) return;
  const owner = await client.query("SELECT organization_id FROM app_users WHERE id = $1", [ownerUserId]);
  const organizationId = owner.rows[0]?.organization_id || null;
  await syncUsersCollectionForOrganization(client, organizationId, ownerUserId);
}

async function syncUsersCollectionForOrganization(client, organizationId, fallbackOwnerUserId = null) {
  const result = await client.query(
    `SELECT id, name, email, role, avatar, is_online, department, status, last_seen_at,
            phone, location, bio, two_factor_enabled, notification_preferences, organization_id
     FROM app_users
     ${organizationId ? "WHERE organization_id = $1" : ""}
     ORDER BY name ASC`
    ,
    organizationId ? [organizationId] : []
  );
  const ownerIds = organizationId ? result.rows.map((row) => row.id) : [fallbackOwnerUserId].filter(Boolean);
  for (const targetOwnerId of ownerIds) {
    for (const row of result.rows) {
      await client.query(
        `INSERT INTO user_records (owner_user_id, organization_id, collection, item_id, data, updated_at)
         VALUES ($1, $2, 'users', $3, $4::jsonb, NOW())
         ON CONFLICT (owner_user_id, collection, item_id) DO UPDATE SET
           organization_id = EXCLUDED.organization_id,
           data = EXCLUDED.data,
           updated_at = NOW()`,
        [targetOwnerId, organizationId, row.id, JSON.stringify(toUiUser(row))]
      );
    }
  }
}

function documentSelect() {
  return `SELECT d.*, u.name AS uploaded_by_user_name
          FROM documents d
          LEFT JOIN app_users u ON u.id = d.uploaded_by_id`;
}

function taskSelect() {
  return `SELECT t.*
          FROM tasks t`;
}

function normalizeTaskStatus(status) {
  const value = String(status || "TODO").trim().toUpperCase();
  const aliases = {
    OPEN: "TODO",
    ASSIGNED: "ASSIGNED",
    WAITING: "WAITING",
    INPROGRESS: "IN_PROGRESS",
    IN_PROGRESS: "IN_PROGRESS",
    BLOCKED: "BLOCKED",
    DONE: "DONE",
    COMPLETED: "DONE",
    CANCELLED: "CANCELLED",
    CANCELED: "CANCELLED",
    TODO: "TODO",
  };
  return aliases[value] || "TODO";
}

function normalizeTaskPriority(priority) {
  const value = String(priority || "MEDIUM").trim().toUpperCase();
  const aliases = {
    LOW: "LOW",
    NORMAL: "MEDIUM",
    MEDIUM: "MEDIUM",
    HIGH: "HIGH",
    URGENT: "URGENT",
  };
  return aliases[value] || "MEDIUM";
}

async function createTaskNotification(client, { userId, task, title, body }) {
  if (!userId) return null;
  const id = crypto.randomUUID();
  const link = task?.shipment_id ? `/shipments/${task.shipment_id}` : "/tasks";
  const result = await client.query(
    `INSERT INTO notifications (
       id, organization_id, user_id, title, body, type, source_type, source_id, legacy_data, created_at
     )
     VALUES ($1, (SELECT organization_id FROM app_users WHERE id = $2), $2, $3, $4, 'INFO', 'TASK', $5, $6::jsonb, NOW())
     RETURNING *`,
    [
      id,
      userId,
      title,
      body || null,
      task?.id || null,
      JSON.stringify({ link }),
    ]
  );
  await syncNotificationUserRecord(client, userId, result.rows[0]);
  return result.rows[0];
}

export async function listDocuments({ ownerUserId, shipmentId, customerId, organizationId, includeArchived = false } = {}) {
  return listDocumentsFromRepository(pool, { ownerUserId, shipmentId, customerId, organizationId, includeArchived });
}

export async function createDocumentRecord({
  ownerUserId,
  organizationId,
  tenantContext,
  title,
  type,
  fileName,
  mimeType,
  fileSize,
  storageKey,
  storageProvider = "local",
  objectKey = null,
  storageBucket = null,
  storageRegion = null,
  localPath = null,
  checksum,
  checksumSha256 = null,
  sizeBytes = null,
  contentType = null,
  storageMigratedAt = null,
  storageVerifiedAt = null,
  storageMigrationStatus = "local",
  storageMigrationError = null,
  uploadedById,
  uploadedByName,
  shipmentId,
  customerId,
  note,
  visibility = "internal",
}) {
  const scopedOrganizationId = tenantContext
    ? organizationIdFromTenantContext(tenantContext, "createDocumentRecord")
    : requireOrganizationScope(organizationId, "createDocumentRecord");
  const client = await pool.connect();
  const id = crypto.randomUUID();
  const safeVisibility = visibility === "customer_visible" ? "customer_visible" : "internal";

  try {
    await client.query("BEGIN");
    const owner = await client.query("SELECT organization_id FROM app_users WHERE id = $1", [ownerUserId]);
    if (owner.rows[0]?.organization_id !== scopedOrganizationId) {
      await client.query("ROLLBACK");
      const error = new Error("Document owner does not belong to the authenticated organization.");
      error.code = "TENANT_SCOPE_REQUIRED";
      error.statusCode = 403;
      throw error;
    }
    const result = await client.query(
      `INSERT INTO documents (
         id, organization_id, owner_user_id, title, file_name, mime_type, file_size, storage_key,
         storage_provider, object_key, storage_bucket, storage_region, local_path,
         checksum, checksum_sha256, size_bytes, content_type, storage_migrated_at,
         storage_verified_at, storage_migration_status, storage_migration_error,
         version, uploaded_by_id, uploaded_by_name, shipment_id, customer_id,
         visibility, legacy_data
       )
       VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8,
         $9, $10, $11, $12, $13,
         $14, $15, $16, $17, $18,
         $19, $20, $21,
         1, $22, $23, $24, $25,
         $26, $27::jsonb
       )
       RETURNING *`,
      [
        id,
        scopedOrganizationId,
        ownerUserId,
        title,
        fileName,
        mimeType,
        fileSize,
        storageKey,
        storageProvider || "local",
        objectKey || null,
        storageBucket || null,
        storageRegion || null,
        localPath || storageKey || null,
        checksum,
        checksumSha256 || checksum || null,
        sizeBytes === undefined ? null : sizeBytes,
        contentType || mimeType || null,
        storageMigratedAt || null,
        storageVerifiedAt || null,
        storageMigrationStatus || "local",
        storageMigrationError || null,
        uploadedById || null,
        uploadedByName || null,
        shipmentId || null,
        customerId || null,
        safeVisibility,
        JSON.stringify({ name: title, type: type || "OTHER", note: note || "" }),
      ]
    );

    await client.query(
      `INSERT INTO document_versions (
         id, organization_id, document_id, version, storage_key, storage_provider,
         object_key, storage_bucket, storage_region, local_path, checksum_sha256,
         size_bytes, content_type, storage_migrated_at, storage_verified_at,
         storage_migration_status, storage_migration_error, file_name, uploaded_by_id
       )
       VALUES (
         $1, $2, $3, 1, $4, $5,
         $6, $7, $8, $9, $10,
         $11, $12, $13, $14,
         $15, $16, $17, $18
       )
       ON CONFLICT (document_id, version) DO NOTHING`,
      [
        crypto.randomUUID(),
        scopedOrganizationId,
        id,
        storageKey,
        storageProvider || "local",
        objectKey || null,
        storageBucket || null,
        storageRegion || null,
        localPath || storageKey || null,
        checksumSha256 || checksum || null,
        sizeBytes === undefined ? null : sizeBytes,
        contentType || mimeType || null,
        storageMigratedAt || null,
        storageVerifiedAt || null,
        storageMigrationStatus || "local",
        storageMigrationError || null,
        fileName,
        uploadedById || null,
      ]
    );

    await syncDocumentUserRecord(client, ownerUserId, result.rows[0]);
    await client.query("COMMIT");
    return result.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getDocumentDetail(documentId, { organizationId } = {}) {
  return getDocumentDetailFromRepository(pool, documentId, { organizationId });
}

export async function getDocumentForDownload(documentId, { organizationId } = {}) {
  return getDocumentForDownloadFromRepository(pool, documentId, { organizationId });
}

export async function listDocumentStorageKeysForCleanup(documentId, { organizationId } = {}) {
  return listDocumentStorageKeysForCleanupFromRepository(pool, documentId, { organizationId });
}

export async function replaceDocumentFileRecord({
  documentId,
  fileName,
  mimeType,
  fileSize,
  storageKey,
  storageProvider = "local",
  objectKey = null,
  storageBucket = null,
  storageRegion = null,
  localPath = null,
  checksum,
  checksumSha256 = null,
  sizeBytes = null,
  contentType = null,
  storageMigratedAt = null,
  storageVerifiedAt = null,
  storageMigrationStatus = "local",
  storageMigrationError = null,
  uploadedById,
  organizationId,
}) {
  const scopedOrganizationId = requireOrganizationScope(organizationId, "replaceDocumentFileRecord");

  return withTransaction(pool, async (client) => {
    const beforeResult = await client.query(
      `SELECT * FROM documents WHERE id = $1 AND organization_id = $2`,
      [documentId, scopedOrganizationId]
    );
    const before = beforeResult.rows[0] || null;
    if (!before) {
      return null;
    }

    const nextVersion = Number(before.version || 1) + 1;
    const result = await client.query(
      `UPDATE documents
       SET file_name = $2,
           mime_type = $3,
           file_size = $4,
           storage_key = $5,
           storage_provider = $6,
           object_key = $7,
           storage_bucket = $8,
           storage_region = $9,
           local_path = $10,
           checksum = $11,
           checksum_sha256 = $12,
           size_bytes = $13,
           content_type = $14,
           storage_migrated_at = $15,
           storage_verified_at = $16,
           storage_migration_status = $17,
           storage_migration_error = $18,
           version = $19,
           updated_at = NOW()
       WHERE id = $1 AND organization_id = $20
       RETURNING *`,
      [
        documentId,
        fileName,
        mimeType,
        fileSize,
        storageKey,
        storageProvider || "local",
        objectKey || null,
        storageBucket || null,
        storageRegion || null,
        localPath || storageKey || null,
        checksum,
        checksumSha256 || checksum || null,
        sizeBytes === undefined ? null : sizeBytes,
        contentType || mimeType || null,
        storageMigratedAt || null,
        storageVerifiedAt || null,
        storageMigrationStatus || "local",
        storageMigrationError || null,
        nextVersion,
        scopedOrganizationId,
      ]
    );

    await client.query(
      `INSERT INTO document_versions (
         id, organization_id, document_id, version, storage_key, storage_provider,
         object_key, storage_bucket, storage_region, local_path, checksum_sha256,
         size_bytes, content_type, storage_migrated_at, storage_verified_at,
         storage_migration_status, storage_migration_error, file_name, uploaded_by_id
       )
       VALUES (
         $1, $2, $3, $4, $5, $6,
         $7, $8, $9, $10, $11,
         $12, $13, $14, $15,
         $16, $17, $18, $19
       )`,
      [
        crypto.randomUUID(),
        scopedOrganizationId,
        documentId,
        nextVersion,
        storageKey,
        storageProvider || "local",
        objectKey || null,
        storageBucket || null,
        storageRegion || null,
        localPath || storageKey || null,
        checksumSha256 || checksum || null,
        sizeBytes === undefined ? null : sizeBytes,
        contentType || mimeType || null,
        storageMigratedAt || null,
        storageVerifiedAt || null,
        storageMigrationStatus || "local",
        storageMigrationError || null,
        fileName,
        uploadedById || null,
      ]
    );

    await syncDocumentUserRecord(client, result.rows[0].owner_user_id, result.rows[0]);
    return { before, after: result.rows[0] };
  });
}

export async function updateDocumentMetadata(documentId, updates = {}, { organizationId, audit } = {}) {
  const safeVisibility = updates.visibility === "customer_visible" ? "customer_visible" : "internal";
  const client = await pool.connect();
  const scopedOrganizationId = requireOrganizationScope(organizationId, "updateDocumentMetadata");

  try {
    await client.query("BEGIN");
    const beforeResult = await client.query(
      `SELECT * FROM documents WHERE id = $1 AND organization_id = $2`,
      [documentId, scopedOrganizationId]
    );
    const before = beforeResult.rows[0] || null;
    if (!before) {
      await client.query("ROLLBACK");
      return null;
    }

    const legacy = {
      ...(before.legacy_data || {}),
      ...(updates.type ? { type: updates.type } : {}),
      ...(updates.title ? { name: updates.title } : {}),
    };

    const result = await client.query(
      `UPDATE documents
       SET title = COALESCE($2, title),
           shipment_id = $3,
           customer_id = $4,
           visibility = $5,
           legacy_data = $6::jsonb,
           updated_at = NOW()
       WHERE id = $1 AND organization_id = $7
       RETURNING *`,
      [
        documentId,
        updates.title || null,
        updates.shipmentId === undefined ? before.shipment_id : updates.shipmentId || null,
        updates.customerId === undefined ? before.customer_id : updates.customerId || null,
        updates.visibility === undefined ? before.visibility : safeVisibility,
        JSON.stringify(legacy),
        scopedOrganizationId,
      ]
    );

    await syncDocumentUserRecord(client, result.rows[0].owner_user_id, result.rows[0]);
    if (audit) {
      await auditLog({
        ...audit,
        organizationId: audit.organizationId ?? scopedOrganizationId,
        before: sanitizeDocumentAuditSnapshot(before),
        after: sanitizeDocumentAuditSnapshot(result.rows[0]),
        queryable: client,
        required: true,
      });
    }
    await client.query("COMMIT");
    return { before, after: result.rows[0] };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function archiveDocumentRecord(documentId, { organizationId, actorUserId } = {}) {
  const client = await pool.connect();
  const scopedOrganizationId = requireOrganizationScope(organizationId, "archiveDocumentRecord");

  try {
    await client.query("BEGIN");
    const beforeResult = await client.query(
      `SELECT * FROM documents WHERE id = $1 AND organization_id = $2`,
      [documentId, scopedOrganizationId]
    );
    const before = beforeResult.rows[0] || null;
    if (!before) {
      await client.query("ROLLBACK");
      return null;
    }

    const result = await client.query(
      `UPDATE documents
       SET archived_at = COALESCE(archived_at, NOW()),
           updated_at = NOW()
       WHERE id = $1 AND organization_id = $2
       RETURNING *`,
      [documentId, scopedOrganizationId]
    );
    const archived = result.rows[0];

    await client.query(
      `INSERT INTO archive_records (
         id, organization_id, owner_user_id, entity_type, entity_id, title, summary,
         customer_name, shipment_id, archived_by_id, archived_at, legacy_data
       )
       VALUES ($1, $2, $3, 'document', $4, $5, 'document archived', NULL, $6, $7, COALESCE($8, NOW()), $9::jsonb)
       ON CONFLICT (entity_type, entity_id) DO UPDATE SET
         organization_id = EXCLUDED.organization_id,
         title = EXCLUDED.title,
         archived_at = EXCLUDED.archived_at,
         restored_at = NULL,
         legacy_data = EXCLUDED.legacy_data`,
      [
        crypto.randomUUID(),
        archived.organization_id || scopedOrganizationId,
        archived.owner_user_id || actorUserId || null,
        documentId,
        archived.title || archived.file_name || "Document",
        archived.shipment_id || null,
        actorUserId || null,
        archived.archived_at,
        JSON.stringify(archived.legacy_data || {}),
      ]
    );

    await syncDocumentUserRecord(client, archived.owner_user_id, archived);
    await client.query("COMMIT");
    return { before, after: archived };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function listTasks({
  ownerUserId,
  assignedToId,
  assignedById,
  participantUserId,
  organizationId,
  includeAll = false,
  shipmentId,
  status,
  blocked = false,
  overdue = false,
} = {}) {
  const conditions = [];
  const values = [];
  const scopedOrganizationId = requireOrganizationScope(organizationId, "listTasks");
  values.push(scopedOrganizationId);
  conditions.push(`t.organization_id = $${values.length}`);

  if (ownerUserId && !includeAll) {
    values.push(ownerUserId);
    conditions.push(`t.owner_user_id = $${values.length}`);
  }
  if (assignedToId) {
    values.push(assignedToId);
    conditions.push(`t.assigned_to_id = $${values.length}`);
  }
  if (assignedById) {
    values.push(assignedById);
    conditions.push(`t.assigned_by_id = $${values.length}`);
  }
  if (participantUserId) {
    values.push(participantUserId);
    conditions.push(`(t.owner_user_id = $${values.length} OR t.assigned_to_id = $${values.length} OR t.assigned_by_id = $${values.length})`);
  }
  if (shipmentId) {
    values.push(shipmentId);
    conditions.push(`t.shipment_id = $${values.length}`);
  }
  if (status) {
    values.push(normalizeTaskStatus(status));
    conditions.push(`t.status = $${values.length}`);
  }
  if (blocked) {
    conditions.push(`t.status = 'BLOCKED'`);
  }
  if (overdue) {
    conditions.push(`t.due_at IS NOT NULL AND t.due_at <> '' AND t.status NOT IN ('DONE', 'CANCELLED')`);
    conditions.push(`left(t.due_at, 10) < to_char(NOW(), 'YYYY/MM/DD')`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const result = await pool.query(
    `${taskSelect()}
     ${where}
     ORDER BY t.updated_at DESC, t.created_at DESC`,
    values
  );
  return result.rows.map(toUiTask);
}

export async function getTaskRecord(taskId, { organizationId } = {}) {
  const values = [taskId];
  const organizationFilter = organizationScopeClause(values, organizationId, "t.organization_id", "getTaskRecord");
  const result = await pool.query(
    `${taskSelect()}
     WHERE t.id = $1 ${organizationFilter}
     LIMIT 1`,
    values
  );
  return result.rows[0] || null;
}

export async function createTaskRecord({
  ownerUserId,
  organizationId,
  tenantContext,
  title,
  description,
  status,
  priority,
  assignedToUserId,
  assignedToName,
  assignedByUserId,
  assignedByName,
  dueDate,
  deadline,
  shipmentId,
  customerId,
  sourceType = "MANUAL",
  sourceId,
  assignmentNote,
  workflowInstanceId,
  workflowStepCode,
  workflowBlockerId,
  blockerCode,
}) {
  const scopedOrganizationId = tenantContext
    ? organizationIdFromTenantContext(tenantContext, "createTaskRecord")
    : requireOrganizationScope(organizationId, "createTaskRecord");
  const client = await pool.connect();
  const id = crypto.randomUUID();
  const safeStatus = normalizeTaskStatus(status);
  const safePriority = normalizeTaskPriority(priority);

  try {
    await client.query("BEGIN");
    const owner = await client.query("SELECT organization_id FROM app_users WHERE id = $1", [ownerUserId]);
    if (owner.rows[0]?.organization_id !== scopedOrganizationId) {
      await client.query("ROLLBACK");
      const error = new Error("Task owner does not belong to the authenticated organization.");
      error.code = "TENANT_SCOPE_REQUIRED";
      error.statusCode = 403;
      throw error;
    }
    const legacy = {
      deadline: deadline || "",
      assignedToUserId: assignedToUserId || "",
      assignedToName: assignedToName || "",
      assignedByName: assignedByName || "",
      dueDate: dueDate || "",
      shipmentId: shipmentId || undefined,
      sourceType,
      sourceId: sourceId || undefined,
      assignmentNote: assignmentNote || "",
      workflowInstanceId: workflowInstanceId || undefined,
      workflowStepCode: workflowStepCode || undefined,
      workflowBlockerId: workflowBlockerId || undefined,
      blockerCode: blockerCode || undefined,
    };
    const result = await client.query(
      `INSERT INTO tasks (
         id, organization_id, owner_user_id, title, description, status, priority, assigned_to_id,
         assigned_to_name, assigned_by_id, assigned_by_name, assigned_at, assignment_note, due_at, source_type,
         source_id, shipment_id, customer_id, workflow_instance_id, workflow_step_code,
         workflow_blocker_id, blocker_code, legacy_data, completed_at, completed_by_user_id
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
               CASE WHEN $8::text IS NULL THEN NULL ELSE NOW() END, $12, $13, $14, $15, $16, $17, $18, $19,
               $20, $21, $22::jsonb, $23, $24)
       RETURNING *`,
      [
        id,
        scopedOrganizationId,
        ownerUserId,
        String(title || "").trim(),
        description || null,
        safeStatus,
        safePriority,
        assignedToUserId || null,
        assignedToName || null,
        assignedByUserId || null,
        assignedByName || null,
        assignmentNote || null,
        dueDate || null,
        sourceType,
        sourceId || null,
        shipmentId || null,
        customerId || null,
        workflowInstanceId || null,
        workflowStepCode || null,
        workflowBlockerId || null,
        blockerCode || null,
        JSON.stringify(legacy),
        safeStatus === "DONE" ? new Date() : null,
        safeStatus === "DONE" ? assignedByUserId || ownerUserId || null : null,
      ]
    );

    await client.query(
      `INSERT INTO task_events (
         id, organization_id, task_id, shipment_id, workflow_instance_id, workflow_step_code,
         workflow_blocker_id, blocker_code, actor_user_id, event_type, to_assignee_user_id,
         to_status, note, metadata
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'task.created', $10, $11, $12, $13::jsonb)`,
      [
        crypto.randomUUID(),
        result.rows[0].organization_id,
        result.rows[0].id,
        result.rows[0].shipment_id || null,
        result.rows[0].workflow_instance_id || null,
        result.rows[0].workflow_step_code || null,
        result.rows[0].workflow_blocker_id || null,
        result.rows[0].blocker_code || null,
        assignedByUserId || ownerUserId || null,
        assignedToUserId || null,
        safeStatus,
        assignmentNote || null,
        JSON.stringify({ sourceType, sourceId: sourceId || null }),
      ]
    );

    await syncTaskUserRecord(client, ownerUserId, result.rows[0]);
    if (assignedToUserId && assignedToUserId !== ownerUserId) {
      await syncTaskUserRecord(client, assignedToUserId, result.rows[0]);
    }
    await createTaskNotification(client, {
      userId: assignedToUserId,
      task: result.rows[0],
      title: "وظیفه جدید",
      body: String(title || "").trim(),
    });
    await queueHighPriorityTaskSms(client, result.rows[0], "assigned");
    await client.query("COMMIT");
    return result.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function updateTaskRecord(taskId, updates = {}, { organizationId } = {}) {
  const client = await pool.connect();
  const scopedOrganizationId = requireOrganizationScope(organizationId, "updateTaskRecord");

  try {
    await client.query("BEGIN");
    const beforeResult = await client.query(
      "SELECT * FROM tasks WHERE id = $1 AND organization_id = $2",
      [taskId, scopedOrganizationId]
    );
    const before = beforeResult.rows[0] || null;
    if (!before) {
      await client.query("ROLLBACK");
      return null;
    }

    const nextStatus =
      updates.status === undefined ? before.status : normalizeTaskStatus(updates.status);
    const nextAssignedToId =
      updates.assignedToUserId === undefined ? before.assigned_to_id : updates.assignedToUserId || null;
    const legacy = {
      ...(before.legacy_data || {}),
      ...(updates.deadline !== undefined ? { deadline: updates.deadline || "" } : {}),
      ...(updates.dueDate !== undefined ? { dueDate: updates.dueDate || "" } : {}),
      ...(updates.assignedToUserId !== undefined ? { assignedToUserId: nextAssignedToId || "" } : {}),
      ...(updates.assignedToName !== undefined ? { assignedToName: updates.assignedToName || "" } : {}),
      ...(updates.assignedByName !== undefined ? { assignedByName: updates.assignedByName || "" } : {}),
      ...(updates.shipmentId !== undefined ? { shipmentId: updates.shipmentId || undefined } : {}),
      ...(updates.assignmentNote !== undefined ? { assignmentNote: updates.assignmentNote || "" } : {}),
      ...(updates.workflowInstanceId !== undefined ? { workflowInstanceId: updates.workflowInstanceId || undefined } : {}),
      ...(updates.workflowStepCode !== undefined ? { workflowStepCode: updates.workflowStepCode || undefined } : {}),
      ...(updates.workflowBlockerId !== undefined ? { workflowBlockerId: updates.workflowBlockerId || undefined } : {}),
      ...(updates.blockerCode !== undefined ? { blockerCode: updates.blockerCode || undefined } : {}),
    };

    const result = await client.query(
      `UPDATE tasks
       SET title = COALESCE($2, title),
           description = $3,
           status = $4,
           priority = $5,
           assigned_to_id = $6,
           assigned_to_name = $7,
           assigned_by_name = COALESCE($8, assigned_by_name),
           assigned_at = CASE WHEN $6::text IS DISTINCT FROM assigned_to_id THEN NOW() ELSE assigned_at END,
           assignment_note = $9,
           due_at = $10,
           shipment_id = $11,
           customer_id = $12,
           workflow_instance_id = $13,
           workflow_step_code = $14,
           workflow_blocker_id = $15,
           blocker_code = $16,
           legacy_data = $17::jsonb,
           completed_at = CASE WHEN $4 = 'DONE' THEN COALESCE(completed_at, NOW()) ELSE NULL END,
           completed_by_user_id = CASE WHEN $4 = 'DONE' THEN COALESCE(completed_by_user_id, $18) ELSE NULL END,
           updated_at = NOW()
        WHERE id = $1 AND organization_id = $19
        RETURNING *`,
      [
        taskId,
        updates.title === undefined ? null : String(updates.title || "").trim(),
        updates.description === undefined ? before.description : updates.description || null,
        nextStatus,
        updates.priority === undefined ? before.priority : normalizeTaskPriority(updates.priority),
        nextAssignedToId,
        updates.assignedToName === undefined ? before.assigned_to_name : updates.assignedToName || null,
        updates.assignedByName || null,
        updates.assignmentNote === undefined ? before.assignment_note : updates.assignmentNote || null,
        updates.dueDate === undefined ? before.due_at : updates.dueDate || null,
        updates.shipmentId === undefined ? before.shipment_id : updates.shipmentId || null,
        updates.customerId === undefined ? before.customer_id : updates.customerId || null,
        updates.workflowInstanceId === undefined ? before.workflow_instance_id : updates.workflowInstanceId || null,
        updates.workflowStepCode === undefined ? before.workflow_step_code : updates.workflowStepCode || null,
        updates.workflowBlockerId === undefined ? before.workflow_blocker_id : updates.workflowBlockerId || null,
        updates.blockerCode === undefined ? before.blocker_code : updates.blockerCode || null,
        JSON.stringify(legacy),
        updates.completedByUserId || updates.actorUserId || null,
        scopedOrganizationId,
      ]
    );

    if (nextAssignedToId !== before.assigned_to_id || nextStatus !== before.status) {
      await client.query(
        `INSERT INTO task_events (
           id, organization_id, task_id, shipment_id, workflow_instance_id, workflow_step_code,
           workflow_blocker_id, blocker_code, actor_user_id, event_type, from_assignee_user_id,
           to_assignee_user_id, from_status, to_status, note, metadata
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::jsonb)`,
        [
          crypto.randomUUID(),
          result.rows[0].organization_id,
          taskId,
          result.rows[0].shipment_id || null,
          result.rows[0].workflow_instance_id || null,
          result.rows[0].workflow_step_code || null,
          result.rows[0].workflow_blocker_id || null,
          result.rows[0].blocker_code || null,
          updates.actorUserId || null,
          nextAssignedToId !== before.assigned_to_id ? "task.reassigned" : "task.status_changed",
          before.assigned_to_id || null,
          nextAssignedToId || null,
          before.status || null,
          nextStatus,
          updates.assignmentNote || updates.note || null,
          JSON.stringify({ source: "updateTaskRecord" }),
        ]
      );
    }

    await syncTaskUserRecord(client, result.rows[0].owner_user_id, result.rows[0]);
    if (result.rows[0].assigned_to_id && result.rows[0].assigned_to_id !== result.rows[0].owner_user_id) {
      await syncTaskUserRecord(client, result.rows[0].assigned_to_id, result.rows[0]);
    }
    if (nextAssignedToId && nextAssignedToId !== before.assigned_to_id) {
      await createTaskNotification(client, {
        userId: nextAssignedToId,
        task: result.rows[0],
        title: "ارجاع وظیفه",
      body: result.rows[0].title,
      });
    }
    const beforeHighPriority = isHighPriority(before.priority);
    const afterHighPriority = isHighPriority(result.rows[0].priority);
    if (
      afterHighPriority &&
      (nextAssignedToId !== before.assigned_to_id || !beforeHighPriority)
    ) {
      await queueHighPriorityTaskSms(
        client,
        result.rows[0],
        nextAssignedToId !== before.assigned_to_id ? "reassigned" : "priority"
      );
    }
    await client.query("COMMIT");
    return { before, after: result.rows[0] };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function setTaskStatus(taskId, status, { organizationId } = {}) {
  return updateTaskRecord(taskId, { status }, { organizationId });
}

export async function assignTaskRecord(taskId, {
  assignedToUserId,
  actorUser,
  dueAt,
  dueDate,
  priority,
  assignmentNote,
  status,
  organizationId,
} = {}) {
  const scopedOrganizationId = requireOrganizationScope(
    organizationId || actorUser?.organizationId || actorUser?.organization_id,
    "assignTaskRecord"
  );
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const beforeResult = await client.query(
      `SELECT *
       FROM tasks
       WHERE id = $1 AND organization_id = $2
       LIMIT 1`,
      [taskId, scopedOrganizationId]
    );
    const before = beforeResult.rows[0] || null;
    if (!before) {
      await client.query("ROLLBACK");
      return null;
    }

    const assigneeResult = await client.query(
      `SELECT id, name
       FROM app_users
       WHERE id = $1
         AND organization_id = $2
         AND COALESCE(status, 'active') = 'active'
       LIMIT 1`,
      [assignedToUserId, scopedOrganizationId]
    );
    const assignee = assigneeResult.rows[0] || null;
    if (!assignee) {
      await client.query("ROLLBACK");
      return { invalidAssignee: true };
    }

    const nextStatus = status === undefined ? before.status || "ASSIGNED" : normalizeTaskStatus(status);
    const nextPriority = priority === undefined ? before.priority : normalizeTaskPriority(priority);
    const nextDueAt = dueAt === undefined && dueDate === undefined ? before.due_at : dueAt || dueDate || null;
    const legacy = {
      ...(before.legacy_data || {}),
      assignedToUserId: assignee.id,
      assignedToName: assignee.name,
      assignedByUserId: actorUser?.id || "",
      assignedByName: actorUser?.name || "",
      assignedAt: new Date().toISOString(),
      assignmentNote: assignmentNote || "",
      dueDate: nextDueAt || "",
    };
    const result = await client.query(
      `UPDATE tasks
       SET assigned_to_id = $3,
           assigned_to_name = $4,
           assigned_by_id = $5,
           assigned_by_name = $6,
           assigned_at = NOW(),
           assignment_note = $7,
           due_at = $8,
           priority = $9,
           status = $10,
           legacy_data = $11::jsonb,
           completed_at = CASE WHEN $10 = 'DONE' THEN COALESCE(completed_at, NOW()) ELSE completed_at END,
           completed_by_user_id = CASE WHEN $10 = 'DONE' THEN COALESCE(completed_by_user_id, $5) ELSE completed_by_user_id END,
           updated_at = NOW()
       WHERE id = $1 AND organization_id = $2
       RETURNING *`,
      [
        taskId,
        scopedOrganizationId,
        assignee.id,
        assignee.name,
        actorUser?.id || null,
        actorUser?.name || null,
        assignmentNote || null,
        nextDueAt,
        nextPriority,
        nextStatus,
        JSON.stringify(legacy),
      ]
    );
    const after = result.rows[0];
    await client.query(
      `INSERT INTO task_events (
         id, organization_id, task_id, shipment_id, workflow_instance_id, workflow_step_code,
         workflow_blocker_id, blocker_code, actor_user_id, event_type, from_assignee_user_id,
         to_assignee_user_id, from_status, to_status, note, metadata
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'task.reassigned', $10, $11, $12, $13, $14, $15::jsonb)`,
      [
        crypto.randomUUID(),
        scopedOrganizationId,
        taskId,
        after.shipment_id || null,
        after.workflow_instance_id || null,
        after.workflow_step_code || null,
        after.workflow_blocker_id || null,
        after.blocker_code || null,
        actorUser?.id || null,
        before.assigned_to_id || null,
        assignee.id,
        before.status || null,
        after.status,
        assignmentNote || null,
        JSON.stringify({ priority: after.priority, dueAt: after.due_at || null }),
      ]
    );
    await syncTaskUserRecord(client, after.owner_user_id, after);
    if (after.assigned_to_id && after.assigned_to_id !== after.owner_user_id) {
      await syncTaskUserRecord(client, after.assigned_to_id, after);
    }
    await createTaskNotification(client, {
      userId: assignee.id,
      task: after,
      title: "ارجاع وظیفه",
      body: after.title,
    });
    if (isHighPriority(after.priority)) {
      await queueHighPriorityTaskSms(client, after, before.assigned_to_id === assignee.id ? "priority" : "reassigned");
    }
    await client.query("COMMIT");
    return { before, after };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function updateTaskStatusRecord(taskId, {
  status,
  note,
  actorUser,
  organizationId,
} = {}) {
  const scopedOrganizationId = requireOrganizationScope(
    organizationId || actorUser?.organizationId || actorUser?.organization_id,
    "updateTaskStatusRecord"
  );
  const safeStatus = normalizeTaskStatus(status);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const beforeResult = await client.query(
      `SELECT *
       FROM tasks
       WHERE id = $1 AND organization_id = $2
       LIMIT 1`,
      [taskId, scopedOrganizationId]
    );
    const before = beforeResult.rows[0] || null;
    if (!before) {
      await client.query("ROLLBACK");
      return null;
    }

    const legacy = {
      ...(before.legacy_data || {}),
      status: safeStatus,
      ...(safeStatus === "DONE" ? { completedAt: new Date().toISOString(), completedByUserId: actorUser?.id || "" } : {}),
    };
    const result = await client.query(
      `UPDATE tasks
       SET status = $3,
           completed_at = CASE WHEN $3 = 'DONE' THEN COALESCE(completed_at, NOW()) ELSE NULL END,
           completed_by_user_id = CASE WHEN $3 = 'DONE' THEN COALESCE(completed_by_user_id, $4) ELSE NULL END,
           legacy_data = $5::jsonb,
           updated_at = NOW()
       WHERE id = $1 AND organization_id = $2
       RETURNING *`,
      [taskId, scopedOrganizationId, safeStatus, actorUser?.id || null, JSON.stringify(legacy)]
    );
    const after = result.rows[0];
    await client.query(
      `INSERT INTO task_events (
         id, organization_id, task_id, shipment_id, workflow_instance_id, workflow_step_code,
         workflow_blocker_id, blocker_code, actor_user_id, event_type, from_status, to_status, note, metadata
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'task.status_changed', $10, $11, $12, '{}'::jsonb)`,
      [
        crypto.randomUUID(),
        scopedOrganizationId,
        taskId,
        after.shipment_id || null,
        after.workflow_instance_id || null,
        after.workflow_step_code || null,
        after.workflow_blocker_id || null,
        after.blocker_code || null,
        actorUser?.id || null,
        before.status || null,
        safeStatus,
        note || null,
      ]
    );
    await syncTaskUserRecord(client, after.owner_user_id, after);
    if (after.assigned_to_id && after.assigned_to_id !== after.owner_user_id) {
      await syncTaskUserRecord(client, after.assigned_to_id, after);
    }
    await client.query("COMMIT");
    return { before, after };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function listTaskEvents(taskId, { organizationId } = {}) {
  const scopedOrganizationId = requireOrganizationScope(organizationId, "listTaskEvents");
  const result = await pool.query(
    `SELECT e.*,
            actor.name AS actor_name,
            from_user.name AS from_assignee_name,
            to_user.name AS to_assignee_name
     FROM task_events e
     JOIN tasks t ON t.id = e.task_id AND t.organization_id = e.organization_id
     LEFT JOIN app_users actor ON actor.id = e.actor_user_id
     LEFT JOIN app_users from_user ON from_user.id = e.from_assignee_user_id
     LEFT JOIN app_users to_user ON to_user.id = e.to_assignee_user_id
     WHERE e.task_id = $1
       AND e.organization_id = $2
     ORDER BY e.created_at DESC`,
    [taskId, scopedOrganizationId]
  );
  return result.rows.map((row) => ({
    id: row.id,
    taskId: row.task_id,
    eventType: row.event_type,
    actorUserId: row.actor_user_id || null,
    actorName: row.actor_name || "",
    fromAssigneeUserId: row.from_assignee_user_id || null,
    fromAssigneeName: row.from_assignee_name || "",
    toAssigneeUserId: row.to_assignee_user_id || null,
    toAssigneeName: row.to_assignee_name || "",
    fromStatus: row.from_status || null,
    toStatus: row.to_status || null,
    note: row.note || "",
    shipmentId: row.shipment_id || null,
    workflowInstanceId: row.workflow_instance_id || null,
    workflowStepCode: row.workflow_step_code || null,
    workflowBlockerId: row.workflow_blocker_id || null,
    blockerCode: row.blocker_code || null,
    metadata: row.metadata || {},
    createdAt: row.created_at,
  }));
}

export async function listOrganizationMembers({ organizationId, includeInactive = false } = {}) {
  const scopedOrganizationId = requireOrganizationScope(organizationId, "listOrganizationMembers");
  const result = await pool.query(
    `SELECT u.id, u.name, u.email, u.role, COALESCE(u.status, om.status, 'active') AS status
     FROM organization_members om
     JOIN app_users u ON u.id = om.user_id
     WHERE om.organization_id = $1
       AND ($2::boolean OR (COALESCE(u.status, 'active') = 'active' AND COALESCE(om.status, 'active') = 'active'))
     ORDER BY u.name ASC`,
    [scopedOrganizationId, Boolean(includeInactive)]
  );
  return result.rows.map((row) => ({
    userId: row.id,
    displayName: row.name,
    email: row.email,
    roleName: row.role,
    active: row.status === "active",
  }));
}

export async function createShipmentTaskRecord({ shipmentId, stepId, actorUser, organizationId, tenantContext, task }) {
  const client = await pool.connect();
  const sourceType = task.workflowBlockerId
    ? "WORKFLOW_BLOCKER"
    : task.workflowStepCode || task.workflowInstanceId
      ? "WORKFLOW_STEP"
      : stepId
        ? "SHIPMENT_STEP"
        : "SHIPMENT";
  const sourceId = task.workflowBlockerId || task.workflowStepCode || task.workflowInstanceId || stepId || shipmentId;
  const scopedOrganizationId = tenantContext
    ? organizationIdFromTenantContext(tenantContext, "createShipmentTaskRecord")
    : requireOrganizationScope(organizationId || actorUser?.organizationId || actorUser?.organization_id, "createShipmentTaskRecord");
  const actorOrganizationId = actorUser?.organizationId || actorUser?.organization_id || null;
  if (actorOrganizationId && actorOrganizationId !== scopedOrganizationId) {
    const error = new Error("Task actor does not belong to the authenticated organization.");
    error.code = "TENANT_SCOPE_REQUIRED";
    error.statusCode = 403;
    throw error;
  }

  try {
    await client.query("BEGIN");
    const shipmentValues = [shipmentId];
    const scopeFilter = shipmentScopeClause(shipmentValues, { organizationId: scopedOrganizationId, ownerUserId: actorUser?.id }, "");
    const shipmentResult = await client.query(
      `SELECT * FROM shipments WHERE id = $1 ${scopeFilter}`,
      shipmentValues
    );
    const shipment = shipmentResult.rows[0] || null;
    if (!shipment) {
      await client.query("ROLLBACK");
      return null;
    }

    const existingResult = await client.query(
      `SELECT * FROM tasks
       WHERE shipment_id = $1 AND source_type = $2 AND source_id = $3
          AND ($4::text IS NULL OR organization_id = $4)
       ORDER BY created_at DESC
       LIMIT 1`,
      [shipmentId, sourceType, sourceId, scopedOrganizationId]
    );
    const existing = existingResult.rows[0] || null;
    const assignedToId = task.assignedToUserId || actorUser.id;
    const assignedToName = task.assignedToName || actorUser.name;
    const title = task.title || `پیگیری مرحله: ${task.stepName || sourceId} - ${shipment.shipment_code}`;
    const legacy = {
      ...(existing?.legacy_data || {}),
      deadline: task.deadline || existing?.legacy_data?.deadline || "",
      dueDate: task.dueDate || existing?.due_at || "",
      assignedToUserId: assignedToId,
      assignedToName,
      assignedByName: actorUser.name,
      shipmentId,
      sourceType,
      sourceId,
      stepName: task.stepName || existing?.legacy_data?.stepName || "",
      assignmentNote: task.assignmentNote || existing?.assignment_note || "",
      workflowInstanceId: task.workflowInstanceId || existing?.workflow_instance_id || undefined,
      workflowStepCode: task.workflowStepCode || existing?.workflow_step_code || undefined,
      workflowBlockerId: task.workflowBlockerId || existing?.workflow_blocker_id || undefined,
      blockerCode: task.blockerCode || existing?.blocker_code || undefined,
    };

    const result = existing
      ? await client.query(
          `UPDATE tasks
           SET title = $2,
               organization_id = COALESCE(organization_id, $16),
               description = $3,
               status = CASE WHEN status = 'DONE' THEN status ELSE 'IN_PROGRESS' END,
               priority = $4,
               assigned_to_id = $5,
               assigned_to_name = $6,
               assigned_by_id = $7,
               assigned_by_name = $8,
               assigned_at = NOW(),
               assignment_note = $9,
               due_at = $10,
               workflow_instance_id = $11,
               workflow_step_code = $12,
               workflow_blocker_id = $13,
               blocker_code = $14,
               legacy_data = $15::jsonb,
               updated_at = NOW()
           WHERE id = $1
             AND organization_id = $16
           RETURNING *`,
          [
            existing.id,
            title,
            task.description || existing.description || null,
            normalizeTaskPriority(task.priority || existing.priority),
            assignedToId,
            assignedToName,
            actorUser.id,
            actorUser.name,
            task.assignmentNote || existing.assignment_note || null,
            task.dueDate || existing.due_at || null,
            task.workflowInstanceId || existing.workflow_instance_id || null,
            task.workflowStepCode || existing.workflow_step_code || null,
            task.workflowBlockerId || existing.workflow_blocker_id || null,
            task.blockerCode || existing.blocker_code || null,
            JSON.stringify(legacy),
            scopedOrganizationId,
          ]
        )
      : await client.query(
          `INSERT INTO tasks (
             id, organization_id, owner_user_id, title, description, status, priority, assigned_to_id,
             assigned_to_name, assigned_by_id, assigned_by_name, assigned_at, assignment_note, due_at, source_type,
             source_id, shipment_id, customer_id, workflow_instance_id, workflow_step_code,
             workflow_blocker_id, blocker_code, legacy_data
           )
           VALUES ($1, $2, $3, $4, $5, 'IN_PROGRESS', $6, $7, $8, $9, $10, NOW(), $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21::jsonb)
           RETURNING *`,
          [
            crypto.randomUUID(),
            scopedOrganizationId,
            shipment.owner_user_id || actorUser.id,
            title,
            task.description || null,
            normalizeTaskPriority(task.priority),
            assignedToId,
            assignedToName,
            actorUser.id,
            actorUser.name,
            task.assignmentNote || null,
            task.dueDate || null,
            sourceType,
            sourceId,
            shipmentId,
            shipment.customer_id || null,
            task.workflowInstanceId || null,
            task.workflowStepCode || null,
            task.workflowBlockerId || null,
            task.blockerCode || null,
            JSON.stringify(legacy),
          ]
        );

    await client.query(
      `INSERT INTO task_events (
         id, organization_id, task_id, shipment_id, workflow_instance_id, workflow_step_code,
         workflow_blocker_id, blocker_code, actor_user_id, event_type, from_assignee_user_id,
         to_assignee_user_id, from_status, to_status, note, metadata
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::jsonb)`,
      [
        crypto.randomUUID(),
        result.rows[0].organization_id,
        result.rows[0].id,
        result.rows[0].shipment_id || null,
        result.rows[0].workflow_instance_id || null,
        result.rows[0].workflow_step_code || null,
        result.rows[0].workflow_blocker_id || null,
        result.rows[0].blocker_code || null,
        actorUser.id,
        existing ? "task.reassigned" : "task.created",
        existing?.assigned_to_id || null,
        assignedToId || null,
        existing?.status || null,
        result.rows[0].status,
        task.assignmentNote || null,
        JSON.stringify({ sourceType, sourceId }),
      ]
    );

    await syncTaskUserRecord(client, result.rows[0].owner_user_id, result.rows[0]);
    if (result.rows[0].assigned_to_id && result.rows[0].assigned_to_id !== result.rows[0].owner_user_id) {
      await syncTaskUserRecord(client, result.rows[0].assigned_to_id, result.rows[0]);
    }
    await createTaskNotification(client, {
      userId: assignedToId,
      task: result.rows[0],
      title: existing ? "بروزرسانی وظیفه مرحله" : "وظیفه مرحله حمل",
      body: result.rows[0].title,
    });
    if (!existing || assignedToId !== existing.assigned_to_id || !isHighPriority(existing.priority)) {
      await queueHighPriorityTaskSms(client, result.rows[0], existing ? "reassigned" : "assigned");
    }
    await client.query("COMMIT");
    return { before: existing, after: result.rows[0] };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function updateShipmentStepRecord({ shipmentId, stepId, updates = {}, actorUser }) {
  const client = await pool.connect();
  const organizationId = actorUser?.organizationId || actorUser?.organization_id || null;

  try {
    await client.query("BEGIN");
    const shipmentValues = [shipmentId];
    const scopeFilter = shipmentScopeClause(shipmentValues, { organizationId, ownerUserId: actorUser?.id }, "");
    const shipmentResult = await client.query(
      `SELECT id, owner_user_id, organization_id
       FROM shipments
       WHERE id = $1 ${scopeFilter}
       LIMIT 1`,
      shipmentValues
    );
    const shipment = shipmentResult.rows[0] || null;
    if (!shipment) {
      await client.query("ROLLBACK");
      return null;
    }

    const stepResult = await client.query(
      `SELECT owner_user_id, data
       FROM user_records
       WHERE collection = 'shipmentSteps'
         AND item_id = $1
         AND data->>'shipmentId' = $2
         AND ($3::text IS NULL OR organization_id = $3 OR owner_user_id = $4)
       ORDER BY CASE WHEN owner_user_id = $5 THEN 0 ELSE 1 END
       LIMIT 1`,
      [stepId, shipmentId, organizationId, shipment.owner_user_id, actorUser.id]
    );
    const stepRow = stepResult.rows[0] || null;
    if (!stepRow) {
      await client.query("ROLLBACK");
      return null;
    }

    const before = stepRow.data;
    const next = {
      ...before,
      ...updates,
      ...(updates.status === "COMPLETED" && !updates.completedAt
        ? { completedAt: new Date().toLocaleDateString("fa-IR") }
        : {}),
    };
    await client.query(
      `UPDATE user_records
       SET organization_id = COALESCE(organization_id, $4), data = $3::jsonb, updated_at = NOW()
       WHERE owner_user_id = $1
         AND collection = 'shipmentSteps'
         AND item_id = $2
         AND ($4::text IS NULL OR organization_id = $4 OR owner_user_id = $5)`,
      [stepRow.owner_user_id, stepId, JSON.stringify(next), organizationId, shipment.owner_user_id]
    );

    let workflowTask = null;
    if (next.status === "IN_PROGRESS") {
      const taskResult = await createShipmentTaskRecord({
        shipmentId,
        stepId,
        actorUser,
        task: {
          stepName: next.name,
          title: `پیگیری مرحله: ${next.name}`,
          description: next.notes || `پیگیری مرحله ${next.name}`,
          priority: "MEDIUM",
          assignedToUserId: actorUser.id,
          assignedToName: actorUser.name,
        },
      });
      workflowTask = taskResult?.after || null;
    }

    if (next.status === "COMPLETED") {
      const linked = await client.query(
        `SELECT id FROM tasks
         WHERE shipment_id = $1
           AND source_type = 'SHIPMENT_STEP'
           AND source_id = $2
           AND ($3::text IS NULL OR organization_id = $3)
         ORDER BY created_at DESC
         LIMIT 1`,
        [shipmentId, stepId, organizationId]
      );
      if (linked.rows[0]) {
        const statusResult = await updateTaskRecord(linked.rows[0].id, { status: "DONE" }, { organizationId });
        workflowTask = statusResult?.after || null;
      }
    }

    await client.query("COMMIT");
    return { before, after: next, workflowTask };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function listShipmentSteps(shipmentId, ownerUserId, { organizationId } = {}) {
  const result = await pool.query(
    `SELECT data
     FROM user_records
     WHERE collection = 'shipmentSteps'
       AND data->>'shipmentId' = $1
       AND ($2::text IS NULL OR owner_user_id = $2)
       AND ($3::text IS NULL OR organization_id = $3 OR owner_user_id = $2)
     ORDER BY (data->>'order')::int ASC`,
    [shipmentId, ownerUserId || null, organizationId || null]
  );
  return result.rows.map((row) => row.data);
}

function normalizeChequeStatus(status) {
  const value = String(status || "ACTIVE").toUpperCase();
  return ["ACTIVE", "CLEARED", "RETURNED", "ARCHIVED"].includes(value) ? value : "ACTIVE";
}

function normalizeAppointmentStatus(status) {
  const value = String(status || "SCHEDULED").toUpperCase();
  return ["SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED", "FOLLOW_UP_REQUIRED"].includes(value)
    ? value
    : "SCHEDULED";
}

export async function listCheques({ ownerUserId, organizationId, includeArchived = false } = {}) {
  const conditions = [];
  const values = [];
  const scopedOrganizationId = requireOrganizationScope(organizationId, "listCheques");
  values.push(scopedOrganizationId);
  conditions.push(`organization_id = $${values.length}`);
  if (ownerUserId) {
    values.push(ownerUserId);
    conditions.push(`owner_user_id = $${values.length}`);
  }
  if (!includeArchived) conditions.push("archived_at IS NULL");
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const result = await pool.query(
    `SELECT *
     FROM cheques
     ${where}
     ORDER BY updated_at DESC, created_at DESC`,
    values
  );
  return result.rows.map(toUiCheque);
}

export async function getChequeRecord(id, { organizationId } = {}) {
  const values = [id];
  const organizationFilter = organizationScopeClause(values, organizationId, "organization_id", "getChequeRecord");
  const result = await pool.query(`SELECT * FROM cheques WHERE id = $1 ${organizationFilter} LIMIT 1`, values);
  return result.rows[0] || null;
}

export async function createChequeRecord({ ownerUserId, actorUserId, organizationId, tenantContext, cheque }) {
  const scopedOrganizationId = tenantContext
    ? organizationIdFromTenantContext(tenantContext, "createChequeRecord")
    : requireOrganizationScope(organizationId, "createChequeRecord");
  const client = await pool.connect();
  const id = crypto.randomUUID();
  try {
    await client.query("BEGIN");
    const owner = await client.query("SELECT organization_id FROM app_users WHERE id = $1", [ownerUserId]);
    if (owner.rows[0]?.organization_id !== scopedOrganizationId) {
      await client.query("ROLLBACK");
      const error = new Error("Cheque owner does not belong to the authenticated organization.");
      error.code = "TENANT_SCOPE_REQUIRED";
      error.statusCode = 403;
      throw error;
    }
    const result = await client.query(
      `INSERT INTO cheques (
         id, organization_id, owner_user_id, bank_name, cheque_number, amount, due_date, location,
         receiver, status, description, legacy_data, created_by_id, archived_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, $14)
       RETURNING *`,
      [
        id,
        scopedOrganizationId,
        ownerUserId,
        String(cheque.bankName || "").trim(),
        String(cheque.chequeNumber || "").trim(),
        Number(cheque.amount || 0),
        cheque.dueDate || null,
        cheque.location || null,
        cheque.receiver || null,
        normalizeChequeStatus(cheque.status),
        cheque.description || null,
        JSON.stringify(cheque),
        actorUserId || ownerUserId,
        normalizeChequeStatus(cheque.status) === "ARCHIVED" ? new Date() : null,
      ]
    );
    await syncChequeUserRecord(client, ownerUserId, result.rows[0]);
    await client.query("COMMIT");
    return result.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function updateChequeRecord(id, updates = {}, { organizationId } = {}) {
  const client = await pool.connect();
  const scopedOrganizationId = requireOrganizationScope(organizationId, "updateChequeRecord");
  try {
    await client.query("BEGIN");
    const beforeResult = await client.query(
      "SELECT * FROM cheques WHERE id = $1 AND organization_id = $2",
      [id, scopedOrganizationId]
    );
    const before = beforeResult.rows[0] || null;
    if (!before) {
      await client.query("ROLLBACK");
      return null;
    }
    const status = updates.status === undefined ? before.status : normalizeChequeStatus(updates.status);
    const legacy = { ...(before.legacy_data || {}), ...updates, status };
    const result = await client.query(
      `UPDATE cheques
       SET bank_name = COALESCE($2, bank_name),
           cheque_number = COALESCE($3, cheque_number),
           amount = COALESCE($4, amount),
           due_date = $5,
           location = $6,
           receiver = $7,
           status = $8,
           description = $9,
           legacy_data = $10::jsonb,
           archived_at = CASE WHEN $8 = 'ARCHIVED' THEN COALESCE(archived_at, NOW()) ELSE archived_at END,
           updated_at = NOW()
        WHERE id = $1 AND organization_id = $11
        RETURNING *`,
      [
        id,
        updates.bankName === undefined ? null : String(updates.bankName || "").trim(),
        updates.chequeNumber === undefined ? null : String(updates.chequeNumber || "").trim(),
        updates.amount === undefined ? null : Number(updates.amount || 0),
        updates.dueDate === undefined ? before.due_date : updates.dueDate || null,
        updates.location === undefined ? before.location : updates.location || null,
        updates.receiver === undefined ? before.receiver : updates.receiver || null,
        status,
        updates.description === undefined ? before.description : updates.description || null,
        JSON.stringify(legacy),
        scopedOrganizationId,
      ]
    );
    await syncChequeUserRecord(client, result.rows[0].owner_user_id, result.rows[0]);
    await client.query("COMMIT");
    return { before, after: result.rows[0] };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function archiveChequeRecord(id, { organizationId } = {}) {
  return updateChequeRecord(id, { status: "ARCHIVED" }, { organizationId });
}

export async function listDueSoonCheques({ ownerUserId, organizationId, days = 7 } = {}) {
  const cheques = await listCheques({ ownerUserId, organizationId });
  const now = Date.now();
  const horizon = now + Number(days || 7) * 24 * 60 * 60 * 1000;
  return cheques.filter((cheque) => {
    if (!["ACTIVE", "RETURNED"].includes(cheque.status) || !cheque.dueDate) return false;
    const parsed = parseOperationalDate(cheque.dueDate);
    return !parsed || parsed.getTime() <= horizon;
  });
}

export async function listComplianceMeetings({ ownerUserId, assignedToId, organizationId, includeArchived = false } = {}) {
  const conditions = [];
  const values = [];
  const scopedOrganizationId = requireOrganizationScope(organizationId, "listComplianceMeetings");
  values.push(scopedOrganizationId);
  conditions.push(`organization_id = $${values.length}`);
  if (ownerUserId) {
    values.push(ownerUserId);
    conditions.push(`owner_user_id = $${values.length}`);
  }
  if (assignedToId) {
    values.push(assignedToId);
    conditions.push(`assigned_to_id = $${values.length}`);
  }
  if (!includeArchived) conditions.push("archived_at IS NULL");
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const result = await pool.query(
    `SELECT *
     FROM compliance_meetings
     ${where}
     ORDER BY meeting_at ASC, updated_at DESC`,
    values
  );
  const rows = [];
  for (const meeting of result.rows) {
    const docs = await pool.query(
      "SELECT * FROM meeting_required_documents WHERE meeting_id = $1 AND organization_id = $2 ORDER BY created_at ASC",
      [meeting.id, scopedOrganizationId]
    );
    rows.push(toUiAppointment(meeting, docs.rows));
  }
  return rows;
}

export async function getComplianceMeetingRecord(id, { organizationId } = {}) {
  const values = [id];
  const organizationFilter = organizationScopeClause(values, organizationId, "organization_id", "getComplianceMeetingRecord");
  const result = await pool.query(
    `SELECT * FROM compliance_meetings WHERE id = $1 ${organizationFilter} LIMIT 1`,
    values
  );
  return result.rows[0] || null;
}

async function replaceMeetingDocuments(client, meetingId, requiredDocuments = [], organizationId) {
  const scopedOrganizationId = requireOrganizationScope(organizationId, "replaceMeetingDocuments");
  await client.query("DELETE FROM meeting_required_documents WHERE meeting_id = $1 AND organization_id = $2", [meetingId, scopedOrganizationId]);
  for (const doc of requiredDocuments) {
    const documentId = doc.id ? `${meetingId}:${doc.id}` : crypto.randomUUID();
    await client.query(
      `INSERT INTO meeting_required_documents (
         id, organization_id, meeting_id, name, required, completed, file_name, legacy_data
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
      [
        documentId,
        scopedOrganizationId,
        meetingId,
        doc.name || "Document",
        doc.required !== false,
        Boolean(doc.completed),
        doc.fileName || null,
        JSON.stringify(doc),
      ]
    );
  }
}

export async function createComplianceMeetingRecord({ ownerUserId, actorUser, organizationId, tenantContext, meeting }) {
  const scopedOrganizationId = tenantContext
    ? organizationIdFromTenantContext(tenantContext, "createComplianceMeetingRecord")
    : requireOrganizationScope(organizationId, "createComplianceMeetingRecord");
  const client = await pool.connect();
  const id = crypto.randomUUID();
  try {
    await client.query("BEGIN");
    const owner = await client.query("SELECT organization_id FROM app_users WHERE id = $1", [ownerUserId]);
    if (owner.rows[0]?.organization_id !== scopedOrganizationId) {
      await client.query("ROLLBACK");
      const error = new Error("Compliance meeting owner does not belong to the authenticated organization.");
      error.code = "TENANT_SCOPE_REQUIRED";
      error.statusCode = 403;
      throw error;
    }
    const result = await client.query(
      `INSERT INTO compliance_meetings (
         id, organization_id, owner_user_id, title, organization_name, meeting_at, location, status,
         assigned_to_id, assigned_to_name, description, outcome, next_action_items,
         reminder_sent, legacy_data, created_by_id
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb, $16)
       RETURNING *`,
      [
        id,
        scopedOrganizationId,
        ownerUserId,
        meeting.purpose || meeting.title || "Compliance meeting",
        meeting.departmentName || meeting.organizationName || null,
        meeting.dateTime,
        meeting.location || null,
        normalizeAppointmentStatus(meeting.status),
        meeting.assignedPersonId || null,
        meeting.assignedPersonName || null,
        meeting.description || null,
        meeting.outcome || null,
        meeting.nextActionItems || null,
        Boolean(meeting.reminderSent),
        JSON.stringify(meeting),
        actorUser?.id || ownerUserId,
      ]
    );
    await replaceMeetingDocuments(client, id, meeting.requiredDocuments || [], scopedOrganizationId);
    await syncMeetingUserRecord(client, ownerUserId, result.rows[0]);
    await client.query("COMMIT");
    return result.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function updateComplianceMeetingRecord(id, updates = {}, { organizationId } = {}) {
  const client = await pool.connect();
  const scopedOrganizationId = requireOrganizationScope(organizationId, "updateComplianceMeetingRecord");
  try {
    await client.query("BEGIN");
    const beforeResult = await client.query(
      "SELECT * FROM compliance_meetings WHERE id = $1 AND organization_id = $2",
      [id, scopedOrganizationId]
    );
    const before = beforeResult.rows[0] || null;
    if (!before) {
      await client.query("ROLLBACK");
      return null;
    }
    const legacy = { ...(before.legacy_data || {}), ...updates };
    const result = await client.query(
      `UPDATE compliance_meetings
       SET title = COALESCE($2, title),
           organization_name = $3,
           meeting_at = COALESCE($4, meeting_at),
           location = $5,
           status = $6,
           assigned_to_id = $7,
           assigned_to_name = $8,
           description = $9,
           outcome = $10,
           next_action_items = $11,
           reminder_sent = $12,
           legacy_data = $13::jsonb,
           archived_at = CASE WHEN $6 = 'ARCHIVED' THEN COALESCE(archived_at, NOW()) ELSE archived_at END,
           updated_at = NOW()
        WHERE id = $1 AND organization_id = $14
        RETURNING *`,
      [
        id,
        updates.purpose || updates.title || null,
        updates.departmentName === undefined ? before.organization_name : updates.departmentName || null,
        updates.dateTime || updates.meetingAt || null,
        updates.location === undefined ? before.location : updates.location || null,
        updates.status === undefined ? before.status : normalizeAppointmentStatus(updates.status),
        updates.assignedPersonId === undefined ? before.assigned_to_id : updates.assignedPersonId || null,
        updates.assignedPersonName === undefined ? before.assigned_to_name : updates.assignedPersonName || null,
        updates.description === undefined ? before.description : updates.description || null,
        updates.outcome === undefined ? before.outcome : updates.outcome || null,
        updates.nextActionItems === undefined ? before.next_action_items : updates.nextActionItems || null,
        updates.reminderSent === undefined ? before.reminder_sent : Boolean(updates.reminderSent),
        JSON.stringify(legacy),
        scopedOrganizationId,
      ]
    );
    if (Array.isArray(updates.requiredDocuments)) {
      await replaceMeetingDocuments(client, id, updates.requiredDocuments, scopedOrganizationId);
    }
    await syncMeetingUserRecord(client, result.rows[0].owner_user_id, result.rows[0]);
    await client.query("COMMIT");
    return { before, after: result.rows[0] };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function archiveComplianceMeetingRecord(id, { organizationId } = {}) {
  const client = await pool.connect();
  const scopedOrganizationId = requireOrganizationScope(organizationId, "archiveComplianceMeetingRecord");
  try {
    await client.query("BEGIN");
    const beforeResult = await client.query(
      "SELECT * FROM compliance_meetings WHERE id = $1 AND organization_id = $2",
      [id, scopedOrganizationId]
    );
    const before = beforeResult.rows[0] || null;
    if (!before) {
      await client.query("ROLLBACK");
      return null;
    }
    const result = await client.query(
      `UPDATE compliance_meetings
       SET status = 'COMPLETED',
           archived_at = COALESCE(archived_at, NOW()),
           updated_at = NOW()
        WHERE id = $1 AND organization_id = $2
        RETURNING *`,
      [id, scopedOrganizationId]
    );
    await syncMeetingUserRecord(client, result.rows[0].owner_user_id, result.rows[0]);
    await client.query("COMMIT");
    return { before, after: result.rows[0] };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function upsertMeetingRequiredDocument(meetingId, document = {}, { organizationId } = {}) {
  const client = await pool.connect();
  const scopedOrganizationId = requireOrganizationScope(organizationId, "upsertMeetingRequiredDocument");
  try {
    await client.query("BEGIN");
    const meeting = await getComplianceMeetingRecord(meetingId, { organizationId: scopedOrganizationId });
    if (!meeting) {
      await client.query("ROLLBACK");
      return null;
    }
    const id = document.id || crypto.randomUUID();
    const result = await client.query(
      `INSERT INTO meeting_required_documents (
         id, organization_id, meeting_id, name, required, completed, file_name, legacy_data, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, NOW())
       ON CONFLICT (id) DO UPDATE SET
         organization_id = EXCLUDED.organization_id,
         name = EXCLUDED.name,
         required = EXCLUDED.required,
         completed = EXCLUDED.completed,
         file_name = EXCLUDED.file_name,
         legacy_data = EXCLUDED.legacy_data,
         updated_at = NOW()
       RETURNING *`,
      [
        id,
        scopedOrganizationId,
        meetingId,
        document.name || "Document",
        document.required !== false,
        Boolean(document.completed),
        document.fileName || null,
        JSON.stringify(document),
      ]
    );
    await syncMeetingUserRecord(client, meeting.owner_user_id, meeting);
    await client.query("COMMIT");
    return result.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function updateMeetingRequiredDocument(meetingId, documentId, updates = {}, { organizationId } = {}) {
  const client = await pool.connect();
  const scopedOrganizationId = requireOrganizationScope(organizationId, "updateMeetingRequiredDocument");
  try {
    await client.query("BEGIN");
    const meetingResult = await client.query(
      "SELECT * FROM compliance_meetings WHERE id = $1 AND organization_id = $2",
      [meetingId, scopedOrganizationId]
    );
    const meeting = meetingResult.rows[0] || null;
    if (!meeting) {
      await client.query("ROLLBACK");
      return null;
    }
    const beforeResult = await client.query(
      "SELECT * FROM meeting_required_documents WHERE id = $1 AND meeting_id = $2 AND organization_id = $3",
      [documentId, meetingId, scopedOrganizationId]
    );
    const before = beforeResult.rows[0] || null;
    if (!before) {
      await client.query("ROLLBACK");
      return null;
    }
    const legacy = { ...(before.legacy_data || {}), ...updates };
    const result = await client.query(
      `UPDATE meeting_required_documents
       SET name = COALESCE($3, name),
           required = $4,
           completed = $5,
           file_name = $6,
           legacy_data = $7::jsonb,
           updated_at = NOW()
        WHERE id = $1 AND meeting_id = $2 AND organization_id = $8
        RETURNING *`,
      [
        documentId,
        meetingId,
        updates.name || null,
        updates.required === undefined ? before.required : Boolean(updates.required),
        updates.completed === undefined ? before.completed : Boolean(updates.completed),
        updates.fileName === undefined ? before.file_name : updates.fileName || null,
        JSON.stringify(legacy),
        scopedOrganizationId,
      ]
    );
    await syncMeetingUserRecord(client, meeting.owner_user_id, meeting);
    await client.query("COMMIT");
    return { before, after: result.rows[0] };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getDashboardData(user, permissions = []) {
  const canViewAllTasks = permissions.includes("tasks.view_all");
  const canViewCompliance = permissions.includes("compliance.manage");
  const canViewQuotations = QUOTATIONS_UI_SURFACE_ENABLED && permissions.includes("quotations.manage");
  const canUseCheques = permissions.includes("cheques.manage");
  const canViewOrganizationCheques = canUseCheques && (user.role === "CEO" || user.role === "MANAGER");
  const organizationId = user.organizationId || user.organization_id;

  const orgParam = organizationId || null;
  const taskVisibilitySql = "AND ($3::boolean OR t.owner_user_id = $2 OR t.assigned_to_id = $2 OR t.assigned_by_id = $2)";
  const chequeVisibilitySql = "AND ($3::boolean OR ($4::boolean AND owner_user_id = $2))";

  const [
    shipmentSummaryResult,
    latestShipmentsResult,
    priorityShipmentsResult,
    taskSummaryResult,
    myTasksResult,
    documentCountResult,
    chequeSummaryResult,
    meetingRows,
    quotationSummaryResult,
    notificationResult,
    changeResult,
    usersResult,
    dueSoonCheques,
  ] = await Promise.all([
    pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE archived_at IS NULL AND exited_archived_at IS NULL AND status NOT IN ('DELIVERED', 'CLOSED'))::int AS active_shipments,
         COUNT(*) FILTER (WHERE archived_at IS NULL AND exited_archived_at IS NULL AND status = 'CUSTOMS')::int AS customs_shipments
       FROM shipments
       WHERE ($1::text IS NULL OR organization_id = $1)`,
      [orgParam]
    ),
    pool.query(
      `SELECT s.id, s.shipment_code, s.customer_id, c.customer_code, s.customer_name, s.status, s.destination, s.estimated_delivery_at, s.legacy_data
       FROM shipments s
       LEFT JOIN customers c
         ON c.id = s.customer_id
        AND c.organization_id = s.organization_id
       WHERE s.archived_at IS NULL
         AND s.exited_archived_at IS NULL
         AND ($1::text IS NULL OR s.organization_id = $1)
       ORDER BY s.updated_at DESC, s.created_at DESC
       LIMIT 8`,
      [orgParam]
    ),
    pool.query(
      `SELECT s.id, s.shipment_code, s.customer_id, c.customer_code, s.customer_name, s.status, s.destination, s.estimated_delivery_at, s.legacy_data
       FROM shipments s
       LEFT JOIN customers c
         ON c.id = s.customer_id
        AND c.organization_id = s.organization_id
       WHERE s.archived_at IS NULL
         AND s.exited_archived_at IS NULL
         AND s.status IN ('ARRIVED', 'CUSTOMS', 'IN_TRANSIT')
         AND ($1::text IS NULL OR s.organization_id = $1)
       ORDER BY s.updated_at DESC, s.created_at DESC
       LIMIT 6`,
      [orgParam]
    ),
    pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE t.status NOT IN ('DONE', 'CANCELLED'))::int AS open_tasks,
         COUNT(*) FILTER (WHERE t.status = 'DONE')::int AS completed_tasks
       FROM tasks t
       WHERE ($1::text IS NULL OR t.organization_id = $1)
       ${taskVisibilitySql}`,
      [orgParam, user.id, canViewAllTasks]
    ),
    pool.query(
      `${taskSelect()}
       WHERE ($1::text IS NULL OR t.organization_id = $1)
         AND t.assigned_to_id = $2
         AND t.status NOT IN ('DONE', 'CANCELLED')
       ORDER BY t.updated_at DESC, t.created_at DESC
       LIMIT 8`,
      [orgParam, user.id]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS documents
       FROM documents
       WHERE archived_at IS NULL
          AND ($1::text IS NULL OR organization_id = $1)`,
      [orgParam]
    ),
    pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE archived_at IS NULL AND status = 'ACTIVE')::int AS active_cheques,
         COUNT(*) FILTER (WHERE archived_at IS NULL AND status = 'RETURNED')::int AS returned_cheques
        FROM cheques
        WHERE ($1::text IS NULL OR organization_id = $1)
        ${chequeVisibilitySql}`,
      [orgParam, user.id, canViewOrganizationCheques, canUseCheques]
    ),
    listComplianceMeetings(canViewCompliance ? { organizationId } : { organizationId, assignedToId: user.id }),
    canViewQuotations
      ? pool.query(
          `SELECT COUNT(*) FILTER (WHERE archived_at IS NULL AND status = 'PENDING')::int AS active_quotations
           FROM quotations
           WHERE ($1::text IS NULL OR organization_id = $1)`,
          [orgParam]
        )
      : Promise.resolve({ rows: [{ active_quotations: 0 }] }),
    pool.query(
      `SELECT * FROM notifications
       WHERE user_id = $1 AND ($2::text IS NULL OR organization_id = $2) AND read_at IS NULL
         AND id <> ALL($3::text[])
       ORDER BY created_at DESC
       LIMIT 20`,
      [user.id, orgParam, ["n1", "n2", "n3", "n4"]]
    ),
    pool.query(
      `SELECT c.*, u.name AS actor_name
       FROM change_logs c
       LEFT JOIN app_users u ON u.id = c.actor_user_id
       WHERE ($1::text IS NULL OR c.organization_id = $1)
       ORDER BY c.created_at DESC
       LIMIT 10`,
      [orgParam]
    ),
    pool.query(
      `SELECT id, name, email, role, is_online, department, last_seen_at
       FROM app_users
       WHERE ($1::text IS NULL OR organization_id = $1)
       ORDER BY is_online DESC, name ASC`,
      [orgParam]
    ),
    canUseCheques
      ? listDueSoonCheques({ organizationId, ownerUserId: canViewOrganizationCheques ? undefined : user.id })
      : Promise.resolve([]),
  ]);

  const toDashboardShipment = (row) => ({
    id: row.id,
    trackingNumber: row.shipment_code,
    customerId: row.customer_id || "",
    customerCode: row.customer_code || row.customer_id || "",
    customerName: row.customer_code || row.customer_id || "",
    status: row.status,
    destination: row.destination,
    estimatedDelivery: row.estimated_delivery_at,
    freeTimeDays: row.legacy_data?.freeTimeDays || 14,
  });

  const latestShipments = latestShipmentsResult.rows.map(toDashboardShipment);
  const priorityShipments = priorityShipmentsResult.rows.map(toDashboardShipment);
  const myTasks = myTasksResult.rows.map(toUiTask);
  const shipmentSummary = shipmentSummaryResult.rows[0] || {};
  const taskSummary = taskSummaryResult.rows[0] || {};
  const chequeSummary = chequeSummaryResult.rows[0] || {};
  const quotationSummary = quotationSummaryResult.rows[0] || {};
  const upcomingMeetings = meetingRows.filter((meeting) => !["COMPLETED", "CANCELLED"].includes(meeting.status));
  const missingMeetingDocs = meetingRows.flatMap((meeting) =>
    (meeting.requiredDocuments || [])
      .filter((doc) => doc.required && !doc.completed)
      .map((doc) => ({ meetingId: meeting.id, meetingTitle: meeting.purpose, documentName: doc.name }))
  );
  const alerts = [
    ...notificationResult.rows.map((row) => ({
      id: row.id,
      title: row.title,
      message: row.body || "",
      type: row.type || "INFO",
      link: row.legacy_data?.link || "/dashboard",
      createdAt: row.created_at,
    })),
    ...dueSoonCheques.map((cheque) => ({
      id: `cheque-${cheque.id}`,
      title: cheque.status === "RETURNED" ? "Cheque returned" : "Cheque due soon",
      message: `${cheque.bankName} - ${cheque.chequeNumber}`,
      type: cheque.status === "RETURNED" ? "URGENT" : "WARNING",
      link: "/cheques",
      createdAt: cheque.createdAt,
    })),
    ...missingMeetingDocs.slice(0, 8).map((item) => ({
      id: `meeting-doc-${item.meetingId}-${item.documentName}`,
      title: "Missing compliance document",
      message: `${item.meetingTitle}: ${item.documentName}`,
      type: "WARNING",
      link: "/compliance-meetings",
      createdAt: new Date().toISOString(),
    })),
  ];

  return {
    summary: {
      activeShipments: Number(shipmentSummary.active_shipments || 0),
      customsShipments: Number(shipmentSummary.customs_shipments || 0),
      openTasks: Number(taskSummary.open_tasks || 0),
      completedTasks: Number(taskSummary.completed_tasks || 0),
      documents: Number(documentCountResult.rows[0]?.documents || 0),
      activeCheques: Number(chequeSummary.active_cheques || 0),
      returnedCheques: Number(chequeSummary.returned_cheques || 0),
      dueSoonCheques: dueSoonCheques.length,
      upcomingMeetings: upcomingMeetings.length,
      missingMeetingDocuments: missingMeetingDocs.length,
      activeQuotations: Number(quotationSummary.active_quotations || 0),
    },
    latestShipments,
    priorityShipments,
    myTasks,
    alerts,
    management: {
      recentChanges: changeResult.rows,
      users: usersResult.rows,
      onlineUsers: usersResult.rows.filter((row) => row.is_online).length,
      recentlyCompletedTasks: [],
    },
  };
}

export async function listRoles() {
  const result = await pool.query("SELECT id, name, description FROM roles ORDER BY name ASC");
  return result.rows;
}

function slugifyOrganizationName(name = "company") {
  const base = String(name)
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || `company-${crypto.randomUUID().slice(0, 8)}`;
}

function toUiPlan(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    description: row.description || "",
    monthlyPriceIrr: Number(row.monthly_price_irr || 0),
    annualPriceIrr: Number(row.annual_price_irr || 0),
    limits: row.limits || {},
    features: row.features || {},
    isPublic: Boolean(row.is_public),
    sortOrder: row.sort_order || 0,
  };
}

function toUiSignupRequest(row) {
  if (!row) return null;
  const hasPaidPayment = Boolean(row.has_paid_payment);
  const hasReceipt = Boolean(row.has_receipt);
  const abandonedCleanupEligible = isAbandonedSignupRow(row, { allowSuspendedUser: true });
  return {
    id: row.id,
    organizationId: row.organization_id,
    ownerUserId: row.owner_user_id,
    planId: row.plan_id,
    planName: row.plan_name || row.plan_id,
    companyName: row.company_name,
    contactName: row.contact_name,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone || "",
    companySize: row.company_size || "",
    expectedVolume: row.expected_volume || "",
    notes: row.notes || "",
    status: row.status,
    paymentId: row.payment_id,
    paymentStatus: row.payment_status,
    paymentAmountIrr: Number(row.payment_amount_irr || 0),
    organizationStatus: row.organization_status,
    subscriptionStatus: row.subscription_status,
    userStatus: row.user_status,
    hasPaidPayment,
    hasReceipt,
    abandonedCleanupEligible,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
  };
}

function isAbandonedSignupRow(row, { allowSuspendedUser = false } = {}) {
  if (!row) return false;
  if (row.has_paid_payment || row.has_receipt) return false;
  if (["approved"].includes(row.status)) return false;
  if (["active", "suspended", "cancelled"].includes(row.organization_status)) return false;
  if (["active", "cancelled"].includes(row.subscription_status)) return false;
  if (allowSuspendedUser) return !["active"].includes(row.user_status);
  return ["pending"].includes(row.user_status || "pending");
}

function toUiContactRequest(row) {
  if (!row) return null;
  return {
    id: row.id,
    companyName: row.company_name,
    contactName: row.contact_name,
    contactEmail: row.contact_email || "",
    contactPhone: row.contact_phone || "",
    preferredContactMethod: row.preferred_contact_method || "phone",
    message: row.message || "",
    status: row.status || "new",
    resolvedById: row.resolved_by_id || null,
    resolvedByName: row.resolved_by_name || "",
    resolvedAt: row.resolved_at,
    ipAddress: row.ip_address || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toUiSmsDelivery(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    organizationName: row.organization_name || "",
    userId: row.user_id || null,
    userName: row.user_name || "",
    recipientType: row.recipient_type || "user",
    recipientName: row.recipient_name || row.user_name || "",
    recipientPhone: row.recipient_phone || "",
    message: row.message || "",
    status: row.status,
    provider: row.provider,
    sourceType: row.source_type,
    sourceId: row.source_id || "",
    eventKey: row.event_key,
    attemptCount: Number(row.attempt_count || 0),
    providerMessageId: row.provider_message_id || "",
    providerResponse: row.provider_response || {},
    skipReason: row.skip_reason || "",
    errorMessage: row.error_message || "",
    sentAt: row.sent_at,
    skippedAt: row.skipped_at,
    failedAt: row.failed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toUiSmsTemplate(row) {
  if (!row) return null;
  return {
    key: row.key,
    label: row.label,
    body: row.body,
    enabled: row.enabled !== false,
    updatedById: row.updated_by_id || null,
    updatedAt: row.updated_at,
    createdAt: row.created_at,
  };
}

function billingNumber(prefix) {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `${prefix}-${stamp}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

function toUiInvoice(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    organizationName: row.organization_name || "",
    subscriptionId: row.subscription_id,
    signupRequestId: row.signup_request_id,
    paymentId: row.payment_id,
    invoiceNumber: row.invoice_number,
    status: row.status,
    billingCycle: row.billing_cycle,
    currency: row.currency,
    subtotalIrr: Number(row.subtotal_irr || 0),
    taxIrr: Number(row.tax_irr || 0),
    totalIrr: Number(row.total_irr || 0),
    dueAt: row.due_at,
    issuedAt: row.issued_at,
    paidAt: row.paid_at,
    voidedAt: row.voided_at,
    notes: row.notes || "",
    receiptId: row.receipt_id || null,
    paymentStatus: row.payment_status || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toUiInvoiceItem(row) {
  if (!row) return null;
  return {
    id: row.id,
    invoiceId: row.invoice_id,
    description: row.description,
    quantity: Number(row.quantity || 0),
    unitAmountIrr: Number(row.unit_amount_irr || 0),
    totalAmountIrr: Number(row.total_amount_irr || 0),
    metadata: row.metadata || {},
    createdAt: row.created_at,
  };
}

function toUiReceipt(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    invoiceId: row.invoice_id,
    paymentId: row.payment_id,
    receiptNumber: row.receipt_number,
    amountIrr: Number(row.amount_irr || 0),
    currency: row.currency,
    provider: row.provider,
    gatewayRefId: row.gateway_ref_id,
    issuedAt: row.issued_at,
    createdAt: row.created_at,
  };
}

function toUiSubscriptionEvent(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    subscriptionId: row.subscription_id,
    actorUserId: row.actor_user_id,
    eventType: row.event_type,
    summary: row.summary,
    before: row.before_json || null,
    after: row.after_json || null,
    createdAt: row.created_at,
  };
}

async function insertSubscriptionEvent(client, { organizationId, subscriptionId, actorUserId, eventType, summary, before, after }) {
  await client.query(
    `INSERT INTO subscription_events (
       id, organization_id, subscription_id, actor_user_id, event_type, summary, before_json, after_json
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)`,
    [
      crypto.randomUUID(),
      organizationId || null,
      subscriptionId || null,
      actorUserId || null,
      eventType,
      summary,
      before === undefined ? null : JSON.stringify(before),
      after === undefined ? null : JSON.stringify(after),
    ]
  );
}

async function createIssuedInvoiceForPayment(client, { organizationId, subscriptionId, signupRequestId, paymentId, plan, billingCycle, amount }) {
  const invoiceId = crypto.randomUUID();
  const invoiceNumber = billingNumber("INV");
  const numericAmount = Number(amount || 0);
  await client.query(
    `INSERT INTO billing_invoices (
       id, organization_id, subscription_id, signup_request_id, payment_id, invoice_number,
       status, billing_cycle, subtotal_irr, tax_irr, total_irr, due_at, notes, metadata
     )
     VALUES ($1, $2, $3, $4, $5, $6, 'issued', $7, $8, 0, $8, NOW() + INTERVAL '7 days', $9, $10::jsonb)`,
    [
      invoiceId,
      organizationId,
      subscriptionId,
      signupRequestId,
      paymentId,
      invoiceNumber,
      billingCycle,
      numericAmount,
      `Subscription invoice for ${plan?.name || "Logistic Plus"}`,
      JSON.stringify({ planId: plan?.id || null, planName: plan?.name || null }),
    ]
  );
  await client.query(
    `INSERT INTO billing_invoice_items (
       id, invoice_id, description, quantity, unit_amount_irr, total_amount_irr, metadata
     )
     VALUES ($1, $2, $3, 1, $4, $4, $5::jsonb)`,
    [
      crypto.randomUUID(),
      invoiceId,
      `${plan?.name || "Subscription"} - ${billingCycle}`,
      numericAmount,
      JSON.stringify({ type: "subscription", billingCycle }),
    ]
  );
  return invoiceId;
}

async function closeInvoiceForPayment(client, payment) {
  const invoiceResult = await client.query(
    `UPDATE billing_invoices
     SET status = 'paid',
         paid_at = COALESCE(paid_at, NOW()),
         updated_at = NOW()
     WHERE payment_id = $1 AND status <> 'void'
     RETURNING *`,
    [payment.id]
  );
  const invoice = invoiceResult.rows[0];
  if (!invoice) return null;
  const receiptResult = await client.query(
    `INSERT INTO billing_receipts (
       id, organization_id, invoice_id, payment_id, receipt_number, amount_irr,
       currency, provider, gateway_ref_id, metadata
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
     ON CONFLICT (invoice_id) DO UPDATE SET
       amount_irr = EXCLUDED.amount_irr,
       provider = EXCLUDED.provider,
       gateway_ref_id = COALESCE(EXCLUDED.gateway_ref_id, billing_receipts.gateway_ref_id)
     RETURNING *`,
    [
      crypto.randomUUID(),
      payment.organization_id,
      invoice.id,
      payment.id,
      billingNumber("REC"),
      Number(payment.amount_irr || invoice.total_irr || 0),
      payment.currency || "IRR",
      payment.provider || "manual",
      payment.gateway_ref_id || null,
      JSON.stringify({ manualOverride: Boolean(payment.manual_override) }),
    ]
  );
  return { invoice, receipt: receiptResult.rows[0] };
}

export async function listSubscriptionPlans({ publicOnly = true } = {}) {
  const result = await pool.query(
    `SELECT * FROM subscription_plans
     ${publicOnly ? "WHERE is_public = TRUE" : ""}
     ORDER BY sort_order ASC, monthly_price_irr ASC`
  );
  return result.rows.map(toUiPlan);
}

export async function getSubscriptionPlan(planId) {
  const result = await pool.query("SELECT * FROM subscription_plans WHERE id = $1 LIMIT 1", [planId]);
  return result.rows[0] || null;
}

export async function getOrganizationForUser(userId) {
  const result = await pool.query(
    `SELECT o.*, p.name AS plan_name, p.limits, p.features
     FROM app_users u
     LEFT JOIN organizations o ON o.id = u.organization_id
     LEFT JOIN subscription_plans p ON p.id = o.plan_id
     WHERE u.id = $1
     LIMIT 1`,
    [userId]
  );
  return result.rows[0] || null;
}

function mergeSubscriptionLimits(planLimits = {}, planFeatures = {}, limitsOverride = {}) {
  const override = limitsOverride || {};
  const featureKeys = ["chat", "cheques", "compliance", "quotations", "archive", "smsNotifications"];
  const limits = { ...(planLimits || {}) };
  const features = { ...(planFeatures || {}) };
  for (const [key, value] of Object.entries(override)) {
    if (featureKeys.includes(key)) {
      features[key] = Boolean(value);
    } else if (value !== "" && value !== null && value !== undefined) {
      limits[key] = Number.isNaN(Number(value)) ? value : Number(value);
    }
  }
  return { limits, features };
}

export async function getEffectiveSubscriptionLimits(organizationId, queryable = pool) {
  if (!organizationId) return { limits: {}, features: {}, override: {}, plan: null, subscription: null };
  const result = await queryable.query(
    `SELECT os.*, sp.name AS plan_name, sp.limits AS plan_limits, sp.features AS plan_features
     FROM organization_subscriptions os
     LEFT JOIN subscription_plans sp ON sp.id = os.plan_id
     WHERE os.organization_id = $1
     ORDER BY os.created_at DESC
     LIMIT 1`,
    [organizationId]
  );
  const row = result.rows[0];
  if (!row) return { limits: {}, features: {}, override: {}, plan: null, subscription: null };
  const effective = mergeSubscriptionLimits(row.plan_limits, row.plan_features, row.limits_override);
  return {
    ...effective,
    override: row.limits_override || {},
    plan: { id: row.plan_id, name: row.plan_name },
    subscription: {
      id: row.id,
      organizationId: row.organization_id,
      planId: row.plan_id,
      status: row.status,
      billingCycle: row.billing_cycle,
      currentPeriodStart: row.current_period_start,
      currentPeriodEnd: row.current_period_end,
      limitsOverride: row.limits_override || {},
      effectiveLimits: effective.limits,
      effectiveFeatures: effective.features,
    },
  };
}

function isHighPriority(priority) {
  return ["HIGH", "URGENT"].includes(String(priority || "").toUpperCase());
}

async function organizationCanUseSms(organizationId, queryable = pool) {
  const subscription = await getEffectiveSubscriptionLimits(organizationId, queryable);
  return subscription.subscription?.status === "active" && Boolean(subscription.features?.smsNotifications);
}

async function getSmsTemplate(queryable, key) {
  const result = await queryable.query("SELECT * FROM sms_templates WHERE key = $1 LIMIT 1", [key]);
  const row = result.rows[0];
  if (row) return row;
  const fallback = DEFAULT_SMS_TEMPLATE_MAP[key];
  return fallback ? { ...fallback, enabled: true } : null;
}

async function renderSmsTemplate(queryable, key, replacements = {}) {
  const template = await getSmsTemplate(queryable, key);
  if (!template || template.enabled === false) return null;
  return renderSmsTemplateBody(template.body, replacements).trim();
}

function formatSmsDateTime(value) {
  const date = parseOperationalDate(value);
  if (!date) return value ? String(value) : "";
  return date.toLocaleString("fa-IR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatSmsTaskTime(task) {
  const legacy = task?.legacy_data || {};
  const dueDate = task?.due_at || legacy.dueDate || "";
  const deadline = legacy.deadline || "";
  const value = dueDate && deadline && !/[T\s]\d{1,2}:\d{2}/.test(String(dueDate))
    ? `${dueDate} ${deadline}`
    : dueDate || deadline;
  return formatSmsDateTime(value) || "در اولین فرصت";
}

function meetingTemplateKey(windowName) {
  return windowName === "2h" ? "meeting_reminder_2h" : "meeting_reminder_24h";
}

function demurrageTemplateKey(windowName) {
  if (windowName === "overdue") return "demurrage_overdue";
  return windowName === "24h" ? "demurrage_warning_24h" : "demurrage_warning_72h";
}

async function enqueueSmsDelivery(queryable, {
  organizationId,
  userId,
  recipientType = "user",
  recipientName,
  recipientPhone,
  message,
  sourceType,
  sourceId,
  eventKey,
  skipReason: requestedSkipReason,
}) {
  if (!organizationId || !eventKey || !message || !(await organizationCanUseSms(organizationId, queryable))) {
    return null;
  }
  const normalizedPhone = normalizeSmsPhone(recipientPhone);
  const status = normalizedPhone ? "queued" : "skipped";
  const skipReason = normalizedPhone ? null : requestedSkipReason || "missing_or_invalid_phone";
  const result = await queryable.query(
    `INSERT INTO sms_deliveries (
       id, organization_id, user_id, recipient_type, recipient_name, recipient_phone, message, status, source_type, source_id,
       event_key, skip_reason, skipped_at, updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CASE WHEN $8 = 'skipped' THEN NOW() ELSE NULL END, NOW())
     ON CONFLICT (event_key) DO NOTHING
     RETURNING *`,
    [
      crypto.randomUUID(),
      organizationId,
      userId || null,
      recipientType || "user",
      recipientName || null,
      normalizedPhone || null,
      String(message).slice(0, 900),
      status,
      sourceType,
      sourceId || null,
      eventKey,
      skipReason,
    ]
  );
  return result.rows[0] || null;
}

function sanitizeSmsProviderResponse(value) {
  if (!value || typeof value !== "object") return value || {};
  if (Array.isArray(value)) return value.map((item) => sanitizeSmsProviderResponse(item));

  const sensitiveKeys = new Set([
    "body",
    "code",
    "message",
    "messages",
    "messageText",
    "otp",
    "text",
  ]);
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !sensitiveKeys.has(key))
      .map(([key, nested]) => [key, sanitizeSmsProviderResponse(nested)])
  );
}

function smsProviderResponse(providerResult = {}) {
  return sanitizeSmsProviderResponse(providerResult.raw || providerResult || {});
}

export async function recordImmediateSmsDelivery({
  organizationId,
  userId,
  recipientType = "user",
  recipientName,
  recipientPhone,
  message,
  sourceType,
  sourceId,
  eventKey,
  status = "sent",
  providerResult = {},
  errorMessage,
  skipReason,
}) {
  const normalizedPhone = normalizeSmsPhone(recipientPhone);
  const safeStatus = ["sent", "failed", "skipped", "queued"].includes(status) ? status : "sent";
  const finalStatus = normalizedPhone ? safeStatus : "skipped";
  const providerResponse = smsProviderResponse(providerResult);
  const result = await pool.query(
    `INSERT INTO sms_deliveries (
       id, organization_id, user_id, recipient_type, recipient_name, recipient_phone, message, status, source_type, source_id,
       event_key, provider_message_id, provider_response, skip_reason, error_message, sent_at, skipped_at, failed_at, updated_at
     )
     VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
       $11, $12, $13::jsonb, $14, $15,
       CASE WHEN $8 = 'sent' THEN NOW() ELSE NULL END,
       CASE WHEN $8 = 'skipped' THEN NOW() ELSE NULL END,
       CASE WHEN $8 = 'failed' THEN NOW() ELSE NULL END,
       NOW()
     )
     ON CONFLICT (event_key) DO UPDATE SET
       status = EXCLUDED.status,
       provider_message_id = EXCLUDED.provider_message_id,
       provider_response = EXCLUDED.provider_response,
       skip_reason = EXCLUDED.skip_reason,
       error_message = EXCLUDED.error_message,
       sent_at = EXCLUDED.sent_at,
       skipped_at = EXCLUDED.skipped_at,
       failed_at = EXCLUDED.failed_at,
       updated_at = NOW()
     RETURNING *`,
    [
      crypto.randomUUID(),
      organizationId || null,
      userId || null,
      recipientType || "user",
      recipientName || null,
      normalizedPhone || null,
      String(message || "SMS notification").slice(0, 900),
      finalStatus,
      sourceType || "manual",
      sourceId || null,
      eventKey || `manual:${crypto.randomUUID()}`,
      providerResult.messageId || null,
      JSON.stringify(providerResponse),
      finalStatus === "skipped" ? skipReason || "missing_or_invalid_phone" : null,
      finalStatus === "failed" ? errorMessage || "SMS send failed." : null,
    ]
  );
  return toUiSmsDelivery(result.rows[0]);
}

async function getUserSmsTarget(queryable, userId, organizationId) {
  if (!userId) return null;
  const result = await queryable.query(
    `SELECT id, name, phone, organization_id
     FROM app_users
     WHERE id = $1
       AND status = 'active'
       AND ($2::text IS NULL OR organization_id = $2)
     LIMIT 1`,
    [userId, organizationId || null]
  );
  return result.rows[0] || null;
}

async function queueHighPriorityTaskSms(queryable, task, eventName = "assigned") {
  if (!task || !isHighPriority(task.priority) || !task.assigned_to_id || ["DONE", "CANCELLED"].includes(task.status)) {
    return null;
  }
  const assignee = await getUserSmsTarget(queryable, task.assigned_to_id, task.organization_id);
  const message = await renderSmsTemplate(queryable, "high_priority_task", {
    task: task.title,
    time: formatSmsTaskTime(task),
  });
  if (!message) return null;
  return enqueueSmsDelivery(queryable, {
    organizationId: task.organization_id,
    userId: task.assigned_to_id,
    recipientType: "user",
    recipientName: assignee?.name || task.assigned_to_name || "",
    recipientPhone: assignee?.phone || "",
    message,
    sourceType: "task",
    sourceId: task.id,
    eventKey: `task:${task.id}:${eventName}:${task.assigned_to_id}:${task.priority}`,
  });
}

function jalaliToGregorian(jy, jm, jd) {
  jy += 1595;
  let days = -355668 + (365 * jy) + Math.floor(jy / 33) * 8 + Math.floor(((jy % 33) + 3) / 4) + jd;
  days += jm < 7 ? (jm - 1) * 31 : ((jm - 7) * 30) + 186;
  let gy = 400 * Math.floor(days / 146097);
  days %= 146097;
  if (days > 36524) {
    gy += 100 * Math.floor(--days / 36524);
    days %= 36524;
    if (days >= 365) days += 1;
  }
  gy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    gy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  let gd = days + 1;
  const daysInMonth = [0, 31, ((gy % 4 === 0 && gy % 100 !== 0) || (gy % 400 === 0)) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let gm = 1;
  for (; gm <= 12 && gd > daysInMonth[gm]; gm += 1) gd -= daysInMonth[gm];
  return { gy, gm, gd };
}

function parseOperationalDate(value) {
  if (!value) return null;
  const text = String(value).trim();
  if (/[T\s]\d{1,2}:\d{2}.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(text)) {
    const absolute = new Date(text);
    if (!Number.isNaN(absolute.valueOf())) return absolute;
  }
  const match = text.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})(?:[ T](\d{1,2}):(\d{1,2}))?/);
  if (match) {
    let year = Number(match[1]);
    let month = Number(match[2]);
    let day = Number(match[3]);
    const hour = Number(match[4] || 0);
    const minute = Number(match[5] || 0);
    if (year < 1700) {
      const converted = jalaliToGregorian(year, month, day);
      year = converted.gy;
      month = converted.gm;
      day = converted.gd;
    }
    const parsed = new Date(year, month - 1, day, hour, minute);
    return Number.isNaN(parsed.valueOf()) ? null : parsed;
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.valueOf()) ? null : parsed;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + Number(days || 0));
  return next;
}

function selectReminderWindow(diffMs) {
  if (diffMs <= 0) return null;
  const hours = diffMs / (60 * 60 * 1000);
  if (hours <= 2) return "2h";
  if (hours <= 24) return "24h";
  return null;
}

function selectDemurrageWindow(diffMs) {
  const hours = diffMs / (60 * 60 * 1000);
  if (hours <= 0) return "overdue";
  if (hours <= 24) return "24h";
  if (hours <= 72) return "72h";
  return null;
}

async function getDemurrageRecipient(queryable, shipment) {
  const result = await queryable.query(
    `SELECT u.id, u.name, u.phone, u.organization_id
     FROM organizations o
     JOIN app_users u ON u.id = o.owner_user_id
     WHERE o.id = $1
       AND u.status = 'active'
       AND u.role = 'CEO'
     LIMIT 1`,
    [shipment.organization_id]
  );
  if (result.rows[0]) return result.rows[0];

  const fallback = await queryable.query(
    `SELECT id, name, phone, organization_id
     FROM app_users
     WHERE organization_id = $1
       AND status = 'active'
       AND role = 'CEO'
     ORDER BY created_at ASC
     LIMIT 1`,
    [shipment.organization_id]
  );
  return fallback.rows[0] || null;
}

export async function queueScheduledSmsAlerts({ now = new Date() } = {}) {
  const queued = { meetings: 0, demurrage: 0 };
  const meetings = await pool.query(
    `SELECT cm.*, u.phone AS assigned_phone
     FROM compliance_meetings cm
     LEFT JOIN app_users u ON u.id = cm.assigned_to_id
     WHERE cm.archived_at IS NULL
       AND cm.status NOT IN ('COMPLETED', 'CANCELLED', 'ARCHIVED')
       AND cm.assigned_to_id IS NOT NULL
       AND cm.organization_id IS NOT NULL`
  );
  for (const meeting of meetings.rows) {
    const targetDate = parseOperationalDate(meeting.meeting_at);
    const windowName = targetDate ? selectReminderWindow(targetDate.getTime() - now.getTime()) : null;
    if (!windowName) continue;
    const message = await renderSmsTemplate(pool, meetingTemplateKey(windowName), {
      mtg: meeting.title,
      time: formatSmsDateTime(meeting.meeting_at),
    });
    if (!message) continue;
    const delivery = await enqueueSmsDelivery(pool, {
      organizationId: meeting.organization_id,
      userId: meeting.assigned_to_id,
      recipientType: "user",
      recipientName: meeting.assigned_to_name || "",
      recipientPhone: meeting.assigned_phone || "",
      message,
      sourceType: "meeting",
      sourceId: meeting.id,
      eventKey: `meeting:${meeting.id}:${windowName}`,
    });
    if (delivery) queued.meetings += 1;
  }

  const shipments = await pool.query(
    `SELECT *
     FROM shipments
     WHERE archived_at IS NULL
       AND organization_id IS NOT NULL
       AND status IN ('ARRIVED', 'CUSTOMS', 'CLEARED')`
  );
  for (const shipment of shipments.rows) {
    const estimatedDelivery = parseOperationalDate(shipment.estimated_delivery_at);
    const freeTimeEnd =
      parseOperationalDate(shipment.free_time_ends_at) ||
      (estimatedDelivery ? addDays(estimatedDelivery, shipment.legacy_data?.freeTimeDays || 0) : null);
    const windowName = freeTimeEnd ? selectDemurrageWindow(freeTimeEnd.getTime() - now.getTime()) : null;
    if (!windowName) continue;
    const recipient = await getDemurrageRecipient(pool, shipment);
    const message = await renderSmsTemplate(pool, demurrageTemplateKey(windowName), {
      ship: shipment.shipment_code,
      time: formatSmsDateTime(freeTimeEnd),
    });
    if (!message) continue;
    const delivery = await enqueueSmsDelivery(pool, {
      organizationId: shipment.organization_id,
      userId: recipient?.id || null,
      recipientType: "user",
      recipientName: recipient?.name || "CEO",
      recipientPhone: recipient?.phone || "",
      message,
      sourceType: "demurrage",
      sourceId: shipment.id,
      eventKey: `demurrage:${shipment.id}:${windowName}`,
      skipReason: recipient?.phone ? undefined : "missing_ceo_recipient",
    });
    if (delivery) queued.demurrage += 1;
  }
  return queued;
}

export async function claimQueuedSmsDeliveries({ limit = 50 } = {}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `UPDATE sms_deliveries
       SET status = 'sending',
           attempt_count = attempt_count + 1,
           updated_at = NOW()
       WHERE id IN (
         SELECT id
         FROM sms_deliveries
         WHERE status = 'queued'
           AND next_attempt_at <= NOW()
         ORDER BY created_at ASC
         LIMIT $1
         FOR UPDATE SKIP LOCKED
       )
       RETURNING *`,
      [Number(limit) || 50]
    );
    await client.query("COMMIT");
    return result.rows.map(toUiSmsDelivery);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function markSmsDeliverySent(deliveryId, providerResult = {}) {
  const result = await pool.query(
    `UPDATE sms_deliveries
     SET status = 'sent',
         sent_at = NOW(),
         provider_message_id = $2,
         provider_response = $3::jsonb,
         error_message = NULL,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [deliveryId, providerResult.messageId || null, JSON.stringify(smsProviderResponse(providerResult))]
  );
  return toUiSmsDelivery(result.rows[0]);
}

export async function markSmsDeliverySkipped(deliveryId, reason, providerResult = {}) {
  const result = await pool.query(
    `UPDATE sms_deliveries
     SET status = 'skipped',
         skipped_at = NOW(),
         skip_reason = $2,
         provider_response = $3::jsonb,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [deliveryId, reason || "skipped", JSON.stringify(smsProviderResponse(providerResult))]
  );
  return toUiSmsDelivery(result.rows[0]);
}

export async function markSmsDeliveryFailed(deliveryId, error, { maxAttempts = 3 } = {}) {
  const current = await pool.query("SELECT attempt_count FROM sms_deliveries WHERE id = $1", [deliveryId]);
  const attemptCount = Number(current.rows[0]?.attempt_count || 1);
  const finalFailure = attemptCount >= maxAttempts;
  const result = await pool.query(
    `UPDATE sms_deliveries
     SET status = $2,
         failed_at = CASE WHEN $2 = 'failed' THEN NOW() ELSE failed_at END,
         next_attempt_at = CASE WHEN $2 = 'queued' THEN NOW() + ($4::int * INTERVAL '5 minutes') ELSE next_attempt_at END,
         error_message = $3,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [deliveryId, finalFailure ? "failed" : "queued", error?.message || String(error || "SMS send failed."), Math.max(attemptCount, 1)]
  );
  return toUiSmsDelivery(result.rows[0]);
}

export async function listSmsDeliveries({ organizationId, status, limit = 100 } = {}) {
  const values = [];
  const conditions = [];
  if (organizationId) {
    values.push(organizationId);
    conditions.push(`sd.organization_id = $${values.length}`);
  }
  if (status) {
    values.push(status);
    conditions.push(`sd.status = $${values.length}`);
  }
  values.push(Number(limit) || 100);
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const result = await pool.query(
    `SELECT sd.*, o.name AS organization_name, u.name AS user_name
     FROM sms_deliveries sd
     LEFT JOIN organizations o ON o.id = sd.organization_id
     LEFT JOIN app_users u ON u.id = sd.user_id
     ${where}
     ORDER BY sd.created_at DESC
     LIMIT $${values.length}`,
    values
  );
  return result.rows.map(toUiSmsDelivery);
}

export async function listSmsTemplates() {
  const result = await pool.query(
    `SELECT *
     FROM sms_templates
     ORDER BY key ASC`
  );
  return result.rows.map(toUiSmsTemplate);
}

export async function updateSmsTemplate(key, updates = {}, actorUserId) {
  const defaultTemplate = DEFAULT_SMS_TEMPLATE_MAP[key];
  if (!defaultTemplate) {
    const error = new Error("SMS template was not found.");
    error.statusCode = 404;
    error.code = "SMS_TEMPLATE_NOT_FOUND";
    throw error;
  }
  const body = updates.body === undefined ? null : String(updates.body || "").trim();
  if (updates.body !== undefined && !body) {
    const error = new Error("SMS template body is required.");
    error.statusCode = 400;
    error.code = "VALIDATION_ERROR";
    throw error;
  }
  const result = await pool.query(
    `INSERT INTO sms_templates (key, label, body, enabled, updated_by_id, updated_at)
     VALUES ($1, $2, COALESCE($3, $4), COALESCE($5, TRUE), $6, NOW())
     ON CONFLICT (key) DO UPDATE SET
       label = EXCLUDED.label,
       body = COALESCE($3, sms_templates.body),
       enabled = COALESCE($5, sms_templates.enabled),
       updated_by_id = $6,
       updated_at = NOW()
     RETURNING *`,
    [
      key,
      defaultTemplate.label,
      body,
      defaultTemplate.body,
      updates.enabled === undefined ? null : Boolean(updates.enabled),
      actorUserId || null,
    ]
  );
  return toUiSmsTemplate(result.rows[0]);
}

export async function getSmsAnalytics({ organizationId } = {}) {
  const values = [];
  const conditions = [];
  if (organizationId) {
    values.push(organizationId);
    conditions.push(`sd.organization_id = $${values.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const summaryResult = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE sd.status = 'sent')::int AS total_sent,
       COUNT(*) FILTER (WHERE sd.status = 'sent' AND sd.sent_at >= date_trunc('month', NOW()))::int AS sent_this_month,
       COUNT(*) FILTER (WHERE sd.status = 'failed')::int AS failed,
       COUNT(*) FILTER (WHERE sd.status = 'skipped')::int AS skipped,
       COUNT(*) FILTER (WHERE sd.status = 'queued')::int AS queued
     FROM sms_deliveries sd
     ${where}`,
    values
  );
  const recipientsResult = await pool.query(
    `SELECT
       sd.organization_id,
       o.name AS organization_name,
       COALESCE(sd.recipient_type, 'user') AS recipient_type,
       COALESCE(NULLIF(sd.recipient_name, ''), u.name, 'نامشخص') AS recipient_name,
       COALESCE(sd.recipient_phone, '') AS recipient_phone,
       COUNT(*) FILTER (WHERE sd.status = 'sent')::int AS sent_count,
       COUNT(*) FILTER (WHERE sd.status = 'failed')::int AS failed_count,
       COUNT(*) FILTER (WHERE sd.status = 'skipped')::int AS skipped_count,
       (ARRAY_AGG(sd.status ORDER BY sd.updated_at DESC, sd.created_at DESC))[1] AS last_status,
       MAX(COALESCE(sd.sent_at, sd.failed_at, sd.skipped_at, sd.updated_at, sd.created_at)) AS last_activity_at
     FROM sms_deliveries sd
     LEFT JOIN organizations o ON o.id = sd.organization_id
     LEFT JOIN app_users u ON u.id = sd.user_id
     ${where}
     GROUP BY sd.organization_id, o.name, COALESCE(sd.recipient_type, 'user'), COALESCE(NULLIF(sd.recipient_name, ''), u.name, 'نامشخص'), COALESCE(sd.recipient_phone, '')
     ORDER BY last_activity_at DESC
     LIMIT 100`,
    values
  );
  const summary = summaryResult.rows[0] || {};
  return {
    summary: {
      totalSent: Number(summary.total_sent || 0),
      sentThisMonth: Number(summary.sent_this_month || 0),
      failed: Number(summary.failed || 0),
      skipped: Number(summary.skipped || 0),
      queued: Number(summary.queued || 0),
    },
    recipients: recipientsResult.rows.map((row) => ({
      organizationId: row.organization_id,
      organizationName: row.organization_name || "",
      recipientType: row.recipient_type || "user",
      recipientName: row.recipient_name || "نامشخص",
      recipientPhone: row.recipient_phone || "",
      sentCount: Number(row.sent_count || 0),
      failedCount: Number(row.failed_count || 0),
      skippedCount: Number(row.skipped_count || 0),
      lastStatus: row.last_status || "",
      lastActivityAt: row.last_activity_at,
    })),
  };
}

export async function assertPlanAllowsUser(organizationId) {
  if (!organizationId) return;
  const result = await pool.query(
    `SELECT COUNT(u.id)::int AS user_count
     FROM organizations o
     LEFT JOIN app_users u ON u.organization_id = o.id AND u.status <> 'suspended'
     WHERE o.id = $1
     GROUP BY o.id`,
    [organizationId]
  );
  const row = result.rows[0];
  const subscription = await getEffectiveSubscriptionLimits(organizationId);
  const maxUsers = Number(subscription.limits?.users || 0);
  if (maxUsers > 0 && Number(row?.user_count || 0) >= maxUsers) {
    const error = new Error("Plan user limit reached.");
    error.statusCode = 402;
    error.code = "PLAN_LIMIT_REACHED";
    throw error;
  }
}

async function getRetryableSignupByOwnerEmail(email, userId) {
  const result = await pool.query(
    `SELECT sr.*, o.status AS organization_status, u.status AS user_status,
            os.id AS subscription_id, os.status AS subscription_status,
            bp.status AS payment_status,
            EXISTS (
              SELECT 1
              FROM billing_payments paid
              WHERE (paid.signup_request_id = sr.id OR paid.organization_id = sr.organization_id)
                AND paid.status = 'paid'
            ) AS has_paid_payment,
            EXISTS (
              SELECT 1
              FROM billing_receipts receipt
              LEFT JOIN billing_payments receipt_payment ON receipt_payment.id = receipt.payment_id
              LEFT JOIN billing_invoices receipt_invoice ON receipt_invoice.id = receipt.invoice_id
              WHERE receipt.organization_id = sr.organization_id
                 OR receipt_payment.signup_request_id = sr.id
                 OR receipt_invoice.signup_request_id = sr.id
            ) AS has_receipt
     FROM signup_requests sr
     JOIN organizations o ON o.id = sr.organization_id
     JOIN app_users u ON u.id = sr.owner_user_id
     LEFT JOIN organization_subscriptions os ON os.organization_id = o.id
     LEFT JOIN billing_payments bp ON bp.id = sr.payment_id
     WHERE u.id = $2
        OR lower(u.email) = lower($1)
     ORDER BY sr.created_at DESC
     LIMIT 1`,
    [email, userId]
  );
  const row = result.rows[0];
  if (!row) return null;
  const retryableSignup = ["payment_pending", "payment_failed", "pending_review"].includes(row.status);
  const retryablePayment = !row.payment_status || ["pending", "failed", "superseded"].includes(row.payment_status);
  return retryableSignup && retryablePayment && isAbandonedSignupRow(row) ? row : null;
}

async function retrySignupWithPayment(client, { signup, passwordHash, plan, retryable }) {
  const paymentId = crypto.randomUUID();
  const billingCycle = signup.billingCycle === "annual" ? "annual" : "monthly";
  const amount = billingCycle === "annual" ? plan.annual_price_irr : plan.monthly_price_irr;
  const ownerEmail = signup.ownerEmail || signup.contactEmail;
  const ownerName = signup.ownerName || signup.contactName;

  await client.query(
    `UPDATE billing_payments
     SET status = 'superseded',
         updated_at = NOW(),
         raw_verify = COALESCE(raw_verify, '{}'::jsonb) || $2::jsonb
     WHERE (signup_request_id = $1 OR organization_id = $3)
       AND status <> 'paid'`,
    [retryable.id, JSON.stringify({ reason: "signup_retry", supersededAt: new Date().toISOString() }), retryable.organization_id]
  );
  await client.query(
    `UPDATE billing_invoices
     SET status = 'void',
         updated_at = NOW(),
         metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb
     WHERE (signup_request_id = $1 OR organization_id = $3)
       AND status = 'issued'`,
    [retryable.id, JSON.stringify({ voidReason: "signup_retry" }), retryable.organization_id]
  );
  await client.query(
    `UPDATE organizations
     SET name = $2,
         plan_id = $3,
         contact_name = $4,
         contact_email = $5,
         contact_phone = $6,
         notes = $7,
         status = 'pending_payment',
         legacy_data = $8::jsonb,
         updated_at = NOW()
     WHERE id = $1`,
    [
      retryable.organization_id,
      signup.companyName,
      plan.id,
      ownerName,
      ownerEmail,
      signup.contactPhone || "",
      signup.notes || null,
      JSON.stringify({ companySize: signup.companySize, expectedVolume: signup.expectedVolume }),
    ]
  );
  await client.query(
    `UPDATE app_users
     SET name = $2,
         email = $3,
         password_hash = $4,
         status = 'pending',
         updated_at = NOW()
     WHERE id = $1`,
    [retryable.owner_user_id, ownerName, ownerEmail, passwordHash]
  );
  await client.query(
    `INSERT INTO organization_members (organization_id, user_id, role, status)
     VALUES ($1, $2, 'owner', 'pending')
     ON CONFLICT (organization_id, user_id) DO UPDATE SET status = 'pending'`,
    [retryable.organization_id, retryable.owner_user_id]
  );
  await client.query(
    `UPDATE organization_subscriptions
     SET plan_id = $2,
         status = 'pending_payment',
         billing_cycle = $3,
         updated_at = NOW()
     WHERE id = $1`,
    [retryable.subscription_id, plan.id, billingCycle]
  );
  await client.query(
    `INSERT INTO billing_payments (
       id, organization_id, signup_request_id, subscription_id, provider, status,
       amount_irr, currency, description
     )
     VALUES ($1, $2, $3, $4, 'zarinpal', 'pending', $5, 'IRR', $6)`,
    [paymentId, retryable.organization_id, retryable.id, retryable.subscription_id, amount, `Subscription ${plan.name} Logistic Plus`]
  );
  await client.query(
    `UPDATE signup_requests
     SET plan_id = $2,
         company_name = $3,
         contact_name = $4,
         contact_email = $5,
         contact_phone = $6,
         company_size = $7,
         expected_volume = $8,
         notes = $9,
         status = 'payment_pending',
         payment_id = $10,
         updated_at = NOW()
     WHERE id = $1`,
    [
      retryable.id,
      plan.id,
      signup.companyName,
      ownerName,
      ownerEmail,
      signup.contactPhone || "",
      signup.companySize || "",
      signup.expectedVolume || "",
      signup.notes || "",
      paymentId,
    ]
  );
  const invoiceId = await createIssuedInvoiceForPayment(client, {
    organizationId: retryable.organization_id,
    subscriptionId: retryable.subscription_id,
    signupRequestId: retryable.id,
    paymentId,
    plan,
    billingCycle,
    amount,
  });
  await insertSubscriptionEvent(client, {
    organizationId: retryable.organization_id,
    subscriptionId: retryable.subscription_id,
    eventType: "signup.payment_retry",
    summary: "Signup payment was retried.",
    after: { invoiceId, paymentId, planId: plan.id, billingCycle, amountIrr: Number(amount) },
  });
  await syncUsersCollectionForOrganization(client, retryable.organization_id, retryable.owner_user_id);
  return {
    signupRequestId: retryable.id,
    organizationId: retryable.organization_id,
    ownerUserId: retryable.owner_user_id,
    paymentId,
    invoiceId,
    amountIrr: Number(amount),
    plan: toUiPlan(plan),
  };
}

export async function createSignupWithPayment({ signup, passwordHash }) {
  const plan = await getSubscriptionPlan(signup.planId || "starter");
  if (!plan) {
    const error = new Error("Selected plan was not found.");
    error.statusCode = 400;
    error.code = "PLAN_NOT_FOUND";
    throw error;
  }

  const ownerEmail = signup.ownerEmail || signup.contactEmail;
  const existing = await getUserByEmail(ownerEmail);
  if (existing) {
    const retryable = await getRetryableSignupByOwnerEmail(ownerEmail, existing.id);
    if (!retryable) {
      const error = new Error("A user with this email already exists.");
      error.statusCode = 409;
      error.code = "EMAIL_EXISTS";
      throw error;
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const data = await retrySignupWithPayment(client, { signup, passwordHash, plan, retryable });
      await client.query("COMMIT");
      return data;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  const organizationId = crypto.randomUUID();
  const ownerUserId = crypto.randomUUID();
  const subscriptionId = crypto.randomUUID();
  const requestId = crypto.randomUUID();
  const paymentId = crypto.randomUUID();
  let invoiceId = null;
  const billingCycle = signup.billingCycle === "annual" ? "annual" : "monthly";
  const amount = billingCycle === "annual" ? plan.annual_price_irr : plan.monthly_price_irr;
  const slug = `${slugifyOrganizationName(signup.companyName)}-${organizationId.slice(0, 8)}`;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO organizations (
         id, name, slug, status, owner_user_id, plan_id, contact_name, contact_email, contact_phone, notes, legacy_data
       )
       VALUES ($1, $2, $3, 'pending_payment', $4, $5, $6, $7, $8, $9, $10::jsonb)`,
      [
        organizationId,
        signup.companyName,
        slug,
        ownerUserId,
        plan.id,
        signup.ownerName || signup.contactName,
        signup.ownerEmail || signup.contactEmail,
        signup.contactPhone || "",
        signup.notes || null,
        JSON.stringify({ companySize: signup.companySize, expectedVolume: signup.expectedVolume }),
      ]
    );
    await client.query(
      `INSERT INTO app_users (
         id, organization_id, name, email, password_hash, role, status, is_online, notification_preferences, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, 'CEO', 'pending', FALSE, '{}'::jsonb, NOW())`,
      [ownerUserId, organizationId, signup.ownerName || signup.contactName, signup.ownerEmail || signup.contactEmail, passwordHash]
    );
    await client.query(
      `INSERT INTO organization_members (organization_id, user_id, role, status)
       VALUES ($1, $2, 'owner', 'pending')`,
      [organizationId, ownerUserId]
    );
    await client.query(
      `INSERT INTO organization_subscriptions (
         id, organization_id, plan_id, status, billing_cycle, created_at, updated_at
       )
       VALUES ($1, $2, $3, 'pending_payment', $4, NOW(), NOW())`,
      [subscriptionId, organizationId, plan.id, billingCycle]
    );
    await client.query(
      `INSERT INTO billing_payments (
         id, organization_id, signup_request_id, subscription_id, provider, status,
         amount_irr, currency, description
       )
       VALUES ($1, $2, $3, $4, 'zarinpal', 'pending', $5, 'IRR', $6)`,
      [paymentId, organizationId, requestId, subscriptionId, amount, `اشتراک ${plan.name} لجستیک پلاس`]
    );
    await client.query(
      `INSERT INTO signup_requests (
         id, organization_id, owner_user_id, plan_id, company_name, contact_name,
         contact_email, contact_phone, company_size, expected_volume, notes, status, payment_id
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'payment_pending', $12)`,
      [
        requestId,
        organizationId,
        ownerUserId,
        plan.id,
        signup.companyName,
        signup.ownerName || signup.contactName,
        signup.ownerEmail || signup.contactEmail,
        signup.contactPhone || "",
        signup.companySize || "",
        signup.expectedVolume || "",
        signup.notes || "",
        paymentId,
      ]
    );
    invoiceId = await createIssuedInvoiceForPayment(client, {
      organizationId,
      subscriptionId,
      signupRequestId: requestId,
      paymentId,
      plan,
      billingCycle,
      amount,
    });
    await insertSubscriptionEvent(client, {
      organizationId,
      subscriptionId,
      eventType: "signup.invoice_issued",
      summary: "Signup invoice was issued.",
      after: { invoiceId, paymentId, planId: plan.id, billingCycle, amountIrr: Number(amount) },
    });
    await client.query("COMMIT");
    return { signupRequestId: requestId, organizationId, ownerUserId, paymentId, invoiceId, amountIrr: Number(amount), plan: toUiPlan(plan) };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function createManualCompanySignup({ signup, passwordHash, reviewerId }) {
  const plan = await getSubscriptionPlan(signup.planId || "starter");
  if (!plan) {
    const error = new Error("Selected plan was not found.");
    error.statusCode = 400;
    error.code = "PLAN_NOT_FOUND";
    throw error;
  }

  const ownerEmail = signup.ownerEmail || signup.contactEmail;
  const existing = await getUserByEmail(ownerEmail);
  if (existing) {
    const error = new Error("A user with this email already exists.");
    error.statusCode = 409;
    error.code = "EMAIL_EXISTS";
    throw error;
  }

  const organizationId = crypto.randomUUID();
  const ownerUserId = crypto.randomUUID();
  const subscriptionId = crypto.randomUUID();
  const requestId = crypto.randomUUID();
  const billingCycle = signup.billingCycle === "annual" ? "annual" : "monthly";
  const slug = `${slugifyOrganizationName(signup.companyName)}-${organizationId.slice(0, 8)}`;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO organizations (
         id, name, slug, status, owner_user_id, plan_id, contact_name, contact_email,
         contact_phone, notes, approved_at, legacy_data
       )
       VALUES ($1, $2, $3, 'active', $4, $5, $6, $7, $8, $9, NOW(), $10::jsonb)`,
      [
        organizationId,
        signup.companyName,
        slug,
        ownerUserId,
        plan.id,
        signup.ownerName || signup.contactName,
        ownerEmail,
        signup.contactPhone || "",
        signup.notes || null,
        JSON.stringify({ companySize: signup.companySize, expectedVolume: signup.expectedVolume, source: "manual_admin" }),
      ]
    );
    await client.query(
      `INSERT INTO app_users (
         id, organization_id, name, email, password_hash, role, status, is_online,
         notification_preferences, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, 'CEO', 'active', FALSE, '{}'::jsonb, NOW())`,
      [ownerUserId, organizationId, signup.ownerName || signup.contactName, ownerEmail, passwordHash]
    );
    await client.query(
      `INSERT INTO organization_members (organization_id, user_id, role, status)
       VALUES ($1, $2, 'owner', 'active')`,
      [organizationId, ownerUserId]
    );
    await client.query(
      `INSERT INTO organization_subscriptions (
         id, organization_id, plan_id, status, billing_cycle, current_period_start,
         current_period_end, activated_at, created_at, updated_at
       )
       VALUES (
         $1, $2, $3, 'active', $4, NOW(),
         NOW() + CASE WHEN $4 = 'annual' THEN INTERVAL '1 year' ELSE INTERVAL '1 month' END,
         NOW(), NOW(), NOW()
       )`,
      [subscriptionId, organizationId, plan.id, billingCycle]
    );
    await client.query(
      `INSERT INTO signup_requests (
         id, organization_id, owner_user_id, plan_id, company_name, contact_name,
         contact_email, contact_phone, company_size, expected_volume, notes, status,
         reviewed_by_id, reviewed_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'approved', $12, NOW())`,
      [
        requestId,
        organizationId,
        ownerUserId,
        plan.id,
        signup.companyName,
        signup.ownerName || signup.contactName,
        ownerEmail,
        signup.contactPhone || "",
        signup.companySize || "",
        signup.expectedVolume || "",
        signup.notes || "Created manually by platform admin.",
        reviewerId || null,
      ]
    );
    await insertSubscriptionEvent(client, {
      organizationId,
      subscriptionId,
      actorUserId: reviewerId,
      eventType: "signup.manual_created",
      summary: "Company was manually created and activated by platform admin.",
      after: { signupRequestId: requestId, planId: plan.id, billingCycle },
    });
    await client.query("COMMIT");
    return {
      signupRequestId: requestId,
      organizationId,
      ownerUserId,
      subscriptionId,
      plan: toUiPlan(plan),
      organization: await getOrganizationDetail(organizationId),
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getBillingPayment(paymentId) {
  const result = await pool.query(
    `SELECT bp.*, sp.name AS plan_name
     FROM billing_payments bp
     LEFT JOIN organization_subscriptions os ON os.id = bp.subscription_id
     LEFT JOIN subscription_plans sp ON sp.id = os.plan_id
     WHERE bp.id = $1
     LIMIT 1`,
    [paymentId]
  );
  return result.rows[0] || null;
}

export async function getBillingPaymentByAuthority(authority) {
  const result = await pool.query(
    `SELECT bp.*, sp.name AS plan_name
     FROM billing_payments bp
     LEFT JOIN organization_subscriptions os ON os.id = bp.subscription_id
     LEFT JOIN subscription_plans sp ON sp.id = os.plan_id
     WHERE bp.gateway_authority = $1
     LIMIT 1`,
    [authority]
  );
  return result.rows[0] || null;
}

export async function markPaymentRequested(paymentId, { authority, gatewayUrl, rawRequest }) {
  const result = await pool.query(
    `UPDATE billing_payments
     SET gateway_authority = $2,
         gateway_url = $3,
         status = 'pending',
         raw_request = $4::jsonb,
         requested_at = NOW(),
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [paymentId, authority, gatewayUrl, JSON.stringify(rawRequest || {})]
  );
  return result.rows[0] || null;
}

export async function markPaymentVerifiedByAuthorityWithResult(authority, { ok, refId, rawVerify }) {
  return markPaymentVerifiedByAuthorityInRepository(pool, authority, { ok, refId, rawVerify });
}

export async function markPaymentVerifiedByAuthority(authority, { ok, refId, rawVerify }) {
  const result = await markPaymentVerifiedByAuthorityWithResult(authority, { ok, refId, rawVerify });
  return result.payment || null;
}

export async function listSignupRequests({ status } = {}) {
  const values = [];
  const where = status ? "WHERE sr.status = $1" : "";
  if (status) values.push(status);
  const result = await pool.query(
    `SELECT sr.*, sp.name AS plan_name, bp.status AS payment_status, bp.amount_irr AS payment_amount_irr,
            o.status AS organization_status,
            u.status AS user_status,
            os.status AS subscription_status,
            EXISTS (
              SELECT 1
              FROM billing_payments paid
              WHERE (paid.signup_request_id = sr.id OR paid.organization_id = sr.organization_id)
                AND paid.status = 'paid'
            ) AS has_paid_payment,
            EXISTS (
              SELECT 1
              FROM billing_receipts receipt
              LEFT JOIN billing_payments receipt_payment ON receipt_payment.id = receipt.payment_id
              LEFT JOIN billing_invoices receipt_invoice ON receipt_invoice.id = receipt.invoice_id
              WHERE receipt.organization_id = sr.organization_id
                 OR receipt_payment.signup_request_id = sr.id
                 OR receipt_invoice.signup_request_id = sr.id
            ) AS has_receipt
     FROM signup_requests sr
     LEFT JOIN subscription_plans sp ON sp.id = sr.plan_id
     LEFT JOIN billing_payments bp ON bp.id = sr.payment_id
     LEFT JOIN organizations o ON o.id = sr.organization_id
     LEFT JOIN app_users u ON u.id = sr.owner_user_id
     LEFT JOIN organization_subscriptions os ON os.organization_id = sr.organization_id
     ${where}
     ORDER BY sr.created_at DESC`,
    values
  );
  return result.rows.map(toUiSignupRequest);
}

async function getSignupRequestLifecycle(client, requestId, { forUpdate = false } = {}) {
  const result = await client.query(
    `SELECT sr.*, sp.name AS plan_name, bp.status AS payment_status, bp.amount_irr AS payment_amount_irr,
            o.status AS organization_status,
            u.status AS user_status,
            os.id AS subscription_id,
            os.status AS subscription_status,
            EXISTS (
              SELECT 1
              FROM billing_payments paid
              WHERE (paid.signup_request_id = sr.id OR paid.organization_id = sr.organization_id)
                AND paid.status = 'paid'
            ) AS has_paid_payment,
            EXISTS (
              SELECT 1
              FROM billing_receipts receipt
              LEFT JOIN billing_payments receipt_payment ON receipt_payment.id = receipt.payment_id
              LEFT JOIN billing_invoices receipt_invoice ON receipt_invoice.id = receipt.invoice_id
              WHERE receipt.organization_id = sr.organization_id
                 OR receipt_payment.signup_request_id = sr.id
                 OR receipt_invoice.signup_request_id = sr.id
            ) AS has_receipt
     FROM signup_requests sr
     LEFT JOIN subscription_plans sp ON sp.id = sr.plan_id
     LEFT JOIN billing_payments bp ON bp.id = sr.payment_id
     LEFT JOIN organizations o ON o.id = sr.organization_id
     LEFT JOIN app_users u ON u.id = sr.owner_user_id
     LEFT JOIN organization_subscriptions os ON os.organization_id = sr.organization_id
     WHERE sr.id = $1
     ${forUpdate ? "FOR UPDATE OF sr" : ""}`,
    [requestId]
  );
  return result.rows[0] || null;
}

async function getAbandonedSignupDeleteBlockers(client, row) {
  const blockers = [];
  if (!row.organization_id || !row.owner_user_id) blockers.push("SIGNUP_GRAPH_INCOMPLETE");
  if (row.has_paid_payment) blockers.push("PAID_PAYMENT_EXISTS");
  if (row.has_receipt) blockers.push("RECEIPT_EXISTS");
  if (row.status === "approved") blockers.push("SIGNUP_APPROVED");
  if (row.organization_status === "active") blockers.push("ORGANIZATION_ACTIVE");
  if (row.subscription_status === "active") blockers.push("SUBSCRIPTION_ACTIVE");
  if (row.user_status === "active") blockers.push("OWNER_USER_ACTIVE");
  if (!row.organization_id) return blockers;

  const counts = await client.query(
    `SELECT
       (SELECT COUNT(*)::int FROM app_users WHERE organization_id = $1 AND id <> $2) AS other_users,
       (SELECT COUNT(*)::int FROM customers WHERE organization_id = $1) AS customers,
       (SELECT COUNT(*)::int FROM shipments WHERE organization_id = $1) AS shipments,
       (SELECT COUNT(*)::int FROM tasks WHERE organization_id = $1) AS tasks,
       (SELECT COUNT(*)::int FROM documents WHERE organization_id = $1) AS documents,
       (SELECT COUNT(*)::int FROM cheques WHERE organization_id = $1) AS cheques,
       (SELECT COUNT(*)::int FROM compliance_meetings WHERE organization_id = $1) AS compliance_meetings,
       (SELECT COUNT(*)::int FROM quotations WHERE organization_id = $1) AS quotations,
       (SELECT COUNT(*)::int FROM archive_records WHERE organization_id = $1) AS archive_records,
       (SELECT COUNT(*)::int FROM chat_threads WHERE organization_id = $1) AS chat_threads`,
    [row.organization_id, row.owner_user_id]
  );
  const recordCounts = counts.rows[0] || {};
  if (Number(recordCounts.other_users || 0) > 0) blockers.push("ORGANIZATION_HAS_OTHER_USERS");
  for (const [key, value] of Object.entries(recordCounts)) {
    if (key !== "other_users" && Number(value || 0) > 0) blockers.push(`HAS_${key.toUpperCase()}`);
  }
  return blockers;
}

export async function deleteAbandonedSignupRequest(requestId, { actorUserId } = {}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const row = await getSignupRequestLifecycle(client, requestId, { forUpdate: true });
    if (!row) {
      await client.query("ROLLBACK");
      return null;
    }

    const blockers = await getAbandonedSignupDeleteBlockers(client, row);
    if (blockers.length || !isAbandonedSignupRow(row, { allowSuspendedUser: true })) {
      const error = new Error("This signup is not an abandoned unpaid signup.");
      error.statusCode = 409;
      error.code = "ABANDONED_SIGNUP_DELETE_BLOCKED";
      error.blockers = blockers.length ? blockers : ["NOT_ABANDONED_SIGNUP"];
      throw error;
    }

    const organizationId = row.organization_id;
    const ownerUserId = row.owner_user_id;
    const releasedEmail = row.contact_email;

    await client.query("DELETE FROM app_sessions WHERE user_id = $1", [ownerUserId]);
    await client.query("DELETE FROM login_sms_challenges WHERE user_id = $1", [ownerUserId]);
    await client.query(
      `DELETE FROM billing_invoice_items
       WHERE invoice_id IN (
         SELECT id
         FROM billing_invoices
         WHERE signup_request_id = $1 OR organization_id = $2 OR payment_id IN (
           SELECT id FROM billing_payments WHERE signup_request_id = $1 OR organization_id = $2
         )
       )`,
      [requestId, organizationId]
    );
    await client.query(
      "DELETE FROM billing_invoices WHERE signup_request_id = $1 OR organization_id = $2",
      [requestId, organizationId]
    );
    await client.query(
      "DELETE FROM billing_payments WHERE signup_request_id = $1 OR organization_id = $2",
      [requestId, organizationId]
    );
    await client.query("DELETE FROM subscription_events WHERE organization_id = $1", [organizationId]);
    await client.query("DELETE FROM user_records WHERE organization_id = $1 OR owner_user_id = $2", [organizationId, ownerUserId]);
    await client.query("DELETE FROM notifications WHERE organization_id = $1 OR user_id = $2", [organizationId, ownerUserId]);
    await client.query("DELETE FROM organization_members WHERE organization_id = $1 OR user_id = $2", [organizationId, ownerUserId]);
    await client.query("DELETE FROM signup_requests WHERE id = $1", [requestId]);
    await client.query("DELETE FROM organization_subscriptions WHERE organization_id = $1", [organizationId]);
    await client.query("DELETE FROM app_users WHERE id = $1 AND organization_id = $2", [ownerUserId, organizationId]);
    await client.query("DELETE FROM organizations WHERE id = $1", [organizationId]);
    await client.query("COMMIT");
    return { id: requestId, deleted: true, releasedEmail, organizationId, ownerUserId, actorUserId: actorUserId || null };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function createContactRequest(request = {}, requestContext = {}) {
  const preferred = ["phone", "email", "either"].includes(request.preferredContactMethod)
    ? request.preferredContactMethod
    : "phone";
  const result = await pool.query(
    `INSERT INTO contact_requests (
       id, company_name, contact_name, contact_email, contact_phone,
       preferred_contact_method, message, status, ip_address, user_agent
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'new', $8, $9)
     RETURNING *`,
    [
      crypto.randomUUID(),
      String(request.companyName || "").trim().slice(0, 200),
      String(request.contactName || "").trim().slice(0, 200),
      request.contactEmail ? String(request.contactEmail).trim().slice(0, 240) : null,
      request.contactPhone ? String(request.contactPhone).trim().slice(0, 80) : null,
      preferred,
      request.message ? String(request.message).trim().slice(0, 2000) : null,
      requestContext.ip || null,
      requestContext.userAgent || null,
    ]
  );
  return toUiContactRequest(result.rows[0]);
}

export async function listContactRequests({ status, limit = 100 } = {}) {
  const values = [];
  const conditions = [];
  if (status && ["new", "resolved"].includes(status)) {
    values.push(status);
    conditions.push(`cr.status = $${values.length}`);
  }
  values.push(Math.min(Math.max(Number(limit) || 100, 1), 250));
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const result = await pool.query(
    `SELECT cr.*, u.name AS resolved_by_name
     FROM contact_requests cr
     LEFT JOIN app_users u ON u.id = cr.resolved_by_id
     ${where}
     ORDER BY cr.created_at DESC
     LIMIT $${values.length}`,
    values
  );
  return result.rows.map(toUiContactRequest);
}

export async function resolveContactRequest(requestId, resolverUserId) {
  const result = await pool.query(
    `UPDATE contact_requests
     SET status = 'resolved',
         resolved_by_id = $2,
         resolved_at = NOW(),
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [requestId, resolverUserId || null]
  );
  return toUiContactRequest(result.rows[0]);
}

export async function reviewSignupRequest(requestId, { approved, reviewerId }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const request = await client.query("SELECT * FROM signup_requests WHERE id = $1 FOR UPDATE", [requestId]);
    const row = request.rows[0];
    if (!row) return null;
    if (approved) {
      const payment = await client.query("SELECT status FROM billing_payments WHERE id = $1", [row.payment_id]);
      if (payment.rows[0]?.status !== "paid") {
        const error = new Error("Payment must be verified before approval.");
        error.statusCode = 409;
        error.code = "PAYMENT_REQUIRED";
        throw error;
      }
    }
    const nextStatus = approved ? "approved" : "rejected";
    const organizationStatus = approved ? "active" : "rejected";
    const userStatus = approved ? "active" : "suspended";
    const subscriptionStatus = approved ? "active" : "rejected";
    await client.query(
      `UPDATE signup_requests
       SET status = $2, reviewed_by_id = $3, reviewed_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [requestId, nextStatus, reviewerId]
    );
    await client.query(
      `UPDATE organizations
       SET status = $2,
           approved_at = CASE WHEN $2 = 'active' THEN NOW() ELSE approved_at END,
           updated_at = NOW()
       WHERE id = $1`,
      [row.organization_id, organizationStatus]
    );
    await client.query("UPDATE app_users SET status = $2, updated_at = NOW() WHERE id = $1", [row.owner_user_id, userStatus]);
    await client.query(
      "UPDATE organization_members SET status = $2 WHERE organization_id = $1 AND user_id = $3",
      [row.organization_id, approved ? "active" : "suspended", row.owner_user_id]
    );
    await client.query(
      `UPDATE organization_subscriptions
       SET status = $2,
           current_period_start = CASE WHEN $2 = 'active' THEN NOW() ELSE current_period_start END,
           current_period_end = CASE WHEN $2 = 'active' THEN NOW() + CASE WHEN billing_cycle = 'annual' THEN INTERVAL '1 year' ELSE INTERVAL '1 month' END ELSE current_period_end END,
           activated_at = CASE WHEN $2 = 'active' THEN NOW() ELSE activated_at END,
           updated_at = NOW()
       WHERE organization_id = $1`,
      [row.organization_id, subscriptionStatus]
    );
    await insertSubscriptionEvent(client, {
      organizationId: row.organization_id,
      subscriptionId: null,
      actorUserId: reviewerId,
      eventType: approved ? "signup.approved" : "signup.rejected",
      summary: approved ? "Signup was approved and subscription activated." : "Signup was rejected.",
      after: { signupRequestId: requestId, subscriptionStatus, organizationStatus },
    });
    await client.query("COMMIT");
    return (await listSignupRequests()).find((item) => item.id === requestId) || null;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function listOrganizations() {
  const result = await pool.query(
    `SELECT o.*, sp.name AS plan_name, os.status AS subscription_status, os.billing_cycle,
            os.limits_override, COUNT(u.id)::int AS user_count,
            COUNT(*) FILTER (WHERE u.status = 'active')::int AS active_user_count
     FROM organizations o
     LEFT JOIN subscription_plans sp ON sp.id = o.plan_id
     LEFT JOIN organization_subscriptions os ON os.organization_id = o.id
     LEFT JOIN app_users u ON u.organization_id = o.id
     GROUP BY o.id, sp.name, os.status, os.billing_cycle, os.limits_override
     ORDER BY o.created_at DESC`
  );
  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status,
    planId: row.plan_id,
    planName: row.plan_name,
    contactName: row.contact_name,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    userCount: Number(row.user_count || 0),
    activeUserCount: Number(row.active_user_count || 0),
    subscriptionStatus: row.subscription_status,
    billingCycle: row.billing_cycle,
    limitsOverride: row.limits_override || {},
    createdAt: row.created_at,
  }));
}

function toUiPayment(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    organizationName: row.organization_name || "",
    subscriptionId: row.subscription_id,
    provider: row.provider,
    status: row.status,
    amountIrr: Number(row.amount_irr || 0),
    currency: row.currency,
    description: row.description || "",
    gatewayRefId: row.gateway_ref_id,
    manualOverride: Boolean(row.manual_override),
    manualNote: row.manual_note || "",
    markedById: row.marked_by_id || null,
    markedAt: row.marked_at,
    invoiceId: row.invoice_id || null,
    invoiceStatus: row.invoice_status || null,
    receiptId: row.receipt_id || null,
    requestedAt: row.requested_at,
    verifiedAt: row.verified_at,
    failedAt: row.failed_at,
    createdAt: row.created_at,
  };
}

function toUiErrorLog(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    organizationName: row.organization_name || "",
    userId: row.user_id,
    userEmail: row.user_email || "",
    severity: row.severity,
    source: row.source,
    message: row.message,
    stack: row.stack || "",
    route: row.route || "",
    apiEndpoint: row.api_endpoint || "",
    httpStatus: row.http_status,
    browser: row.browser || "",
    userAgent: row.user_agent || "",
    context: row.context || {},
    resolvedAt: row.resolved_at,
    resolvedById: row.resolved_by_id,
    createdAt: row.created_at,
  };
}

export async function getAdminOverview() {
  const result = await pool.query(
    `SELECT
       (SELECT COUNT(*)::int FROM organizations WHERE status = 'active') AS active_tenants,
       (SELECT COUNT(*)::int FROM organizations WHERE status IN ('pending_review', 'pending_payment')) AS pending_tenants,
       (SELECT COUNT(*)::int FROM organizations WHERE status = 'suspended') AS suspended_tenants,
       (SELECT COUNT(*)::int FROM signup_requests WHERE status = 'pending_review') AS pending_approvals,
       (SELECT COUNT(*)::int FROM contact_requests WHERE status = 'new') AS pending_contact_requests,
       (SELECT COUNT(*)::int FROM signup_requests sr JOIN billing_payments bp ON bp.id = sr.payment_id WHERE sr.status = 'pending_review' AND bp.status = 'paid') AS paid_pending_review,
       (SELECT COUNT(*)::int FROM app_error_logs WHERE resolved_at IS NULL) AS unresolved_errors,
       (SELECT COALESCE(SUM(amount_irr), 0)::numeric FROM billing_payments WHERE status = 'paid') AS paid_revenue_irr`
  );
  const row = result.rows[0] || {};
  const recentPayments = await listBillingPayments({ limit: 5 });
  const recentErrors = await listAppErrorLogs({ resolved: "unresolved", limit: 5 });
  return {
    activeTenants: Number(row.active_tenants || 0),
    pendingTenants: Number(row.pending_tenants || 0),
    suspendedTenants: Number(row.suspended_tenants || 0),
    pendingApprovals: Number(row.pending_approvals || 0),
    pendingContactRequests: Number(row.pending_contact_requests || 0),
    paidPendingReview: Number(row.paid_pending_review || 0),
    unresolvedErrors: Number(row.unresolved_errors || 0),
    paidRevenueIrr: Number(row.paid_revenue_irr || 0),
    recentPayments,
    recentErrors,
  };
}

export async function getOrganizationUsage(organizationId) {
  const result = await pool.query(
    `SELECT
       (SELECT COUNT(*)::int FROM app_users WHERE organization_id = $1 AND status <> 'suspended') AS users,
       (SELECT COUNT(*)::int FROM shipments WHERE organization_id = $1 AND created_at >= date_trunc('month', NOW())) AS monthly_shipments,
       (SELECT COUNT(*)::int FROM documents WHERE organization_id = $1 AND archived_at IS NULL) AS documents,
       (SELECT COALESCE(SUM(CASE WHEN file_size ~ '^[0-9]+$' THEN file_size::numeric ELSE 0 END), 0)::numeric FROM documents WHERE organization_id = $1 AND archived_at IS NULL) AS storage_bytes,
       (SELECT COUNT(*)::int FROM shipments WHERE organization_id = $1 AND customer_access_enabled = TRUE) AS customer_links`,
    [organizationId]
  );
  const row = result.rows[0] || {};
  return {
    users: Number(row.users || 0),
    monthlyShipments: Number(row.monthly_shipments || 0),
    documents: Number(row.documents || 0),
    storageMb: Math.round(Number(row.storage_bytes || 0) / 1024 / 1024),
    customerLinks: Number(row.customer_links || 0),
  };
}

export async function getOrganizationDetail(organizationId) {
  const result = await pool.query(
    `SELECT o.*, sp.name AS plan_name, os.status AS subscription_status, os.billing_cycle, os.limits_override
     FROM organizations o
     LEFT JOIN subscription_plans sp ON sp.id = o.plan_id
     LEFT JOIN organization_subscriptions os ON os.organization_id = o.id
     WHERE o.id = $1
     LIMIT 1`,
    [organizationId]
  );
  const row = result.rows[0];
  if (!row) return null;
  const owner = row.owner_user_id
    ? (await pool.query("SELECT id, name, email, status FROM app_users WHERE id = $1", [row.owner_user_id])).rows[0]
    : null;
  const subscription = await getOrganizationSubscription(organizationId);
  const usage = await getOrganizationUsage(organizationId);
  const recentErrors = await listAppErrorLogs({ organizationId, limit: 8 });
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status,
    planId: row.plan_id,
    planName: row.plan_name,
    contactName: row.contact_name,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    notes: row.notes || "",
    owner,
    subscription,
    usage,
    recentErrors,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function updateOrganizationRecord(organizationId, updates = {}) {
  const result = await pool.query(
    `UPDATE organizations
     SET name = COALESCE($2, name),
         contact_name = COALESCE($3, contact_name),
         contact_email = COALESCE($4, contact_email),
         contact_phone = COALESCE($5, contact_phone),
         notes = COALESCE($6, notes),
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [
      organizationId,
      updates.name || null,
      updates.contactName || null,
      updates.contactEmail || null,
      updates.contactPhone || null,
      updates.notes ?? null,
    ]
  );
  return result.rows[0] ? getOrganizationDetail(organizationId) : null;
}

export async function updateOrganizationStatus(organizationId, status) {
  await pool.query(
    `UPDATE organizations
     SET status = $2,
         suspended_at = CASE WHEN $2 = 'suspended' THEN NOW() ELSE suspended_at END,
         approved_at = CASE WHEN $2 = 'active' THEN COALESCE(approved_at, NOW()) ELSE approved_at END,
         updated_at = NOW()
     WHERE id = $1`,
    [organizationId, status]
  );
  return getOrganizationDetail(organizationId);
}

export async function getOrganizationSubscription(organizationId) {
  const subscription = await getEffectiveSubscriptionLimits(organizationId);
  return subscription.subscription;
}

export async function updateOrganizationSubscription(organizationId, updates = {}) {
  const fields = [];
  const values = [organizationId];
  if (updates.planId) {
    values.push(updates.planId);
    fields.push(`plan_id = $${values.length}`);
    await pool.query("UPDATE organizations SET plan_id = $2, updated_at = NOW() WHERE id = $1", [organizationId, updates.planId]);
  }
  if (updates.billingCycle) {
    values.push(updates.billingCycle);
    fields.push(`billing_cycle = $${values.length}`);
  }
  if (updates.status) {
    values.push(updates.status);
    fields.push(`status = $${values.length}`);
  }
  if (updates.limitsOverride !== undefined) {
    values.push(JSON.stringify(updates.limitsOverride || {}));
    fields.push(`limits_override = $${values.length}::jsonb`);
  }
  if (!fields.length) return getOrganizationSubscription(organizationId);
  await pool.query(
    `UPDATE organization_subscriptions
     SET ${fields.join(", ")}, updated_at = NOW()
     WHERE organization_id = $1`,
    values
  );
  return getOrganizationSubscription(organizationId);
}

export async function listBillingPayments({ limit = 50, organizationId } = {}) {
  const values = [];
  const where = organizationId ? "WHERE bp.organization_id = $1" : "";
  if (organizationId) values.push(organizationId);
  values.push(Number(limit) || 50);
  const result = await pool.query(
    `SELECT bp.*, o.name AS organization_name, bi.id AS invoice_id, bi.status AS invoice_status, br.id AS receipt_id
     FROM billing_payments bp
     LEFT JOIN organizations o ON o.id = bp.organization_id
     LEFT JOIN billing_invoices bi ON bi.payment_id = bp.id
     LEFT JOIN billing_receipts br ON br.payment_id = bp.id
     ${where}
     ORDER BY bp.created_at DESC
     LIMIT $${values.length}`,
    values
  );
  return result.rows.map(toUiPayment);
}

export async function listBillingInvoices({ limit = 100, organizationId, status } = {}) {
  const values = [];
  const conditions = [];
  if (organizationId) {
    values.push(organizationId);
    conditions.push(`bi.organization_id = $${values.length}`);
  }
  if (status) {
    values.push(status);
    conditions.push(`bi.status = $${values.length}`);
  }
  values.push(Number(limit) || 100);
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const result = await pool.query(
    `SELECT bi.*, o.name AS organization_name, bp.status AS payment_status, br.id AS receipt_id
     FROM billing_invoices bi
     LEFT JOIN organizations o ON o.id = bi.organization_id
     LEFT JOIN billing_payments bp ON bp.id = bi.payment_id
     LEFT JOIN billing_receipts br ON br.invoice_id = bi.id
     ${where}
     ORDER BY bi.created_at DESC
     LIMIT $${values.length}`,
    values
  );
  return result.rows.map(toUiInvoice);
}

export async function getBillingInvoice(invoiceId, { organizationId } = {}) {
  const values = [invoiceId];
  const orgClause = organizationId ? "AND bi.organization_id = $2" : "";
  if (organizationId) values.push(organizationId);
  const invoiceResult = await pool.query(
    `SELECT bi.*, o.name AS organization_name, bp.status AS payment_status, br.id AS receipt_id
     FROM billing_invoices bi
     LEFT JOIN organizations o ON o.id = bi.organization_id
     LEFT JOIN billing_payments bp ON bp.id = bi.payment_id
     LEFT JOIN billing_receipts br ON br.invoice_id = bi.id
     WHERE bi.id = $1 ${orgClause}
     LIMIT 1`,
    values
  );
  const invoice = invoiceResult.rows[0];
  if (!invoice) return null;
  const [items, receipt] = await Promise.all([
    pool.query("SELECT * FROM billing_invoice_items WHERE invoice_id = $1 ORDER BY created_at ASC", [invoice.id]),
    pool.query("SELECT * FROM billing_receipts WHERE invoice_id = $1 LIMIT 1", [invoice.id]),
  ]);
  return {
    ...toUiInvoice(invoice),
    items: items.rows.map(toUiInvoiceItem),
    receipt: toUiReceipt(receipt.rows[0]),
  };
}

export async function createBillingInvoice({ actorUserId, organizationId, subscriptionId, amountIrr, description, dueAt, notes }) {
  const client = await pool.connect();
  const invoiceId = crypto.randomUUID();
  try {
    await client.query("BEGIN");
    const subscription = subscriptionId
      ? (await client.query("SELECT * FROM organization_subscriptions WHERE id = $1", [subscriptionId])).rows[0]
      : (await client.query("SELECT * FROM organization_subscriptions WHERE organization_id = $1 ORDER BY created_at DESC LIMIT 1", [organizationId])).rows[0];
    const amount = Number(amountIrr || 0);
    const invoiceResult = await client.query(
      `INSERT INTO billing_invoices (
         id, organization_id, subscription_id, invoice_number, status, billing_cycle,
         subtotal_irr, tax_irr, total_irr, due_at, notes, metadata
       )
       VALUES ($1, $2, $3, $4, 'issued', $5, $6, 0, $6, COALESCE($7::timestamptz, NOW() + INTERVAL '7 days'), $8, $9::jsonb)
       RETURNING *`,
      [
        invoiceId,
        organizationId,
        subscription?.id || null,
        billingNumber("INV"),
        subscription?.billing_cycle || "monthly",
        amount,
        dueAt || null,
        notes || null,
        JSON.stringify({ createdBy: actorUserId || null }),
      ]
    );
    await client.query(
      `INSERT INTO billing_invoice_items (id, invoice_id, description, quantity, unit_amount_irr, total_amount_irr)
       VALUES ($1, $2, $3, 1, $4, $4)`,
      [crypto.randomUUID(), invoiceId, description || "Subscription invoice", amount]
    );
    await insertSubscriptionEvent(client, {
      organizationId,
      subscriptionId: subscription?.id || null,
      actorUserId,
      eventType: "invoice.issued",
      summary: "Invoice was issued by platform admin.",
      after: { invoiceId, amountIrr: amount },
    });
    await client.query("COMMIT");
    return getBillingInvoice(invoiceResult.rows[0].id);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function voidBillingInvoice(invoiceId, { actorUserId } = {}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const before = (await client.query("SELECT * FROM billing_invoices WHERE id = $1 FOR UPDATE", [invoiceId])).rows[0];
    if (!before) return null;
    const result = await client.query(
      `UPDATE billing_invoices
       SET status = 'void', voided_at = NOW(), updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [invoiceId]
    );
    await insertSubscriptionEvent(client, {
      organizationId: before.organization_id,
      subscriptionId: before.subscription_id,
      actorUserId,
      eventType: "invoice.voided",
      summary: "Invoice was voided by platform admin.",
      before,
      after: result.rows[0],
    });
    await client.query("COMMIT");
    return getBillingInvoice(invoiceId);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function markBillingPaymentManually(paymentId, { actorUserId, status, note, audit }) {
  const client = await pool.connect();
  const nextStatus = status === "failed" ? "failed" : "paid";
  try {
    await client.query("BEGIN");
    const before = (await client.query("SELECT * FROM billing_payments WHERE id = $1 FOR UPDATE", [paymentId])).rows[0];
    if (!before) {
      await client.query("ROLLBACK");
      return null;
    }
    const result = await client.query(
      `UPDATE billing_payments
       SET status = $2,
           manual_override = TRUE,
           manual_note = $3,
           marked_by_id = $4,
           marked_at = NOW(),
           verified_at = CASE WHEN $2 = 'paid' THEN COALESCE(verified_at, NOW()) ELSE verified_at END,
           failed_at = CASE WHEN $2 = 'failed' THEN COALESCE(failed_at, NOW()) ELSE failed_at END,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [paymentId, nextStatus, note || null, actorUserId || null]
    );
    const payment = result.rows[0];
    if (nextStatus === "paid") {
      await closeInvoiceForPayment(client, payment);
      await client.query("UPDATE signup_requests SET status = 'pending_review', updated_at = NOW() WHERE id = $1", [payment.signup_request_id]);
      await client.query("UPDATE organizations SET status = 'pending_review', updated_at = NOW() WHERE id = $1 AND status IN ('pending_payment', 'payment_failed')", [payment.organization_id]);
      await client.query("UPDATE organization_subscriptions SET status = 'pending_review', updated_at = NOW() WHERE id = $1 AND status IN ('pending_payment', 'payment_failed')", [payment.subscription_id]);
    }
    await insertSubscriptionEvent(client, {
      organizationId: payment.organization_id,
      subscriptionId: payment.subscription_id,
      actorUserId,
      eventType: nextStatus === "paid" ? "payment.manual_paid" : "payment.manual_failed",
      summary: nextStatus === "paid" ? "Payment was manually marked paid." : "Payment was manually marked failed.",
      after: { paymentId, status: nextStatus, note: note || "" },
    });
    if (audit) {
      await auditLog({
        ...audit,
        organizationId: audit.organizationId ?? payment.organization_id ?? null,
        before,
        after: payment,
        queryable: client,
        required: true,
      });
    }
    await client.query("COMMIT");
    return (await listBillingPayments({ organizationId: payment.organization_id })).find((item) => item.id === paymentId) || toUiPayment(payment);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function renewOrganizationSubscription(organizationId, { actorUserId } = {}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const before = (
      await client.query("SELECT * FROM organization_subscriptions WHERE organization_id = $1 ORDER BY created_at DESC LIMIT 1 FOR UPDATE", [organizationId])
    ).rows[0];
    if (!before) return null;
    const result = await client.query(
      `UPDATE organization_subscriptions
       SET status = 'active',
           current_period_start = NOW(),
           current_period_end = NOW() + CASE WHEN billing_cycle = 'annual' THEN INTERVAL '1 year' ELSE INTERVAL '1 month' END,
           activated_at = COALESCE(activated_at, NOW()),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [before.id]
    );
    await client.query("UPDATE organizations SET status = 'active', updated_at = NOW() WHERE id = $1", [organizationId]);
    await insertSubscriptionEvent(client, {
      organizationId,
      subscriptionId: before.id,
      actorUserId,
      eventType: "subscription.renewed",
      summary: "Subscription was renewed by platform admin.",
      before,
      after: result.rows[0],
    });
    await client.query("COMMIT");
    return getOrganizationSubscription(organizationId);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function expireOrganizationSubscription(organizationId, { actorUserId } = {}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const before = (
      await client.query("SELECT * FROM organization_subscriptions WHERE organization_id = $1 ORDER BY created_at DESC LIMIT 1 FOR UPDATE", [organizationId])
    ).rows[0];
    if (!before) return null;
    const result = await client.query(
      `UPDATE organization_subscriptions
       SET status = 'expired',
           current_period_end = COALESCE(current_period_end, NOW()),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [before.id]
    );
    await insertSubscriptionEvent(client, {
      organizationId,
      subscriptionId: before.id,
      actorUserId,
      eventType: "subscription.expired",
      summary: "Subscription was marked expired by platform admin.",
      before,
      after: result.rows[0],
    });
    await client.query("COMMIT");
    return getOrganizationSubscription(organizationId);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getOrganizationBilling(organizationId) {
  const [subscription, invoices, payments, events] = await Promise.all([
    getOrganizationSubscription(organizationId),
    listBillingInvoices({ organizationId, limit: 25 }),
    listBillingPayments({ organizationId, limit: 25 }),
    pool.query(
      `SELECT * FROM subscription_events
       WHERE organization_id = $1
       ORDER BY created_at DESC
       LIMIT 25`,
      [organizationId]
    ),
  ]);
  return {
    subscription,
    invoices,
    payments,
    events: events.rows.map(toUiSubscriptionEvent),
    unpaidInvoices: invoices.filter((invoice) => ["issued", "overdue"].includes(invoice.status)),
  };
}

export async function createAppErrorLog(error = {}) {
  const result = await pool.query(
    `INSERT INTO app_error_logs (
       id, organization_id, user_id, severity, source, message, stack, route,
       api_endpoint, http_status, browser, user_agent, context, created_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, NOW())
     RETURNING *`,
    [
      crypto.randomUUID(),
      error.organizationId || null,
      error.userId || null,
      error.severity || "error",
      error.source || "client",
      String(error.message || "Unknown error").slice(0, 2000),
      error.stack ? String(error.stack).slice(0, 8000) : null,
      error.route || null,
      error.apiEndpoint || null,
      error.httpStatus ? Number(error.httpStatus) : null,
      error.browser || null,
      error.userAgent || null,
      JSON.stringify(error.context || {}),
    ]
  );
  return toUiErrorLog(result.rows[0]);
}

export async function listAppErrorLogs({ organizationId, source, severity, resolved, route, status, limit = 100 } = {}) {
  const values = [];
  const conditions = [];
  if (organizationId) {
    values.push(organizationId);
    conditions.push(`el.organization_id = $${values.length}`);
  }
  if (source) {
    values.push(source);
    conditions.push(`el.source = $${values.length}`);
  }
  if (severity) {
    values.push(severity);
    conditions.push(`el.severity = $${values.length}`);
  }
  if (route) {
    values.push(`%${route}%`);
    conditions.push(`el.route ILIKE $${values.length}`);
  }
  if (status) {
    values.push(Number(status));
    conditions.push(`el.http_status = $${values.length}`);
  }
  if (resolved === "resolved") conditions.push("el.resolved_at IS NOT NULL");
  if (resolved === "unresolved") conditions.push("el.resolved_at IS NULL");
  values.push(Number(limit) || 100);
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const result = await pool.query(
    `SELECT el.*, o.name AS organization_name, u.email AS user_email
     FROM app_error_logs el
     LEFT JOIN organizations o ON o.id = el.organization_id
     LEFT JOIN app_users u ON u.id = el.user_id
     ${where}
     ORDER BY el.created_at DESC
     LIMIT $${values.length}`,
    values
  );
  return result.rows.map(toUiErrorLog);
}

export async function getAppErrorLog(errorId) {
  const result = await pool.query(
    `SELECT el.*, o.name AS organization_name, u.email AS user_email
     FROM app_error_logs el
     LEFT JOIN organizations o ON o.id = el.organization_id
     LEFT JOIN app_users u ON u.id = el.user_id
     WHERE el.id = $1
     LIMIT 1`,
    [errorId]
  );
  return toUiErrorLog(result.rows[0]);
}

export async function resolveAppErrorLog(errorId, resolverUserId) {
  const result = await pool.query(
    `UPDATE app_error_logs
     SET resolved_at = NOW(), resolved_by_id = $2
     WHERE id = $1
     RETURNING *`,
    [errorId, resolverUserId]
  );
  return toUiErrorLog(result.rows[0]);
}

export async function listAppUsers({ includeSuspended = true, organizationId } = {}) {
  const conditions = [];
  const values = [];
  if (!includeSuspended) conditions.push("u.status = 'active'");
  if (organizationId) {
    values.push(organizationId);
    conditions.push(`u.organization_id = $${values.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const result = await pool.query(
    `SELECT u.id, u.name, u.email, u.role, u.avatar, u.is_online, u.department, u.status, u.last_seen_at,
            u.phone, u.location, u.bio, u.two_factor_enabled, u.notification_preferences,
            u.organization_id, o.status AS organization_status, o.name AS organization_name, o.plan_id AS organization_plan_id
     FROM app_users u
     LEFT JOIN organizations o ON o.id = u.organization_id
     ${where}
     ORDER BY u.is_online DESC, u.name ASC`,
    values
  );
  return result.rows.map(toUiUser);
}

export async function createAppUserRecord({ actorUserId, user, passwordHash }) {
  const client = await pool.connect();
  const id = user.id || crypto.randomUUID();
  const actor = actorUserId ? await getUserById(actorUserId) : null;
  const organizationId = actor?.organization_id || actor?.organizationId || user.organizationId || null;
  await assertPlanAllowsUser(organizationId);
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `INSERT INTO app_users (
         id, organization_id, name, email, password_hash, role, avatar, is_online, department,
         status, phone, location, bio, notification_preferences, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE, $8, $9, $10, $11, $12, $13::jsonb, NOW())
       RETURNING id, organization_id, name, email, role, avatar, is_online, department, status, last_seen_at,
                 phone, location, bio, two_factor_enabled, notification_preferences`,
      [
        id,
        organizationId,
        user.name,
        user.email,
        passwordHash,
        user.role || "OPERATIONS",
        user.avatar || null,
        user.department || null,
        user.status || "active",
        user.phone || null,
        user.location || null,
        user.bio || null,
        JSON.stringify(user.notificationPreferences || {}),
      ]
    );
    if (organizationId) {
      await client.query(
        `INSERT INTO organization_members (organization_id, user_id, role, status)
         VALUES ($1, $2, 'member', $3)
         ON CONFLICT (organization_id, user_id) DO UPDATE SET status = EXCLUDED.status`,
        [organizationId, id, user.status || "active"]
      );
    }
    await syncUsersCollection(client, actorUserId);
    await client.query("COMMIT");
    return result.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function updateAppUserRecord(userId, updates, syncOwnerUserId, { organizationId, syncOrganizationId } = {}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const beforeValues = [userId];
    const beforeOrganizationFilter = organizationId ? ` AND organization_id = $${beforeValues.push(organizationId)}` : "";
    const before = await client.query(`SELECT * FROM app_users WHERE id = $1 ${beforeOrganizationFilter}`, beforeValues);
    const result = await client.query(
      `UPDATE app_users
       SET name = COALESCE($2, name),
           email = COALESCE($3, email),
           role = COALESCE($4, role),
           avatar = COALESCE($5, avatar),
           department = COALESCE($6, department),
           status = COALESCE($7, status),
           phone = COALESCE($8, phone),
           location = COALESCE($9, location),
           bio = COALESCE($10, bio),
           updated_at = NOW()
       WHERE id = $1
         AND ($11::text IS NULL OR organization_id = $11)
       RETURNING id, name, email, role, avatar, is_online, department, status, last_seen_at,
                 phone, location, bio, two_factor_enabled, notification_preferences, organization_id`,
      [
        userId,
        updates.name || null,
        updates.email || null,
        updates.role || null,
        updates.avatar || null,
        updates.department || null,
        updates.status || null,
        updates.phone || null,
        updates.location || null,
        updates.bio || null,
        organizationId || null,
      ]
    );
    if (result.rows[0]?.organization_id && updates.status) {
      await client.query(
        "UPDATE organization_members SET status = $3 WHERE organization_id = $1 AND user_id = $2",
        [result.rows[0].organization_id, userId, updates.status]
      );
    }
    if (syncOrganizationId || result.rows[0]?.organization_id) {
      await syncUsersCollectionForOrganization(client, syncOrganizationId || result.rows[0]?.organization_id, syncOwnerUserId);
    } else {
      await syncUsersCollection(client, syncOwnerUserId);
    }
    await client.query("COMMIT");
    return { before: before.rows[0] || null, after: result.rows[0] || null };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function previewAppUserDeletion(userId, { organizationId, actorUserId } = {}) {
  return previewUserDeletionFromRepository(pool, userId, { organizationId, actorUserId });
}

export async function deleteAppUserRecord(userId, { organizationId, actorUserId } = {}) {
  const preview = await previewAppUserDeletion(userId, { organizationId, actorUserId });
  if (!preview) return { before: null, deleted: false, preview: null };
  if (!preview.canDelete) {
    const error = new Error("User cannot be permanently deleted.");
    error.statusCode = 409;
    error.code = "USER_DELETE_BLOCKED";
    error.blockers = preview.blockers;
    throw error;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const before = await client.query(
      "SELECT * FROM app_users WHERE id = $1 AND organization_id = $2 FOR UPDATE",
      [userId, organizationId]
    );
    if (!before.rows[0]) {
      await client.query("ROLLBACK");
      return { before: null, deleted: false, preview: null };
    }
    await client.query(
      "DELETE FROM user_records WHERE owner_user_id = $1 OR (collection = 'users' AND item_id = $1)",
      [userId]
    );
    await client.query(
      "DELETE FROM app_users WHERE id = $1 AND organization_id = $2",
      [userId, organizationId]
    );
    await syncUsersCollectionForOrganization(client, organizationId, actorUserId);
    await client.query("COMMIT");
    return { before: before.rows[0], deleted: true, preview };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function listCustomersDetailed({ includeArchived = false, search = "", organizationId, includePrivateDetails = true } = {}) {
  return listCustomersDetailedFromRepository(pool, { includeArchived, search, organizationId, includePrivateDetails });
}

export async function getCustomerRecord(id, { organizationId, includePrivateDetails = true } = {}) {
  return getCustomerRecordFromRepository(pool, id, { organizationId, includePrivateDetails });
}

function cleanCustomerCode(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, "-")
    .toUpperCase();
}

function generatedCustomerCode() {
  return `CUS-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

async function ensureUniqueCustomerCode(client, organizationId, requestedCode, currentCustomerId = null) {
  let code = cleanCustomerCode(requestedCode);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (!code) code = generatedCustomerCode();
    const duplicate = await client.query(
      `SELECT id
       FROM customers
       WHERE organization_id = $1
         AND lower(customer_code) = lower($2)
         AND archived_at IS NULL
         AND ($3::text IS NULL OR id <> $3)
       LIMIT 1`,
      [organizationId, code, currentCustomerId]
    );
    if (!duplicate.rows[0]) return code;
    if (requestedCode) {
      const error = new Error("A customer with this code already exists.");
      error.code = "DUPLICATE_CUSTOMER_CODE";
      error.statusCode = 409;
      throw error;
    }
    code = generatedCustomerCode();
  }
  const error = new Error("Could not generate a unique customer code.");
  error.code = "CUSTOMER_CODE_GENERATION_FAILED";
  error.statusCode = 500;
  throw error;
}

function normalizeCustomerPhoneValue(value) {
  return String(value || "")
    .trim()
    .replace(/^00/, "+")
    .replace(/[()\s\-._]/g, "");
}

function normalizedCustomerPhoneRows(inputPhoneNumbers, fallbackPhone = "") {
  const rawRows = Array.isArray(inputPhoneNumbers) ? inputPhoneNumbers : [];
  const rows = rawRows
    .map((row, index) => ({
      id: String(row?.id || "").trim(),
      phoneNumber: normalizeCustomerPhoneValue(row?.phoneNumber),
      phoneLabel: String(row?.phoneLabel || "").trim(),
      note: String(row?.note || "").trim(),
      isPrimary: Boolean(row?.isPrimary),
      sortOrder: Number.isFinite(Number(row?.sortOrder)) ? Math.trunc(Number(row.sortOrder)) : index * 10,
    }))
    .filter((row) => row.phoneNumber);
  if (!rows.length && fallbackPhone) {
    rows.push({
      id: "",
      phoneNumber: normalizeCustomerPhoneValue(fallbackPhone),
      phoneLabel: "اصلی",
      note: "",
      isPrimary: true,
      sortOrder: 0,
    });
  }
  if (rows.length && !rows.some((row) => row.isPrimary)) rows[0].isPrimary = true;
  return rows.map((row, index) => ({
    ...row,
    isPrimary: row.isPrimary && index === rows.findIndex((item) => item.isPrimary),
    sortOrder: Number.isFinite(row.sortOrder) ? row.sortOrder : index * 10,
  }));
}

async function replaceCustomerPhoneNumbers(client, { organizationId, customerId, phoneNumbers, actorUserId }) {
  await client.query(
    `UPDATE customer_phone_numbers
     SET archived_at = COALESCE(archived_at, NOW()),
         updated_at = NOW(),
         updated_by_id = $3
     WHERE organization_id = $1
       AND customer_id = $2
       AND archived_at IS NULL`,
    [organizationId, customerId, actorUserId || null]
  );
  for (const [index, phone] of phoneNumbers.entries()) {
    await client.query(
      `INSERT INTO customer_phone_numbers (
         id, organization_id, customer_id, phone_number, phone_label, note,
         is_primary, sort_order, created_by_id, updated_by_id, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9, NOW())`,
      [
        crypto.randomUUID(),
        organizationId,
        customerId,
        phone.phoneNumber,
        phone.phoneLabel || null,
        phone.note || null,
        Boolean(phone.isPrimary),
        Number.isFinite(Number(phone.sortOrder)) ? Number(phone.sortOrder) : index * 10,
        actorUserId || null,
      ]
    );
  }
}

export async function createCustomerRecord({ ownerUserId, actorUserId, customer }) {
  const client = await pool.connect();
  const id = customer.id || crypto.randomUUID();
  try {
    await client.query("BEGIN");
    const owner = await client.query("SELECT organization_id FROM app_users WHERE id = $1", [ownerUserId]);
    const scopedOrganizationId = requireOrganizationScope(owner.rows[0]?.organization_id, "createCustomerRecord");
    const customerCode = await ensureUniqueCustomerCode(
      client,
      scopedOrganizationId,
      customer.customerCode || customer.code || ""
    );
    const phoneRows = normalizedCustomerPhoneRows(customer.phoneNumbers, customer.phone);
    const primaryPhone = phoneRows.find((phone) => phone.isPrimary)?.phoneNumber || phoneRows[0]?.phoneNumber || null;
    if (customer.email) {
      const duplicate = await client.query(
        "SELECT id FROM customers WHERE lower(email) = lower($1) AND organization_id = $2 AND archived_at IS NULL LIMIT 1",
        [customer.email, scopedOrganizationId]
      );
      if (duplicate.rows[0]) {
        const error = new Error("A customer with this email already exists.");
        error.code = "DUPLICATE_EMAIL";
        error.statusCode = 409;
        throw error;
      }
    }
    const result = await client.query(
      `INSERT INTO customers (
         id, organization_id, owner_user_id, customer_code, company_name, contact_name, email, phone, address,
         referrer, notes, status, legacy_data, created_by_id, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'active', $12::jsonb, $13, NOW())
       RETURNING *`,
      [
        id,
        scopedOrganizationId,
        ownerUserId,
        customerCode,
        customer.company || customer.companyName || customer.name,
        customer.name || customer.contactName || null,
        customer.email || null,
        primaryPhone,
        customer.address || null,
        customer.referrer || null,
        customer.notes || null,
        JSON.stringify({ ...customer, customerCode, phoneNumbers: phoneRows }),
        actorUserId || ownerUserId,
      ]
    );
    await replaceCustomerPhoneNumbers(client, {
      organizationId: scopedOrganizationId,
      customerId: result.rows[0].id,
      phoneNumbers: phoneRows,
      actorUserId: actorUserId || ownerUserId,
    });
    const savedPhoneNumbers = await listCustomerPhoneNumbers(client, {
      organizationId: scopedOrganizationId,
      customerId: result.rows[0].id,
    });
    await syncCustomerUserRecord(client, ownerUserId, result.rows[0]);
    await client.query("COMMIT");
    return toUiCustomer(result.rows[0], { phoneNumbers: savedPhoneNumbers });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function updateCustomerRecord(id, updates, { organizationId, actorUserId } = {}) {
  const client = await pool.connect();
  const scopedOrganizationId = requireOrganizationScope(organizationId, "updateCustomerRecord");
  try {
    await client.query("BEGIN");
    const before = await client.query(
      "SELECT * FROM customers WHERE id = $1 AND organization_id = $2",
      [id, scopedOrganizationId]
    );
    const current = before.rows[0];
    if (!current) {
      await client.query("ROLLBACK");
      return { before: null, after: null };
    }
    if (updates.email && updates.email !== current.email) {
      const duplicate = await client.query(
        "SELECT id FROM customers WHERE lower(email) = lower($1) AND id <> $2 AND organization_id = $3 AND archived_at IS NULL LIMIT 1",
        [updates.email, id, scopedOrganizationId]
      );
      if (duplicate.rows[0]) {
        const error = new Error("A customer with this email already exists.");
        error.code = "DUPLICATE_EMAIL";
        error.statusCode = 409;
        throw error;
      }
    }
    const shouldUpdateCode = updates.customerCode !== undefined || updates.code !== undefined;
    const nextCustomerCode = shouldUpdateCode
      ? await ensureUniqueCustomerCode(client, scopedOrganizationId, updates.customerCode || updates.code || "", id)
      : null;
    const shouldReplacePhones = updates.phoneNumbers !== undefined;
    const phoneRows = shouldReplacePhones
      ? normalizedCustomerPhoneRows(updates.phoneNumbers, updates.phone)
      : null;
    const nextPrimaryPhone = shouldReplacePhones
      ? phoneRows.find((phone) => phone.isPrimary)?.phoneNumber || phoneRows[0]?.phoneNumber || null
      : updates.phone || null;
    const legacyUpdate = {
      ...(updates || {}),
      ...(nextCustomerCode ? { customerCode: nextCustomerCode } : {}),
      ...(shouldReplacePhones ? { phoneNumbers: phoneRows } : {}),
    };
    const result = await client.query(
      `UPDATE customers
       SET company_name = COALESCE($2, company_name),
           contact_name = COALESCE($3, contact_name),
           email = COALESCE($4, email),
           phone = CASE WHEN $12::boolean THEN $5 ELSE COALESCE($5, phone) END,
           address = COALESCE($6, address),
           referrer = COALESCE($7, referrer),
           notes = COALESCE($8, notes),
           status = COALESCE($9, status),
           customer_code = COALESCE($10, customer_code),
           legacy_data = legacy_data || $11::jsonb,
           updated_at = NOW()
       WHERE id = $1 AND organization_id = $13
       RETURNING *`,
      [
        id,
        updates.company || updates.companyName || null,
        updates.name || updates.contactName || null,
        updates.email || null,
        nextPrimaryPhone,
        updates.address || null,
        updates.referrer || null,
        updates.notes || null,
        updates.status || null,
        nextCustomerCode,
        JSON.stringify(legacyUpdate),
        Boolean(shouldReplacePhones),
        scopedOrganizationId,
      ]
    );
    if (shouldReplacePhones) {
      await replaceCustomerPhoneNumbers(client, {
        organizationId: scopedOrganizationId,
        customerId: id,
        phoneNumbers: phoneRows,
        actorUserId: actorUserId || result.rows[0]?.owner_user_id,
      });
    }
    const savedPhoneNumbers = await listCustomerPhoneNumbers(client, {
      organizationId: scopedOrganizationId,
      customerId: id,
    });
    await syncCustomerUserRecord(client, result.rows[0]?.owner_user_id, result.rows[0]);
    await client.query("COMMIT");
    return {
      before: toUiCustomer(current),
      after: toUiCustomer(result.rows[0], { phoneNumbers: savedPhoneNumbers }),
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function archiveCustomerRecord(id, { organizationId } = {}) {
  const client = await pool.connect();
  const scopedOrganizationId = requireOrganizationScope(organizationId, "archiveCustomerRecord");
  try {
    await client.query("BEGIN");
    const before = await client.query(
      "SELECT * FROM customers WHERE id = $1 AND organization_id = $2",
      [id, scopedOrganizationId]
    );
    if (!before.rows[0]) {
      await client.query("ROLLBACK");
      return { before: null, after: null };
    }
    const result = await client.query(
      `UPDATE customers
       SET archived_at = COALESCE(archived_at, NOW()), status = 'archived', updated_at = NOW()
       WHERE id = $1 AND organization_id = $2
       RETURNING *`,
      [id, scopedOrganizationId]
    );
    await syncCustomerUserRecord(client, result.rows[0]?.owner_user_id, result.rows[0]);
    await client.query("COMMIT");
    return { before: toUiCustomer(before.rows[0]), after: toUiCustomer(result.rows[0]) };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function listCustomerRelated(id, type, { organizationId, includePrivateDetails = true } = {}) {
  const scopedOrganizationId = requireOrganizationScope(organizationId, "listCustomerRelated");
  if (!(await getCustomerRecord(id, { organizationId }))) return null;
  if (type === "shipments") {
    const result = await pool.query(
      `SELECT * FROM shipments
       WHERE customer_id = $1 AND organization_id = $2
         AND exited_archived_at IS NULL
       ORDER BY updated_at DESC`,
      [id, scopedOrganizationId]
    );
    return result.rows.map((row) => {
      const legacy = row.legacy_data || {};
      return {
      id: row.id,
      trackingNumber: row.shipment_code,
      containerNumber: legacy.containerNumber || "",
      customerId: row.customer_id,
      customerName: row.customer_name,
      status: row.status,
      origin: row.origin,
      destination: row.destination,
      estimatedDelivery: row.estimated_delivery_at,
      isArchived: Boolean(row.archived_at),
      createdAt: row.created_at,
      };
    });
  }
  if (type === "documents") return listDocuments({ customerId: id, organizationId, includeArchived: true });
  if (type === "quotations") {
    return listQuotations({
      customerId: id,
      organizationId,
      includeArchived: true,
      includeCustomerPrivateDetails: includePrivateDetails,
    });
  }
  if (type === "cheques") {
    const result = await pool.query(
      `SELECT * FROM cheques
       WHERE customer_id = $1 AND organization_id = $2
       ORDER BY updated_at DESC`,
      [id, scopedOrganizationId]
    );
    return result.rows.map(toUiCheque);
  }
  return [];
}

export async function listQuotations({
  ownerUserId,
  customerId,
  organizationId,
  includeArchived = false,
  includeCustomerPrivateDetails = true,
} = {}) {
  const conditions = [];
  const values = [];
  const scopedOrganizationId = requireOrganizationScope(organizationId, "listQuotations");
  values.push(scopedOrganizationId);
  conditions.push(`organization_id = $${values.length}`);
  if (ownerUserId) {
    values.push(ownerUserId);
    conditions.push(`owner_user_id = $${values.length}`);
  }
  if (customerId) {
    values.push(customerId);
    conditions.push(`customer_id = $${values.length}`);
  }
  if (!includeArchived) conditions.push("archived_at IS NULL");
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const result = await pool.query(`SELECT * FROM quotations ${where} ORDER BY updated_at DESC`, values);
  return result.rows.map((row) => toUiQuote(row, { includeCustomerPrivateDetails }));
}

export async function getQuotationRecord(id, { organizationId, includeCustomerPrivateDetails = true } = {}) {
  const values = [id];
  const organizationFilter = organizationScopeClause(values, organizationId, "organization_id", "getQuotationRecord");
  const result = await pool.query(`SELECT * FROM quotations WHERE id = $1 ${organizationFilter} LIMIT 1`, values);
  return toUiQuote(result.rows[0], { includeCustomerPrivateDetails });
}

export async function createQuotationRecord({
  ownerUserId,
  actorUserId,
  organizationId,
  tenantContext,
  quote,
  includeCustomerPrivateDetails = true,
}) {
  const scopedOrganizationId = tenantContext
    ? organizationIdFromTenantContext(tenantContext, "createQuotationRecord")
    : requireOrganizationScope(organizationId, "createQuotationRecord");
  const client = await pool.connect();
  const safeQuote = { ...(quote || {}) };
  if (!includeCustomerPrivateDetails) {
    delete safeQuote.customerPhone;
    delete safeQuote.customer_phone;
  }
  const id = safeQuote.id || crypto.randomUUID();
  try {
    await client.query("BEGIN");
    const owner = await client.query("SELECT organization_id FROM app_users WHERE id = $1", [ownerUserId]);
    if (owner.rows[0]?.organization_id !== scopedOrganizationId) {
      await client.query("ROLLBACK");
      const error = new Error("Quotation owner does not belong to the authenticated organization.");
      error.code = "TENANT_SCOPE_REQUIRED";
      error.statusCode = 403;
      throw error;
    }
    const result = await client.query(
      `INSERT INTO quotations (
         id, organization_id, owner_user_id, quotation_number, customer_id, customer_name, customer_phone,
         origin_city, destination_city, cargo_type, weight, dimensions, pickup_date,
         delivery_date, requirements, base_rate, fuel_surcharge, loading_fees,
         toll_fees, insurance_percentage, profit_margin, total_price, valid_until,
         status, notes, legacy_data, created_by_id, archived_at, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb,
               $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26::jsonb, $27, $28, NOW())
       RETURNING *`,
      [
        id,
        scopedOrganizationId,
        ownerUserId,
        safeQuote.quotationNumber || safeQuote.id || id,
        safeQuote.customerId || null,
        safeQuote.customerName || "Unknown customer",
        safeQuote.customerPhone || null,
        safeQuote.originCity || null,
        safeQuote.destinationCity || null,
        safeQuote.cargoType || "GENERAL",
        safeQuote.weight || 0,
        safeQuote.dimensions || null,
        safeQuote.pickupDate || null,
        safeQuote.deliveryDate || null,
        JSON.stringify(Array.isArray(safeQuote.requirements) ? safeQuote.requirements : []),
        safeQuote.baseRate || 0,
        safeQuote.fuelSurcharge || 0,
        safeQuote.loadingFees || 0,
        safeQuote.tollFees || 0,
        safeQuote.insurancePercentage || 0,
        safeQuote.profitMargin || 0,
        safeQuote.totalPrice || 0,
        safeQuote.validUntil || null,
        safeQuote.status || "PENDING",
        safeQuote.notes || null,
        JSON.stringify(safeQuote),
        actorUserId || ownerUserId,
        safeQuote.isArchived ? new Date() : null,
      ]
    );
    await syncQuoteUserRecord(client, ownerUserId, result.rows[0]);
    await client.query("COMMIT");
    return toUiQuote(result.rows[0], { includeCustomerPrivateDetails });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function updateQuotationRecord(id, updates, { organizationId, includeCustomerPrivateDetails = true } = {}) {
  const client = await pool.connect();
  const scopedOrganizationId = requireOrganizationScope(organizationId, "updateQuotationRecord");
  updates = { ...(updates || {}) };
  if (!includeCustomerPrivateDetails) {
    delete updates.customerPhone;
    delete updates.customer_phone;
  }
  try {
    await client.query("BEGIN");
    const before = await client.query(
      "SELECT * FROM quotations WHERE id = $1 AND organization_id = $2",
      [id, scopedOrganizationId]
    );
    if (!before.rows[0]) {
      await client.query("ROLLBACK");
      return { before: null, after: null };
    }
    const result = await client.query(
      `UPDATE quotations
       SET customer_id = COALESCE($2, customer_id),
           customer_name = COALESCE($3, customer_name),
           customer_phone = COALESCE($4, customer_phone),
           origin_city = COALESCE($5, origin_city),
           destination_city = COALESCE($6, destination_city),
           cargo_type = COALESCE($7, cargo_type),
           weight = COALESCE($8, weight),
           dimensions = COALESCE($9, dimensions),
           pickup_date = COALESCE($10, pickup_date),
           delivery_date = COALESCE($11, delivery_date),
           requirements = COALESCE($12::jsonb, requirements),
           base_rate = COALESCE($13, base_rate),
           fuel_surcharge = COALESCE($14, fuel_surcharge),
           loading_fees = COALESCE($15, loading_fees),
           toll_fees = COALESCE($16, toll_fees),
           insurance_percentage = COALESCE($17, insurance_percentage),
           profit_margin = COALESCE($18, profit_margin),
           total_price = COALESCE($19, total_price),
           valid_until = COALESCE($20, valid_until),
           status = COALESCE($21, status),
           notes = COALESCE($22, notes),
           legacy_data = legacy_data || $23::jsonb,
           archived_at = CASE WHEN $24::boolean THEN COALESCE(archived_at, NOW()) ELSE archived_at END,
           updated_at = NOW()
        WHERE id = $1 AND organization_id = $25
        RETURNING *`,
      [
        id,
        updates.customerId || null,
        updates.customerName || null,
        updates.customerPhone || null,
        updates.originCity || null,
        updates.destinationCity || null,
        updates.cargoType || null,
        updates.weight ?? null,
        updates.dimensions || null,
        updates.pickupDate || null,
        updates.deliveryDate || null,
        updates.requirements ? JSON.stringify(updates.requirements) : null,
        updates.baseRate ?? null,
        updates.fuelSurcharge ?? null,
        updates.loadingFees ?? null,
        updates.tollFees ?? null,
        updates.insurancePercentage ?? null,
        updates.profitMargin ?? null,
        updates.totalPrice ?? null,
        updates.validUntil || null,
        updates.status || null,
        updates.notes || null,
        JSON.stringify(updates || {}),
        Boolean(updates.isArchived || updates.status === "ARCHIVED"),
        scopedOrganizationId,
      ]
    );
    await syncQuoteUserRecord(client, result.rows[0]?.owner_user_id, result.rows[0]);
    await client.query("COMMIT");
    return {
      before: toUiQuote(before.rows[0], { includeCustomerPrivateDetails }),
      after: toUiQuote(result.rows[0], { includeCustomerPrivateDetails }),
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function setQuotationStatus(id, status, extra = {}, { organizationId, includeCustomerPrivateDetails = true } = {}) {
  const timestampColumn =
    status === "ACCEPTED" ? "accepted_at" : status === "REJECTED" ? "rejected_at" : status === "EXPIRED" ? "expired_at" : null;
  const client = await pool.connect();
  const scopedOrganizationId = requireOrganizationScope(organizationId, "setQuotationStatus");
  try {
    await client.query("BEGIN");
    const before = await client.query(
      "SELECT * FROM quotations WHERE id = $1 AND organization_id = $2",
      [id, scopedOrganizationId]
    );
    if (!before.rows[0]) {
      await client.query("ROLLBACK");
      return { before: null, after: null };
    }
    const result = await client.query(
      `UPDATE quotations
       SET status = $2,
           notes = COALESCE($3, notes),
           ${timestampColumn ? `${timestampColumn} = COALESCE(${timestampColumn}, NOW()),` : ""}
           archived_at = CASE WHEN $2 = 'ARCHIVED' THEN COALESCE(archived_at, NOW()) ELSE archived_at END,
           updated_at = NOW()
        WHERE id = $1 AND organization_id = $4
        RETURNING *`,
      [id, status, extra.notes || extra.reason || null, scopedOrganizationId]
    );
    await syncQuoteUserRecord(client, result.rows[0]?.owner_user_id, result.rows[0]);
    await client.query("COMMIT");
    return {
      before: toUiQuote(before.rows[0], { includeCustomerPrivateDetails }),
      after: toUiQuote(result.rows[0], { includeCustomerPrivateDetails }),
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function convertQuotationToShipment(id, actorUserId, { organizationId, includeCustomerPrivateDetails = true } = {}) {
  const client = await pool.connect();
  const scopedOrganizationId = requireOrganizationScope(organizationId, "convertQuotationToShipment");
  try {
    await client.query("BEGIN");
    const quoteResult = await client.query(
      "SELECT * FROM quotations WHERE id = $1 AND organization_id = $2",
      [id, scopedOrganizationId]
    );
    const quote = quoteResult.rows[0];
    if (!quote) {
      await client.query("ROLLBACK");
      return null;
    }
    const shipmentId = `s-${crypto.randomUUID().slice(0, 8)}`;
    const shipmentCode = `LS-Q-${String(Date.now()).slice(-6)}`;
    const shipment = await client.query(
      `INSERT INTO shipments (
         id, organization_id, owner_user_id, shipment_code, customer_id, customer_name, status,
         origin, destination, estimated_delivery_at, legacy_data, created_by_id, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', $7, $8, $9, $10::jsonb, $11, NOW())
       RETURNING *`,
      [
        shipmentId,
        scopedOrganizationId,
        quote.owner_user_id,
        shipmentCode,
        quote.customer_id,
        quote.customer_name,
        quote.origin_city,
        quote.destination_city,
        quote.delivery_date,
        JSON.stringify({ sourceQuotationId: quote.id, quote: toUiQuote(quote, { includeCustomerPrivateDetails }) }),
        actorUserId || quote.owner_user_id,
      ]
    );
    const updated = await client.query(
      `UPDATE quotations
       SET status = 'ACCEPTED', accepted_at = COALESCE(accepted_at, NOW()),
           converted_shipment_id = $2, updated_at = NOW()
        WHERE id = $1 AND organization_id = $3
        RETURNING *`,
      [id, shipmentId, scopedOrganizationId]
    );
    await syncQuoteUserRecord(client, quote.owner_user_id, updated.rows[0]);
    await client.query("COMMIT");
    return {
      quote: toUiQuote(updated.rows[0], { includeCustomerPrivateDetails }),
      shipment: shipment.rows[0],
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function archiveTitle(entityType, row) {
  const legacy = row?.legacy_data || {};
  if (entityType === "shipment") return row.shipment_code || legacy.trackingNumber || row.id;
  if (entityType === "document") return row.title || row.file_name || legacy.name || row.id;
  if (entityType === "cheque") return row.cheque_number || legacy.chequeNumber || row.id;
  if (entityType === "compliance_meeting") return row.title || legacy.purpose || row.id;
  if (entityType === "quotation") return row.quotation_number || legacy.id || row.id;
  if (entityType === "customer") return row.company_name || legacy.company || row.id;
  return row?.id || "Archived record";
}

const archiveTables = {
  shipment: { table: "shipments", id: "id" },
  document: { table: "documents", id: "id" },
  cheque: { table: "cheques", id: "id" },
  compliance_meeting: { table: "compliance_meetings", id: "id" },
  quotation: { table: "quotations", id: "id" },
  customer: { table: "customers", id: "id" },
};

export async function listArchiveRecords({ search = "", organizationId } = {}) {
  const scopedOrganizationId = requireOrganizationScope(organizationId, "listArchiveRecords");
  const records = [];
  for (const [entityType, config] of Object.entries(archiveTables)) {
    if (!QUOTATIONS_UI_SURFACE_ENABLED && entityType === "quotation") continue;
    const values = [scopedOrganizationId];
    const conditions = ["archived_at IS NOT NULL", "organization_id = $1"];
    const result = await pool.query(
      `SELECT * FROM ${config.table} WHERE ${conditions.join(" AND ")} ORDER BY archived_at DESC`,
      values
    );
    for (const row of result.rows) {
      const title = archiveTitle(entityType, row);
      const item = {
        id: `${entityType}:${row.id}`,
        entityType,
        entityId: row.id,
        type: entityType.toUpperCase(),
        title,
        name: title,
        customerName: row.customer_code || row.customer_id || row.legacy_data?.customerCode || (entityType === "customer" ? row.id : ""),
        shipmentId: row.shipment_id || row.id,
        archivedAt: row.archived_at,
        createdAt: row.created_at,
        data:
          entityType === "quotation" ? toUiQuote(row) :
          entityType === "customer" ? toUiCustomer(row) :
          entityType === "cheque" ? toUiCheque(row) :
          entityType === "document" ? toUiDocument(row) :
          entityType === "compliance_meeting" ? toUiAppointment(row) :
          { id: row.id, ...(row.legacy_data || {}) },
      };
      records.push(item);
    }
  }
  const term = String(search || "").toLowerCase();
  return records
    .filter((item) => !term || `${item.title} ${item.customerName} ${item.entityId}`.toLowerCase().includes(term))
    .sort((a, b) => new Date(b.archivedAt || b.createdAt).getTime() - new Date(a.archivedAt || a.createdAt).getTime());
}

export async function archiveEntityRecord(entityType, entityId, actorUserId, { organizationId, audit } = {}) {
  const config = archiveTables[entityType];
  if (!config) return null;
  const scopedOrganizationId = requireOrganizationScope(organizationId, "archiveEntityRecord");

  return withTransaction(pool, async (client) => {
    const result = await client.query(
      `UPDATE ${config.table}
       SET archived_at = COALESCE(archived_at, NOW()), updated_at = NOW()
       WHERE ${config.id} = $1 AND organization_id = $2
       RETURNING *`,
      [entityId, scopedOrganizationId]
    );
    const row = result.rows[0];
    if (!row) return null;
    await client.query(
      `INSERT INTO archive_records (
         id, organization_id, owner_user_id, entity_type, entity_id, title, summary,
         customer_name, shipment_id, archived_by_id, archived_at, legacy_data
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, COALESCE($11, NOW()), $12::jsonb)
       ON CONFLICT (entity_type, entity_id) DO UPDATE SET
         organization_id = EXCLUDED.organization_id,
         title = EXCLUDED.title,
         archived_at = EXCLUDED.archived_at,
         restored_at = NULL,
         legacy_data = EXCLUDED.legacy_data`,
      [
        crypto.randomUUID(),
        row.organization_id || scopedOrganizationId,
        row.owner_user_id || actorUserId || null,
        entityType,
        entityId,
        archiveTitle(entityType, row),
        `${entityType} archived`,
        row.customer_code || row.customer_id || (entityType === "customer" ? row.id : null),
        row.shipment_id || (entityType === "shipment" ? row.id : null),
        actorUserId || null,
        row.archived_at,
        JSON.stringify(row.legacy_data || {}),
      ]
    );
    if (entityType === "document") {
      await syncDocumentUserRecord(client, row.owner_user_id, row);
    }
    if (audit) {
      await auditLog({
        ...audit,
        organizationId: audit.organizationId ?? scopedOrganizationId,
        after: entityType === "document" ? sanitizeDocumentAuditSnapshot(row) : row,
        queryable: client,
        required: true,
      });
    }
    return row;
  });
}

export async function restoreEntityRecord(entityType, entityId, { organizationId, audit } = {}) {
  const config = archiveTables[entityType];
  if (!config) return null;
  const scopedOrganizationId = requireOrganizationScope(organizationId, "restoreEntityRecord");
  const statusReset = {
    customer: ", status = 'active'",
    quotation: ", status = 'PENDING'",
    cheque: ", status = 'CLEARED'",
    compliance_meeting: ", status = 'SCHEDULED'",
  }[entityType] || "";

  return withTransaction(pool, async (client) => {
    const result = await client.query(
      `UPDATE ${config.table}
       SET archived_at = NULL, updated_at = NOW()${statusReset}
       WHERE ${config.id} = $1 AND organization_id = $2
       RETURNING *`,
      [entityId, scopedOrganizationId]
    );
    const row = result.rows[0] || null;
    if (!row) return null;
    await client.query(
      `UPDATE archive_records
       SET restored_at = NOW()
       WHERE entity_type = $1
         AND entity_id = $2
         AND organization_id = $3`,
      [entityType, entityId, scopedOrganizationId]
    );
    if (entityType === "document") {
      await syncDocumentUserRecord(client, row.owner_user_id, row);
    }
    if (audit) {
      await auditLog({
        ...audit,
        organizationId: audit.organizationId ?? scopedOrganizationId,
        after: entityType === "document" ? sanitizeDocumentAuditSnapshot(row) : row,
        queryable: client,
        required: true,
      });
    }
    return row;
  });
}

export async function deleteArchivedEntityRecord(entityType, entityId, { organizationId, audit } = {}) {
  const config = archiveTables[entityType];
  if (!config) return null;
  const scopedOrganizationId = requireOrganizationScope(organizationId, "deleteArchivedEntityRecord");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `DELETE FROM ${config.table}
       WHERE ${config.id} = $1
         AND organization_id = $2
         AND archived_at IS NOT NULL
       RETURNING *`,
      [entityId, scopedOrganizationId]
    );
    const row = result.rows[0];
    if (!row) {
      await client.query("ROLLBACK");
      return null;
    }
    await client.query(
      "DELETE FROM archive_records WHERE entity_type = $1 AND entity_id = $2 AND organization_id = $3",
      [entityType, entityId, scopedOrganizationId]
    );
    if (entityType === "document") {
      await client.query(
        `DELETE FROM user_records
         WHERE collection = 'documents'
           AND item_id = $1
           AND organization_id = $2`,
        [entityId, scopedOrganizationId]
      );
    }
    if (audit) {
      await auditLog({
        ...audit,
        organizationId: audit.organizationId ?? scopedOrganizationId,
        before: entityType === "document" ? sanitizeDocumentAuditSnapshot(row) : row,
        queryable: client,
        required: true,
      });
    }
    await client.query("COMMIT");
    return row;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

const CHAT_MESSAGE_MAX_LENGTH = 3000;

function chatAccessError(message = "Thread access denied.", statusCode = 403, code = "FORBIDDEN") {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function normalizeChatMessageBody(value) {
  const body = String(value || "").trim();
  if (!body) throw chatAccessError("Message cannot be empty.", 400, "CHAT_MESSAGE_EMPTY");
  if (body.length > CHAT_MESSAGE_MAX_LENGTH) {
    throw chatAccessError("Message is too long.", 400, "CHAT_MESSAGE_TOO_LONG");
  }
  return body;
}

function directChatKey(organizationId, userAId, userBId) {
  const ids = [String(userAId), String(userBId)].sort();
  return crypto
    .createHash("sha256")
    .update(`${organizationId}:${ids[0]}:${ids[1]}`)
    .digest("hex");
}

function directChatId(organizationId, userAId, userBId) {
  return `dm-${crypto.createHash("sha256").update(directChatKey(organizationId, userAId, userBId)).digest("hex").slice(0, 32)}`;
}

function shipmentChatId(organizationId, shipmentId) {
  return `shipment-${crypto
    .createHash("sha256")
    .update(`${organizationId}:${shipmentId}`)
    .digest("hex")
    .slice(0, 32)}`;
}

function permissionsAllowShipmentChat(permissions = [], shipment = {}, userId = "") {
  if (!permissions.includes("chat.use")) return false;
  if (permissions.includes("shipments.view_all")) return true;
  if (!permissions.includes("shipments.view_assigned")) return false;
  return shipment.owner_user_id === userId || shipment.assigned_manager_id === userId;
}

async function userHasShipmentChatAccess(queryable, { userId, organizationId, shipmentId }) {
  if (!userId || !shipmentId) return false;
  const scopedOrganizationId = requireOrganizationScope(organizationId, "userHasShipmentChatAccess");
  const shipmentResult = await queryable.query(
    `SELECT id, organization_id, owner_user_id, assigned_manager_id
     FROM shipments
     WHERE id = $1
       AND organization_id = $2
     LIMIT 1`,
    [shipmentId, scopedOrganizationId]
  );
  const shipment = shipmentResult.rows[0];
  if (!shipment) return false;
  const permissions = await getUserPermissionsWithClient(queryable, userId);
  return permissionsAllowShipmentChat(permissions, shipment, userId);
}

async function chatThreadAccessAllowed(queryable, row, userId, organizationId) {
  if (!row) return false;
  if (row.type !== "SHIPMENT") return true;
  return userHasShipmentChatAccess(queryable, {
    userId,
    organizationId,
    shipmentId: row.shipment_id,
  });
}

async function filterShipmentChatMemberRows(queryable, rows, { organizationId }) {
  const first = rows[0];
  if (!first || first.thread_type !== "SHIPMENT") return rows;
  const scopedOrganizationId = organizationId || first.organization_id;
  const filtered = [];
  for (const row of rows) {
    if (await userHasShipmentChatAccess(queryable, {
      userId: row.id || row.user_id,
      organizationId: scopedOrganizationId,
      shipmentId: row.shipment_id,
    })) {
      filtered.push(row);
    }
  }
  return filtered;
}

async function ensureAccessibleShipmentThreadMembershipsForUser(userId, { organizationId } = {}) {
  const scopedOrganizationId = requireOrganizationScope(organizationId, "ensureAccessibleShipmentThreadMembershipsForUser");
  const result = await pool.query(
    `SELECT t.id, t.shipment_id
     FROM chat_threads t
     WHERE t.organization_id = $1
       AND t.type = 'SHIPMENT'
       AND t.shipment_id IS NOT NULL
       AND t.archived_at IS NULL
       AND NOT EXISTS (
         SELECT 1
         FROM chat_thread_members m
         WHERE m.thread_id = t.id
           AND m.organization_id = t.organization_id
           AND m.user_id = $2
           AND m.status = 'active'
       )`,
    [scopedOrganizationId, userId]
  );
  for (const row of result.rows) {
    if (!(await userHasShipmentChatAccess(pool, {
      userId,
      organizationId: scopedOrganizationId,
      shipmentId: row.shipment_id,
    }))) {
      continue;
    }
    await upsertChatMember(pool, {
      threadId: row.id,
      userId,
      organizationId: scopedOrganizationId,
      role: "member",
      actorUserId: userId,
    });
  }
}

function toUiChatMember(row) {
  return {
    id: row.id,
    userId: row.id,
    name: row.name || row.email || "User",
    displayName: row.name || row.email || "User",
    email: row.email || "",
    role: row.role || "",
    roleName: row.role || "",
    avatar: row.avatar || "",
    isOnline: Boolean(row.is_online),
    active: (row.status || "active") === "active",
    memberRole: row.member_role || "member",
  };
}

function toUiChatThread(row, members = [], lastMessage = null) {
  const type = row.type === "DM" ? "DM" : row.type === "SHIPMENT" ? "SHIPMENT" : "GROUP";
  const shipmentCode = row.shipment_code || row.shipment_reference || row.shipment_id || "";
  const shipmentDetailUrl = row.shipment_id ? `/shipments/${encodeURIComponent(row.shipment_id)}` : undefined;
  return {
    id: row.id,
    type,
    threadType: type.toLowerCase(),
    name: type === "SHIPMENT" ? row.name || `Shipment ${shipmentCode}` : row.name || "",
    description: row.description || "",
    roleLimit: row.role_limit || undefined,
    icon: row.icon || undefined,
    legacyChannelId: row.legacy_channel_id || undefined,
    shipmentId: row.shipment_id || undefined,
    shipmentCode: shipmentCode || undefined,
    shipmentStatus: row.shipment_status || undefined,
    customerName: row.shipment_customer_name || undefined,
    shipmentDetailUrl,
    shipment: row.shipment_id
      ? {
        id: row.shipment_id,
        code: shipmentCode,
        status: row.shipment_status || "",
        customerName: row.shipment_customer_name || "",
        detailUrl: shipmentDetailUrl,
      }
      : undefined,
    unreadCount: Number(row.unread_count || 0),
    lastReadAt: row.last_read_at || null,
    participantCount: members.length,
    members,
    lastMessage,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function formatAttachmentSize(bytes = 0) {
  const size = Number(bytes) || 0;
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function toUiChatAttachment(row) {
  if (!row) return null;
  const deletedAt = row.deleted_at || null;
  const baseUrl = `/api/chat/messages/${encodeURIComponent(row.message_id)}/attachments/${encodeURIComponent(row.id)}`;
  return {
    id: row.id,
    messageId: row.message_id,
    threadId: row.thread_id,
    filename: row.original_filename || row.file_name || row.id,
    contentType: row.content_type || "application/octet-stream",
    sizeBytes: Number(row.size_bytes || 0),
    fileSize: formatAttachmentSize(row.size_bytes),
    attachmentType: row.attachment_type === "image" ? "image" : "document",
    createdAt: row.created_at,
    deletedAt,
    deletedReason: row.deleted_reason || null,
    ...(deletedAt ? {} : {
      downloadUrl: `${baseUrl}/download`,
      ...(row.attachment_type === "image" ? { previewUrl: `${baseUrl}/preview` } : {}),
    }),
  };
}

function toUiChatMediaAttachment(row) {
  const attachment = toUiChatAttachment(row);
  if (!attachment) return null;
  return {
    ...attachment,
    uploadedBy: row.uploaded_by_name || row.uploaded_by_email || "",
    uploadedById: row.uploaded_by_id || null,
    threadType: row.thread_type === "SHIPMENT" ? "SHIPMENT" : row.thread_type === "DM" ? "DM" : "GROUP",
    threadName: row.thread_name || "",
    shipment: row.shipment_id
      ? {
        id: row.shipment_id,
        code: row.shipment_code || row.shipment_id,
        status: row.shipment_status || "",
        customerName: row.shipment_customer_name || "",
        detailUrl: `/shipments/${encodeURIComponent(row.shipment_id)}`,
      }
      : null,
  };
}

async function listChatAttachmentsForMessages(queryable, messageIds = [], organizationId) {
  const ids = [...new Set(messageIds.filter(Boolean))];
  if (!ids.length) return new Map();
  const result = await queryable.query(
    `SELECT *
     FROM chat_message_attachments
     WHERE organization_id = $1
       AND message_id = ANY($2::text[])
     ORDER BY created_at ASC`,
    [organizationId, ids]
  );
  const attachmentsByMessage = new Map();
  for (const row of result.rows) {
    const list = attachmentsByMessage.get(row.message_id) || [];
    list.push(toUiChatAttachment(row));
    attachmentsByMessage.set(row.message_id, list);
  }
  return attachmentsByMessage;
}

function toUiChatMessage(row, attachments = []) {
  const legacy = row.legacy_data || {};
  const body = row.body || row.content || "";
  return {
    id: row.id,
    threadId: row.thread_id,
    senderId: row.sender_id,
    senderName: row.sender_name,
    receiverId: legacy.receiverId,
    receiverName: legacy.receiverName,
    groupId: legacy.groupId || row.thread_id,
    isGroup: legacy.isGroup ?? true,
    body,
    content: body,
    clientMessageId: row.client_message_id || undefined,
    status: row.status || "sent",
    read: legacy.read ?? false,
    attachments,
    createdAt: row.created_at,
  };
}

export async function seedDefaultChatThreads(ownerUserId = "u1", organizationId) {
  // Legacy channels are no longer seeded into live chat. The function remains
  // as a compatibility no-op for old bootstrap code paths.
  return [];
}

async function assertChatParticipant(queryable, { threadId, userId, organizationId, lock = false }) {
  const scopedOrganizationId = requireOrganizationScope(organizationId, "assertChatParticipant");
  const result = await queryable.query(
    `SELECT t.*, m.role AS member_role, m.unread_count, m.last_read_at
     FROM chat_threads t
     JOIN chat_thread_members m ON m.thread_id = t.id
     WHERE t.id = $1
       AND t.organization_id = $2
       AND t.archived_at IS NULL
       AND m.organization_id = $2
       AND m.user_id = $3
       AND m.status = 'active'
     LIMIT 1
     ${lock ? "FOR UPDATE" : ""}`,
    [threadId, scopedOrganizationId, userId]
  );
  const row = result.rows[0];
  if (!row) throw chatAccessError();
  if (!(await chatThreadAccessAllowed(queryable, row, userId, scopedOrganizationId))) {
    throw chatAccessError();
  }
  return row;
}

async function activeChatMembers(queryable, { threadId, organizationId }) {
  const scopedOrganizationId = requireOrganizationScope(organizationId, "activeChatMembers");
  const result = await queryable.query(
    `SELECT u.id, u.name, u.email, u.role, u.avatar, u.is_online, u.status, m.role AS member_role,
            t.type AS thread_type, t.shipment_id
     FROM chat_thread_members m
     JOIN chat_threads t ON t.id = m.thread_id
     JOIN app_users u ON u.id = m.user_id
     WHERE m.thread_id = $1
       AND m.organization_id = $2
       AND m.status = 'active'
       AND t.organization_id = $2
       AND t.archived_at IS NULL
       AND u.organization_id = $2
       AND u.status = 'active'
     ORDER BY u.name ASC`,
    [threadId, scopedOrganizationId]
  );
  const rows = await filterShipmentChatMemberRows(queryable, result.rows, { organizationId: scopedOrganizationId });
  return rows.map(toUiChatMember);
}

async function upsertChatMember(queryable, { threadId, userId, organizationId, role = "member", actorUserId = null }) {
  const scopedOrganizationId = requireOrganizationScope(organizationId, "upsertChatMember");
  const result = await queryable.query(
    `INSERT INTO chat_thread_members (
       id, organization_id, thread_id, user_id, role, status, added_by_id, removed_by_id, removed_at, unread_count, created_at
     )
     SELECT $1, $2, $3, u.id, $5, 'active', $6, NULL, NULL, 0, NOW()
     FROM app_users u
     WHERE u.id = $4
       AND u.organization_id = $2
       AND u.status = 'active'
     ON CONFLICT (thread_id, user_id) DO UPDATE SET
       organization_id = EXCLUDED.organization_id,
       role = CASE
         WHEN chat_thread_members.role = 'owner' THEN 'owner'
         ELSE EXCLUDED.role
       END,
       status = 'active',
       added_by_id = EXCLUDED.added_by_id,
       removed_by_id = NULL,
       removed_at = NULL
     RETURNING user_id`,
    [crypto.randomUUID(), scopedOrganizationId, threadId, userId, role, actorUserId]
  );
  if (!result.rows[0]) {
    throw chatAccessError("Chat participant must be an active member of your organization.");
  }
  return result.rows[0].user_id;
}

async function insertChatEvent(queryable, { organizationId, threadId, messageId = null, actorUserId = null, eventType, metadata = {} }) {
  await queryable.query(
    `INSERT INTO chat_message_events (id, organization_id, thread_id, message_id, actor_user_id, event_type, metadata, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, NOW())`,
    [crypto.randomUUID(), organizationId, threadId, messageId, actorUserId, eventType, JSON.stringify(metadata)]
  );
}

export async function listChatParticipants({ organizationId, search = "", limit = 100, excludeUserId = "" } = {}) {
  const scopedOrganizationId = requireOrganizationScope(organizationId, "listChatParticipants");
  const trimmedSearch = String(search || "").trim();
  const values = [scopedOrganizationId, Math.min(Number(limit) || 100, 100)];
  const searchClause = trimmedSearch
    ? `AND (u.name ILIKE $${values.push(`%${trimmedSearch}%`)} OR u.email ILIKE $${values.length})`
    : "";
  const excludeClause = excludeUserId
    ? `AND u.id <> $${values.push(excludeUserId)}`
    : "";
  const result = await pool.query(
    `SELECT u.id, u.name, u.email, u.role, u.avatar, u.is_online, u.status
     FROM app_users u
     WHERE u.organization_id = $1
       AND u.status = 'active'
       ${excludeClause}
       ${searchClause}
     ORDER BY u.name ASC
     LIMIT $2`,
    values
  );
  return result.rows.map(toUiChatMember);
}

export async function listChatThreads(userId, { organizationId } = {}) {
  const scopedOrganizationId = requireOrganizationScope(organizationId, "listChatThreads");
  await ensureAccessibleShipmentThreadMembershipsForUser(userId, { organizationId: scopedOrganizationId });
  const result = await pool.query(
    `SELECT t.*, m.unread_count, m.last_read_at,
            s.shipment_code,
            s.status AS shipment_status,
            COALESCE(c.customer_code, s.customer_id) AS shipment_customer_name
     FROM chat_threads t
     JOIN chat_thread_members m ON m.thread_id = t.id
     LEFT JOIN shipments s
       ON s.id = t.shipment_id
      AND s.organization_id = t.organization_id
     LEFT JOIN customers c
       ON c.id = s.customer_id
      AND c.organization_id = s.organization_id
     WHERE t.organization_id = $1
       AND t.archived_at IS NULL
       AND m.organization_id = $1
       AND m.user_id = $2
       AND m.status = 'active'
     ORDER BY t.updated_at DESC`,
    [scopedOrganizationId, userId]
  );
  const threads = [];
  for (const row of result.rows) {
    if (!(await chatThreadAccessAllowed(pool, row, userId, scopedOrganizationId))) continue;
    const members = await activeChatMembers(pool, { threadId: row.id, organizationId: scopedOrganizationId });
    const last = await pool.query(
      `SELECT * FROM chat_messages
       WHERE organization_id = $1
         AND thread_id = $2
         AND status = 'sent'
       ORDER BY created_at DESC
       LIMIT 1`,
      [scopedOrganizationId, row.id]
    );
    const thread = toUiChatThread(row, members, last.rows[0] ? toUiChatMessage(last.rows[0]) : null);
    if (thread.type === "DM" && !thread.name) {
      const other = members.find((member) => member.userId !== userId);
      thread.name = other?.displayName || "Direct chat";
    }
    threads.push(thread);
  }
  return threads;
}

export async function getChatThreadForUser(threadId, userId, { organizationId } = {}) {
  const scopedOrganizationId = requireOrganizationScope(organizationId, "getChatThreadForUser");
  const result = await pool.query(
    `SELECT t.*, m.unread_count, m.last_read_at,
            s.shipment_code,
            s.status AS shipment_status,
            COALESCE(c.customer_code, s.customer_id) AS shipment_customer_name
     FROM chat_threads t
     JOIN chat_thread_members m ON m.thread_id = t.id
     LEFT JOIN shipments s
       ON s.id = t.shipment_id
      AND s.organization_id = t.organization_id
     LEFT JOIN customers c
       ON c.id = s.customer_id
      AND c.organization_id = s.organization_id
     WHERE t.id = $1
       AND t.organization_id = $2
       AND t.archived_at IS NULL
       AND m.organization_id = $2
       AND m.user_id = $3
       AND m.status = 'active'
     LIMIT 1`,
    [threadId, scopedOrganizationId, userId]
  );
  const row = result.rows[0];
  if (!row || !(await chatThreadAccessAllowed(pool, row, userId, scopedOrganizationId))) return null;
  const members = await activeChatMembers(pool, { threadId: row.id, organizationId: scopedOrganizationId });
  const last = await pool.query(
    `SELECT * FROM chat_messages
     WHERE organization_id = $1
       AND thread_id = $2
       AND status = 'sent'
     ORDER BY created_at DESC
     LIMIT 1`,
    [scopedOrganizationId, row.id]
  );
  const thread = toUiChatThread(row, members, last.rows[0] ? toUiChatMessage(last.rows[0]) : null);
  if (thread.type === "DM" && !thread.name) {
    const other = members.find((member) => member.userId !== userId);
    thread.name = other?.displayName || "Direct chat";
  }
  return thread;
}

export async function ensureDirectChat(userAId, userBId, { organizationId } = {}) {
  const scopedOrganizationId = requireOrganizationScope(organizationId, "ensureDirectChat");
  if (!userAId || !userBId || userAId === userBId) {
    throw chatAccessError("Direct chat requires another active user.", 400, "CHAT_DIRECT_TARGET_REQUIRED");
  }
  const ids = [userAId, userBId].sort();
  const key = directChatKey(scopedOrganizationId, ids[0], ids[1]);
  const threadId = directChatId(scopedOrganizationId, ids[0], ids[1]);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const users = await client.query(
      `SELECT id
       FROM app_users
       WHERE id = ANY($1::text[])
         AND organization_id = $2
         AND status = 'active'`,
      [ids, scopedOrganizationId]
    );
    if (users.rows.length !== 2) {
      await client.query("ROLLBACK");
      throw chatAccessError("Chat participant must be an active member of your organization.");
    }
    const inserted = await client.query(
      `INSERT INTO chat_threads (
         id, organization_id, type, name, direct_key, owner_user_id, created_by_id, updated_at
       )
       VALUES ($1, $2, 'DM', 'Direct chat', $3, $4, $4, NOW())
       ON CONFLICT (organization_id, direct_key) WHERE direct_key IS NOT NULL AND archived_at IS NULL
       DO UPDATE SET updated_at = chat_threads.updated_at
       RETURNING id`,
      [threadId, scopedOrganizationId, key, userAId]
    );
    const id = inserted.rows[0]?.id || threadId;
    for (const userId of ids) {
      await upsertChatMember(client, {
        threadId: id,
        userId,
        organizationId: scopedOrganizationId,
        role: "member",
        actorUserId: userAId,
      });
    }
    await insertChatEvent(client, {
      organizationId: scopedOrganizationId,
      threadId: id,
      actorUserId: userAId,
      eventType: "thread.direct.ensure",
      metadata: { participantCount: 2 },
    });
    await client.query("COMMIT");
    return id;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function ensureShipmentChatThread({ actorUserId, organizationId, shipmentId } = {}) {
  const scopedOrganizationId = requireOrganizationScope(organizationId, "ensureShipmentChatThread");
  if (!actorUserId || !shipmentId) {
    throw chatAccessError("Shipment chat requires an active user and shipment.", 400, "SHIPMENT_CHAT_REQUIRED");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const shipmentResult = await client.query(
      `SELECT id, organization_id, owner_user_id, assigned_manager_id, shipment_code, customer_name, status
       FROM shipments
       WHERE id = $1
         AND organization_id = $2
       LIMIT 1
       FOR SHARE`,
      [shipmentId, scopedOrganizationId]
    );
    const shipment = shipmentResult.rows[0];
    if (!shipment) {
      await client.query("ROLLBACK");
      throw chatAccessError("Shipment was not found.", 404, "SHIPMENT_NOT_FOUND");
    }
    if (!(await userHasShipmentChatAccess(client, {
      userId: actorUserId,
      organizationId: scopedOrganizationId,
      shipmentId,
    }))) {
      await client.query("ROLLBACK");
      throw chatAccessError("Shipment chat access denied.");
    }

    const threadId = shipmentChatId(scopedOrganizationId, shipmentId);
    const shipmentCode = shipment.shipment_code || shipment.id;
    const inserted = await client.query(
      `INSERT INTO chat_threads (
         id, organization_id, owner_user_id, type, name, description, shipment_id, created_by_id, updated_at
       )
       VALUES ($1, $2, $3, 'SHIPMENT', $4, $5, $6, $3, NOW())
       ON CONFLICT (organization_id, shipment_id)
       WHERE shipment_id IS NOT NULL
         AND type = 'SHIPMENT'
         AND archived_at IS NULL
       DO UPDATE SET
         name = COALESCE(NULLIF(chat_threads.name, ''), EXCLUDED.name),
         updated_at = chat_threads.updated_at
       RETURNING id, (xmax = 0) AS inserted`,
      [
        threadId,
        scopedOrganizationId,
        actorUserId,
        `Shipment ${shipmentCode}`,
        `Internal shipment chat for ${shipmentCode}`,
        shipmentId,
      ]
    );
    const id = inserted.rows[0]?.id || threadId;
    const created = inserted.rows[0]?.inserted === true || inserted.rows[0]?.inserted === "t";

    const users = await client.query(
      `SELECT id
       FROM app_users
       WHERE organization_id = $1
         AND status = 'active'`,
      [scopedOrganizationId]
    );
    let participantCount = 0;
    for (const row of users.rows) {
      if (!(await userHasShipmentChatAccess(client, {
        userId: row.id,
        organizationId: scopedOrganizationId,
        shipmentId,
      }))) {
        continue;
      }
      await upsertChatMember(client, {
        threadId: id,
        userId: row.id,
        organizationId: scopedOrganizationId,
        role: row.id === actorUserId ? "owner" : "member",
        actorUserId,
      });
      participantCount += 1;
    }

    await insertChatEvent(client, {
      organizationId: scopedOrganizationId,
      threadId: id,
      actorUserId,
      eventType: created ? "thread.shipment.create" : "thread.shipment.ensure",
      metadata: { shipmentId, participantCount },
    });
    await client.query("COMMIT");
    return { id, created, participantCount };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function createChatThread({ actorUserId, organizationId, type = "GROUP", name, description, memberIds = [], participantUserIds = [] }) {
  const scopedOrganizationId = requireOrganizationScope(organizationId, "createChatThread");
  if (type !== "GROUP") throw chatAccessError("Only group threads can be created here.", 400, "CHAT_THREAD_TYPE_INVALID");
  const id = crypto.randomUUID();
  const requestedIds = [...memberIds, ...participantUserIds];
  const uniqueRequestedMemberIds = [...new Set([actorUserId, ...requestedIds])].filter(Boolean);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const allowedMembers = await client.query(
      `SELECT id
       FROM app_users
       WHERE id = ANY($1::text[])
         AND organization_id = $2
         AND status = 'active'`,
      [uniqueRequestedMemberIds, scopedOrganizationId]
    );
    const allowedMemberIds = allowedMembers.rows.map((row) => row.id);
    if (allowedMemberIds.length !== uniqueRequestedMemberIds.length) {
      await client.query("ROLLBACK");
      throw chatAccessError("All chat participants must be active members of your organization.");
    }
    await client.query(
      `INSERT INTO chat_threads (
         id, organization_id, owner_user_id, type, name, description, created_by_id, updated_at
       )
       VALUES ($1, $2, $3, 'GROUP', $4, $5, $3, NOW())`,
      [id, scopedOrganizationId, actorUserId, name || "Group", description || null]
    );
    for (const userId of allowedMemberIds) {
      await upsertChatMember(client, {
        threadId: id,
        userId,
        organizationId: scopedOrganizationId,
        role: userId === actorUserId ? "owner" : "member",
        actorUserId,
      });
    }
    await insertChatEvent(client, {
      organizationId: scopedOrganizationId,
      threadId: id,
      actorUserId,
      eventType: "thread.create",
      metadata: { type: "GROUP", participantCount: allowedMemberIds.length },
    });
    await client.query("COMMIT");
    return id;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function userCanAccessThread(userId, threadId, { organizationId } = {}) {
  const values = [userId, threadId];
  const organizationClause = organizationId ? `AND m.organization_id = $${values.push(organizationId)} AND t.organization_id = $${values.length}` : "";
  const result = await pool.query(
    `SELECT t.*
     FROM chat_thread_members m
     JOIN chat_threads t ON t.id = m.thread_id
     WHERE m.user_id = $1
       AND m.thread_id = $2
       AND m.status = 'active'
       AND t.archived_at IS NULL
       ${organizationClause}
     LIMIT 1`,
    values
  );
  const row = result.rows[0];
  if (!row) return false;
  return chatThreadAccessAllowed(pool, row, userId, organizationId || row.organization_id);
}

export async function listChatThreadMemberIds(threadId, { organizationId } = {}) {
  const values = [threadId];
  const organizationClause = organizationId ? `AND m.organization_id = $${values.push(organizationId)} AND t.organization_id = $${values.length}` : "";
  const result = await pool.query(
    `SELECT m.user_id, t.type AS thread_type, t.shipment_id, t.organization_id
     FROM chat_thread_members m
     JOIN chat_threads t ON t.id = m.thread_id
     WHERE m.thread_id = $1
       AND m.status = 'active'
       AND t.archived_at IS NULL
       ${organizationClause}`,
    values
  );
  const rows = await filterShipmentChatMemberRows(pool, result.rows.map((row) => ({ ...row, id: row.user_id })), {
    organizationId: organizationId || result.rows[0]?.organization_id,
  });
  return rows.map(row => row.user_id);
}

export async function listChatMessages(threadId, userId, { organizationId, limit = 50, before = null } = {}) {
  const scopedOrganizationId = requireOrganizationScope(organizationId, "listChatMessages");
  await assertChatParticipant(pool, { threadId, userId, organizationId: scopedOrganizationId });
  const values = [scopedOrganizationId, threadId, Math.min(Number(limit) || 50, 100)];
  let beforeClause = "";
  if (before) {
    beforeClause = `AND created_at < COALESCE(
      (SELECT created_at FROM chat_messages WHERE id = $${values.push(before)} AND organization_id = $1 AND thread_id = $2),
      'infinity'::timestamptz
    )`;
  }
  const result = await pool.query(
    `SELECT * FROM chat_messages
     WHERE organization_id = $1
       AND thread_id = $2
       AND status = 'sent'
       ${beforeClause}
     ORDER BY created_at DESC
     LIMIT $3`,
    values
  );
  const rows = result.rows.reverse();
  const attachments = await listChatAttachmentsForMessages(pool, rows.map((row) => row.id), scopedOrganizationId);
  return rows.map((row) => toUiChatMessage(row, attachments.get(row.id) || []));
}

export async function createChatMessage({ threadId, sender, organizationId, body, content, clientMessageId = null, legacyData = {} }) {
  const scopedOrganizationId = requireOrganizationScope(organizationId, "createChatMessage");
  const messageBody = normalizeChatMessageBody(body ?? content);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await assertChatParticipant(client, {
      threadId,
      userId: sender.id,
      organizationId: scopedOrganizationId,
      lock: true,
    });
    const messageId = crypto.randomUUID();
    const result = await client.query(
      `INSERT INTO chat_messages (
         id, organization_id, thread_id, sender_id, sender_name, content, body, body_format,
         client_message_id, status, legacy_data, created_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $6, 'plain_text', $7, 'sent', $8::jsonb, NOW())
       RETURNING *`,
      [
        messageId,
        scopedOrganizationId,
        threadId,
        sender.id,
        sender.name || sender.email || "User",
        messageBody,
        clientMessageId || null,
        JSON.stringify({ ...legacyData, bodyFormat: "plain_text" }),
      ]
    );
    await client.query(
      "UPDATE chat_threads SET updated_at = NOW(), last_message_id = $1 WHERE id = $2 AND organization_id = $3",
      [messageId, threadId, scopedOrganizationId]
    );
    await client.query(
      `UPDATE chat_thread_members
       SET unread_count = unread_count + 1
       WHERE thread_id = $1
         AND organization_id = $2
         AND status = 'active'
         AND user_id <> $3`,
      [threadId, scopedOrganizationId, sender.id]
    );
    await insertChatEvent(client, {
      organizationId: scopedOrganizationId,
      threadId,
      messageId,
      actorUserId: sender.id,
      eventType: "message.create",
      metadata: { bodyLength: messageBody.length },
    });
    await client.query("COMMIT");
    return toUiChatMessage(result.rows[0], []);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function createChatAttachmentMessage({
  threadId,
  sender,
  organizationId,
  caption = "",
  clientMessageId = null,
  attachment,
  legacyData = {},
}) {
  const scopedOrganizationId = requireOrganizationScope(organizationId, "createChatAttachmentMessage");
  if (!attachment) {
    throw chatAccessError("Attachment is required.", 400, "CHAT_ATTACHMENT_REQUIRED");
  }
  const fallbackBody = attachment.originalFileName || attachment.sanitizedName || "Attachment";
  const messageBody = normalizeChatMessageBody(caption || fallbackBody);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await assertChatParticipant(client, {
      threadId,
      userId: sender.id,
      organizationId: scopedOrganizationId,
      lock: true,
    });
    const messageId = crypto.randomUUID();
    const messageResult = await client.query(
      `INSERT INTO chat_messages (
         id, organization_id, thread_id, sender_id, sender_name, content, body, body_format,
         client_message_id, status, legacy_data, created_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $6, 'plain_text', $7, 'sent', $8::jsonb, NOW())
       RETURNING *`,
      [
        messageId,
        scopedOrganizationId,
        threadId,
        sender.id,
        sender.name || sender.email || "User",
        messageBody,
        clientMessageId || null,
        JSON.stringify({
          ...legacyData,
          bodyFormat: "plain_text",
          hasAttachment: true,
          attachmentType: attachment.attachmentType,
        }),
      ]
    );
    const attachmentId = crypto.randomUUID();
    const attachmentResult = await client.query(
      `INSERT INTO chat_message_attachments (
         id, organization_id, thread_id, message_id, uploaded_by_id,
         storage_provider, storage_bucket, storage_region, storage_key, object_key, local_path,
         checksum_sha256, original_filename, file_name, content_type, size_bytes, attachment_type,
         created_at
       )
       VALUES (
         $1, $2, $3, $4, $5,
         $6, $7, $8, $9, $10, $11,
         $12, $13, $14, $15, $16, $17,
         NOW()
       )
       RETURNING *`,
      [
        attachmentId,
        scopedOrganizationId,
        threadId,
        messageId,
        sender.id,
        attachment.storageProvider || "local",
        attachment.storageBucket || null,
        attachment.storageRegion || null,
        attachment.storageKey || null,
        attachment.objectKey || null,
        attachment.localPath || attachment.storageKey || null,
        attachment.checksumSha256 || attachment.checksum || null,
        attachment.originalFileName || attachment.sanitizedName || "attachment",
        attachment.sanitizedName || attachment.originalFileName || null,
        attachment.contentType || attachment.mimeType || "application/octet-stream",
        Number(attachment.sizeBytes || 0),
        attachment.attachmentType === "image" ? "image" : "document",
      ]
    );
    await client.query(
      "UPDATE chat_threads SET updated_at = NOW(), last_message_id = $1 WHERE id = $2 AND organization_id = $3",
      [messageId, threadId, scopedOrganizationId]
    );
    await client.query(
      `UPDATE chat_thread_members
       SET unread_count = unread_count + 1
       WHERE thread_id = $1
         AND organization_id = $2
         AND status = 'active'
         AND user_id <> $3`,
      [threadId, scopedOrganizationId, sender.id]
    );
    await insertChatEvent(client, {
      organizationId: scopedOrganizationId,
      threadId,
      messageId,
      actorUserId: sender.id,
      eventType: "message.create",
      metadata: { bodyLength: messageBody.length, hasAttachment: true },
    });
    await insertChatEvent(client, {
      organizationId: scopedOrganizationId,
      threadId,
      messageId,
      actorUserId: sender.id,
      eventType: "chat.attachment.upload",
      metadata: {
        attachmentId,
        attachmentType: attachment.attachmentType,
        sizeBytes: Number(attachment.sizeBytes || 0),
        contentType: attachment.contentType || attachment.mimeType || "application/octet-stream",
        fileName: attachment.originalFileName || attachment.sanitizedName || "attachment",
      },
    });
    await client.query("COMMIT");
    return toUiChatMessage(messageResult.rows[0], [toUiChatAttachment(attachmentResult.rows[0])]);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function markChatThreadRead(threadId, userId, { organizationId, messageId = null } = {}) {
  const scopedOrganizationId = requireOrganizationScope(organizationId, "markChatThreadRead");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await assertChatParticipant(client, { threadId, userId, organizationId: scopedOrganizationId, lock: true });
    const messageResult = messageId
      ? await client.query(
        `SELECT id
         FROM chat_messages
         WHERE id = $1
           AND organization_id = $2
           AND thread_id = $3
           AND status = 'sent'
         LIMIT 1`,
        [messageId, scopedOrganizationId, threadId]
      )
      : await client.query(
        `SELECT id
         FROM chat_messages
         WHERE organization_id = $1
           AND thread_id = $2
           AND status = 'sent'
         ORDER BY created_at DESC
         LIMIT 1`,
        [scopedOrganizationId, threadId]
      );
    if (messageId && !messageResult.rows[0]) {
      await client.query("ROLLBACK");
      throw chatAccessError("Message was not found.", 404, "CHAT_MESSAGE_NOT_FOUND");
    }
    const readAt = new Date();
    await client.query(
      `UPDATE chat_thread_members
       SET unread_count = 0, last_read_at = $4
       WHERE thread_id = $1
         AND organization_id = $2
         AND user_id = $3
         AND status = 'active'`,
      [threadId, scopedOrganizationId, userId, readAt]
    );
    const readMessageId = messageResult.rows[0]?.id || null;
    if (readMessageId) {
      await client.query(
        `INSERT INTO chat_message_read_receipts (id, organization_id, thread_id, message_id, user_id, read_at, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         ON CONFLICT (message_id, user_id) DO UPDATE SET read_at = EXCLUDED.read_at`,
        [crypto.randomUUID(), scopedOrganizationId, threadId, readMessageId, userId, readAt]
      );
      await insertChatEvent(client, {
        organizationId: scopedOrganizationId,
        threadId,
        messageId: readMessageId,
        actorUserId: userId,
        eventType: "message.read",
        metadata: {},
      });
    }
    await client.query("COMMIT");
    return { threadId, userId, messageId: readMessageId, readAt };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function addChatThreadMember(threadId, userId, { organizationId, actorUserId } = {}) {
  const scopedOrganizationId = requireOrganizationScope(organizationId, "addChatThreadMember");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const thread = await assertChatParticipant(client, {
      threadId,
      userId: actorUserId,
      organizationId: scopedOrganizationId,
      lock: true,
    });
    if (thread.type === "DM" || thread.type === "SHIPMENT") {
      await client.query("ROLLBACK");
      throw chatAccessError("This chat's participants are managed by its source record.", 400, "CHAT_MEMBERS_IMMUTABLE");
    }
    await upsertChatMember(client, {
      threadId,
      userId,
      organizationId: scopedOrganizationId,
      role: "member",
      actorUserId,
    });
    await insertChatEvent(client, {
      organizationId: scopedOrganizationId,
      threadId,
      actorUserId,
      eventType: "participant.add",
      metadata: { userId },
    });
    await client.query("COMMIT");
    return { threadId, userId };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function removeChatThreadMember(threadId, userId, { organizationId, actorUserId } = {}) {
  const scopedOrganizationId = requireOrganizationScope(organizationId, "removeChatThreadMember");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const thread = await assertChatParticipant(client, {
      threadId,
      userId: actorUserId,
      organizationId: scopedOrganizationId,
      lock: true,
    });
    if (thread.type === "DM" || thread.type === "SHIPMENT") {
      await client.query("ROLLBACK");
      throw chatAccessError("This chat's participants are managed by its source record.", 400, "CHAT_MEMBERS_IMMUTABLE");
    }
    const target = await client.query(
      `SELECT role
       FROM chat_thread_members
       WHERE thread_id = $1
         AND organization_id = $2
         AND user_id = $3
         AND status = 'active'
       LIMIT 1`,
      [threadId, scopedOrganizationId, userId]
    );
    if (!target.rows[0]) {
      await client.query("ROLLBACK");
      throw chatAccessError("Chat participant was not found.", 404, "CHAT_PARTICIPANT_NOT_FOUND");
    }
    if (target.rows[0].role === "owner") {
      const owners = await client.query(
        `SELECT COUNT(*)::int AS count
         FROM chat_thread_members
         WHERE thread_id = $1
           AND organization_id = $2
           AND status = 'active'
           AND role = 'owner'
           AND user_id <> $3`,
        [threadId, scopedOrganizationId, userId]
      );
      if (Number(owners.rows[0]?.count || 0) < 1) {
        await client.query("ROLLBACK");
        throw chatAccessError("At least one owner must remain in the group.", 400, "CHAT_LAST_OWNER_BLOCKED");
      }
    }
    await client.query(
      `UPDATE chat_thread_members
       SET status = 'removed',
           removed_by_id = $4,
           removed_at = NOW(),
           unread_count = 0
       WHERE thread_id = $1
         AND organization_id = $2
         AND user_id = $3`,
      [threadId, scopedOrganizationId, userId, actorUserId]
    );
    await insertChatEvent(client, {
      organizationId: scopedOrganizationId,
      threadId,
      actorUserId,
      eventType: "participant.remove",
      metadata: { userId },
    });
    await client.query("COMMIT");
    return { threadId, userId };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function getChatAttachmentForDelivery(messageId, attachmentId, userId, { organizationId, previewOnly = false } = {}) {
  const scopedOrganizationId = requireOrganizationScope(organizationId, "getChatAttachmentForDelivery");
  const result = await pool.query(
    `SELECT a.*, m.sender_id, t.type AS thread_type, t.shipment_id
     FROM chat_message_attachments a
     JOIN chat_messages m
       ON m.id = a.message_id
      AND m.organization_id = a.organization_id
      AND m.thread_id = a.thread_id
     JOIN chat_threads t
       ON t.id = a.thread_id
      AND t.organization_id = a.organization_id
     WHERE a.id = $1
       AND a.message_id = $2
       AND a.organization_id = $3
       AND m.status = 'sent'
       AND t.archived_at IS NULL
     LIMIT 1`,
    [attachmentId, messageId, scopedOrganizationId]
  );
  const attachment = result.rows[0];
  if (!attachment) throw chatAccessError("Attachment was not found.", 404, "CHAT_ATTACHMENT_NOT_FOUND");
  await assertChatParticipant(pool, {
    threadId: attachment.thread_id,
    userId,
    organizationId: scopedOrganizationId,
  });
  if (attachment.deleted_at) {
    throw chatAccessError("Attachment was deleted.", 404, "CHAT_ATTACHMENT_DELETED");
  }
  if (previewOnly && attachment.attachment_type !== "image") {
    throw chatAccessError("Attachment preview is available for images only.", 415, "CHAT_ATTACHMENT_PREVIEW_UNSUPPORTED");
  }
  return attachment;
}

export async function listChatMediaAttachments({ organizationId, search = "", type, includeDeleted = false, limit = 100 } = {}) {
  const scopedOrganizationId = requireOrganizationScope(organizationId, "listChatMediaAttachments");
  const values = [scopedOrganizationId, Math.min(Math.max(Number(limit) || 100, 1), 100)];
  const filters = ["a.organization_id = $1"];
  if (!includeDeleted) filters.push("a.deleted_at IS NULL");
  if (type) {
    values.push(type);
    filters.push(`a.attachment_type = $${values.length}`);
  }
  const trimmedSearch = String(search || "").trim();
  if (trimmedSearch) {
    values.push(`%${trimmedSearch}%`);
    filters.push(`(a.original_filename ILIKE $${values.length} OR t.name ILIKE $${values.length} OR s.shipment_code ILIKE $${values.length})`);
  }

  const result = await pool.query(
    `SELECT
       a.*,
       u.name AS uploaded_by_name,
       u.email AS uploaded_by_email,
       t.type AS thread_type,
       t.name AS thread_name,
       t.shipment_id,
       s.shipment_code,
       s.status AS shipment_status,
       COALESCE(c.customer_code, s.customer_id) AS shipment_customer_name
     FROM chat_message_attachments a
     JOIN chat_threads t
       ON t.id = a.thread_id
      AND t.organization_id = a.organization_id
     LEFT JOIN app_users u
       ON u.id = a.uploaded_by_id
      AND u.organization_id = a.organization_id
     LEFT JOIN shipments s
       ON s.id = t.shipment_id
      AND s.organization_id = a.organization_id
     LEFT JOIN customers c
       ON c.id = s.customer_id
      AND c.organization_id = s.organization_id
     WHERE ${filters.join(" AND ")}
     ORDER BY a.created_at DESC
     LIMIT $2`,
    values
  );
  return result.rows.map(toUiChatMediaAttachment);
}

export async function deleteChatAttachment({ messageId, attachmentId, actorUserId, organizationId, reason = "", allowAny = false } = {}) {
  const scopedOrganizationId = requireOrganizationScope(organizationId, "deleteChatAttachment");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `SELECT a.*, m.sender_id, t.type AS thread_type, t.shipment_id
       FROM chat_message_attachments a
       JOIN chat_messages m
         ON m.id = a.message_id
        AND m.organization_id = a.organization_id
        AND m.thread_id = a.thread_id
       JOIN chat_threads t
         ON t.id = a.thread_id
        AND t.organization_id = a.organization_id
       WHERE a.id = $1
         AND a.message_id = $2
         AND a.organization_id = $3
         AND m.status = 'sent'
         AND t.archived_at IS NULL
       LIMIT 1
       FOR UPDATE OF a`,
      [attachmentId, messageId, scopedOrganizationId]
    );
    const before = result.rows[0];
    if (!before) {
      await client.query("ROLLBACK");
      throw chatAccessError("Attachment was not found.", 404, "CHAT_ATTACHMENT_NOT_FOUND");
    }
    await assertChatParticipant(client, {
      threadId: before.thread_id,
      userId: actorUserId,
      organizationId: scopedOrganizationId,
    });
    if (!allowAny && before.uploaded_by_id !== actorUserId) {
      await client.query("ROLLBACK");
      throw chatAccessError("Only the sender or a media manager can delete this attachment.");
    }
    if (before.deleted_at) {
      await client.query("COMMIT");
      return { before, after: before, ui: toUiChatAttachment(before), alreadyDeleted: true };
    }

    const updated = await client.query(
      `UPDATE chat_message_attachments
       SET deleted_at = NOW(),
           deleted_by_id = $4,
           deleted_reason = COALESCE(NULLIF($5, ''), 'deleted_by_manager')
       WHERE id = $1
         AND message_id = $2
         AND organization_id = $3
       RETURNING *`,
      [attachmentId, messageId, scopedOrganizationId, actorUserId, reason || ""]
    );
    const after = updated.rows[0];
    await insertChatEvent(client, {
      organizationId: scopedOrganizationId,
      threadId: before.thread_id,
      messageId: before.message_id,
      actorUserId,
      eventType: "chat.attachment.delete",
      metadata: {
        attachmentId: before.id,
        attachmentType: before.attachment_type,
        sizeBytes: Number(before.size_bytes || 0),
        contentType: before.content_type,
        fileName: before.original_filename,
        managerDelete: Boolean(allowAny),
      },
    });
    await client.query("COMMIT");
    return { before, after, ui: toUiChatAttachment(after), alreadyDeleted: false };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function markChatAttachmentStorageCleanup(attachmentId, { organizationId, error = null } = {}) {
  const scopedOrganizationId = requireOrganizationScope(organizationId, "markChatAttachmentStorageCleanup");
  await pool.query(
    `UPDATE chat_message_attachments
     SET storage_deleted_at = CASE WHEN $3::text IS NULL THEN NOW() ELSE storage_deleted_at END,
         storage_delete_error = $3
     WHERE id = $1
       AND organization_id = $2`,
    [attachmentId, scopedOrganizationId, error ? String(error).slice(0, 500) : null]
  );
}

export async function createChatMessageNotifications({ organizationId, threadId, messageId, senderId, senderName, recipientUserIds = [] } = {}) {
  const scopedOrganizationId = requireOrganizationScope(organizationId, "createChatMessageNotifications");
  const uniqueRecipientIds = [...new Set(recipientUserIds)].filter((id) => id && id !== senderId);
  if (!uniqueRecipientIds.length) return [];
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const recipients = await client.query(
      `SELECT id
       FROM app_users
       WHERE organization_id = $1
         AND status = 'active'
         AND id = ANY($2::text[])
         AND COALESCE(notification_preferences->>'chatMessages', 'true') <> 'false'`,
      [scopedOrganizationId, uniqueRecipientIds]
    );
    const created = [];
    for (const row of recipients.rows) {
      const notificationId = crypto.randomUUID();
      const result = await client.query(
        `INSERT INTO notifications (
           id, organization_id, user_id, title, body, type, source_type, source_id, legacy_data, created_at
         )
         VALUES ($1, $2, $3, $4, $5, 'INFO', 'CHAT', $6, $7::jsonb, NOW())
         RETURNING *`,
        [
          notificationId,
          scopedOrganizationId,
          row.id,
          "New chat message",
          `${senderName || "A teammate"} sent you a message.`,
          messageId || threadId,
          JSON.stringify({ link: `/chat?threadId=${encodeURIComponent(threadId)}`, threadId }),
        ]
      );
      await syncNotificationUserRecord(client, row.id, result.rows[0]);
      created.push(result.rows[0]);
    }
    await client.query("COMMIT");
    return created;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

const AUDIT_REDACTED = "[redacted]";
const AUDIT_MAX_DEPTH = 8;
const AUDIT_MAX_ARRAY_ITEMS = 50;
const AUDIT_MAX_OBJECT_KEYS = 80;
const AUDIT_MAX_STRING_LENGTH = 1200;
const AUDIT_MAX_JSON_LENGTH = 40000;

function normalizeAuditKey(key = "") {
  return String(key).replace(/[_\-\s]/g, "").toLowerCase();
}

function isAuthCodeKey(key, path = []) {
  const normalized = normalizeAuditKey(key);
  if (["smscode", "otpcode", "debugcode", "codehash", "codesalt"].includes(normalized)) return true;
  if (normalized !== "code") return false;
  return /auth|sms|otp|login|challenge|verification/i.test(path.join("."));
}

function isSensitiveAuditKey(key, path = []) {
  const normalized = normalizeAuditKey(key);
  if (isAuthCodeKey(key, path)) return true;
  if (normalized === "path") return true;
  return (
    normalized.includes("password") ||
    normalized.includes("token") ||
    normalized.includes("tokenhash") ||
    normalized.includes("session") ||
    normalized.includes("cookie") ||
    normalized.includes("authorization") ||
    normalized.includes("authority") ||
    normalized.includes("otp") ||
    normalized.includes("secret") ||
    normalized.includes("merchant") ||
    normalized.includes("apikey") ||
    normalized.includes("providerresponse") ||
    normalized.includes("providerresult") ||
    normalized.includes("storagekey") ||
    normalized.includes("objectkey") ||
    normalized.includes("storagebucket") ||
    normalized.includes("storageregion") ||
    normalized.includes("localpath") ||
    normalized.includes("filepath") ||
    normalized.includes("signedurl") ||
    normalized.includes("signature") ||
    normalized.includes("customeraccesstoken") ||
    normalized.includes("trackingtoken")
  );
}

function sanitizeAuditString(value) {
  if (
    /signature=|customer_access_token=|trackingToken=|logisticplus_session=|authorization:/i.test(value) ||
    /\/api\/public\/track\/[A-Za-z0-9_-]{24,}/.test(value) ||
    /\/track\/[A-Za-z0-9_-]{24,}/.test(value)
  ) {
    return AUDIT_REDACTED;
  }
  if (value.length > AUDIT_MAX_STRING_LENGTH) {
    return `${value.slice(0, AUDIT_MAX_STRING_LENGTH)}...[truncated ${value.length - AUDIT_MAX_STRING_LENGTH} chars]`;
  }
  return value;
}

export function sanitizeAuditPayload(value, { depth = AUDIT_MAX_DEPTH, path = [], seen = new WeakSet() } = {}) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return "[binary]";
  if (value instanceof Error) {
    return sanitizeAuditPayload({
      name: value.name,
      message: value.message,
      code: value.code,
      statusCode: value.statusCode,
    }, { depth: depth - 1, path, seen });
  }
  if (typeof value === "string") return sanitizeAuditString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value !== "object") return String(value);
  if (depth <= 0) return "[max-depth]";
  if (seen.has(value)) return "[circular]";
  seen.add(value);

  if (Array.isArray(value)) {
    const result = value
      .slice(0, AUDIT_MAX_ARRAY_ITEMS)
      .map((item, index) => sanitizeAuditPayload(item, { depth: depth - 1, path: [...path, String(index)], seen }));
    if (value.length > AUDIT_MAX_ARRAY_ITEMS) {
      result.push(`[truncated ${value.length - AUDIT_MAX_ARRAY_ITEMS} items]`);
    }
    return result;
  }

  const entries = Object.entries(value).slice(0, AUDIT_MAX_OBJECT_KEYS);
  const sanitized = {};
  for (const [key, nestedValue] of entries) {
    const nextPath = [...path, key];
    sanitized[key] = isSensitiveAuditKey(key, path)
      ? AUDIT_REDACTED
      : sanitizeAuditPayload(nestedValue, { depth: depth - 1, path: nextPath, seen });
  }
  const entryCount = Object.keys(value).length;
  if (entryCount > AUDIT_MAX_OBJECT_KEYS) {
    sanitized.__truncatedKeys = entryCount - AUDIT_MAX_OBJECT_KEYS;
  }
  return sanitized;
}

function boundedAuditPayload(value, fallback = undefined) {
  if (value === undefined) return fallback;
  const sanitized = sanitizeAuditPayload(value);
  const serialized = JSON.stringify(sanitized);
  if (serialized.length <= AUDIT_MAX_JSON_LENGTH) return sanitized;
  return {
    truncated: true,
    approximateBytes: serialized.length,
    preview: serialized.slice(0, AUDIT_MAX_JSON_LENGTH),
  };
}

function auditActorType({ actorType, actorUserId, action }) {
  if (actorType) return actorType;
  if (!actorUserId) return String(action || "").startsWith("public_") ? "public" : "system";
  return String(action || "").startsWith("admin.") ? "platform_admin" : "user";
}

function auditRowToDto(row = {}) {
  return {
    id: row.id,
    organizationId: row.organization_id || null,
    actorUserId: row.actor_user_id || null,
    actorType: row.actor_type,
    eventType: row.event_type,
    resourceType: row.resource_type,
    resourceId: row.resource_id || null,
    requestId: row.request_id || null,
    ip: row.ip || null,
    userAgent: row.user_agent || null,
    before: boundedAuditPayload(row.before_json, null),
    after: boundedAuditPayload(row.after_json, null),
    metadata: boundedAuditPayload(row.metadata_json || {}, {}),
    createdAt: row.created_at,
  };
}

export async function auditLog({
  actorUserId,
  organizationId,
  actorType,
  action,
  eventType,
  entityType,
  resourceType,
  entityId,
  resourceId,
  summary,
  before,
  after,
  metadata,
  requestContext,
  queryable = pool,
  required = false,
}) {
  try {
    const resolvedEventType = eventType || action;
    const resolvedResourceType = resourceType || entityType || "unknown";
    const resolvedResourceId = resourceId || entityId || null;
    const actorOrg = !organizationId && actorUserId ? await getOrganizationForUser(actorUserId) : null;
    const resolvedOrganizationId = organizationId || actorOrg?.id || null;
    const safeBefore = boundedAuditPayload(before, null);
    const safeAfter = boundedAuditPayload(after, null);
    const safeMetadata = boundedAuditPayload({
      ...(metadata || {}),
      ...(summary ? { summary } : {}),
    }, {});

    const changeResult = await queryable.query(
      `INSERT INTO change_logs (
         id, organization_id, actor_user_id, action, entity_type, entity_id, summary,
         before_json, after_json, ip_address, user_agent
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10, $11)
       RETURNING *`,
      [
        crypto.randomUUID(),
        resolvedOrganizationId,
        actorUserId || null,
        resolvedEventType,
        resolvedResourceType,
        resolvedResourceId,
        summary || resolvedEventType,
        safeBefore === null ? null : JSON.stringify(safeBefore),
        safeAfter === null ? null : JSON.stringify(safeAfter),
        requestContext?.ip || null,
        requestContext?.userAgent || null,
      ]
    );

    await queryable.query(
      `INSERT INTO audit_logs (
         id, organization_id, actor_user_id, actor_type, event_type, resource_type,
         resource_id, request_id, ip, user_agent, before_json, after_json, metadata_json
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb, $13::jsonb)`,
      [
        crypto.randomUUID(),
        resolvedOrganizationId,
        actorUserId || null,
        auditActorType({ actorType, actorUserId, action: resolvedEventType }),
        resolvedEventType,
        resolvedResourceType,
        resolvedResourceId,
        requestContext?.requestId || null,
        requestContext?.ip || null,
        requestContext?.userAgent || null,
        safeBefore === null ? null : JSON.stringify(safeBefore),
        safeAfter === null ? null : JSON.stringify(safeAfter),
        JSON.stringify(safeMetadata || {}),
      ]
    );

    return changeResult.rows[0];
  } catch (error) {
    console.error("Audit log write failed:", error);
    if (required) throw error;
    // TODO(phase-5-audit): Migrate remaining route-level best-effort audit calls into transaction helpers where the mutation is high risk.
    return null;
  }
}

export async function listAuditLogs({ limit = 100, organizationId, actorUserId, eventType, resourceType, resourceId } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 250);
  const values = [];
  const where = [];
  if (organizationId !== undefined) {
    values.push(organizationId);
    where.push(`a.organization_id = $${values.length}`);
  }
  if (actorUserId) {
    values.push(actorUserId);
    where.push(`a.actor_user_id = $${values.length}`);
  }
  if (eventType) {
    values.push(eventType);
    where.push(`a.event_type = $${values.length}`);
  }
  if (resourceType) {
    values.push(resourceType);
    where.push(`a.resource_type = $${values.length}`);
  }
  if (resourceId) {
    values.push(resourceId);
    where.push(`a.resource_id = $${values.length}`);
  }
  values.push(safeLimit);
  const result = await pool.query(
    `SELECT a.*
     FROM audit_logs a
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY a.created_at DESC
     LIMIT $${values.length}`,
    values
  );
  return result.rows.map(auditRowToDto);
}

export async function listChangeLogs({ limit = 100, organizationId } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 250);
  const values = [];
  let where = "";
  if (organizationId) {
    values.push(organizationId);
    where = `WHERE c.organization_id = $${values.length}`;
  }
  values.push(safeLimit);
  const result = await pool.query(
    `SELECT
       c.*,
       u.name AS actor_name,
       u.email AS actor_email
     FROM change_logs c
     LEFT JOIN app_users u ON u.id = c.actor_user_id
     ${where}
     ORDER BY c.created_at DESC
     LIMIT $${values.length}`,
    values
  );
  return result.rows;
}

export async function getChangeLog(id, { organizationId } = {}) {
  const values = [id];
  const organizationFilter = organizationId ? `AND c.organization_id = $${values.push(organizationId)}` : "";
  const result = await pool.query(
    `SELECT
       c.*,
       u.name AS actor_name,
       u.email AS actor_email
     FROM change_logs c
     LEFT JOIN app_users u ON u.id = c.actor_user_id
     WHERE c.id = $1 ${organizationFilter}
     LIMIT 1`,
    values
  );
  return result.rows[0] || null;
}

export function createCustomerAccessToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashCustomerAccessToken(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

function shipmentScopeClause(values, { organizationId, ownerUserId } = {}, alias = "s") {
  const prefix = alias ? `${alias}.` : "";
  if (organizationId && ownerUserId) {
    const organizationParam = values.push(organizationId);
    const ownerParam = values.push(ownerUserId);
    return `AND (${prefix}organization_id = $${organizationParam} OR (${prefix}owner_user_id = $${ownerParam} AND ${prefix}organization_id IS NULL))`;
  }
  if (organizationId) {
    return `AND ${prefix}organization_id = $${values.push(organizationId)}`;
  }
  if (ownerUserId) {
    return `AND ${prefix}owner_user_id = $${values.push(ownerUserId)}`;
  }
  return "";
}

async function getShipmentCustomerAccessWithQueryable(queryable, shipmentId, { organizationId, ownerUserId } = {}) {
  const values = [shipmentId];
  const scopeFilter = shipmentScopeClause(values, { organizationId, ownerUserId }, "s");
  const result = await queryable.query(
    `SELECT
       s.id,
       s.shipment_code,
       s.customer_access_enabled,
       s.customer_access_token,
       (s.customer_access_token_hash IS NOT NULL OR s.customer_access_token IS NOT NULL) AS has_token,
       e.public_label,
       e.public_description,
       e.is_customer_visible,
       e.created_at AS public_status_created_at
     FROM shipments s
     LEFT JOIN LATERAL (
       SELECT public_label, public_description, is_customer_visible, created_at
       FROM shipment_status_events
       WHERE shipment_id = s.id
       ORDER BY created_at DESC
       LIMIT 1
     ) e ON TRUE
     WHERE s.id = $1
       ${scopeFilter}
     LIMIT 1`,
    values
  );
  const row = result.rows[0];
  if (!row) return null;

  return {
    shipmentId: row.id,
    shipmentCode: row.shipment_code,
    enabled: row.customer_access_enabled,
    hasToken: row.has_token,
    token: row.customer_access_enabled ? row.customer_access_token || "" : "",
    publicStatus: {
      label: row.public_label || "",
      description: row.public_description || "",
      isCustomerVisible: row.is_customer_visible !== false,
      lastUpdatedAt: row.public_status_created_at || null,
    },
  };
}

export async function getShipmentCustomerAccess(shipmentId, { organizationId, ownerUserId } = {}) {
  return getShipmentCustomerAccessWithQueryable(pool, shipmentId, { organizationId, ownerUserId });
}

export async function generateShipmentCustomerAccess(shipmentId, { organizationId, ownerUserId, rotate = true, audit } = {}) {
  return withTransaction(pool, async (client) => {
    const before = await getShipmentCustomerAccessWithQueryable(client, shipmentId, { organizationId, ownerUserId });
    if (!before) return null;

    if (!rotate && before.token) {
      const values = [shipmentId];
      const scopeFilter = shipmentScopeClause(values, { organizationId, ownerUserId }, "");
      const result = await client.query(
        `UPDATE shipments
         SET customer_access_enabled = TRUE,
             updated_at = NOW()
         WHERE id = $1
           ${scopeFilter}
         RETURNING id`,
        values
      );
      if (!result.rowCount) return null;
      const after = await getShipmentCustomerAccessWithQueryable(client, shipmentId, { organizationId, ownerUserId });
      if (audit) {
        await auditLog({
          ...audit,
          organizationId: audit.organizationId ?? organizationId ?? null,
          before,
          after,
          queryable: client,
          required: true,
        });
      }
      return { token: before.token, before, after };
    }

    const token = createCustomerAccessToken();
    const tokenHash = hashCustomerAccessToken(token);
    const values = [shipmentId, token, tokenHash];
    const scopeFilter = shipmentScopeClause(values, { organizationId, ownerUserId }, "");
    const result = await client.query(
      `UPDATE shipments
       SET customer_access_token = $2,
           customer_access_token_hash = $3,
           customer_access_enabled = TRUE,
           updated_at = NOW()
       WHERE id = $1
         ${scopeFilter}
       RETURNING id`,
      values
    );
    if (!result.rowCount) return null;

    const after = await getShipmentCustomerAccessWithQueryable(client, shipmentId, { organizationId, ownerUserId });
    if (audit) {
      await auditLog({
        ...audit,
        organizationId: audit.organizationId ?? organizationId ?? null,
        before,
        after,
        queryable: client,
        required: true,
      });
    }
    return { token, before, after };
  });
}

export async function disableShipmentCustomerAccess(shipmentId, { organizationId, ownerUserId, audit } = {}) {
  return withTransaction(pool, async (client) => {
    const before = await getShipmentCustomerAccessWithQueryable(client, shipmentId, { organizationId, ownerUserId });
    if (!before) return null;

    const values = [shipmentId];
    const scopeFilter = shipmentScopeClause(values, { organizationId, ownerUserId }, "");
    const result = await client.query(
      `UPDATE shipments
       SET customer_access_enabled = FALSE,
           updated_at = NOW()
       WHERE id = $1
         ${scopeFilter}
       RETURNING id`,
      values
    );
    if (!result.rowCount) return null;

    const after = await getShipmentCustomerAccessWithQueryable(client, shipmentId, { organizationId, ownerUserId });
    if (audit) {
      await auditLog({
        ...audit,
        organizationId: audit.organizationId ?? organizationId ?? null,
        before,
        after,
        queryable: client,
        required: true,
      });
    }
    return { before, after };
  });
}

async function queueCustomerShipmentUpdateSms(queryable, shipmentId, event, { organizationId } = {}) {
  if (!event?.is_customer_visible) return null;
  const scopedOrganizationId = requireOrganizationScope(
    organizationId || event.organization_id,
    "queueCustomerShipmentUpdateSms"
  );
  const shipmentResult = await queryable.query(
    `SELECT
       s.id,
       s.organization_id,
       s.shipment_code,
       s.customer_name,
       s.legacy_data,
       c.contact_name AS customer_contact_name,
       c.company_name AS customer_company_name,
       c.phone AS customer_phone
     FROM shipments s
     LEFT JOIN customers c ON c.id = s.customer_id AND c.organization_id = s.organization_id
     WHERE s.id = $1
       AND s.organization_id = $2
     LIMIT 1`,
    [shipmentId, scopedOrganizationId]
  );
  const shipment = shipmentResult.rows[0];
  if (!shipment?.organization_id) return null;
  const message = await renderSmsTemplate(queryable, "customer_shipment_update", {
    ship: shipment.shipment_code,
    status: event.public_label,
  });
  if (!message) return null;
  const recipientPhone = shipment.customer_phone || shipment.legacy_data?.customerPhone || "";
  const recipientName =
    shipment.customer_contact_name ||
    shipment.customer_company_name ||
    shipment.customer_name ||
    shipment.legacy_data?.customerName ||
    "مشتری";
  return enqueueSmsDelivery(queryable, {
    organizationId: shipment.organization_id,
    userId: null,
    recipientType: "customer",
    recipientName,
    recipientPhone,
    message,
    sourceType: "customer_shipment_update",
    sourceId: event.id,
    eventKey: `customer-shipment-update:${event.id}`,
  });
}

export async function updateShipmentPublicStatus({
  shipmentId,
  publicLabel,
  publicDescription,
  isCustomerVisible = true,
  createdById,
  organizationId,
  ownerUserId,
}) {
  const shipment = await getShipmentCustomerAccess(shipmentId, { organizationId, ownerUserId });
  if (!shipment) return null;

  const result = await pool.query(
    `INSERT INTO shipment_status_events (
       id, organization_id, shipment_id, public_label, public_description, is_customer_visible, created_by_id
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      crypto.randomUUID(),
      organizationId || null,
      shipmentId,
      publicLabel,
      publicDescription || null,
      Boolean(isCustomerVisible),
      createdById || null,
    ]
  );
  const event = result.rows[0];
  await queueCustomerShipmentUpdateSms(pool, shipmentId, event, { organizationId });
  return event;
}

export async function getPublicTrackingByToken(token) {
  return getPublicTrackingByTokenFromRepository(pool, token);
}

export async function getPublicTrackingTokenAuditState(token) {
  return getPublicTrackingTokenAuditStateFromRepository(pool, token);
}

export async function searchPublicTracking({ shipmentCode, verification }) {
  return searchPublicTrackingFromRepository(pool, { shipmentCode, verification });
}

export async function getPublicDocument(documentId, access = {}) {
  return getPublicDocumentFromRepository(pool, documentId, access);
}

export async function getPublicDocumentByTrackingToken(token, documentId) {
  return getPublicDocumentByTrackingTokenFromRepository(pool, token, documentId);
}

export async function updateDocumentVisibility(documentId, visibility, { organizationId, audit } = {}) {
  const safeVisibility = visibility === "customer_visible" ? "customer_visible" : "internal";
  return updateDocumentMetadata(documentId, { visibility: safeVisibility }, { organizationId, audit });
}

function maskSensitive(value) {
  if (Array.isArray(value)) return value.map(maskSensitive);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => {
      if (/password|token|secret|hash/i.test(key)) return [key, "[redacted]"];
      return [key, maskSensitive(nestedValue)];
    })
  );
}

function bridgeShipmentSnapshot(rowOrShipment = {}) {
  const legacy = rowOrShipment.legacy_data || rowOrShipment;
  return {
    trackingNumber: rowOrShipment.shipment_code || legacy.trackingNumber || rowOrShipment.id || "",
    containerNumber: legacy.containerNumber || "",
    customerId: rowOrShipment.customer_id || legacy.customerId || "",
    customerName: rowOrShipment.customer_name || legacy.customerName || "",
    origin: rowOrShipment.origin || legacy.origin || "",
    destination: rowOrShipment.destination || legacy.destination || "",
    status: rowOrShipment.status || legacy.status || "PENDING",
    estimatedDelivery: rowOrShipment.estimated_delivery_at || legacy.estimatedDelivery || "",
    freeTimeDays: legacy.freeTimeDays || "",
    isArchived: Boolean(rowOrShipment.archived_at || legacy.isArchived),
  };
}

function snapshotsDiffer(before, after) {
  return JSON.stringify(before) !== JSON.stringify(after);
}

async function insertBridgeChangeLog(client, {
  ownerUserId,
  organizationId,
  action,
  entityType,
  entityId,
  summary,
  before,
  after,
}) {
  await client.query(
    `INSERT INTO change_logs (
       id, organization_id, actor_user_id, action, entity_type, entity_id, summary,
       before_json, after_json
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb)`,
    [
      crypto.randomUUID(),
      organizationId || null,
      ownerUserId || null,
      action,
      entityType,
      entityId || null,
      summary,
      before === undefined ? null : JSON.stringify(maskSensitive(before)),
      after === undefined ? null : JSON.stringify(maskSensitive(after)),
    ]
  );
}

async function syncCanonicalCollection(client, ownerUserId, ownerOrganizationId, collection, records) {
  if (collection === "customers") return;

  if (collection === "shipments") {
    const existingAccessResult = await client.query(
      `SELECT *
       FROM shipments
       WHERE owner_user_id = $1`,
      [ownerUserId]
    );
    const existingAccess = new Map(
      existingAccessResult.rows.map((row) => [
        row.id,
        {
          token: row.customer_access_token,
          tokenHash: row.customer_access_token_hash,
          enabled: row.customer_access_enabled,
        },
      ])
    );
    const existingShipments = new Map(existingAccessResult.rows.map((row) => [row.id, row]));

    for (const shipment of records) {
      const preservedAccess = existingAccess.get(shipment.id) || {};
      const before = existingShipments.get(shipment.id) || null;
      const beforeSnapshot = before ? bridgeShipmentSnapshot(before) : null;
      const afterSnapshot = bridgeShipmentSnapshot(shipment);
      await client.query(
        `INSERT INTO shipments (
           id, organization_id, owner_user_id, shipment_code, customer_id, customer_name, status,
           origin, destination, estimated_delivery_at, free_time_ends_at,
           customer_access_token, customer_access_token_hash, customer_access_enabled,
           legacy_data, created_by_id, archived_at, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb, $3, $16, NOW())
         ON CONFLICT (id) DO UPDATE SET
           organization_id = EXCLUDED.organization_id,
           shipment_code = EXCLUDED.shipment_code,
           customer_id = EXCLUDED.customer_id,
           customer_name = EXCLUDED.customer_name,
           status = EXCLUDED.status,
           origin = EXCLUDED.origin,
           destination = EXCLUDED.destination,
           estimated_delivery_at = EXCLUDED.estimated_delivery_at,
           free_time_ends_at = EXCLUDED.free_time_ends_at,
           customer_access_token = COALESCE(shipments.customer_access_token, EXCLUDED.customer_access_token),
           customer_access_token_hash = COALESCE(shipments.customer_access_token_hash, EXCLUDED.customer_access_token_hash),
           customer_access_enabled = shipments.customer_access_enabled OR EXCLUDED.customer_access_enabled,
           archived_at = EXCLUDED.archived_at,
           legacy_data = EXCLUDED.legacy_data,
           updated_at = NOW()`,
        [
          shipment.id,
          ownerOrganizationId,
          ownerUserId,
          shipment.trackingNumber || shipment.id,
          shipment.customerId || null,
          shipment.customerName || null,
          shipment.status || "PENDING",
          shipment.origin || null,
          shipment.destination || null,
          shipment.estimatedDelivery || null,
          shipment.estimatedDelivery || null,
          preservedAccess.token || null,
          preservedAccess.tokenHash || null,
          Boolean(preservedAccess.enabled),
          JSON.stringify(shipment),
          shipment.isArchived ? new Date() : null,
        ]
      );
      if (!before) {
        await insertBridgeChangeLog(client, {
          ownerUserId,
          organizationId: ownerOrganizationId,
          action: "shipment.create",
          entityType: "SHIPMENT",
          entityId: shipment.id,
          summary: "Shipment was created from the operations list.",
          after: afterSnapshot,
        });
      } else if (beforeSnapshot.status !== afterSnapshot.status) {
        await insertBridgeChangeLog(client, {
          ownerUserId,
          organizationId: ownerOrganizationId,
          action: "shipment.status_change",
          entityType: "SHIPMENT",
          entityId: shipment.id,
          summary: `Shipment status changed from ${beforeSnapshot.status} to ${afterSnapshot.status}.`,
          before: beforeSnapshot,
          after: afterSnapshot,
        });
      } else if (beforeSnapshot.isArchived !== afterSnapshot.isArchived) {
        await insertBridgeChangeLog(client, {
          ownerUserId,
          organizationId: ownerOrganizationId,
          action: afterSnapshot.isArchived ? "shipment.archive" : "shipment.restore",
          entityType: "SHIPMENT",
          entityId: shipment.id,
          summary: afterSnapshot.isArchived ? "Shipment was archived." : "Shipment was restored.",
          before: beforeSnapshot,
          after: afterSnapshot,
        });
      } else if (snapshotsDiffer(beforeSnapshot, afterSnapshot)) {
        await insertBridgeChangeLog(client, {
          ownerUserId,
          organizationId: ownerOrganizationId,
          action: "shipment.update",
          entityType: "SHIPMENT",
          entityId: shipment.id,
          summary: "Shipment details were updated.",
          before: beforeSnapshot,
          after: afterSnapshot,
        });
      }
    }
  }

  if (collection === "tasks") {
    const existingTasksResult = await client.query(
      `SELECT id, source_type, source_id, customer_id, assigned_by_id, assigned_at, assignment_note,
              workflow_instance_id, workflow_step_code, workflow_blocker_id, blocker_code,
              completed_at, completed_by_user_id, legacy_data
       FROM tasks
       WHERE owner_user_id = $1`,
      [ownerUserId]
    );
    const existingTasks = new Map(existingTasksResult.rows.map((row) => [row.id, row]));
    const referencedTaskUserIds = Array.from(
      new Set(
        records
          .flatMap((task) => [task.assignedToUserId, task.assignedByUserId, task.completedByUserId])
          .filter(Boolean)
      )
    );
    const validTaskUserIds = new Set();
    if (referencedTaskUserIds.length) {
      const usersResult = await client.query(
        `SELECT id
         FROM app_users
         WHERE organization_id = $1
           AND id = ANY($2::text[])
           AND status <> 'suspended'`,
        [ownerOrganizationId, referencedTaskUserIds]
      );
      usersResult.rows.forEach((row) => validTaskUserIds.add(row.id));
    }
    const workflowInstanceIds = Array.from(new Set(records.map((task) => task.workflowInstanceId).filter(Boolean)));
    const validWorkflowInstanceIds = new Set();
    if (workflowInstanceIds.length) {
      const workflowResult = await client.query(
        `SELECT id
         FROM shipment_workflow_instances
         WHERE organization_id = $1
           AND id = ANY($2::text[])`,
        [ownerOrganizationId, workflowInstanceIds]
      );
      workflowResult.rows.forEach((row) => validWorkflowInstanceIds.add(row.id));
    }
    const workflowBlockerIds = Array.from(new Set(records.map((task) => task.workflowBlockerId).filter(Boolean)));
    const validWorkflowBlockerIds = new Set();
    if (workflowBlockerIds.length) {
      const blockerResult = await client.query(
        `SELECT id
         FROM shipment_workflow_blockers
         WHERE organization_id = $1
           AND id = ANY($2::text[])`,
        [ownerOrganizationId, workflowBlockerIds]
      );
      blockerResult.rows.forEach((row) => validWorkflowBlockerIds.add(row.id));
    }
    const payloadTaskIds = records.map((task) => task.id).filter(Boolean);
    if (payloadTaskIds.length) {
      await client.query(
        `DELETE FROM tasks
         WHERE owner_user_id = $1
           AND NOT (id = ANY($2::text[]))
           AND workflow_instance_id IS NULL
           AND workflow_step_code IS NULL
           AND workflow_blocker_id IS NULL
           AND blocker_code IS NULL`,
        [ownerUserId, payloadTaskIds]
      );
    } else {
      await client.query(
        `DELETE FROM tasks
         WHERE owner_user_id = $1
           AND workflow_instance_id IS NULL
           AND workflow_step_code IS NULL
           AND workflow_blocker_id IS NULL
           AND blocker_code IS NULL`,
        [ownerUserId]
      );
    }
    for (const task of records) {
      const existingTask = existingTasks.get(task.id) || {};
      const sourceType = task.sourceType || existingTask.source_type || "MANUAL";
      const sourceId = task.sourceId || existingTask.source_id || null;
      const assignedToUserId =
        task.assignedToUserId && validTaskUserIds.has(task.assignedToUserId) ? task.assignedToUserId : null;
      const assignedByUserId =
        task.assignedByUserId && validTaskUserIds.has(task.assignedByUserId)
          ? task.assignedByUserId
          : existingTask.assigned_by_id || null;
      const completedByUserId =
        task.completedByUserId && validTaskUserIds.has(task.completedByUserId)
          ? task.completedByUserId
          : existingTask.completed_by_user_id || null;
      const workflowInstanceId =
        task.workflowInstanceId && validWorkflowInstanceIds.has(task.workflowInstanceId)
          ? task.workflowInstanceId
          : existingTask.workflow_instance_id || null;
      const workflowBlockerId =
        task.workflowBlockerId && validWorkflowBlockerIds.has(task.workflowBlockerId)
          ? task.workflowBlockerId
          : existingTask.workflow_blocker_id || null;
      const legacy = {
        ...(existingTask.legacy_data || {}),
        ...task,
        sourceType,
        ...(sourceId ? { sourceId } : {}),
      };
      await client.query(
        `INSERT INTO tasks (
           id, organization_id, owner_user_id, title, description, status, priority, assigned_to_id,
           assigned_to_name, assigned_by_id, assigned_by_name, assigned_at, assignment_note, due_at, source_type,
           source_id, shipment_id, customer_id, workflow_instance_id, workflow_step_code,
           workflow_blocker_id, blocker_code, legacy_data, completed_at, completed_by_user_id, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
                 $17, $18, $19, $20, $21, $22, $23::jsonb, $24, $25, NOW())
         ON CONFLICT (id) DO UPDATE SET
           organization_id = EXCLUDED.organization_id,
           title = EXCLUDED.title,
           description = EXCLUDED.description,
           status = EXCLUDED.status,
           priority = EXCLUDED.priority,
           assigned_to_id = EXCLUDED.assigned_to_id,
           assigned_to_name = EXCLUDED.assigned_to_name,
           assigned_by_id = EXCLUDED.assigned_by_id,
           assigned_by_name = EXCLUDED.assigned_by_name,
           assigned_at = EXCLUDED.assigned_at,
           assignment_note = EXCLUDED.assignment_note,
           due_at = EXCLUDED.due_at,
           source_type = EXCLUDED.source_type,
           source_id = EXCLUDED.source_id,
           shipment_id = EXCLUDED.shipment_id,
           customer_id = EXCLUDED.customer_id,
           workflow_instance_id = EXCLUDED.workflow_instance_id,
           workflow_step_code = EXCLUDED.workflow_step_code,
           workflow_blocker_id = EXCLUDED.workflow_blocker_id,
           blocker_code = EXCLUDED.blocker_code,
           legacy_data = EXCLUDED.legacy_data,
           completed_at = EXCLUDED.completed_at,
           completed_by_user_id = EXCLUDED.completed_by_user_id,
           updated_at = NOW()`,
        [
          task.id,
          ownerOrganizationId,
          ownerUserId,
          task.title,
          task.description || null,
          task.status || "TODO",
          task.priority || "MEDIUM",
          assignedToUserId,
          assignedToUserId ? task.assignedToName || null : null,
          assignedByUserId,
          task.assignedByName || null,
          existingTask.assigned_at || (assignedToUserId ? new Date() : null),
          task.assignmentNote || existingTask.assignment_note || null,
          task.dueDate || null,
          sourceType,
          sourceId,
          task.shipmentId || null,
          existingTask.customer_id || null,
          workflowInstanceId,
          task.workflowStepCode || existingTask.workflow_step_code || null,
          workflowBlockerId,
          task.blockerCode || existingTask.blocker_code || null,
          JSON.stringify(legacy),
          task.status === "DONE" ? existingTask.completed_at || new Date() : null,
          task.status === "DONE" ? completedByUserId : null,
        ]
      );
    }
  }

  if (collection === "documents") {
    const existingDocumentsResult = await client.query(
      `SELECT id, visibility, storage_key, mime_type, checksum, version, uploaded_by_id
       FROM documents
       WHERE owner_user_id = $1`,
      [ownerUserId]
    );
    const existingDocuments = new Map(
      existingDocumentsResult.rows.map((row) => [row.id, row])
    );

    for (const document of records) {
      const existingDocument = existingDocuments.get(document.id) || {};
      const visibility =
        document.visibility === "customer_visible"
          ? "customer_visible"
          : existingDocument.visibility || "internal";
      const storageKey =
        existingDocument.storage_key ||
        (typeof document.url === "string" && !document.url.startsWith("/api/")
          ? document.url
          : document.id);
      await client.query(
        `INSERT INTO documents (
           id, organization_id, owner_user_id, title, file_name, mime_type, file_size, storage_key,
           checksum, version, uploaded_by_id, uploaded_by_name, shipment_id, customer_id,
           visibility, legacy_data, archived_at, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::jsonb, $17, NOW())
         ON CONFLICT (id) DO UPDATE SET
           organization_id = EXCLUDED.organization_id,
           title = EXCLUDED.title,
           file_name = EXCLUDED.file_name,
           mime_type = COALESCE(documents.mime_type, EXCLUDED.mime_type),
           file_size = EXCLUDED.file_size,
           storage_key = COALESCE(documents.storage_key, EXCLUDED.storage_key),
           checksum = COALESCE(documents.checksum, EXCLUDED.checksum),
           version = GREATEST(documents.version, EXCLUDED.version),
           uploaded_by_id = COALESCE(documents.uploaded_by_id, EXCLUDED.uploaded_by_id),
           uploaded_by_name = EXCLUDED.uploaded_by_name,
           shipment_id = EXCLUDED.shipment_id,
           customer_id = EXCLUDED.customer_id,
           visibility = EXCLUDED.visibility,
           archived_at = EXCLUDED.archived_at,
           legacy_data = EXCLUDED.legacy_data,
           updated_at = NOW()`,
        [
          document.id,
          ownerOrganizationId,
          ownerUserId,
          document.name || document.fileName || document.id,
          document.name || document.fileName || null,
          existingDocument.mime_type || null,
          document.fileSize || null,
          storageKey,
          existingDocument.checksum || null,
          Number(document.version || existingDocument.version || 1),
          existingDocument.uploaded_by_id || null,
          document.uploadedBy || null,
          document.shipmentId || null,
          document.customerId || null,
          visibility,
          JSON.stringify(document),
          document.isArchived ? new Date() : null,
        ]
      );
    }
  }

  if (collection === "notifications") {
    await client.query("DELETE FROM notifications WHERE user_id = $1", [ownerUserId]);
    for (const notification of records) {
      await client.query(
        `INSERT INTO notifications (
           id, organization_id, user_id, title, body, type, source_type, source_id, legacy_data, read_at, created_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, NOW())
         ON CONFLICT (id) DO UPDATE SET
           organization_id = EXCLUDED.organization_id,
           title = EXCLUDED.title,
           body = EXCLUDED.body,
           type = EXCLUDED.type,
           source_type = EXCLUDED.source_type,
           source_id = EXCLUDED.source_id,
           read_at = EXCLUDED.read_at,
           legacy_data = EXCLUDED.legacy_data`,
        [
          notification.id,
          ownerOrganizationId,
          ownerUserId,
          notification.title,
          notification.message || null,
          notification.type || "INFO",
          notification.link ? "route" : null,
          notification.link || null,
          JSON.stringify(notification),
          notification.isRead ? new Date() : null,
        ]
      );
    }
  }

  if (collection === "cheques") {
    for (const cheque of records) {
      await client.query(
        `INSERT INTO cheques (
           id, organization_id, owner_user_id, bank_name, cheque_number, amount, due_date,
           location, receiver, status, description, legacy_data, archived_at, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, NOW())
         ON CONFLICT (id) DO UPDATE SET
           organization_id = EXCLUDED.organization_id,
           bank_name = EXCLUDED.bank_name,
           cheque_number = EXCLUDED.cheque_number,
           amount = EXCLUDED.amount,
           due_date = EXCLUDED.due_date,
           location = EXCLUDED.location,
           receiver = EXCLUDED.receiver,
           status = EXCLUDED.status,
           description = EXCLUDED.description,
           legacy_data = EXCLUDED.legacy_data,
           archived_at = EXCLUDED.archived_at,
           updated_at = NOW()`,
        [
          cheque.id,
          ownerOrganizationId,
          ownerUserId,
          cheque.bankName || "",
          cheque.chequeNumber || cheque.id,
          Number(cheque.amount || 0),
          cheque.dueDate || null,
          cheque.location || null,
          cheque.receiver || null,
          cheque.status || "ACTIVE",
          cheque.description || null,
          JSON.stringify(cheque),
          cheque.status === "ARCHIVED" ? new Date() : null,
        ]
      );
    }
  }

  if (collection === "appointments") {
    for (const appointment of records) {
      await client.query(
        `INSERT INTO compliance_meetings (
           id, organization_id, owner_user_id, title, organization_name, meeting_at, status,
           assigned_to_id, assigned_to_name, outcome, next_action_items,
           reminder_sent, legacy_data, archived_at, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14, NOW())
         ON CONFLICT (id) DO UPDATE SET
           organization_id = EXCLUDED.organization_id,
           title = EXCLUDED.title,
           organization_name = EXCLUDED.organization_name,
           meeting_at = EXCLUDED.meeting_at,
           status = EXCLUDED.status,
           assigned_to_id = EXCLUDED.assigned_to_id,
           assigned_to_name = EXCLUDED.assigned_to_name,
           outcome = EXCLUDED.outcome,
           next_action_items = EXCLUDED.next_action_items,
           reminder_sent = EXCLUDED.reminder_sent,
           legacy_data = EXCLUDED.legacy_data,
           archived_at = EXCLUDED.archived_at,
           updated_at = NOW()`,
        [
          appointment.id,
          ownerOrganizationId,
          ownerUserId,
          appointment.purpose || appointment.id,
          appointment.departmentName || null,
          appointment.dateTime || null,
          appointment.status || "SCHEDULED",
          appointment.assignedPersonId || null,
          appointment.assignedPersonName || null,
          appointment.outcome || null,
          appointment.nextActionItems || null,
          Boolean(appointment.reminderSent),
          JSON.stringify(appointment),
          appointment.status === "ARCHIVED" ? new Date() : null,
        ]
      );

      await client.query("DELETE FROM meeting_required_documents WHERE meeting_id = $1", [
        appointment.id,
      ]);
      const requiredDocuments = Array.isArray(appointment.requiredDocuments)
        ? appointment.requiredDocuments
        : [];
      for (const document of requiredDocuments) {
        await client.query(
          `INSERT INTO meeting_required_documents (
             id, organization_id, meeting_id, name, required, completed, file_name, legacy_data, updated_at
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, NOW())
           ON CONFLICT (id) DO UPDATE SET
             organization_id = EXCLUDED.organization_id,
             name = EXCLUDED.name,
             required = EXCLUDED.required,
             completed = EXCLUDED.completed,
             file_name = EXCLUDED.file_name,
             legacy_data = EXCLUDED.legacy_data,
             updated_at = NOW()`,
          [
            document.id || crypto.randomUUID(),
            ownerOrganizationId,
            appointment.id,
            document.name || "Document",
            document.required !== false,
            Boolean(document.completed),
            document.fileName || null,
            JSON.stringify(document),
          ]
        );
      }
    }
  }

  if (collection === "quotes") {
    for (const quote of records) {
      await client.query(
        `INSERT INTO quotations (
           id, organization_id, owner_user_id, quotation_number, customer_id, customer_name, customer_phone,
           origin_city, destination_city, cargo_type, weight, dimensions, pickup_date,
           delivery_date, requirements, base_rate, fuel_surcharge, loading_fees,
           toll_fees, insurance_percentage, profit_margin, total_price, valid_until,
           status, notes, legacy_data, archived_at, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb,
                 $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26::jsonb, $27, NOW())
         ON CONFLICT (id) DO UPDATE SET
           organization_id = EXCLUDED.organization_id,
           customer_id = EXCLUDED.customer_id,
           customer_name = EXCLUDED.customer_name,
           customer_phone = COALESCE(NULLIF(EXCLUDED.customer_phone, ''), quotations.customer_phone),
           origin_city = EXCLUDED.origin_city,
           destination_city = EXCLUDED.destination_city,
           cargo_type = EXCLUDED.cargo_type,
           weight = EXCLUDED.weight,
           dimensions = EXCLUDED.dimensions,
           pickup_date = EXCLUDED.pickup_date,
           delivery_date = EXCLUDED.delivery_date,
           requirements = EXCLUDED.requirements,
           base_rate = EXCLUDED.base_rate,
           fuel_surcharge = EXCLUDED.fuel_surcharge,
           loading_fees = EXCLUDED.loading_fees,
           toll_fees = EXCLUDED.toll_fees,
           insurance_percentage = EXCLUDED.insurance_percentage,
           profit_margin = EXCLUDED.profit_margin,
           total_price = EXCLUDED.total_price,
           valid_until = EXCLUDED.valid_until,
           status = EXCLUDED.status,
           notes = EXCLUDED.notes,
           legacy_data = EXCLUDED.legacy_data,
           archived_at = EXCLUDED.archived_at,
           updated_at = NOW()`,
        [
          quote.id,
          ownerOrganizationId,
          ownerUserId,
          quote.quotationNumber || quote.id,
          quote.customerId || null,
          quote.customerName || "Unknown customer",
          quote.customerPhone || null,
          quote.originCity || null,
          quote.destinationCity || null,
          quote.cargoType || "GENERAL",
          Number(quote.weight || 0),
          quote.dimensions || null,
          quote.pickupDate || null,
          quote.deliveryDate || null,
          JSON.stringify(Array.isArray(quote.requirements) ? quote.requirements : []),
          Number(quote.baseRate || 0),
          Number(quote.fuelSurcharge || 0),
          Number(quote.loadingFees || 0),
          Number(quote.tollFees || 0),
          Number(quote.insurancePercentage || 0),
          Number(quote.profitMargin || 0),
          Number(quote.totalPrice || 0),
          quote.validUntil || null,
          quote.status || "PENDING",
          quote.notes || null,
          JSON.stringify(quote),
          quote.isArchived || quote.status === "ARCHIVED" ? new Date() : null,
        ]
      );
    }
  }

  if (collection === "channels") {
    await seedDefaultChatThreads(ownerUserId);
  }

  if (collection === "messages") {
    for (const message of records) {
      const threadId = message.isGroup
        ? message.groupId
        : await ensureDirectChat(message.senderId, message.receiverId);
      if (!threadId) continue;
      await client.query(
        `INSERT INTO chat_messages (id, thread_id, sender_id, sender_name, content, legacy_data, created_at)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, COALESCE($7, NOW()))
         ON CONFLICT (id) DO UPDATE SET
           content = EXCLUDED.content,
           legacy_data = EXCLUDED.legacy_data`,
        [
          message.id,
          threadId,
          message.senderId,
          message.senderName || "User",
          message.content || "",
          JSON.stringify(message),
          message.createdAt ? new Date(message.createdAt) : null,
        ]
      );
    }
  }
}
