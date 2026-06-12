import { organizationScopeClause } from "../tenant-scope.js";

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
