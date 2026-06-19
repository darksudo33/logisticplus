export function registerSearchRoutes(app, deps) {
  const {
    createApiError,
    normalizeOperationalSearchQuery,
    requireAuthenticatedTenantUser,
    searchOperationalRecords,
  } = deps;

  app.get("/api/search", async (req, res) => {
    const startedAt = Date.now();
    const type = String(req.query.type || "all");
    const limit = req.query.limit || 20;
    const offset = req.query.offset || 0;
    const normalizedQuery = normalizeOperationalSearchQuery(req.query.q || "");

    try {
      const tenantRequest = await requireAuthenticatedTenantUser(req, res, "search API");
      if (!tenantRequest) return;
      const { user, tenantContext } = tenantRequest;

      if (!normalizedQuery) {
        return createApiError(res, 400, "SEARCH_QUERY_REQUIRED", "Search query is required.", "q");
      }
      if (normalizedQuery.length < 2) {
        return createApiError(res, 400, "SEARCH_QUERY_TOO_SHORT", "Search query must be at least 2 characters.", "q");
      }

      const data = await searchOperationalRecords({
        user,
        tenantContext,
        q: normalizedQuery,
        type,
        limit,
        offset,
      });

      if (process.env.QA_SEARCH_LOGS === "true" || process.env.QA_MODE) {
        console.info("Search query completed", {
          queryLength: normalizedQuery.length,
          type,
          limit: data.limit,
          offset: data.offset,
          resultCount: data.results.length,
          total: data.total,
          durationMs: Date.now() - startedAt,
          statusCode: 200,
        });
      }

      res.json(data);
    } catch (error) {
      if (process.env.QA_SEARCH_LOGS === "true" || process.env.QA_MODE) {
        console.info("Search query failed", {
          queryLength: normalizedQuery.length,
          type,
          durationMs: Date.now() - startedAt,
          statusCode: error.statusCode || 500,
        });
      }
      if (error.statusCode === 403) return createApiError(res, 403, "FORBIDDEN", error.message);
      console.error("Global search failed:", error);
      createApiError(res, 500, "SEARCH_FAILED", "Could not run search.");
    }
  });
}
