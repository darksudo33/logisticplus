import { syncBrsApiProCurrencyRates } from "./rates/brsapi.js";

const DEFAULT_INTERVAL_MS = 60 * 60 * 1000;

function parseBooleanEnv(value, defaultValue = false) {
  if (value === undefined || value === null || value === "") return defaultValue;
  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

export function startCurrencyRatesWorker(pool) {
  if (!parseBooleanEnv(process.env.BRSAPI_SYNC_ENABLED, false)) return null;
  if (!String(process.env.BRSAPI_KEY || "").trim()) {
    console.warn("Currency rates worker skipped: BRSAPI_SYNC_ENABLED=true but BRSAPI_KEY is not configured.");
    return null;
  }
  const intervalMinutes = Number(process.env.BRSAPI_SYNC_INTERVAL_MINUTES || 60);
  const intervalMs = Number.isFinite(intervalMinutes) && intervalMinutes >= 5
    ? intervalMinutes * 60 * 1000
    : DEFAULT_INTERVAL_MS;

  const run = () => {
    syncBrsApiProCurrencyRates(pool).catch((error) => {
      console.error("Currency rates worker failed:", error?.message || error);
    });
  };

  const timer = setInterval(run, intervalMs);
  timer.unref?.();
  run();
  console.log(`Currency rates worker enabled with ${intervalMs}ms interval.`);
  return timer;
}
