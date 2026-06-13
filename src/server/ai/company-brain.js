import {
  AI_BUSINESS_SEARCH_ENTITY_TYPES,
  normalizeAiBusinessSearchTerms,
  normalizeAiIndexText,
} from "./ai-search-index.js";

const CEO_ONLY_MESSAGE = "دسترسی به همیار لاجستیک در حال حاضر فقط برای مدیرعامل فعال است.";

export const COMPANY_BRAIN_MEMORY_TYPES = Object.freeze({
  COMPANY_SUMMARY: "company_summary",
  DAILY_SUMMARY: "daily_summary",
  OPERATIONAL_SNAPSHOT: "operational_snapshot",
});

export const COMPANY_BRAIN_ENTITY_TYPES = Object.freeze({
  SHIPMENT: "shipment",
  CUSTOMER: "customer",
  COMMERCIAL_CARD: "commercial_card",
  DOCUMENT: "document",
  WORKFLOW_ITEM: "workflow_item",
  TASK: "task",
  CHEQUE: "cheque",
});

const ALL_MEMORY_TYPES = Object.freeze(Object.values(COMPANY_BRAIN_MEMORY_TYPES));
const ALL_ENTITY_TYPES = Object.freeze(Object.values(COMPANY_BRAIN_ENTITY_TYPES));
const BUSINESS_TYPE_TO_MEMORY_TYPES = Object.freeze({
  shipment: ["shipment"],
  customer: ["customer"],
  commercial_card: ["commercial_card"],
  document: ["document"],
  workflow_item: ["workflow_item", "task"],
  cheque: ["cheque"],
});

const STALE_MEMORY_MESSAGE = "این اطلاعات از حافظه همیار است و ممکن است نیاز به به‌روزرسانی داشته باشد.";

function forbidden(message = CEO_ONLY_MESSAGE) {
  const error = new Error(message);
  error.statusCode = 403;
  error.code = "FORBIDDEN";
  return error;
}

function cleanText(value, fallback = "") {
  if (value === undefined || value === null) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function requireCeoMemoryContext(context = {}) {
  if (String(context.user?.role || "").toUpperCase() !== "CEO") {
    throw forbidden();
  }
  if (!context.organizationId) {
    throw forbidden("Active organization membership is required.");
  }
  return cleanText(context.organizationId);
}

function trustedOrganizationId(value, operation) {
  const organizationId = cleanText(value);
  if (!organizationId) {
    const error = new Error(`organizationId is required for ${operation}.`);
    error.code = "TENANT_SCOPE_REQUIRED";
    error.statusCode = 403;
    throw error;
  }
  return organizationId;
}

function boundedLimit(limit, fallback = 8, max = 12) {
  return Math.min(Math.max(Number(limit) || fallback, 1), max);
}

function compactCode(value = "") {
  return normalizeAiIndexText(value).replace(/[\s\-_/]+/g, "").toLowerCase();
}

function missingMemoryTable(error) {
  return error?.code === "42P01" || error?.code === "42703";
}

async function withClient(queryable, callback) {
  const client = typeof queryable.connect === "function" ? await queryable.connect() : queryable;
  const release = typeof client.release === "function" ? () => client.release() : () => {};
  try {
    return await callback(client);
  } finally {
    release();
  }
}

function normalizeMemoryTypes(memoryTypes = []) {
  const requested = Array.isArray(memoryTypes) ? memoryTypes.map(cleanText).filter(Boolean) : [];
  const filtered = requested.filter((type) => ALL_MEMORY_TYPES.includes(type));
  return filtered.length ? [...new Set(filtered)] : [...ALL_MEMORY_TYPES];
}

function normalizeCompanyBrainEntityTypes(candidateTypes = []) {
  const requested = Array.isArray(candidateTypes) && candidateTypes.length
    ? candidateTypes.map(cleanText).filter(Boolean)
    : [...AI_BUSINESS_SEARCH_ENTITY_TYPES];
  const types = [];
  for (const type of requested) {
    for (const memoryType of BUSINESS_TYPE_TO_MEMORY_TYPES[type] || []) {
      if (!types.includes(memoryType)) types.push(memoryType);
    }
    if (ALL_ENTITY_TYPES.includes(type) && !types.includes(type)) {
      types.push(type);
    }
  }
  return types.length ? types : [...ALL_ENTITY_TYPES];
}

function searchedPayload(queryTerms, candidateTypes, requestedField, requestedFields) {
  return {
    queryTerms,
    candidateTypes,
    requestedField,
    requestedFields: Array.isArray(requestedFields) ? requestedFields.map(cleanText).filter(Boolean) : [],
  };
}

function memoryFreshness(row = {}) {
  const staleAfter = row.stale_after ? new Date(row.stale_after) : null;
  const isStale = staleAfter ? staleAfter.getTime() < Date.now() : false;
  return {
    generatedAt: row.generated_at ? new Date(row.generated_at).toISOString() : "",
    sourceUpdatedAt: row.source_updated_at ? new Date(row.source_updated_at).toISOString() : "",
    staleAfter: staleAfter && !Number.isNaN(staleAfter.getTime()) ? staleAfter.toISOString() : "",
    isStale,
  };
}

function businessCandidateType(rowType) {
  return rowType === "task" ? "workflow_item" : rowType;
}

function businessCandidateId(row = {}) {
  if (row.entity_type === "task") return `task:${row.entity_id}`;
  return cleanText(row.entity_id);
}

function memoryItemToCandidate(row = {}) {
  const facts = row.facts && typeof row.facts === "object" ? row.facts : {};
  const matchedFields = Array.isArray(row.matched_terms) && row.matched_terms.length
    ? row.matched_terms
    : ["company_brain"];
  const freshness = memoryFreshness(row);
  return {
    type: businessCandidateType(row.entity_type),
    id: businessCandidateId(row),
    label: cleanText(row.title),
    matchedFields,
    score: Number(row.score || 0),
    safeSummary: {
      ...facts,
      entityCode: cleanText(row.entity_code),
      memoryGeneratedAt: freshness.generatedAt,
      memoryStaleAfter: freshness.staleAfter,
      memoryIsStale: freshness.isStale,
    },
    actionUrl: cleanText(facts.actionUrl),
    memory: {
      entityType: cleanText(row.entity_type),
      entityId: cleanText(row.entity_id),
      freshness,
    },
  };
}

function memoryRowToDto(row = {}) {
  return {
    id: cleanText(row.id),
    memoryType: cleanText(row.memory_type),
    title: cleanText(row.title),
    summary: cleanText(row.summary),
    facts: row.facts && typeof row.facts === "object" ? row.facts : {},
    freshness: memoryFreshness(row),
  };
}

function memoryItemRowToDto(row = {}) {
  return {
    id: cleanText(row.id),
    entityType: cleanText(row.entity_type),
    entityId: cleanText(row.entity_id),
    entityCode: cleanText(row.entity_code),
    title: cleanText(row.title),
    summary: cleanText(row.summary),
    facts: row.facts && typeof row.facts === "object" ? row.facts : {},
    freshness: memoryFreshness(row),
  };
}

function entityDeleteType(entityType) {
  if (entityType === "task") return "task";
  return entityType;
}

async function deleteEntityMemory(client, organizationId, entityType, entityId) {
  const storedType = entityDeleteType(entityType);
  const storedId = storedType === "workflow_item" && String(entityId).startsWith("blocker:")
    ? String(entityId)
    : String(entityId).replace(/^task:/, "").replace(/^blocker:/, "");
  await client.query(
    `DELETE FROM organization_ai_memory_items
     WHERE organization_id = $1
       AND entity_type = $2
       AND entity_id = $3`,
    [organizationId, storedType, storedId]
  );
}

function entityInsertSql(selectSql) {
  return `
    INSERT INTO organization_ai_memory_items (
      id, organization_id, entity_type, entity_id, entity_code, title, summary, facts,
      search_text, source_updated_at, generated_at, source_hash, stale_after, updated_at
    )
    ${selectSql}
    ON CONFLICT (organization_id, entity_type, entity_id) DO UPDATE SET
      entity_code = EXCLUDED.entity_code,
      title = EXCLUDED.title,
      summary = EXCLUDED.summary,
      facts = EXCLUDED.facts,
      search_text = EXCLUDED.search_text,
      source_updated_at = EXCLUDED.source_updated_at,
      generated_at = EXCLUDED.generated_at,
      source_hash = EXCLUDED.source_hash,
      stale_after = EXCLUDED.stale_after,
      updated_at = NOW()`;
}

function organizationMemoryInsertSql(selectSql) {
  return `
    INSERT INTO organization_ai_memory (
      id, organization_id, memory_type, title, summary, facts, search_text,
      source_version, source_hash, source_updated_at, generated_at, stale_after, updated_at
    )
    ${selectSql}
    ON CONFLICT (organization_id, memory_type) DO UPDATE SET
      title = EXCLUDED.title,
      summary = EXCLUDED.summary,
      facts = EXCLUDED.facts,
      search_text = EXCLUDED.search_text,
      source_version = EXCLUDED.source_version,
      source_hash = EXCLUDED.source_hash,
      source_updated_at = EXCLUDED.source_updated_at,
      generated_at = EXCLUDED.generated_at,
      stale_after = EXCLUDED.stale_after,
      updated_at = NOW()`;
}

async function upsertShipmentMemory(client, organizationId, shipmentId = "") {
  const result = await client.query(entityInsertSql(`
    WITH source_rows AS (
      SELECT
        s.id,
        s.organization_id,
        s.shipment_code,
        s.customer_id,
        COALESCE(c.company_name, c.contact_name, s.customer_name) AS customer_name,
        c.customer_code,
        s.status,
        s.origin,
        s.destination,
        s.estimated_delivery_at,
        s.created_at,
        GREATEST(
          COALESCE(s.updated_at, s.created_at),
          COALESCE(p.updated_at, s.updated_at, s.created_at),
          COALESCE(k.updated_at, s.updated_at, s.created_at)
        ) AS source_updated_at,
        COALESCE(NULLIF(p.sections_json #>> '{base,statusText}', ''), NULLIF(p.sections_json #>> '{base,currentStage}', ''), s.status) AS status_text,
        COALESCE(NULLIF(k.goods_summary, ''), NULLIF(profile_goods.goods_text, ''), NULLIF(legacy_goods.goods_text, '')) AS goods_description,
        COALESCE(NULLIF(p.sections_json #>> '{base,commercialCardDisplayName}', ''), NULLIF(p.sections_json #>> '{base,commercialCardId}', ''), NULLIF(k.commercial_card_id, '')) AS commercial_card,
        k.cotage_number,
        k.order_registration_number,
        k.bill_of_lading_number,
        k.bank_tracking_number
      FROM shipments s
      LEFT JOIN customers c ON c.id = s.customer_id AND c.organization_id = s.organization_id AND c.archived_at IS NULL
      LEFT JOIN shipment_v2_profiles p ON p.shipment_id = s.id AND p.organization_id = s.organization_id
      LEFT JOIN shipment_kootaj_details k ON k.shipment_id = s.id AND k.organization_id = s.organization_id
      LEFT JOIN LATERAL (
        SELECT string_agg(CONCAT_WS(' ', goods.item->>'description', goods.item->>'tariffCode', goods.item->>'tariffName', goods.item->>'packagingType'), ' ') AS goods_text
        FROM jsonb_array_elements(COALESCE(p.sections_json #> '{goods,goodsRows}', '[]'::jsonb)) AS goods(item)
      ) profile_goods ON TRUE
      LEFT JOIN LATERAL (
        SELECT string_agg(CONCAT_WS(' ', goods.item->>'description', goods.item->>'tariffCode', goods.item->>'tariffName', goods.item->>'packagingType'), ' ') AS goods_text
        FROM jsonb_array_elements(COALESCE(s.legacy_data #> '{goodsRows}', '[]'::jsonb)) AS goods(item)
      ) legacy_goods ON TRUE
      WHERE s.organization_id = $1
        AND s.archived_at IS NULL
        AND s.exited_archived_at IS NULL
        AND ($2::text IS NULL OR s.id = $2)
    )
    SELECT
      'shipment:' || id,
      organization_id,
      'shipment',
      id,
      COALESCE(NULLIF(shipment_code, ''), id),
      CONCAT_WS(' / ', 'محموله ' || COALESCE(NULLIF(shipment_code, ''), id), customer_name),
      CONCAT_WS('، ',
        'محموله ' || COALESCE(NULLIF(shipment_code, ''), id),
        CASE WHEN customer_name IS NOT NULL THEN 'مشتری: ' || customer_name END,
        CASE WHEN status_text IS NOT NULL THEN 'وضعیت: ' || status_text END,
        CASE WHEN goods_description IS NOT NULL THEN 'کالا: ' || left(goods_description, 180) END
      ),
      jsonb_strip_nulls(jsonb_build_object(
        'shipmentCode', COALESCE(NULLIF(shipment_code, ''), id),
        'customerId', customer_id,
        'customerName', customer_name,
        'customerCode', customer_code,
        'status', status_text,
        'goodsDescription', goods_description,
        'origin', origin,
        'destination', destination,
        'estimatedDeliveryAt', estimated_delivery_at,
        'commercialCard', commercial_card,
        'cotageNumber', cotage_number,
        'orderRegistrationNumber', order_registration_number,
        'billOfLadingNumber', bill_of_lading_number,
        'bankTrackingNumber', bank_tracking_number,
        'createdAt', created_at,
        'actionUrl', '/shipments/' || id
      )),
      CONCAT_WS(' ',
        'shipment cargo load بار محموله پرونده حمل کالا',
        id, shipment_code, customer_name, customer_code, status, status_text, origin, destination,
        goods_description, commercial_card, cotage_number, order_registration_number,
        bill_of_lading_number, bank_tracking_number
      ),
      source_updated_at,
      NOW(),
      md5(CONCAT_WS('|', id, shipment_code, customer_name, status_text, goods_description, source_updated_at::text)),
      NOW() + INTERVAL '24 hours',
      NOW()
    FROM source_rows`), [organizationId, shipmentId || null]);
  if (shipmentId && !result.rowCount) await deleteEntityMemory(client, organizationId, "shipment", shipmentId);
  return result.rowCount || 0;
}

async function upsertCustomerMemory(client, organizationId, customerId = "") {
  const result = await client.query(entityInsertSql(`
    SELECT
      'customer:' || c.id,
      c.organization_id,
      'customer',
      c.id,
      COALESCE(NULLIF(c.customer_code, ''), c.id),
      CONCAT_WS(' / ', COALESCE(NULLIF(c.company_name, ''), NULLIF(c.contact_name, ''), c.customer_code, c.id), c.customer_code),
      CONCAT_WS('، ',
        'مشتری ' || COALESCE(NULLIF(c.company_name, ''), NULLIF(c.contact_name, ''), c.customer_code, c.id),
        CASE WHEN c.customer_code IS NOT NULL THEN 'کد: ' || c.customer_code END,
        CASE WHEN c.status IS NOT NULL THEN 'وضعیت: ' || c.status END
      ),
      jsonb_strip_nulls(jsonb_build_object(
        'customerCode', c.customer_code,
        'customerName', COALESCE(NULLIF(c.company_name, ''), NULLIF(c.contact_name, ''), c.customer_code, c.id),
        'companyName', c.company_name,
        'contactName', c.contact_name,
        'status', c.status,
        'actionUrl', '/customers/' || c.id
      )),
      CONCAT_WS(' ',
        'customer client مشتری صاحب بار طرف حساب شرکت مخاطب',
        c.id, c.customer_code, c.company_name, c.contact_name, c.status, c.referrer
      ),
      COALESCE(c.updated_at, c.created_at),
      NOW(),
      md5(CONCAT_WS('|', c.id, c.customer_code, c.company_name, c.contact_name, c.status, COALESCE(c.updated_at, c.created_at)::text)),
      NOW() + INTERVAL '24 hours',
      NOW()
    FROM customers c
    WHERE c.organization_id = $1
      AND c.archived_at IS NULL
      AND ($2::text IS NULL OR c.id = $2)`), [organizationId, customerId || null]);
  if (customerId && !result.rowCount) await deleteEntityMemory(client, organizationId, "customer", customerId);
  return result.rowCount || 0;
}

async function upsertCommercialCardMemory(client, organizationId, cardId = "") {
  const result = await client.query(entityInsertSql(`
    WITH cards AS (
      SELECT DISTINCT ON (organization_id, COALESCE(data->>'id', item_id))
        organization_id,
        COALESCE(data->>'id', item_id) AS card_id,
        item_id,
        data,
        updated_at,
        created_at
      FROM user_records
      WHERE collection = 'commercialCards'
        AND organization_id = $1
        AND COALESCE(data->>'isArchived', 'false') <> 'true'
        AND COALESCE(data->>'archivedAt', '') = ''
        AND ($2::text IS NULL OR COALESCE(data->>'id', item_id) = $2 OR item_id = $2)
      ORDER BY organization_id, COALESCE(data->>'id', item_id), updated_at DESC
    )
    SELECT
      'commercial_card:' || card_id,
      organization_id,
      'commercial_card',
      card_id,
      COALESCE(NULLIF(data->>'cardNumber', ''), card_id),
      CONCAT_WS(' / ', 'کارت بازرگانی', NULLIF(data->>'displayName', ''), NULLIF(data->>'holderName', ''), NULLIF(data->>'companyName', ''), card_id),
      CONCAT_WS('، ',
        'کارت بازرگانی ' || COALESCE(NULLIF(data->>'displayName', ''), NULLIF(data->>'holderName', ''), NULLIF(data->>'companyName', ''), card_id),
        CASE WHEN NULLIF(data->>'status', '') IS NOT NULL THEN 'وضعیت: ' || (data->>'status') END
      ),
      jsonb_strip_nulls(jsonb_build_object(
        'displayName', COALESCE(NULLIF(data->>'displayName', ''), NULLIF(data->>'holderName', ''), NULLIF(data->>'companyName', ''), card_id),
        'holderName', data->>'holderName',
        'companyName', data->>'companyName',
        'responsibleName', data->>'responsibleName',
        'cardNumber', CASE
          WHEN length(regexp_replace(COALESCE(data->>'cardNumber', ''), '\\D', '', 'g')) >= 6
            THEN '****' || right(regexp_replace(COALESCE(data->>'cardNumber', ''), '\\D', '', 'g'), 4)
          ELSE NULLIF(data->>'cardNumber', '')
        END,
        'status', data->>'status',
        'actionUrl', '/daily-status'
      )),
      CONCAT_WS(' ',
        'commercial card کارت کارت بازرگانی',
        card_id, item_id, data->>'displayName', data->>'holderName', data->>'companyName',
        data->>'responsibleName', data->>'cardNumber', data->>'nationalId', data->>'status'
      ),
      COALESCE(updated_at, created_at),
      NOW(),
      md5(CONCAT_WS('|', card_id, data->>'displayName', data->>'holderName', data->>'companyName', data->>'cardNumber', data->>'status', COALESCE(updated_at, created_at)::text)),
      NOW() + INTERVAL '24 hours',
      NOW()
    FROM cards`), [organizationId, cardId || null]);
  if (cardId && !result.rowCount) await deleteEntityMemory(client, organizationId, "commercial_card", cardId);
  return result.rowCount || 0;
}

async function upsertDocumentMemory(client, organizationId, documentId = "") {
  const result = await client.query(entityInsertSql(`
    SELECT
      'document:' || d.id,
      d.organization_id,
      'document',
      d.id,
      COALESCE(NULLIF(d.file_name, ''), NULLIF(d.title, ''), d.id),
      CONCAT_WS(' / ', COALESCE(NULLIF(d.title, ''), NULLIF(d.file_name, ''), d.id), s.shipment_code, c.customer_code),
      CONCAT_WS('، ',
        'سند ' || COALESCE(NULLIF(d.title, ''), NULLIF(d.file_name, ''), d.id),
        CASE WHEN s.shipment_code IS NOT NULL THEN 'محموله: ' || s.shipment_code END,
        CASE WHEN COALESCE(c.company_name, c.contact_name) IS NOT NULL THEN 'مشتری: ' || COALESCE(c.company_name, c.contact_name) END
      ),
      jsonb_strip_nulls(jsonb_build_object(
        'title', COALESCE(NULLIF(d.title, ''), NULLIF(d.file_name, ''), d.id),
        'fileName', d.file_name,
        'documentType', COALESCE(NULLIF(d.legacy_data->>'type', ''), d.mime_type),
        'visibility', d.visibility,
        'shipmentId', d.shipment_id,
        'shipmentCode', s.shipment_code,
        'customerId', d.customer_id,
        'customerCode', c.customer_code,
        'customerName', COALESCE(c.company_name, c.contact_name),
        'actionUrl', '/documents'
      )),
      CONCAT_WS(' ',
        'document file سند مدرک فایل',
        d.id, d.title, d.file_name, d.mime_type, d.visibility, d.legacy_data->>'type',
        s.shipment_code, c.customer_code, c.company_name, c.contact_name
      ),
      COALESCE(d.updated_at, d.created_at),
      NOW(),
      md5(CONCAT_WS('|', d.id, d.title, d.file_name, d.mime_type, d.visibility, d.shipment_id, d.customer_id, COALESCE(d.updated_at, d.created_at)::text)),
      NOW() + INTERVAL '24 hours',
      NOW()
    FROM documents d
    LEFT JOIN shipments s ON s.id = d.shipment_id AND s.organization_id = d.organization_id
    LEFT JOIN customers c ON c.id = d.customer_id AND c.organization_id = d.organization_id
    WHERE d.organization_id = $1
      AND d.archived_at IS NULL
      AND ($2::text IS NULL OR d.id = $2)`), [organizationId, documentId || null]);
  if (documentId && !result.rowCount) await deleteEntityMemory(client, organizationId, "document", documentId);
  return result.rowCount || 0;
}

async function upsertTaskMemory(client, organizationId, taskId = "") {
  const result = await client.query(entityInsertSql(`
    SELECT
      'task:' || t.id,
      t.organization_id,
      'task',
      t.id,
      COALESCE(NULLIF(t.title, ''), t.id),
      CONCAT_WS(' / ', 'وظیفه', t.title, s.shipment_code, c.customer_code),
      CONCAT_WS('، ',
        'وظیفه ' || t.title,
        CASE WHEN t.status IS NOT NULL THEN 'وضعیت: ' || t.status END,
        CASE WHEN t.assigned_to_name IS NOT NULL THEN 'مسئول: ' || t.assigned_to_name END,
        CASE WHEN t.due_at IS NOT NULL THEN 'موعد: ' || t.due_at END
      ),
      jsonb_strip_nulls(jsonb_build_object(
        'workflowKind', 'task',
        'title', t.title,
        'status', t.status,
        'priority', t.priority,
        'assignedToName', t.assigned_to_name,
        'dueAt', t.due_at,
        'shipmentId', t.shipment_id,
        'shipmentCode', s.shipment_code,
        'customerId', t.customer_id,
        'customerCode', c.customer_code,
        'customerName', COALESCE(c.company_name, c.contact_name),
        'actionUrl', CASE WHEN t.shipment_id IS NOT NULL THEN '/shipments/' || t.shipment_id ELSE '/tasks' END
      )),
      CONCAT_WS(' ',
        'task workflow وظیفه تسک کار اقدام',
        t.id, t.title, t.status, t.priority, t.assigned_to_name, t.assigned_by_name,
        t.due_at, t.workflow_step_code, t.blocker_code, s.shipment_code, c.customer_code,
        c.company_name, c.contact_name
      ),
      COALESCE(t.updated_at, t.created_at),
      NOW(),
      md5(CONCAT_WS('|', t.id, t.title, t.status, t.priority, t.assigned_to_name, t.due_at, t.shipment_id, t.customer_id, COALESCE(t.updated_at, t.created_at)::text)),
      NOW() + INTERVAL '12 hours',
      NOW()
    FROM tasks t
    LEFT JOIN shipments s ON s.id = t.shipment_id AND s.organization_id = t.organization_id
    LEFT JOIN customers c ON c.id = t.customer_id AND c.organization_id = t.organization_id
    WHERE t.organization_id = $1
      AND ($2::text IS NULL OR t.id = $2)`), [organizationId, taskId || null]);
  if (taskId && !result.rowCount) await deleteEntityMemory(client, organizationId, "task", taskId);
  return result.rowCount || 0;
}

async function upsertWorkflowItemMemory(client, organizationId, workflowItemId = "") {
  const blockerId = cleanText(workflowItemId).replace(/^blocker:/, "");
  const result = await client.query(entityInsertSql(`
    SELECT
      'workflow_item:blocker:' || b.id,
      b.organization_id,
      'workflow_item',
      'blocker:' || b.id,
      COALESCE(NULLIF(b.blocker_code, ''), b.id),
      CONCAT_WS(' / ', 'مانع جریان کار', b.blocker_code, s.shipment_code, c.customer_code),
      CONCAT_WS('، ',
        'مانع جریان کار ' || b.blocker_code,
        CASE WHEN s.shipment_code IS NOT NULL THEN 'محموله: ' || s.shipment_code END,
        CASE WHEN b.status IS NOT NULL THEN 'وضعیت: ' || b.status END
      ),
      jsonb_strip_nulls(jsonb_build_object(
        'workflowKind', 'blocker',
        'blockerCode', b.blocker_code,
        'status', b.status,
        'stepCode', b.step_code,
        'shipmentId', b.shipment_id,
        'shipmentCode', s.shipment_code,
        'customerId', c.id,
        'customerCode', c.customer_code,
        'customerName', COALESCE(c.company_name, c.contact_name),
        'actionUrl', '/shipments/' || b.shipment_id
      )),
      CONCAT_WS(' ',
        'workflow blocker کار مرحله مانع پیگیری',
        b.id, b.blocker_code, b.status, b.step_code, b.public_note,
        s.shipment_code, c.customer_code, c.company_name, c.contact_name
      ),
      COALESCE(b.updated_at, b.created_at),
      NOW(),
      md5(CONCAT_WS('|', b.id, b.blocker_code, b.status, b.step_code, b.shipment_id, COALESCE(b.updated_at, b.created_at)::text)),
      NOW() + INTERVAL '12 hours',
      NOW()
    FROM shipment_workflow_blockers b
    JOIN shipments s ON s.id = b.shipment_id AND s.organization_id = b.organization_id
    LEFT JOIN customers c ON c.id = s.customer_id AND c.organization_id = s.organization_id
    WHERE b.organization_id = $1
      AND b.status = 'open'
      AND s.archived_at IS NULL
      AND s.exited_archived_at IS NULL
      AND ($2::text IS NULL OR b.id = $2 OR ('blocker:' || b.id) = $2)`), [organizationId, blockerId || null]);
  if (workflowItemId && !result.rowCount) await deleteEntityMemory(client, organizationId, "workflow_item", `blocker:${blockerId}`);
  return result.rowCount || 0;
}

async function upsertChequeMemory(client, organizationId, chequeId = "") {
  const result = await client.query(entityInsertSql(`
    SELECT
      'cheque:' || ch.id,
      ch.organization_id,
      'cheque',
      ch.id,
      COALESCE(NULLIF(ch.cheque_number, ''), ch.id),
      CONCAT_WS(' / ', 'چک ' || COALESCE(NULLIF(ch.cheque_number, ''), ch.id), ch.bank_name, ch.receiver, c.customer_code),
      CONCAT_WS('، ',
        'چک ' || COALESCE(NULLIF(ch.cheque_number, ''), ch.id),
        CASE WHEN ch.bank_name IS NOT NULL THEN 'بانک: ' || ch.bank_name END,
        CASE WHEN ch.status IS NOT NULL THEN 'وضعیت: ' || ch.status END,
        'مبلغ: ' || COALESCE(ch.amount::text, '0') || ' ' || COALESCE(ch.currency, 'IRR')
      ),
      jsonb_strip_nulls(jsonb_build_object(
        'chequeNumber', ch.cheque_number,
        'bankName', ch.bank_name,
        'amount', ch.amount,
        'currency', ch.currency,
        'dueDate', ch.due_date,
        'receiver', ch.receiver,
        'status', ch.status,
        'customerId', ch.customer_id,
        'customerCode', c.customer_code,
        'customerName', COALESCE(c.company_name, c.contact_name),
        'actionUrl', '/cheques'
      )),
      CONCAT_WS(' ',
        'cheque check payment چک پرداخت سررسید بانک وصول',
        ch.id, ch.bank_name, ch.cheque_number, ch.amount::text, ch.currency, ch.due_date,
        ch.location, ch.receiver, ch.status, c.customer_code, c.company_name, c.contact_name
      ),
      COALESCE(ch.updated_at, ch.created_at),
      NOW(),
      md5(CONCAT_WS('|', ch.id, ch.bank_name, ch.cheque_number, ch.amount::text, ch.currency, ch.due_date, ch.status, ch.customer_id, COALESCE(ch.updated_at, ch.created_at)::text)),
      NOW() + INTERVAL '12 hours',
      NOW()
    FROM cheques ch
    LEFT JOIN customers c ON c.id = ch.customer_id AND c.organization_id = ch.organization_id
    WHERE ch.organization_id = $1
      AND ch.archived_at IS NULL
      AND ($2::text IS NULL OR ch.id = $2)`), [organizationId, chequeId || null]);
  if (chequeId && !result.rowCount) await deleteEntityMemory(client, organizationId, "cheque", chequeId);
  return result.rowCount || 0;
}

async function upsertOrganizationMemories(client, organizationId) {
  const operational = await client.query(organizationMemoryInsertSql(`
    WITH stats AS (
      SELECT
        (SELECT COUNT(*)::int FROM shipments WHERE organization_id = $1 AND archived_at IS NULL AND exited_archived_at IS NULL) AS active_shipments,
        (SELECT COUNT(*)::int FROM shipment_workflow_blockers WHERE organization_id = $1 AND status = 'open') AS open_blockers,
        (SELECT COUNT(*)::int FROM tasks WHERE organization_id = $1 AND status NOT IN ('DONE', 'CANCELLED') AND due_at < CURRENT_DATE::text) AS overdue_tasks,
        (SELECT COUNT(*)::int FROM tasks WHERE organization_id = $1 AND status NOT IN ('DONE', 'CANCELLED') AND due_at = CURRENT_DATE::text) AS due_today_tasks,
        (SELECT COUNT(*)::int FROM documents WHERE organization_id = $1 AND archived_at IS NULL) AS active_documents,
        (SELECT COUNT(*)::int FROM cheques WHERE organization_id = $1 AND archived_at IS NULL AND due_date >= CURRENT_DATE::text AND due_date <= (CURRENT_DATE + INTERVAL '7 days')::date::text) AS cheques_due_soon,
        GREATEST(
          COALESCE((SELECT MAX(updated_at) FROM shipments WHERE organization_id = $1), 'epoch'::timestamptz),
          COALESCE((SELECT MAX(updated_at) FROM tasks WHERE organization_id = $1), 'epoch'::timestamptz),
          COALESCE((SELECT MAX(updated_at) FROM documents WHERE organization_id = $1), 'epoch'::timestamptz),
          COALESCE((SELECT MAX(updated_at) FROM cheques WHERE organization_id = $1), 'epoch'::timestamptz)
        ) AS source_updated_at
    )
    SELECT
      $1 || ':operational_snapshot',
      $1,
      'operational_snapshot',
      'نمای کلی عملیات شرکت',
      CONCAT_WS('، ',
        'محموله‌های فعال: ' || active_shipments,
        'موانع باز: ' || open_blockers,
        'وظایف معوق: ' || overdue_tasks,
        'وظایف امروز: ' || due_today_tasks,
        'اسناد فعال: ' || active_documents,
        'چک‌های نزدیک سررسید: ' || cheques_due_soon
      ),
      jsonb_build_object(
        'activeShipments', active_shipments,
        'openBlockers', open_blockers,
        'overdueTasks', overdue_tasks,
        'dueTodayTasks', due_today_tasks,
        'activeDocuments', active_documents,
        'chequesDueSoon', cheques_due_soon
      ),
      CONCAT_WS(' ',
        'company operations snapshot status overview وضعیت کلی شرکت عملیات',
        active_shipments::text, open_blockers::text, overdue_tasks::text, due_today_tasks::text,
        active_documents::text, cheques_due_soon::text
      ),
      'company_brain_v1',
      md5(CONCAT_WS('|', active_shipments::text, open_blockers::text, overdue_tasks::text, due_today_tasks::text, active_documents::text, cheques_due_soon::text, source_updated_at::text)),
      source_updated_at,
      NOW(),
      NOW() + INTERVAL '4 hours',
      NOW()
    FROM stats`), [organizationId]);

  const daily = await client.query(organizationMemoryInsertSql(`
    WITH stats AS (
      SELECT
        (SELECT COUNT(*)::int FROM shipments WHERE organization_id = $1 AND created_at >= CURRENT_DATE) AS shipments_created_today,
        (SELECT COUNT(*)::int FROM tasks WHERE organization_id = $1 AND created_at >= CURRENT_DATE) AS tasks_created_today,
        (SELECT COUNT(*)::int FROM task_events WHERE organization_id = $1 AND created_at >= CURRENT_DATE) AS task_events_today,
        (SELECT COUNT(*)::int FROM documents WHERE organization_id = $1 AND created_at >= CURRENT_DATE) AS documents_uploaded_today,
        (SELECT COUNT(*)::int FROM cheques WHERE organization_id = $1 AND created_at >= CURRENT_DATE) AS cheques_created_today,
        (SELECT COUNT(*)::int FROM audit_logs WHERE organization_id = $1 AND created_at >= CURRENT_DATE) AS audit_events_today,
        COALESCE((SELECT MAX(created_at) FROM audit_logs WHERE organization_id = $1), NOW()) AS source_updated_at
    )
    SELECT
      $1 || ':daily_summary',
      $1,
      'daily_summary',
      'خلاصه امروز شرکت',
      CONCAT_WS('، ',
        'محموله‌های ثبت‌شده امروز: ' || shipments_created_today,
        'وظایف جدید امروز: ' || tasks_created_today,
        'رویدادهای وظیفه امروز: ' || task_events_today,
        'اسناد بارگذاری‌شده امروز: ' || documents_uploaded_today,
        'چک‌های ثبت‌شده امروز: ' || cheques_created_today
      ),
      jsonb_build_object(
        'shipmentsCreatedToday', shipments_created_today,
        'tasksCreatedToday', tasks_created_today,
        'taskEventsToday', task_events_today,
        'documentsUploadedToday', documents_uploaded_today,
        'chequesCreatedToday', cheques_created_today,
        'auditEventsToday', audit_events_today
      ),
      CONCAT_WS(' ',
        'today daily summary اتفاقات امروز فعالیت امروز',
        shipments_created_today::text, tasks_created_today::text, task_events_today::text,
        documents_uploaded_today::text, cheques_created_today::text, audit_events_today::text
      ),
      'company_brain_v1',
      md5(CONCAT_WS('|', shipments_created_today::text, tasks_created_today::text, task_events_today::text, documents_uploaded_today::text, cheques_created_today::text, audit_events_today::text, source_updated_at::text)),
      source_updated_at,
      NOW(),
      NOW() + INTERVAL '4 hours',
      NOW()
    FROM stats`), [organizationId]);

  const company = await client.query(organizationMemoryInsertSql(`
    WITH stats AS (
      SELECT
        (SELECT COUNT(*)::int FROM customers WHERE organization_id = $1 AND archived_at IS NULL) AS customers,
        (SELECT COUNT(*)::int FROM shipments WHERE organization_id = $1 AND archived_at IS NULL) AS shipments,
        (SELECT COUNT(*)::int FROM shipments WHERE organization_id = $1 AND archived_at IS NULL AND exited_archived_at IS NULL) AS active_shipments,
        (SELECT COUNT(*)::int FROM tasks WHERE organization_id = $1 AND status NOT IN ('DONE', 'CANCELLED')) AS active_tasks,
        (SELECT COUNT(*)::int FROM documents WHERE organization_id = $1 AND archived_at IS NULL) AS documents,
        (SELECT COUNT(*)::int FROM cheques WHERE organization_id = $1 AND archived_at IS NULL) AS cheques,
        GREATEST(
          COALESCE((SELECT MAX(updated_at) FROM customers WHERE organization_id = $1), 'epoch'::timestamptz),
          COALESCE((SELECT MAX(updated_at) FROM shipments WHERE organization_id = $1), 'epoch'::timestamptz),
          COALESCE((SELECT MAX(updated_at) FROM tasks WHERE organization_id = $1), 'epoch'::timestamptz),
          COALESCE((SELECT MAX(updated_at) FROM documents WHERE organization_id = $1), 'epoch'::timestamptz),
          COALESCE((SELECT MAX(updated_at) FROM cheques WHERE organization_id = $1), 'epoch'::timestamptz)
        ) AS source_updated_at
    )
    SELECT
      $1 || ':company_summary',
      $1,
      'company_summary',
      'حافظه کلی شرکت',
      CONCAT_WS('، ',
        'مشتریان فعال: ' || customers,
        'کل محموله‌ها: ' || shipments,
        'محموله‌های در جریان: ' || active_shipments,
        'وظایف فعال: ' || active_tasks,
        'اسناد فعال: ' || documents,
        'چک‌های فعال: ' || cheques
      ),
      jsonb_build_object(
        'customers', customers,
        'shipments', shipments,
        'activeShipments', active_shipments,
        'activeTasks', active_tasks,
        'documents', documents,
        'cheques', cheques
      ),
      CONCAT_WS(' ',
        'company summary brain memory حافظه شرکت وضعیت کلی',
        customers::text, shipments::text, active_shipments::text, active_tasks::text,
        documents::text, cheques::text
      ),
      'company_brain_v1',
      md5(CONCAT_WS('|', customers::text, shipments::text, active_shipments::text, active_tasks::text, documents::text, cheques::text, source_updated_at::text)),
      source_updated_at,
      NOW(),
      NOW() + INTERVAL '4 hours',
      NOW()
    FROM stats`), [organizationId]);

  return {
    operationalSnapshot: operational.rowCount || 0,
    dailySummary: daily.rowCount || 0,
    companySummary: company.rowCount || 0,
  };
}

export async function buildEntityMemoryForShipment(queryable, context = {}, shipmentId = "") {
  const organizationId = trustedOrganizationId(context.organizationId, "buildEntityMemoryForShipment");
  return refreshCompanyBrainEntity(queryable, organizationId, "shipment", shipmentId);
}

export async function buildEntityMemoryForCustomer(queryable, context = {}, customerId = "") {
  const organizationId = trustedOrganizationId(context.organizationId, "buildEntityMemoryForCustomer");
  return refreshCompanyBrainEntity(queryable, organizationId, "customer", customerId);
}

export async function buildEntityMemoryForCommercialCard(queryable, context = {}, cardId = "") {
  const organizationId = trustedOrganizationId(context.organizationId, "buildEntityMemoryForCommercialCard");
  return refreshCompanyBrainEntity(queryable, organizationId, "commercial_card", cardId);
}

export async function buildEntityMemoryForDocument(queryable, context = {}, documentId = "") {
  const organizationId = trustedOrganizationId(context.organizationId, "buildEntityMemoryForDocument");
  return refreshCompanyBrainEntity(queryable, organizationId, "document", documentId);
}

export async function buildEntityMemoryForWorkflowItem(queryable, context = {}, workflowItemId = "") {
  const organizationId = trustedOrganizationId(context.organizationId, "buildEntityMemoryForWorkflowItem");
  return refreshCompanyBrainEntity(queryable, organizationId, "workflow_item", workflowItemId);
}

export async function buildEntityMemoryForTask(queryable, context = {}, taskId = "") {
  const organizationId = trustedOrganizationId(context.organizationId, "buildEntityMemoryForTask");
  return refreshCompanyBrainEntity(queryable, organizationId, "task", taskId);
}

export async function buildEntityMemoryForCheque(queryable, context = {}, chequeId = "") {
  const organizationId = trustedOrganizationId(context.organizationId, "buildEntityMemoryForCheque");
  return refreshCompanyBrainEntity(queryable, organizationId, "cheque", chequeId);
}

export async function refreshCompanyBrainEntity(queryable, organizationId, entityType, entityId) {
  const scopedOrganizationId = trustedOrganizationId(organizationId, "refreshCompanyBrainEntity");
  const type = cleanText(entityType);
  const id = cleanText(entityId);
  if (!type || !id) return { refreshed: false, reason: "missing_entity" };

  try {
    return await withClient(queryable, async (client) => {
      let count = 0;
      if (type === "shipment") count = await upsertShipmentMemory(client, scopedOrganizationId, id);
      else if (type === "customer") count = await upsertCustomerMemory(client, scopedOrganizationId, id);
      else if (type === "commercial_card") count = await upsertCommercialCardMemory(client, scopedOrganizationId, id);
      else if (type === "document") count = await upsertDocumentMemory(client, scopedOrganizationId, id);
      else if (type === "task") count = await upsertTaskMemory(client, scopedOrganizationId, id.replace(/^task:/, ""));
      else if (type === "workflow_item") {
        if (id.startsWith("task:")) count = await upsertTaskMemory(client, scopedOrganizationId, id.replace(/^task:/, ""));
        else count = await upsertWorkflowItemMemory(client, scopedOrganizationId, id);
      } else if (type === "cheque") count = await upsertChequeMemory(client, scopedOrganizationId, id);
      else return { refreshed: false, reason: "unsupported_entity_type" };

      const organizationMemory = await upsertOrganizationMemories(client, scopedOrganizationId);
      return {
        refreshed: true,
        entityType: type,
        entityId: id,
        count,
        organizationMemory,
      };
    });
  } catch (error) {
    if (missingMemoryTable(error)) {
      return { refreshed: false, reason: "memory_tables_missing" };
    }
    throw error;
  }
}

export async function rebuildCompanyBrainForOrganization(queryable, organizationId, _options = {}) {
  const scopedOrganizationId = trustedOrganizationId(organizationId, "rebuildCompanyBrainForOrganization");
  return withClient(queryable, async (client) => {
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM organization_ai_memory_items WHERE organization_id = $1", [scopedOrganizationId]);
      await client.query("DELETE FROM organization_ai_memory WHERE organization_id = $1", [scopedOrganizationId]);
      const organizationMemory = await upsertOrganizationMemories(client, scopedOrganizationId);
      const counts = {
        organizationMemory,
        shipments: await upsertShipmentMemory(client, scopedOrganizationId),
        customers: await upsertCustomerMemory(client, scopedOrganizationId),
        commercialCards: await upsertCommercialCardMemory(client, scopedOrganizationId),
        documents: await upsertDocumentMemory(client, scopedOrganizationId),
        tasks: await upsertTaskMemory(client, scopedOrganizationId),
        workflowItems: await upsertWorkflowItemMemory(client, scopedOrganizationId),
        cheques: await upsertChequeMemory(client, scopedOrganizationId),
      };
      await client.query("COMMIT");
      return {
        ...counts,
        totalItems: counts.shipments + counts.customers + counts.commercialCards + counts.documents + counts.tasks + counts.workflowItems + counts.cheques,
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    }
  });
}

export async function searchCompanyBrain(
  pool,
  context,
  { queryTerms = [], candidateTypes = [], requestedField = "summary", requestedFields = [], limit = 8 } = {}
) {
  const organizationId = requireCeoMemoryContext(context);
  const terms = normalizeAiBusinessSearchTerms(queryTerms);
  const requestedTypes = normalizeCompanyBrainEntityTypes(candidateTypes);
  const searched = searchedPayload(terms, requestedTypes, requestedField, requestedFields);
  if (!terms.length) {
    return { candidates: [], searched, memoryAvailable: true };
  }

  const queryText = terms.join(" ");
  const patterns = terms.map((term) => `%${term.replace(/[%_\\]/g, " ")}%`);
  const compactTerms = terms.map(compactCode).filter(Boolean);
  const bounded = boundedLimit(limit);

  try {
    const result = await pool.query(
      `WITH search_input AS (
         SELECT websearch_to_tsquery('simple', $2) AS tsq, $2::text AS query_text
       ),
       ranked AS (
         SELECT
           i.entity_type,
           i.entity_id,
           i.entity_code,
           i.title,
           i.summary,
           i.facts,
           i.source_updated_at,
           i.generated_at,
           i.stale_after,
           ts_rank_cd(i.search_vector, search_input.tsq) AS fts_rank,
           GREATEST(similarity(lower(i.title), $2), similarity(lower(i.summary), $2), similarity(lower(i.search_text), $2)) AS trigram_rank,
           ARRAY(
             SELECT term
             FROM unnest($3::text[]) AS term
             WHERE lower(i.title) LIKE '%' || term || '%'
                OR lower(i.summary) LIKE '%' || term || '%'
                OR lower(i.search_text) LIKE '%' || term || '%'
           ) AS matched_terms,
           (
             lower(i.entity_id) = ANY($3::text[])
             OR lower(COALESCE(i.entity_code, '')) = ANY($3::text[])
             OR lower(i.title) = ANY($3::text[])
             OR regexp_replace(lower(COALESCE(i.entity_id, '')), '[^a-z0-9]', '', 'g') = ANY($5::text[])
             OR regexp_replace(lower(COALESCE(i.entity_code, '')), '[^a-z0-9]', '', 'g') = ANY($5::text[])
             OR lower(COALESCE(i.facts->>'shipmentCode', '')) = ANY($3::text[])
             OR lower(COALESCE(i.facts->>'customerCode', '')) = ANY($3::text[])
             OR lower(COALESCE(i.facts->>'chequeNumber', '')) = ANY($3::text[])
           ) AS exact_match
         FROM organization_ai_memory_items i
         CROSS JOIN search_input
         WHERE i.organization_id = $1
           AND i.entity_type = ANY($6::text[])
           AND (
             i.search_vector @@ search_input.tsq
             OR lower(i.entity_id) = ANY($3::text[])
             OR lower(COALESCE(i.entity_code, '')) = ANY($3::text[])
             OR i.title ILIKE ANY($4::text[])
             OR i.summary ILIKE ANY($4::text[])
             OR i.search_text ILIKE ANY($4::text[])
             OR i.title % search_input.query_text
             OR i.summary % search_input.query_text
             OR i.search_text % search_input.query_text
           )
       )
       SELECT
         entity_type,
         entity_id,
         entity_code,
         title,
         summary,
         facts,
         source_updated_at,
         generated_at,
         stale_after,
         matched_terms,
         ROUND(LEAST(
           0.99,
           (CASE WHEN exact_match THEN 0.7 ELSE 0.22 END)
           + LEAST(0.22, fts_rank * 2.0)
           + LEAST(0.24, trigram_rank * 0.56)
           + LEAST(0.2, cardinality(matched_terms) * 0.06)
           + CASE WHEN stale_after IS NULL OR stale_after >= NOW() THEN 0.04 ELSE -0.08 END
         )::numeric, 2) AS score
       FROM ranked
       WHERE exact_match
          OR cardinality(matched_terms) > 0
          OR fts_rank > 0
          OR trigram_rank >= 0.16
       ORDER BY score DESC, cardinality(matched_terms) DESC, source_updated_at DESC NULLS LAST, title ASC
       LIMIT $7`,
      [organizationId, queryText, terms, patterns, compactTerms, requestedTypes, bounded]
    );
    return {
      candidates: result.rows.map(memoryItemToCandidate),
      searched,
      memoryAvailable: true,
    };
  } catch (error) {
    if (missingMemoryTable(error)) {
      return { candidates: [], searched, memoryAvailable: false };
    }
    throw error;
  }
}

export async function getCompanyBrainSnapshot(pool, context, { memoryTypes = [], limit = 6 } = {}) {
  const organizationId = requireCeoMemoryContext(context);
  const requestedTypes = normalizeMemoryTypes(memoryTypes);
  const bounded = boundedLimit(limit, 6, 10);
  try {
    const [memoryResult, recentResult] = await Promise.all([
      pool.query(
        `SELECT id, memory_type, title, summary, facts, source_updated_at, generated_at, stale_after
         FROM organization_ai_memory
         WHERE organization_id = $1
           AND memory_type = ANY($2::text[])
         ORDER BY CASE memory_type
           WHEN 'operational_snapshot' THEN 0
           WHEN 'daily_summary' THEN 1
           WHEN 'company_summary' THEN 2
           ELSE 3
         END, generated_at DESC`,
        [organizationId, requestedTypes]
      ),
      pool.query(
        `SELECT entity_type, entity_id, entity_code, title, summary, facts, source_updated_at, generated_at, stale_after
         FROM organization_ai_memory_items
         WHERE organization_id = $1
         ORDER BY source_updated_at DESC NULLS LAST, updated_at DESC
         LIMIT $2`,
        [organizationId, bounded]
      ),
    ]);

    return {
      memoryAvailable: true,
      memories: memoryResult.rows.map(memoryRowToDto),
      recentItems: recentResult.rows.map(memoryItemRowToDto),
      staleMessage: STALE_MEMORY_MESSAGE,
    };
  } catch (error) {
    if (missingMemoryTable(error)) {
      return { memoryAvailable: false, memories: [], recentItems: [], staleMessage: STALE_MEMORY_MESSAGE };
    }
    throw error;
  }
}

export { STALE_MEMORY_MESSAGE };
