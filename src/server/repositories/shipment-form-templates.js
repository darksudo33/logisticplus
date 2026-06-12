import crypto from "node:crypto";
import {
  CANONICAL_SHIPMENT_FORM_FIELDS,
  DEFAULT_SHIPMENT_TYPE_CODE,
  SHIPMENT_TYPES,
  getCanonicalShipmentFormField,
  normalizeShipmentTypeCode,
  shipmentTypeByCode,
} from "../../shared/shipment-form-fields.js";
import { requireOrganizationScope } from "../tenant-scope.js";
import { withTransaction } from "../transaction.js";

const CUSTOM_FIELD_TYPES = new Set(["text", "textarea", "number", "date", "select"]);

function jsonValue(value, fallback) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }
  return value;
}

function templateTypeDefaults(shipmentTypeCode) {
  const type = shipmentTypeByCode.get(normalizeShipmentTypeCode(shipmentTypeCode));
  return {
    shipmentTypeCode: type?.code || DEFAULT_SHIPMENT_TYPE_CODE,
    shipmentDirection: type?.direction || "import",
    transportMode: type?.transportMode || null,
  };
}

function toTemplateSummary(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id || null,
    code: row.code,
    shipmentTypeCode: normalizeShipmentTypeCode(row.shipment_type_code),
    titleFa: row.title_fa,
    description: row.description || "",
    isSystem: Boolean(row.is_system),
    isActive: Boolean(row.is_active),
    version: Number(row.version || 1),
    createdById: row.created_by_id || null,
    updatedById: row.updated_by_id || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    archivedAt: row.archived_at || null,
  };
}

function toSection(row) {
  return {
    id: row.id,
    templateId: row.template_id,
    sectionKey: row.section_key,
    titleFa: row.title_fa,
    description: row.description || "",
    sortOrder: Number(row.sort_order || 0),
    isCollapsedByDefault: Boolean(row.is_collapsed_by_default),
    fields: [],
  };
}

function toField(row) {
  const canonical = row.field_source === "canonical" ? getCanonicalShipmentFormField(row.field_key) : null;
  return {
    id: row.id,
    templateId: row.template_id,
    sectionId: row.section_id,
    fieldKey: row.field_key,
    fieldSource: row.field_source,
    fieldType: row.field_type || canonical?.fieldType || "text",
    labelFa: row.label_fa || canonical?.labelFa || row.field_key,
    helperText: row.helper_text || canonical?.helperText || "",
    placeholder: row.placeholder || "",
    sortOrder: Number(row.sort_order || 0),
    isVisible: Boolean(row.is_visible),
    isRequired: Boolean(row.is_required),
    isImportant: Boolean(row.is_important),
    showInShipmentDetail: Boolean(row.show_in_shipment_detail),
    showInDailyStatus: Boolean(row.show_in_daily_status),
    showInCreateForm: Boolean(row.show_in_create_form),
    validationJson: jsonValue(row.validation_json, {}),
    optionsJson: jsonValue(row.options_json, canonical?.options || []),
    archivedAt: row.archived_at || null,
    canonical: canonical
      ? {
          labelEn: canonical.labelEn,
          sourceEntity: canonical.sourceEntity,
          apiFieldName: canonical.apiFieldName,
          editable: canonical.editable,
          aliases: canonical.aliases || [],
          publicVisibility: canonical.publicVisibility || "private",
        }
      : null,
  };
}

async function composeTemplate(queryable, row) {
  const summary = toTemplateSummary(row);
  if (!summary) return null;
  const [sectionsResult, fieldsResult] = await Promise.all([
    queryable.query(
      `SELECT *
       FROM shipment_form_template_sections
       WHERE template_id = $1
       ORDER BY sort_order ASC, created_at ASC`,
      [summary.id]
    ),
    queryable.query(
      `SELECT *
       FROM shipment_form_template_fields
       WHERE template_id = $1
         AND archived_at IS NULL
       ORDER BY sort_order ASC, created_at ASC`,
      [summary.id]
    ),
  ]);
  const sectionMap = new Map();
  const sections = sectionsResult.rows.map((sectionRow) => {
    const section = toSection(sectionRow);
    sectionMap.set(section.id, section);
    return section;
  });
  for (const fieldRow of fieldsResult.rows) {
    const section = sectionMap.get(fieldRow.section_id);
    if (section) section.fields.push(toField(fieldRow));
  }
  return { ...summary, sections };
}

async function listCandidateTemplateRows(queryable, { organizationId, shipmentTypeCode } = {}) {
  const scopedOrganizationId = requireOrganizationScope(organizationId, "listShipmentFormTemplates");
  const values = [scopedOrganizationId];
  const typeFilter = shipmentTypeCode ? `AND shipment_type_code = $${values.push(normalizeShipmentTypeCode(shipmentTypeCode))}` : "";
  const result = await queryable.query(
    `SELECT *
     FROM shipment_form_templates
     WHERE archived_at IS NULL
       AND (organization_id = $1 OR organization_id IS NULL)
       ${typeFilter}
     ORDER BY
       shipment_type_code ASC,
       CASE WHEN organization_id = $1 THEN 0 ELSE 1 END ASC,
       is_active DESC,
       version DESC,
       updated_at DESC`,
    values
  );
  return result.rows;
}

export async function listShipmentFormTemplates(queryable, { organizationId, shipmentTypeCode } = {}) {
  const rows = await listCandidateTemplateRows(queryable, { organizationId, shipmentTypeCode });
  const effective = new Map();
  for (const row of rows) {
    const key = normalizeShipmentTypeCode(row.shipment_type_code);
    if (!effective.has(key)) effective.set(key, row);
  }
  const templates = [];
  for (const row of effective.values()) {
    templates.push(await composeTemplate(queryable, row));
  }
  return templates;
}

export async function getShipmentFormTemplate(queryable, { organizationId, templateId } = {}) {
  const scopedOrganizationId = requireOrganizationScope(organizationId, "getShipmentFormTemplate");
  const result = await queryable.query(
    `SELECT *
     FROM shipment_form_templates
     WHERE id = $1
       AND archived_at IS NULL
       AND (organization_id = $2 OR organization_id IS NULL)
     LIMIT 1`,
    [templateId, scopedOrganizationId]
  );
  return composeTemplate(queryable, result.rows[0] || null);
}

export async function getActiveShipmentFormTemplate(queryable, { organizationId, shipmentTypeCode } = {}) {
  const scopedOrganizationId = requireOrganizationScope(organizationId, "getActiveShipmentFormTemplate");
  const typeCode = normalizeShipmentTypeCode(shipmentTypeCode);
  const result = await queryable.query(
    `SELECT *
     FROM shipment_form_templates
     WHERE archived_at IS NULL
       AND is_active = TRUE
       AND shipment_type_code = $2
       AND (organization_id = $1 OR organization_id IS NULL)
     ORDER BY CASE WHEN organization_id = $1 THEN 0 ELSE 1 END ASC, version DESC, updated_at DESC
     LIMIT 1`,
    [scopedOrganizationId, typeCode]
  );
  return composeTemplate(queryable, result.rows[0] || null);
}

export async function getActiveShipmentFormTemplateForShipment(queryable, { organizationId, shipmentId } = {}) {
  const scopedOrganizationId = requireOrganizationScope(organizationId, "getActiveShipmentFormTemplateForShipment");
  const shipmentResult = await queryable.query(
    `SELECT id, shipment_type_code, shipment_direction, transport_mode
     FROM shipments
     WHERE id = $1
       AND organization_id = $2
       AND archived_at IS NULL
     LIMIT 1`,
    [shipmentId, scopedOrganizationId]
  );
  const shipment = shipmentResult.rows[0];
  if (!shipment) return null;
  const defaults = templateTypeDefaults(shipment.shipment_type_code);
  const template = await getActiveShipmentFormTemplate(queryable, {
    organizationId: scopedOrganizationId,
    shipmentTypeCode: shipment.shipment_type_code || defaults.shipmentTypeCode,
  });
  return {
    shipment: {
      id: shipment.id,
      shipmentTypeCode: normalizeShipmentTypeCode(shipment.shipment_type_code),
      shipmentDirection: shipment.shipment_direction || defaults.shipmentDirection,
      transportMode: shipment.transport_mode || defaults.transportMode,
    },
    template,
  };
}

async function cloneTemplateForOrganization(client, sourceTemplate, { organizationId, actorUserId } = {}) {
  const clonedTemplateId = crypto.randomUUID();
  const newCode = sourceTemplate.code;
  const templateResult = await client.query(
    `INSERT INTO shipment_form_templates (
       id, organization_id, code, shipment_type_code, title_fa, description,
       is_system, is_active, version, created_by_id, updated_by_id, created_at, updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, FALSE, $7, $8, $9, $9, NOW(), NOW())
     RETURNING *`,
    [
      clonedTemplateId,
      organizationId,
      newCode,
      sourceTemplate.shipmentTypeCode,
      sourceTemplate.titleFa,
      sourceTemplate.description,
      sourceTemplate.isActive,
      sourceTemplate.version,
      actorUserId || null,
    ]
  );
  const sectionIdMap = new Map();
  for (const section of sourceTemplate.sections) {
    const clonedSectionId = crypto.randomUUID();
    sectionIdMap.set(section.id, clonedSectionId);
    await client.query(
      `INSERT INTO shipment_form_template_sections (
         id, template_id, section_key, title_fa, description, sort_order,
         is_collapsed_by_default, created_at, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`,
      [
        clonedSectionId,
        clonedTemplateId,
        section.sectionKey,
        section.titleFa,
        section.description,
        section.sortOrder,
        section.isCollapsedByDefault,
      ]
    );
  }
  for (const section of sourceTemplate.sections) {
    for (const field of section.fields) {
      await client.query(
        `INSERT INTO shipment_form_template_fields (
           id, template_id, section_id, field_key, field_source, field_type, label_fa,
           helper_text, placeholder, sort_order, is_visible, is_required, is_important,
           show_in_shipment_detail, show_in_daily_status, show_in_create_form,
           validation_json, options_json, created_at, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17::jsonb, $18::jsonb, NOW(), NOW())`,
        [
          crypto.randomUUID(),
          clonedTemplateId,
          sectionIdMap.get(section.id),
          field.fieldKey,
          field.fieldSource,
          field.fieldType,
          field.labelFa,
          field.helperText,
          field.placeholder,
          field.sortOrder,
          field.isVisible,
          field.isRequired,
          field.isImportant,
          field.showInShipmentDetail,
          field.showInDailyStatus,
          field.showInCreateForm,
          JSON.stringify(field.validationJson || {}),
          JSON.stringify(field.optionsJson || []),
        ]
      );
    }
  }
  return templateResult.rows[0];
}

async function ensureMutableTemplate(client, { organizationId, templateId, actorUserId } = {}) {
  const source = await getShipmentFormTemplate(client, { organizationId, templateId });
  if (!source) {
    const error = new Error("Shipment form template was not found.");
    error.statusCode = 404;
    error.code = "SHIPMENT_FORM_TEMPLATE_NOT_FOUND";
    throw error;
  }
  if (source.organizationId === organizationId) return source;
  const cloned = await cloneTemplateForOrganization(client, source, { organizationId, actorUserId });
  return composeTemplate(client, cloned);
}

async function resolveSectionId(client, template, { sectionId, sectionKey } = {}) {
  let key = sectionKey || null;
  if (!key && sectionId) {
    const original = await client.query(
      "SELECT section_key FROM shipment_form_template_sections WHERE id = $1 LIMIT 1",
      [sectionId]
    );
    key = original.rows[0]?.section_key || null;
  }
  const section = key
    ? template.sections.find((item) => item.sectionKey === key)
    : template.sections.find((item) => item.id === sectionId);
  if (!section) {
    const error = new Error("Template section was not found.");
    error.statusCode = 404;
    error.code = "SHIPMENT_FORM_TEMPLATE_SECTION_NOT_FOUND";
    throw error;
  }
  return section.id;
}

function validateFieldDefinition(body) {
  const canonical = body.fieldSource === "canonical" ? getCanonicalShipmentFormField(body.fieldKey) : null;
  if (body.fieldSource === "canonical" && !canonical) {
    const error = new Error("Canonical shipment form field is not registered.");
    error.statusCode = 400;
    error.code = "UNKNOWN_CANONICAL_FIELD";
    throw error;
  }
  if (body.fieldSource === "custom" && !CUSTOM_FIELD_TYPES.has(body.fieldType || "text")) {
    const error = new Error("Custom field type is not allowed in V1.");
    error.statusCode = 400;
    error.code = "UNSUPPORTED_CUSTOM_FIELD_TYPE";
    throw error;
  }
  const fieldType = body.fieldSource === "canonical" ? canonical.fieldType : body.fieldType || "text";
  return {
    fieldType,
    optionsJson: fieldType === "select" ? body.optionsJson || canonical?.options || [] : [],
    validationJson: body.fieldSource === "custom" ? body.validationJson || {} : {},
  };
}

export async function createShipmentFormTemplate(pool, { organizationId, actorUserId, body } = {}) {
  const scopedOrganizationId = requireOrganizationScope(organizationId, "createShipmentFormTemplate");
  return withTransaction(pool, async (client) => {
    const typeCode = normalizeShipmentTypeCode(body.shipmentTypeCode);
    const type = shipmentTypeByCode.get(typeCode);
    const code = body.code || `custom-${typeCode.toLowerCase().replace(/_/g, "-")}`;
    const result = await client.query(
      `INSERT INTO shipment_form_templates (
         id, organization_id, code, shipment_type_code, title_fa, description,
         is_system, is_active, version, created_by_id, updated_by_id, created_at, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, FALSE, $7, 1, $8, $8, NOW(), NOW())
       RETURNING *`,
      [
        crypto.randomUUID(),
        scopedOrganizationId,
        code,
        typeCode,
        body.titleFa,
        body.description || type?.description || "",
        body.isActive !== false,
        actorUserId || null,
      ]
    );
    const sectionResult = await client.query(
      `INSERT INTO shipment_form_template_sections (
         id, template_id, section_key, title_fa, sort_order, created_at, updated_at
       )
       VALUES ($1, $2, 'base', 'اطلاعات پایه', 1, NOW(), NOW())
       RETURNING *`,
      [crypto.randomUUID(), result.rows[0].id]
    );
    await client.query(
      `INSERT INTO shipment_form_template_fields (
         id, template_id, section_id, field_key, field_source, field_type, label_fa, sort_order,
         is_visible, is_required, is_important, show_in_shipment_detail, show_in_daily_status,
         show_in_create_form, validation_json, options_json, created_at, updated_at
       )
       VALUES ($1, $2, $3, 'shipmentCode', 'canonical', 'readonly', 'کد محموله / شماره پرونده', 1,
         TRUE, FALSE, FALSE, TRUE, TRUE, TRUE, '{}'::jsonb, '[]'::jsonb, NOW(), NOW())`,
      [crypto.randomUUID(), result.rows[0].id, sectionResult.rows[0].id]
    );
    return composeTemplate(client, result.rows[0]);
  });
}

export async function updateShipmentFormTemplate(pool, { organizationId, templateId, actorUserId, body } = {}) {
  const scopedOrganizationId = requireOrganizationScope(organizationId, "updateShipmentFormTemplate");
  return withTransaction(pool, async (client) => {
    const mutable = await ensureMutableTemplate(client, {
      organizationId: scopedOrganizationId,
      templateId,
      actorUserId,
    });
    const columns = [];
    const values = [mutable.id, scopedOrganizationId];
    const addColumn = (column, value) => {
      values.push(value);
      columns.push(`${column} = $${values.length}`);
    };
    if (body.titleFa !== undefined) addColumn("title_fa", body.titleFa);
    if (body.description !== undefined) addColumn("description", body.description || "");
    if (body.isActive !== undefined) addColumn("is_active", body.isActive);
    addColumn("updated_by_id", actorUserId || null);
    if (columns.length) {
      await client.query(
        `UPDATE shipment_form_templates
         SET ${columns.join(", ")}, version = version + 1, updated_at = NOW()
         WHERE id = $1 AND organization_id = $2`,
        values
      );
    }
    for (const section of body.sections || []) {
      const sectionId = await resolveSectionId(client, mutable, section);
      const sectionColumns = [];
      const sectionValues = [sectionId, mutable.id];
      const addSectionColumn = (column, value) => {
        sectionValues.push(value);
        sectionColumns.push(`${column} = $${sectionValues.length}`);
      };
      if (section.titleFa !== undefined) addSectionColumn("title_fa", section.titleFa);
      if (section.description !== undefined) addSectionColumn("description", section.description || "");
      if (section.sortOrder !== undefined) addSectionColumn("sort_order", Math.trunc(Number(section.sortOrder)));
      if (section.isCollapsedByDefault !== undefined) addSectionColumn("is_collapsed_by_default", section.isCollapsedByDefault);
      if (sectionColumns.length) {
        await client.query(
          `UPDATE shipment_form_template_sections
           SET ${sectionColumns.join(", ")}, updated_at = NOW()
           WHERE id = $1 AND template_id = $2`,
          sectionValues
        );
      }
    }
    const updated = await getShipmentFormTemplate(client, {
      organizationId: scopedOrganizationId,
      templateId: mutable.id,
    });
    return { before: mutable, after: updated, templateId: mutable.id, forked: mutable.id !== templateId };
  });
}

export async function addShipmentFormTemplateField(pool, { organizationId, templateId, actorUserId, body } = {}) {
  const scopedOrganizationId = requireOrganizationScope(organizationId, "addShipmentFormTemplateField");
  return withTransaction(pool, async (client) => {
    const mutable = await ensureMutableTemplate(client, {
      organizationId: scopedOrganizationId,
      templateId,
      actorUserId,
    });
    const sectionId = await resolveSectionId(client, mutable, body);
    const validated = validateFieldDefinition(body);
    const result = await client.query(
      `INSERT INTO shipment_form_template_fields (
         id, template_id, section_id, field_key, field_source, field_type, label_fa,
         helper_text, placeholder, sort_order, is_visible, is_required, is_important,
         show_in_shipment_detail, show_in_daily_status, show_in_create_form,
         validation_json, options_json, created_at, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17::jsonb, $18::jsonb, NOW(), NOW())
       ON CONFLICT (template_id, field_key) DO UPDATE SET
         section_id = EXCLUDED.section_id,
         field_source = EXCLUDED.field_source,
         field_type = EXCLUDED.field_type,
         label_fa = EXCLUDED.label_fa,
         helper_text = EXCLUDED.helper_text,
         placeholder = EXCLUDED.placeholder,
         sort_order = EXCLUDED.sort_order,
         is_visible = EXCLUDED.is_visible,
         is_required = EXCLUDED.is_required,
         is_important = EXCLUDED.is_important,
         show_in_shipment_detail = EXCLUDED.show_in_shipment_detail,
         show_in_daily_status = EXCLUDED.show_in_daily_status,
         show_in_create_form = EXCLUDED.show_in_create_form,
         validation_json = EXCLUDED.validation_json,
         options_json = EXCLUDED.options_json,
         archived_at = NULL,
         updated_at = NOW()
       RETURNING *`,
      [
        crypto.randomUUID(),
        mutable.id,
        sectionId,
        body.fieldKey,
        body.fieldSource,
        validated.fieldType,
        body.labelFa,
        body.helperText || "",
        body.placeholder || "",
        Math.trunc(Number(body.sortOrder || 0)),
        body.isVisible !== false,
        Boolean(body.isRequired),
        Boolean(body.isImportant),
        body.showInShipmentDetail !== false,
        body.showInDailyStatus !== false,
        Boolean(body.showInCreateForm),
        JSON.stringify(validated.validationJson),
        JSON.stringify(validated.optionsJson),
      ]
    );
    await client.query(
      "UPDATE shipment_form_templates SET version = version + 1, updated_by_id = $2, updated_at = NOW() WHERE id = $1",
      [mutable.id, actorUserId || null]
    );
    const updated = await getShipmentFormTemplate(client, {
      organizationId: scopedOrganizationId,
      templateId: mutable.id,
    });
    return { before: mutable, after: updated, field: toField(result.rows[0]), templateId: mutable.id, forked: mutable.id !== templateId };
  });
}

export async function updateShipmentFormTemplateField(pool, { organizationId, templateId, fieldId, actorUserId, body } = {}) {
  const scopedOrganizationId = requireOrganizationScope(organizationId, "updateShipmentFormTemplateField");
  return withTransaction(pool, async (client) => {
    const mutable = await ensureMutableTemplate(client, {
      organizationId: scopedOrganizationId,
      templateId,
      actorUserId,
    });
    let mutableFieldId = fieldId;
    const originalField = mutable.sections.flatMap((section) => section.fields).find((field) => field.id === fieldId);
    if (!originalField) {
      const original = await client.query("SELECT field_key FROM shipment_form_template_fields WHERE id = $1 LIMIT 1", [fieldId]);
      const fieldKey = original.rows[0]?.field_key;
      const clonedField = mutable.sections.flatMap((section) => section.fields).find((field) => field.fieldKey === fieldKey);
      mutableFieldId = clonedField?.id || fieldId;
    }
    const field = mutable.sections.flatMap((section) => section.fields).find((item) => item.id === mutableFieldId);
    if (!field) {
      const error = new Error("Template field was not found.");
      error.statusCode = 404;
      error.code = "SHIPMENT_FORM_TEMPLATE_FIELD_NOT_FOUND";
      throw error;
    }
    const columns = [];
    const values = [mutableFieldId, mutable.id];
    const addColumn = (column, value) => {
      values.push(value);
      columns.push(`${column} = $${values.length}`);
    };
    if (body.sectionId !== undefined) addColumn("section_id", await resolveSectionId(client, mutable, { sectionId: body.sectionId }));
    if (body.labelFa !== undefined) addColumn("label_fa", body.labelFa);
    if (body.helperText !== undefined) addColumn("helper_text", body.helperText || "");
    if (body.placeholder !== undefined) addColumn("placeholder", body.placeholder || "");
    if (body.sortOrder !== undefined) addColumn("sort_order", Math.trunc(Number(body.sortOrder)));
    if (body.isVisible !== undefined) addColumn("is_visible", body.isVisible);
    if (body.isRequired !== undefined) addColumn("is_required", body.isRequired);
    if (body.isImportant !== undefined) addColumn("is_important", body.isImportant);
    if (body.showInShipmentDetail !== undefined) addColumn("show_in_shipment_detail", body.showInShipmentDetail);
    if (body.showInDailyStatus !== undefined) addColumn("show_in_daily_status", body.showInDailyStatus);
    if (body.showInCreateForm !== undefined) addColumn("show_in_create_form", body.showInCreateForm);
    if (field.fieldSource === "custom" && body.validationJson !== undefined) {
      values.push(JSON.stringify(body.validationJson));
      columns.push(`validation_json = $${values.length}::jsonb`);
    }
    if (field.fieldSource === "custom" && body.optionsJson !== undefined) {
      values.push(JSON.stringify(body.optionsJson));
      columns.push(`options_json = $${values.length}::jsonb`);
    }
    if (columns.length) {
      await client.query(
        `UPDATE shipment_form_template_fields
         SET ${columns.join(", ")}, updated_at = NOW()
         WHERE id = $1 AND template_id = $2`,
        values
      );
      await client.query(
        "UPDATE shipment_form_templates SET version = version + 1, updated_by_id = $2, updated_at = NOW() WHERE id = $1",
        [mutable.id, actorUserId || null]
      );
    }
    const updated = await getShipmentFormTemplate(client, {
      organizationId: scopedOrganizationId,
      templateId: mutable.id,
    });
    return { before: mutable, after: updated, templateId: mutable.id, fieldId: mutableFieldId, forked: mutable.id !== templateId };
  });
}

export async function archiveShipmentFormTemplateField(pool, { organizationId, templateId, fieldId, actorUserId } = {}) {
  const scopedOrganizationId = requireOrganizationScope(organizationId, "archiveShipmentFormTemplateField");
  return withTransaction(pool, async (client) => {
    const mutable = await ensureMutableTemplate(client, {
      organizationId: scopedOrganizationId,
      templateId,
      actorUserId,
    });
    let mutableFieldId = fieldId;
    const originalField = mutable.sections.flatMap((section) => section.fields).find((field) => field.id === fieldId);
    if (!originalField) {
      const original = await client.query("SELECT field_key FROM shipment_form_template_fields WHERE id = $1 LIMIT 1", [fieldId]);
      const fieldKey = original.rows[0]?.field_key;
      const clonedField = mutable.sections.flatMap((section) => section.fields).find((field) => field.fieldKey === fieldKey);
      mutableFieldId = clonedField?.id || fieldId;
    }
    const result = await client.query(
      `UPDATE shipment_form_template_fields
       SET is_visible = FALSE,
           show_in_shipment_detail = FALSE,
           show_in_daily_status = FALSE,
           show_in_create_form = FALSE,
           archived_at = NOW(),
           updated_at = NOW()
       WHERE id = $1 AND template_id = $2
       RETURNING *`,
      [mutableFieldId, mutable.id]
    );
    if (!result.rows[0]) {
      const error = new Error("Template field was not found.");
      error.statusCode = 404;
      error.code = "SHIPMENT_FORM_TEMPLATE_FIELD_NOT_FOUND";
      throw error;
    }
    await client.query(
      "UPDATE shipment_form_templates SET version = version + 1, updated_by_id = $2, updated_at = NOW() WHERE id = $1",
      [mutable.id, actorUserId || null]
    );
    const updated = await getShipmentFormTemplate(client, {
      organizationId: scopedOrganizationId,
      templateId: mutable.id,
    });
    return { before: mutable, after: updated, field: toField(result.rows[0]), templateId: mutable.id, forked: mutable.id !== templateId };
  });
}

function isRealIsoDate(value) {
  if (!value) return true;
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function normalizeCustomValue(field, value) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (field.fieldType === "number") {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
      const error = new Error(`Custom field ${field.fieldKey} must be a non-negative number.`);
      error.statusCode = 400;
      error.code = "INVALID_CUSTOM_FIELD_VALUE";
      throw error;
    }
    return parsed;
  }
  if (field.fieldType === "date") {
    const text = String(value).trim().replace(/\//g, "-");
    const match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    const normalized = match ? `${match[1]}-${String(match[2]).padStart(2, "0")}-${String(match[3]).padStart(2, "0")}` : text;
    if (!isRealIsoDate(normalized)) {
      const error = new Error(`Custom field ${field.fieldKey} must be a valid YYYY-MM-DD date.`);
      error.statusCode = 400;
      error.code = "INVALID_CUSTOM_FIELD_VALUE";
      throw error;
    }
    return normalized;
  }
  if (field.fieldType === "select") {
    const text = String(value).trim();
    const allowed = new Set((field.optionsJson || []).map((option) => String(option.value)));
    if (!allowed.has(text)) {
      const error = new Error(`Custom field ${field.fieldKey} has an unsupported option.`);
      error.statusCode = 400;
      error.code = "INVALID_CUSTOM_FIELD_VALUE";
      throw error;
    }
    return text;
  }
  const text = String(value).trim();
  const maxLength = field.fieldType === "textarea" ? 4000 : 1000;
  if (text.length > maxLength) {
    const error = new Error(`Custom field ${field.fieldKey} is too long.`);
    error.statusCode = 400;
    error.code = "INVALID_CUSTOM_FIELD_VALUE";
    throw error;
  }
  return text;
}

export function validateCustomFieldPatchForTemplate(template, customFields = {}) {
  if (!customFields || typeof customFields !== "object" || Array.isArray(customFields)) return {};
  const fieldMap = new Map();
  for (const section of template?.sections || []) {
    for (const field of section.fields || []) {
      if (field.fieldSource !== "custom" || !field.isVisible || field.archivedAt) continue;
      fieldMap.set(field.fieldKey, field);
    }
  }
  const sanitized = {};
  for (const [key, value] of Object.entries(customFields)) {
    const field = fieldMap.get(key);
    if (!field) {
      const error = new Error(`Unknown custom shipment form field: ${key}`);
      error.statusCode = 400;
      error.code = "UNKNOWN_CUSTOM_FIELD";
      throw error;
    }
    const normalized = normalizeCustomValue(field, value);
    if (normalized !== undefined) sanitized[key] = normalized;
  }
  return sanitized;
}

export const shipmentFormTemplateCatalog = {
  shipmentTypes: SHIPMENT_TYPES,
  canonicalFields: CANONICAL_SHIPMENT_FORM_FIELDS,
};
