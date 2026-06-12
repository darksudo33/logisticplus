import {
  publicDocumentQuerySchema,
  publicDocumentParamsSchema,
  publicTrackDocumentParamsSchema,
  publicTrackParamsSchema,
} from "../request-schemas.js";
import { parseRequestValue } from "../validation.js";

export function registerPublicTrackingRoutes(
  app,
  {
    createApiError,
    consumeRateLimit,
    auditLog,
    getPublicDocument,
    getPublicDocumentByTrackingToken,
    getPublicTrackingByToken,
    getPublicTrackingTokenAuditState,
    publicDocumentDownloadLimit,
    publicTrackLookupLimit,
    requestContext,
    sendStoredDocument,
  }
) {
  app.get("/api/public/track/:token/documents/:documentId", async (req, res) => {
    try {
      const params = parseRequestValue(res, publicTrackDocumentParamsSchema, req.params);
      if (!params) return;
      if (!(await consumeRateLimit(req, res, "public-track-document-download", {
        ...publicDocumentDownloadLimit,
        discriminator: params.token,
      }))) return;
      const document = await getPublicDocumentByTrackingToken(params.token, params.documentId);
      if (!document) {
        await auditLog?.({
          actorType: "public",
          action: "public_document.download_denied",
          entityType: "DOCUMENT",
          entityId: params.documentId,
          summary: "Public tracking document download was denied.",
          metadata: { route: "token", reason: "not_found_or_forbidden" },
          requestContext: requestContext?.(req),
        });
        return createApiError(res, 404, "TRACKING_DOCUMENT_UNAVAILABLE", "Document is unavailable.");
      }
      await sendStoredDocument(res, document);
    } catch (error) {
      console.error("Public tracking document failed:", error);
      createApiError(res, 500, "PUBLIC_TRACK_DOCUMENT_FAILED", "Could not load document.");
    }
  });

  app.get("/api/public/track/:token", async (req, res) => {
    try {
      const params = parseRequestValue(res, publicTrackParamsSchema, req.params);
      if (!params) return;
      if (!(await consumeRateLimit(req, res, "public-track-lookup", {
        ...publicTrackLookupLimit,
        discriminator: params.token,
      }))) return;
      const data = await getPublicTrackingByToken(params.token);
      if (!data) {
        const tokenState = getPublicTrackingTokenAuditState
          ? await getPublicTrackingTokenAuditState(params.token)
          : null;
        await auditLog?.({
          actorType: "public",
          organizationId: tokenState?.organizationId || null,
          action: tokenState?.reason === "tracking_disabled"
            ? "public_tracking.disabled_access_attempt"
            : "public_tracking.invalid_token_attempt",
          entityType: "SHIPMENT",
          entityId: tokenState?.shipmentId || null,
          summary: "Public tracking lookup was denied.",
          metadata: {
            reason: tokenState?.reason || "unavailable",
            matched: Boolean(tokenState?.matched),
            tokenLength: String(params.token || "").length,
          },
          requestContext: requestContext?.(req),
        });
        return createApiError(res, 404, "TRACKING_UNAVAILABLE", "Tracking is unavailable.");
      }
      res.json({ ok: true, data });
    } catch (error) {
      console.error("Public track failed:", error);
      createApiError(res, 500, "PUBLIC_TRACK_FAILED", "Could not load tracking.");
    }
  });

  app.get("/api/public/documents/:id", async (req, res) => {
    try {
      const params = parseRequestValue(res, publicDocumentParamsSchema, req.params);
      if (!params) return;
      const query = parseRequestValue(res, publicDocumentQuerySchema, req.query || {});
      if (!query) return;
      if (!(await consumeRateLimit(req, res, "public-document-download", {
        ...publicDocumentDownloadLimit,
        discriminator: params.id,
      }))) return;
      const document = await getPublicDocument(params.id, query);
      if (!document) {
        await auditLog?.({
          actorType: "public",
          action: "public_document.download_denied",
          entityType: "DOCUMENT",
          entityId: params.id,
          summary: "Signed public document download was denied.",
          metadata: {
            route: "signed",
            reason: "not_found_or_forbidden",
            shipmentCode: query.shipmentCode || "",
          },
          requestContext: requestContext?.(req),
        });
        return createApiError(res, 404, "NOT_FOUND", "Document was not found.");
      }
      await sendStoredDocument(res, document);
    } catch (error) {
      console.error("Public document failed:", error);
      createApiError(res, 500, "PUBLIC_DOCUMENT_FAILED", "Could not load document.");
    }
  });
}
