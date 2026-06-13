const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_MAX_TOKENS = 500;
const DEFAULT_TEMPERATURE = 0;

const REQUIRED_ENABLED_KEYS = [
  "HAMYAR_LLM_PROVIDER",
  "HAMYAR_LLM_BASE_URL",
  "HAMYAR_LLM_API_KEY",
  "HAMYAR_LLM_MODEL",
];

function clean(value = "") {
  return String(value || "").trim();
}

function parseEnabled(value = "") {
  return clean(value).toLowerCase() === "true";
}

function safeNumber(value, fallback, { min, max, integer = false } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const bounded = Math.min(Math.max(parsed, min), max);
  return integer ? Math.round(bounded) : bounded;
}

export function redactHamyarLlmSecret(value = "") {
  const text = clean(value);
  if (!text) return "";
  if (text.length <= 8) return "********";
  return `${text.slice(0, 3)}********${text.slice(-3)}`;
}

export function redactHamyarLlmError(value = "") {
  let text = String(value || "");
  text = text.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]");
  text = text.replace(/(api[_-]?key|token|secret)(["'\s:=]+)[A-Za-z0-9._~+/=-]+/gi, "$1$2[REDACTED]");
  return text.slice(0, 500);
}

export function parseHamyarLlmConfig(env = process.env) {
  const requestedEnabled = parseEnabled(env.HAMYAR_LLM_ENABLED);
  const provider = clean(env.HAMYAR_LLM_PROVIDER);
  const baseUrl = clean(env.HAMYAR_LLM_BASE_URL);
  const apiKey = clean(env.HAMYAR_LLM_API_KEY);
  const model = clean(env.HAMYAR_LLM_MODEL);
  const timeoutMs = safeNumber(env.HAMYAR_LLM_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, {
    min: 1000,
    max: 30000,
    integer: true,
  });
  const maxTokens = safeNumber(env.HAMYAR_LLM_MAX_TOKENS, DEFAULT_MAX_TOKENS, {
    min: 64,
    max: 2000,
    integer: true,
  });
  const temperature = safeNumber(env.HAMYAR_LLM_TEMPERATURE, DEFAULT_TEMPERATURE, {
    min: 0,
    max: 1,
  });

  if (!requestedEnabled) {
    return {
      enabled: false,
      configured: false,
      requestedEnabled,
      disabledReason: "hamyar_llm_disabled",
      provider: "",
      baseUrl: "",
      model: "",
      apiKey: "",
      apiKeyConfigured: false,
      timeoutMs,
      maxTokens,
      temperature,
    };
  }

  const missing = REQUIRED_ENABLED_KEYS.filter((key) => !clean(env[key]));
  if (missing.length) {
    return {
      enabled: false,
      configured: false,
      requestedEnabled,
      disabledReason: `hamyar_llm_missing_config:${missing.join(",")}`,
      provider,
      baseUrl,
      model,
      apiKey: "",
      apiKeyConfigured: Boolean(apiKey),
      timeoutMs,
      maxTokens,
      temperature,
    };
  }

  if (!/^https?:\/\//i.test(baseUrl)) {
    return {
      enabled: false,
      configured: false,
      requestedEnabled,
      disabledReason: "hamyar_llm_invalid_base_url",
      provider,
      baseUrl,
      model,
      apiKey: "",
      apiKeyConfigured: true,
      timeoutMs,
      maxTokens,
      temperature,
    };
  }

  return {
    enabled: true,
    configured: true,
    requestedEnabled,
    disabledReason: "",
    provider,
    baseUrl,
    model,
    apiKey,
    apiKeyConfigured: true,
    timeoutMs,
    maxTokens,
    temperature,
  };
}

export function hamyarLlmPublicStatus(env = process.env) {
  const config = parseHamyarLlmConfig(env);
  return {
    enabled: config.enabled,
    configured: config.configured,
    requestedEnabled: config.requestedEnabled,
    disabledReason: config.disabledReason,
    provider: config.enabled ? config.provider : "",
    baseUrlConfigured: Boolean(config.baseUrl),
    modelConfigured: Boolean(config.model),
    apiKeyConfigured: config.apiKeyConfigured,
    timeoutMs: config.timeoutMs,
    maxTokens: config.maxTokens,
    temperature: config.temperature,
  };
}
