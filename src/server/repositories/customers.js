import { organizationScopeClause, requireOrganizationScope } from "../tenant-scope.js";
import { listCheques } from "./cheques.js";
import { listDocuments } from "./documents.js";
import { listQuotations } from "./quotations.js";
import { shipmentTimerOrderBy } from "./shipment-sort.js";

export function canViewCustomerPrivateDetails(user) {
  return String(user?.role || user || "").toUpperCase() === "CEO";
}

export function customerDisplayCode(row) {
  if (!row) return "";
  const legacy = row.legacy_data || {};
  return row.customer_code || legacy.customerCode || legacy.customer_code || row.id || "";
}

export function toCustomerPhoneNumber(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id || undefined,
    customerId: row.customer_id || undefined,
    phoneNumber: row.phone_number || "",
    phoneLabel: row.phone_label || "",
    note: row.note || "",
    isPrimary: Boolean(row.is_primary),
    sortOrder: Number(row.sort_order || 0),
    archivedAt: row.archived_at || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

export async function listCustomerPhoneNumbers(pool, { organizationId, customerId, includeArchived = false } = {}) {
  if (!customerId) return [];
  const values = [customerId];
  const organizationFilter = organizationScopeClause(values, organizationId, "organization_id", "listCustomerPhoneNumbers");
  const archivedFilter = includeArchived ? "" : " AND archived_at IS NULL";
  const result = await pool.query(
    `SELECT *
     FROM customer_phone_numbers
     WHERE customer_id = $1 ${organizationFilter}${archivedFilter}
     ORDER BY is_primary DESC, sort_order ASC, created_at ASC`,
    values
  );
  return result.rows.map(toCustomerPhoneNumber).filter(Boolean);
}

async function phoneNumbersForCustomers(pool, { organizationId, customerIds = [] } = {}) {
  const ids = [...new Set(customerIds.filter(Boolean))];
  if (!ids.length) return new Map();
  const values = [ids];
  const organizationFilter = organizationScopeClause(values, organizationId, "organization_id", "phoneNumbersForCustomers");
  const result = await pool.query(
    `SELECT *
     FROM customer_phone_numbers
     WHERE customer_id = ANY($1::text[]) ${organizationFilter}
       AND archived_at IS NULL
     ORDER BY customer_id ASC, is_primary DESC, sort_order ASC, created_at ASC`,
    values
  );
  const map = new Map();
  for (const row of result.rows) {
    const phone = toCustomerPhoneNumber(row);
    if (!phone) continue;
    if (!map.has(phone.customerId)) map.set(phone.customerId, []);
    map.get(phone.customerId).push(phone);
  }
  return map;
}

export function toUiCustomer(row, { includePrivateDetails = true, phoneNumbers = undefined } = {}) {
  if (!row) return null;
  const legacy = row.legacy_data || {};
  const customerCode = customerDisplayCode(row);
  const activePhoneNumbers = Array.isArray(phoneNumbers)
    ? phoneNumbers.filter((phone) => !phone.archivedAt)
    : [];
  const primaryPhone = activePhoneNumbers.find((phone) => phone.isPrimary)?.phoneNumber ||
    activePhoneNumbers[0]?.phoneNumber ||
    row.phone ||
    legacy.phone ||
    "";
  const customer = {
    id: row.id,
    organization_id: row.organization_id || legacy.organization_id || legacy.organizationId || undefined,
    organizationId: row.organization_id || legacy.organizationId || legacy.organization_id || undefined,
    customerCode,
    code: customerCode,
    name: row.contact_name || legacy.name || row.company_name,
    company: row.company_name || legacy.company || "",
    phone: primaryPhone,
    phoneNumbers: activePhoneNumbers,
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
    name: customerCode,
    company: customerCode,
    phone: "",
    phoneNumbers: [],
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
      "lower(c.customer_code)",
      "lower(c.id)",
    ];
    if (includePrivateDetails) {
      searchFields.push(
        "lower(c.company_name)",
        "lower(COALESCE(c.contact_name, ''))",
        "lower(COALESCE(c.email, ''))",
        "lower(COALESCE(c.phone, ''))",
        "lower(COALESCE(c.address, ''))",
        "lower(COALESCE(c.referrer, ''))",
        "lower(COALESCE(c.notes, ''))",
        `EXISTS (
          SELECT 1
          FROM customer_phone_numbers cpn
          WHERE cpn.customer_id = c.id
            AND cpn.organization_id = c.organization_id
            AND cpn.archived_at IS NULL
            AND lower(COALESCE(cpn.phone_number, '')) LIKE $${values.length}
        )`
      );
    }
    conditions.push(`(${searchFields.map((field) => field.includes("SELECT 1") ? field : `${field} LIKE $${values.length}`).join(" OR ")})`);
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
     ORDER BY
       substring(COALESCE(c.customer_code, c.id, '') from '([0-9]+)$')::bigint ASC NULLS LAST,
       lower(COALESCE(c.customer_code, c.id, '')) ASC,
       c.created_at ASC`,
    values
  );
  const phonesByCustomer = includePrivateDetails
    ? await phoneNumbersForCustomers(pool, {
        organizationId,
        customerIds: result.rows.map((row) => row.id),
      })
    : new Map();
  return result.rows.map((row) => ({
    ...toUiCustomer(
      { ...row, legacy_data: { ...(row.legacy_data || {}), shipmentsCount: row.shipment_count } },
      { includePrivateDetails, phoneNumbers: phonesByCustomer.get(row.id) || [] }
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
  const row = result.rows[0];
  if (!row) return null;
  const phoneNumbers = includePrivateDetails
    ? await listCustomerPhoneNumbers(pool, { organizationId, customerId: row.id })
    : [];
  return toUiCustomer(row, { includePrivateDetails, phoneNumbers });
}

function toCustomerRelatedShipment(row) {
  const legacy = row.legacy_data || {};
  return {
    id: row.id,
    trackingNumber: row.shipment_code,
    containerNumber: legacy.containerNumber || "",
    customerId: row.customer_id,
    customerName: row.customer_name,
    status: row.status,
    origin: row.origin,
    destination: row.destination,
    estimatedDelivery: row.estimated_delivery_at,
    isArchived: Boolean(row.archived_at),
    createdAt: row.created_at,
  };
}

export async function listCustomerRelated(pool, id, type, { organizationId, includePrivateDetails = true } = {}) {
  const scopedOrganizationId = requireOrganizationScope(organizationId, "listCustomerRelated");
  if (!(await getCustomerRecord(pool, id, { organizationId }))) return null;
  if (type === "shipments") {
    const result = await pool.query(
      `SELECT * FROM shipments s
       WHERE customer_id = $1 AND organization_id = $2
         AND exited_archived_at IS NULL
       ORDER BY ${shipmentTimerOrderBy("s")}`,
      [id, scopedOrganizationId]
    );
    return result.rows.map(toCustomerRelatedShipment);
  }
  if (type === "documents") {
    return listDocuments(pool, { customerId: id, organizationId, includeArchived: true });
  }
  if (type === "quotations") {
    return listQuotations(pool, {
      customerId: id,
      organizationId,
      includeArchived: true,
      includeCustomerPrivateDetails: includePrivateDetails,
    });
  }
  if (type === "cheques") {
    return listCheques(pool, {
      customerId: id,
      organizationId,
      includeArchived: true,
      includeCreatedAtTieBreaker: false,
    });
  }
  return [];
}
