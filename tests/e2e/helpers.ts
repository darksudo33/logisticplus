import { expect, request as requestFactory, type APIRequestContext, type APIResponse, type Page } from "@playwright/test";

export const BASE_URL = process.env.E2E_BASE_URL || `http://127.0.0.1:${process.env.TEST_PORT || 3010}`;
export const OWNER_EMAIL = "darksudo22@gmail.com";
export const OWNER_PASSWORD = process.env.TEST_SEED_USER_PASSWORD || "playwright-owner-pass";
export const USER_PASSWORD = "PlaywrightPass123!";

export function uniqueEmail(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
}

export async function loginViaUi(page: Page, email = OWNER_EMAIL, password = OWNER_PASSWORD) {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: /ورود به پنل/ }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

export async function apiContext() {
  return requestFactory.newContext({ baseURL: BASE_URL });
}

export async function loginApi(email = OWNER_EMAIL, password = OWNER_PASSWORD) {
  const context = await apiContext();
  const response = await context.post("/api/auth/login", {
    data: { email, password },
  });
  expect(response.status(), await response.text()).toBeLessThan(400);
  return context;
}

export async function readOk<T = any>(response: APIResponse): Promise<T> {
  expect(response.status(), await response.text()).toBeLessThan(400);
  const payload = await response.json();
  expect(payload.ok).toBe(true);
  return payload.data as T;
}

export async function expectForbidden(response: APIResponse) {
  expect([401, 403]).toContain(response.status());
}

export async function expectUnavailable(response: APIResponse) {
  expect([403, 404]).toContain(response.status());
}

function collectUnsafeKeys(value: unknown, path = ""): string[] {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectUnsafeKeys(item, `${path}[${index}]`));
  }

  const unsafePatterns = [
    /owner/i,
    /organization/i,
    /legacy/i,
    /token/i,
    /hash/i,
    /password/i,
    /audit/i,
    /staff/i,
    /cheque/i,
    /compliance/i,
    /internal/i,
    /private/i,
    /^task/i,
  ];

  return Object.entries(value as Record<string, unknown>).flatMap(([key, nested]) => {
    const keyPath = path ? `${path}.${key}` : key;
    const unsafe = unsafePatterns.some((pattern) => pattern.test(key)) ? [keyPath] : [];
    return [...unsafe, ...collectUnsafeKeys(nested, keyPath)];
  });
}

export function expectPublicTrackingPayloadIsSafe(data: any) {
  expect(Object.keys(data).sort()).toEqual(["company", "documents", "shipment", "steps"]);
  expect(Object.keys(data.shipment).sort()).toEqual([
    "code",
    "completedPublicStepsCount",
    "currentPublicLabel",
    "currentPublicPhase",
    "destination",
    "estimatedDelivery",
    "lastPublicUpdate",
    "origin",
    "publicNote",
    "publicStatusDescription",
    "publicStatusLabel",
    "totalPublicStepsCount",
  ]);
  expect(Array.isArray(data.steps)).toBe(true);
  expect(Array.isArray(data.documents)).toBe(true);
  for (const document of data.documents) {
    expect(Object.keys(document).sort()).toEqual([
      "createdAt",
      "downloadUrl",
      "fileName",
      "fileSize",
      "id",
      "title",
    ]);
    expect(document.downloadUrl).toContain("/api/public/documents/");
    expect(document.downloadUrl).not.toContain("/api/public/track/");
  }
  expect(Object.keys(data.company).sort()).toEqual(["contactText", "name"]);
  expect(collectUnsafeKeys(data)).toEqual([]);

  const serialized = JSON.stringify(data).toLowerCase();
  for (const forbidden of [
    "organizationid",
    "owner_user_id",
    "organization_id",
    "legacy_data",
    "customer_access_token",
    "trackingtoken",
    "tokenhash",
    "sessiontoken",
    "storagekey",
    "storage_key",
    "objectkey",
    "object_key",
    "storageprovider",
    "storage_provider",
    "storagebucket",
    "storage_bucket",
    "storageregion",
    "storage_region",
    "localpath",
    "local_path",
    "filepath",
    "file_path",
    "bucket",
    "region",
    "signedurl",
    "signed_url",
    "internalnotes",
    "privatenotes",
    "payment",
    "invoice",
    "receipt",
    "sms",
    "password_hash",
    "audit",
    "cheques",
    "compliance",
  ]) {
    expect(serialized).not.toContain(forbidden);
  }
}

export async function disposeContexts(...contexts: APIRequestContext[]) {
  await Promise.all(contexts.map((context) => context.dispose()));
}
