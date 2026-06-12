import { listCustomerPhoneNumbers } from "../repositories/customers.js";

const CEO_ONLY_MESSAGE = "دسترسی به همیار لاجستیک در حال حاضر فقط برای مدیرعامل فعال است.";
const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

function forbidden(message = CEO_ONLY_MESSAGE) {
  const error = new Error(message);
  error.statusCode = 403;
  error.code = "FORBIDDEN";
  return error;
}

function requireCeoToolContext(context = {}) {
  if (String(context.user?.role || "").toUpperCase() !== "CEO") {
    throw forbidden();
  }
  if (!context.organizationId) {
    throw forbidden("Active organization membership is required.");
  }
}

function normalizeDigits(value = "") {
  return String(value)
    .replace(/[۰-۹]/g, (digit) => String(PERSIAN_DIGITS.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String(ARABIC_DIGITS.indexOf(digit)));
}

export function normalizeAiLookupCode(value = "") {
  return normalizeDigits(value).trim();
}

function compactCode(value = "") {
  return normalizeAiLookupCode(value).replace(/[\s\-_/]+/g, "").toLowerCase();
}

function normalizeAiSearchText(value = "") {
  return normalizeAiLookupCode(value)
    .replace(/[يى]/g, "ی")
    .replace(/[ك]/g, "ک")
    .replace(/\u200c/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function safeLikePattern(value = "") {
  const normalized = normalizeAiLookupCode(value)
    .replace(/\u200c/g, " ")
    .replace(/[%_\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return normalized ? `%${normalized}%` : "";
}

function businessSearchTerms(queryTerms = []) {
  const sourceTerms = Array.isArray(queryTerms) ? queryTerms : [queryTerms];
  const seen = new Set();
  const terms = [];
  for (const item of sourceTerms) {
    const term = normalizeAiSearchText(item).replace(/[%_\\]/g, " ").replace(/\s+/g, " ").trim();
    if (!term || term.length < 2 || seen.has(term)) continue;
    seen.add(term);
    terms.push(term);
    if (terms.length >= 8) break;
  }
  return terms;
}

function maskBusinessNumber(value = "") {
  const text = cleanText(value);
  if (!text) return "";
  const digits = text.replace(/\D/g, "");
  if (digits.length < 6) return text;
  return `${text.slice(0, Math.max(0, text.length - 4)).replace(/[^\s-]/g, "•")}${text.slice(-4)}`;
}

function cleanText(value, fallback = "") {
  if (value === undefined || value === null) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function numberOrNull(value) {
  if (value === undefined || value === null || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function isoTimestamp(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

function jsonObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function customerDisplayName(row = {}) {
  return (
    cleanText(row.customer_company_name) ||
    cleanText(row.company_name) ||
    cleanText(row.customer_contact_name) ||
    cleanText(row.contact_name) ||
    cleanText(row.customer_name) ||
    cleanText(row.customer_code) ||
    cleanText(row.customer_id) ||
    ""
  );
}

function customerSummary(row = {}) {
  return {
    id: row.customer_id || row.id || "",
    customerCode: row.customer_code || row.id || "",
    companyName: row.company_name || row.customer_company_name || "",
    contactName: row.contact_name || row.customer_contact_name || "",
    phone: row.phone || "",
    status: row.status || "active",
    actionUrl: row.id ? `/customers/${row.id}` : "",
  };
}

function safePhoneNumbers(phoneNumbers = []) {
  if (!Array.isArray(phoneNumbers)) return [];
  return phoneNumbers
    .map((phone) => {
      const phoneNumber = cleanText(phone.phoneNumber);
      if (!phoneNumber) return null;
      return {
        phoneNumber,
        phoneLabel: cleanText(phone.phoneLabel),
        note: cleanText(phone.note),
        isPrimary: Boolean(phone.isPrimary),
      };
    })
    .filter(Boolean);
}

function shipmentSummary(row = {}) {
  return {
    id: row.id,
    shipmentCode: row.shipment_code || row.id,
    customerName: customerDisplayName(row),
    customerId: row.customer_id || "",
    customerCode: row.customer_code || "",
    malvaniProfileId: row.malvani_profile_id || "",
    commercialCardId: row.commercial_card_id || "",
    status: row.status || "PENDING",
    updatedAt: isoTimestamp(row.updated_at),
    actionUrl: `/shipments/${row.id}`,
  };
}

function safeGoodsRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.slice(0, 20).map((row) => ({
    description: cleanText(row?.description),
    tariffCode: cleanText(row?.tariffCode),
    tariffName: cleanText(row?.tariffName),
    packaging: cleanText(row?.packagingType),
    quantity: numberOrNull(row?.quantity),
    weight: numberOrNull(row?.weight),
    cbm: numberOrNull(row?.cbm),
    pcs: numberOrNull(row?.pcs),
  })).filter((row) => Object.values(row).some((value) => value !== "" && value !== null));
}

function definitionStepLabel(definition, code) {
  const steps = Array.isArray(definition?.steps) ? definition.steps : [];
  const step = steps.find((item) => String(item.code || item.stepKey || "") === String(code || ""));
  return cleanText(step?.labelFa) || cleanText(step?.publicLabel) || cleanText(code);
}

function definitionBlockerLabel(definition, code) {
  const blockers = Array.isArray(definition?.blockers) ? definition.blockers : [];
  const blocker = blockers.find((item) => String(item.code || "") === String(code || ""));
  return cleanText(blocker?.labelFa) || cleanText(code);
}

export async function resolveShipmentRef(pool, context, { text = "", shipmentRef = "", limit = 5 } = {}) {
  requireCeoToolContext(context);
  const ref = normalizeAiLookupCode(shipmentRef || text).trim();
  const compact = compactCode(ref);
  if (!ref || !compact) return [];
  const boundedLimit = Math.min(Math.max(Number(limit) || 5, 1), 5);
  const fuzzyRef = ref.length >= 3 ? `%${ref}%` : ref;
  const result = await pool.query(
    `SELECT
       s.id,
       s.shipment_code,
       s.customer_id,
       s.customer_name,
       s.status,
       s.estimated_delivery_at,
       s.updated_at,
       c.customer_code,
       c.company_name AS customer_company_name,
       c.contact_name AS customer_contact_name,
       p.sections_json #>> '{base,currentStage}' AS current_stage,
       p.sections_json #>> '{base,statusText}' AS status_text,
       p.sections_json #>> '{base,commercialCardId}' AS commercial_card_id
     FROM shipments s
     LEFT JOIN customers c
       ON c.id = s.customer_id
      AND c.organization_id = s.organization_id
      AND c.archived_at IS NULL
     LEFT JOIN shipment_v2_profiles p
       ON p.shipment_id = s.id
      AND p.organization_id = s.organization_id
     WHERE s.organization_id = $1
       AND s.archived_at IS NULL
       AND s.exited_archived_at IS NULL
       AND (
         lower(s.id) = lower($2)
         OR lower(s.shipment_code) = lower($2)
         OR lower(COALESCE(s.legacy_data->>'trackingNumber', '')) = lower($2)
         OR lower(COALESCE(s.legacy_data->>'referenceNumber', '')) = lower($2)
         OR regexp_replace(lower(COALESCE(s.shipment_code, '')), '[^a-z0-9]', '', 'g') = $3
         OR ($4 <> $2 AND (
           s.shipment_code ILIKE $4
           OR s.customer_name ILIKE $4
           OR c.customer_code ILIKE $4
           OR c.company_name ILIKE $4
           OR c.contact_name ILIKE $4
         ))
       )
     ORDER BY
       CASE
         WHEN lower(s.shipment_code) = lower($2) THEN 0
         WHEN regexp_replace(lower(COALESCE(s.shipment_code, '')), '[^a-z0-9]', '', 'g') = $3 THEN 1
         WHEN lower(s.id) = lower($2) THEN 2
         ELSE 3
       END,
       s.updated_at DESC,
       s.created_at DESC
     LIMIT $5`,
    [context.organizationId, ref, compact, fuzzyRef, boundedLimit]
  );
  return result.rows.map((row) => ({
    ...shipmentSummary(row),
    currentStatus: cleanText(row.status_text) || cleanText(row.current_stage) || cleanText(row.status),
    estimatedDelivery: cleanText(row.estimated_delivery_at),
  }));
}

export async function searchShipmentByCode(pool, context, { shipmentCode } = {}) {
  requireCeoToolContext(context);
  const code = normalizeAiLookupCode(shipmentCode);
  const compact = compactCode(code);
  if (!code || !compact) return null;

  const result = await pool.query(
    `SELECT
       s.id,
       s.shipment_code,
       s.customer_id,
       s.customer_name,
       s.status,
       s.updated_at,
       c.customer_code,
       c.company_name AS customer_company_name,
       c.contact_name AS customer_contact_name
     FROM shipments s
     LEFT JOIN customers c
       ON c.id = s.customer_id
      AND c.organization_id = s.organization_id
      AND c.archived_at IS NULL
     WHERE s.organization_id = $1
       AND s.archived_at IS NULL
       AND s.exited_archived_at IS NULL
       AND (
         lower(s.id) = lower($2)
         OR lower(s.shipment_code) = lower($2)
         OR lower(COALESCE(s.legacy_data->>'trackingNumber', '')) = lower($2)
         OR lower(COALESCE(s.legacy_data->>'referenceNumber', '')) = lower($2)
         OR regexp_replace(lower(s.shipment_code), '[^a-z0-9]', '', 'g') = $3
       )
     ORDER BY
       CASE
         WHEN lower(s.shipment_code) = lower($2) THEN 0
         WHEN regexp_replace(lower(s.shipment_code), '[^a-z0-9]', '', 'g') = $3 THEN 1
         ELSE 2
       END,
       s.updated_at DESC
     LIMIT 5`,
    [context.organizationId, code, compact]
  );

  return result.rows[0] ? shipmentSummary(result.rows[0]) : null;
}

export async function getShipmentFullProfile(pool, context, { shipmentId } = {}) {
  requireCeoToolContext(context);
  if (!shipmentId) return null;

  const result = await pool.query(
    `SELECT
       s.id,
       s.shipment_code,
       s.customer_id,
       s.customer_name,
       s.status,
       s.priority,
       s.origin,
       s.destination,
       s.estimated_delivery_at,
       s.free_time_ends_at,
       s.customer_access_enabled,
       s.current_step_id,
       s.legacy_data,
       s.updated_at,
       c.customer_code,
       c.company_name AS customer_company_name,
       c.contact_name AS customer_contact_name,
       p.flow_code,
       p.sections_json,
       latest_public.public_label AS latest_public_label,
       latest_public.public_description AS latest_public_description,
       latest_public.created_at AS latest_public_at
     FROM shipments s
     LEFT JOIN customers c
       ON c.id = s.customer_id
      AND c.organization_id = s.organization_id
      AND c.archived_at IS NULL
     LEFT JOIN shipment_v2_profiles p
       ON p.shipment_id = s.id
      AND p.organization_id = s.organization_id
     LEFT JOIN LATERAL (
       SELECT public_label, public_description, created_at
       FROM shipment_status_events e
       WHERE e.shipment_id = s.id
         AND e.organization_id = s.organization_id
         AND e.is_customer_visible = TRUE
       ORDER BY e.created_at DESC
       LIMIT 1
     ) latest_public ON TRUE
     WHERE s.id = $1
       AND s.organization_id = $2
       AND s.archived_at IS NULL
       AND s.exited_archived_at IS NULL
     LIMIT 1`,
    [shipmentId, context.organizationId]
  );

  const row = result.rows[0];
  if (!row) return null;
  const sections = jsonObject(row.sections_json);
  const base = jsonObject(sections.base);
  const goods = jsonObject(sections.goods);
  const legacy = jsonObject(row.legacy_data);

  return {
    id: row.id,
    shipmentCode: row.shipment_code || row.id,
    customerId: row.customer_id || "",
    customerCode: row.customer_code || "",
    customerName: customerDisplayName(row),
    status: row.status || "PENDING",
    priority: row.priority || "normal",
    currentStep: cleanText(base.currentStage) || cleanText(row.current_step_id),
    currentStatus: cleanText(base.statusText) || cleanText(row.status),
    route: {
      origin: cleanText(base.origin) || cleanText(row.origin),
      dischargePort: cleanText(base.dischargePort),
      deliveryPort: cleanText(base.deliveryPort) || cleanText(row.destination),
      destination: cleanText(row.destination),
    },
    ports: {
      origin: cleanText(base.origin) || cleanText(row.origin),
      discharge: cleanText(base.dischargePort),
      delivery: cleanText(base.deliveryPort) || cleanText(row.destination),
    },
    parties: {
      consigneeName: cleanText(base.consigneeName),
      commercialCardId: cleanText(base.commercialCardId),
      commercialCardDisplayName: cleanText(base.commercialCardDisplayName),
      malvaniDisplayName: cleanText(base.malvaniDisplayName),
    },
    goodsRows: safeGoodsRows(goods.goodsRows || legacy.goodsRows),
    operationalDates: {
      shamsiDate: cleanText(legacy.shamsiDate),
      estimatedDelivery: cleanText(row.estimated_delivery_at),
      freeTimeEndsAt: cleanText(row.free_time_ends_at),
      latestPublicUpdateAt: isoTimestamp(row.latest_public_at),
    },
    publicTrackingStatus: {
      enabled: Boolean(row.customer_access_enabled),
      label: cleanText(row.latest_public_label) || cleanText(legacy.publicStatusLabel),
      description: cleanText(row.latest_public_description) || cleanText(legacy.publicStatusDescription),
    },
    updatedAt: isoTimestamp(row.updated_at),
    actionUrl: `/shipments/${row.id}`,
  };
}

export async function getShipmentCaptainInfo(pool, context, { shipmentId } = {}) {
  requireCeoToolContext(context);
  if (!shipmentId) return null;

  const profileResult = await pool.query(
    `SELECT sections_json
     FROM shipment_v2_profiles
     WHERE shipment_id = $1
       AND organization_id = $2
     LIMIT 1`,
    [shipmentId, context.organizationId]
  );
  const sections = jsonObject(profileResult.rows[0]?.sections_json);
  const base = jsonObject(sections.base);
  const malvaniProfileId = cleanText(base.malvaniProfileId);
  const malvaniDisplayName = cleanText(base.malvaniDisplayName);

  if (!malvaniProfileId) {
    return {
      malvaniProfileName: malvaniDisplayName,
      captainName: "",
      captainPhone: "",
      relatedContactLabel: "",
      missingData: {
        profile: !malvaniDisplayName,
        captainName: true,
        captainPhone: true,
      },
    };
  }

  const result = await pool.query(
    `SELECT
       mp.id,
       mp.display_name,
       mp.captain_name,
       mp.lenj_name,
       c.contact_name,
       c.role_title,
       c.phone_number,
       c.phone_label
     FROM malvani_profiles mp
     LEFT JOIN LATERAL (
       SELECT contact_name, role_title, phone_number, phone_label
       FROM business_entity_contacts
       WHERE organization_id = mp.organization_id
         AND entity_type = 'malvani'
         AND entity_id = mp.id
         AND archived_at IS NULL
       ORDER BY is_primary DESC, sort_order ASC, created_at ASC
       LIMIT 1
     ) c ON TRUE
     WHERE mp.organization_id = $1
       AND mp.id = $2
       AND mp.archived_at IS NULL
     LIMIT 1`,
    [context.organizationId, malvaniProfileId]
  );
  const row = result.rows[0];
  if (!row) {
    return {
      malvaniProfileName: malvaniDisplayName,
      captainName: "",
      captainPhone: "",
      relatedContactLabel: "",
      missingData: {
        profile: true,
        captainName: true,
        captainPhone: true,
      },
    };
  }

  const captainName = cleanText(row.captain_name) || cleanText(row.contact_name);
  const captainPhone = cleanText(row.phone_number);
  return {
    malvaniProfileName: cleanText(row.display_name) || cleanText(row.lenj_name) || malvaniDisplayName,
    captainName,
    captainPhone,
    relatedContactLabel: cleanText(row.phone_label) || cleanText(row.role_title),
    missingData: {
      profile: false,
      captainName: !captainName,
      captainPhone: !captainPhone,
    },
  };
}

export async function getShipmentWorkflowStatus(pool, context, { shipmentId } = {}) {
  requireCeoToolContext(context);
  if (!shipmentId) return null;

  const instanceResult = await pool.query(
    `SELECT *
     FROM shipment_workflow_instances
     WHERE shipment_id = $1
       AND organization_id = $2
       AND status <> 'cancelled'
     ORDER BY created_at DESC
     LIMIT 1`,
    [shipmentId, context.organizationId]
  );
  const instance = instanceResult.rows[0];
  if (!instance) {
    return {
      currentStep: null,
      currentStatus: "",
      blockers: [],
      updatedAt: "",
      missingData: { workflow: true },
    };
  }

  const definition = jsonObject(instance.workflow_definition_snapshot_json);
  const currentCode = cleanText(instance.current_step_code);
  const blockersResult = await pool.query(
    `SELECT blocker_code, status, updated_at
     FROM shipment_workflow_blockers
     WHERE workflow_instance_id = $1
       AND organization_id = $2
       AND status = 'open'
     ORDER BY created_at DESC
     LIMIT 10`,
    [instance.id, context.organizationId]
  );

  return {
    currentStep: currentCode
      ? {
        code: currentCode,
        label: definitionStepLabel(definition, currentCode),
      }
      : null,
    currentStatus: instance.status || "",
    blockers: blockersResult.rows.map((row) => ({
      code: row.blocker_code,
      label: definitionBlockerLabel(definition, row.blocker_code),
      status: row.status,
      updatedAt: isoTimestamp(row.updated_at),
    })),
    updatedAt: isoTimestamp(instance.updated_at),
    missingData: { workflow: false },
  };
}

export async function resolveCustomerRef(pool, context, { text = "", customerRef = "", limit = 5 } = {}) {
  requireCeoToolContext(context);
  const ref = normalizeAiLookupCode(customerRef || text).trim();
  const compact = compactCode(ref);
  if (!ref || !compact) return [];
  const boundedLimit = Math.min(Math.max(Number(limit) || 5, 1), 5);
  const fuzzyRef = ref.length >= 2 ? `%${ref}%` : ref;
  const result = await pool.query(
    `SELECT id, customer_code, company_name, contact_name, phone, status, updated_at
     FROM customers
     WHERE organization_id = $1
       AND archived_at IS NULL
       AND (
         lower(id) = lower($2)
         OR lower(COALESCE(customer_code, '')) = lower($2)
         OR regexp_replace(lower(COALESCE(customer_code, '')), '[^a-z0-9]', '', 'g') = $3
         OR ($4 <> $2 AND (
           company_name ILIKE $4
           OR contact_name ILIKE $4
           OR customer_code ILIKE $4
         ))
       )
     ORDER BY
       CASE
         WHEN lower(COALESCE(customer_code, '')) = lower($2) THEN 0
         WHEN regexp_replace(lower(COALESCE(customer_code, '')), '[^a-z0-9]', '', 'g') = $3 THEN 1
         WHEN lower(id) = lower($2) THEN 2
         ELSE 3
       END,
       updated_at DESC
     LIMIT $5`,
    [context.organizationId, ref, compact, fuzzyRef, boundedLimit]
  );
  return result.rows.map(customerSummary);
}

export async function searchCustomerByCode(pool, context, { customerCode } = {}) {
  requireCeoToolContext(context);
  const code = normalizeAiLookupCode(customerCode);
  const compact = compactCode(code);
  if (!code || !compact) return null;

  const result = await pool.query(
    `SELECT id, customer_code, company_name, contact_name, phone, status
     FROM customers
     WHERE organization_id = $1
       AND archived_at IS NULL
       AND (
         lower(id) = lower($2)
         OR lower(COALESCE(customer_code, '')) = lower($2)
         OR regexp_replace(lower(COALESCE(customer_code, '')), '[^a-z0-9]', '', 'g') = $3
       )
     ORDER BY updated_at DESC
     LIMIT 5`,
    [context.organizationId, code, compact]
  );

  return result.rows[0] ? customerSummary(result.rows[0]) : null;
}

export async function getCustomerProfile(pool, context, { customerId } = {}) {
  requireCeoToolContext(context);
  if (!customerId) return null;

  const result = await pool.query(
    `SELECT id, customer_code, company_name, contact_name, email, phone, address, referrer, notes, status
     FROM customers
     WHERE id = $1
       AND organization_id = $2
       AND archived_at IS NULL
     LIMIT 1`,
    [customerId, context.organizationId]
  );
  const row = result.rows[0];
  if (!row) return null;
  const phoneNumbers = safePhoneNumbers(
    await listCustomerPhoneNumbers(pool, {
      organizationId: context.organizationId,
      customerId: row.id,
    })
  );
  if (!phoneNumbers.length && cleanText(row.phone)) {
    phoneNumbers.push({
      phoneNumber: cleanText(row.phone),
      phoneLabel: "\u0627\u0635\u0644\u06cc",
      note: "",
      isPrimary: true,
    });
  }

  return {
    id: row.id,
    customerCode: row.customer_code || row.id,
    companyName: row.company_name || "",
    contactName: row.contact_name || "",
    email: row.email || "",
    phone: phoneNumbers.find((phone) => phone.isPrimary)?.phoneNumber || phoneNumbers[0]?.phoneNumber || cleanText(row.phone),
    phoneNumbers,
    address: row.address || "",
    referrer: row.referrer || "",
    status: row.status || "active",
    notes: row.notes || "",
    actionUrl: `/customers/${row.id}`,
  };
}

export async function getCustomerShipments(pool, context, { customerId } = {}) {
  requireCeoToolContext(context);
  if (!customerId) return [];

  const result = await pool.query(
    `SELECT
       s.id,
       s.shipment_code,
       s.status,
       s.updated_at,
       p.sections_json #>> '{base,currentStage}' AS current_stage,
       p.sections_json #>> '{base,statusText}' AS status_text,
       wi.current_step_code,
       wi.status AS workflow_status
     FROM shipments s
     LEFT JOIN shipment_v2_profiles p
       ON p.shipment_id = s.id
      AND p.organization_id = s.organization_id
     LEFT JOIN LATERAL (
       SELECT current_step_code, status
       FROM shipment_workflow_instances
       WHERE shipment_id = s.id
         AND organization_id = s.organization_id
         AND status <> 'cancelled'
       ORDER BY created_at DESC
       LIMIT 1
     ) wi ON TRUE
     WHERE s.organization_id = $1
       AND s.customer_id = $2
       AND s.archived_at IS NULL
       AND s.exited_archived_at IS NULL
     ORDER BY s.updated_at DESC, s.created_at DESC
     LIMIT 8`,
    [context.organizationId, customerId]
  );

  return result.rows.map((row) => ({
    id: row.id,
    shipmentCode: row.shipment_code || row.id,
    status: row.status || "PENDING",
    currentStep: cleanText(row.current_stage) || cleanText(row.current_step_code),
    currentStatus: cleanText(row.status_text) || cleanText(row.workflow_status) || cleanText(row.status),
    updatedAt: isoTimestamp(row.updated_at),
    actionUrl: `/shipments/${row.id}`,
  }));
}

export async function getShipmentDetailContext(pool, context, { shipmentId } = {}) {
  requireCeoToolContext(context);
  const shipment = await getShipmentFullProfile(pool, context, { shipmentId });
  if (!shipment) return null;
  const commercialCardContext = await getCommercialCardContext(pool, context, {
    shipmentId: shipment.id,
    customerId: shipment.customerId,
    cardRef: shipment.parties?.commercialCardId || shipment.parties?.commercialCardDisplayName,
    limit: 3,
  });
  const commercialCard = commercialCardContext.cards[0] || null;
  return {
    type: "shipment_detail_context",
    shipment: {
      id: shipment.id,
      shipmentCode: shipment.shipmentCode,
      status: shipment.status,
      currentStatus: shipment.currentStatus,
      currentStep: shipment.currentStep,
      priority: shipment.priority,
      route: shipment.route,
      ports: shipment.ports,
      operationalDates: shipment.operationalDates,
      updatedAt: shipment.updatedAt,
      actionUrl: shipment.actionUrl,
    },
    customer: {
      id: shipment.customerId,
      customerCode: shipment.customerCode,
      name: shipment.customerName,
      actionUrl: shipment.customerId ? `/customers/${shipment.customerId}` : "",
    },
    commercialCard,
    commercialCards: commercialCardContext.cards,
  };
}

export async function getCustomerDetailContext(pool, context, { customerId } = {}) {
  requireCeoToolContext(context);
  if (!customerId) return null;
  const [customer, shipments, commercialCardContext] = await Promise.all([
    getCustomerProfile(pool, context, { customerId }),
    getCustomerShipments(pool, context, { customerId }),
    getCommercialCardContext(pool, context, { customerId, limit: 5 }),
  ]);
  if (!customer) return null;
  return {
    type: "customer_detail_context",
    customer: {
      id: customer.id,
      customerCode: customer.customerCode,
      companyName: customer.companyName,
      contactName: customer.contactName,
      email: customer.email,
      phone: customer.phone,
      phoneNumbers: customer.phoneNumbers,
      address: customer.address,
      status: customer.status,
      actionUrl: customer.actionUrl,
    },
    shipments,
    commercialCards: commercialCardContext.cards,
  };
}

function documentDto(row = {}) {
  return {
    id: row.id,
    title: cleanText(row.title),
    fileName: cleanText(row.file_name),
    type: cleanText(row.mime_type || row.content_type),
    visibility: cleanText(row.visibility || "internal"),
    customerVisible: row.visibility === "customer_visible",
    shipmentId: cleanText(row.shipment_id),
    customerId: cleanText(row.customer_id),
    uploadedByName: cleanText(row.uploaded_by_name),
    uploadedAt: isoTimestamp(row.created_at),
    updatedAt: isoTimestamp(row.updated_at),
    actionUrl: row.id ? `/documents` : "",
  };
}

function taskDto(row = {}) {
  return {
    id: row.id,
    title: cleanText(row.title),
    status: cleanText(row.status || "TODO"),
    priority: cleanText(row.priority || "MEDIUM"),
    assignedToName: cleanText(row.assigned_to_name),
    dueAt: cleanText(row.due_at),
    shipmentId: cleanText(row.shipment_id),
    customerId: cleanText(row.customer_id),
    updatedAt: isoTimestamp(row.updated_at),
    actionUrl: row.shipment_id ? `/shipments/${row.shipment_id}` : "/tasks",
  };
}

function chequeDto(row = {}) {
  return {
    id: row.id,
    bankName: cleanText(row.bank_name),
    chequeNumber: cleanText(row.cheque_number),
    amount: numberOrNull(row.amount),
    currency: cleanText(row.currency || "IRR"),
    dueDate: cleanText(row.due_date),
    receiver: cleanText(row.receiver),
    status: cleanText(row.status || "ACTIVE"),
    customerId: cleanText(row.customer_id),
    updatedAt: isoTimestamp(row.updated_at),
    actionUrl: "/cheques",
  };
}

function userDto(row = {}) {
  return {
    id: row.id,
    name: cleanText(row.name),
    email: cleanText(row.email),
    role: cleanText(row.role),
    department: cleanText(row.department),
    status: cleanText(row.status || "active"),
    isOnline: Boolean(row.is_online),
    updatedAt: isoTimestamp(row.updated_at),
    actionUrl: "/users",
  };
}

function contactDto(row = {}) {
  return {
    id: row.id,
    contactName: cleanText(row.contact_name),
    roleTitle: cleanText(row.role_title),
    phoneNumber: cleanText(row.phone_number),
    phoneLabel: cleanText(row.phone_label),
    isPrimary: Boolean(row.is_primary),
  };
}

function businessEntityContactSearchDto(row = {}) {
  const commercialCard = jsonObject(row.commercial_card_data);
  const commercialCardId = cleanText(row.commercial_card_item_id) || cleanText(commercialCard.id) || cleanText(row.entity_id);
  const commercialCardLabel =
    cleanText(commercialCard.holderName) ||
    cleanText(commercialCard.companyName) ||
    cleanText(commercialCard.responsibleName) ||
    cleanText(commercialCard.cardNumber) ||
    commercialCardId;
  const malvaniLabel =
    cleanText(row.malvani_display_name) ||
    cleanText(row.malvani_lenj_name) ||
    cleanText(row.malvani_captain_name) ||
    cleanText(row.entity_id);

  return {
    ...contactDto(row),
    entityType: cleanText(row.entity_type),
    entityId: cleanText(row.entity_id),
    entityLabel: row.entity_type === "malvani" ? malvaniLabel : commercialCardLabel,
    actionUrl: row.entity_type === "malvani" ? "/management" : "/daily-status",
  };
}

function commercialCardDto(row = {}) {
  const data = jsonObject(row.data);
  const id = cleanText(row.item_id) || cleanText(data.id);
  const contacts = Array.isArray(data.contacts) ? data.contacts : [];
  const documents = Array.isArray(data.documents) ? data.documents : [];
  return {
    id,
    displayName:
      cleanText(data.holderName) ||
      cleanText(data.companyName) ||
      cleanText(data.responsibleName) ||
      cleanText(data.cardNumber) ||
      id,
    holderName: cleanText(data.holderName),
    companyName: cleanText(data.companyName),
    responsibleName: cleanText(data.responsibleName),
    responsiblePhone: cleanText(data.responsiblePhone),
    cardNumber: cleanText(data.cardNumber),
    issueDate: cleanText(data.issueDate),
    expirationDate: cleanText(data.expirationDate),
    nationalId: cleanText(data.nationalId),
    status: cleanText(data.status),
    documentsCount: documents.filter((item) => item && !item.archivedAt).length,
    contactsCount: contacts.filter((item) => item && !item.archivedAt).length,
    updatedAt: isoTimestamp(row.updated_at),
    actionUrl: "/daily-status",
  };
}

function tariffDto(row = {}) {
  return {
    id: row.id,
    tariffCode: cleanText(row.tariff_code),
    titleFa: cleanText(row.title_fa),
    titleEn: cleanText(row.title_en),
    category: cleanText(row.category),
    chapter: cleanText(row.chapter),
    unit: cleanText(row.unit),
    dutyRate: cleanText(row.duty_rate),
    taxRate: cleanText(row.tax_rate),
    restrictions: cleanText(row.restrictions),
    notes: cleanText(row.notes),
    actionUrl: "/rates",
  };
}

function rateDto(row = {}) {
  return {
    currencyCode: cleanText(row.currency_code),
    marketType: cleanText(row.market_type),
    nameFa: cleanText(row.name_fa),
    price: numberOrNull(row.price),
    buyRate: numberOrNull(row.buy_rate),
    sellRate: numberOrNull(row.sell_rate),
    unit: cleanText(row.unit || "IRR"),
    changePercent: numberOrNull(row.change_percent),
    updatedAt: isoTimestamp(row.updated_at),
    actionUrl: "/rates",
  };
}

function auditDto(row = {}) {
  return {
    id: row.id,
    action: cleanText(row.event_type || row.action),
    resourceType: cleanText(row.resource_type || row.entity_type),
    resourceId: cleanText(row.resource_id || row.entity_id),
    actorName: cleanText(row.actor_name),
    summary: cleanText(row.summary || row.event_type || row.action),
    createdAt: isoTimestamp(row.created_at),
  };
}

function archiveDto(row = {}) {
  return {
    id: row.id,
    entityType: cleanText(row.entity_type),
    entityId: cleanText(row.entity_id),
    title: cleanText(row.title),
    summary: cleanText(row.summary),
    customerName: cleanText(row.customer_name),
    shipmentId: cleanText(row.shipment_id),
    archivedAt: isoTimestamp(row.archived_at),
    restoredAt: isoTimestamp(row.restored_at),
    actionUrl: "/archive",
  };
}

function fieldText(value) {
  if (Array.isArray(value)) return value.map(fieldText).filter(Boolean).join(" ");
  return normalizeAiSearchText(value);
}

function businessMatchedFields(fields = {}, terms = []) {
  const matched = [];
  for (const [field, value] of Object.entries(fields)) {
    const text = fieldText(value);
    if (!text) continue;
    if (terms.some((term) => text.includes(term))) matched.push(field);
  }
  return matched;
}

function businessMatchedTermCount(fields = {}, terms = []) {
  const haystack = fieldText(Object.values(fields));
  return terms.filter((term) => haystack.includes(term)).length;
}

function businessExactMatchCount(fields = {}, terms = []) {
  return Object.values(fields)
    .map(fieldText)
    .filter(Boolean)
    .filter((value) => terms.some((term) => value === term || compactCode(value) === compactCode(term)))
    .length;
}

function businessCandidateScore({ fields = {}, terms = [], typePriority = 0 }) {
  const matchedFields = businessMatchedFields(fields, terms);
  const termHits = businessMatchedTermCount(fields, terms);
  const exactHits = businessExactMatchCount(fields, terms);
  const score = 0.28 + typePriority + matchedFields.length * 0.08 + termHits * 0.1 + exactHits * 0.22;
  return Math.min(0.99, Number(score.toFixed(2)));
}

function fieldIncludesAnyTerm(value, terms = []) {
  const text = fieldText(value);
  return Boolean(text && terms.some((term) => text.includes(term)));
}

function fieldExactlyMatchesAnyTerm(value, terms = []) {
  const text = fieldText(value);
  if (!text) return false;
  const compactText = compactCode(text);
  return terms.some((term) => text === term || compactText === compactCode(term));
}

function customerBusinessCandidateScore({ fields = {}, terms = [], typePriority = 0, requestedField = "summary", requestedFields = [] }) {
  let score = businessCandidateScore({ fields, terms, typePriority });
  if (fieldExactlyMatchesAnyTerm(fields.contact_name, terms)) score += 0.34;
  else if (fieldIncludesAnyTerm(fields.contact_name, terms)) score += 0.24;

  if (fieldExactlyMatchesAnyTerm(fields.customer_code, terms)) score += 0.3;
  else if (fieldExactlyMatchesAnyTerm(fields.company_name, terms)) score += 0.22;
  else if (fieldIncludesAnyTerm(fields.company_name, terms)) score += 0.14;

  if (fieldIncludesAnyTerm(fields.phone, terms)) score += 0.07;
  if (fieldIncludesAnyTerm(fields.referrer, terms) || fieldIncludesAnyTerm(fields.notes, terms)) score += 0.04;

  if ((requestedField === "customer_phone" || requestedFields.includes("phone")) && cleanText(fields.phone)) score += 0.05;
  return Math.min(0.99, Number(score.toFixed(2)));
}

function shipmentBusinessCandidate(row = {}, terms = [], typePriority = 0) {
  const goodsDescription = cleanText(row.profile_goods_text) || cleanText(row.legacy_goods_text);
  const currentStatus = cleanText(row.status_text) || cleanText(row.current_stage) || cleanText(row.status);
  const customerName = customerDisplayName(row);
  const fields = {
    shipment_code: row.shipment_code,
    reference_number: row.reference_number,
    tracking_number: row.tracking_number,
    customer_name: customerName,
    customer_code: row.customer_code,
    goods_description: goodsDescription,
    origin: row.origin,
    destination: row.destination,
    status: currentStatus,
    consignee_name: row.consignee_name,
    shipper_name: row.shipper_name,
    container_number: row.container_number,
    commercial_card: row.commercial_card_display_name,
    order_registration_number: row.order_registration_number,
  };
  return {
    type: "shipment",
    id: cleanText(row.id),
    label: [
      `محموله ${cleanText(row.shipment_code) || cleanText(row.id)}`,
      customerName ? `مشتری ${customerName}` : "",
      goodsDescription ? `کالا ${goodsDescription.slice(0, 80)}` : "",
    ].filter(Boolean).join(" / "),
    matchedFields: businessMatchedFields(fields, terms),
    score: businessCandidateScore({ fields, terms, typePriority }),
    safeSummary: {
      shipmentCode: cleanText(row.shipment_code) || cleanText(row.id),
      customerName,
      customerCode: cleanText(row.customer_code),
      status: currentStatus,
      goodsDescription: goodsDescription.slice(0, 180),
      origin: cleanText(row.origin),
      destination: cleanText(row.destination),
    },
  };
}

function customerBusinessCandidate(row = {}, terms = [], typePriority = 0, requestedField = "summary", requestedFields = []) {
  const name = cleanText(row.company_name) || cleanText(row.contact_name) || cleanText(row.customer_code) || cleanText(row.id);
  const fields = {
    customer_code: row.customer_code,
    company_name: row.company_name,
    contact_name: row.contact_name,
    phone: row.phone,
    referrer: row.referrer,
    address: row.address,
    notes: row.notes,
    status: row.status,
  };
  return {
    type: "customer",
    id: cleanText(row.id),
    label: [`مشتری ${name}`, cleanText(row.customer_code)].filter(Boolean).join(" / "),
    matchedFields: businessMatchedFields(fields, terms),
    score: customerBusinessCandidateScore({ fields, terms, typePriority, requestedField, requestedFields }),
    safeSummary: {
      customerCode: cleanText(row.customer_code),
      customerName: name,
      status: cleanText(row.status),
      ...(requestedField === "customer_phone" || requestedFields.includes("phone") ? { phone: cleanText(row.phone) } : {}),
    },
  };
}

function commercialCardBusinessCandidate(row = {}, terms = [], typePriority = 0) {
  const card = commercialCardDto(row);
  const label = cleanText(card.displayName) || cleanText(card.holderName) || cleanText(card.companyName) || cleanText(card.responsibleName) || "کارت بازرگانی";
  const fields = {
    item_id: card.id,
    display_name: card.displayName,
    holder_name: card.holderName,
    company_name: card.companyName,
    responsible_name: card.responsibleName,
    card_number: card.cardNumber,
    national_id: card.nationalId,
    status: card.status,
  };
  return {
    type: "commercial_card",
    id: cleanText(card.id) || cleanText(row.item_id),
    label: `کارت بازرگانی ${label}`,
    matchedFields: businessMatchedFields(fields, terms),
    score: businessCandidateScore({ fields, terms, typePriority }),
    safeSummary: {
      displayName: label,
      holderName: cleanText(card.holderName),
      companyName: cleanText(card.companyName),
      responsibleName: cleanText(card.responsibleName),
      cardNumber: maskBusinessNumber(card.cardNumber),
      status: cleanText(card.status),
    },
  };
}

export async function searchShipmentsByText(pool, context, { query = "", limit = 5 } = {}) {
  requireCeoToolContext(context);
  const q = normalizeAiLookupCode(query).trim();
  if (q.length < 2) return [];
  const result = await pool.query(
    `SELECT
       s.id, s.shipment_code, s.customer_id, s.customer_name, s.status, s.updated_at,
       c.customer_code, c.company_name AS customer_company_name, c.contact_name AS customer_contact_name,
       p.sections_json #>> '{base,malvaniProfileId}' AS malvani_profile_id,
       p.sections_json #>> '{base,commercialCardId}' AS commercial_card_id
     FROM shipments s
     LEFT JOIN customers c ON c.id = s.customer_id AND c.organization_id = s.organization_id
     LEFT JOIN shipment_v2_profiles p ON p.shipment_id = s.id AND p.organization_id = s.organization_id
     WHERE s.organization_id = $1
       AND s.archived_at IS NULL
       AND s.exited_archived_at IS NULL
       AND (
         s.shipment_code ILIKE $2
         OR s.customer_name ILIKE $2
         OR c.company_name ILIKE $2
         OR c.contact_name ILIKE $2
         OR s.status ILIKE $2
         OR s.origin ILIKE $2
          OR s.destination ILIKE $2
          OR p.sections_json #>> '{base,statusText}' ILIKE $2
          OR p.sections_json #>> '{base,currentStage}' ILIKE $2
          OR p.sections_json #>> '{base,consigneeName}' ILIKE $2
          OR p.sections_json #>> '{base,malvaniDisplayName}' ILIKE $2
          OR p.sections_json #>> '{base,commercialCardDisplayName}' ILIKE $2
          OR p.sections_json #>> '{base,orderRegistrationNumber}' ILIKE $2
          OR EXISTS (
            SELECT 1
            FROM jsonb_array_elements(COALESCE(p.sections_json #> '{goods,goodsRows}', '[]'::jsonb)) AS goods(item)
            WHERE goods.item->>'description' ILIKE $2
               OR goods.item->>'tariffCode' ILIKE $2
               OR goods.item->>'tariffName' ILIKE $2
          )
          OR EXISTS (
            SELECT 1
            FROM jsonb_array_elements(COALESCE(s.legacy_data #> '{goodsRows}', '[]'::jsonb)) AS goods(item)
            WHERE goods.item->>'description' ILIKE $2
               OR goods.item->>'tariffCode' ILIKE $2
               OR goods.item->>'tariffName' ILIKE $2
          )
        )
     ORDER BY s.updated_at DESC
     LIMIT $3`,
    [context.organizationId, `%${q}%`, Math.min(Math.max(Number(limit) || 5, 1), 10)]
  );
  return result.rows.map(shipmentSummary);
}

export async function searchShipmentsByGoods(pool, context, { query = "", customerIds = [], limit = 5 } = {}) {
  requireCeoToolContext(context);
  const q = normalizeAiLookupCode(query).trim();
  if (q.length < 2) return [];
  const scopedCustomerIds = Array.isArray(customerIds)
    ? customerIds.map((item) => cleanText(item)).filter(Boolean).slice(0, 20)
    : [];
  const result = await pool.query(
    `SELECT
       s.id, s.shipment_code, s.customer_id, s.customer_name, s.status, s.updated_at,
       c.customer_code, c.company_name AS customer_company_name, c.contact_name AS customer_contact_name,
       p.sections_json #>> '{base,malvaniProfileId}' AS malvani_profile_id,
       p.sections_json #>> '{base,commercialCardId}' AS commercial_card_id
     FROM shipments s
     LEFT JOIN customers c ON c.id = s.customer_id AND c.organization_id = s.organization_id
     LEFT JOIN shipment_v2_profiles p ON p.shipment_id = s.id AND p.organization_id = s.organization_id
     WHERE s.organization_id = $1
       AND s.archived_at IS NULL
       AND s.exited_archived_at IS NULL
       AND (array_length($3::text[], 1) IS NULL OR s.customer_id = ANY($3::text[]))
       AND (
         EXISTS (
           SELECT 1
           FROM jsonb_array_elements(COALESCE(p.sections_json #> '{goods,goodsRows}', '[]'::jsonb)) AS goods(item)
           WHERE goods.item->>'description' ILIKE $2
              OR goods.item->>'tariffCode' ILIKE $2
              OR goods.item->>'tariffName' ILIKE $2
         )
         OR EXISTS (
           SELECT 1
           FROM jsonb_array_elements(COALESCE(s.legacy_data #> '{goodsRows}', '[]'::jsonb)) AS goods(item)
           WHERE goods.item->>'description' ILIKE $2
              OR goods.item->>'tariffCode' ILIKE $2
              OR goods.item->>'tariffName' ILIKE $2
         )
       )
     ORDER BY s.updated_at DESC, s.created_at DESC
     LIMIT $4`,
    [context.organizationId, `%${q}%`, scopedCustomerIds, Math.min(Math.max(Number(limit) || 5, 1), 10)]
  );
  return result.rows.map(shipmentSummary);
}

export async function getShipmentBasicInfo(pool, context, { shipmentId } = {}) {
  const shipment = await getShipmentFullProfile(pool, context, { shipmentId });
  if (!shipment) return null;
  return {
    id: shipment.id,
    shipmentCode: shipment.shipmentCode,
    customerId: shipment.customerId,
    customerCode: shipment.customerCode,
    customerName: shipment.customerName,
    status: shipment.status,
    currentStep: shipment.currentStep,
    currentStatus: shipment.currentStatus,
    priority: shipment.priority,
    updatedAt: shipment.updatedAt,
    actionUrl: shipment.actionUrl,
  };
}

export async function getShipmentGoods(pool, context, { shipmentId } = {}) {
  const shipment = await getShipmentFullProfile(pool, context, { shipmentId });
  if (!shipment) return null;
  return {
    shipmentId: shipment.id,
    shipmentCode: shipment.shipmentCode,
    goodsRows: shipment.goodsRows,
  };
}

export async function getShipmentRoute(pool, context, { shipmentId } = {}) {
  const shipment = await getShipmentFullProfile(pool, context, { shipmentId });
  if (!shipment) return null;
  return {
    shipmentId: shipment.id,
    shipmentCode: shipment.shipmentCode,
    route: shipment.route,
    ports: shipment.ports,
  };
}

export async function getShipmentImportantDates(pool, context, { shipmentId } = {}) {
  const shipment = await getShipmentFullProfile(pool, context, { shipmentId });
  if (!shipment) return null;
  return {
    shipmentId: shipment.id,
    shipmentCode: shipment.shipmentCode,
    operationalDates: shipment.operationalDates,
    updatedAt: shipment.updatedAt,
  };
}

export async function getShipmentParties(pool, context, { shipmentId } = {}) {
  const shipment = await getShipmentFullProfile(pool, context, { shipmentId });
  if (!shipment) return null;
  return {
    shipmentId: shipment.id,
    shipmentCode: shipment.shipmentCode,
    customerId: shipment.customerId,
    customerCode: shipment.customerCode,
    customerName: shipment.customerName,
    parties: shipment.parties,
  };
}

export async function getShipmentArchiveStatus(pool, context, { shipmentId } = {}) {
  requireCeoToolContext(context);
  if (!shipmentId) return null;
  const result = await pool.query(
    `SELECT id, shipment_code, archived_at, exited_archived_at, exited_archive_reason, post_exit_status
     FROM shipments
     WHERE id = $1 AND organization_id = $2
     LIMIT 1`,
    [shipmentId, context.organizationId]
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    shipmentId: row.id,
    shipmentCode: row.shipment_code || row.id,
    isArchived: Boolean(row.archived_at),
    isExitedArchived: Boolean(row.exited_archived_at),
    archiveStatus: row.exited_archived_at ? "exited_archived" : row.archived_at ? "archived" : "active",
    archivedAt: isoTimestamp(row.archived_at),
    exitedArchivedAt: isoTimestamp(row.exited_archived_at),
    exitedArchiveReason: cleanText(row.exited_archive_reason),
    postExitStatus: cleanText(row.post_exit_status),
  };
}

export async function searchCustomersByName(pool, context, { query = "", limit = 5 } = {}) {
  requireCeoToolContext(context);
  const q = normalizeAiLookupCode(query).trim();
  if (q.length < 2) return [];
  const result = await pool.query(
    `SELECT id, customer_code, company_name, contact_name, phone, status
     FROM customers
     WHERE organization_id = $1
       AND archived_at IS NULL
       AND (id ILIKE $2 OR company_name ILIKE $2 OR contact_name ILIKE $2 OR customer_code ILIKE $2)
     ORDER BY updated_at DESC
     LIMIT $3`,
    [context.organizationId, `%${q}%`, Math.min(Math.max(Number(limit) || 5, 1), 10)]
  );
  return result.rows.map(customerSummary);
}

export async function getCustomerBasicInfo(pool, context, { customerId } = {}) {
  const customer = await getCustomerProfile(pool, context, { customerId });
  if (!customer) return null;
  return {
    id: customer.id,
    customerCode: customer.customerCode,
    companyName: customer.companyName,
    contactName: customer.contactName,
    status: customer.status,
    actionUrl: customer.actionUrl,
  };
}

export async function getCustomerContactInfo(pool, context, { customerId } = {}) {
  const customer = await getCustomerProfile(pool, context, { customerId });
  if (!customer) return null;
  return {
    id: customer.id,
    customerCode: customer.customerCode,
    companyName: customer.companyName,
    contactName: customer.contactName,
    email: customer.email,
    primaryPhone: customer.phone,
    phoneNumbers: customer.phoneNumbers,
    address: customer.address,
    actionUrl: customer.actionUrl,
  };
}

export async function getCustomerDocumentsSummary(pool, context, { customerId } = {}) {
  requireCeoToolContext(context);
  if (!customerId) return null;
  const result = await pool.query(
    `SELECT id, title, file_name, mime_type, content_type, visibility, shipment_id, customer_id, uploaded_by_name, created_at, updated_at
     FROM documents
     WHERE organization_id = $1
       AND customer_id = $2
       AND archived_at IS NULL
     ORDER BY updated_at DESC
     LIMIT 10`,
    [context.organizationId, customerId]
  );
  return {
    customerId,
    count: result.rows.length,
    documents: result.rows.map(documentDto),
  };
}

export async function getCustomerOpenIssues(pool, context, { customerId } = {}) {
  requireCeoToolContext(context);
  if (!customerId) return null;
  const [tasksResult, blockersResult] = await Promise.all([
    pool.query(
      `SELECT id, title, status, priority, assigned_to_name, due_at, shipment_id, customer_id, updated_at
       FROM tasks
       WHERE organization_id = $1
         AND customer_id = $2
         AND status NOT IN ('DONE', 'CANCELLED')
       ORDER BY updated_at DESC
       LIMIT 10`,
      [context.organizationId, customerId]
    ),
    pool.query(
      `SELECT b.id, b.blocker_code, b.step_code, b.updated_at, s.id AS shipment_id, s.shipment_code
       FROM shipment_workflow_blockers b
       JOIN shipments s ON s.id = b.shipment_id AND s.organization_id = b.organization_id
       WHERE b.organization_id = $1
         AND s.customer_id = $2
         AND b.status = 'open'
       ORDER BY b.updated_at DESC
       LIMIT 10`,
      [context.organizationId, customerId]
    ),
  ]);
  return {
    customerId,
    openTasks: tasksResult.rows.map(taskDto),
    openBlockers: blockersResult.rows.map((row) => ({
      id: row.id,
      blockerCode: row.blocker_code,
      stepCode: row.step_code,
      shipmentId: row.shipment_id,
      shipmentCode: row.shipment_code,
      updatedAt: isoTimestamp(row.updated_at),
    })),
  };
}

export async function searchMalvaniProfiles(pool, context, { query = "", limit = 5 } = {}) {
  requireCeoToolContext(context);
  const q = normalizeAiLookupCode(query).trim();
  if (q.length < 2) return [];
  const result = await pool.query(
    `SELECT id, display_name, captain_name, lenj_name, lenj_registration_number, active_status, updated_at
     FROM malvani_profiles
     WHERE organization_id = $1
       AND archived_at IS NULL
       AND (
         display_name ILIKE $2 OR captain_name ILIKE $2 OR lenj_name ILIKE $2 OR lenj_registration_number ILIKE $2
       )
     ORDER BY updated_at DESC
     LIMIT $3`,
    [context.organizationId, `%${q}%`, Math.min(Math.max(Number(limit) || 5, 1), 10)]
  );
  return result.rows.map((row) => ({
    id: row.id,
    displayName: cleanText(row.display_name),
    captainName: cleanText(row.captain_name),
    lenjName: cleanText(row.lenj_name),
    registrationNumber: cleanText(row.lenj_registration_number),
    activeStatus: cleanText(row.active_status),
    actionUrl: "/management",
  }));
}

export async function searchBusinessEntityContacts(pool, context, { query = "", limit = 5 } = {}) {
  requireCeoToolContext(context);
  const q = normalizeAiLookupCode(query).trim();
  if (q.length < 2) return [];
  const result = await pool.query(
    `WITH commercial_cards AS (
       SELECT DISTINCT ON (organization_id, item_id)
         organization_id,
         item_id,
         data,
         updated_at
       FROM user_records
       WHERE organization_id = $1
         AND collection = 'commercialCards'
         AND COALESCE(data->>'isArchived', 'false') <> 'true'
         AND COALESCE(data->>'archivedAt', '') = ''
       ORDER BY organization_id, item_id, updated_at DESC
     )
     SELECT
       c.id,
       c.entity_type,
       c.entity_id,
       c.contact_name,
       c.role_title,
       c.phone_number,
       c.phone_label,
       c.is_primary,
       mp.display_name AS malvani_display_name,
       mp.lenj_name AS malvani_lenj_name,
       mp.captain_name AS malvani_captain_name,
       cards.item_id AS commercial_card_item_id,
       cards.data AS commercial_card_data
     FROM business_entity_contacts c
     LEFT JOIN malvani_profiles mp
       ON mp.organization_id = c.organization_id
      AND mp.id = c.entity_id
      AND c.entity_type = 'malvani'
      AND mp.archived_at IS NULL
     LEFT JOIN commercial_cards cards
       ON cards.organization_id = c.organization_id
      AND c.entity_type = 'commercial_card'
      AND (cards.item_id = c.entity_id OR cards.data->>'id' = c.entity_id)
     WHERE c.organization_id = $1
       AND c.archived_at IS NULL
       AND (
         c.contact_name ILIKE $2
         OR c.role_title ILIKE $2
         OR c.phone_number ILIKE $2
         OR COALESCE(c.phone_label, '') ILIKE $2
       )
     ORDER BY c.is_primary DESC, c.updated_at DESC
     LIMIT $3`,
    [context.organizationId, `%${q}%`, Math.min(Math.max(Number(limit) || 5, 1), 10)]
  );
  return result.rows.map(businessEntityContactSearchDto);
}

export async function searchCommercialCards(pool, context, { query = "", limit = 5 } = {}) {
  requireCeoToolContext(context);
  const q = normalizeAiLookupCode(query).trim();
  if (q.length < 2) return [];
  const result = await pool.query(
    `SELECT DISTINCT ON (organization_id, item_id)
       item_id,
       data,
       updated_at
     FROM user_records
     WHERE organization_id = $1
       AND collection = 'commercialCards'
       AND COALESCE(data->>'isArchived', 'false') <> 'true'
       AND COALESCE(data->>'archivedAt', '') = ''
       AND (
         item_id ILIKE $2
         OR data->>'id' ILIKE $2
         OR data->>'holderName' ILIKE $2
         OR data->>'companyName' ILIKE $2
         OR data->>'responsibleName' ILIKE $2
         OR data->>'cardNumber' ILIKE $2
       )
     ORDER BY organization_id, item_id, updated_at DESC
     LIMIT $3`,
    [context.organizationId, `%${q}%`, Math.min(Math.max(Number(limit) || 5, 1), 10)]
  );
  return result.rows.map(commercialCardDto);
}

async function searchBusinessShipments(pool, context, { terms, patterns, compactTerms, limit, typePriority }) {
  const result = await pool.query(
    `SELECT
       s.id,
       s.shipment_code,
       s.customer_id,
       s.customer_name,
       s.status,
       s.origin,
       s.destination,
       s.updated_at,
       s.legacy_data->>'trackingNumber' AS tracking_number,
       s.legacy_data->>'referenceNumber' AS reference_number,
       c.customer_code,
       c.company_name AS customer_company_name,
       c.contact_name AS customer_contact_name,
       p.sections_json #>> '{base,currentStage}' AS current_stage,
       p.sections_json #>> '{base,statusText}' AS status_text,
       p.sections_json #>> '{base,consigneeName}' AS consignee_name,
       p.sections_json #>> '{base,shipperName}' AS shipper_name,
       p.sections_json #>> '{base,commercialCardDisplayName}' AS commercial_card_display_name,
       p.sections_json #>> '{base,orderRegistrationNumber}' AS order_registration_number,
       k.container_summary,
       k.cotage_number,
       k.bill_of_lading_number,
       k.goods_summary,
       (
         SELECT string_agg(CONCAT_WS(' ', goods.item->>'description', goods.item->>'tariffCode', goods.item->>'tariffName'), ' ')
         FROM jsonb_array_elements(COALESCE(p.sections_json #> '{goods,goodsRows}', '[]'::jsonb)) AS goods(item)
       ) AS profile_goods_text,
       (
         SELECT string_agg(CONCAT_WS(' ', goods.item->>'description', goods.item->>'tariffCode', goods.item->>'tariffName'), ' ')
         FROM jsonb_array_elements(COALESCE(s.legacy_data #> '{goodsRows}', '[]'::jsonb)) AS goods(item)
       ) AS legacy_goods_text
     FROM shipments s
     LEFT JOIN customers c
       ON c.id = s.customer_id
      AND c.organization_id = s.organization_id
      AND c.archived_at IS NULL
     LEFT JOIN shipment_v2_profiles p
       ON p.shipment_id = s.id
      AND p.organization_id = s.organization_id
     LEFT JOIN shipment_kootaj_details k
       ON k.shipment_id = s.id
      AND k.organization_id = s.organization_id
     WHERE s.organization_id = $1
       AND s.archived_at IS NULL
       AND s.exited_archived_at IS NULL
       AND (
         lower(COALESCE(s.id, '')) = ANY($2::text[])
         OR lower(COALESCE(s.shipment_code, '')) = ANY($2::text[])
         OR lower(COALESCE(s.legacy_data->>'trackingNumber', '')) = ANY($2::text[])
         OR lower(COALESCE(s.legacy_data->>'referenceNumber', '')) = ANY($2::text[])
         OR regexp_replace(lower(COALESCE(s.shipment_code, '')), '[^a-z0-9]', '', 'g') = ANY($4::text[])
         OR COALESCE(s.shipment_code, '') ILIKE ANY($3::text[])
         OR COALESCE(s.customer_name, '') ILIKE ANY($3::text[])
         OR COALESCE(s.origin, '') ILIKE ANY($3::text[])
         OR COALESCE(s.destination, '') ILIKE ANY($3::text[])
         OR COALESCE(s.status, '') ILIKE ANY($3::text[])
         OR COALESCE(c.customer_code, '') ILIKE ANY($3::text[])
         OR COALESCE(c.company_name, '') ILIKE ANY($3::text[])
         OR COALESCE(c.contact_name, '') ILIKE ANY($3::text[])
         OR COALESCE(p.sections_json #>> '{base,currentStage}', '') ILIKE ANY($3::text[])
         OR COALESCE(p.sections_json #>> '{base,statusText}', '') ILIKE ANY($3::text[])
         OR COALESCE(p.sections_json #>> '{base,consigneeName}', '') ILIKE ANY($3::text[])
         OR COALESCE(p.sections_json #>> '{base,shipperName}', '') ILIKE ANY($3::text[])
         OR COALESCE(p.sections_json #>> '{base,commercialCardDisplayName}', '') ILIKE ANY($3::text[])
         OR COALESCE(p.sections_json #>> '{base,orderRegistrationNumber}', '') ILIKE ANY($3::text[])
         OR COALESCE(k.container_summary, '') ILIKE ANY($3::text[])
         OR COALESCE(k.cotage_number, '') ILIKE ANY($3::text[])
         OR COALESCE(k.bill_of_lading_number, '') ILIKE ANY($3::text[])
         OR COALESCE(k.goods_summary, '') ILIKE ANY($3::text[])
         OR EXISTS (
           SELECT 1
           FROM jsonb_array_elements(COALESCE(p.sections_json #> '{goods,goodsRows}', '[]'::jsonb)) AS goods(item)
           WHERE COALESCE(goods.item->>'description', '') ILIKE ANY($3::text[])
              OR COALESCE(goods.item->>'tariffCode', '') ILIKE ANY($3::text[])
              OR COALESCE(goods.item->>'tariffName', '') ILIKE ANY($3::text[])
         )
         OR EXISTS (
           SELECT 1
           FROM jsonb_array_elements(COALESCE(s.legacy_data #> '{goodsRows}', '[]'::jsonb)) AS goods(item)
           WHERE COALESCE(goods.item->>'description', '') ILIKE ANY($3::text[])
              OR COALESCE(goods.item->>'tariffCode', '') ILIKE ANY($3::text[])
              OR COALESCE(goods.item->>'tariffName', '') ILIKE ANY($3::text[])
         )
       )
     ORDER BY s.updated_at DESC, s.created_at DESC
     LIMIT $5`,
    [context.organizationId, terms, patterns, compactTerms, limit]
  );
  return result.rows.map((row) => shipmentBusinessCandidate(row, terms, typePriority));
}

async function searchBusinessCustomers(pool, context, { terms, patterns, compactTerms, limit, typePriority, requestedField, requestedFields }) {
  const result = await pool.query(
    `SELECT id, customer_code, company_name, contact_name, phone, address, referrer, notes, status, updated_at
     FROM customers
     WHERE organization_id = $1
       AND archived_at IS NULL
       AND (
         lower(COALESCE(id, '')) = ANY($2::text[])
         OR lower(COALESCE(customer_code, '')) = ANY($2::text[])
         OR regexp_replace(lower(COALESCE(customer_code, '')), '[^a-z0-9]', '', 'g') = ANY($4::text[])
         OR COALESCE(customer_code, '') ILIKE ANY($3::text[])
          OR COALESCE(company_name, '') ILIKE ANY($3::text[])
          OR COALESCE(contact_name, '') ILIKE ANY($3::text[])
          OR COALESCE(phone, '') ILIKE ANY($3::text[])
          OR COALESCE(address, '') ILIKE ANY($3::text[])
          OR COALESCE(referrer, '') ILIKE ANY($3::text[])
          OR COALESCE(notes, '') ILIKE ANY($3::text[])
        )
      ORDER BY
        CASE
          WHEN lower(COALESCE(contact_name, '')) = ANY($2::text[]) THEN 0
          WHEN COALESCE(contact_name, '') ILIKE ANY($3::text[]) THEN 1
          WHEN lower(COALESCE(customer_code, '')) = ANY($2::text[]) THEN 2
          WHEN COALESCE(company_name, '') ILIKE ANY($3::text[]) THEN 3
          WHEN COALESCE(phone, '') ILIKE ANY($3::text[]) THEN 4
          WHEN COALESCE(referrer, '') ILIKE ANY($3::text[]) OR COALESCE(notes, '') ILIKE ANY($3::text[]) THEN 5
          ELSE 6
        END,
        updated_at DESC
      LIMIT $5`,
    [context.organizationId, terms, patterns, compactTerms, limit]
  );
  return result.rows.map((row) => customerBusinessCandidate(row, terms, typePriority, requestedField, requestedFields));
}

async function searchBusinessCommercialCards(pool, context, { terms, patterns, limit, typePriority }) {
  const result = await pool.query(
    `SELECT DISTINCT ON (organization_id, item_id)
       item_id,
       data,
       updated_at
     FROM user_records
     WHERE organization_id = $1
       AND collection = 'commercialCards'
       AND COALESCE(data->>'isArchived', 'false') <> 'true'
       AND COALESCE(data->>'archivedAt', '') = ''
       AND (
         lower(COALESCE(item_id, '')) = ANY($2::text[])
         OR lower(COALESCE(data->>'id', '')) = ANY($2::text[])
         OR COALESCE(item_id, '') ILIKE ANY($3::text[])
         OR COALESCE(data->>'id', '') ILIKE ANY($3::text[])
         OR COALESCE(data->>'holderName', '') ILIKE ANY($3::text[])
         OR COALESCE(data->>'companyName', '') ILIKE ANY($3::text[])
         OR COALESCE(data->>'responsibleName', '') ILIKE ANY($3::text[])
         OR COALESCE(data->>'cardNumber', '') ILIKE ANY($3::text[])
         OR COALESCE(data->>'nationalId', '') ILIKE ANY($3::text[])
         OR COALESCE(data->>'status', '') ILIKE ANY($3::text[])
       )
     ORDER BY organization_id, item_id, updated_at DESC
     LIMIT $4`,
    [context.organizationId, terms, patterns, limit]
  );
  return result.rows.map((row) => commercialCardBusinessCandidate(row, terms, typePriority));
}

export async function searchBusinessContext(
  pool,
  context,
  { queryTerms = [], candidateTypes = [], requestedField = "summary", requestedFields = [], limit = 8 } = {}
) {
  requireCeoToolContext(context);
  const requestedFieldList = Array.isArray(requestedFields) ? requestedFields.map((field) => cleanText(field)).filter(Boolean) : [];
  const terms = businessSearchTerms(queryTerms);
  if (!terms.length) {
    return {
      candidates: [],
      searched: { queryTerms: [], candidateTypes: [], requestedField, requestedFields: requestedFieldList },
    };
  }

  const patternTerms = [...new Set(terms.flatMap((term) => [
    term,
    term.replace(/ی/g, "ي").replace(/ک/g, "ك"),
  ]))];
  const patterns = patternTerms.map(safeLikePattern).filter(Boolean);
  if (!patterns.length) {
    return {
      candidates: [],
      searched: { queryTerms: terms, candidateTypes: [], requestedField, requestedFields: requestedFieldList },
    };
  }

  const allowedTypes = new Set(["shipment", "customer", "commercial_card"]);
  const requestedTypes = Array.isArray(candidateTypes) && candidateTypes.length
    ? candidateTypes.filter((type) => allowedTypes.has(type))
    : ["shipment", "customer", "commercial_card"];
  const boundedLimit = Math.min(Math.max(Number(limit) || 8, 1), 12);
  const perTypeLimit = Math.min(Math.max(boundedLimit, 5), 12);
  const compactTerms = terms.map(compactCode).filter(Boolean);
  const typePriority = (type) => {
    const index = requestedTypes.indexOf(type);
    return index < 0 ? 0 : Math.max(0, 0.09 - index * 0.03);
  };

  const [shipments, customers, commercialCards] = await Promise.all([
    requestedTypes.includes("shipment")
      ? searchBusinessShipments(pool, context, { terms, patterns, compactTerms, limit: perTypeLimit, typePriority: typePriority("shipment") })
      : Promise.resolve([]),
    requestedTypes.includes("customer")
      ? searchBusinessCustomers(pool, context, { terms, patterns, compactTerms, limit: perTypeLimit, typePriority: typePriority("customer"), requestedField, requestedFields: requestedFieldList })
      : Promise.resolve([]),
    requestedTypes.includes("commercial_card")
      ? searchBusinessCommercialCards(pool, context, { terms, patterns, limit: perTypeLimit, typePriority: typePriority("commercial_card") })
      : Promise.resolve([]),
  ]);

  const candidates = [...shipments, ...customers, ...commercialCards]
    .filter((candidate) => candidate.id && candidate.matchedFields.length)
    .sort((left, right) => right.score - left.score || right.matchedFields.length - left.matchedFields.length)
    .slice(0, boundedLimit);

  return {
    candidates,
    searched: { queryTerms: terms, candidateTypes: requestedTypes, requestedField, requestedFields: requestedFieldList },
  };
}

function uniqueCommercialCards(cards = []) {
  const seen = new Set();
  const unique = [];
  for (const card of cards) {
    const key = card.id || card.cardNumber || card.displayName;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(card);
  }
  return unique;
}

async function findCommercialCardsByRefs(pool, context, refs = [], { limit = 5 } = {}) {
  requireCeoToolContext(context);
  const lookups = [...new Set(refs.map((item) => normalizeAiLookupCode(item).trim()).filter(Boolean))].slice(0, 8);
  if (!lookups.length) return [];
  const patterns = lookups.map((item) => `%${item}%`);
  const result = await pool.query(
    `SELECT DISTINCT ON (organization_id, item_id)
       item_id,
       data,
       updated_at
     FROM user_records
     WHERE organization_id = $1
       AND collection = 'commercialCards'
       AND COALESCE(data->>'isArchived', 'false') <> 'true'
       AND COALESCE(data->>'archivedAt', '') = ''
       AND (
         item_id = ANY($2::text[])
         OR data->>'id' = ANY($2::text[])
         OR data->>'holderName' ILIKE ANY($3::text[])
         OR data->>'companyName' ILIKE ANY($3::text[])
         OR data->>'responsibleName' ILIKE ANY($3::text[])
         OR data->>'cardNumber' ILIKE ANY($3::text[])
       )
     ORDER BY organization_id, item_id, updated_at DESC
     LIMIT $4`,
    [context.organizationId, lookups, patterns, Math.min(Math.max(Number(limit) || 5, 1), 5)]
  );
  return result.rows.map(commercialCardDto);
}

async function commercialCardRefsForShipment(pool, context, shipmentId) {
  requireCeoToolContext(context);
  if (!shipmentId) return { refs: [], shipmentCode: "", displayName: "" };
  const result = await pool.query(
    `SELECT
       s.shipment_code,
       p.sections_json #>> '{base,commercialCardId}' AS profile_card_id,
       p.sections_json #>> '{base,commercialCardDisplayName}' AS profile_card_display_name,
       k.commercial_card_id AS kootaj_card_id
     FROM shipments s
     LEFT JOIN shipment_v2_profiles p
       ON p.shipment_id = s.id
      AND p.organization_id = s.organization_id
     LEFT JOIN shipment_kootaj_details k
       ON k.shipment_id = s.id
      AND k.organization_id = s.organization_id
     WHERE s.id = $1
       AND s.organization_id = $2
       AND s.archived_at IS NULL
       AND s.exited_archived_at IS NULL
     LIMIT 1`,
    [shipmentId, context.organizationId]
  );
  const row = result.rows[0] || {};
  const refs = [
    cleanText(row.profile_card_id),
    cleanText(row.kootaj_card_id),
    cleanText(row.profile_card_display_name),
  ].filter(Boolean);
  return {
    refs,
    shipmentCode: cleanText(row.shipment_code),
    displayName: cleanText(row.profile_card_display_name),
  };
}

export async function getCommercialCardContext(
  pool,
  context,
  { customerId, shipmentId, cardRef, limit = 5 } = {}
) {
  requireCeoToolContext(context);
  const refs = [cardRef].filter(Boolean);
  let relation = { customerId: customerId || "", shipmentId: shipmentId || "", shipmentCode: "", displayName: "" };

  if (shipmentId) {
    const shipmentRefs = await commercialCardRefsForShipment(pool, context, shipmentId);
    refs.push(...shipmentRefs.refs);
    relation = { ...relation, shipmentCode: shipmentRefs.shipmentCode, displayName: shipmentRefs.displayName };
  }

  if (customerId) {
    const customer = await getCustomerProfile(pool, context, { customerId });
    if (customer) {
      refs.push(customer.customerCode, customer.companyName, customer.contactName);
      relation = {
        ...relation,
        customerCode: customer.customerCode,
        customerName: customer.companyName || customer.contactName,
      };
    }
  }

  let cards = await findCommercialCardsByRefs(pool, context, refs, { limit });
  if (!cards.length && relation.displayName) {
    cards = [{
      id: "",
      displayName: relation.displayName,
      holderName: relation.displayName,
      companyName: "",
      responsibleName: "",
      responsiblePhone: "",
      cardNumber: "",
      issueDate: "",
      expirationDate: "",
      nationalId: "",
      status: "",
      documentsCount: 0,
      contactsCount: 0,
      updatedAt: "",
      actionUrl: "/daily-status",
    }];
  }

  return {
    type: "commercial_card_context",
    relation,
    cards: uniqueCommercialCards(cards).slice(0, Math.min(Math.max(Number(limit) || 5, 1), 5)),
  };
}

export async function getBusinessEntityContacts(pool, context, { entityType, entityId } = {}) {
  requireCeoToolContext(context);
  if (!["commercial_card", "malvani"].includes(String(entityType || "")) || !entityId) return [];
  const result = await pool.query(
    `SELECT id, contact_name, role_title, phone_number, phone_label, is_primary
     FROM business_entity_contacts
     WHERE organization_id = $1
       AND entity_type = $2
       AND entity_id = $3
       AND archived_at IS NULL
     ORDER BY is_primary DESC, sort_order ASC, created_at ASC
     LIMIT 10`,
    [context.organizationId, entityType, entityId]
  );
  return result.rows.map(contactDto);
}

export async function getShipmentMalvaniProfile(pool, context, { shipmentId } = {}) {
  requireCeoToolContext(context);
  if (!shipmentId) return null;
  const result = await pool.query(
    `SELECT
       s.id AS shipment_id,
       s.shipment_code,
       p.sections_json #>> '{base,malvaniProfileId}' AS malvani_profile_id,
       p.sections_json #>> '{base,malvaniDisplayName}' AS malvani_display_name,
       mp.display_name,
       mp.captain_name,
       mp.lenj_name,
       mp.lenj_registration_number,
       mp.active_status
     FROM shipments s
     LEFT JOIN shipment_v2_profiles p ON p.shipment_id = s.id AND p.organization_id = s.organization_id
     LEFT JOIN malvani_profiles mp
       ON mp.id = p.sections_json #>> '{base,malvaniProfileId}'
      AND mp.organization_id = s.organization_id
      AND mp.archived_at IS NULL
     WHERE s.id = $1 AND s.organization_id = $2
     LIMIT 1`,
    [shipmentId, context.organizationId]
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    shipmentId: row.shipment_id,
    shipmentCode: row.shipment_code,
    malvaniProfileId: cleanText(row.malvani_profile_id),
    displayName: cleanText(row.display_name) || cleanText(row.malvani_display_name),
    captainName: cleanText(row.captain_name),
    lenjName: cleanText(row.lenj_name),
    registrationNumber: cleanText(row.lenj_registration_number),
    activeStatus: cleanText(row.active_status),
    missingProfile: !cleanText(row.malvani_profile_id) && !cleanText(row.malvani_display_name),
  };
}

export async function getShipmentMalvaniAgentInfo(pool, context, { shipmentId } = {}) {
  const profile = await getShipmentMalvaniProfile(pool, context, { shipmentId });
  if (!profile) return null;
  if (!profile.malvaniProfileId) {
    return {
      shipmentId: profile.shipmentId,
      shipmentCode: profile.shipmentCode,
      agentName: "",
      agentPhone: "",
      agentEmail: "",
      contactLabel: "",
      missingAgentInfo: true,
    };
  }
  const contacts = await getBusinessEntityContacts(pool, context, {
    entityType: "malvani",
    entityId: profile.malvaniProfileId,
  });
  const agent = contacts.find((item) => /agent|ایجنت|نماینده|هماهنگ/i.test(`${item.roleTitle} ${item.phoneLabel}`)) || null;
  return {
    shipmentId: profile.shipmentId,
    shipmentCode: profile.shipmentCode,
    agentName: agent?.contactName || "",
    agentPhone: agent?.phoneNumber || "",
    agentEmail: "",
    contactLabel: agent?.roleTitle || agent?.phoneLabel || "",
    missingAgentInfo: !agent?.phoneNumber,
  };
}

export async function getShipmentDocuments(pool, context, { shipmentId } = {}) {
  requireCeoToolContext(context);
  if (!shipmentId) return [];
  const result = await pool.query(
    `SELECT id, title, file_name, mime_type, content_type, visibility, shipment_id, customer_id, uploaded_by_name, created_at, updated_at
     FROM documents
     WHERE organization_id = $1
       AND shipment_id = $2
       AND archived_at IS NULL
     ORDER BY updated_at DESC
     LIMIT 20`,
    [context.organizationId, shipmentId]
  );
  return result.rows.map(documentDto);
}

export async function getCustomerDocuments(pool, context, { customerId } = {}) {
  const summary = await getCustomerDocumentsSummary(pool, context, { customerId });
  return summary?.documents || [];
}

export async function searchDocuments(pool, context, { query = "", filters = {}, limit = 10 } = {}) {
  requireCeoToolContext(context);
  const q = normalizeAiLookupCode(query).trim();
  if (q.length < 2) return [];
  const values = [context.organizationId, `%${q}%`, Math.min(Math.max(Number(limit) || 10, 1), 20)];
  const clauses = [
    "organization_id = $1",
    "archived_at IS NULL",
    "(title ILIKE $2 OR file_name ILIKE $2)",
  ];
  if (filters.shipmentId) {
    values.push(filters.shipmentId);
    clauses.push(`shipment_id = $${values.length}`);
  }
  if (filters.customerId) {
    values.push(filters.customerId);
    clauses.push(`customer_id = $${values.length}`);
  }
  const result = await pool.query(
    `SELECT id, title, file_name, mime_type, content_type, visibility, shipment_id, customer_id, uploaded_by_name, created_at, updated_at
     FROM documents
     WHERE ${clauses.join(" AND ")}
     ORDER BY updated_at DESC
     LIMIT $3`,
    values
  );
  return result.rows.map(documentDto);
}

export async function getMissingShipmentDocuments(pool, context, { shipmentId } = {}) {
  requireCeoToolContext(context);
  if (!shipmentId) return null;
  const docs = await getShipmentDocuments(pool, context, { shipmentId });
  return {
    shipmentId,
    knownDocumentsCount: docs.length,
    missingDocuments: [],
    unknownRequiredDocuments: true,
    message: "وضعیت الزامی بودن اسناد برای این محموله در همیار متصل نشده است.",
  };
}

export async function getCustomerVisibleDocuments(pool, context, { shipmentId } = {}) {
  const docs = await getShipmentDocuments(pool, context, { shipmentId });
  return docs.filter((item) => item.customerVisible);
}

export async function getDocumentBasicInfo(pool, context, { documentId } = {}) {
  requireCeoToolContext(context);
  if (!documentId) return null;
  const result = await pool.query(
    `SELECT id, title, file_name, mime_type, content_type, visibility, shipment_id, customer_id, uploaded_by_name, created_at, updated_at
     FROM documents
     WHERE id = $1 AND organization_id = $2
     LIMIT 1`,
    [documentId, context.organizationId]
  );
  return result.rows[0] ? documentDto(result.rows[0]) : null;
}

export async function getShipmentCurrentStep(pool, context, { shipmentId } = {}) {
  const workflow = await getShipmentWorkflowStatus(pool, context, { shipmentId });
  return workflow ? { currentStep: workflow.currentStep, currentStatus: workflow.currentStatus, updatedAt: workflow.updatedAt } : null;
}

export async function getShipmentWorkflowBlockers(pool, context, { shipmentId } = {}) {
  const workflow = await getShipmentWorkflowStatus(pool, context, { shipmentId });
  return workflow?.blockers || [];
}

export async function getBlockedShipments(pool, context, { limit = 10 } = {}) {
  requireCeoToolContext(context);
  const result = await pool.query(
    `SELECT DISTINCT ON (s.id)
       s.id, s.shipment_code, s.customer_id, s.customer_name, s.status, s.updated_at,
       c.customer_code, c.company_name AS customer_company_name,
       b.blocker_code, b.step_code, b.updated_at AS blocker_updated_at
     FROM shipment_workflow_blockers b
     JOIN shipments s ON s.id = b.shipment_id AND s.organization_id = b.organization_id
     LEFT JOIN customers c ON c.id = s.customer_id AND c.organization_id = s.organization_id
     WHERE b.organization_id = $1
       AND b.status = 'open'
       AND s.archived_at IS NULL
       AND s.exited_archived_at IS NULL
     ORDER BY s.id, b.updated_at DESC
     LIMIT $2`,
    [context.organizationId, Math.min(Math.max(Number(limit) || 10, 1), 20)]
  );
  return result.rows.map((row) => ({
    ...shipmentSummary(row),
    blockerCode: row.blocker_code,
    blockerStepCode: row.step_code,
    blockerUpdatedAt: isoTimestamp(row.blocker_updated_at),
  }));
}

export async function getShipmentsWaitingTooLong(pool, context, { days = 7, limit = 10 } = {}) {
  requireCeoToolContext(context);
  const result = await pool.query(
    `SELECT
       s.id, s.shipment_code, s.customer_id, s.customer_name, s.status, s.updated_at,
       c.customer_code, c.company_name AS customer_company_name,
       p.sections_json #>> '{base,currentStage}' AS current_stage,
       p.sections_json #>> '{base,statusText}' AS status_text
     FROM shipments s
     LEFT JOIN customers c ON c.id = s.customer_id AND c.organization_id = s.organization_id
     LEFT JOIN shipment_v2_profiles p ON p.shipment_id = s.id AND p.organization_id = s.organization_id
     WHERE s.organization_id = $1
       AND s.archived_at IS NULL
       AND s.exited_archived_at IS NULL
       AND s.updated_at < NOW() - ($2::int * INTERVAL '1 day')
     ORDER BY s.updated_at ASC
     LIMIT $3`,
    [context.organizationId, Math.min(Math.max(Number(days) || 7, 1), 90), Math.min(Math.max(Number(limit) || 10, 1), 20)]
  );
  return result.rows.map((row) => ({
    ...shipmentSummary(row),
    currentStep: cleanText(row.current_stage),
    currentStatus: cleanText(row.status_text || row.status),
  }));
}

export async function getShipmentDailyStatus(pool, context, { shipmentId } = {}) {
  requireCeoToolContext(context);
  if (!shipmentId) return null;
  const result = await pool.query(
    `SELECT shipment_id, cotage_number, customs_status, customs_route, release_status,
            tax_payment_status, customs_office, declaration_reference,
            document_control_status, updated_at
     FROM shipment_kootaj_details
     WHERE organization_id = $1 AND shipment_id = $2
     LIMIT 1`,
    [context.organizationId, shipmentId]
  );
  const row = result.rows[0];
  if (!row) {
    return { shipmentId, missingDailyStatus: true };
  }
  return {
    shipmentId: row.shipment_id,
    cotageNumber: cleanText(row.cotage_number),
    customsStatus: cleanText(row.customs_status),
    customsRoute: cleanText(row.customs_route),
    releaseStatus: cleanText(row.release_status),
    taxPaymentStatus: cleanText(row.tax_payment_status),
    customsOffice: cleanText(row.customs_office),
    declarationReference: cleanText(row.declaration_reference),
    documentControlStatus: cleanText(row.document_control_status),
    updatedAt: isoTimestamp(row.updated_at),
  };
}

export async function getShipmentKootajDetails(pool, context, { shipmentId } = {}) {
  const daily = await getShipmentDailyStatus(pool, context, { shipmentId });
  if (!daily) return null;
  return {
    ...daily,
    missingKootajInfo: Boolean(daily.missingDailyStatus || !daily.cotageNumber),
  };
}

export async function getShipmentsMissingDailyUpdate(pool, context, { days = 1, limit = 10 } = {}) {
  requireCeoToolContext(context);
  const result = await pool.query(
    `SELECT s.id, s.shipment_code, s.customer_id, s.customer_name, s.status, s.updated_at,
            c.customer_code, c.company_name AS customer_company_name,
            k.updated_at AS daily_updated_at
     FROM shipments s
     LEFT JOIN customers c ON c.id = s.customer_id AND c.organization_id = s.organization_id
     LEFT JOIN shipment_kootaj_details k ON k.shipment_id = s.id AND k.organization_id = s.organization_id
     WHERE s.organization_id = $1
       AND s.archived_at IS NULL
       AND s.exited_archived_at IS NULL
       AND (k.updated_at IS NULL OR k.updated_at < NOW() - ($2::int * INTERVAL '1 day'))
     ORDER BY COALESCE(k.updated_at, s.created_at) ASC
     LIMIT $3`,
    [context.organizationId, Math.min(Math.max(Number(days) || 1, 1), 30), Math.min(Math.max(Number(limit) || 10, 1), 20)]
  );
  return result.rows.map((row) => ({
    ...shipmentSummary(row),
    dailyUpdatedAt: isoTimestamp(row.daily_updated_at),
  }));
}

export async function getShipmentsByCustomsStatus(pool, context, { status, limit = 10 } = {}) {
  requireCeoToolContext(context);
  const normalizedStatus = cleanText(status).toLowerCase();
  if (!normalizedStatus) return [];
  const result = await pool.query(
    `SELECT s.id, s.shipment_code, s.customer_id, s.customer_name, s.status, s.updated_at,
            c.customer_code, c.company_name AS customer_company_name,
            k.customs_status, k.release_status
     FROM shipment_kootaj_details k
     JOIN shipments s ON s.id = k.shipment_id AND s.organization_id = k.organization_id
     LEFT JOIN customers c ON c.id = s.customer_id AND c.organization_id = s.organization_id
     WHERE k.organization_id = $1
       AND (lower(k.customs_status) = $2 OR lower(k.release_status) = $2)
       AND s.archived_at IS NULL
       AND s.exited_archived_at IS NULL
     ORDER BY k.updated_at DESC
     LIMIT $3`,
    [context.organizationId, normalizedStatus, Math.min(Math.max(Number(limit) || 10, 1), 20)]
  );
  return result.rows.map((row) => ({
    ...shipmentSummary(row),
    customsStatus: cleanText(row.customs_status),
    releaseStatus: cleanText(row.release_status),
  }));
}

export async function getDailyStatusSummary(pool, context) {
  requireCeoToolContext(context);
  const result = await pool.query(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE customs_status = 'blocked')::int AS blocked,
       COUNT(*) FILTER (WHERE release_status IN ('ready', 'released', 'exited'))::int AS release_ready_or_done,
       COUNT(*) FILTER (WHERE cotage_number IS NULL OR trim(cotage_number) = '')::int AS missing_cotage
     FROM shipment_kootaj_details
     WHERE organization_id = $1`,
    [context.organizationId]
  );
  const row = result.rows[0] || {};
  return {
    total: Number(row.total || 0),
    blocked: Number(row.blocked || 0),
    releaseReadyOrDone: Number(row.release_ready_or_done || 0),
    missingCotage: Number(row.missing_cotage || 0),
  };
}

export async function getMyActiveTasks(pool, context, { limit = 10 } = {}) {
  requireCeoToolContext(context);
  const result = await pool.query(
    `SELECT id, title, status, priority, assigned_to_name, due_at, shipment_id, customer_id, updated_at
     FROM tasks
     WHERE organization_id = $1
       AND (assigned_to_id = $2 OR owner_user_id = $2)
       AND status NOT IN ('DONE', 'CANCELLED')
     ORDER BY due_at ASC NULLS LAST, updated_at DESC
     LIMIT $3`,
    [context.organizationId, context.user.id, Math.min(Math.max(Number(limit) || 10, 1), 20)]
  );
  return result.rows.map(taskDto);
}

export async function getOrganizationActiveTasks(pool, context, { limit = 10 } = {}) {
  requireCeoToolContext(context);
  const result = await pool.query(
    `SELECT id, title, status, priority, assigned_to_name, due_at, shipment_id, customer_id, updated_at
     FROM tasks
     WHERE organization_id = $1
       AND status NOT IN ('DONE', 'CANCELLED')
     ORDER BY due_at ASC NULLS LAST, updated_at DESC
     LIMIT $2`,
    [context.organizationId, Math.min(Math.max(Number(limit) || 10, 1), 20)]
  );
  return result.rows.map(taskDto);
}

export async function getTasksByShipment(pool, context, { shipmentId, limit = 10 } = {}) {
  requireCeoToolContext(context);
  if (!shipmentId) return [];
  const result = await pool.query(
    `SELECT id, title, status, priority, assigned_to_name, due_at, shipment_id, customer_id, updated_at
     FROM tasks
     WHERE organization_id = $1 AND shipment_id = $2
     ORDER BY status ASC, due_at ASC NULLS LAST, updated_at DESC
     LIMIT $3`,
    [context.organizationId, shipmentId, Math.min(Math.max(Number(limit) || 10, 1), 20)]
  );
  return result.rows.map(taskDto);
}

export async function getTasksByCustomer(pool, context, { customerId, limit = 10 } = {}) {
  requireCeoToolContext(context);
  if (!customerId) return [];
  const result = await pool.query(
    `SELECT id, title, status, priority, assigned_to_name, due_at, shipment_id, customer_id, updated_at
     FROM tasks
     WHERE organization_id = $1 AND customer_id = $2
     ORDER BY status ASC, due_at ASC NULLS LAST, updated_at DESC
     LIMIT $3`,
    [context.organizationId, customerId, Math.min(Math.max(Number(limit) || 10, 1), 20)]
  );
  return result.rows.map(taskDto);
}

export async function getOverdueTasks(pool, context, { limit = 10 } = {}) {
  requireCeoToolContext(context);
  const today = new Date().toISOString().slice(0, 10);
  const result = await pool.query(
    `SELECT id, title, status, priority, assigned_to_name, due_at, shipment_id, customer_id, updated_at
     FROM tasks
     WHERE organization_id = $1
       AND status NOT IN ('DONE', 'CANCELLED')
       AND due_at IS NOT NULL
       AND due_at < $2
     ORDER BY due_at ASC, updated_at DESC
     LIMIT $3`,
    [context.organizationId, today, Math.min(Math.max(Number(limit) || 10, 1), 20)]
  );
  return result.rows.map(taskDto);
}

export async function getTasksDueToday(pool, context, { limit = 10 } = {}) {
  requireCeoToolContext(context);
  const today = new Date().toISOString().slice(0, 10);
  const result = await pool.query(
    `SELECT id, title, status, priority, assigned_to_name, due_at, shipment_id, customer_id, updated_at
     FROM tasks
     WHERE organization_id = $1
       AND status NOT IN ('DONE', 'CANCELLED')
       AND due_at = $2
     ORDER BY priority ASC, updated_at DESC
     LIMIT $3`,
    [context.organizationId, today, Math.min(Math.max(Number(limit) || 10, 1), 20)]
  );
  return result.rows.map(taskDto);
}

export async function getEmployeeTaskSummary(pool, context, { userId } = {}) {
  requireCeoToolContext(context);
  if (!userId) return null;
  const result = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE status NOT IN ('DONE', 'CANCELLED'))::int AS active,
       COUNT(*) FILTER (WHERE status = 'DONE')::int AS done,
       COUNT(*) FILTER (WHERE status NOT IN ('DONE', 'CANCELLED') AND due_at < $3)::int AS overdue
     FROM tasks
     WHERE organization_id = $1 AND assigned_to_id = $2`,
    [context.organizationId, userId, new Date().toISOString().slice(0, 10)]
  );
  const row = result.rows[0] || {};
  return {
    userId,
    activeTasks: Number(row.active || 0),
    doneTasks: Number(row.done || 0),
    overdueTasks: Number(row.overdue || 0),
  };
}

export async function getChequesDueSoon(pool, context, { days = 7, limit = 10 } = {}) {
  requireCeoToolContext(context);
  const result = await pool.query(
    `SELECT id, bank_name, cheque_number, amount, currency, due_date, receiver, status, customer_id, updated_at
     FROM cheques
     WHERE organization_id = $1
       AND archived_at IS NULL
       AND due_date IS NOT NULL
       AND due_date >= $2
       AND due_date <= $3
     ORDER BY due_date ASC
     LIMIT $4`,
    [
      context.organizationId,
      new Date().toISOString().slice(0, 10),
      new Date(Date.now() + Math.min(Math.max(Number(days) || 7, 1), 90) * 86400000).toISOString().slice(0, 10),
      Math.min(Math.max(Number(limit) || 10, 1), 20),
    ]
  );
  return result.rows.map(chequeDto);
}

export async function getOverdueCheques(pool, context, { limit = 10 } = {}) {
  requireCeoToolContext(context);
  const result = await pool.query(
    `SELECT id, bank_name, cheque_number, amount, currency, due_date, receiver, status, customer_id, updated_at
     FROM cheques
     WHERE organization_id = $1
       AND archived_at IS NULL
       AND due_date IS NOT NULL
       AND due_date < $2
       AND status NOT IN ('PAID', 'CANCELLED')
     ORDER BY due_date ASC
     LIMIT $3`,
    [context.organizationId, new Date().toISOString().slice(0, 10), Math.min(Math.max(Number(limit) || 10, 1), 20)]
  );
  return result.rows.map(chequeDto);
}

export async function getCustomerChequeSummary(pool, context, { customerId } = {}) {
  requireCeoToolContext(context);
  if (!customerId) return null;
  const result = await pool.query(
    `SELECT id, bank_name, cheque_number, amount, currency, due_date, receiver, status, customer_id, updated_at
     FROM cheques
     WHERE organization_id = $1 AND customer_id = $2 AND archived_at IS NULL
     ORDER BY due_date ASC NULLS LAST
     LIMIT 10`,
    [context.organizationId, customerId]
  );
  return {
    customerId,
    cheques: result.rows.map(chequeDto),
  };
}

export async function getChequeBasicInfo(pool, context, { chequeId } = {}) {
  requireCeoToolContext(context);
  if (!chequeId) return null;
  const result = await pool.query(
    `SELECT id, bank_name, cheque_number, amount, currency, due_date, receiver, status, customer_id, updated_at
     FROM cheques
     WHERE id = $1 AND organization_id = $2
     LIMIT 1`,
    [chequeId, context.organizationId]
  );
  return result.rows[0] ? chequeDto(result.rows[0]) : null;
}

export async function getShipmentFinancialSummary(_pool, context, { shipmentId } = {}) {
  requireCeoToolContext(context);
  return {
    shipmentId,
    connected: false,
    message: "خلاصه مالی محموله هنوز برای همیار لاجستیک متصل نشده است.",
  };
}

export async function searchTariffCatalog(pool, context, { query = "", limit = 5 } = {}) {
  requireCeoToolContext(context);
  const q = normalizeAiLookupCode(query).trim();
  if (q.length < 2) return [];
  const result = await pool.query(
    `SELECT id, tariff_code, title_fa, title_en, category, chapter, unit, duty_rate, tax_rate, restrictions, notes
     FROM tariff_catalog_entries
     WHERE is_active = TRUE
       AND archived_at IS NULL
       AND (tariff_code ILIKE $1 OR title_fa ILIKE $2 OR title_en ILIKE $2)
     ORDER BY CASE WHEN tariff_code = $3 THEN 0 ELSE 1 END, tariff_code ASC
     LIMIT $4`,
    [`${q}%`, `%${q}%`, q, Math.min(Math.max(Number(limit) || 5, 1), 10)]
  );
  return result.rows.map(tariffDto);
}

export async function getTariffByCode(pool, context, { code } = {}) {
  requireCeoToolContext(context);
  const tariffCode = normalizeAiLookupCode(code).trim();
  if (!tariffCode) return null;
  const result = await pool.query(
    `SELECT id, tariff_code, title_fa, title_en, category, chapter, unit, duty_rate, tax_rate, restrictions, notes
     FROM tariff_catalog_entries
     WHERE is_active = TRUE
       AND archived_at IS NULL
       AND tariff_code = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [tariffCode]
  );
  return result.rows[0] ? tariffDto(result.rows[0]) : null;
}

export async function getLatestCurrencyRates(pool, context, { limit = 8 } = {}) {
  requireCeoToolContext(context);
  const result = await pool.query(
    `SELECT currency_code, market_type, name_fa, price, buy_rate, sell_rate, unit, change_percent, updated_at
     FROM latest_currency_rates
     ORDER BY updated_at DESC
     LIMIT $1`,
    [Math.min(Math.max(Number(limit) || 8, 1), 16)]
  );
  return result.rows.map(rateDto);
}

export async function getCurrencyRate(pool, context, { currencyCode, marketType = "FREE_MARKET" } = {}) {
  requireCeoToolContext(context);
  const code = cleanText(currencyCode).toUpperCase();
  if (!code) return null;
  const result = await pool.query(
    `SELECT currency_code, market_type, name_fa, price, buy_rate, sell_rate, unit, change_percent, updated_at
     FROM latest_currency_rates
     WHERE currency_code = $1 AND market_type = $2
     LIMIT 1`,
    [code, marketType]
  );
  return result.rows[0] ? rateDto(result.rows[0]) : null;
}

export async function getShipmentPublicTrackingInfo(pool, context, { shipmentId } = {}) {
  const shipment = await getShipmentFullProfile(pool, context, { shipmentId });
  if (!shipment) return null;
  return {
    shipmentId: shipment.id,
    shipmentCode: shipment.shipmentCode,
    enabled: shipment.publicTrackingStatus.enabled,
    label: shipment.publicTrackingStatus.label,
    description: shipment.publicTrackingStatus.description,
    latestPublicUpdateAt: shipment.operationalDates.latestPublicUpdateAt,
    actionUrl: shipment.actionUrl,
  };
}

export async function getShipmentCustomerAccessStatus(pool, context, { shipmentId } = {}) {
  return getShipmentPublicTrackingInfo(pool, context, { shipmentId });
}

export async function getCustomerVisibleTrackingSummary(pool, context, { shipmentId } = {}) {
  const [tracking, documents] = await Promise.all([
    getShipmentPublicTrackingInfo(pool, context, { shipmentId }),
    getCustomerVisibleDocuments(pool, context, { shipmentId }),
  ]);
  if (!tracking) return null;
  return {
    ...tracking,
    visibleDocuments: documents,
  };
}

export async function getUnreadShipmentChats(pool, context, { limit = 10 } = {}) {
  requireCeoToolContext(context);
  const result = await pool.query(
    `SELECT t.id, t.name, t.type, t.shipment_id, s.shipment_code, m.unread_count, t.updated_at
     FROM chat_thread_members m
     JOIN chat_threads t ON t.id = m.thread_id AND t.organization_id = m.organization_id
     LEFT JOIN shipments s ON s.id = t.shipment_id AND s.organization_id = t.organization_id
     WHERE m.organization_id = $1
       AND m.user_id = $2
       AND m.status = 'active'
       AND m.unread_count > 0
       AND t.archived_at IS NULL
       AND t.type IN ('SHIPMENT', 'CUSTOMER_SHIPMENT')
     ORDER BY m.unread_count DESC, t.updated_at DESC
     LIMIT $3`,
    [context.organizationId, context.user.id, Math.min(Math.max(Number(limit) || 10, 1), 20)]
  );
  return result.rows.map((row) => ({
    id: row.id,
    name: cleanText(row.name),
    type: cleanText(row.type),
    shipmentId: cleanText(row.shipment_id),
    shipmentCode: cleanText(row.shipment_code),
    unreadCount: Number(row.unread_count || 0),
    updatedAt: isoTimestamp(row.updated_at),
    actionUrl: row.shipment_id ? `/shipments/${row.shipment_id}` : "/chat",
  }));
}

export async function getShipmentInternalChatSummary(pool, context, { shipmentId, limit = 3 } = {}) {
  requireCeoToolContext(context);
  if (!shipmentId) return null;
  const result = await pool.query(
    `SELECT m.id, m.sender_name, m.content, m.created_at
     FROM chat_threads t
     JOIN chat_messages m ON m.thread_id = t.id AND m.organization_id = t.organization_id
     WHERE t.organization_id = $1
       AND t.shipment_id = $2
       AND t.type = 'SHIPMENT'
       AND t.archived_at IS NULL
       AND m.status = 'sent'
     ORDER BY m.created_at DESC
     LIMIT $3`,
    [context.organizationId, shipmentId, Math.min(Math.max(Number(limit) || 3, 1), 5)]
  );
  return {
    shipmentId,
    messages: result.rows.map((row) => ({
      id: row.id,
      senderName: cleanText(row.sender_name),
      content: cleanText(row.content).slice(0, 240),
      createdAt: isoTimestamp(row.created_at),
    })),
  };
}

export async function getShipmentCustomerChatSummary(pool, context, { shipmentId, limit = 3 } = {}) {
  requireCeoToolContext(context);
  if (!shipmentId) return null;
  const result = await pool.query(
    `SELECT m.id, m.sender_name, m.sender_type, m.content, m.created_at
     FROM chat_threads t
     JOIN chat_messages m ON m.thread_id = t.id AND m.organization_id = t.organization_id
     WHERE t.organization_id = $1
       AND t.shipment_id = $2
       AND t.type = 'CUSTOMER_SHIPMENT'
       AND t.archived_at IS NULL
       AND m.status = 'sent'
     ORDER BY m.created_at DESC
     LIMIT $3`,
    [context.organizationId, shipmentId, Math.min(Math.max(Number(limit) || 3, 1), 5)]
  );
  return {
    shipmentId,
    messages: result.rows.map((row) => ({
      id: row.id,
      senderName: cleanText(row.sender_name),
      senderType: cleanText(row.sender_type),
      content: cleanText(row.content).slice(0, 240),
      createdAt: isoTimestamp(row.created_at),
    })),
  };
}

export async function searchArchivedRecords(pool, context, { query = "", limit = 10 } = {}) {
  requireCeoToolContext(context);
  const q = normalizeAiLookupCode(query).trim();
  if (q.length < 2) return [];
  const result = await pool.query(
    `SELECT id, entity_type, entity_id, title, summary, customer_name, shipment_id, archived_at, restored_at
     FROM archive_records
     WHERE organization_id = $1
       AND (title ILIKE $2 OR summary ILIKE $2 OR customer_name ILIKE $2 OR shipment_id ILIKE $2 OR entity_id ILIKE $2)
     ORDER BY archived_at DESC
     LIMIT $3`,
    [context.organizationId, `%${q}%`, Math.min(Math.max(Number(limit) || 10, 1), 20)]
  );
  return result.rows.map(archiveDto);
}

export async function getCustomerArchiveStatus(pool, context, { customerId } = {}) {
  requireCeoToolContext(context);
  if (!customerId) return null;
  const result = await pool.query(
    `SELECT c.id, c.customer_code, c.company_name, c.archived_at,
            a.id AS archive_id, a.title, a.summary, a.archived_at AS record_archived_at, a.restored_at
     FROM customers c
     LEFT JOIN archive_records a
       ON a.organization_id = c.organization_id
      AND a.entity_type = 'customer'
      AND a.entity_id = c.id
     WHERE c.id = $1 AND c.organization_id = $2
     LIMIT 1`,
    [customerId, context.organizationId]
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    customerId: row.id,
    customerCode: cleanText(row.customer_code),
    companyName: cleanText(row.company_name),
    isArchived: Boolean(row.archived_at || (row.archive_id && !row.restored_at)),
    archivedAt: isoTimestamp(row.archived_at || row.record_archived_at),
    restoredAt: isoTimestamp(row.restored_at),
    summary: cleanText(row.summary),
  };
}

export async function getShipmentAuditHistory(pool, context, { shipmentId, limit = 5 } = {}) {
  return getAuditHistory(pool, context, { resourceType: "shipment", resourceId: shipmentId, limit });
}

export async function getCustomerAuditHistory(pool, context, { customerId, limit = 5 } = {}) {
  return getAuditHistory(pool, context, { resourceType: "customer", resourceId: customerId, limit });
}

export async function getDocumentAuditHistory(pool, context, { documentId, limit = 5 } = {}) {
  return getAuditHistory(pool, context, { resourceType: "document", resourceId: documentId, limit });
}

async function getAuditHistory(pool, context, { resourceType, resourceId, limit = 5 } = {}) {
  requireCeoToolContext(context);
  if (!resourceType || !resourceId) return [];
  const result = await pool.query(
    `SELECT a.id, a.event_type, a.resource_type, a.resource_id, a.created_at, u.name AS actor_name
     FROM audit_logs a
     LEFT JOIN app_users u ON u.id = a.actor_user_id
     WHERE a.organization_id = $1
       AND a.resource_type = $2
       AND a.resource_id = $3
     ORDER BY a.created_at DESC
     LIMIT $4`,
    [context.organizationId, resourceType, resourceId, Math.min(Math.max(Number(limit) || 5, 1), 10)]
  );
  return result.rows.map(auditDto);
}

export async function getRecentOrganizationActivity(pool, context, { limit = 10 } = {}) {
  requireCeoToolContext(context);
  const result = await pool.query(
    `SELECT a.id, a.event_type, a.resource_type, a.resource_id, a.created_at, u.name AS actor_name
     FROM audit_logs a
     LEFT JOIN app_users u ON u.id = a.actor_user_id
     WHERE a.organization_id = $1
     ORDER BY a.created_at DESC
     LIMIT $2`,
    [context.organizationId, Math.min(Math.max(Number(limit) || 10, 1), 20)]
  );
  return result.rows.map(auditDto);
}

export async function searchEmployees(pool, context, { query = "", limit = 5 } = {}) {
  requireCeoToolContext(context);
  const q = normalizeAiLookupCode(query).trim();
  const params = [context.organizationId, Math.min(Math.max(Number(limit) || 5, 1), 10)];
  const whereSearch = q.length >= 2 ? "AND (u.name ILIKE $3 OR u.email ILIKE $3 OR u.department ILIKE $3)" : "";
  if (q.length >= 2) params.push(`%${q}%`);
  const result = await pool.query(
    `SELECT u.id, u.name, u.email, u.role, u.department, u.status, u.is_online, u.updated_at
     FROM app_users u
     JOIN organization_members m ON m.user_id = u.id
     WHERE m.organization_id = $1
       AND m.status = 'active'
       ${whereSearch}
     ORDER BY u.status ASC, u.name ASC
     LIMIT $2`,
    params
  );
  return result.rows.map(userDto);
}

export async function getEmployeeBasicInfo(pool, context, { userId } = {}) {
  requireCeoToolContext(context);
  if (!userId) return null;
  const result = await pool.query(
    `SELECT u.id, u.name, u.email, u.role, u.department, u.status, u.is_online, u.updated_at
     FROM app_users u
     JOIN organization_members m ON m.user_id = u.id
     WHERE m.organization_id = $1
       AND u.id = $2
     LIMIT 1`,
    [context.organizationId, userId]
  );
  return result.rows[0] ? userDto(result.rows[0]) : null;
}

export async function getActiveEmployeeCount(pool, context) {
  requireCeoToolContext(context);
  const result = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM app_users u
     JOIN organization_members m ON m.user_id = u.id
     WHERE m.organization_id = $1
       AND m.status = 'active'
       AND COALESCE(u.status, 'active') = 'active'`,
    [context.organizationId]
  );
  return Number(result.rows[0]?.count || 0);
}

export async function getEmployeeWorkload(pool, context, { userId } = {}) {
  return getEmployeeTaskSummary(pool, context, { userId });
}

export async function getOperationsSnapshot(pool, context) {
  requireCeoToolContext(context);
  const today = new Date().toISOString().slice(0, 10);
  const result = await pool.query(
    `SELECT
       (SELECT COUNT(*)::int FROM shipments WHERE organization_id = $1 AND archived_at IS NULL AND exited_archived_at IS NULL) AS active_shipments,
       (SELECT COUNT(*)::int FROM shipment_workflow_blockers WHERE organization_id = $1 AND status = 'open') AS blocked_shipments,
       (SELECT COUNT(*)::int FROM tasks WHERE organization_id = $1 AND status NOT IN ('DONE', 'CANCELLED') AND due_at < $2) AS overdue_tasks,
       (SELECT COUNT(*)::int FROM documents WHERE organization_id = $1 AND archived_at IS NULL) AS documents,
       (SELECT COUNT(*)::int FROM cheques WHERE organization_id = $1 AND archived_at IS NULL AND due_date >= $2 AND due_date <= $3) AS cheques_due_soon`,
    [context.organizationId, today, new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)]
  );
  const row = result.rows[0] || {};
  return {
    activeShipments: Number(row.active_shipments || 0),
    blockedShipments: Number(row.blocked_shipments || 0),
    overdueTasks: Number(row.overdue_tasks || 0),
    documents: Number(row.documents || 0),
    chequesDueSoon: Number(row.cheques_due_soon || 0),
  };
}

export async function getActiveShipmentCountsByStatus(pool, context) {
  requireCeoToolContext(context);
  const result = await pool.query(
    `SELECT status, COUNT(*)::int AS count
     FROM shipments
     WHERE organization_id = $1
       AND archived_at IS NULL
       AND exited_archived_at IS NULL
     GROUP BY status
     ORDER BY count DESC`,
    [context.organizationId]
  );
  return result.rows.map((row) => ({ status: row.status, count: Number(row.count || 0) }));
}

export async function getDelayedShipmentsSummary(pool, context) {
  return getShipmentsWaitingTooLong(pool, context, { days: 7, limit: 10 });
}

export async function getDocumentCompletenessSummary(pool, context) {
  requireCeoToolContext(context);
  const result = await pool.query(
    `SELECT
       COUNT(DISTINCT s.id)::int AS active_shipments,
       COUNT(DISTINCT d.shipment_id)::int AS shipments_with_documents
     FROM shipments s
     LEFT JOIN documents d
       ON d.shipment_id = s.id
      AND d.organization_id = s.organization_id
      AND d.archived_at IS NULL
     WHERE s.organization_id = $1
       AND s.archived_at IS NULL
       AND s.exited_archived_at IS NULL`,
    [context.organizationId]
  );
  const row = result.rows[0] || {};
  return {
    activeShipments: Number(row.active_shipments || 0),
    shipmentsWithDocuments: Number(row.shipments_with_documents || 0),
    unknownRequiredDocuments: true,
  };
}
