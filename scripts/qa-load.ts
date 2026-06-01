// @ts-nocheck
import "dotenv/config";
import crypto from "node:crypto";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const { Client } = pg;

const PRODUCTION_URL = "https://logisticplus.liara.run";
const targetUrl = normalizeBaseUrl(
  process.env.QA_TARGET_URL ||
    process.env.E2E_BASE_URL ||
    (process.env.QA_MODE === "production" ? PRODUCTION_URL : `http://127.0.0.1:${process.env.TEST_PORT || 3010}`)
);
const mode = process.env.QA_MODE || (targetUrl.includes("liara.run") ? "production" : "local");
const writeMode = process.env.QA_WRITE_MODE || "full";
const prefix = process.env.QA_PREFIX || `QA-HEAVY-${Date.now()}`;
const ownerEmail = process.env.QA_OWNER_EMAIL || process.env.STAGING_OWNER_EMAIL || "darksudo22@gmail.com";
const configuredOwnerPassword =
  process.env.QA_OWNER_PASSWORD ||
  process.env.STAGING_OWNER_PASSWORD ||
  process.env.TEST_SEED_USER_PASSWORD ||
  process.env.SEED_USER_PASSWORD ||
  "";
const ownerPassword = configuredOwnerPassword || "playwright-owner-pass";
const maxVus = intEnv("QA_MAX_VUS", mode === "production" ? 640 : 60);
const stageSeconds = intEnv("QA_STAGE_SECONDS", mode === "production" ? 30 : 20);
const latencyThresholdMs = intEnv("QA_P95_THRESHOLD_MS", 3000);
const requestTimeoutMs = intEnv("QA_REQUEST_TIMEOUT_MS", 10000);
const includeUploads = envFlag("QA_INCLUDE_UPLOADS", writeMode === "full");
const browserProbesEnabled = envFlag("QA_BROWSER_PROBES", true);
const authMode = process.env.QA_AUTH_MODE || (process.env.QA_SESSION_TOKEN ? "session-token" : "password");
const databaseUrl =
  process.env.QA_DATABASE_URL ||
  process.env.DATABASE_URL ||
  (mode === "local" ? process.env.TEST_DATABASE_URL || "postgres://postgres@localhost:5432/logisticplus_test" : "");
const systemChromiumPath =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
  [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ].find((candidate) => existsSync(candidate));

let requestCounter = 0;
let sessionCookie = "";
let currentUser = null;

function intEnv(name, fallback) {
  const parsed = Number(process.env[name] || fallback);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function envFlag(name, fallback = false) {
  const raw = process.env[name];
  if (raw == null || raw === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(raw).toLowerCase());
}

function normalizeBaseUrl(value) {
  return String(value || "").replace(/\/+$/, "");
}

function urlFor(route) {
  return `${targetUrl}${route.startsWith("/") ? route : `/${route}`}`;
}

function nextSequence() {
  requestCounter += 1;
  return requestCounter;
}

function cookieFromSetCookie(value) {
  if (!value) return "";
  return value
    .split(/,(?=\s*[^;,]+=)/)
    .map((part) => part.trim().split(";")[0])
    .filter((part) => part.startsWith("logisticplus_session="))
    .join("; ");
}

function percentile(values, pct) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((pct / 100) * sorted.length))];
}

function flattenSamples(samples) {
  return samples.flatMap((sample) => (Array.isArray(sample) ? sample : [sample])).filter(Boolean);
}

function summarizeSamples(samples, startedAt, endedAt) {
  const flat = flattenSamples(samples);
  const latencies = flat.map((sample) => sample.ms).filter((value) => Number.isFinite(value));
  const apiSamples = flat.filter((sample) => sample.kind !== "browser" && sample.kind !== "db");
  const total = flat.length;
  const statusCounts = {};
  const opCounts = {};
  let networkErrors = 0;
  let serverErrors = 0;
  let clientErrors = 0;
  let rateLimited = 0;
  let assertionFailures = 0;
  let uploadErrors = 0;

  for (const sample of flat) {
    statusCounts[sample.status] = (statusCounts[sample.status] || 0) + 1;
    opCounts[sample.op] = (opCounts[sample.op] || 0) + 1;
    if (sample.status === "NETWORK") networkErrors += 1;
    if (Number(sample.status) >= 500) serverErrors += 1;
    if (Number(sample.status) >= 400 && Number(sample.status) < 500) clientErrors += 1;
    if (Number(sample.status) === 429) rateLimited += 1;
    if (sample.assertionFailed) assertionFailures += 1;
    if (sample.op?.includes("documentUpload") && !sample.ok && Number(sample.status) !== 429) uploadErrors += 1;
  }

  const durationSeconds = Math.max(0.001, (endedAt - startedAt) / 1000);
  return {
    totalRequests: total,
    apiRequests: apiSamples.length,
    browserSamples: flat.filter((sample) => sample.kind === "browser").length,
    durationSeconds: Number(durationSeconds.toFixed(2)),
    rps: Number((apiSamples.length / durationSeconds).toFixed(2)),
    p50Ms: Math.round(percentile(latencies, 50)),
    p95Ms: Math.round(percentile(latencies, 95)),
    p99Ms: Math.round(percentile(latencies, 99)),
    minMs: Math.round(Math.min(...latencies, 0)),
    maxMs: Math.round(Math.max(...latencies, 0)),
    statusCounts,
    opCounts,
    networkErrors,
    serverErrors,
    clientErrors,
    rateLimited,
    assertionFailures,
    uploadErrors,
    serverErrorRate: total ? Number((serverErrors / total).toFixed(4)) : 0,
    networkErrorRate: total ? Number((networkErrors / total).toFixed(4)) : 0,
    rateLimitedRate: total ? Number((rateLimited / total).toFixed(4)) : 0,
  };
}

async function timedFetch(op, route, init = {}, expectJson = false) {
  const { skipAuth = false, ...fetchInit } = init;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  const started = performance.now();
  try {
    const headers = new Headers(fetchInit.headers || {});
    if (!skipAuth && sessionCookie && !headers.has("Cookie")) headers.set("Cookie", sessionCookie);
    const response = await fetch(urlFor(route), {
      ...fetchInit,
      headers,
      signal: controller.signal,
    });
    let payload = null;
    if (expectJson) {
      payload = await response.json().catch(() => null);
    } else {
      await response.arrayBuffer().catch(() => null);
    }
    return {
      kind: "api",
      op,
      route,
      status: response.status,
      ok: response.ok && (!payload || payload.ok !== false),
      ms: performance.now() - started,
      payload,
      setCookie: response.headers.get("set-cookie") || "",
    };
  } catch (error) {
    return {
      kind: "api",
      op,
      route,
      status: "NETWORK",
      ok: false,
      ms: performance.now() - started,
      error: error?.message || String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function jsonRequest(op, route, data, method = "POST", init = {}) {
  return timedFetch(
    op,
    route,
    {
      ...init,
      method,
      headers: { "Content-Type": "application/json", ...(init.headers || {}) },
      body: JSON.stringify(data),
    },
    true
  );
}

async function login() {
  if (process.env.QA_SESSION_TOKEN) {
    sessionCookie = `logisticplus_session=${encodeURIComponent(process.env.QA_SESSION_TOKEN)}`;
    const me = await timedFetch("sessionToken:me", "/api/auth/me", {}, true);
    currentUser = me.payload?.data?.user || null;
    if (!me.ok || !currentUser?.id) {
      throw new Error(`QA_SESSION_TOKEN was not accepted at ${targetUrl}. Status ${me.status}.`);
    }
    return;
  }

  if (authMode === "db-session") {
    await loginWithDatabaseSession();
    return;
  }

  const result = await timedFetch(
    "login",
    "/api/auth/login",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: ownerEmail, password: ownerPassword, remember: true }),
      skipAuth: true,
    },
    true
  );
  if (!result.ok) {
    throw new Error(`Owner login failed for ${ownerEmail} at ${targetUrl}. Status ${result.status}.`);
  }
  sessionCookie = cookieFromSetCookie(result.setCookie);
  currentUser = result.payload?.user || result.payload?.data?.user || null;
  if (!sessionCookie || !currentUser?.id) {
    throw new Error("Owner login succeeded but did not return a usable session cookie/user.");
  }
}

async function loginWithDatabaseSession() {
  if (!databaseUrl) throw new Error("QA_AUTH_MODE=db-session requires DATABASE_URL or QA_DATABASE_URL.");
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const userResult = await client.query(
      `SELECT id, name, email, role, status, organization_id AS "organizationId"
       FROM app_users
       WHERE lower(email) = lower($1)
       LIMIT 1`,
      [ownerEmail]
    );
    currentUser = userResult.rows[0] || null;
    if (!currentUser?.id) throw new Error(`Owner user not found for ${ownerEmail}.`);
    const token = crypto.randomBytes(32).toString("base64url");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    await client.query(
      `INSERT INTO app_sessions (id, user_id, token_hash, expires_at)
       VALUES ($1, $2, $3, NOW() + INTERVAL '2 hours')`,
      [`${prefix}-session-${crypto.randomUUID()}`, currentUser.id, tokenHash]
    );
    sessionCookie = `logisticplus_session=${encodeURIComponent(token)}`;
  } finally {
    await client.end();
  }
}

async function checkHealth() {
  const api = await timedFetch("health", "/api/health", { skipAuth: true }, true);
  const db = await timedFetch("dbHealth", "/api/db/health", { skipAuth: true }, true);
  return { ok: api.ok && db.ok, api, db };
}

function nextId(scope, sequence) {
  return `${prefix}-${scope}-${Date.now()}-${sequence}-${Math.random().toString(36).slice(2, 8)}`;
}

function shamsi(seed, hour = 9) {
  const day = String((seed % 28) + 1).padStart(2, "0");
  const month = String((seed % 12) + 1).padStart(2, "0");
  return `1405/${month}/${day} ${String(hour).padStart(2, "0")}:00`;
}

async function readOperation(sequence) {
  const routes = [
    "/api/auth/me",
    `/api/users/${encodeURIComponent(currentUser.id)}/bootstrap`,
    "/api/dashboard/summary",
    "/api/dashboard/latest-shipments",
    "/api/dashboard/priority-shipments",
    "/api/dashboard/my-tasks",
    "/api/customers",
    "/api/shipments",
    "/api/tasks",
    "/api/cheques",
    "/api/cheques/due-soon",
    "/api/compliance-meetings",
    "/api/quotations",
    "/api/documents",
    "/api/archive",
  ];
  const route = routes[sequence % routes.length];
  return timedFetch(`read:${route}`, route, {}, true);
}

async function publicOperation(sequence) {
  const routes = ["/", "/login", "/signup", "/pricing", "/track/search"];
  const route = routes[sequence % routes.length];
  return timedFetch(`public:${route}`, route, { skipAuth: true });
}

async function securityOperation(sequence) {
  const routes = ["/api/auth/me", "/api/customers", "/api/shipments", "/api/documents", "/api/admin/overview"];
  const route = routes[sequence % routes.length];
  const sample = await timedFetch(`security:anonymous:${route}`, route, { skipAuth: true }, true);
  const expected = sample.status === 401 || sample.status === 403;
  return {
    ...sample,
    ok: expected,
    assertionFailed: !expected,
    assertion: "protected_api_rejects_anonymous",
  };
}

function isPublicTrackingPayloadSafe(data) {
  if (!data || typeof data !== "object") return false;
  const allowedTop = ["company", "documents", "shipment", "steps"];
  const topKeys = Object.keys(data).sort();
  if (JSON.stringify(topKeys) !== JSON.stringify(allowedTop)) return false;
  const serialized = JSON.stringify(data).toLowerCase();
  return ![
    "owner_user_id",
    "organization_id",
    "legacy_data",
    "customer_access_token",
    "password_hash",
    "audit",
    "cheque",
    "compliance",
    "internal",
  ].some((forbidden) => serialized.includes(forbidden));
}

function isIgnorableBrowserMessage(message = "") {
  return (
    message.includes("WebSocket connection to") ||
    message.includes("[vite] failed to connect to websocket") ||
    message.includes("WebSocket closed without opened") ||
    message.includes("favicon.ico")
  );
}

async function writeOperation(sequence) {
  if (writeMode !== "full") return readOperation(sequence);
  const kind = sequence % (includeUploads ? 7 : 6);

  if (kind === 0) {
    const key = nextId("customer", sequence);
    return jsonRequest("write:customer", "/api/customers", {
      name: `${prefix} Contact ${key}`,
      company: `${prefix} Customer ${key}`,
      phone: "09120000000",
      email: `${key.toLowerCase()}@qa.example`,
      address: `${prefix} Address`,
      notes: `${prefix} load test customer`,
    });
  }

  if (kind === 1) {
    const key = nextId("task", sequence);
    return jsonRequest("write:task", "/api/tasks", {
      title: `${prefix} Task ${key}`,
      description: `${prefix} load test task`,
      priority: ["LOW", "MEDIUM", "HIGH", "URGENT"][sequence % 4],
      status: "TODO",
      assignedToUserId: currentUser.id,
      assignedToName: currentUser.name,
      dueDate: shamsi(sequence, 10),
      deadline: "10:00",
    });
  }

  if (kind === 2) {
    const key = nextId("cheque", sequence);
    return jsonRequest("write:cheque", "/api/cheques", {
      bankName: "QA Bank",
      chequeNumber: key,
      amount: 12345678,
      dueDate: shamsi(sequence, 11),
      location: `${prefix} QA desk`,
      receiver: `${prefix} Receiver`,
      description: `${prefix} load test cheque`,
    });
  }

  if (kind === 3) {
    const key = nextId("meeting", sequence);
    return jsonRequest("write:compliance", "/api/compliance-meetings", {
      purpose: `${prefix} Compliance ${key}`,
      departmentName: `${prefix} QA Department`,
      dateTime: shamsi(sequence, 12),
      location: `${prefix} Room`,
      assignedPersonId: currentUser.id,
      assignedPersonName: currentUser.name,
      requiredDocuments: [{ name: `${prefix} Certificate`, required: true, completed: false }],
    });
  }

  if (kind === 4) return createQuotation(sequence);
  if (kind === 5) return trackingWorkflow(sequence);
  return uploadDocument(sequence);
}

async function createQuotation(sequence) {
  const key = nextId("quote", sequence);
  return jsonRequest("write:quotation", "/api/quotations", {
    customerName: `${prefix} Quote Customer ${key}`,
    customerPhone: "09120000000",
    originCity: "Tehran",
    destinationCity: "Bandar Abbas",
    cargoType: "GENERAL",
    weight: 120,
    dimensions: "120x80x60",
    pickupDate: shamsi(sequence, 9),
    deliveryDate: shamsi(sequence + 2, 9),
    requirements: ["tracking"],
    baseRate: 20000000,
    fuelSurcharge: 1000000,
    loadingFees: 500000,
    totalPrice: 21500000,
    validUntil: shamsi(sequence + 14, 9),
    notes: `${prefix} load test quotation`,
  });
}

async function uploadDocument(sequence, fields = {}) {
  const form = new FormData();
  const key = nextId("document", sequence);
  form.append("file", new Blob([`${prefix} document ${key}`], { type: "text/plain" }), `${key}.txt`);
  form.append("title", `${prefix} Document ${key}`);
  form.append("type", "OTHER");
  form.append("visibility", fields.visibility || "internal");
  for (const [name, value] of Object.entries(fields)) {
    if (value != null && name !== "visibility") form.append(name, String(value));
  }
  return timedFetch("write:documentUpload", "/api/documents/upload", { method: "POST", body: form }, true);
}

async function trackingWorkflow(sequence) {
  const samples = [];
  const quotation = await createQuotation(sequence);
  samples.push({ ...quotation, op: "workflow:quotation" });
  const quoteId = quotation.payload?.data?.id;
  if (!quotation.ok || !quoteId) return samples;

  const converted = await timedFetch(
    "workflow:quotationConvert",
    `/api/quotations/${encodeURIComponent(quoteId)}/convert-to-shipment`,
    { method: "POST" },
    true
  );
  samples.push(converted);
  const shipment = converted.payload?.data?.shipment;
  if (!converted.ok || !shipment?.id) return samples;

  const status = await jsonRequest(
    "workflow:publicStatus",
    `/api/shipments/${encodeURIComponent(shipment.id)}/public-status`,
    {
      publicLabel: `${prefix} Public status`,
      publicDescription: `${prefix} customer visible load update`,
      isCustomerVisible: true,
    },
    "PATCH"
  );
  samples.push(status);

  if (includeUploads) {
    samples.push(await uploadDocument(sequence, { shipmentId: shipment.id, visibility: "customer_visible" }));
  }

  const access = await timedFetch(
    "workflow:customerAccess",
    `/api/shipments/${encodeURIComponent(shipment.id)}/customer-access/generate`,
    { method: "POST" },
    true
  );
  samples.push(access);
  const token = access.payload?.data?.token;
  if (!access.ok || !token) return samples;

  const publicTrack = await timedFetch("workflow:publicTrack", `/api/public/track/${encodeURIComponent(token)}`, { skipAuth: true }, true);
  const data = publicTrack.payload?.data;
  samples.push({
    ...publicTrack,
    ok: publicTrack.ok && isPublicTrackingPayloadSafe(data),
    assertionFailed: publicTrack.ok && !isPublicTrackingPayloadSafe(data),
    assertion: "public_tracking_payload_safe",
  });
  return samples;
}

async function operation() {
  const sequence = nextSequence();
  const selector = sequence % 16;
  if (selector < 7) return readOperation(sequence);
  if (selector < 9) return publicOperation(sequence);
  if (selector === 9) return securityOperation(sequence);
  return writeOperation(sequence);
}

function buildStages(max) {
  const candidates = [1, 5, 10, 20, 40, 80, 120, 160, 240, 320, 480, 640];
  const stages = candidates.filter((value) => value <= max);
  if (!stages.includes(max)) stages.push(max);
  return [...new Set(stages)].sort((a, b) => a - b);
}

async function sampleDb(stageVus) {
  if (!databaseUrl) return { ok: true, skipped: true, reason: "DATABASE_URL not available" };
  const started = performance.now();
  const client = new Client({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 3000,
    query_timeout: requestTimeoutMs,
    application_name: `qa-load-${mode}-${stageVus}`,
  });
  try {
    await client.connect();
    const result = await client.query(
      `SELECT
         COUNT(*)::int AS connections,
         COUNT(*) FILTER (WHERE state = 'active')::int AS active_connections,
         COUNT(*) FILTER (WHERE wait_event_type = 'Lock')::int AS lock_waits,
         COUNT(*) FILTER (WHERE wait_event_type IS NOT NULL)::int AS waits
       FROM pg_stat_activity
       WHERE datname = current_database()`
    );
    return { ok: true, ms: Math.round(performance.now() - started), ...result.rows[0] };
  } catch (error) {
    return { ok: false, ms: Math.round(performance.now() - started), error: error?.message || String(error) };
  } finally {
    await client.end().catch(() => {});
  }
}

async function runBrowserProbes(vus) {
  if (!browserProbesEnabled) return [];
  const samples = [];
  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch (error) {
    return [
      {
        kind: "browser",
        op: "browser:launch",
        status: "BROWSER_FAIL",
        ok: false,
        assertionFailed: true,
        ms: 0,
        error: `Playwright import failed: ${error?.message || error}`,
      },
    ];
  }

  const started = performance.now();
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      executablePath: systemChromiumPath || undefined,
      args: ["--disable-dev-shm-usage"],
      timeout: requestTimeoutMs,
    });
  } catch (error) {
    return [
      {
        kind: "browser",
        op: "browser:launch",
        status: "BROWSER_FAIL",
        ok: false,
        assertionFailed: true,
        ms: performance.now() - started,
        error: error?.message || String(error),
      },
    ];
  }

  const base = new URL(targetUrl);
  const cookieValue = sessionCookie.split("=").slice(1).join("=");
  const probes = [
    { name: "desktop", width: 1280, height: 720 },
    { name: "mobile", width: 390, height: 844 },
  ];
  const routes = ["/", "/track/search", "/dashboard", "/customers", "/shipments", "/documents"];
  try {
    for (const viewport of probes) {
      const context = await browser.newContext({
        baseURL: targetUrl,
        viewport: { width: viewport.width, height: viewport.height },
      });
      if (cookieValue) {
        await context.addCookies([
          {
            name: "logisticplus_session",
            value: decodeURIComponent(cookieValue),
            url: targetUrl,
            httpOnly: true,
            secure: base.protocol === "https:",
            sameSite: "Lax",
          },
        ]);
      }
      if (currentUser?.id) {
        await context.addInitScript(
          ({ user }) => {
            window.localStorage.setItem("logisticplus.currentUser", JSON.stringify(user));
          },
          { user: currentUser }
        );
      }
      const page = await context.newPage();
      const consoleErrors = [];
      page.on("console", (message) => {
        if (message.type() === "error" && !isIgnorableBrowserMessage(message.text())) consoleErrors.push(message.text());
      });
      page.on("pageerror", (error) => {
        if (!isIgnorableBrowserMessage(error.message)) consoleErrors.push(error.message);
      });

      for (const route of routes) {
        const probeStarted = performance.now();
        try {
          await page.goto(route, { waitUntil: "domcontentloaded", timeout: requestTimeoutMs });
          await page.waitForLoadState("networkidle", { timeout: Math.min(5000, requestTimeoutMs) }).catch(() => {});
          const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
          const protectedRedirectedToLogin = route !== "/" && route !== "/track/search" && /\/login$/.test(page.url());
          const ok = !overflow && !protectedRedirectedToLogin && consoleErrors.length === 0;
          samples.push({
            kind: "browser",
            op: `browser:${viewport.name}:${route}`,
            route,
            viewport: viewport.name,
            vus,
            status: ok ? "BROWSER_OK" : "BROWSER_FAIL",
            ok,
            assertionFailed: !ok,
            ms: performance.now() - probeStarted,
            overflow,
            consoleErrors: [...consoleErrors],
            finalUrl: page.url(),
          });
        } catch (error) {
          samples.push({
            kind: "browser",
            op: `browser:${viewport.name}:${route}`,
            route,
            viewport: viewport.name,
            vus,
            status: "BROWSER_FAIL",
            ok: false,
            assertionFailed: true,
            ms: performance.now() - probeStarted,
            error: error?.message || String(error),
          });
        }
      }
      await context.close();
    }
  } finally {
    await browser.close().catch(() => {});
  }
  return samples;
}

async function runStage(vus, seconds) {
  const samples = [];
  const startedAt = Date.now();
  const until = startedAt + seconds * 1000;

  async function worker(workerId) {
    while (Date.now() < until) {
      const result = await operation();
      for (const sample of flattenSamples([result])) {
        sample.workerId = workerId;
        samples.push(sample);
      }
    }
  }

  const browserPromise = runBrowserProbes(vus);
  await Promise.all(Array.from({ length: vus }, (_, index) => worker(index)));
  samples.push(...(await browserPromise));
  const endedAt = Date.now();
  const summary = summarizeSamples(samples, startedAt, endedAt);
  const health = await checkHealth();
  const db = await sampleDb(vus);
  const failed =
    !health.ok ||
    db.ok === false ||
    summary.networkErrors > 0 ||
    summary.serverErrorRate > 0.02 ||
    summary.assertionFailures > 0 ||
    summary.p95Ms > latencyThresholdMs;
  return {
    vus,
    seconds,
    failed,
    failureReasons: [
      !health.ok ? "health_failed" : null,
      db.ok === false ? "db_sample_failed" : null,
      summary.networkErrors > 0 ? "network_errors" : null,
      summary.serverErrorRate > 0.02 ? "server_error_rate" : null,
      summary.assertionFailures > 0 ? "assertion_failures" : null,
      summary.p95Ms > latencyThresholdMs ? "p95_latency" : null,
    ].filter(Boolean),
    health: {
      ok: health.ok,
      apiStatus: health.api.status,
      dbStatus: health.db.status,
      apiMs: Math.round(health.api.ms),
      dbMs: Math.round(health.db.ms),
    },
    db,
    ...summary,
    samples: samples.filter((sample) => !sample.ok).slice(0, 40),
  };
}

function recommend(stages) {
  const passing = stages.filter((stage) => !stage.failed);
  const failing = stages.find((stage) => stage.failed) || null;
  const stable = passing.at(-1) || null;
  const stableVus = stable?.vus || 0;
  const safeConcurrentUsers = Math.max(1, Math.floor((failing?.vus || stableVus || 1) * 0.55));
  const dbLatencyHigh = stages.some((stage) => Number(stage.health?.dbMs || 0) > 1000 || Number(stage.db?.ms || 0) > 1000);
  const lockWaits = stages.some((stage) => Number(stage.db?.lock_waits || 0) > 0);
  const rateLimitHeavy = failing && Number(failing.rateLimitedRate || 0) > 0.1;
  const uploadTrouble = failing && Number(failing.uploadErrors || 0) > 0;

  let bottleneck = "No failure observed up to configured max VUs; result is a lower bound.";
  if (failing) {
    if (failing.failureReasons.includes("assertion_failures")) bottleneck = "Safety assertion failed under load.";
    else if (failing.failureReasons.includes("db_sample_failed") || dbLatencyHigh || lockWaits) bottleneck = "Database connection/query latency or lock waits surfaced first.";
    else if (uploadTrouble) bottleneck = "Document upload or file storage path hit errors under load.";
    else if (rateLimitHeavy) bottleneck = "Application rate limits became the visible ceiling before infrastructure failed.";
    else if (failing.failureReasons.includes("server_error_rate")) bottleneck = "App server returned sustained 5xx errors under load.";
    else if (failing.failureReasons.includes("network_errors")) bottleneck = "Network/socket failures appeared under load.";
    else if (failing.failureReasons.includes("p95_latency")) bottleneck = "Latency threshold reached before error saturation.";
    else if (failing.failureReasons.includes("health_failed")) bottleneck = "API or DB health check failed under load.";
  }

  let minimum = "1 vCPU / 1 GB app, 1 vCPU / 1 GB PostgreSQL, DB pool 8-10";
  let recommended = "2 vCPU / 2 GB app, 2 vCPU / 2-4 GB PostgreSQL, DB pool 15-20";
  let next = "Add a second app instance or move to 4 vCPU / 4 GB app and 4-8 GB PostgreSQL.";

  if (stableVus >= 240) {
    minimum = "2 vCPU / 2 GB app, 2 vCPU / 4 GB PostgreSQL, DB pool 20-25";
    recommended = "2 app instances or 4 vCPU / 4 GB app, 4 vCPU / 8 GB PostgreSQL, DB pool 30-40";
    next = "Add horizontal app scaling and DB query monitoring before 300+ concurrent users.";
  } else if (stableVus >= 120) {
    minimum = "2 vCPU / 2 GB app, 2 vCPU / 4 GB PostgreSQL, DB pool 15-20";
    recommended = "4 vCPU / 4 GB app, 4 vCPU / 8 GB PostgreSQL, DB pool 25-35";
    next = "Scale app horizontally or upgrade PostgreSQL when p95 stays above 1.5s near 180 users.";
  } else if (stableVus <= 25) {
    minimum = "1 vCPU / 1 GB app, 1 vCPU / 1 GB PostgreSQL, DB pool 8";
    recommended = "2 vCPU / 2 GB app, 2 vCPU / 2 GB PostgreSQL, DB pool 12-15";
    next = "Upgrade PostgreSQL first if query latency grows, then app CPU/RAM.";
  }

  return {
    measuredStableVus: stableVus,
    firstFailureVus: failing?.vus || null,
    safeConcurrentUsers,
    bottleneck,
    minimum,
    recommended,
    nextUpgradePoint: next,
  };
}

function markdownReport(report) {
  const rows = report.stages
    .map(
      (stage) =>
        `| ${stage.vus} | ${stage.failed ? "fail" : "pass"} | ${stage.rps} | ${stage.p50Ms} | ${stage.p95Ms} | ${stage.p99Ms} | ${stage.serverErrors} | ${stage.networkErrors} | ${stage.rateLimited} | ${stage.assertionFailures} | ${stage.health.dbMs} | ${stage.failureReasons.join(", ") || "-"} |`
    )
    .join("\n");
  return `# QA Load Report

- Target: ${report.targetUrl}
- Mode: ${report.mode}
- Prefix: ${report.prefix}
- Started: ${report.startedAt}
- Ended: ${report.endedAt}
- Write mode: ${report.writeMode}
- Browser probes: ${report.config.browserProbesEnabled ? "enabled" : "disabled"}
- Uploads: ${report.config.includeUploads ? "enabled" : "disabled"}

## Stages

| VUs | Result | RPS | p50 ms | p95 ms | p99 ms | 5xx | Network | 429 | Assertions | DB health ms | Reasons |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
${rows}

## Recommendation

- Stable VUs: ${report.recommendation.measuredStableVus}
- First failure VUs: ${report.recommendation.firstFailureVus ?? "none"}
- Safe production ceiling: ${report.recommendation.safeConcurrentUsers} concurrent users
- First bottleneck: ${report.recommendation.bottleneck}
- Minimum viable: ${report.recommendation.minimum}
- Recommended production: ${report.recommendation.recommended}
- Next upgrade: ${report.recommendation.nextUpgradePoint}
`;
}

function assertSafeConfig() {
  if (mode === "production") {
    if (!targetUrl.startsWith("https://")) {
      throw new Error("Production QA target must be HTTPS.");
    }
    if (writeMode === "full" && !prefix.startsWith("QA-")) {
      throw new Error("Production full-write QA requires QA_PREFIX to start with QA-.");
    }
    if (!configuredOwnerPassword && !process.env.QA_SESSION_TOKEN && authMode !== "db-session") {
      throw new Error("Production QA requires QA_OWNER_PASSWORD, STAGING_OWNER_PASSWORD, QA_SESSION_TOKEN, or QA_AUTH_MODE=db-session.");
    }
  }
}

async function main() {
  assertSafeConfig();
  await fs.mkdir("test-results", { recursive: true });
  const startedAt = new Date().toISOString();
  console.log(`QA load target: ${targetUrl}`);
  console.log(`QA mode: ${mode}; write mode: ${writeMode}; prefix: ${prefix}`);
  await login();
  const initialHealth = await checkHealth();
  if (!initialHealth.ok) throw new Error("Initial health check failed.");

  const stages = [];
  for (const vus of buildStages(maxVus)) {
    console.log(`Running stage: ${vus} VUs for ${stageSeconds}s`);
    const stage = await runStage(vus, stageSeconds);
    stages.push(stage);
    console.log(
      `Stage ${vus}: p95=${stage.p95Ms}ms p99=${stage.p99Ms}ms rps=${stage.rps} 5xx=${stage.serverErrors} network=${stage.networkErrors} 429=${stage.rateLimited} assertions=${stage.assertionFailures} failed=${stage.failed}`
    );
    if (stage.failed) break;
  }

  const report = {
    targetUrl,
    mode,
    writeMode,
    prefix,
    ownerEmail,
    startedAt,
    endedAt: new Date().toISOString(),
    config: {
      maxVus,
      stageSeconds,
      latencyThresholdMs,
      requestTimeoutMs,
      includeUploads,
      browserProbesEnabled,
      databaseSampleEnabled: Boolean(databaseUrl),
    },
    stages,
    recommendation: recommend(stages),
  };
  const stamp = Date.now();
  const reportPath = path.join("test-results", `qa-load-${mode}-${stamp}.json`);
  const markdownPath = path.join("test-results", `qa-load-${mode}-${stamp}.md`);
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  await fs.writeFile(markdownPath, markdownReport(report));
  console.log(`QA load report: ${reportPath}`);
  console.log(`QA load markdown: ${markdownPath}`);
  console.log(JSON.stringify(report.recommendation, null, 2));

  if (stages.some((stage) => stage.failureReasons.includes("assertion_failures"))) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error("QA load failed:", error);
  process.exit(1);
});
