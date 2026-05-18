const SMSIR_API_URL = "https://api.sms.ir/v1/send/bulk";

function smsDryRunEnabled() {
  return process.env.SMS_DRY_RUN !== "false";
}

function smsEnabled() {
  return process.env.SMS_ENABLED === "true" || smsDryRunEnabled();
}

function smsTimeoutMs() {
  const value = Number(process.env.SMS_TIMEOUT_MS || 10000);
  return Number.isFinite(value) && value > 0 ? value : 10000;
}

function smsUseDefaultLine() {
  return ["1", "true", "yes", "on"].includes(String(process.env.SMSIR_USE_DEFAULT_LINE || "").trim().toLowerCase());
}

export async function sendSmsMessage({ to, message }) {
  if (!smsEnabled()) {
    return { ok: false, skipped: true, reason: "sms_disabled", raw: { smsEnabled: false } };
  }

  if (smsDryRunEnabled()) {
    return {
      ok: true,
      messageId: `dry-run-${Date.now()}`,
      raw: { dryRun: true, to, message },
    };
  }

  const apiKey = process.env.SMSIR_API_KEY;
  const lineNumber = process.env.SMSIR_LINE_NUMBER;
  const useDefaultLine = smsUseDefaultLine();
  if (!apiKey || (!lineNumber && !useDefaultLine)) {
    throw new Error("SMS.ir API key and line number are required when SMS_DRY_RUN=false, unless SMSIR_USE_DEFAULT_LINE=true.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), smsTimeoutMs());
  try {
    const response = await fetch(SMSIR_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "X-API-KEY": apiKey,
      },
      body: JSON.stringify({
        ...(lineNumber ? { lineNumber } : {}),
        messageText: message,
        mobiles: [to],
      }),
      signal: controller.signal,
    });
    const raw = await response.json().catch(() => ({ status: response.status }));
    if (!response.ok) {
      const error = new Error(`SMS.ir request failed with status ${response.status}.`);
      error.raw = raw;
      throw error;
    }
    const messageId = raw?.data?.messageId || raw?.data?.id || raw?.messageId || null;
    return { ok: true, messageId, raw: { ...raw, useDefaultLine: !lineNumber && useDefaultLine } };
  } finally {
    clearTimeout(timeout);
  }
}
