import {
  parseHamyarLlmConfig,
  redactHamyarLlmError,
} from "./hamyar-llm-config.js";

function endpointForBaseUrl(baseUrl = "") {
  const normalized = String(baseUrl || "").trim().replace(/\/+$/, "");
  if (/\/chat\/completions$/i.test(normalized)) return normalized;
  if (/\/v1$/i.test(normalized)) return `${normalized}/chat/completions`;
  return `${normalized}/v1/chat/completions`;
}

function emptyResult(overrides = {}) {
  return {
    ok: false,
    text: "",
    json: null,
    latencyMs: 0,
    provider: "",
    model: "",
    errorCode: "",
    safeError: "",
    ...overrides,
  };
}

function parseProviderText(payload = {}) {
  return String(
    payload?.choices?.[0]?.message?.content ||
    payload?.choices?.[0]?.text ||
    payload?.output_text ||
    ""
  ).trim();
}

async function readProviderPayload(response) {
  const text = await response.text().catch(() => "");
  if (!text) return { text: "", json: {} };
  try {
    return { text, json: JSON.parse(text) };
  } catch {
    return { text, json: {} };
  }
}

function parseJsonStrict(text = "") {
  const trimmed = String(text || "").trim();
  if (!trimmed) return null;
  return JSON.parse(trimmed);
}

export function createDisabledLlmProvider(reason = "hamyar_llm_disabled") {
  return {
    isEnabled: () => false,
    status: () => ({ enabled: false, configured: false, disabledReason: reason }),
    callText: async () => emptyResult({
      errorCode: reason,
      safeError: reason,
    }),
    callJson: async () => emptyResult({
      errorCode: reason,
      safeError: reason,
    }),
  };
}

export function createOpenAiCompatibleLlmProvider(config) {
  const endpoint = endpointForBaseUrl(config.baseUrl);

  async function callText(messages = [], options = {}) {
    const startedAt = Date.now();
    const controller = new AbortController();
    const timeoutMs = Number(options.timeoutMs || config.timeoutMs);
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: options.model || config.model,
          messages: Array.isArray(messages) ? messages : [],
          temperature: options.temperature ?? config.temperature,
          max_tokens: options.maxTokens || config.maxTokens,
          ...(options.json ? { response_format: { type: "json_object" } } : {}),
        }),
        signal: controller.signal,
      });
      const payload = await readProviderPayload(response);
      const latencyMs = Date.now() - startedAt;
      if (!response.ok) {
        return emptyResult({
          latencyMs,
          provider: config.provider,
          model: options.model || config.model,
          errorCode: "provider_http_error",
          safeError: redactHamyarLlmError(`HTTP ${response.status}: ${payload.text}`),
        });
      }
      const text = parseProviderText(payload.json);
      if (!text) {
        return emptyResult({
          latencyMs,
          provider: config.provider,
          model: options.model || config.model,
          errorCode: "empty_provider_answer",
          safeError: "Provider returned an empty answer.",
        });
      }
      return {
        ok: true,
        text,
        json: null,
        latencyMs,
        provider: config.provider,
        model: options.model || config.model,
        errorCode: "",
        safeError: "",
      };
    } catch (error) {
      return emptyResult({
        latencyMs: Date.now() - startedAt,
        provider: config.provider,
        model: options.model || config.model,
        errorCode: error?.name === "AbortError" ? "provider_timeout" : "provider_failed",
        safeError: redactHamyarLlmError(error?.message || "Provider call failed."),
      });
    } finally {
      clearTimeout(timer);
    }
  }

  async function callJson(messages = [], options = {}) {
    const result = await callText(messages, { ...options, json: true });
    if (!result.ok) return result;
    try {
      return {
        ...result,
        json: parseJsonStrict(result.text),
      };
    } catch (error) {
      return {
        ...result,
        ok: false,
        json: null,
        errorCode: "invalid_json",
        safeError: redactHamyarLlmError(error?.message || "Provider returned invalid JSON."),
      };
    }
  }

  return {
    isEnabled: () => true,
    status: () => ({
      enabled: true,
      configured: true,
      provider: config.provider,
      model: config.model,
      timeoutMs: config.timeoutMs,
      maxTokens: config.maxTokens,
      temperature: config.temperature,
    }),
    callText,
    callJson,
  };
}

export function createHamyarLlmProvider(config = parseHamyarLlmConfig()) {
  if (!config?.enabled) return createDisabledLlmProvider(config?.disabledReason || "hamyar_llm_disabled");
  return createOpenAiCompatibleLlmProvider(config);
}
