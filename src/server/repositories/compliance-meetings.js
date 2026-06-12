import { organizationScopeClause, requireOrganizationScope } from "../tenant-scope.js";

export function toUiAppointmentDocument(row) {
  const legacy = row?.legacy_data || {};
  return {
    id: row.id,
    name: row.name || legacy.name || "",
    required: Boolean(row.required ?? legacy.required),
    completed: Boolean(row.completed ?? legacy.completed),
    fileName: row.file_name || legacy.fileName || undefined,
  };
}

export function toUiAppointment(row, documents = []) {
  if (!row) return null;
  const legacy = row.legacy_data || {};
  const legacyRequiredDocuments = Array.isArray(legacy.requiredDocuments) ? legacy.requiredDocuments : [];
  return {
    id: row.id,
    dateTime: row.meeting_at || legacy.dateTime || "",
    departmentName: row.organization_name || legacy.departmentName || "",
    purpose: row.title || legacy.purpose || "",
    requiredDocuments: documents.length ? documents.map(toUiAppointmentDocument) : legacyRequiredDocuments,
    assignedPersonId: row.assigned_to_id || legacy.assignedPersonId || "",
    assignedPersonName: row.assigned_to_name || legacy.assignedPersonName || "",
    status: row.status || legacy.status || "SCHEDULED",
    outcome: row.outcome || legacy.outcome || "",
    nextActionItems: row.next_action_items || legacy.nextActionItems || "",
    reminderSent: Boolean(row.reminder_sent ?? legacy.reminderSent),
    createdAt: row.created_at || legacy.createdAt || new Date().toISOString(),
    isArchived: Boolean(row.archived_at),
  };
}

export async function listComplianceMeetings(
  pool,
  { ownerUserId, assignedToId, organizationId, includeArchived = false } = {}
) {
  const conditions = [];
  const values = [];
  const scopedOrganizationId = requireOrganizationScope(organizationId, "listComplianceMeetings");
  values.push(scopedOrganizationId);
  conditions.push(`organization_id = $${values.length}`);
  if (ownerUserId) {
    values.push(ownerUserId);
    conditions.push(`owner_user_id = $${values.length}`);
  }
  if (assignedToId) {
    values.push(assignedToId);
    conditions.push(`assigned_to_id = $${values.length}`);
  }
  if (!includeArchived) conditions.push("archived_at IS NULL");
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const result = await pool.query(
    `SELECT *
     FROM compliance_meetings
     ${where}
     ORDER BY meeting_at ASC, updated_at DESC`,
    values
  );
  const rows = [];
  for (const meeting of result.rows) {
    const docs = await pool.query(
      "SELECT * FROM meeting_required_documents WHERE meeting_id = $1 AND organization_id = $2 ORDER BY created_at ASC",
      [meeting.id, scopedOrganizationId]
    );
    rows.push(toUiAppointment(meeting, docs.rows));
  }
  return rows;
}

export async function getComplianceMeetingRecord(pool, id, { organizationId } = {}) {
  const values = [id];
  const organizationFilter = organizationScopeClause(values, organizationId, "organization_id", "getComplianceMeetingRecord");
  const result = await pool.query(
    `SELECT * FROM compliance_meetings WHERE id = $1 ${organizationFilter} LIMIT 1`,
    values
  );
  return result.rows[0] || null;
}
