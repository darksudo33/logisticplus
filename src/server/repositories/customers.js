import { organizationScopeClause } from "../tenant-scope.js";

function toUiCustomer(row) {
  if (!row) return null;
  const legacy = row.legacy_data || {};
  return {
    id: row.id,
    name: row.contact_name || legacy.name || row.company_name,
    company: row.company_name || legacy.company || "",
    phone: row.phone || legacy.phone || "",
    email: row.email || legacy.email || "",
    address: row.address || legacy.address || "",
    shipmentsCount: Number(legacy.shipmentsCount || 0),
    createdAt: row.created_at || legacy.createdAt || new Date().toISOString(),
    notes: row.notes || legacy.notes || "",
    status: row.status || legacy.status || "active",
    isArchived: Boolean(row.archived_at),
  };
}

export async function listCustomersDetailed(pool, { includeArchived = false, search = "", organizationId } = {}) {
  const values = [];
  const conditions = [
    organizationScopeClause(values, organizationId, "c.organization_id", "listCustomersDetailed").replace(/^AND\s+/, ""),
  ];
  if (!includeArchived) conditions.push("c.archived_at IS NULL");
  if (search) {
    values.push(`%${String(search).toLowerCase()}%`);
    conditions.push(
      `(lower(c.company_name) LIKE $${values.length} OR lower(COALESCE(c.contact_name, '')) LIKE $${values.length} OR lower(COALESCE(c.email, '')) LIKE $${values.length} OR lower(COALESCE(c.phone, '')) LIKE $${values.length})`
    );
  }

  const result = await pool.query(
    `SELECT c.*, COUNT(s.id)::int AS shipment_count
     FROM customers c
     LEFT JOIN shipments s
       ON s.customer_id = c.id
      AND s.organization_id = c.organization_id
      AND s.archived_at IS NULL
     WHERE ${conditions.join(" AND ")}
     GROUP BY c.id
     ORDER BY c.updated_at DESC`,
    values
  );
  return result.rows.map((row) => ({
    ...toUiCustomer({ ...row, legacy_data: { ...(row.legacy_data || {}), shipmentsCount: row.shipment_count } }),
    duplicateWarning: false,
  }));
}

export async function getCustomerRecord(pool, id, { organizationId } = {}) {
  const values = [id];
  const organizationFilter = organizationScopeClause(values, organizationId, "organization_id", "getCustomerRecord");
  const result = await pool.query(
    `SELECT * FROM customers WHERE id = $1 ${organizationFilter} LIMIT 1`,
    values
  );
  return toUiCustomer(result.rows[0]);
}
