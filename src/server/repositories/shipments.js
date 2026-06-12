import { organizationScopeClause } from "../tenant-scope.js";
import { DEFAULT_SHIPMENT_TYPE_CODE } from "../../shared/shipment-form-fields.js";

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

export function toUiShipment(row, { includeCustomerPrivateDetails = true } = {}) {
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

export async function listBootstrapShipments(
  pool,
  ownerUserId,
  organizationId,
  { includeCustomerPrivateDetails = true } = {}
) {
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

export async function listShipmentRecords(pool, { organizationId, includeExited = false } = {}) {
  const values = [];
  const organizationFilter = organizationScopeClause(values, organizationId, "s.organization_id", "listShipmentRecords").replace(/^AND\s+/, "");
  const exitedFilter = includeExited ? "" : " AND exited_archived_at IS NULL";
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
     WHERE ${organizationFilter}${exitedFilter}
     ORDER BY COALESCE(p.updated_at, s.updated_at) DESC, s.created_at DESC`,
    values
  );
  return result.rows;
}

export async function getShipmentRecord(pool, shipmentId, { organizationId } = {}) {
  const values = [shipmentId];
  const organizationFilter = organizationScopeClause(values, organizationId, "s.organization_id", "getShipmentRecord");
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
     WHERE s.id = $1 ${organizationFilter}
     LIMIT 1`,
    values
  );
  return result.rows[0] || null;
}

export async function listOperationalShipmentRecords(
  pool,
  { organizationId, includeCustomerPrivateDetails = true } = {}
) {
  const rows = await listShipmentRecords(pool, { organizationId });
  return rows.map((row) => toUiShipment(row, { includeCustomerPrivateDetails }));
}

export async function getShipmentOperationalRecord(
  pool,
  shipmentId,
  { organizationId, includeCustomerPrivateDetails = true } = {}
) {
  const row = await getShipmentRecord(pool, shipmentId, { organizationId });
  return toUiShipment(row, { includeCustomerPrivateDetails });
}
