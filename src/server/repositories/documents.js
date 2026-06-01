import { organizationScopeClause } from "../tenant-scope.js";

function documentSelect() {
  return `SELECT d.*, u.name AS uploaded_by_user_name
          FROM documents d
          LEFT JOIN app_users u ON u.id = d.uploaded_by_id`;
}

function toUiDocument(row) {
  if (!row) return null;
  const legacy = row.legacy_data || {};
  return {
    id: row.id,
    shipmentId: row.shipment_id || legacy.shipmentId || undefined,
    customerId: row.customer_id || legacy.customerId || undefined,
    name: row.title || row.file_name || legacy.name || row.id,
    type: legacy.type || "OTHER",
    fileSize: row.file_size || legacy.fileSize || "",
    uploadedBy: row.uploaded_by_name || legacy.uploadedBy || "",
    createdAt: row.created_at || legacy.createdAt || new Date().toISOString(),
    url: `/api/documents/${encodeURIComponent(row.id)}/download`,
    visibility: row.visibility || "internal",
    isArchived: Boolean(row.archived_at),
    version: row.version || 1,
  };
}

export async function listDocuments(pool, { ownerUserId, shipmentId, customerId, organizationId, includeArchived = false } = {}) {
  const conditions = [];
  const values = [];
  conditions.push(
    organizationScopeClause(values, organizationId, "d.organization_id", "listDocuments").replace(/^AND\s+/, "")
  );

  if (ownerUserId) {
    values.push(ownerUserId);
    conditions.push(`d.owner_user_id = $${values.length}`);
  }
  if (shipmentId) {
    values.push(shipmentId);
    conditions.push(`d.shipment_id = $${values.length}`);
  }
  if (customerId) {
    values.push(customerId);
    conditions.push(`d.customer_id = $${values.length}`);
  }
  if (!includeArchived) {
    conditions.push("d.archived_at IS NULL");
  }

  const result = await pool.query(
    `${documentSelect()}
     WHERE ${conditions.join(" AND ")}
     ORDER BY d.updated_at DESC, d.created_at DESC`,
    values
  );
  return result.rows.map(toUiDocument);
}

export async function getDocumentDetail(pool, documentId, { organizationId } = {}) {
  const values = [documentId];
  const organizationFilter = organizationScopeClause(
    values,
    organizationId,
    "d.organization_id",
    "getDocumentDetail"
  );
  const result = await pool.query(
    `${documentSelect()}
     WHERE d.id = $1 ${organizationFilter}
     LIMIT 1`,
    values
  );
  const document = result.rows[0];
  if (!document) return null;

  const versions = await pool.query(
    `SELECT v.id, v.version, v.file_name, v.storage_key, v.created_at
     FROM document_versions v
     JOIN documents d ON d.id = v.document_id
     WHERE v.document_id = $1
       AND d.organization_id = $2
     ORDER BY v.version DESC`,
    [documentId, organizationId]
  );

  return {
    ...document,
    ui: toUiDocument(document),
    versions: versions.rows.map((row) => ({
      id: row.id,
      version: row.version,
      fileName: row.file_name,
      createdAt: row.created_at,
    })),
  };
}

export async function getDocumentForDownload(pool, documentId, { organizationId } = {}) {
  const values = [documentId];
  const organizationFilter = organizationScopeClause(
    values,
    organizationId,
    "d.organization_id",
    "getDocumentForDownload"
  );
  const result = await pool.query(
    `${documentSelect()}
     WHERE d.id = $1 AND d.archived_at IS NULL ${organizationFilter}
     LIMIT 1`,
    values
  );
  return result.rows[0] || null;
}

export async function listDocumentStorageKeysForCleanup(pool, documentId, { organizationId } = {}) {
  const values = [documentId];
  const organizationFilter = organizationScopeClause(
    values,
    organizationId,
    "d.organization_id",
    "listDocumentStorageKeysForCleanup"
  );
  const result = await pool.query(
    `SELECT DISTINCT storage_key
     FROM (
       SELECT d.storage_key
       FROM documents d
       WHERE d.id = $1 ${organizationFilter}
       UNION ALL
       SELECT v.storage_key
       FROM document_versions v
       JOIN documents d ON d.id = v.document_id
       WHERE d.id = $1 ${organizationFilter}
     ) keys
     WHERE storage_key IS NOT NULL AND storage_key <> ''`,
    values
  );
  return result.rows.map((row) => row.storage_key);
}
