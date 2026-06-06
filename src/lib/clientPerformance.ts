type NetworkConnectionInfo = {
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
  saveData?: boolean;
};

export type ClientPerformanceMetric = {
  name: string;
  at: string;
  route: string;
  online: boolean;
  connection: NetworkConnectionInfo | null;
  data?: Record<string, unknown>;
};

type ConnectionLike = EventTarget &
  NetworkConnectionInfo & {
    addEventListener?: EventTarget["addEventListener"];
    removeEventListener?: EventTarget["removeEventListener"];
  };

declare global {
  interface Window {
    __logisticPlusPerf?: ClientPerformanceMetric[];
    __logisticPlusPerfInstalled?: boolean;
    __logisticPlusFetchWrapped?: boolean;
  }
}

const MAX_METRICS = 120;
const SLOW_REQUEST_MS = 2500;
const LONG_TASK_MS = 120;
let warningCount = 0;

function now() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function route() {
  if (typeof window === "undefined") return "";
  return `${window.location.pathname}${window.location.search}`;
}

export function getClientNetworkInfo(): NetworkConnectionInfo | null {
  if (typeof navigator === "undefined") return null;
  const connection = (navigator as Navigator & { connection?: ConnectionLike }).connection;
  if (!connection) return null;
  return {
    effectiveType: connection.effectiveType,
    downlink: connection.downlink,
    rtt: connection.rtt,
    saveData: connection.saveData,
  };
}

function isOnline() {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine;
}

function sanitizeUrl(input: RequestInfo | URL) {
  const rawUrl = input instanceof Request ? input.url : String(input);
  try {
    const parsed = new URL(rawUrl, window.location.origin);
    return parsed.origin === window.location.origin ? parsed.pathname : `${parsed.origin}${parsed.pathname}`;
  } catch {
    return rawUrl.split("?")[0] || "unknown";
  }
}

function requestMethod(input: RequestInfo | URL, init?: RequestInit) {
  if (init?.method) return init.method.toUpperCase();
  if (input instanceof Request) return input.method.toUpperCase();
  return "GET";
}

function shouldWarn(metric: ClientPerformanceMetric) {
  if (warningCount >= 20) return false;
  if (metric.name === "api.request.slow" || metric.name === "api.request.failed") return true;
  if (metric.name === "connection.offline" || metric.name === "main_thread.long_task") return true;
  return false;
}

export function recordClientMetric(name: string, data: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  const metric: ClientPerformanceMetric = {
    name,
    at: new Date().toISOString(),
    route: route(),
    online: isOnline(),
    connection: getClientNetworkInfo(),
    data,
  };

  const metrics = window.__logisticPlusPerf || [];
  metrics.push(metric);
  if (metrics.length > MAX_METRICS) metrics.splice(0, metrics.length - MAX_METRICS);
  window.__logisticPlusPerf = metrics;
  window.dispatchEvent(new CustomEvent("logisticplus:client-metric", { detail: metric }));

  if (shouldWarn(metric)) {
    warningCount += 1;
    console.warn("[LogisticPlus performance]", metric);
  }
}

function installFetchTiming() {
  if (typeof window === "undefined" || window.__logisticPlusFetchWrapped) return;
  window.__logisticPlusFetchWrapped = true;
  const originalFetch = window.fetch.bind(window);

  const monitoredFetch: typeof window.fetch = async (input, init) => {
    const startedAt = now();
    const url = sanitizeUrl(input);
    const method = requestMethod(input, init);

    try {
      const response = await originalFetch(input, init);
      const durationMs = Math.round(now() - startedAt);
      if (durationMs >= SLOW_REQUEST_MS || !response.ok) {
        recordClientMetric(response.ok ? "api.request.slow" : "api.request.failed", {
          url,
          method,
          status: response.status,
          durationMs,
        });
      }
      return response;
    } catch (error) {
      recordClientMetric("api.request.failed", {
        url,
        method,
        durationMs: Math.round(now() - startedAt),
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  };

  window.fetch = monitoredFetch;
}

function installConnectionMonitoring() {
  if (typeof window === "undefined") return;

  const markOnline = () => recordClientMetric("connection.online");
  const markOffline = () => recordClientMetric("connection.offline");
  window.addEventListener("online", markOnline);
  window.addEventListener("offline", markOffline);

  const connection = (navigator as Navigator & { connection?: ConnectionLike }).connection;
  const markConnectionChange = () => recordClientMetric("connection.changed");
  connection?.addEventListener?.("change", markConnectionChange);
}

function installLongTaskMonitoring() {
  if (typeof window === "undefined" || typeof PerformanceObserver === "undefined") return;

  try {
    const observer = new PerformanceObserver((entries) => {
      for (const entry of entries.getEntries()) {
        if (entry.duration >= LONG_TASK_MS) {
          recordClientMetric("main_thread.long_task", {
            durationMs: Math.round(entry.duration),
            startTimeMs: Math.round(entry.startTime),
          });
        }
      }
    });
    observer.observe({ entryTypes: ["longtask"] });
  } catch {
    // Some browsers do not expose long-task observation.
  }
}

export function installClientPerformanceMonitoring() {
  if (typeof window === "undefined" || window.__logisticPlusPerfInstalled) return;
  window.__logisticPlusPerfInstalled = true;
  window.__logisticPlusPerf = window.__logisticPlusPerf || [];

  installFetchTiming();
  installConnectionMonitoring();
  installLongTaskMonitoring();
  recordClientMetric("app.performance_monitor.installed");
}
