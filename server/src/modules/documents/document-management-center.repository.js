import { requireOrganizationScope } from "../../shared/middleware/tenant.middleware.js";
import { normalizeShipmentStatus } from "../../../../src/shared/shipment-statuses.js";

const DEFAULT_SEARCH_LIMIT = 12;

function escapeLike(value) {
  return String(value || "").replace(/[\\%_]/g, (match) => `\\${match}`);
}

function normalizeLimit(limit) {
  const numberValue = Number(limit || DEFAULT_SEARCH_LIMIT);
  if (!Number.isFinite(numberValue)) return DEFAULT_SEARCH_LIMIT;
  return Math.min(Math.max(Math.trunc(numberValue), 1), 25);
}

function toSearchResult(row, { includeCustomerPrivateDetails = true } = {}) {
  if (!row) return null;
  const customerCode = row.customer_code || row.customer_id || "";
  return {
    id: row.id,
    trackingNumber: row.shipment_code || row.id,
    customerId: row.customer_id || "",
    customerCode,
    customerName: customerCode,
    status: normalizeShipmentStatus(row.status),
    shipmentDirection: row.shipment_direction || "import",
    transportMode: row.transport_mode || "",
    shipmentTypeCode: row.shipment_type_code || "",
    origin: row.origin || "",
    destination: row.destination || "",
    profileFlowCode: row.profile_flow_code || null,
    currentStage: row.current_stage || "",
    documentCount: Number(row.document_count || 0),
    latestDocumentAt: row.latest_document_at || null,
    updatedAt: row.updated_at || null,
  };
}

export async function searchDocumentManagementShipments(pool, {
  organizationId,
  query,
  limit = DEFAULT_SEARCH_LIMIT,
  includeCustomerPrivateDetails = true,
} = {}) {
  const scopedOrganizationId = requireOrganizationScope(organizationId, "searchDocumentManagementShipments");
  const searchTerm = String(query || "").trim();
  if (searchTerm.length < 2) return [];

  const likeTerm = `%${escapeLike(searchTerm)}%`;
  const resultLimit = normalizeLimit(limit);
  const privateCustomerSearch = includeCustomerPrivateDetails
    ? `
         OR s.customer_name ILIKE $3 ESCAPE '\\'
         OR c.company_name ILIKE $3 ESCAPE '\\'
         OR c.contact_name ILIKE $3 ESCAPE '\\'`
    : "";
  const result = await pool.query(
    `SELECT
       s.id,
       s.shipment_code,
       s.customer_id,
       s.customer_name,
       s.status,
       s.shipment_direction,
       s.transport_mode,
       s.shipment_type_code,
       s.origin,
       s.destination,
       s.updated_at,
       c.customer_code,
       c.company_name AS customer_company_name,
       c.contact_name AS customer_contact_name,
       p.flow_code AS profile_flow_code,
       p.sections_json #>> '{base,currentStage}' AS current_stage,
       COALESCE(document_summary.document_count, 0) AS document_count,
       document_summary.latest_document_at
     FROM shipments s
     LEFT JOIN customers c
       ON c.id = s.customer_id
      AND c.organization_id = s.organization_id
      AND c.archived_at IS NULL
     LEFT JOIN shipment_v2_profiles p
       ON p.shipment_id = s.id
      AND p.organization_id = s.organization_id
     LEFT JOIN LATERAL (
       SELECT
         COUNT(*)::int AS document_count,
         MAX(d.updated_at) AS latest_document_at
       FROM documents d
       WHERE d.organization_id = s.organization_id
         AND d.shipment_id = s.id
         AND d.archived_at IS NULL
     ) document_summary ON TRUE
     WHERE s.organization_id = $1
       AND s.archived_at IS NULL
       AND (
         s.id = $2
         OR s.shipment_code ILIKE $3 ESCAPE '\\'
         OR c.customer_code ILIKE $3 ESCAPE '\\'
         ${privateCustomerSearch}
         OR p.sections_json #>> '{base,orderRegistrationNumber}' ILIKE $3 ESCAPE '\\'
         OR p.sections_json #>> '{base,commercialCardDisplayName}' ILIKE $3 ESCAPE '\\'
         OR p.sections_json #>> '{base,malvaniDisplayName}' ILIKE $3 ESCAPE '\\'
       )
     ORDER BY
       CASE
         WHEN s.id = $2 THEN 0
         WHEN s.shipment_code = $2 THEN 1
         WHEN s.shipment_code ILIKE $4 ESCAPE '\\' THEN 2
         ELSE 3
       END,
       s.updated_at DESC
     LIMIT $5`,
    [scopedOrganizationId, searchTerm, likeTerm, `${escapeLike(searchTerm)}%`, resultLimit]
  );

  return result.rows.map((row) => toSearchResult(row, { includeCustomerPrivateDetails })).filter(Boolean);
}
