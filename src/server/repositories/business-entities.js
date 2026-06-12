import crypto from "node:crypto";
import { requireOrganizationScope } from "../tenant-scope.js";
import { withTransaction } from "../transaction.js";

const PROFILE_COLUMNS = {
  displayName: "display_name",
  captainName: "captain_name",
  lenjName: "lenj_name",
  lenjRegistrationNumber: "lenj_registration_number",
  lenjType: "lenj_type",
  homePort: "home_port",
  activeStatus: "active_status",
  note: "note",
};

const CONTACT_COLUMNS = {
  contactName: "contact_name",
  roleTitle: "role_title",
  phoneNumber: "phone_number",
  phoneLabel: "phone_label",
  note: "note",
  isPrimary: "is_primary",
  sortOrder: "sort_order",
};

function notFound(message, code = "NOT_FOUND") {
  const error = new Error(message);
  error.statusCode = 404;
  error.code = code;
  return error;
}

function validationError(message, code = "VALIDATION_ERROR") {
  const error = new Error(message);
  error.statusCode = 400;
  error.code = code;
  return error;
}

function normalizeBusinessPhone(value) {
  const persianDigits = "۰۱۲۳۴۵۶۷۸۹";
  const arabicDigits = "٠١٢٣٤٥٦٧٨٩";
  const normalized = String(value || "")
    .replace(/[۰-۹٠-٩]/g, (digit) => {
      const persianIndex = persianDigits.indexOf(digit);
      if (persianIndex >= 0) return String(persianIndex);
      const arabicIndex = arabicDigits.indexOf(digit);
      return arabicIndex >= 0 ? String(arabicIndex) : digit;
    })
    .trim()
    .replace(/^00/, "+")
    .replace(/[()\s\-._]/g, "");
  if (!/^\+?[0-9]{6,20}$/.test(normalized)) {
    throw validationError("Phone number format is not valid.", "INVALID_PHONE_NUMBER");
  }
  return normalized;
}

function cleanNullable(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const text = String(value).trim();
  return text || null;
}

function cleanText(value, fallback = "") {
  if (value === undefined || value === null) return fallback;
  return String(value).trim();
}

function rowTimestamp(value) {
  return value ? new Date(value).toISOString() : null;
}

export function toBusinessEntityContact(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    contactName: row.contact_name || "",
    roleTitle: row.role_title || "",
    phoneNumber: row.phone_number || "",
    phoneLabel: row.phone_label || "",
    note: row.note || "",
    isPrimary: Boolean(row.is_primary),
    sortOrder: Number(row.sort_order || 0),
    createdById: row.created_by_id || null,
    updatedById: row.updated_by_id || null,
    createdAt: rowTimestamp(row.created_at),
    updatedAt: rowTimestamp(row.updated_at),
    archivedAt: rowTimestamp(row.archived_at),
  };
}

function toMalvaniProfile(row, contacts = []) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    displayName: row.display_name || "",
    captainName: row.captain_name || "",
    lenjName: row.lenj_name || "",
    lenjRegistrationNumber: row.lenj_registration_number || "",
    lenjType: row.lenj_type || "",
    homePort: row.home_port || "",
    activeStatus: row.active_status || "ACTIVE",
    note: row.note || "",
    contacts,
    contactsCount: contacts.filter((contact) => !contact.archivedAt).length,
    createdById: row.created_by_id || null,
    updatedById: row.updated_by_id || null,
    createdAt: rowTimestamp(row.created_at),
    updatedAt: rowTimestamp(row.updated_at),
    archivedAt: rowTimestamp(row.archived_at),
  };
}

function safeProfileAudit(row) {
  if (!row) return null;
  return {
    id: row.id,
    activeStatus: row.activeStatus || row.active_status || null,
    archivedAt: row.archivedAt || row.archived_at || null,
  };
}

export function safeContactAudit(row) {
  if (!row) return null;
  return {
    id: row.id,
    entityType: row.entityType || row.entity_type || null,
    entityId: row.entityId || row.entity_id || null,
    isPrimary: Boolean(row.isPrimary ?? row.is_primary),
    sortOrder: Number(row.sortOrder ?? row.sort_order ?? 0),
    archivedAt: row.archivedAt || row.archived_at || null,
  };
}

function changedFields(before, after, fieldNames) {
  return fieldNames.filter((field) => {
    if (!before) return after?.[field] !== undefined;
    return before[field] !== after?.[field];
  });
}

async function contactsForEntities(queryable, { organizationId, entityType, entityIds }) {
  if (!entityIds.length) return new Map();
  const result = await queryable.query(
    `SELECT *
     FROM business_entity_contacts
     WHERE organization_id = $1
       AND entity_type = $2
       AND entity_id = ANY($3::text[])
       AND archived_at IS NULL
     ORDER BY entity_id ASC, is_primary DESC, sort_order ASC, created_at ASC`,
    [organizationId, entityType, entityIds]
  );
  const map = new Map();
  for (const row of result.rows) {
    const item = toBusinessEntityContact(row);
    if (!map.has(item.entityId)) map.set(item.entityId, []);
    map.get(item.entityId).push(item);
  }
  return map;
}

export async function assertBusinessEntityBelongsToTenant(queryable, { organizationId, entityType, entityId } = {}) {
  const scopedOrganizationId = requireOrganizationScope(organizationId, "assertBusinessEntityBelongsToTenant");
  if (!entityId) return null;
  if (entityType === "commercial_card") {
    const result = await queryable.query(
      `SELECT item_id, data
       FROM user_records
       WHERE organization_id = $1
         AND collection = 'commercialCards'
         AND (item_id = $2 OR data->>'id' = $2)
         AND COALESCE(data->>'isArchived', 'false') <> 'true'
         AND COALESCE(data->>'archivedAt', '') = ''
       ORDER BY updated_at DESC
       LIMIT 1`,
      [scopedOrganizationId, entityId]
    );
    if (!result.rows[0]) throw notFound("Commercial card was not found.", "COMMERCIAL_CARD_NOT_FOUND");
    return result.rows[0];
  }
  if (entityType === "malvani") {
    const result = await queryable.query(
      `SELECT *
       FROM malvani_profiles
       WHERE organization_id = $1
         AND id = $2
         AND archived_at IS NULL
       LIMIT 1`,
      [scopedOrganizationId, entityId]
    );
    if (!result.rows[0]) throw notFound("Malvani profile was not found.", "MALVANI_PROFILE_NOT_FOUND");
    return result.rows[0];
  }
  throw validationError("Business entity type is not supported.", "UNSUPPORTED_ENTITY_TYPE");
}

export async function listMalvaniProfiles(queryable, { organizationId, includeArchived = false } = {}) {
  const scopedOrganizationId = requireOrganizationScope(organizationId, "listMalvaniProfiles");
  const result = await queryable.query(
    `SELECT *
     FROM malvani_profiles
     WHERE organization_id = $1
       AND ($2::boolean IS TRUE OR archived_at IS NULL)
     ORDER BY archived_at NULLS FIRST, updated_at DESC, created_at DESC`,
    [scopedOrganizationId, Boolean(includeArchived)]
  );
  const contactsByProfile = await contactsForEntities(queryable, {
    organizationId: scopedOrganizationId,
    entityType: "malvani",
    entityIds: result.rows.map((row) => row.id),
  });
  return result.rows.map((row) => toMalvaniProfile(row, contactsByProfile.get(row.id) || []));
}

export async function getMalvaniProfile(queryable, { organizationId, profileId } = {}) {
  const scopedOrganizationId = requireOrganizationScope(organizationId, "getMalvaniProfile");
  const result = await queryable.query(
    `SELECT *
     FROM malvani_profiles
     WHERE organization_id = $1
       AND id = $2
       AND archived_at IS NULL
     LIMIT 1`,
    [scopedOrganizationId, profileId]
  );
  const row = result.rows[0];
  if (!row) return null;
  const contacts = await listBusinessEntityContacts(queryable, {
    organizationId: scopedOrganizationId,
    entityType: "malvani",
    entityId: row.id,
  });
  return toMalvaniProfile(row, contacts);
}

export async function createMalvaniProfile(pool, { organizationId, actorUserId, body } = {}) {
  const scopedOrganizationId = requireOrganizationScope(organizationId, "createMalvaniProfile");
  return withTransaction(pool, async (client) => {
    const id = crypto.randomUUID();
    const result = await client.query(
      `INSERT INTO malvani_profiles (
         id, organization_id, display_name, captain_name, lenj_name, lenj_registration_number,
         lenj_type, home_port, active_status, note, created_by_id, updated_by_id
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11)
       RETURNING *`,
      [
        id,
        scopedOrganizationId,
        cleanText(body.displayName),
        cleanText(body.captainName),
        cleanText(body.lenjName),
        cleanText(body.lenjRegistrationNumber),
        cleanNullable(body.lenjType),
        cleanNullable(body.homePort),
        body.activeStatus || "ACTIVE",
        cleanText(body.note),
        actorUserId || null,
      ]
    );
    const profile = toMalvaniProfile(result.rows[0], []);
    return {
      profile,
      audit: {
        before: null,
        after: safeProfileAudit(profile),
        changedFields: Object.keys(body || {}),
      },
    };
  });
}

export async function updateMalvaniProfile(pool, { organizationId, profileId, actorUserId, body } = {}) {
  const scopedOrganizationId = requireOrganizationScope(organizationId, "updateMalvaniProfile");
  return withTransaction(pool, async (client) => {
    const beforeResult = await client.query(
      `SELECT *
       FROM malvani_profiles
       WHERE organization_id = $1
         AND id = $2
         AND archived_at IS NULL
       FOR UPDATE`,
      [scopedOrganizationId, profileId]
    );
    const beforeRow = beforeResult.rows[0];
    if (!beforeRow) return null;

    const sets = [];
    const values = [scopedOrganizationId, profileId];
    for (const [field, column] of Object.entries(PROFILE_COLUMNS)) {
      if (body[field] === undefined) continue;
      const value = ["lenjType", "homePort"].includes(field)
        ? cleanNullable(body[field])
        : cleanText(body[field]);
      values.push(value);
      sets.push(`${column} = $${values.length}`);
    }
    values.push(actorUserId || null);
    sets.push(`updated_by_id = $${values.length}`, "updated_at = NOW()");

    const afterResult = await client.query(
      `UPDATE malvani_profiles
       SET ${sets.join(", ")}
       WHERE organization_id = $1
         AND id = $2
         AND archived_at IS NULL
       RETURNING *`,
      values
    );
    const before = toMalvaniProfile(beforeRow, []);
    const after = toMalvaniProfile(afterResult.rows[0], []);
    return {
      before,
      after,
      changedFields: changedFields(before, after, Object.keys(body || {})),
      audit: {
        before: safeProfileAudit(before),
        after: safeProfileAudit(after),
        changedFields: changedFields(before, after, Object.keys(body || {})),
      },
    };
  });
}

export async function archiveMalvaniProfile(pool, { organizationId, profileId, actorUserId } = {}) {
  const scopedOrganizationId = requireOrganizationScope(organizationId, "archiveMalvaniProfile");
  return withTransaction(pool, async (client) => {
    const beforeResult = await client.query(
      `SELECT *
       FROM malvani_profiles
       WHERE organization_id = $1
         AND id = $2
         AND archived_at IS NULL
       FOR UPDATE`,
      [scopedOrganizationId, profileId]
    );
    const beforeRow = beforeResult.rows[0];
    if (!beforeRow) return null;
    const afterResult = await client.query(
      `UPDATE malvani_profiles
       SET archived_at = NOW(),
           active_status = 'INACTIVE',
           updated_by_id = $3,
           updated_at = NOW()
       WHERE organization_id = $1
         AND id = $2
         AND archived_at IS NULL
       RETURNING *`,
      [scopedOrganizationId, profileId, actorUserId || null]
    );
    const before = toMalvaniProfile(beforeRow, []);
    const after = toMalvaniProfile(afterResult.rows[0], []);
    return {
      before,
      after,
      audit: {
        before: safeProfileAudit(before),
        after: safeProfileAudit(after),
        changedFields: ["archivedAt", "activeStatus"],
      },
    };
  });
}

export async function listBusinessEntityContacts(queryable, { organizationId, entityType, entityId } = {}) {
  const scopedOrganizationId = requireOrganizationScope(organizationId, "listBusinessEntityContacts");
  await assertBusinessEntityBelongsToTenant(queryable, { organizationId: scopedOrganizationId, entityType, entityId });
  const result = await queryable.query(
    `SELECT *
     FROM business_entity_contacts
     WHERE organization_id = $1
       AND entity_type = $2
       AND entity_id = $3
       AND archived_at IS NULL
     ORDER BY is_primary DESC, sort_order ASC, created_at ASC`,
    [scopedOrganizationId, entityType, entityId]
  );
  return result.rows.map(toBusinessEntityContact);
}

async function nextSortOrder(queryable, { organizationId, entityType, entityId }) {
  const result = await queryable.query(
    `SELECT COALESCE(MAX(sort_order), -10) + 10 AS next_sort_order
     FROM business_entity_contacts
     WHERE organization_id = $1
       AND entity_type = $2
       AND entity_id = $3
       AND archived_at IS NULL`,
    [organizationId, entityType, entityId]
  );
  return Number(result.rows[0]?.next_sort_order || 0);
}

async function demotePrimaryContacts(queryable, { organizationId, entityType, entityId, exceptContactId = null, actorUserId = null }) {
  const values = [organizationId, entityType, entityId, actorUserId];
  const exceptClause = exceptContactId ? `AND id <> $${values.push(exceptContactId)}` : "";
  await queryable.query(
    `UPDATE business_entity_contacts
     SET is_primary = FALSE,
         updated_by_id = $4,
         updated_at = NOW()
     WHERE organization_id = $1
       AND entity_type = $2
       AND entity_id = $3
       AND archived_at IS NULL
       AND is_primary IS TRUE
       ${exceptClause}`,
    values
  );
}

export async function createBusinessEntityContact(pool, { organizationId, actorUserId, body } = {}) {
  const scopedOrganizationId = requireOrganizationScope(organizationId, "createBusinessEntityContact");
  return withTransaction(pool, async (client) => {
    await assertBusinessEntityBelongsToTenant(client, {
      organizationId: scopedOrganizationId,
      entityType: body.entityType,
      entityId: body.entityId,
    });
    if (body.isPrimary) {
      await demotePrimaryContacts(client, {
        organizationId: scopedOrganizationId,
        entityType: body.entityType,
        entityId: body.entityId,
        actorUserId,
      });
    }
    const sortOrder = body.sortOrder ?? await nextSortOrder(client, {
      organizationId: scopedOrganizationId,
      entityType: body.entityType,
      entityId: body.entityId,
    });
    const result = await client.query(
      `INSERT INTO business_entity_contacts (
         id, organization_id, entity_type, entity_id, contact_name, role_title,
         phone_number, phone_label, note, is_primary, sort_order, created_by_id, updated_by_id
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12)
       RETURNING *`,
      [
        crypto.randomUUID(),
        scopedOrganizationId,
        body.entityType,
        body.entityId,
        cleanText(body.contactName),
        cleanText(body.roleTitle),
        normalizeBusinessPhone(body.phoneNumber),
        cleanNullable(body.phoneLabel),
        cleanNullable(body.note),
        Boolean(body.isPrimary),
        Number(sortOrder || 0),
        actorUserId || null,
      ]
    );
    const contact = toBusinessEntityContact(result.rows[0]);
    return {
      contact,
      audit: {
        before: null,
        after: safeContactAudit(contact),
        changedFields: Object.keys(body || {}),
      },
    };
  });
}

export async function updateBusinessEntityContact(pool, { organizationId, contactId, actorUserId, body } = {}) {
  const scopedOrganizationId = requireOrganizationScope(organizationId, "updateBusinessEntityContact");
  return withTransaction(pool, async (client) => {
    const beforeResult = await client.query(
      `SELECT *
       FROM business_entity_contacts
       WHERE organization_id = $1
         AND id = $2
         AND archived_at IS NULL
       FOR UPDATE`,
      [scopedOrganizationId, contactId]
    );
    const beforeRow = beforeResult.rows[0];
    if (!beforeRow) return null;
    await assertBusinessEntityBelongsToTenant(client, {
      organizationId: scopedOrganizationId,
      entityType: beforeRow.entity_type,
      entityId: beforeRow.entity_id,
    });
    if (body.isPrimary === true) {
      await demotePrimaryContacts(client, {
        organizationId: scopedOrganizationId,
        entityType: beforeRow.entity_type,
        entityId: beforeRow.entity_id,
        exceptContactId: contactId,
        actorUserId,
      });
    }

    const sets = [];
    const values = [scopedOrganizationId, contactId];
    for (const [field, column] of Object.entries(CONTACT_COLUMNS)) {
      if (body[field] === undefined) continue;
      let value = body[field];
      if (field === "phoneNumber") value = normalizeBusinessPhone(value);
      if (["phoneLabel", "note"].includes(field)) value = cleanNullable(value);
      if (["contactName", "roleTitle"].includes(field)) value = cleanText(value);
      if (field === "sortOrder") value = Number(value || 0);
      values.push(value);
      sets.push(`${column} = $${values.length}`);
    }
    values.push(actorUserId || null);
    sets.push(`updated_by_id = $${values.length}`, "updated_at = NOW()");

    const afterResult = await client.query(
      `UPDATE business_entity_contacts
       SET ${sets.join(", ")}
       WHERE organization_id = $1
         AND id = $2
         AND archived_at IS NULL
       RETURNING *`,
      values
    );
    const before = toBusinessEntityContact(beforeRow);
    const after = toBusinessEntityContact(afterResult.rows[0]);
    const fields = changedFields(before, after, Object.keys(body || {}));
    return {
      before,
      after,
      changedFields: fields,
      audit: {
        before: safeContactAudit(before),
        after: safeContactAudit(after),
        changedFields: fields,
      },
    };
  });
}

export async function archiveBusinessEntityContact(pool, { organizationId, contactId, actorUserId } = {}) {
  const scopedOrganizationId = requireOrganizationScope(organizationId, "archiveBusinessEntityContact");
  return withTransaction(pool, async (client) => {
    const beforeResult = await client.query(
      `SELECT *
       FROM business_entity_contacts
       WHERE organization_id = $1
         AND id = $2
         AND archived_at IS NULL
       FOR UPDATE`,
      [scopedOrganizationId, contactId]
    );
    const beforeRow = beforeResult.rows[0];
    if (!beforeRow) return null;
    const afterResult = await client.query(
      `UPDATE business_entity_contacts
       SET archived_at = NOW(),
           is_primary = FALSE,
           updated_by_id = $3,
           updated_at = NOW()
       WHERE organization_id = $1
         AND id = $2
         AND archived_at IS NULL
       RETURNING *`,
      [scopedOrganizationId, contactId, actorUserId || null]
    );
    const before = toBusinessEntityContact(beforeRow);
    const after = toBusinessEntityContact(afterResult.rows[0]);
    return {
      before,
      after,
      audit: {
        before: safeContactAudit(before),
        after: safeContactAudit(after),
        changedFields: ["archivedAt", "isPrimary"],
      },
    };
  });
}
