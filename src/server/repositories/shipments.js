import { organizationScopeClause, requireOrganizationScope } from "../tenant-scope.js";
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

export function toExitedShipment(row) {
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

export async function listExitedShipmentRecords(
  pool,
  {
    organizationId,
    filters = {},
  } = {}
) {
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
