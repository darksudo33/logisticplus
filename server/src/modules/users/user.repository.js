import { organizationScopeClause } from "../../shared/middleware/tenant.middleware.js";
import { toUiUser } from "./user.mapper.js";

export { toUiUser } from "./user.mapper.js";

export async function getScopedUser(pool, userId, { organizationId } = {}) {
  const values = [userId];
  const organizationFilter = organizationScopeClause(values, organizationId, "u.organization_id", "getScopedUser");
  const result = await pool.query(
    `SELECT u.id, u.name, u.email, u.role, u.avatar, u.is_online, u.department, u.status, u.last_seen_at,
            u.phone, u.location, u.bio, u.two_factor_enabled, u.notification_preferences,
            u.organization_id,
            o.status AS organization_status,
            o.name AS organization_name,
            o.plan_id AS organization_plan_id
     FROM app_users u
     LEFT JOIN organizations o ON o.id = u.organization_id
     WHERE u.id = $1 ${organizationFilter}
     LIMIT 1`,
    values
  );
  return result.rows[0] || null;
}

function blocker(code, message, count = 1) {
  return { code, message, count: Number(count || 0) };
}

export async function previewUserDeletion(pool, userId, { organizationId, actorUserId } = {}) {
  const user = await getScopedUser(pool, userId, { organizationId });
  if (!user) return null;

  const blockers = [];
  if (actorUserId && actorUserId === user.id) {
    blockers.push(blocker("SELF_DELETE_BLOCKED", "You cannot delete your own account."));
  }
  if (String(user.status || "active") !== "suspended") {
    blockers.push(blocker("USER_MUST_BE_SUSPENDED", "Suspend the user before permanent deletion."));
  }

  const ownerResult = await pool.query(
    "SELECT COUNT(*)::int AS count FROM organizations WHERE owner_user_id = $1",
    [user.id]
  );
  if (Number(ownerResult.rows[0]?.count || 0) > 0) {
    blockers.push(blocker("ORGANIZATION_OWNER_BLOCKED", "Transfer organization ownership before deleting this user.", ownerResult.rows[0].count));
  }

  const ceoResult = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM app_users
     WHERE organization_id = $1
       AND role = 'CEO'
       AND status = 'active'
       AND id <> $2`,
    [organizationId, user.id]
  );
  if (user.role === "CEO" && Number(ceoResult.rows[0]?.count || 0) < 1) {
    blockers.push(blocker("LAST_CEO_BLOCKED", "At least one active CEO must remain in the organization."));
  }

  const taskResult = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM tasks
     WHERE organization_id = $1
       AND assigned_to_id = $2
       AND COALESCE(status, '') NOT IN ('DONE', 'CANCELLED')`,
    [organizationId, user.id]
  );
  if (Number(taskResult.rows[0]?.count || 0) > 0) {
    blockers.push(blocker("ACTIVE_TASKS_BLOCKED", "Reassign or close active tasks before deleting this user.", taskResult.rows[0].count));
  }

  const shipmentResult = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM shipments
     WHERE organization_id = $1
       AND owner_user_id = $2
       AND archived_at IS NULL`,
    [organizationId, user.id]
  );
  if (Number(shipmentResult.rows[0]?.count || 0) > 0) {
    blockers.push(blocker("ACTIVE_SHIPMENTS_BLOCKED", "Transfer or archive owned shipments before deleting this user.", shipmentResult.rows[0].count));
  }

  return {
    canDelete: blockers.length === 0,
    blockers,
    user: toUiUser(user),
  };
}
