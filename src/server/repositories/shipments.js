import { organizationScopeClause } from "../tenant-scope.js";

export async function listShipmentRecords(pool, { organizationId } = {}) {
  const values = [];
  const organizationFilter = organizationScopeClause(values, organizationId, "organization_id", "listShipmentRecords").replace(/^AND\s+/, "");
  const result = await pool.query(
    `SELECT *
     FROM shipments
     WHERE ${organizationFilter}
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
