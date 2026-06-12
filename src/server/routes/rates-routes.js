import multer from "multer";
import {
  currencyRateManualBodySchema,
  currencyRateReviewBodySchema,
  currencyRateReviewParamsSchema,
  currencyRateSettingsBodySchema,
  currencyRateSnapshotListQuerySchema,
  tariffCatalogImportBodySchema,
  tariffCatalogParamsSchema,
  tariffCatalogSearchQuerySchema,
} from "../request-schemas.js";
import { parseRequestValue } from "../validation.js";
import {
  createManualCurrencyRate,
  getCurrencyRateSettings,
  getTariffCatalogEntry,
  listCurrencyRateSnapshots,
  listLatestCurrencyRates,
  reviewCurrencyRateSnapshot,
  searchTariffCatalogEntries,
  updateCurrencyRateSettings,
  importTariffCatalogEntries,
} from "../repositories/rates.js";
import { syncBrsApiProCurrencyRates } from "../rates/brsapi.js";
import { getBrsApiConfigDiagnostics } from "../rates/brsapi.js";
import { parseTariffCatalogWorkbook } from "../rates/tariff-import.js";

function tariffImportMaxFileMb() {
  const parsed = Number(process.env.TARIFF_IMPORT_MAX_FILE_MB || 25);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 25;
}

const tariffUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: tariffImportMaxFileMb() * 1024 * 1024,
  },
});

const ALLOWED_TARIFF_EXTENSIONS = new Set([".csv", ".xlsx"]);

function isRatesSchemaMissing(error) {
  return (
    error?.code === "42P01" ||
    error?.code === "42703" ||
    /currency_rate|tariff_catalog/i.test(String(error?.message || ""))
  );
}

function routeError(res, createApiError, error, fallbackCode, fallbackMessage) {
  if (error.statusCode) {
    return createApiError(res, error.statusCode, error.code || fallbackCode, error.message || fallbackMessage);
  }
  if (isRatesSchemaMissing(error)) {
    return createApiError(
      res,
      503,
      "RATES_SCHEMA_NOT_READY",
      "Rates and tariff database migration has not been applied yet."
    );
  }
  console.error(`${fallbackCode}:`, error);
  return createApiError(res, 500, fallbackCode, fallbackMessage);
}

function uploadTariffFile(req, res) {
  return new Promise((resolve, reject) => {
    tariffUpload.single("file")(req, res, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function fileExtension(fileName = "") {
  const match = String(fileName).toLowerCase().match(/\.[a-z0-9]+$/);
  return match ? match[0] : "";
}

function assertAllowedTariffFile(file) {
  if (!file?.buffer?.length) {
    throw Object.assign(new Error("Tariff file is required."), {
      statusCode: 400,
      code: "TARIFF_FILE_REQUIRED",
    });
  }
  if (!ALLOWED_TARIFF_EXTENSIONS.has(fileExtension(file.originalname))) {
    throw Object.assign(new Error("فقط فایل‌های CSV و XLSX برای کاتالوگ تعرفه مجاز هستند."), {
      statusCode: 415,
      code: "TARIFF_FILE_TYPE_NOT_ALLOWED",
    });
  }
}

function isPlatformAdmin(user) {
  return Array.isArray(user?.permissions) && user.permissions.includes("platform.admin");
}

export function registerRatesRoutes(
  app,
  {
    auditLog,
    createApiError,
    pool,
    requestContext,
    requireAuthenticatedUser,
    requirePlatformAdmin,
  }
) {
  app.get("/api/rates/currency", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      const [settings, rates] = await Promise.all([
        getCurrencyRateSettings(pool),
        listLatestCurrencyRates(pool),
      ]);
      res.json({
        ok: true,
        data: {
          settings,
          rates,
          ...(isPlatformAdmin(user) ? { adminDiagnostics: getBrsApiConfigDiagnostics() } : {}),
        },
      });
    } catch (error) {
      routeError(res, createApiError, error, "CURRENCY_RATES_LIST_FAILED", "Could not load currency rates.");
    }
  });

  app.get("/api/rates/currency/snapshots", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      const query = parseRequestValue(res, currencyRateSnapshotListQuerySchema, req.query || {});
      if (!query) return;
      const restrictedStatus = query.status && query.status !== "published";
      if (restrictedStatus && !isPlatformAdmin(user)) {
        return createApiError(res, 403, "FORBIDDEN", "Platform owner access is required.");
      }
      const data = await listCurrencyRateSnapshots(pool, {
        ...query,
        status: isPlatformAdmin(user) ? query.status : "published",
      });
      res.json({ ok: true, data });
    } catch (error) {
      routeError(res, createApiError, error, "CURRENCY_RATE_SNAPSHOTS_FAILED", "Could not load currency rate history.");
    }
  });

  app.patch("/api/rates/currency/settings", async (req, res) => {
    try {
      const user = await requirePlatformAdmin(req, res);
      if (!user) return;
      const body = parseRequestValue(res, currencyRateSettingsBodySchema, req.body || {});
      if (!body) return;
      const before = await getCurrencyRateSettings(pool);
      const data = await updateCurrencyRateSettings(pool, { actorUserId: user.id, ...body });
      await auditLog({
        actorUserId: user.id,
        organizationId: null,
        action: "rates.currency_settings.update",
        entityType: "CURRENCY_RATE_SETTINGS",
        entityId: "brsapi_pro",
        summary: "Currency rate source settings were updated.",
        before,
        after: data,
        requestContext: requestContext(req),
      });
      res.json({ ok: true, data });
    } catch (error) {
      routeError(res, createApiError, error, "CURRENCY_RATE_SETTINGS_FAILED", "Could not update currency rate settings.");
    }
  });

  app.post("/api/rates/currency/sync", async (req, res) => {
    try {
      const user = await requirePlatformAdmin(req, res);
      if (!user) return;
      const data = await syncBrsApiProCurrencyRates(pool, { actorUserId: user.id });
      await auditLog({
        actorUserId: user.id,
        organizationId: null,
        action: "rates.currency.sync",
        entityType: "CURRENCY_RATE",
        entityId: "brsapi_pro",
        summary: "BRSAPI Pro currency rates were synced.",
        after: data,
        requestContext: requestContext(req),
      });
      res.json({ ok: true, data });
    } catch (error) {
      routeError(res, createApiError, error, "CURRENCY_RATE_SYNC_FAILED", "Could not sync BRSAPI Pro currency rates.");
    }
  });

  app.post("/api/rates/currency/manual", async (req, res) => {
    try {
      const user = await requirePlatformAdmin(req, res);
      if (!user) return;
      const body = parseRequestValue(res, currencyRateManualBodySchema, req.body || {});
      if (!body) return;
      const data = await createManualCurrencyRate(pool, { actorUserId: user.id, ...body });
      await auditLog({
        actorUserId: user.id,
        organizationId: null,
        action: "rates.currency.manual_create",
        entityType: "CURRENCY_RATE",
        entityId: `${data.currencyCode}:${data.marketType}`,
        summary: "Manual currency rate was published.",
        after: data,
        requestContext: requestContext(req),
      });
      res.json({ ok: true, data });
    } catch (error) {
      routeError(res, createApiError, error, "CURRENCY_RATE_MANUAL_FAILED", "Could not save manual currency rate.");
    }
  });

  app.post("/api/rates/currency/snapshots/:id/review", async (req, res) => {
    try {
      const user = await requirePlatformAdmin(req, res);
      if (!user) return;
      const params = parseRequestValue(res, currencyRateReviewParamsSchema, req.params);
      if (!params) return;
      const body = parseRequestValue(res, currencyRateReviewBodySchema, req.body || {});
      if (!body) return;
      const data = await reviewCurrencyRateSnapshot(pool, {
        snapshotId: params.id,
        actorUserId: user.id,
        decision: body.decision,
        note: body.note,
      });
      await auditLog({
        actorUserId: user.id,
        organizationId: null,
        action: `rates.currency.${body.decision}`,
        entityType: "CURRENCY_RATE_SNAPSHOT",
        entityId: params.id,
        summary: "Suspicious currency rate was reviewed.",
        after: data,
        requestContext: requestContext(req),
      });
      res.json({ ok: true, data });
    } catch (error) {
      routeError(res, createApiError, error, "CURRENCY_RATE_REVIEW_FAILED", "Could not review currency rate.");
    }
  });

  app.get("/api/rates/tariffs", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      const query = parseRequestValue(res, tariffCatalogSearchQuerySchema, req.query || {});
      if (!query) return;
      const data = await searchTariffCatalogEntries(pool, query);
      res.json({ ok: true, data });
    } catch (error) {
      routeError(res, createApiError, error, "TARIFF_CATALOG_SEARCH_FAILED", "Could not search tariff catalog.");
    }
  });

  app.get("/api/rates/tariffs/:id", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      const params = parseRequestValue(res, tariffCatalogParamsSchema, req.params);
      if (!params) return;
      const data = await getTariffCatalogEntry(pool, params);
      if (!data) return createApiError(res, 404, "NOT_FOUND", "Tariff entry was not found.");
      res.json({ ok: true, data });
    } catch (error) {
      routeError(res, createApiError, error, "TARIFF_CATALOG_GET_FAILED", "Could not load tariff entry.");
    }
  });

  app.post("/api/rates/tariffs/import", async (req, res) => {
    try {
      const user = await requirePlatformAdmin(req, res);
      if (!user) return;
      await uploadTariffFile(req, res);
      assertAllowedTariffFile(req.file);
      const body = parseRequestValue(res, tariffCatalogImportBodySchema, req.body || {});
      if (!body) return;

      const parsed = parseTariffCatalogWorkbook(req.file.buffer, { fileName: req.file.originalname });
      const validationSummary = {
        sheetName: parsed.sheetName,
        headers: parsed.headers,
        errors: parsed.errors,
        rowCount: parsed.rowCount,
      };

      if (body.dryRun) {
        return res.json({
          ok: true,
          data: {
            valid: parsed.valid,
            errors: parsed.errors,
            rowCount: parsed.rowCount,
            sampleRows: parsed.sampleRows,
          },
        });
      }

      if (!parsed.valid) {
        return createApiError(
          res,
          400,
          "TARIFF_IMPORT_INVALID",
          parsed.errors[0] || "Tariff file did not pass validation."
        );
      }

      const data = await importTariffCatalogEntries(pool, {
        actorUserId: user.id,
        fileName: req.file.originalname,
        sourceDate: body.sourceDate,
        mode: body.mode,
        rows: parsed.rows,
        validationSummary,
      });
      await auditLog({
        actorUserId: user.id,
        organizationId: null,
        action: "rates.tariffs.import",
        entityType: "TARIFF_CATALOG_IMPORT",
        entityId: data.importId,
        summary: "Tariff catalog file was imported.",
        after: data,
        requestContext: requestContext(req),
      });
      res.json({ ok: true, data });
    } catch (error) {
      if (error instanceof multer.MulterError) {
        const status = error.code === "LIMIT_FILE_SIZE" ? 413 : 400;
        const message = error.code === "LIMIT_FILE_SIZE"
          ? "حجم فایل تعرفه بیش از حد مجاز است"
          : error.message;
        return createApiError(res, status, error.code, message, "file");
      }
      routeError(res, createApiError, error, "TARIFF_IMPORT_FAILED", "Could not import tariff catalog.");
    }
  });
}
