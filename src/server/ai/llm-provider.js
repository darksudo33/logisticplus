const DEFAULT_TIMEOUT_MS = 8000;
const OPENAI_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions";

function configuredProvider() {
  return String(process.env.LLM_PROVIDER || (process.env.LLM_BASE_URL ? "custom" : "openai")).trim().toLowerCase();
}

function configuredModel(strength = "fast") {
  return String(
    strength === "strong"
      ? process.env.LLM_MODEL_STRONG || process.env.LLM_MODEL_FAST || "gpt-5-nano"
      : process.env.LLM_MODEL_FAST || process.env.LLM_MODEL_STRONG || "gpt-5-nano"
  ).trim();
}

function configuredBaseUrl(provider) {
  const baseUrl = String(process.env.LLM_BASE_URL || "").trim();
  if (baseUrl) return baseUrl;
  if (/^https?:\/\//i.test(provider)) return provider;
  return "";
}

function providerEndpoint(provider) {
  const baseUrl = configuredBaseUrl(provider);
  if (baseUrl) {
    const normalized = baseUrl.replace(/\/+$/, "");
    if (/\/chat\/completions$/i.test(normalized)) return normalized;
    return `${normalized}/chat/completions`;
  }
  if (!provider || provider === "openai") return OPENAI_CHAT_COMPLETIONS_URL;
  return OPENAI_CHAT_COMPLETIONS_URL;
}

export function llmProviderStatus() {
  const hasApiKey = Boolean(String(process.env.LLM_API_KEY || "").trim());
  return {
    configured: hasApiKey,
    provider: hasApiKey ? configuredProvider() : "",
    baseUrlConfigured: Boolean(String(process.env.LLM_BASE_URL || "").trim()),
    modelFastConfigured: Boolean(process.env.LLM_MODEL_FAST),
    modelStrongConfigured: Boolean(process.env.LLM_MODEL_STRONG),
  };
}

export async function callLlmProvider({ messages, strength = "fast", timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const apiKey = String(process.env.LLM_API_KEY || "").trim();
  if (!apiKey) {
    return { ok: false, skipped: true, reason: "missing_api_key" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const provider = configuredProvider();

  try {
    const response = await fetch(providerEndpoint(provider), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: configuredModel(strength),
        messages: Array.isArray(messages) ? messages : [],
      }),
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        skipped: false,
        reason: "provider_error",
        status: response.status,
      };
    }

    const answer = String(payload?.choices?.[0]?.message?.content || "").trim();
    if (!answer) {
      return { ok: false, skipped: false, reason: "empty_provider_answer" };
    }

    return { ok: true, answer };
  } catch (error) {
    return {
      ok: false,
      skipped: false,
      reason: error?.name === "AbortError" ? "provider_timeout" : "provider_failed",
    };
  } finally {
    clearTimeout(timer);
  }
}
