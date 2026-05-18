import { documentStorageInfo, verifyDocumentStorage } from "./document-storage.js";
import { ensureRateLimitStore, resolveRateLimitStore } from "./rate-limit.js";

function isProduction() {
  return process.env.NODE_ENV === "production";
}

function parseBooleanEnv(value, defaultValue = false) {
  if (value === undefined || value === null || value === "") return defaultValue;
  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

function validateHttpsUrl(value, name, errors) {
  if (!value) {
    errors.push(`${name} is required in production.`);
    return;
  }
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:") {
      errors.push(`${name} must use an HTTPS origin in production.`);
    }
  } catch {
    errors.push(`${name} must be a valid URL.`);
  }
}

export function shouldTrustProxy() {
  return parseBooleanEnv(process.env.TRUST_PROXY, isProduction());
}

export function validateProductionConfig() {
  if (!isProduction()) return [];

  const errors = [];
  if (!process.env.DATABASE_URL) {
    errors.push("DATABASE_URL is required in production.");
  }
  validateHttpsUrl(process.env.APP_PUBLIC_URL, "APP_PUBLIC_URL", errors);

  if (process.env.ZARINPAL_SANDBOX !== "false") {
    errors.push('ZARINPAL_SANDBOX must be set to "false" in production.');
  }
  if (!String(process.env.ZARINPAL_MERCHANT_ID || "").trim()) {
    errors.push("ZARINPAL_MERCHANT_ID is required in production.");
  }
  if (process.env.SMS_ENABLED === "true" && process.env.SMS_DRY_RUN === "false") {
    if (!String(process.env.SMSIR_API_KEY || "").trim()) {
      errors.push("SMSIR_API_KEY is required when live SMS sending is enabled.");
    }
    const useDefaultLine = parseBooleanEnv(process.env.SMSIR_USE_DEFAULT_LINE, false);
    if (!useDefaultLine && !String(process.env.SMSIR_LINE_NUMBER || "").trim()) {
      errors.push("SMSIR_LINE_NUMBER is required for live SMS unless SMSIR_USE_DEFAULT_LINE=true.");
    }
  }

  try {
    resolveRateLimitStore();
  } catch (error) {
    errors.push(error.message);
  }

  return errors;
}

export async function runStartupChecks() {
  const errors = validateProductionConfig();

  try {
    await verifyDocumentStorage();
  } catch (error) {
    if (isProduction()) {
      errors.push(error.message);
    } else {
      throw error;
    }
  }

  if (errors.length) {
    const storage = documentStorageInfo();
    throw new Error(
      `Production configuration error:\n- ${errors.join("\n- ")}\n- DOCUMENT_STORAGE_DIR resolved to: ${storage.root}`
    );
  }

  await ensureRateLimitStore();
}
