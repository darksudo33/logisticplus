import { parseRequestValue } from "../../shared/middleware/validate.middleware.js";
import {
  documentMetadataSchema,
  documentParamsSchema,
  documentVisibilitySchema,
  shipmentParamsSchema,
} from "./document.validation.js";
import {
  cleanupPersistedDocument,
  persistDocumentFile,
  sendStoredDocument,
  uploadSingle,
  validateDocumentFile,
} from "./document.storage.js";
import {
  documentStorageAuditMetadata,
  sanitizeDocumentForApi,
} from "./document.service.js";

export function registerDocumentRoutes(app, deps) {
  const {
    DOCUMENT_DOWNLOAD_LIMIT,
    archiveDocumentRecord,
    auditLog,
    consumeRateLimit,
    createApiError,
    createDocumentRecord,
    getDocumentDetail,
    getDocumentForDownload,
    listDocuments,
    replaceDocumentFileRecord,
    requestContext,
    requireAuthenticatedTenantUser,
    requireAuthenticatedUser,
    requirePermission,
    updateDocumentMetadata,
    updateDocumentVisibility,
    validateDocumentAssociations,
  } = deps;

  app.get("/api/documents", async (req, res) => {
    try {
      const tenantRequest = await requireAuthenticatedTenantUser(req, res, "documents list API");
      if (!tenantRequest) return;
      const { user, organizationId } = tenantRequest;
      await requirePermission(user, "documents.view_all");
      const data = await listDocuments({
        organizationId,
        includeArchived: req.query.includeArchived === "true",
      });
      res.json({ ok: true, data });
    } catch (error) {
      if (error.statusCode === 403) {
        return createApiError(res, 403, "FORBIDDEN", error.message);
      }
      console.error("List documents failed:", error);
      createApiError(res, 500, "LIST_DOCUMENTS_FAILED", "Could not load documents.");
    }
  });

  app.post("/api/documents/upload", async (req, res) => {
    try {
      const tenantRequest = await requireAuthenticatedTenantUser(req, res, "document upload API");
      if (!tenantRequest) return;
      const { user, tenantContext, organizationId } = tenantRequest;
      await requirePermission(user, "documents.upload");
      await uploadSingle(req, res);
      const metadata = parseRequestValue(res, documentMetadataSchema, req.body || {});
      if (!metadata) return;

      const fileValidation = validateDocumentFile(req.file);
      if (!fileValidation.ok) {
        return createApiError(
          res,
          fileValidation.statusCode || 415,
          fileValidation.code,
          fileValidation.message,
          fileValidation.field
        );
      }

      await validateDocumentAssociations({
        shipmentId: metadata.shipmentId || null,
        customerId: metadata.customerId || null,
        organizationId,
      });

      if (!(await consumeRateLimit(req, res, "document-upload", {
        limit: 20,
        windowMs: 15 * 60 * 1000,
        discriminator: user.id,
      }))) return;

      const persisted = await persistDocumentFile(req.file, { organizationId });
      if (persisted.error) {
        return createApiError(
          res,
          persisted.error.statusCode || 415,
          persisted.error.code,
          persisted.error.message,
          persisted.error.field
        );
      }

      let document = null;
      try {
        document = await createDocumentRecord({
          ownerUserId: user.id,
          tenantContext,
          title: metadata.title || persisted.sanitizedName,
          type: metadata.type || "OTHER",
          fileName: persisted.sanitizedName,
          mimeType: persisted.mimeType,
          fileSize: persisted.fileSize,
          storageKey: persisted.storageKey,
          storageProvider: persisted.storageProvider,
          objectKey: persisted.objectKey,
          storageBucket: persisted.storageBucket,
          storageRegion: persisted.storageRegion,
          localPath: persisted.localPath,
          checksum: persisted.checksum,
          checksumSha256: persisted.checksumSha256,
          sizeBytes: persisted.sizeBytes,
          contentType: persisted.contentType,
          storageMigratedAt: persisted.storageMigratedAt,
          storageVerifiedAt: persisted.storageVerifiedAt,
          storageMigrationStatus: persisted.storageMigrationStatus,
          storageMigrationError: persisted.storageMigrationError,
          uploadedById: user.id,
          uploadedByName: user.name,
          shipmentId: metadata.shipmentId || null,
          customerId: metadata.customerId || null,
          note: metadata.note || "",
          visibility: metadata.visibility,
        });
      } catch (error) {
        await cleanupPersistedDocument(persisted);
        throw error;
      }
      if (!document) {
        await cleanupPersistedDocument(persisted);
        return createApiError(res, 500, "DOCUMENT_UPLOAD_FAILED", "Could not upload document.");
      }

      await auditLog({
        actorUserId: user.id,
        action: "document.upload",
        entityType: "DOCUMENT",
        entityId: document.id,
        summary: "Document was uploaded.",
        after: { id: document.id, title: document.title, fileName: document.file_name, shipmentId: document.shipment_id },
        metadata: documentStorageAuditMetadata(persisted),
        requestContext: requestContext(req),
      });

      res.json({ ok: true, data: sanitizeDocumentForApi(document) });
    } catch (error) {
      if (error.statusCode === 403) {
        return createApiError(res, 403, "FORBIDDEN", error.message);
      }
      if (error.statusCode === 404) {
        return createApiError(res, 404, error.code || "NOT_FOUND", error.message);
      }
      if (error?.code === "LIMIT_FILE_SIZE") {
        return createApiError(res, 413, "FILE_TOO_LARGE", "Document file is too large.", "file");
      }
      console.error("Upload document failed:", error);
      createApiError(res, 500, "DOCUMENT_UPLOAD_FAILED", "Could not upload document.");
    }
  });

  app.get("/api/documents/:id", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      await requirePermission(user, "documents.view_all");
      const params = parseRequestValue(res, documentParamsSchema, req.params);
      if (!params) return;
      const data = await getDocumentDetail(params.id, { organizationId: user.organizationId });
      if (!data) {
        return createApiError(res, 404, "NOT_FOUND", "Document was not found.");
      }
      res.json({ ok: true, data: sanitizeDocumentForApi(data) });
    } catch (error) {
      if (error.statusCode === 403) {
        return createApiError(res, 403, "FORBIDDEN", error.message);
      }
      console.error("Get document failed:", error);
      createApiError(res, 500, "GET_DOCUMENT_FAILED", "Could not load document.");
    }
  });

  app.get("/api/documents/:id/download", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      await requirePermission(user, "documents.view_all");
      const params = parseRequestValue(res, documentParamsSchema, req.params);
      if (!params) return;
      if (!(await consumeRateLimit(req, res, "document-download", {
        ...DOCUMENT_DOWNLOAD_LIMIT,
        discriminator: user.id,
      }))) return;
      const document = await getDocumentForDownload(params.id, { organizationId: user.organizationId });
      if (!document) {
        await auditLog({
          actorUserId: user.id,
          organizationId: user.organizationId,
          action: "document.download_denied",
          entityType: "DOCUMENT",
          entityId: params.id,
          summary: "Internal document download was denied.",
          metadata: { reason: "not_found_or_forbidden" },
          requestContext: requestContext(req),
        });
        return createApiError(res, 404, "NOT_FOUND", "Document was not found.");
      }
      await sendStoredDocument(res, document);
    } catch (error) {
      if (error.statusCode === 403) {
        return createApiError(res, 403, "FORBIDDEN", error.message);
      }
      console.error("Download document failed:", error);
      createApiError(res, 500, "DOCUMENT_DOWNLOAD_FAILED", "Could not download document.");
    }
  });

  app.patch("/api/documents/:id", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      await requirePermission(user, "documents.view_all");
      const params = parseRequestValue(res, documentParamsSchema, req.params);
      if (!params) return;
      const metadata = parseRequestValue(res, documentMetadataSchema, req.body || {});
      if (!metadata) return;
      await validateDocumentAssociations({
        shipmentId: metadata.shipmentId || null,
        customerId: metadata.customerId || null,
        organizationId: user.organizationId,
      });
      const result = await updateDocumentMetadata(
        params.id,
        {
          title: metadata.title,
          type: metadata.type,
          shipmentId: metadata.shipmentId,
          customerId: metadata.customerId,
          visibility: metadata.visibility,
        },
        { organizationId: user.organizationId }
      );
      if (!result) {
        return createApiError(res, 404, "NOT_FOUND", "Document was not found.");
      }
      await auditLog({
        actorUserId: user.id,
        action: "document.update",
        entityType: "DOCUMENT",
        entityId: params.id,
        summary: "Document metadata was updated.",
        before: sanitizeDocumentForApi(result.before),
        after: sanitizeDocumentForApi(result.after),
        requestContext: requestContext(req),
      });
      res.json({ ok: true, data: sanitizeDocumentForApi(result.after) });
    } catch (error) {
      if (error.statusCode === 403) {
        return createApiError(res, 403, "FORBIDDEN", error.message);
      }
      if (error.statusCode === 404) {
        return createApiError(res, 404, error.code || "NOT_FOUND", error.message);
      }
      console.error("Update document failed:", error);
      createApiError(res, 500, "DOCUMENT_UPDATE_FAILED", "Could not update document.");
    }
  });

  app.post("/api/documents/:id/replace", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      await requirePermission(user, "documents.upload");
      const params = parseRequestValue(res, documentParamsSchema, req.params);
      if (!params) return;
      if (!(await consumeRateLimit(req, res, "document-replace", {
        limit: 20,
        windowMs: 15 * 60 * 1000,
        discriminator: user.id,
      }))) return;
      await uploadSingle(req, res);

      const persisted = await persistDocumentFile(req.file, { organizationId: user.organizationId });
      if (persisted.error) {
        return createApiError(
          res,
          persisted.error.statusCode || 415,
          persisted.error.code,
          persisted.error.message,
          persisted.error.field
        );
      }

      let result = null;
      try {
        result = await replaceDocumentFileRecord({
          documentId: params.id,
          fileName: persisted.sanitizedName,
          mimeType: persisted.mimeType,
          fileSize: persisted.fileSize,
          storageKey: persisted.storageKey,
          storageProvider: persisted.storageProvider,
          objectKey: persisted.objectKey,
          storageBucket: persisted.storageBucket,
          storageRegion: persisted.storageRegion,
          localPath: persisted.localPath,
          checksum: persisted.checksum,
          checksumSha256: persisted.checksumSha256,
          sizeBytes: persisted.sizeBytes,
          contentType: persisted.contentType,
          storageMigratedAt: persisted.storageMigratedAt,
          storageVerifiedAt: persisted.storageVerifiedAt,
          storageMigrationStatus: persisted.storageMigrationStatus,
          storageMigrationError: persisted.storageMigrationError,
          uploadedById: user.id,
          organizationId: user.organizationId,
        });
      } catch (error) {
        await cleanupPersistedDocument(persisted);
        throw error;
      }
      if (!result) {
        await cleanupPersistedDocument(persisted);
        return createApiError(res, 404, "NOT_FOUND", "Document was not found.");
      }
      await auditLog({
        actorUserId: user.id,
        action: "document.replace",
        entityType: "DOCUMENT",
        entityId: params.id,
        summary: "Document file was replaced.",
        before: { id: result.before.id, version: result.before.version, fileName: result.before.file_name },
        after: { id: result.after.id, version: result.after.version, fileName: result.after.file_name },
        metadata: documentStorageAuditMetadata(persisted),
        requestContext: requestContext(req),
      });
      res.json({ ok: true, data: sanitizeDocumentForApi(result.after) });
    } catch (error) {
      if (error.statusCode === 403) {
        return createApiError(res, 403, "FORBIDDEN", error.message);
      }
      if (error?.code === "LIMIT_FILE_SIZE") {
        return createApiError(res, 413, "FILE_TOO_LARGE", "Document file is too large.", "file");
      }
      console.error("Replace document failed:", error);
      createApiError(res, 500, "DOCUMENT_REPLACE_FAILED", "Could not replace document.");
    }
  });

  app.post("/api/documents/:id/archive", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      await requirePermission(user, "documents.archive");
      const params = parseRequestValue(res, documentParamsSchema, req.params);
      if (!params) return;
      const result = await archiveDocumentRecord(params.id, {
        organizationId: user.organizationId,
        actorUserId: user.id,
      });
      if (!result) {
        return createApiError(res, 404, "NOT_FOUND", "Document was not found.");
      }
      await auditLog({
        actorUserId: user.id,
        action: "document.archive",
        entityType: "DOCUMENT",
        entityId: params.id,
        summary: "Document was archived.",
        before: sanitizeDocumentForApi(result.before),
        after: sanitizeDocumentForApi(result.after),
        requestContext: requestContext(req),
      });
      res.json({ ok: true, data: sanitizeDocumentForApi(result.after) });
    } catch (error) {
      if (error.statusCode === 403) {
        return createApiError(res, 403, "FORBIDDEN", error.message);
      }
      console.error("Archive document failed:", error);
      createApiError(res, 500, "DOCUMENT_ARCHIVE_FAILED", "Could not archive document.");
    }
  });

  app.get("/api/shipments/:id/documents", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      await requirePermission(user, "documents.view_all");
      const params = parseRequestValue(res, shipmentParamsSchema, req.params);
      if (!params) return;
      const data = await listDocuments({ organizationId: user.organizationId, shipmentId: params.id });
      res.json({ ok: true, data });
    } catch (error) {
      if (error.statusCode === 403) {
        return createApiError(res, 403, "FORBIDDEN", error.message);
      }
      console.error("List shipment documents failed:", error);
      createApiError(res, 500, "LIST_SHIPMENT_DOCUMENTS_FAILED", "Could not load shipment documents.");
    }
  });

  app.patch("/api/documents/:id/visibility", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      await requirePermission(user, "documents.view_all");
      const params = parseRequestValue(res, documentParamsSchema, req.params);
      if (!params) return;
      const body = parseRequestValue(res, documentVisibilitySchema, req.body || {});
      if (!body) return;
      const result = await updateDocumentVisibility(params.id, body.visibility, {
        organizationId: user.organizationId,
        audit: {
          actorUserId: user.id,
          action: "document.visibility.update",
          entityType: "DOCUMENT",
          entityId: params.id,
          summary: "Document customer visibility was updated.",
          requestContext: requestContext(req),
        },
      });
      if (!result) {
        return createApiError(res, 404, "NOT_FOUND", "Document was not found.");
      }
      res.json({ ok: true, data: sanitizeDocumentForApi(result.after) });
    } catch (error) {
      if (error.statusCode === 403) {
        return createApiError(res, 403, "FORBIDDEN", error.message);
      }
      console.error("Document visibility update failed:", error);
      createApiError(res, 500, "DOCUMENT_VISIBILITY_FAILED", "Could not update document visibility.");
    }
  });
}
