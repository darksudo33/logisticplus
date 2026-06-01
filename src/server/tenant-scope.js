export function requireOrganizationScope(organizationId, operation = "tenant-owned query") {
  const value = String(organizationId || "").trim();
  if (value) return value;

  const error = new Error(`organizationId is required for ${operation}.`);
  error.code = "TENANT_SCOPE_REQUIRED";
  error.statusCode = 500;
  throw error;
}

export function assertTenantContext(tenantContext, operation = "tenant-owned operation") {
  if (tenantContext?.organizationId) return tenantContext;

  const error = new Error(`tenantContext.organizationId is required for ${operation}.`);
  error.code = "TENANT_SCOPE_REQUIRED";
  error.statusCode = 500;
  throw error;
}

export function organizationIdFromTenantContext(tenantContext, operation = "tenant-owned query") {
  return assertTenantContext(tenantContext, operation).organizationId;
}

export function organizationScopeClause(values, organizationId, column = "organization_id", operation) {
  const scopedOrganizationId = requireOrganizationScope(organizationId, operation);
  values.push(scopedOrganizationId);
  return `AND ${column} = $${values.length}`;
}
