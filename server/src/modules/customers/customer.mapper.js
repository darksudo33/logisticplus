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
