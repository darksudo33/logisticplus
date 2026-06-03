import { organizationScopeClause } from "../tenant-scope.js";

export function canViewCustomerPrivateDetails(user) {
  return String(user?.role || user || "").toUpperCase() === "CEO";
}

export function toUiCustomer(row, { includePrivateDetails = true } = {}) {
  if (!row) return null;
  const legacy = row.legacy_data || {};
  const customer = {
    id: row.id,
    organization_id: row.organization_id || legacy.organization_id || legacy.organizationId || undefined,
    organizationId: row.organization_id || legacy.organizationId || legacy.organization_id || undefined,
    name: row.contact_name || legacy.name || row.company_name,
    company: row.company_name || legacy.company || "",
    phone: row.phone || legacy.phone || "",
    email: row.email || legacy.email || "",
    address: row.address || legacy.address || "",
    referrer: row.referrer || legacy.referrer || "",
    shipmentsCount: Number(legacy.shipmentsCount || 0),
    createdAt: row.created_at || legacy.createdAt || new Date().toISOString(),
    notes: row.notes || legacy.notes || "",
    status: row.status || legacy.status || "active",
    isArchived: Boolean(row.archived_at),
    canViewPrivateDetails: Boolean(includePrivateDetails),
  };
  if (includePrivateDetails) return customer;
  return {
    ...customer,
    phone: "",
    email: "",
    address: "",
    referrer: "",
    notes: "",
    canViewPrivateDetails: false,
  };
}

export async function listCustomersDetailed(pool, { includeArchived = false, search = "", organizationId, includePrivateDetails = true } = {}) {
  const values = [];
  const conditions = [
    organizationScopeClause(values, organizationId, "c.organization_id", "listCustomersDetailed").replace(/^AND\s+/, ""),
  ];
  if (!includeArchived) conditions.push("c.archived_at IS NULL");
  if (search) {
    values.push(`%${String(search).toLowerCase()}%`);
    const searchFields = [
      "lower(c.company_name)",
      "lower(COALESCE(c.contact_name, ''))",
    ];
    if (includePrivateDetails) {
      searchFields.push(
        "lower(COALESCE(c.email, ''))",
        "lower(COALESCE(c.phone, ''))",
        "lower(COALESCE(c.address, ''))",
        "lower(COALESCE(c.referrer, ''))",
        "lower(COALESCE(c.notes, ''))"
      );
    }
    conditions.push(`(${searchFields.map((field) => `${field} LIKE $${values.length}`).join(" OR ")})`);
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
    ...toUiCustomer(
      { ...row, legacy_data: { ...(row.legacy_data || {}), shipmentsCount: row.shipment_count } },
      { includePrivateDetails }
    ),
    duplicateWarning: false,
  }));
}

export async function getCustomerRecord(pool, id, { organizationId, includePrivateDetails = true } = {}) {
  const values = [id];
  const organizationFilter = organizationScopeClause(values, organizationId, "organization_id", "getCustomerRecord");
  const result = await pool.query(
    `SELECT * FROM customers WHERE id = $1 ${organizationFilter} LIMIT 1`,
    values
  );
  return toUiCustomer(result.rows[0], { includePrivateDetails });
}
