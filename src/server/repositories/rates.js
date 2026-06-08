import crypto from "node:crypto";
import { RATE_CURRENCY_CODES, RATE_MARKET_TYPES, RATE_VISIBLE_MARKET_TYPES } from "../../shared/rates.js";
import { withTransaction } from "../transaction.js";

const DEFAULT_LIMIT = 50;

function escapeLike(value) {
  return String(value || "").replace(/[\\%_]/g, (match) => `\\${match}`);
}

function numberOrNull(value) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function textOrNull(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text || null;
}

function normalizeLimit(limit, max = 100) {
  const parsed = Number(limit || DEFAULT_LIMIT);
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
  return Math.min(Math.max(Math.trunc(parsed), 1), max);
}

function parseBooleanEnv(value, defaultValue = false) {
  if (value === undefined || value === null || value === "") return defaultValue;
  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

function parseSyncIntervalEnv() {
  const parsed = Number(process.env.BRSAPI_SYNC_INTERVAL_MINUTES || 60);
  return Number.isFinite(parsed) && parsed >= 5 ? Math.trunc(parsed) : 60;
}

function settingsRowToDto(row = {}) {
  return {
    id: row.id,
    provider: row.provider,
    isEnabled: Boolean(row.is_enabled),
    autoPublishSuspicious: Boolean(row.auto_publish_suspicious),
    suspiciousChangePercent: numberOrNull(row.suspicious_change_percent) ?? 0,
    syncIntervalMinutes: Number(row.sync_interval_minutes || 60),
    lastSyncAt: row.last_sync_at || null,
    lastSyncStatus: row.last_sync_status || "",
    lastSyncError: row.last_sync_error || "",
    updatedById: row.updated_by_id || null,
    updatedAt: row.updated_at || null,
    createdAt: row.created_at || null,
  };
}

function rateRowToDto(row = {}) {
  return {
    id: row.id || row.snapshot_id || null,
    snapshotId: row.snapshot_id || row.id || null,
    currencyCode: row.currency_code,
    marketType: row.market_type,
    provider: row.provider,
    providerSymbol: row.provider_symbol || "",
    nameFa: row.name_fa || "",
    nameEn: row.name_en || "",
    price: numberOrNull(row.price) ?? 0,
    buyRate: numberOrNull(row.buy_rate),
    sellRate: numberOrNull(row.sell_rate),
    unit: row.unit || "IRR",
    providerDate: row.provider_date || "",
    providerTime: row.provider_time || "",
    providerUnix: row.provider_unix ? Number(row.provider_unix) : null,
    changeValue: numberOrNull(row.change_value),
    changePercent: numberOrNull(row.change_percent),
    status: row.status || "published",
    suspicious: Boolean(row.suspicious),
    previousPrice: numberOrNull(row.previous_price),
    reviewedById: row.reviewed_by_id || null,
    reviewedAt: row.reviewed_at || null,
    reviewNote: row.review_note || "",
    createdById: row.created_by_id || null,
    createdAt: row.created_at || row.updated_at || null,
    updatedAt: row.updated_at || null,
  };
}

function tariffRowToDto(row = {}) {
  return {
    id: row.id,
    importId: row.import_id || null,
    tariffCode: row.tariff_code || "",
    titleFa: row.title_fa || "",
    titleEn: row.title_en || "",
    category: row.category || "",
    chapter: row.chapter || "",
    unit: row.unit || "",
    dutyRate: row.duty_rate || "",
    taxRate: row.tax_rate || "",
    restrictions: row.restrictions || "",
    notes: row.notes || "",
    isActive: Boolean(row.is_active),
    archivedAt: row.archived_at || null,
    createdAt: row.created_at || null,
    importSourceFileName: row.source_file_name || "",
    importSourceDate: row.source_date || "",
  };
}

function normalizeCurrencyCode(value) {
  const code = String(value || "").trim().toUpperCase();
  if (!RATE_CURRENCY_CODES.includes(code)) {
    throw Object.assign(new Error("Currency code is not supported."), {
      statusCode: 400,
      code: "UNSUPPORTED_CURRENCY",
    });
  }
  return code;
}

function normalizeMarketType(value) {
  const marketType = String(value || "").trim().toUpperCase();
  if (!RATE_MARKET_TYPES.includes(marketType)) {
    throw Object.assign(new Error("Rate market type is not supported."), {
      statusCode: 400,
      code: "UNSUPPORTED_RATE_MARKET",
    });
  }
  return marketType;
}

export async function getCurrencyRateSettings(pool) {
  const result = await pool.query(
    `INSERT INTO currency_rate_settings (
       id, provider, is_enabled, auto_publish_suspicious, sync_interval_minutes
     )
     VALUES ('brsapi_pro', 'brsapi_pro', $1, $2, $3)
     ON CONFLICT (id) DO UPDATE SET provider = EXCLUDED.provider
     RETURNING *`,
    [
      parseBooleanEnv(process.env.BRSAPI_SYNC_ENABLED, false),
      parseBooleanEnv(process.env.BRSAPI_AUTO_PUBLISH, false),
      parseSyncIntervalEnv(),
    ]
  );
  return settingsRowToDto(result.rows[0]);
}

export async function updateCurrencyRateSettings(pool, {
  actorUserId,
  isEnabled,
  autoPublishSuspicious,
  suspiciousChangePercent,
  syncIntervalMinutes,
} = {}) {
  const result = await pool.query(
    `UPDATE currency_rate_settings
     SET is_enabled = COALESCE($1, is_enabled),
         auto_publish_suspicious = COALESCE($2, auto_publish_suspicious),
         suspicious_change_percent = COALESCE($3, suspicious_change_percent),
         sync_interval_minutes = COALESCE($4, sync_interval_minutes),
         updated_by_id = $5,
         updated_at = NOW()
     WHERE id = 'brsapi_pro'
     RETURNING *`,
    [
      isEnabled === undefined ? null : Boolean(isEnabled),
      autoPublishSuspicious === undefined ? null : Boolean(autoPublishSuspicious),
      suspiciousChangePercent === undefined ? null : Number(suspiciousChangePercent),
      syncIntervalMinutes === undefined ? null : Number(syncIntervalMinutes),
      actorUserId || null,
    ]
  );
  return settingsRowToDto(result.rows[0]);
}

export async function markCurrencyRateSyncState(pool, { status, error = "" } = {}) {
  const result = await pool.query(
    `UPDATE currency_rate_settings
     SET last_sync_at = NOW(),
         last_sync_status = $1,
         last_sync_error = $2,
         updated_at = NOW()
     WHERE id = 'brsapi_pro'
     RETURNING *`,
    [textOrNull(status) || "unknown", textOrNull(error)]
  );
  return result.rows[0] ? settingsRowToDto(result.rows[0]) : null;
}

export async function listLatestCurrencyRates(pool) {
  const result = await pool.query(
    `SELECT *
     FROM latest_currency_rates
     WHERE currency_code = ANY($1::text[])
       AND market_type = ANY($2::text[])
     ORDER BY array_position($1::text[], currency_code),
              array_position($2::text[], market_type)`,
    [RATE_CURRENCY_CODES, RATE_VISIBLE_MARKET_TYPES]
  );
  return result.rows.map(rateRowToDto);
}

export async function listCurrencyRateSnapshots(pool, {
  status,
  currencyCode,
  marketType,
  limit = DEFAULT_LIMIT,
} = {}) {
  const values = [];
  const where = [];
  if (status) {
    values.push(String(status));
    where.push(`status = $${values.length}`);
  }
  if (currencyCode) {
    values.push(normalizeCurrencyCode(currencyCode));
    where.push(`currency_code = $${values.length}`);
  }
  if (marketType) {
    values.push(normalizeMarketType(marketType));
    where.push(`market_type = $${values.length}`);
  }
  values.push(normalizeLimit(limit, 200));
  const result = await pool.query(
    `SELECT *
     FROM currency_rate_snapshots
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY created_at DESC
     LIMIT $${values.length}`,
    values
  );
  return result.rows.map(rateRowToDto);
}

async function insertSnapshot(queryable, rate, {
  actorUserId,
  status,
  suspicious,
  previousPrice,
  provider = "brsapi_pro",
} = {}) {
  const result = await queryable.query(
    `INSERT INTO currency_rate_snapshots (
       id, currency_code, market_type, provider, provider_symbol, name_fa, name_en,
       price, buy_rate, sell_rate, unit, provider_date, provider_time, provider_unix,
       change_value, change_percent, status, suspicious, previous_price, raw_payload,
       created_by_id
     )
     VALUES (
       $1, $2, $3, $4, $5, $6, $7,
       $8, $9, $10, $11, $12, $13, $14,
       $15, $16, $17, $18, $19, $20::jsonb,
       $21
     )
     RETURNING *`,
    [
      crypto.randomUUID(),
      normalizeCurrencyCode(rate.currencyCode),
      normalizeMarketType(rate.marketType),
      provider,
      textOrNull(rate.providerSymbol),
      textOrNull(rate.nameFa),
      textOrNull(rate.nameEn),
      Number(rate.price),
      numberOrNull(rate.buyRate),
      numberOrNull(rate.sellRate),
      textOrNull(rate.unit) || "IRR",
      textOrNull(rate.providerDate),
      textOrNull(rate.providerTime),
      numberOrNull(rate.providerUnix),
      numberOrNull(rate.changeValue),
      numberOrNull(rate.changePercent),
      status || "published",
      Boolean(suspicious),
      numberOrNull(previousPrice),
      JSON.stringify(rate.rawPayload || {}),
      actorUserId || null,
    ]
  );
  return result.rows[0];
}

async function upsertLatestRate(queryable, snapshot) {
  const result = await queryable.query(
    `INSERT INTO latest_currency_rates (
       currency_code, market_type, snapshot_id, provider, provider_symbol, name_fa, name_en,
       price, buy_rate, sell_rate, unit, provider_date, provider_time, provider_unix,
       change_value, change_percent, updated_at
     )
     VALUES (
       $1, $2, $3, $4, $5, $6, $7,
       $8, $9, $10, $11, $12, $13, $14,
       $15, $16, NOW()
     )
     ON CONFLICT (currency_code, market_type) DO UPDATE SET
       snapshot_id = EXCLUDED.snapshot_id,
       provider = EXCLUDED.provider,
       provider_symbol = EXCLUDED.provider_symbol,
       name_fa = EXCLUDED.name_fa,
       name_en = EXCLUDED.name_en,
       price = EXCLUDED.price,
       buy_rate = EXCLUDED.buy_rate,
       sell_rate = EXCLUDED.sell_rate,
       unit = EXCLUDED.unit,
       provider_date = EXCLUDED.provider_date,
       provider_time = EXCLUDED.provider_time,
       provider_unix = EXCLUDED.provider_unix,
       change_value = EXCLUDED.change_value,
       change_percent = EXCLUDED.change_percent,
       updated_at = NOW()
     RETURNING *`,
    [
      snapshot.currency_code,
      snapshot.market_type,
      snapshot.id,
      snapshot.provider,
      snapshot.provider_symbol,
      snapshot.name_fa,
      snapshot.name_en,
      snapshot.price,
      snapshot.buy_rate,
      snapshot.sell_rate,
      snapshot.unit,
      snapshot.provider_date,
      snapshot.provider_time,
      snapshot.provider_unix,
      snapshot.change_value,
      snapshot.change_percent,
    ]
  );
  return result.rows[0];
}

function suspiciousChangePercent(previousPrice, nextPrice) {
  const previous = numberOrNull(previousPrice);
  const next = numberOrNull(nextPrice);
  if (!previous || previous <= 0 || next === null) return 0;
  return Math.abs((next - previous) / previous) * 100;
}

export async function applyProviderCurrencyRates(pool, { rates = [], actorUserId = null } = {}) {
  const settings = await getCurrencyRateSettings(pool);
  if (!settings.isEnabled) {
    throw Object.assign(new Error("BRSAPI Pro currency sync is disabled."), {
      statusCode: 409,
      code: "RATE_SYNC_DISABLED",
    });
  }

  return withTransaction(pool, async (client) => {
    let published = 0;
    let pendingReview = 0;
    const snapshots = [];

    for (const rate of rates) {
      if (numberOrNull(rate.price) === null) continue;
      const currencyCode = normalizeCurrencyCode(rate.currencyCode);
      const marketType = normalizeMarketType(rate.marketType);
      const latest = await client.query(
        `SELECT price
         FROM latest_currency_rates
         WHERE currency_code = $1 AND market_type = $2
         FOR UPDATE`,
        [currencyCode, marketType]
      );
      const previousPrice = numberOrNull(latest.rows[0]?.price);
      const changePercent = suspiciousChangePercent(previousPrice, rate.price);
      const suspicious = changePercent > Number(settings.suspiciousChangePercent || 0);
      const status = suspicious && !settings.autoPublishSuspicious ? "pending_review" : "published";
      const snapshot = await insertSnapshot(client, { ...rate, currencyCode, marketType }, {
        actorUserId,
        status,
        suspicious,
        previousPrice,
        provider: "brsapi_pro",
      });
      snapshots.push(rateRowToDto(snapshot));
      if (status === "published") {
        await upsertLatestRate(client, snapshot);
        published += 1;
      } else {
        pendingReview += 1;
      }
    }

    return {
      published,
      pendingReview,
      skipped: Math.max(0, rates.length - snapshots.length),
      snapshots,
    };
  });
}

export async function createManualCurrencyRate(pool, {
  actorUserId,
  currencyCode,
  marketType,
  price,
  buyRate,
  sellRate,
  unit = "IRR",
  note = "",
} = {}) {
  return withTransaction(pool, async (client) => {
    const snapshot = await insertSnapshot(client, {
      currencyCode,
      marketType,
      providerSymbol: `${currencyCode}_${marketType}`,
      price,
      buyRate,
      sellRate,
      unit,
      rawPayload: { source: "manual", note: textOrNull(note) },
    }, {
      actorUserId,
      status: "published",
      suspicious: false,
      provider: "manual",
    });
    const latest = await upsertLatestRate(client, snapshot);
    return rateRowToDto({ ...snapshot, snapshot_id: latest.snapshot_id, updated_at: latest.updated_at });
  });
}

export async function reviewCurrencyRateSnapshot(pool, {
  snapshotId,
  actorUserId,
  decision,
  note = "",
} = {}) {
  return withTransaction(pool, async (client) => {
    const selected = await client.query(
      `SELECT *
       FROM currency_rate_snapshots
       WHERE id = $1 AND status = 'pending_review'
       FOR UPDATE`,
      [snapshotId]
    );
    const snapshot = selected.rows[0];
    if (!snapshot) {
      throw Object.assign(new Error("Pending rate snapshot was not found."), {
        statusCode: 404,
        code: "RATE_SNAPSHOT_NOT_FOUND",
      });
    }

    if (decision === "approve") {
      const updated = await client.query(
        `UPDATE currency_rate_snapshots
         SET status = 'published',
             reviewed_by_id = $2,
             reviewed_at = NOW(),
             review_note = $3
         WHERE id = $1
         RETURNING *`,
        [snapshotId, actorUserId || null, textOrNull(note)]
      );
      await upsertLatestRate(client, updated.rows[0]);
      return rateRowToDto(updated.rows[0]);
    }

    const rejected = await client.query(
      `UPDATE currency_rate_snapshots
       SET status = 'rejected',
           reviewed_by_id = $2,
           reviewed_at = NOW(),
           review_note = $3
       WHERE id = $1
       RETURNING *`,
      [snapshotId, actorUserId || null, textOrNull(note)]
    );
    return rateRowToDto(rejected.rows[0]);
  });
}

export async function searchTariffCatalogEntries(pool, { q = "", limit = 50 } = {}) {
  const searchTerm = String(q || "").trim();
  const values = [searchTerm];
  let where = "WHERE e.is_active = TRUE";
  if (searchTerm) {
    const likeTerm = `%${escapeLike(searchTerm)}%`;
    values.push(likeTerm);
    where += ` AND (
      e.tariff_code ILIKE $2 ESCAPE '\\'
      OR e.title_fa ILIKE $2 ESCAPE '\\'
      OR e.title_en ILIKE $2 ESCAPE '\\'
      OR e.category ILIKE $2 ESCAPE '\\'
      OR e.chapter ILIKE $2 ESCAPE '\\'
    )`;
  }
  values.push(normalizeLimit(limit, 100));
  const result = await pool.query(
    `SELECT e.*, i.source_file_name, i.source_date
     FROM tariff_catalog_entries e
     LEFT JOIN tariff_catalog_imports i ON i.id = e.import_id
     ${where}
     ORDER BY
       CASE WHEN $1::text <> '' AND e.tariff_code = $1::text THEN 0 ELSE 1 END,
       e.tariff_code ASC,
       e.created_at DESC
     LIMIT $${values.length}`,
    values
  );
  return result.rows.map(tariffRowToDto);
}

export async function getTariffCatalogEntry(pool, { id } = {}) {
  const result = await pool.query(
    `SELECT e.*, i.source_file_name, i.source_date
     FROM tariff_catalog_entries e
     LEFT JOIN tariff_catalog_imports i ON i.id = e.import_id
     WHERE e.id = $1 AND e.is_active = TRUE
     LIMIT 1`,
    [id]
  );
  return result.rows[0] ? tariffRowToDto(result.rows[0]) : null;
}

export async function importTariffCatalogEntries(pool, {
  actorUserId,
  fileName,
  sourceDate = "",
  mode = "replace",
  rows = [],
  validationSummary = {},
} = {}) {
  if (!["replace", "append"].includes(mode)) {
    throw Object.assign(new Error("Tariff import mode is not valid."), {
      statusCode: 400,
      code: "VALIDATION_ERROR",
    });
  }

  return withTransaction(pool, async (client) => {
    const importId = crypto.randomUUID();
    const activeRows = rows.filter((row) => row.tariffCode && row.titleFa);
    await client.query(
      `INSERT INTO tariff_catalog_imports (
         id, source_file_name, source_date, import_mode, status,
         row_count, active_row_count, validation_summary, uploaded_by_id, completed_at
       )
       VALUES ($1, $2, $3, $4, 'completed', $5, $6, $7::jsonb, $8, NOW())`,
      [
        importId,
        fileName || "tariff-import",
        textOrNull(sourceDate),
        mode,
        rows.length,
        activeRows.length,
        JSON.stringify(validationSummary || {}),
        actorUserId || null,
      ]
    );

    if (mode === "replace") {
      await client.query(
        `UPDATE tariff_catalog_entries
         SET is_active = FALSE, archived_at = NOW()
         WHERE is_active = TRUE`
      );
    } else if (activeRows.length) {
      const codes = [...new Set(activeRows.map((row) => row.tariffCode))];
      await client.query(
        `UPDATE tariff_catalog_entries
         SET is_active = FALSE, archived_at = NOW()
         WHERE is_active = TRUE
           AND tariff_code = ANY($1::text[])`,
        [codes]
      );
    }

    for (const row of activeRows) {
      await client.query(
        `INSERT INTO tariff_catalog_entries (
           id, import_id, tariff_code, title_fa, title_en, category, chapter,
           unit, duty_rate, tax_rate, restrictions, notes, is_active
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, TRUE)`,
        [
          crypto.randomUUID(),
          importId,
          row.tariffCode,
          row.titleFa,
          textOrNull(row.titleEn),
          textOrNull(row.category),
          textOrNull(row.chapter),
          textOrNull(row.unit),
          textOrNull(row.dutyRate),
          textOrNull(row.taxRate),
          textOrNull(row.restrictions),
          textOrNull(row.notes),
        ]
      );
    }

    return {
      importId,
      mode,
      rowCount: rows.length,
      activeRowCount: activeRows.length,
    };
  });
}
