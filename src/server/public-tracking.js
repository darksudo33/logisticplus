import crypto from "node:crypto";
import { getPublicWorkflowSummary } from "./repositories/shipment-progress.js";

function hashCustomerAccessToken(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

function publicStatusFromShipment(row) {
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

function toPublicDocument(row, token) {
  return {
    id: row.id,
    title: row.title,
    fileName: row.file_name,
    fileSize: row.file_size,
    downloadUrl: token
      ? `/api/public/track/${encodeURIComponent(token)}/documents/${encodeURIComponent(row.id)}`
      : `/api/public/documents/${encodeURIComponent(row.id)}`,
    createdAt: row.created_at,
  };
}

function toPublicStep(row) {
  const data = row.data || {};
  return {
    id: data.id,
    label: data.name,
    status: data.status || "PENDING",
    order: Number(data.order) || 0,
    completedAt: data.completedAt || null,
  };
}

function publicCompanyFromShipment(row) {
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

async function buildPublicShipmentPayload(queryable, shipmentId, token) {
  const shipmentResult = await queryable.query(
    `SELECT
       s.id,
       s.organization_id,
       s.owner_user_id,
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
     LIMIT 1`,
    [shipmentId]
  );

  const shipment = shipmentResult.rows[0];
  if (!shipment) return null;

  const docsResult = await queryable.query(
    `SELECT id, title, file_name, file_size, created_at
     FROM documents
     WHERE shipment_id = $1
       AND ($2::text IS NULL OR organization_id = $2 OR organization_id IS NULL)
       AND visibility = 'customer_visible'
       AND archived_at IS NULL
     ORDER BY created_at DESC`,
    [shipmentId, shipment.organization_id || null]
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

  const publicStatus = publicStatusFromShipment(shipment);
  const workflowSummary = await getPublicWorkflowSummary(queryable, shipmentId);
  const legacyPublicSteps = workflowSummary ? [] : stepsResult.rows.map(toPublicStep);
  const lastPublicUpdate = workflowSummary?.lastPublicUpdate || publicStatus.lastUpdate;
  return {
    shipment: {
      code: shipment.shipment_code,
      publicStatusLabel: workflowSummary?.currentPublicLabel || publicStatus.label,
      publicStatusDescription: workflowSummary?.publicNote || publicStatus.description,
      origin: shipment.origin,
      destination: shipment.destination,
      estimatedDelivery: shipment.estimated_delivery_at,
      lastPublicUpdate,
      currentPublicPhase: workflowSummary?.currentPublicPhase || "",
      currentPublicLabel: workflowSummary?.currentPublicLabel || publicStatus.label,
      completedPublicStepsCount: workflowSummary?.completedPublicStepsCount || 0,
      totalPublicStepsCount: workflowSummary?.totalPublicStepsCount || stepsResult.rows.length,
      publicNote: workflowSummary?.publicNote || "",
    },
    steps: legacyPublicSteps,
    documents: docsResult.rows.map((row) => toPublicDocument(row, token)),
    company: publicCompanyFromShipment(shipment),
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
     LIMIT 1`,
    [tokenHash]
  );
  const shipment = result.rows[0];
  if (!shipment) return null;
  return buildPublicShipmentPayload(queryable, shipment.id, token);
}

export async function searchPublicTracking(queryable, { shipmentCode, verification }) {
  if (!shipmentCode || !verification) return null;
  const normalizedVerification = String(verification).trim().toLowerCase();
  const result = await queryable.query(
    `SELECT s.id
     FROM shipments s
     LEFT JOIN customers c ON c.id = s.customer_id
     WHERE lower(s.shipment_code) = lower($1)
       AND s.customer_access_enabled = TRUE
       AND (
         lower(COALESCE(c.email, '')) = $2
         OR regexp_replace(COALESCE(c.phone, ''), '\\D', '', 'g') = regexp_replace($2, '\\D', '', 'g')
         OR lower(COALESCE(s.legacy_data->>'customerEmail', '')) = $2
         OR regexp_replace(COALESCE(s.legacy_data->>'customerPhone', ''), '\\D', '', 'g') = regexp_replace($2, '\\D', '', 'g')
       )
     LIMIT 1`,
    [shipmentCode, normalizedVerification]
  );
  const shipment = result.rows[0];
  if (!shipment) return null;
  return buildPublicShipmentPayload(queryable, shipment.id);
}

export async function getPublicDocument(queryable, documentId) {
  const result = await queryable.query(
    `SELECT d.id, d.title, d.file_name, d.mime_type, d.file_size, d.storage_key, d.legacy_data
     FROM documents d
     JOIN shipments s ON s.id = d.shipment_id
     WHERE d.id = $1
       AND (d.organization_id = s.organization_id OR d.organization_id IS NULL)
       AND d.visibility = 'customer_visible'
       AND d.archived_at IS NULL
       AND s.customer_access_enabled = TRUE
     LIMIT 1`,
    [documentId]
  );
  return result.rows[0] || null;
}

export async function getPublicDocumentByTrackingToken(queryable, token, documentId) {
  if (!token || String(token).length < 24) return null;
  const tokenHash = hashCustomerAccessToken(token);
  const result = await queryable.query(
    `SELECT d.id, d.title, d.file_name, d.mime_type, d.file_size, d.storage_key, d.legacy_data
     FROM documents d
     JOIN shipments s ON s.id = d.shipment_id
     WHERE d.id = $1
       AND (d.organization_id = s.organization_id OR d.organization_id IS NULL)
       AND d.visibility = 'customer_visible'
       AND d.archived_at IS NULL
       AND s.customer_access_token_hash = $2
       AND s.customer_access_enabled = TRUE
     LIMIT 1`,
    [documentId, tokenHash]
  );
  return result.rows[0] || null;
}
