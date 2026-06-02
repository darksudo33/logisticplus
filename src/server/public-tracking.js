import crypto from "node:crypto";
import { getPublicWorkflowSummary } from "./repositories/shipment-progress.js";

const PUBLIC_DOCUMENT_ACCESS_TTL_MS = 30 * 60 * 1000;

function hashCustomerAccessToken(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

function publicPhoneDigits(value) {
  const persianDigits = "Û°Û±Û²Û³Û´ÛµÛ¶Û·Û¸Û¹";
  const arabicDigits = "Ù Ù¡Ù¢Ù£Ù¤Ù¥Ù¦Ù§Ù¨Ù©";
  return String(value || "")
    .replace(/[Û°-Û¹Ù -Ù©]/g, (digit) => {
      const persianIndex = persianDigits.indexOf(digit);
      if (persianIndex >= 0) return String(persianIndex);
      const arabicIndex = arabicDigits.indexOf(digit);
      return arabicIndex >= 0 ? String(arabicIndex) : digit;
    })
    .replace(/\D/g, "");
}

function publicDocumentAccessSecret() {
  return (
    process.env.PUBLIC_DOCUMENT_ACCESS_SECRET ||
    process.env.SESSION_SECRET ||
    process.env.DATABASE_URL ||
    "logisticplus-local-public-document-access-secret"
  );
}

function publicAccessTimestamp(value) {
  const date = value ? new Date(value) : new Date(0);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function signPublicDocumentAccess({ documentId, shipmentCode, shipmentUpdatedAt, expires }) {
  const payload = [
    String(documentId || ""),
    String(shipmentCode || ""),
    publicAccessTimestamp(shipmentUpdatedAt),
    String(expires || ""),
  ].join(":");
  return crypto
    .createHmac("sha256", publicDocumentAccessSecret())
    .update(payload)
    .digest("base64url");
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function publicDocumentDownloadUrl(row) {
  const expires = Date.now() + PUBLIC_DOCUMENT_ACCESS_TTL_MS;
  const signature = signPublicDocumentAccess({
    documentId: row.id,
    shipmentCode: row.shipment_code,
    shipmentUpdatedAt: row.shipment_updated_at,
    expires,
  });
  return `/api/public/documents/${encodeURIComponent(row.id)}?shipmentCode=${encodeURIComponent(row.shipment_code)}&expires=${encodeURIComponent(String(expires))}&signature=${encodeURIComponent(signature)}`;
}

function publicDocumentSignatureIsValid(row, { shipmentCode, expires, signature } = {}) {
  const numericExpires = Number(expires);
  if (!row || !shipmentCode || !signature || !Number.isFinite(numericExpires)) return false;
  if (numericExpires <= Date.now()) return false;
  if (String(shipmentCode) !== String(row.shipment_code || "")) return false;
  const expected = signPublicDocumentAccess({
    documentId: row.id,
    shipmentCode: row.shipment_code,
    shipmentUpdatedAt: row.shipment_updated_at,
    expires: numericExpires,
  });
  return safeEqual(expected, signature);
}

export function toPublicTrackingStatusEventDto(row) {
  const labels = {
    PENDING: "Shipment is being prepared",
    BOOKED: "Shipment is booked",
    IN_TRANSIT: "Shipment is in transit",
    ARRIVED: "Shipment has arrived",
    CUSTOMS: "Shipment is in customs review",
    CLEARED: "Shipment is cleared",
    DELIVERED: "Shipment is delivered",
    CLOSED: "Shipment is closed",
  };

  return {
    label: row.public_label || labels[row.status] || "Shipment status updated",
    description:
      row.public_description ||
      "Your shipment is being handled by our operations team.",
    lastUpdate: row.public_status_created_at || row.updated_at || row.created_at,
  };
}

export function toPublicTrackingDocumentDto(row) {
  return {
    id: row.id,
    title: row.title,
    fileName: row.file_name,
    fileSize: row.file_size,
    downloadUrl: publicDocumentDownloadUrl(row),
    createdAt: row.created_at,
  };
}

export function toPublicTrackingLegacyStepDto(row) {
  const data = row.data || {};
  return {
    id: data.id,
    label: data.name,
    status: data.status || "PENDING",
    order: Number(data.order) || 0,
    completedAt: data.completedAt || null,
  };
}

export function toPublicTrackingCompanyDto(row) {
  const companyName = row.organization_name || "Logistic Plus";
  const contactParts = [row.organization_phone, row.organization_email].filter(Boolean);
  const contactText = contactParts.length
    ? `برای پرسش درباره این محموله با ${companyName} از طریق ${contactParts.join(" یا ")} تماس بگیرید.`
    : "برای پرسش درباره این محموله با نماینده عملیات خود تماس بگیرید.";

  return {
    name: companyName,
    contactText,
  };
}

export function toPublicTrackingWorkflowDto(workflowSummary, { fallbackPublicStepsCount = 0 } = {}) {
  return {
    currentPublicPhase: workflowSummary?.currentPublicPhase || "",
    currentPublicLabel: workflowSummary?.currentPublicLabel || "",
    completedPublicStepsCount: workflowSummary?.completedPublicStepsCount || 0,
    totalPublicStepsCount: workflowSummary?.totalPublicStepsCount || fallbackPublicStepsCount,
    publicNote: workflowSummary?.publicNote || "",
    lastPublicUpdate: workflowSummary?.lastPublicUpdate || null,
  };
}

export function toPublicTrackingShipmentDto(row, { statusEvent, workflow, legacyPublicStepsCount = 0 } = {}) {
  const safeWorkflow = workflow || toPublicTrackingWorkflowDto(null, {
    fallbackPublicStepsCount: legacyPublicStepsCount,
  });
  return {
    code: row.shipment_code,
    publicStatusLabel: safeWorkflow.currentPublicLabel || statusEvent.label,
    publicStatusDescription: safeWorkflow.publicNote || statusEvent.description,
    origin: row.origin,
    destination: row.destination,
    estimatedDelivery: row.estimated_delivery_at,
    lastPublicUpdate: safeWorkflow.lastPublicUpdate || statusEvent.lastUpdate,
    currentPublicPhase: safeWorkflow.currentPublicPhase,
    currentPublicLabel: safeWorkflow.currentPublicLabel || statusEvent.label,
    completedPublicStepsCount: safeWorkflow.completedPublicStepsCount,
    totalPublicStepsCount: safeWorkflow.totalPublicStepsCount,
    publicNote: safeWorkflow.publicNote,
  };
}

async function buildPublicShipmentPayload(queryable, shipmentId) {
  const shipmentResult = await queryable.query(
    `SELECT
       s.id,
       s.organization_id,
       s.owner_user_id,
       s.customer_id,
       s.shipment_code,
       s.status,
       s.origin,
       s.destination,
       s.estimated_delivery_at,
       s.updated_at,
       s.created_at,
       o.name AS organization_name,
       o.contact_email AS organization_email,
       o.contact_phone AS organization_phone,
       e.public_label,
       e.public_description,
       e.created_at AS public_status_created_at
     FROM shipments s
     LEFT JOIN organizations o ON o.id = s.organization_id
     LEFT JOIN LATERAL (
       SELECT public_label, public_description, created_at
       FROM shipment_status_events
       WHERE shipment_id = s.id AND is_customer_visible = TRUE
       ORDER BY created_at DESC
       LIMIT 1
     ) e ON TRUE
     WHERE s.id = $1
       AND s.archived_at IS NULL
     LIMIT 1`,
    [shipmentId]
  );

  const shipment = shipmentResult.rows[0];
  if (!shipment) return null;

  const docsResult = await queryable.query(
    `SELECT
       d.id,
       d.title,
       d.file_name,
       d.file_size,
       d.created_at,
       s.shipment_code,
       s.updated_at AS shipment_updated_at
      FROM documents d
      JOIN shipments s ON s.id = $1
      WHERE d.organization_id = s.organization_id
        AND d.visibility = 'customer_visible'
        AND d.archived_at IS NULL
        AND (
          d.shipment_id = s.id
          OR (
            d.shipment_id IS NULL
            AND d.customer_id = COALESCE(s.customer_id, s.legacy_data->>'customerId')
            AND COALESCE(s.customer_id, s.legacy_data->>'customerId') IS NOT NULL
          )
        )
      ORDER BY d.created_at DESC`,
    [shipmentId]
  );

  const stepsResult = await queryable.query(
    `SELECT data
     FROM user_records
     WHERE owner_user_id = $1
       AND ($3::text IS NULL OR organization_id = $3 OR organization_id IS NULL)
       AND collection = 'shipmentSteps'
       AND data->>'shipmentId' = $2
     ORDER BY COALESCE((data->>'order')::int, 0) ASC`,
    [shipment.owner_user_id, shipmentId, shipment.organization_id || null]
  );

  const publicStatus = toPublicTrackingStatusEventDto(shipment);
  const workflowSummary = await getPublicWorkflowSummary(queryable, shipmentId);
  const legacyPublicSteps = workflowSummary ? [] : stepsResult.rows.map(toPublicTrackingLegacyStepDto);
  const workflow = toPublicTrackingWorkflowDto(workflowSummary, {
    fallbackPublicStepsCount: stepsResult.rows.length,
  });
  return {
    shipment: toPublicTrackingShipmentDto(shipment, {
      statusEvent: publicStatus,
      workflow,
      legacyPublicStepsCount: stepsResult.rows.length,
    }),
    steps: legacyPublicSteps,
    documents: docsResult.rows.map(toPublicTrackingDocumentDto),
    company: toPublicTrackingCompanyDto(shipment),
  };
}

export async function getPublicTrackingByToken(queryable, token) {
  if (!token || String(token).length < 24) return null;
  const tokenHash = hashCustomerAccessToken(token);
  const result = await queryable.query(
    `SELECT id
     FROM shipments
     WHERE customer_access_token_hash = $1
       AND customer_access_enabled = TRUE
       AND archived_at IS NULL
     LIMIT 1`,
    [tokenHash]
  );
  const shipment = result.rows[0];
  if (!shipment) return null;
  return buildPublicShipmentPayload(queryable, shipment.id);
}

export async function getPublicTrackingTokenAuditState(queryable, token) {
  if (!token || String(token).length < 24) {
    return { matched: false, reason: "invalid_format" };
  }
  const tokenHash = hashCustomerAccessToken(token);
  const result = await queryable.query(
    `SELECT id, organization_id, customer_access_enabled, archived_at
     FROM shipments
     WHERE customer_access_token_hash = $1
     LIMIT 1`,
    [tokenHash]
  );
  const shipment = result.rows[0];
  if (!shipment) return { matched: false, reason: "unknown_token" };
  if (shipment.archived_at) {
    return {
      matched: true,
      reason: "archived_shipment",
      shipmentId: shipment.id,
      organizationId: shipment.organization_id,
      enabled: Boolean(shipment.customer_access_enabled),
    };
  }
  if (!shipment.customer_access_enabled) {
    return {
      matched: true,
      reason: "tracking_disabled",
      shipmentId: shipment.id,
      organizationId: shipment.organization_id,
      enabled: false,
    };
  }
  return {
    matched: true,
    reason: "not_available",
    shipmentId: shipment.id,
    organizationId: shipment.organization_id,
    enabled: true,
  };
}

export async function searchPublicTracking(queryable, { shipmentCode, verification }) {
  if (!shipmentCode || !verification) return null;
  const normalizedVerification = String(verification).trim().toLowerCase();
  const verificationDigits = publicPhoneDigits(verification);
  const result = await queryable.query(
    `SELECT s.id
     FROM shipments s
      LEFT JOIN customers c
        ON c.organization_id = s.organization_id
       AND c.archived_at IS NULL
       AND c.id = COALESCE(s.customer_id, s.legacy_data->>'customerId')
      WHERE lower(s.shipment_code) = lower($1)
        AND s.customer_access_enabled = TRUE
        AND s.archived_at IS NULL
       AND (
         lower(COALESCE(c.email, '')) = $2
         OR ($3 <> '' AND regexp_replace(COALESCE(c.phone, ''), '\\D', '', 'g') = $3)
         OR lower(COALESCE(s.legacy_data->>'customerEmail', '')) = $2
         OR ($3 <> '' AND regexp_replace(COALESCE(s.legacy_data->>'customerPhone', ''), '\\D', '', 'g') = $3)
       )
     LIMIT 1`,
    [shipmentCode, normalizedVerification, verificationDigits]
  );
  const shipment = result.rows[0];
  if (!shipment) return null;
  return buildPublicShipmentPayload(queryable, shipment.id);
}

export async function getPublicDocument(queryable, documentId, access = {}) {
  const result = await queryable.query(
    `SELECT
       d.id,
       d.title,
       d.file_name,
       d.mime_type,
       d.file_size,
       d.storage_key,
       d.storage_provider,
       d.object_key,
       d.storage_bucket,
       d.storage_region,
       d.local_path,
       d.checksum_sha256,
       d.size_bytes,
       d.content_type,
       d.storage_verified_at,
       d.storage_migration_status,
       d.legacy_data,
       s.shipment_code,
       s.updated_at AS shipment_updated_at
     FROM documents d
     JOIN shipments s ON lower(s.shipment_code) = lower($2)
     WHERE d.id = $1
       AND d.organization_id = s.organization_id
       AND d.visibility = 'customer_visible'
       AND d.archived_at IS NULL
       AND s.archived_at IS NULL
       AND s.customer_access_enabled = TRUE
       AND s.customer_access_token_hash IS NOT NULL
        AND (
          d.shipment_id = s.id
          OR (
            d.shipment_id IS NULL
            AND d.customer_id = COALESCE(s.customer_id, s.legacy_data->>'customerId')
            AND COALESCE(s.customer_id, s.legacy_data->>'customerId') IS NOT NULL
          )
        )
      LIMIT 1`,
    [documentId, access.shipmentCode || ""]
  );
  const document = result.rows[0] || null;
  if (!publicDocumentSignatureIsValid(document, access)) return null;
  return document;
}

export async function getPublicDocumentByTrackingToken(queryable, token, documentId) {
  if (!token || String(token).length < 24) return null;
  const tokenHash = hashCustomerAccessToken(token);
  const result = await queryable.query(
    `SELECT
       d.id,
       d.title,
       d.file_name,
       d.mime_type,
       d.file_size,
       d.storage_key,
       d.storage_provider,
       d.object_key,
       d.storage_bucket,
       d.storage_region,
       d.local_path,
       d.checksum_sha256,
       d.size_bytes,
       d.content_type,
       d.storage_verified_at,
       d.storage_migration_status,
       d.legacy_data
     FROM documents d
     JOIN shipments s
        ON (
          d.shipment_id = s.id
          OR (
            d.shipment_id IS NULL
            AND d.customer_id = COALESCE(s.customer_id, s.legacy_data->>'customerId')
            AND COALESCE(s.customer_id, s.legacy_data->>'customerId') IS NOT NULL
          )
        )
     WHERE d.id = $1
       AND d.organization_id = s.organization_id
       AND d.visibility = 'customer_visible'
       AND d.archived_at IS NULL
       AND s.archived_at IS NULL
       AND s.customer_access_token_hash = $2
       AND s.customer_access_enabled = TRUE
     LIMIT 1`,
    [documentId, tokenHash]
  );
  return result.rows[0] || null;
}
