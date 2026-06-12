const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

export const AI_BUSINESS_ENTITY_TYPES = Object.freeze({
  SHIPMENT: "shipment",
  CUSTOMER: "customer",
  COMMERCIAL_CARD: "commercial_card",
  DOCUMENT: "document",
  WORKFLOW_ITEM: "workflow_item",
  CHEQUE: "cheque",
});

export const AI_BUSINESS_SEARCH_ENTITY_TYPES = Object.freeze(Object.values(AI_BUSINESS_ENTITY_TYPES));

const ENTITY_ALIASES = Object.freeze({
  shipment: "shipment cargo load بار محموله پرونده حمل کالا",
  customer: "customer client مشتری صاحب بار طرف حساب شرکت مخاطب",
  commercial_card: "commercial card کارت بازرگانی کارت ترخیص صاحب کارت",
  document: "document file سند اسناد مدرک مدارک فایل بارنامه قبض",
  workflow_item: "workflow task blocker کار وظیفه تسک مرحله مانع پیگیری اقدام",
  cheque: "cheque check payment چک پرداخت سررسید بانک وصول",
});

function cleanText(value, fallback = "") {
  if (value === undefined || value === null) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function normalizeDigits(value = "") {
  return String(value)
    .replace(/[۰-۹]/g, (digit) => String(PERSIAN_DIGITS.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String(ARABIC_DIGITS.indexOf(digit)));
}

export function normalizeAiIndexText(value = "") {
  return normalizeDigits(value)
    .replace(/[يى]/g, "ی")
    .replace(/[ك]/g, "ک")
    .replace(/\u200c/g, " ")
    .replace(/[؟?.,،؛:!()[\]{}"']/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function compactCode(value = "") {
  return normalizeDigits(value).replace(/[\s\-_/]+/g, "").toLowerCase();
}

function boundedLimit(limit, fallback = 8, max = 12) {
  return Math.min(Math.max(Number(limit) || fallback, 1), max);
}

export function normalizeAiBusinessSearchTerms(queryTerms = []) {
  const sourceTerms = Array.isArray(queryTerms) ? queryTerms : [queryTerms];
  const seen = new Set();
  const terms = [];
  for (const item of sourceTerms) {
    const term = normalizeAiIndexText(item);
    if (!term || term.length < 2 || seen.has(term)) continue;
    seen.add(term);
    terms.push(term);
    if (terms.length >= 10) break;
  }
  return terms;
}

export function normalizeAiBusinessEntityTypes(candidateTypes = []) {
  const requested = Array.isArray(candidateTypes)
    ? candidateTypes.map((type) => cleanText(type)).filter(Boolean)
    : [];
  const filtered = requested.filter((type) => AI_BUSINESS_SEARCH_ENTITY_TYPES.includes(type));
  return filtered.length ? [...new Set(filtered)] : [...AI_BUSINESS_SEARCH_ENTITY_TYPES];
}

function toCandidate(row = {}) {
  const safeSummary = row.safe_summary && typeof row.safe_summary === "object" ? row.safe_summary : {};
  const matchedFields = Array.isArray(row.matched_terms) && row.matched_terms.length
    ? row.matched_terms
    : ["search_text"];
  return {
    type: cleanText(row.entity_type),
    id: cleanText(row.entity_id),
    label: cleanText(row.title),
    matchedFields,
    score: Number(row.score || 0),
    safeSummary,
    actionUrl: cleanText(row.action_url),
  };
}

export async function searchAiBusinessIndex(
  pool,
  context,
  { queryTerms = [], candidateTypes = [], limit = 8 } = {}
) {
  const terms = normalizeAiBusinessSearchTerms(queryTerms);
  if (!terms.length) {
    return {
      candidates: [],
      searched: { queryTerms: [], candidateTypes: [] },
      indexAvailable: true,
    };
  }

  const queryText = terms.join(" ");
  const patterns = terms.map((term) => `%${term.replace(/[%_\\]/g, " ")}%`);
  const compactTerms = terms.map(compactCode).filter(Boolean);
  const requestedTypes = normalizeAiBusinessEntityTypes(candidateTypes);
  const bounded = boundedLimit(limit);

  try {
    const result = await pool.query(
      `WITH search_input AS (
         SELECT
           websearch_to_tsquery('simple', $2) AS tsq,
           $2::text AS query_text
       ),
       ranked AS (
         SELECT
           i.entity_type,
           i.entity_id,
           i.title,
           i.safe_summary,
           i.action_url,
           i.source_updated_at,
           ts_rank_cd(i.search_vector, search_input.tsq) AS fts_rank,
           GREATEST(similarity(lower(i.title), $2), similarity(lower(i.search_text), $2)) AS trigram_rank,
           ARRAY(
             SELECT term
             FROM unnest($3::text[]) AS term
             WHERE lower(i.title) LIKE '%' || term || '%'
                OR lower(i.search_text) LIKE '%' || term || '%'
           ) AS matched_terms,
           (
             lower(i.entity_id) = ANY($3::text[])
             OR lower(i.title) = ANY($3::text[])
             OR regexp_replace(lower(COALESCE(i.entity_id, '')), '[^a-z0-9]', '', 'g') = ANY($5::text[])
             OR regexp_replace(lower(COALESCE(i.title, '')), '[^a-z0-9]', '', 'g') = ANY($5::text[])
             OR lower(COALESCE(i.safe_summary->>'shipmentCode', '')) = ANY($3::text[])
             OR lower(COALESCE(i.safe_summary->>'customerCode', '')) = ANY($3::text[])
             OR lower(COALESCE(i.safe_summary->>'chequeNumber', '')) = ANY($3::text[])
             OR lower(COALESCE(i.safe_summary->>'cardNumber', '')) = ANY($3::text[])
           ) AS exact_match
         FROM ai_business_search_index i
         CROSS JOIN search_input
         WHERE i.organization_id = $1
           AND i.entity_type = ANY($6::text[])
           AND (
             i.search_vector @@ search_input.tsq
             OR lower(i.entity_id) = ANY($3::text[])
             OR i.title ILIKE ANY($4::text[])
             OR i.search_text ILIKE ANY($4::text[])
             OR i.title % search_input.query_text
             OR i.search_text % search_input.query_text
           )
       )
       SELECT
         entity_type,
         entity_id,
         title,
         safe_summary,
         action_url,
         matched_terms,
         ROUND(LEAST(
           0.99,
           (CASE WHEN exact_match THEN 0.72 ELSE 0.2 END)
           + LEAST(0.22, fts_rank * 2.0)
           + LEAST(0.26, trigram_rank * 0.58)
           + LEAST(0.24, cardinality(matched_terms) * 0.06)
           + GREATEST(0, 0.08 - ((COALESCE(array_position($6::text[], entity_type), 8) - 1) * 0.015))
         )::numeric, 2) AS score,
         source_updated_at
       FROM ranked
       WHERE exact_match
          OR cardinality(matched_terms) > 0
          OR fts_rank > 0
          OR trigram_rank >= 0.16
       ORDER BY score DESC, cardinality(matched_terms) DESC, source_updated_at DESC NULLS LAST, title ASC
       LIMIT $7`,
      [context.organizationId, queryText, terms, patterns, compactTerms, requestedTypes, bounded]
    );
    return {
      candidates: result.rows.map(toCandidate),
      searched: { queryTerms: terms, candidateTypes: requestedTypes },
      indexAvailable: true,
    };
  } catch (error) {
    if (error?.code === "42P01" || error?.code === "42703") {
      return {
        candidates: [],
        searched: { queryTerms: terms, candidateTypes: requestedTypes },
        indexAvailable: false,
      };
    }
    throw error;
  }
}

function insertSql(entityType, selectSql) {
  return `
    INSERT INTO ai_business_search_index (
      id, organization_id, entity_type, entity_id, title, search_text, safe_summary, action_url, source_updated_at, indexed_at
    )
    ${selectSql}
    ON CONFLICT (organization_id, entity_type, entity_id) DO UPDATE SET
      title = EXCLUDED.title,
      search_text = EXCLUDED.search_text,
      safe_summary = EXCLUDED.safe_summary,
      action_url = EXCLUDED.action_url,
      source_updated_at = EXCLUDED.source_updated_at,
      indexed_at = NOW()
    WHERE ai_business_search_index.entity_type = '${entityType}'`;
}

async function rebuildShipments(client, organizationId) {
  const values = [];
  const organizationFilter = organizationId ? `AND s.organization_id = $${values.push(organizationId)}` : "";
  const result = await client.query(insertSql("shipment", `
    SELECT
      'shipment:' || s.id AS id,
      s.organization_id,
      'shipment' AS entity_type,
      s.id AS entity_id,
      CONCAT_WS(' / ', 'محموله ' || COALESCE(NULLIF(s.shipment_code, ''), s.id), COALESCE(c.company_name, c.contact_name, s.customer_name)) AS title,
      CONCAT_WS(' ',
        '${ENTITY_ALIASES.shipment}',
        s.id,
        s.shipment_code,
        s.customer_name,
        c.customer_code,
        c.company_name,
        c.contact_name,
        s.status,
        s.origin,
        s.destination,
        s.estimated_delivery_at,
        s.legacy_data->>'trackingNumber',
        s.legacy_data->>'referenceNumber',
        s.legacy_data->>'containerNumber',
        s.legacy_data->>'recipient',
        s.legacy_data->>'sender',
        s.legacy_data->>'notes',
        p.sections_json #>> '{base,statusText}',
        p.sections_json #>> '{base,currentStage}',
        p.sections_json #>> '{base,consigneeName}',
        p.sections_json #>> '{base,shipperName}',
        p.sections_json #>> '{base,commercialCardId}',
        p.sections_json #>> '{base,commercialCardDisplayName}',
        p.sections_json #>> '{base,malvaniDisplayName}',
        p.sections_json #>> '{base,orderRegistrationNumber}',
        k.cotage_number,
        k.declaration_reference,
        k.bill_of_lading_number,
        k.order_registration_number,
        k.bank_tracking_number,
        k.goods_summary,
        k.container_summary,
        profile_goods.goods_text,
        legacy_goods.goods_text
      ) AS search_text,
      jsonb_strip_nulls(jsonb_build_object(
        'shipmentCode', COALESCE(NULLIF(s.shipment_code, ''), s.id),
        'customerName', COALESCE(c.company_name, c.contact_name, s.customer_name),
        'customerCode', c.customer_code,
        'customerId', s.customer_id,
        'status', COALESCE(NULLIF(p.sections_json #>> '{base,statusText}', ''), NULLIF(p.sections_json #>> '{base,currentStage}', ''), s.status),
        'goodsDescription', COALESCE(NULLIF(k.goods_summary, ''), NULLIF(profile_goods.goods_text, ''), NULLIF(legacy_goods.goods_text, '')),
        'origin', COALESCE(NULLIF(p.sections_json #>> '{base,origin}', ''), s.origin),
        'destination', COALESCE(NULLIF(p.sections_json #>> '{base,deliveryPort}', ''), s.destination),
        'commercialCardId', COALESCE(NULLIF(p.sections_json #>> '{base,commercialCardId}', ''), NULLIF(k.commercial_card_id, '')),
        'commercialCardDisplayName', p.sections_json #>> '{base,commercialCardDisplayName}',
        'actionUrl', '/shipments/' || s.id
      )) AS safe_summary,
      '/shipments/' || s.id AS action_url,
      GREATEST(COALESCE(s.updated_at, s.created_at), COALESCE(p.updated_at, s.updated_at, s.created_at), COALESCE(k.updated_at, s.updated_at, s.created_at)) AS source_updated_at,
      NOW()
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
    WHERE s.organization_id IS NOT NULL
      AND s.archived_at IS NULL
      AND s.exited_archived_at IS NULL
      ${organizationFilter}`), values);
  return result.rowCount || 0;
}

async function rebuildCustomers(client, organizationId) {
  const values = [];
  const organizationFilter = organizationId ? `AND c.organization_id = $${values.push(organizationId)}` : "";
  const result = await client.query(insertSql("customer", `
    WITH phones AS (
      SELECT
        organization_id,
        customer_id,
        string_agg(CONCAT_WS(' ', phone_number, phone_label, note), ' ' ORDER BY is_primary DESC, sort_order ASC, created_at ASC) AS phone_text,
        (array_agg(phone_number ORDER BY is_primary DESC, sort_order ASC, created_at ASC))[1] AS primary_phone
      FROM customer_phone_numbers
      WHERE archived_at IS NULL
      GROUP BY organization_id, customer_id
    )
    SELECT
      'customer:' || c.id AS id,
      c.organization_id,
      'customer' AS entity_type,
      c.id AS entity_id,
      CONCAT_WS(' / ', COALESCE(NULLIF(c.company_name, ''), NULLIF(c.contact_name, ''), c.customer_code, c.id), c.customer_code) AS title,
      CONCAT_WS(' ',
        '${ENTITY_ALIASES.customer}',
        c.id,
        c.customer_code,
        c.company_name,
        c.contact_name,
        c.email,
        c.phone,
        phones.phone_text,
        c.address,
        c.referrer,
        c.notes,
        c.status,
        c.legacy_data->>'nationalId',
        c.legacy_data->>'taxId',
        c.legacy_data->>'nationalCode'
      ) AS search_text,
      jsonb_strip_nulls(jsonb_build_object(
        'customerCode', c.customer_code,
        'customerName', COALESCE(NULLIF(c.company_name, ''), NULLIF(c.contact_name, ''), c.customer_code, c.id),
        'contactName', c.contact_name,
        'companyName', c.company_name,
        'status', c.status,
        'actionUrl', '/customers/' || c.id
      )) AS safe_summary,
      '/customers/' || c.id AS action_url,
      COALESCE(c.updated_at, c.created_at) AS source_updated_at,
      NOW()
    FROM customers c
    LEFT JOIN phones ON phones.organization_id = c.organization_id AND phones.customer_id = c.id
    WHERE c.organization_id IS NOT NULL
      AND c.archived_at IS NULL
      ${organizationFilter}`), values);
  return result.rowCount || 0;
}

async function rebuildCommercialCards(client, organizationId) {
  const values = [];
  const organizationFilter = organizationId ? `AND cards.organization_id = $${values.push(organizationId)}` : "";
  const result = await client.query(insertSql("commercial_card", `
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
        AND organization_id IS NOT NULL
        AND COALESCE(data->>'isArchived', 'false') <> 'true'
        AND COALESCE(data->>'archivedAt', '') = ''
      ORDER BY organization_id, COALESCE(data->>'id', item_id), updated_at DESC
    )
    SELECT
      'commercial_card:' || cards.card_id AS id,
      cards.organization_id,
      'commercial_card' AS entity_type,
      cards.card_id AS entity_id,
      CONCAT_WS(' / ', 'کارت بازرگانی', NULLIF(cards.data->>'displayName', ''), NULLIF(cards.data->>'holderName', ''), NULLIF(cards.data->>'companyName', ''), cards.card_id) AS title,
      CONCAT_WS(' ',
        '${ENTITY_ALIASES.commercial_card}',
        cards.card_id,
        cards.item_id,
        cards.data->>'displayName',
        cards.data->>'holderName',
        cards.data->>'companyName',
        cards.data->>'responsibleName',
        cards.data->>'responsiblePhone',
        cards.data->>'cardNumber',
        cards.data->>'nationalId',
        cards.data->>'status',
        cards.data->>'description'
      ) AS search_text,
      jsonb_strip_nulls(jsonb_build_object(
        'displayName', COALESCE(NULLIF(cards.data->>'displayName', ''), NULLIF(cards.data->>'holderName', ''), NULLIF(cards.data->>'companyName', ''), cards.card_id),
        'holderName', cards.data->>'holderName',
        'companyName', cards.data->>'companyName',
        'responsibleName', cards.data->>'responsibleName',
        'cardNumber', CASE
          WHEN length(regexp_replace(COALESCE(cards.data->>'cardNumber', ''), '\\D', '', 'g')) >= 6
            THEN '****' || right(regexp_replace(COALESCE(cards.data->>'cardNumber', ''), '\\D', '', 'g'), 4)
          ELSE NULLIF(cards.data->>'cardNumber', '')
        END,
        'status', cards.data->>'status',
        'actionUrl', '/daily-status'
      )) AS safe_summary,
      '/daily-status' AS action_url,
      COALESCE(cards.updated_at, cards.created_at) AS source_updated_at,
      NOW()
    FROM cards
    WHERE TRUE
      ${organizationFilter}`), values);
  return result.rowCount || 0;
}

async function rebuildDocuments(client, organizationId) {
  const values = [];
  const organizationFilter = organizationId ? `AND d.organization_id = $${values.push(organizationId)}` : "";
  const result = await client.query(insertSql("document", `
    SELECT
      'document:' || d.id AS id,
      d.organization_id,
      'document' AS entity_type,
      d.id AS entity_id,
      CONCAT_WS(' / ', COALESCE(NULLIF(d.title, ''), NULLIF(d.file_name, ''), d.id), s.shipment_code, c.customer_code) AS title,
      CONCAT_WS(' ',
        '${ENTITY_ALIASES.document}',
        d.id,
        d.title,
        d.file_name,
        d.mime_type,
        d.visibility,
        d.legacy_data->>'type',
        d.legacy_data->>'note',
        s.shipment_code,
        c.customer_code,
        c.company_name,
        c.contact_name
      ) AS search_text,
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
      )) AS safe_summary,
      '/documents' AS action_url,
      COALESCE(d.updated_at, d.created_at) AS source_updated_at,
      NOW()
    FROM documents d
    LEFT JOIN shipments s ON s.id = d.shipment_id AND s.organization_id = d.organization_id
    LEFT JOIN customers c ON c.id = d.customer_id AND c.organization_id = d.organization_id
    WHERE d.organization_id IS NOT NULL
      AND d.archived_at IS NULL
      ${organizationFilter}`), values);
  return result.rowCount || 0;
}

async function rebuildWorkflowItems(client, organizationId) {
  const values = [];
  const taskOrganizationFilter = organizationId ? `AND t.organization_id = $${values.push(organizationId)}` : "";
  const blockerOrganizationFilter = organizationId ? `AND b.organization_id = $${values.push(organizationId)}` : "";
  const result = await client.query(insertSql("workflow_item", `
    SELECT
      'workflow_item:task:' || t.id AS id,
      t.organization_id,
      'workflow_item' AS entity_type,
      'task:' || t.id AS entity_id,
      CONCAT_WS(' / ', 'وظیفه', t.title, s.shipment_code, c.customer_code) AS title,
      CONCAT_WS(' ',
        '${ENTITY_ALIASES.workflow_item}',
        'task',
        t.id,
        t.title,
        t.description,
        t.status,
        t.priority,
        t.assigned_to_name,
        t.assigned_by_name,
        t.due_at,
        t.workflow_step_code,
        t.blocker_code,
        s.shipment_code,
        c.customer_code,
        c.company_name,
        c.contact_name
      ) AS search_text,
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
        'actionUrl', CASE WHEN t.shipment_id IS NOT NULL THEN '/shipments/' || t.shipment_id ELSE '/tasks' END
      )) AS safe_summary,
      CASE WHEN t.shipment_id IS NOT NULL THEN '/shipments/' || t.shipment_id ELSE '/tasks' END AS action_url,
      COALESCE(t.updated_at, t.created_at) AS source_updated_at,
      NOW()
    FROM tasks t
    LEFT JOIN shipments s ON s.id = t.shipment_id AND s.organization_id = t.organization_id
    LEFT JOIN customers c ON c.id = t.customer_id AND c.organization_id = t.organization_id
    WHERE t.organization_id IS NOT NULL
      AND t.status NOT IN ('DONE', 'CANCELLED')
      ${taskOrganizationFilter}
    UNION ALL
    SELECT
      'workflow_item:blocker:' || b.id AS id,
      b.organization_id,
      'workflow_item' AS entity_type,
      'blocker:' || b.id AS entity_id,
      CONCAT_WS(' / ', 'مانع جریان کار', b.blocker_code, s.shipment_code, c.customer_code) AS title,
      CONCAT_WS(' ',
        '${ENTITY_ALIASES.workflow_item}',
        'blocker',
        b.id,
        b.blocker_code,
        b.status,
        b.step_code,
        b.internal_note,
        b.public_note,
        s.shipment_code,
        c.customer_code,
        c.company_name,
        c.contact_name
      ) AS search_text,
      jsonb_strip_nulls(jsonb_build_object(
        'workflowKind', 'blocker',
        'blockerCode', b.blocker_code,
        'status', b.status,
        'stepCode', b.step_code,
        'shipmentId', b.shipment_id,
        'shipmentCode', s.shipment_code,
        'customerId', c.id,
        'customerCode', c.customer_code,
        'actionUrl', '/shipments/' || b.shipment_id
      )) AS safe_summary,
      '/shipments/' || b.shipment_id AS action_url,
      COALESCE(b.updated_at, b.created_at) AS source_updated_at,
      NOW()
    FROM shipment_workflow_blockers b
    JOIN shipments s ON s.id = b.shipment_id AND s.organization_id = b.organization_id
    LEFT JOIN customers c ON c.id = s.customer_id AND c.organization_id = s.organization_id
    WHERE b.organization_id IS NOT NULL
      AND b.status = 'open'
      AND s.archived_at IS NULL
      AND s.exited_archived_at IS NULL
      ${blockerOrganizationFilter}`), values);
  return result.rowCount || 0;
}

async function rebuildCheques(client, organizationId) {
  const values = [];
  const organizationFilter = organizationId ? `AND ch.organization_id = $${values.push(organizationId)}` : "";
  const result = await client.query(insertSql("cheque", `
    SELECT
      'cheque:' || ch.id AS id,
      ch.organization_id,
      'cheque' AS entity_type,
      ch.id AS entity_id,
      CONCAT_WS(' / ', 'چک ' || COALESCE(NULLIF(ch.cheque_number, ''), ch.id), ch.bank_name, ch.receiver, c.customer_code) AS title,
      CONCAT_WS(' ',
        '${ENTITY_ALIASES.cheque}',
        ch.id,
        ch.bank_name,
        ch.cheque_number,
        ch.amount::text,
        ch.currency,
        ch.due_date,
        ch.location,
        ch.receiver,
        ch.status,
        ch.description,
        c.customer_code,
        c.company_name,
        c.contact_name
      ) AS search_text,
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
      )) AS safe_summary,
      '/cheques' AS action_url,
      COALESCE(ch.updated_at, ch.created_at) AS source_updated_at,
      NOW()
    FROM cheques ch
    LEFT JOIN customers c ON c.id = ch.customer_id AND c.organization_id = ch.organization_id
    WHERE ch.organization_id IS NOT NULL
      AND ch.archived_at IS NULL
      ${organizationFilter}`), values);
  return result.rowCount || 0;
}

export async function rebuildAiBusinessSearchIndex(queryable, { organizationId = "" } = {}) {
  const client = typeof queryable.connect === "function" ? await queryable.connect() : queryable;
  const release = typeof client.release === "function" ? () => client.release() : () => {};
  const scopedOrganizationId = cleanText(organizationId);
  const deleteValues = scopedOrganizationId ? [scopedOrganizationId] : [];
  const deleteWhere = scopedOrganizationId ? "WHERE organization_id = $1" : "";

  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM ai_business_search_index ${deleteWhere}`, deleteValues);
    const counts = {
      shipments: await rebuildShipments(client, scopedOrganizationId),
      customers: await rebuildCustomers(client, scopedOrganizationId),
      commercialCards: await rebuildCommercialCards(client, scopedOrganizationId),
      documents: await rebuildDocuments(client, scopedOrganizationId),
      workflowItems: await rebuildWorkflowItems(client, scopedOrganizationId),
      cheques: await rebuildCheques(client, scopedOrganizationId),
    };
    await client.query("COMMIT");
    return {
      ...counts,
      total: Object.values(counts).reduce((sum, count) => sum + Number(count || 0), 0),
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    release();
  }
}
