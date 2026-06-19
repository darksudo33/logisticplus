export function toUiUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    avatar: row.avatar || undefined,
    isOnline: Boolean(row.is_online),
    phone: row.phone || undefined,
    location: row.location || undefined,
    bio: row.bio || undefined,
    department: row.department || undefined,
    status: row.status || "active",
    lastSeenAt: row.last_seen_at || undefined,
    twoFactorEnabled: Boolean(row.two_factor_enabled),
    notificationPreferences: row.notification_preferences || {},
    organizationId: row.organization_id || undefined,
    organizationStatus: row.organization_status || undefined,
    organizationName: row.organization_name || undefined,
    organizationPlanId: row.organization_plan_id || undefined,
  };
}
