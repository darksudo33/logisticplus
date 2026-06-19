import { RATE_CURRENCY_CODES } from "../../../../src/shared/rates.js";
import {
  applyProviderCurrencyRates,
  getCurrencyRateSettings,
  markCurrencyRateSyncState,
} from "./rates.repository.js";

const DEFAULT_BRSAPI_URL = "https://Api.BrsApi.ir/Market/Gold_Currency_Pro.php";
const DEFAULT_TIMEOUT_MS = 15_000;
const BRSAPI_SECTION = "currency";

const BRSAPI_MESSAGES_FA = {
  BRSAPI_KEY_MISSING: "کلید BRSAPI در تنظیمات سرور ثبت نشده است",
  BRSAPI_PLAN_REQUIRED: "دسترسی پلن BRSAPI برای این داده کافی نیست یا اعتبار کلید تمام شده است",
  BRSAPI_REQUEST_FAILED: "دریافت نرخ از BRSAPI ناموفق بود. نرخ‌های ذخیره‌شده قبلی نمایش داده می‌شوند.",
  BRSAPI_RESPONSE_FAILED: "پاسخ BRSAPI برای نرخ ارز قابل استفاده نیست. نرخ‌های ذخیره‌شده قبلی نمایش داده می‌شوند.",
  RATE_SYNC_DISABLED: "همگام‌سازی BRSAPI غیرفعال است.",
  BRSAPI_TIMEOUT: "زمان پاسخ‌گویی BRSAPI تمام شد. نرخ‌های ذخیره‌شده قبلی نمایش داده می‌شوند.",
};

function parseBooleanEnv(value, defaultValue = false) {
  if (value === undefined || value === null || value === "") return defaultValue;
  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

function brsApiError(code, message, { statusCode = 502, httpStatus = null, technicalMessage = "" } = {}) {
  return Object.assign(new Error(message), {
    statusCode,
    code,
    httpStatus,
    technicalMessage,
  });
}

function sanitizeEndpointForDiagnostics(value = process.env.BRSAPI_BASE_URL || DEFAULT_BRSAPI_URL) {
  try {
    const endpoint = new URL(value);
    endpoint.searchParams.delete("key");
    endpoint.searchParams.set("section", BRSAPI_SECTION);
    return endpoint.toString();
  } catch {
    return DEFAULT_BRSAPI_URL;
  }
}

export function getBrsApiConfigDiagnostics() {
  return {
    endpoint: sanitizeEndpointForDiagnostics(),
    section: BRSAPI_SECTION,
    keyConfigured: Boolean(String(process.env.BRSAPI_KEY || "").trim()),
    syncEnabled: parseBooleanEnv(process.env.BRSAPI_SYNC_ENABLED, false),
    autoPublish: parseBooleanEnv(process.env.BRSAPI_AUTO_PUBLISH, false),
    syncIntervalMinutes: Number(process.env.BRSAPI_SYNC_INTERVAL_MINUTES || 60),
  };
}

function parseNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const persianDigits = "۰۱۲۳۴۵۶۷۸۹";
  const arabicDigits = "٠١٢٣٤٥٦٧٨٩";
  const normalized = String(value)
    .replace(/[۰-۹٠-٩]/g, (digit) => {
      const persianIndex = persianDigits.indexOf(digit);
      if (persianIndex >= 0) return String(persianIndex);
      const arabicIndex = arabicDigits.indexOf(digit);
      return arabicIndex >= 0 ? String(arabicIndex) : digit;
    })
    .replace(/[,\s٬]/g, "")
    .replace(/٫/g, ".")
    .trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeCurrencyCode(symbol, prefix = "") {
  const raw = String(symbol || "").trim().toUpperCase();
  const withoutPrefix = prefix && raw.startsWith(`${prefix}_`) ? raw.slice(prefix.length + 1) : raw;
  return RATE_CURRENCY_CODES.includes(withoutPrefix) ? withoutPrefix : null;
}

function baseRateFields(item, currencyCode, marketType, price) {
  return {
    currencyCode,
    marketType,
    providerSymbol: String(item?.symbol || "").trim(),
    nameFa: String(item?.name || "").trim(),
    nameEn: String(item?.name_en || "").trim(),
    price,
    unit: String(item?.unit || "IRR").trim() || "IRR",
    providerDate: String(item?.date || "").trim(),
    providerTime: String(item?.time || "").trim(),
    providerUnix: parseNumber(item?.time_unix),
    changeValue: parseNumber(item?.change_value),
    changePercent: parseNumber(item?.change_percent),
    rawPayload: item || {},
  };
}

function normalizeFreeMarketRows(rows = []) {
  return rows.flatMap((item) => {
    const currencyCode = normalizeCurrencyCode(item?.symbol);
    const price = parseNumber(item?.price);
    if (!currencyCode || price === null) return [];
    return [{
      ...baseRateFields(item, currencyCode, "FREE_MARKET", price),
      buyRate: null,
      sellRate: null,
    }];
  });
}

function normalizeBuySellRows(rows = [], prefix, buyMarketType, sellMarketType) {
  return rows.flatMap((item) => {
    const currencyCode = normalizeCurrencyCode(item?.symbol, prefix);
    if (!currencyCode) return [];
    const buyRate = parseNumber(item?.price_buy);
    const sellRate = parseNumber(item?.price_sell);
    const normalized = [];
    if (buyRate !== null) {
      normalized.push({
        ...baseRateFields(item, currencyCode, buyMarketType, buyRate),
        buyRate,
        sellRate,
      });
    }
    if (sellRate !== null) {
      normalized.push({
        ...baseRateFields(item, currencyCode, sellMarketType, sellRate),
        buyRate,
        sellRate,
      });
    }
    return normalized;
  });
}

export function normalizeBrsApiProCurrencyPayload(payload = {}) {
  const currency = payload?.currency || {};
  return [
    ...normalizeFreeMarketRows(Array.isArray(currency.free) ? currency.free : []),
    ...normalizeBuySellRows(Array.isArray(currency.sana) ? currency.sana : [], "SANA", "SANA_BUY", "SANA_SELL"),
    ...normalizeBuySellRows(Array.isArray(currency.nima) ? currency.nima : [], "NIMA", "NIMA_BUY", "NIMA_SELL"),
  ];
}

export async function fetchBrsApiProCurrencyPayload({ signal } = {}) {
  const apiKey = String(process.env.BRSAPI_KEY || "").trim();
  if (!apiKey) {
    throw brsApiError("BRSAPI_KEY_MISSING", BRSAPI_MESSAGES_FA.BRSAPI_KEY_MISSING, {
      statusCode: 503,
      technicalMessage: "BRSAPI_KEY is missing on the server.",
    });
  }

  const endpoint = new URL(process.env.BRSAPI_BASE_URL || DEFAULT_BRSAPI_URL);
  endpoint.searchParams.set("key", apiKey);
  endpoint.searchParams.set("section", BRSAPI_SECTION);

  const response = await fetch(endpoint, { signal });
  if (!response.ok) {
    const isPaymentRequired = response.status === 402;
    throw brsApiError(isPaymentRequired ? "BRSAPI_PLAN_REQUIRED" : "BRSAPI_REQUEST_FAILED", isPaymentRequired ? BRSAPI_MESSAGES_FA.BRSAPI_PLAN_REQUIRED : BRSAPI_MESSAGES_FA.BRSAPI_REQUEST_FAILED, {
      statusCode: isPaymentRequired ? 402 : 502,
      httpStatus: response.status,
      technicalMessage: `BRSAPI Pro request failed with HTTP ${response.status}.`,
    });
  }
  const payload = await response.json();
  if (payload?.successful === false) {
    throw brsApiError("BRSAPI_RESPONSE_FAILED", BRSAPI_MESSAGES_FA.BRSAPI_RESPONSE_FAILED, {
      statusCode: 502,
      technicalMessage: String(payload?.message_error || "BRSAPI Pro returned unsuccessful=false."),
    });
  }
  return payload;
}

export async function syncBrsApiProCurrencyRates(pool, { actorUserId = null } = {}) {
  const settings = await getCurrencyRateSettings(pool);
  if (!settings.isEnabled) {
    throw Object.assign(new Error(BRSAPI_MESSAGES_FA.RATE_SYNC_DISABLED), {
      statusCode: 409,
      code: "RATE_SYNC_DISABLED",
    });
  }

  const timeoutMs = Number(process.env.BRSAPI_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS);
  try {
    const payload = await fetchBrsApiProCurrencyPayload({ signal: controller.signal });
    const rates = normalizeBrsApiProCurrencyPayload(payload);
    const result = await applyProviderCurrencyRates(pool, { rates, actorUserId });
    await markCurrencyRateSyncState(pool, { status: "success", error: "" });
    return {
      ...result,
      provider: "brsapi_pro",
      received: rates.length,
    };
  } catch (error) {
    if (error?.name === "AbortError") {
      error = brsApiError("BRSAPI_TIMEOUT", BRSAPI_MESSAGES_FA.BRSAPI_TIMEOUT, {
        statusCode: 504,
        technicalMessage: `BRSAPI request exceeded ${timeoutMs}ms timeout.`,
      });
    }
    await markCurrencyRateSyncState(pool, {
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    }).catch(() => {});
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
