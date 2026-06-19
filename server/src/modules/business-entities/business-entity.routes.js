import {
  businessEntityContactCreateBodySchema,
  businessEntityContactParamsSchema,
  businessEntityContactUpdateBodySchema,
  businessEntityContactsQuerySchema,
  malvaniProfileCreateBodySchema,
  malvaniProfileParamsSchema,
  malvaniProfileUpdateBodySchema,
} from "./business-entity.validation.js";
import { parseRequestValue } from "../../shared/middleware/validate.middleware.js";
import {
  archiveBusinessEntityContact,
  archiveMalvaniProfile,
  createBusinessEntityContact,
  createMalvaniProfile,
  getMalvaniProfile,
  listBusinessEntityContacts,
  listMalvaniProfiles,
  updateBusinessEntityContact,
  updateMalvaniProfile,
} from "./business-entity.repository.js";

function isBusinessEntitySchemaMissing(error) {
  return (
    error?.code === "42P01" ||
    error?.code === "42703" ||
    /malvani_profiles|business_entity_contacts/i.test(String(error?.message || ""))
  );
}

function auditMetadata(payload = {}) {
  return {
    entityType: payload.entityType,
    entityId: payload.entityId,
    contactId: payload.contactId,
    changedFields: payload.changedFields || [],
  };
}

export function registerBusinessEntityRoutes(
  app,
  {
    auditLog,
    createApiError,
    pool,
    requestContext,
    requireAuthenticatedTenantUser,
  }
) {
  function handleRouteError(res, error, fallbackCode, fallbackMessage) {
    if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
    if (error.statusCode === 404) return createApiError(res, 404, error.code || "NOT_FOUND", error.message);
    if (error.statusCode === 400) return createApiError(res, 400, error.code || "VALIDATION_ERROR", error.message);
    if (isBusinessEntitySchemaMissing(error)) {
      return createApiError(
        res,
        503,
        "BUSINESS_ENTITY_SCHEMA_NOT_READY",
        "Malvani and business contact migrations have not been applied yet."
      );
    }
    console.error(fallbackCode, error);
    return createApiError(res, 500, fallbackCode, fallbackMessage);
  }

  app.get("/api/malvani-profiles", async (req, res) => {
    try {
      const tenantRequest = await requireAuthenticatedTenantUser(req, res, "malvani profile list API");
      if (!tenantRequest) return;
      const data = await listMalvaniProfiles(pool, {
        organizationId: tenantRequest.organizationId,
        includeArchived: req.query.includeArchived === "true",
      });
      res.json({ ok: true, data });
    } catch (error) {
      handleRouteError(res, error, "MALVANI_PROFILES_LIST_FAILED", "Could not load Malvani profiles.");
    }
  });

  app.post("/api/malvani-profiles", async (req, res) => {
    try {
      const tenantRequest = await requireAuthenticatedTenantUser(req, res, "malvani profile create API");
      if (!tenantRequest) return;
      const body = parseRequestValue(res, malvaniProfileCreateBodySchema, req.body || {});
      if (!body) return;
      const result = await createMalvaniProfile(pool, {
        organizationId: tenantRequest.organizationId,
        actorUserId: tenantRequest.user.id,
        body,
      });
      await auditLog({
        actorUserId: tenantRequest.user.id,
        organizationId: tenantRequest.organizationId,
        action: "malvani_profile.create",
        entityType: "malvani_profile",
        entityId: result.profile.id,
        summary: "Malvani profile was created.",
        before: result.audit.before,
        after: result.audit.after,
        metadata: auditMetadata({
          entityType: "malvani",
          entityId: result.profile.id,
          changedFields: result.audit.changedFields,
        }),
        requestContext: requestContext(req),
      });
      res.status(201).json({ ok: true, data: result.profile });
    } catch (error) {
      handleRouteError(res, error, "MALVANI_PROFILE_CREATE_FAILED", "Could not create Malvani profile.");
    }
  });

  app.get("/api/malvani-profiles/:id", async (req, res) => {
    try {
      const tenantRequest = await requireAuthenticatedTenantUser(req, res, "malvani profile get API");
      if (!tenantRequest) return;
      const params = parseRequestValue(res, malvaniProfileParamsSchema, req.params);
      if (!params) return;
      const data = await getMalvaniProfile(pool, {
        organizationId: tenantRequest.organizationId,
        profileId: params.id,
      });
      if (!data) return createApiError(res, 404, "MALVANI_PROFILE_NOT_FOUND", "Malvani profile was not found.");
      res.json({ ok: true, data });
    } catch (error) {
      handleRouteError(res, error, "MALVANI_PROFILE_GET_FAILED", "Could not load Malvani profile.");
    }
  });

  app.patch("/api/malvani-profiles/:id", async (req, res) => {
    try {
      const tenantRequest = await requireAuthenticatedTenantUser(req, res, "malvani profile update API");
      if (!tenantRequest) return;
      const params = parseRequestValue(res, malvaniProfileParamsSchema, req.params);
      const body = parseRequestValue(res, malvaniProfileUpdateBodySchema, req.body || {});
      if (!params || !body) return;
      const result = await updateMalvaniProfile(pool, {
        organizationId: tenantRequest.organizationId,
        profileId: params.id,
        actorUserId: tenantRequest.user.id,
        body,
      });
      if (!result) return createApiError(res, 404, "MALVANI_PROFILE_NOT_FOUND", "Malvani profile was not found.");
      await auditLog({
        actorUserId: tenantRequest.user.id,
        organizationId: tenantRequest.organizationId,
        action: "malvani_profile.update",
        entityType: "malvani_profile",
        entityId: params.id,
        summary: "Malvani profile was updated.",
        before: result.audit.before,
        after: result.audit.after,
        metadata: auditMetadata({
          entityType: "malvani",
          entityId: params.id,
          changedFields: result.audit.changedFields,
        }),
        requestContext: requestContext(req),
      });
      res.json({ ok: true, data: result.after });
    } catch (error) {
      handleRouteError(res, error, "MALVANI_PROFILE_UPDATE_FAILED", "Could not update Malvani profile.");
    }
  });

  app.delete("/api/malvani-profiles/:id", async (req, res) => {
    try {
      const tenantRequest = await requireAuthenticatedTenantUser(req, res, "malvani profile archive API");
      if (!tenantRequest) return;
      const params = parseRequestValue(res, malvaniProfileParamsSchema, req.params);
      if (!params) return;
      const result = await archiveMalvaniProfile(pool, {
        organizationId: tenantRequest.organizationId,
        profileId: params.id,
        actorUserId: tenantRequest.user.id,
      });
      if (!result) return createApiError(res, 404, "MALVANI_PROFILE_NOT_FOUND", "Malvani profile was not found.");
      await auditLog({
        actorUserId: tenantRequest.user.id,
        organizationId: tenantRequest.organizationId,
        action: "malvani_profile.archive",
        entityType: "malvani_profile",
        entityId: params.id,
        summary: "Malvani profile was archived.",
        before: result.audit.before,
        after: result.audit.after,
        metadata: auditMetadata({
          entityType: "malvani",
          entityId: params.id,
          changedFields: result.audit.changedFields,
        }),
        requestContext: requestContext(req),
      });
      res.json({ ok: true, data: result.after });
    } catch (error) {
      handleRouteError(res, error, "MALVANI_PROFILE_ARCHIVE_FAILED", "Could not archive Malvani profile.");
    }
  });

  app.get("/api/business-entity-contacts", async (req, res) => {
    try {
      const tenantRequest = await requireAuthenticatedTenantUser(req, res, "business entity contacts list API");
      if (!tenantRequest) return;
      const query = parseRequestValue(res, businessEntityContactsQuerySchema, req.query || {});
      if (!query) return;
      const data = await listBusinessEntityContacts(pool, {
        organizationId: tenantRequest.organizationId,
        entityType: query.entityType,
        entityId: query.entityId,
      });
      res.json({ ok: true, data });
    } catch (error) {
      handleRouteError(res, error, "BUSINESS_ENTITY_CONTACTS_LIST_FAILED", "Could not load contacts.");
    }
  });

  app.post("/api/business-entity-contacts", async (req, res) => {
    try {
      const tenantRequest = await requireAuthenticatedTenantUser(req, res, "business entity contact create API");
      if (!tenantRequest) return;
      const body = parseRequestValue(res, businessEntityContactCreateBodySchema, req.body || {});
      if (!body) return;
      const result = await createBusinessEntityContact(pool, {
        organizationId: tenantRequest.organizationId,
        actorUserId: tenantRequest.user.id,
        body,
      });
      await auditLog({
        actorUserId: tenantRequest.user.id,
        organizationId: tenantRequest.organizationId,
        action: "business_entity_contact.create",
        entityType: "business_entity_contact",
        entityId: result.contact.id,
        summary: "Business entity contact was created.",
        before: result.audit.before,
        after: result.audit.after,
        metadata: auditMetadata({
          entityType: result.contact.entityType,
          entityId: result.contact.entityId,
          contactId: result.contact.id,
          changedFields: result.audit.changedFields,
        }),
        requestContext: requestContext(req),
      });
      res.status(201).json({ ok: true, data: result.contact });
    } catch (error) {
      handleRouteError(res, error, "BUSINESS_ENTITY_CONTACT_CREATE_FAILED", "Could not create contact.");
    }
  });

  app.patch("/api/business-entity-contacts/:id", async (req, res) => {
    try {
      const tenantRequest = await requireAuthenticatedTenantUser(req, res, "business entity contact update API");
      if (!tenantRequest) return;
      const params = parseRequestValue(res, businessEntityContactParamsSchema, req.params);
      const body = parseRequestValue(res, businessEntityContactUpdateBodySchema, req.body || {});
      if (!params || !body) return;
      const result = await updateBusinessEntityContact(pool, {
        organizationId: tenantRequest.organizationId,
        contactId: params.id,
        actorUserId: tenantRequest.user.id,
        body,
      });
      if (!result) return createApiError(res, 404, "BUSINESS_ENTITY_CONTACT_NOT_FOUND", "Contact was not found.");
      await auditLog({
        actorUserId: tenantRequest.user.id,
        organizationId: tenantRequest.organizationId,
        action: "business_entity_contact.update",
        entityType: "business_entity_contact",
        entityId: params.id,
        summary: "Business entity contact was updated.",
        before: result.audit.before,
        after: result.audit.after,
        metadata: auditMetadata({
          entityType: result.after.entityType,
          entityId: result.after.entityId,
          contactId: params.id,
          changedFields: result.audit.changedFields,
        }),
        requestContext: requestContext(req),
      });
      res.json({ ok: true, data: result.after });
    } catch (error) {
      handleRouteError(res, error, "BUSINESS_ENTITY_CONTACT_UPDATE_FAILED", "Could not update contact.");
    }
  });

  app.delete("/api/business-entity-contacts/:id", async (req, res) => {
    try {
      const tenantRequest = await requireAuthenticatedTenantUser(req, res, "business entity contact archive API");
      if (!tenantRequest) return;
      const params = parseRequestValue(res, businessEntityContactParamsSchema, req.params);
      if (!params) return;
      const result = await archiveBusinessEntityContact(pool, {
        organizationId: tenantRequest.organizationId,
        contactId: params.id,
        actorUserId: tenantRequest.user.id,
      });
      if (!result) return createApiError(res, 404, "BUSINESS_ENTITY_CONTACT_NOT_FOUND", "Contact was not found.");
      await auditLog({
        actorUserId: tenantRequest.user.id,
        organizationId: tenantRequest.organizationId,
        action: "business_entity_contact.archive",
        entityType: "business_entity_contact",
        entityId: params.id,
        summary: "Business entity contact was archived.",
        before: result.audit.before,
        after: result.audit.after,
        metadata: auditMetadata({
          entityType: result.before.entityType,
          entityId: result.before.entityId,
          contactId: params.id,
          changedFields: result.audit.changedFields,
        }),
        requestContext: requestContext(req),
      });
      res.json({ ok: true, data: result.after });
    } catch (error) {
      handleRouteError(res, error, "BUSINESS_ENTITY_CONTACT_ARCHIVE_FAILED", "Could not archive contact.");
    }
  });
}
