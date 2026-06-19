export async function canAccessTask(user, task, action = "view", { getUserPermissions } = {}) {
  if (!task) return false;
  const taskOrganizationId = task.organization_id || task.organizationId;
  if (taskOrganizationId && taskOrganizationId !== user.organizationId) return false;
  const permissions = user.permissions || (getUserPermissions ? await getUserPermissions(user.id) : []);
  user.permissions = permissions;
  const canViewAll = permissions.includes("tasks.view_all");
  const assignedToId = task.assigned_to_id || task.assignedToUserId;
  const assignedById = task.assigned_by_id || task.assignedByUserId;
  const ownerUserId = task.owner_user_id || task.ownerUserId;
  const isAssigned = assignedToId === user.id;
  const isCreator = ownerUserId === user.id || assignedById === user.id;
  if (canViewAll) return true;
  if (action === "status" && (isAssigned || isCreator)) return true;
  return permissions.includes("tasks.view_own") && (isAssigned || isCreator);
}
