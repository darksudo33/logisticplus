import { assertTenantContext } from "./tenant-scope.js";

const CLIENT_TENANT_KEYS = new Set([
  "organizationId",
  "organization_id",
  "orgId",
  "companyId",
  "tenantId",
]);

function uniqueStrings(values = []) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

export function buildTenantContext(user, { permissions = [] } = {}) {
  const organizationId = String(user?.organizationId || user?.organization_id || "").trim();
  if (!organizationId) return null;

  const organizationStatus = user?.organizationStatus || user?.organization_status || "active";
  const membershipStatus = user?.membershipStatus || user?.membership_status || null;
  if (organizationStatus !== "active" || membershipStatus !== "active") return null;

  const userId = String(user?.id || "").trim();
  return {
    organizationId,
    userId,
    membershipId: user?.membershipId || `${organizationId}:${userId}`,
    role: user?.role || "",
    membershipRole: user?.membershipRole || user?.membership_role || user?.role || "",
    permissions: uniqueStrings(permissions),
  };
}

export function attachTenantContext(req, user, options = {}) {
  const tenantContext = buildTenantContext(user, options);
  req.tenantContext = tenantContext;
  if (user) user.tenantContext = tenantContext;
  return tenantContext;
}

export function getTenantContext(req) {
  return req?.tenantContext || null;
}

export function requireTenantContext(req, res, { createApiError, operation = "tenant-owned API" } = {}) {
  try {
    return assertTenantContext(getTenantContext(req), operation);
  } catch (error) {
    if (createApiError && res) {
      createApiError(res, 403, error.code || "TENANT_SCOPE_REQUIRED", "Active organization context is required.");
      return null;
    }
    throw error;
  }
}

export function findClientTenantIdentifiers(req) {
  const found = [];
  for (const source of [req?.body, req?.query, req?.params]) {
    if (!source || typeof source !== "object") continue;
    for (const key of Object.keys(source)) {
      if (CLIENT_TENANT_KEYS.has(key)) found.push(key);
    }
  }
  return [...new Set(found)].sort();
}
