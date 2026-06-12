import { organizationScopeClause, requireOrganizationScope } from "../tenant-scope.js";

export function toUiQuote(row, { includeCustomerPrivateDetails = true } = {}) {
  if (!row) return null;
  const legacy = row.legacy_data || {};
  const quote = {
    id: row.id,
    customerId: row.customer_id || legacy.customerId || undefined,
    customerName: row.customer_name || legacy.customerName || "",
    customerPhone: row.customer_phone || legacy.customerPhone || "",
    originCity: row.origin_city || legacy.originCity || "",
    destinationCity: row.destination_city || legacy.destinationCity || "",
    cargoType: row.cargo_type || legacy.cargoType || "GENERAL",
    weight: Number(row.weight || legacy.weight || 0),
    dimensions: row.dimensions || legacy.dimensions || "",
    pickupDate: row.pickup_date || legacy.pickupDate || "",
    deliveryDate: row.delivery_date || legacy.deliveryDate || "",
    requirements: Array.isArray(row.requirements) ? row.requirements : legacy.requirements || [],
    baseRate: Number(row.base_rate || legacy.baseRate || 0),
    fuelSurcharge: Number(row.fuel_surcharge || legacy.fuelSurcharge || 0),
    loadingFees: Number(row.loading_fees || legacy.loadingFees || 0),
    tollFees: Number(row.toll_fees || legacy.tollFees || 0),
    insurancePercentage: Number(row.insurance_percentage || legacy.insurancePercentage || 0),
    profitMargin: Number(row.profit_margin || legacy.profitMargin || 0),
    totalPrice: Number(row.total_price || legacy.totalPrice || 0),
    validUntil: row.valid_until || legacy.validUntil || "",
    status: row.status || legacy.status || "PENDING",
    notes: row.notes || legacy.notes || "",
    createdAt: row.created_at || legacy.createdAt || new Date().toISOString(),
    convertedShipmentId: row.converted_shipment_id || legacy.convertedShipmentId || undefined,
    isArchived: Boolean(row.archived_at),
  };
  if (includeCustomerPrivateDetails) return quote;
  return { ...quote, customerPhone: "" };
}

export async function listQuotations(
  pool,
  {
    ownerUserId,
    customerId,
    organizationId,
    includeArchived = false,
    includeCustomerPrivateDetails = true,
  } = {}
) {
  const conditions = [];
  const values = [];
  const scopedOrganizationId = requireOrganizationScope(organizationId, "listQuotations");
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
  const result = await pool.query(`SELECT * FROM quotations ${where} ORDER BY updated_at DESC`, values);
  return result.rows.map((row) => toUiQuote(row, { includeCustomerPrivateDetails }));
}

export async function getQuotationRecord(pool, id, { organizationId, includeCustomerPrivateDetails = true } = {}) {
  const values = [id];
  const organizationFilter = organizationScopeClause(values, organizationId, "organization_id", "getQuotationRecord");
  const result = await pool.query(`SELECT * FROM quotations WHERE id = $1 ${organizationFilter} LIMIT 1`, values);
  return toUiQuote(result.rows[0], { includeCustomerPrivateDetails });
}
