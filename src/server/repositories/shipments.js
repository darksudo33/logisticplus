import { organizationScopeClause } from "../tenant-scope.js";

export async function listShipmentRecords(pool, { organizationId, includeExited = false } = {}) {
  const values = [];
  const organizationFilter = organizationScopeClause(values, organizationId, "organization_id", "listShipmentRecords").replace(/^AND\s+/, "");
  const exitedFilter = includeExited ? "" : " AND exited_archived_at IS NULL";
  const result = await pool.query(
    `SELECT *
     FROM shipments
     WHERE ${organizationFilter}${exitedFilter}
     ORDER BY updated_at DESC, created_at DESC`,
    values
  );
  return result.rows;
}

export async function getShipmentRecord(pool, shipmentId, { organizationId } = {}) {
  const values = [shipmentId];
  const organizationFilter = organizationScopeClause(values, organizationId, "organization_id", "getShipmentRecord");
  const result = await pool.query(
    `SELECT * FROM shipments WHERE id = $1 ${organizationFilter} LIMIT 1`,
    values
  );
  return result.rows[0] || null;
}
