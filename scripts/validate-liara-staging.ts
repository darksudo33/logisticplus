// @ts-nocheck
import "dotenv/config";

const DEFAULT_OWNER_EMAIL = "darksudo22@gmail.com";
const DEFAULT_SHIPMENT_ID = "s1";

function envFlag(name, defaultValue = false) {
  const value = process.env[name];
  if (value == null || value === "") return defaultValue;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function normalizeBaseUrl(value) {
  const url = value.replace(/\/+$/, "");
  if (!/^https:\/\//i.test(url) && !envFlag("STAGING_ALLOW_INSECURE_URL")) {
    throw new Error("STAGING_PUBLIC_URL must be HTTPS for Liara staging. Set STAGING_ALLOW_INSECURE_URL=true only for local debugging.");
  }
  return url;
}

const baseUrl = normalizeBaseUrl(requiredEnv("STAGING_PUBLIC_URL"));
const ownerEmail = process.env.STAGING_OWNER_EMAIL || DEFAULT_OWNER_EMAIL;
const ownerPassword = process.env.STAGING_OWNER_PASSWORD || "";
const shipmentId = process.env.STAGING_SMOKE_SHIPMENT_ID || DEFAULT_SHIPMENT_ID;
const skipAuthSmoke = envFlag("STAGING_SKIP_AUTH_SMOKE", false);

let sessionCookie = "";

function stageUrl(path) {
  return `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function log(message) {
  console.log(`- ${message}`);
}

function pass(message) {
  console.log(`✓ ${message}`);
}

function skip(message) {
  console.log(`↷ ${message}`);
}

function cookieFromSetCookie(value) {
  if (!value) return "";
  return value
    .split(/,(?=\s*[^;,]+=)/)
    .map((part) => part.trim().split(";")[0])
    .filter((part) => part.startsWith("logisticplus_session="))
    .join("; ");
}

async function responseText(response) {
  return await response.text().catch(() => "");
}

async function fetchRaw(path, init = {}, authenticated = false) {
  const headers = new Headers(init.headers || {});
  if (authenticated && sessionCookie) headers.set("Cookie", sessionCookie);
  return fetch(stageUrl(path), {
    ...init,
    headers,
  });
}

async function fetchJson(path, init = {}, authenticated = false) {
  const response = await fetchRaw(path, init, authenticated);
  const text = await responseText(response);
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`${path} did not return JSON. Status ${response.status}. Body: ${text.slice(0, 300)}`);
  }
  if (!response.ok || payload?.ok === false) {
    throw new Error(`${path} failed with ${response.status}: ${JSON.stringify(payload).slice(0, 500)}`);
  }
  return { response, payload };
}

async function checkHealth() {
  log("Checking API and database health.");
  const health = await fetchJson("/api/health");
  assert(health.payload.status === "ok", "/api/health did not return status ok.");
  const dbHealth = await fetchJson("/api/db/health");
  assert(dbHealth.payload.status === "ok", "/api/db/health did not return status ok.");
  pass("Health endpoints are ok.");
}

async function checkPublicPages() {
  log("Checking SPA shell routes.");
  const checks = [
    { path: "/" },
    { path: "/login" },
    { path: "/contact" },
    { path: "/admin" },
  ];

  for (const check of checks) {
    const response = await fetchRaw(check.path);
    const text = await responseText(response);
    assert(response.ok, `${check.path} returned ${response.status}.`);
    assert(text.includes("Logistic Plus") && text.includes('id="root"'), `${check.path} did not return the app shell.`);
  }

  pass("Public/app shell pages load.");
}

async function checkRemovedPublicEndpoints() {
  log("Checking removed public self-serve endpoints.");
  const checks = [
    { path: "/api/contact-requests", init: { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" } },
    { path: "/api/signup", init: { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" } },
  ];

  for (const check of checks) {
    const response = await fetchRaw(check.path, check.init);
    assert(response.status === 404, `${check.path} should return 404 after public-release cleanup, got ${response.status}.`);
  }

  pass("Removed public endpoints return 404.");
}

async function loginOwner() {
  if (skipAuthSmoke) {
    skip("Authenticated smoke skipped by STAGING_SKIP_AUTH_SMOKE.");
    return false;
  }
  if (!ownerPassword) {
    skip("Authenticated smoke skipped because STAGING_OWNER_PASSWORD is not set.");
    return false;
  }

  log(`Logging in as ${ownerEmail}.`);
  const response = await fetchRaw("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: ownerEmail, password: ownerPassword }),
  });
  const text = await responseText(response);
  let payload = null;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`/api/auth/login did not return JSON. Status ${response.status}. Body: ${text.slice(0, 300)}`);
  }
  if (!response.ok) throw new Error(`/api/auth/login failed with ${response.status}: ${JSON.stringify(payload).slice(0, 500)}`);

  sessionCookie = cookieFromSetCookie(response.headers.get("set-cookie"));
  assert(sessionCookie, "Login did not return a session cookie.");

  const me = await fetchJson("/api/auth/me", {}, true);
  assert(me.payload?.data?.user?.email, "/api/auth/me did not return a user.");
  pass("Owner login works.");
  return true;
}

async function checkDocumentAndTrackingSmoke() {
  if (!sessionCookie) return;

  log(`Uploading and downloading a private smoke document for shipment ${shipmentId}.`);
  const marker = `Logistic Plus Liara staging document smoke ${Date.now()}`;
  const form = new FormData();
  form.append("file", new Blob([marker], { type: "text/plain" }), "liara-staging-smoke.txt");
  form.append("title", "STAGING QA private document smoke");
  form.append("type", "OTHER");
  form.append("visibility", "internal");
  form.append("shipmentId", shipmentId);

  const upload = await fetchJson("/api/documents/upload", { method: "POST", body: form }, true);
  const document = upload.payload.data;
  assert(document?.id, "Document upload did not return a document id.");

  const download = await fetchRaw(`/api/documents/${encodeURIComponent(document.id)}/download`, {}, true);
  const downloadText = await responseText(download);
  assert(download.ok, `Document download returned ${download.status}.`);
  assert(downloadText.includes(marker), "Downloaded document content did not match the uploaded smoke file.");
  pass("Private document upload/download works.");

  log("Making smoke document customer-visible and generating public tracking.");
  await fetchJson(
    `/api/documents/${encodeURIComponent(document.id)}/visibility`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visibility: "customer_visible" }),
    },
    true
  );

  const access = await fetchJson(`/api/shipments/${encodeURIComponent(shipmentId)}/customer-access/generate`, { method: "POST" }, true);
  const token = access.payload?.data?.token;
  assert(token, "Customer-access generation did not return a public token.");

  const publicTrack = await fetchJson(`/api/public/track/${encodeURIComponent(token)}`);
  assert(publicTrack.payload?.data?.shipment, "Public tracking payload did not include shipment data.");
  assert(
    Array.isArray(publicTrack.payload?.data?.documents) &&
      publicTrack.payload.data.documents.some((item) => item.id === document.id),
    "Public tracking payload did not include the customer-visible smoke document."
  );
  assert(!JSON.stringify(publicTrack.payload.data).includes("password_hash"), "Public tracking payload leaked a private-looking field.");
  pass("Customer-visible document appears through safe public tracking.");
}

async function main() {
  console.log(`Liara staging validation target: ${baseUrl}`);
  await checkHealth();
  await checkPublicPages();
  await checkRemovedPublicEndpoints();
  const loggedIn = await loginOwner();
  if (loggedIn) await checkDocumentAndTrackingSmoke();
  console.log("\nLiara staging validation passed.");
}

main().catch((error) => {
  console.error("\nLiara staging validation failed:");
  console.error(error?.stack || error?.message || error);
  process.exit(1);
});
