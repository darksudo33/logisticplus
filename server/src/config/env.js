export function isConfigSmokeOnly(env = process.env) {
  return env.CONFIG_SMOKE_ONLY === "true";
}

export function isHmrDisabled(env = process.env) {
  return env.DISABLE_HMR === "true";
}

export function isProductionMode(env = process.env) {
  return env.NODE_ENV === "production";
}

export function resolveServerPort(env = process.env) {
  const port = Number.parseInt(env.PORT || "3000", 10);
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error(`Invalid PORT value: ${env.PORT}`);
  }
  return port;
}
