import { RATE_CURRENCY_CODES, RATE_MARKET_TYPES } from "../../shared/rates.js";
import { z } from "../validation.js";

const blankToUndefined = (value) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const optionalTrimmedText = (max = 180) =>
  z.preprocess(
    blankToUndefined,
    z.string().trim().max(max).optional()
  );

const blankToNull = (value) =>
  typeof value === "string" && value.trim() === "" ? null : value;

const normalizeLocalizedNumberInput = (value) => {
  const normalizedValue = blankToNull(value);
  if (normalizedValue === undefined || normalizedValue === null) return normalizedValue;
  if (typeof normalizedValue === "number") return normalizedValue;
  const persianDigits = "\u06f0\u06f1\u06f2\u06f3\u06f4\u06f5\u06f6\u06f7\u06f8\u06f9";
  const arabicDigits = "\u0660\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669";
  return String(normalizedValue)
    .replace(/[\u06f0-\u06f9\u0660-\u0669]/g, (digit) => {
      const persianIndex = persianDigits.indexOf(digit);
      if (persianIndex >= 0) return String(persianIndex);
      const arabicIndex = arabicDigits.indexOf(digit);
      return arabicIndex >= 0 ? String(arabicIndex) : digit;
    })
    .replace(/[\u066c,]/g, "")
    .replace(/\u066b/g, ".")
    .trim();
};

const optionalNullableNonNegativeNumber = z.preprocess((value) => {
  const normalizedValue = normalizeLocalizedNumberInput(value);
  if (normalizedValue === undefined || normalizedValue === null) return normalizedValue;
  const numberValue = Number(normalizedValue);
  return Number.isFinite(numberValue) ? numberValue : normalizedValue;
}, z.number().min(0, "Number fields cannot be negative.").nullable().optional());

const requiredPositiveNumber = z.preprocess((value) => {
  const normalizedValue = normalizeLocalizedNumberInput(value);
  const numberValue = Number(normalizedValue);
  return Number.isFinite(numberValue) ? numberValue : normalizedValue;
}, z.number().positive("Number must be greater than zero."));

const requiredId = z.string().trim().min(1, "Identifier is required.").max(128);
const firstQueryValue = (value) => Array.isArray(value) ? value[0] : value;
const queryLimit = (defaultValue = 50) =>
  z.preprocess((value) => {
    const singleValue = firstQueryValue(value);
    if (singleValue === undefined || singleValue === "") return undefined;
    const numberValue = Number(singleValue);
    return Number.isFinite(numberValue) ? numberValue : singleValue;
  }, z.number().int().min(1).max(100).default(defaultValue));

const rateCurrencyCode = z.enum(/** @type {[string, ...string[]]} */ (RATE_CURRENCY_CODES));
const rateMarketType = z.enum(/** @type {[string, ...string[]]} */ (RATE_MARKET_TYPES));
const optionalNonNegativeCurrencyNumber = z.preprocess((value) => {
  const normalizedValue = normalizeLocalizedNumberInput(value);
  if (normalizedValue === undefined || normalizedValue === null || normalizedValue === "") return undefined;
  const numberValue = Number(normalizedValue);
  return Number.isFinite(numberValue) ? numberValue : normalizedValue;
}, z.number().min(0, "Number fields cannot be negative.").optional());

export const currencyRateSnapshotListQuerySchema = z.object({
  status: z.preprocess(firstQueryValue, z.enum(["published", "pending_review", "rejected"]).optional()),
  currencyCode: z.preprocess(firstQueryValue, rateCurrencyCode.optional()),
  marketType: z.preprocess(firstQueryValue, rateMarketType.optional()),
  limit: queryLimit(50),
}).strict();

export const currencyRateManualBodySchema = z.object({
  currencyCode: rateCurrencyCode,
  marketType: rateMarketType,
  price: requiredPositiveNumber,
  buyRate: optionalNullableNonNegativeNumber,
  sellRate: optionalNullableNonNegativeNumber,
  unit: optionalTrimmedText(40),
  note: optionalTrimmedText(1000),
}).strict();

export const currencyRateSettingsBodySchema = z.object({
  isEnabled: z.boolean().optional(),
  autoPublishSuspicious: z.boolean().optional(),
  suspiciousChangePercent: optionalNonNegativeCurrencyNumber,
  syncIntervalMinutes: z.preprocess((value) => {
    const normalizedValue = normalizeLocalizedNumberInput(value);
    if (normalizedValue === undefined || normalizedValue === null || normalizedValue === "") return undefined;
    const numberValue = Number(normalizedValue);
    return Number.isFinite(numberValue) ? numberValue : normalizedValue;
  }, z.number().int().min(5).max(1440).optional()),
}).strict().refine(
  (value) => Object.values(value).some((item) => item !== undefined),
  { message: "At least one rate setting is required." }
);

export const currencyRateReviewParamsSchema = z.object({
  id: requiredId,
});

export const currencyRateReviewBodySchema = z.object({
  decision: z.enum(["approve", "reject"]),
  note: optionalTrimmedText(1000),
}).strict();

export const tariffCatalogSearchQuerySchema = z.object({
  q: z.preprocess(firstQueryValue, optionalTrimmedText(160)),
  limit: queryLimit(50),
}).strict();

export const tariffCatalogParamsSchema = z.object({
  id: requiredId,
});

export const tariffCatalogImportBodySchema = z.object({
  mode: z.enum(["replace", "append"]).default("replace"),
  dryRun: z.preprocess((value) => {
    if (value === true || value === "true" || value === "1") return true;
    if (value === false || value === "false" || value === "0") return false;
    return value === undefined ? true : value;
  }, z.boolean().default(true)),
  sourceDate: optionalTrimmedText(80),
}).strict();
