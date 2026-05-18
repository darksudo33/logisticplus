type ErrorPayload = {
  source?: string;
  severity?: string;
  message: string;
  stack?: string;
  route?: string;
  apiEndpoint?: string;
  httpStatus?: number;
  context?: Record<string, unknown>;
};

let installed = false;
let lastReportAt = 0;

function route() {
  return `${window.location.pathname}${window.location.search}`;
}

function isIgnorableClientError(message = "", stack = "") {
  const text = `${message}\n${stack}`;
  return (
    text.includes("WebSocket closed without opened") ||
    text.includes("[vite] failed to connect to websocket") ||
    text.includes("/@vite/client")
  );
}

export async function reportClientError(payload: ErrorPayload) {
  if (isIgnorableClientError(payload.message, payload.stack)) return;

  const now = Date.now();
  if (now - lastReportAt < 750) return;
  lastReportAt = now;
  try {
    await fetch("/api/client-errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: payload.source || "client",
        severity: payload.severity || "error",
        message: payload.message,
        stack: payload.stack || "",
        route: payload.route || route(),
        apiEndpoint: payload.apiEndpoint || "",
        httpStatus: payload.httpStatus,
        browser: navigator.userAgent,
        context: payload.context || {},
      }),
    });
  } catch {
    // Error reporting must never break the app shell.
  }
}

export function installClientErrorReporting() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("error", (event) => {
    reportClientError({
      source: "client",
      message: event.message || "Window error",
      stack: event.error?.stack || "",
      context: { filename: event.filename, line: event.lineno, column: event.colno },
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    reportClientError({
      source: "client",
      message: reason?.message || String(reason || "Unhandled promise rejection"),
      stack: reason?.stack || "",
      context: { type: "unhandledrejection" },
    });
  });
}
