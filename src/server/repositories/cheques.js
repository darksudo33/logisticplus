import { organizationScopeClause, requireOrganizationScope } from "../tenant-scope.js";

export function toUiCheque(row) {
  if (!row) return null;
  const legacy = row.legacy_data || {};
  return {
    id: row.id,
    bankName: row.bank_name || legacy.bankName || "",
    chequeNumber: row.cheque_number || legacy.chequeNumber || "",
    amount: Number(row.amount || legacy.amount || 0),
    dueDate: row.due_date || legacy.dueDate || "",
    location: row.location || legacy.location || "",
    receiver: row.receiver || legacy.receiver || "",
    status: row.status || legacy.status || "ACTIVE",
    description: row.description || legacy.description || "",
    createdAt: row.created_at || legacy.createdAt || new Date().toISOString(),
  };
}

export async function listCheques(
  pool,
  { ownerUserId, customerId, organizationId, includeArchived = false, includeCreatedAtTieBreaker = true } = {}
) {
  const conditions = [];
  const values = [];
  const scopedOrganizationId = requireOrganizationScope(organizationId, "listCheques");
  values.push(scopedOrganizationId);
  conditions.push(`organization_id = $${values.length}`);
  if (ownerUserId) {
    values.push(ownerUserId);
    conditions.push(`owner_user_id = $${values.length}`);
  }
  if (customerId) {
    values.push(customerId);
    conditions.push(`customer_id = $${values.length}`);
  }
  if (!includeArchived) conditions.push("archived_at IS NULL");
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const orderBy = includeCreatedAtTieBreaker ? "updated_at DESC, created_at DESC" : "updated_at DESC";
  const result = await pool.query(
    `SELECT *
     FROM cheques
     ${where}
     ORDER BY ${orderBy}`,
    values
  );
  return result.rows.map(toUiCheque);
}

export async function getChequeRecord(pool, id, { organizationId } = {}) {
  const values = [id];
  const organizationFilter = organizationScopeClause(values, organizationId, "organization_id", "getChequeRecord");
  const result = await pool.query(`SELECT * FROM cheques WHERE id = $1 ${organizationFilter} LIMIT 1`, values);
  return result.rows[0] || null;
}
