export function requireCompanyCeoRole(user) {
  if (user?.role === "CEO") return;
  const error = new Error("Company CEO access is required.");
  error.statusCode = 403;
  throw error;
}

export async function listCustomersService({
  user,
  tenantContext,
  query,
  listCustomersDetailed,
}) {
  return listCustomersDetailed({
    includeArchived: query.includeArchived === "true",
    search: query.search || "",
    organizationId: tenantContext.organizationId,
    includePrivateDetails: user.role === "CEO",
  });
}

export async function createCustomerService({
  user,
  body,
  createCustomerRecord,
  auditLog,
  requestContext,
}) {
  requireCompanyCeoRole(user);
  const created = await createCustomerRecord({ ownerUserId: user.id, actorUserId: user.id, customer: body });
  await auditLog({
    actorUserId: user.id,
    action: "customer.create",
    entityType: "customer",
    entityId: created.id,
    summary: "Customer was created.",
    after: created,
    requestContext,
  });
  return created;
}

export async function getCustomerService({
  user,
  tenantContext,
  params,
  getCustomerRecord,
}) {
  return getCustomerRecord(params.id, {
    organizationId: tenantContext.organizationId,
    includePrivateDetails: user.role === "CEO",
  });
}

export async function updateCustomerService({
  user,
  tenantContext,
  params,
  body,
  updateCustomerRecord,
  auditLog,
  requestContext,
}) {
  requireCompanyCeoRole(user);
  const result = await updateCustomerRecord(params.id, body, {
    organizationId: tenantContext.organizationId,
    actorUserId: user.id,
  });
  if (!result.after) return result;
  await auditLog({
    actorUserId: user.id,
    action: "customer.update",
    entityType: "customer",
    entityId: params.id,
    summary: "Customer was updated.",
    before: result.before,
    after: result.after,
    requestContext,
  });
  return result;
}

export async function listCustomerRelatedService({
  user,
  tenantContext,
  params,
  listCustomerRelated,
}) {
  return listCustomerRelated(params.id, params.related, {
    organizationId: tenantContext.organizationId,
    includePrivateDetails: user.role === "CEO",
  });
}

export async function archiveCustomerService({
  user,
  tenantContext,
  params,
  archiveCustomerRecord,
  auditLog,
  requestContext,
}) {
  requireCompanyCeoRole(user);
  const result = await archiveCustomerRecord(params.id, { organizationId: tenantContext.organizationId });
  if (!result.after) return result;
  await auditLog({
    actorUserId: user.id,
    action: "customer.archive",
    entityType: "customer",
    entityId: params.id,
    summary: "Customer was archived.",
    before: result.before,
    after: result.after,
    requestContext,
  });
  return result;
}
