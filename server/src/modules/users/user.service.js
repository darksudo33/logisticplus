export function apiBlockerMessage(blockers = []) {
  return blockers[0]?.message || "User cannot be permanently deleted.";
}

export function userStatus(user) {
  return user?.status || "active";
}

export function hasOtherActiveCeo(users, targetId) {
  return users.some((item) => item.id !== targetId && item.role === "CEO" && userStatus(item) === "active");
}

export function removesActiveCeo(target, updates, organizationUsers) {
  if (!target || target.role !== "CEO" || userStatus(target) !== "active") return false;
  const nextRole = updates.role || target.role;
  const nextStatus = updates.status || userStatus(target);
  if (nextRole === "CEO" && nextStatus === "active") return false;
  return !hasOtherActiveCeo(organizationUsers, target.id);
}

export async function requireTarget({ actor, targetId, organizationId, listAppUsers, createApiError, res }) {
  const users = await listAppUsers({ organizationId });
  const target = users.find((item) => item.id === targetId);
  if (!target) {
    createApiError(res, 404, "NOT_FOUND", "User was not found.");
    return null;
  }
  return { target, users, isSelf: actor?.id === targetId };
}

export function sendDeletionBlocker(res, { code = "USER_DELETE_BLOCKED", blockers = [] } = {}) {
  return res.status(409).json({
    ok: false,
    error: {
      code,
      message: apiBlockerMessage(blockers),
      blockers,
    },
  });
}
