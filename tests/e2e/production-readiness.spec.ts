import { expect, test } from "@playwright/test";
import {
  BASE_URL,
  OWNER_EMAIL,
  OWNER_PASSWORD,
  apiContext,
  disposeContexts,
  loginApi,
  loginViaUi,
  readOk,
} from "./helpers";

const protectedApiRoutes = [
  "/api/auth/me",
  "/api/customers",
  "/api/shipments",
  "/api/tasks",
  "/api/documents",
  "/api/admin/overview",
  "/api/admin/payments",
];

function cookieAttributes(setCookie = "") {
  return Object.fromEntries(
    setCookie
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [key, ...value] = part.split("=");
        return [key.toLowerCase(), value.join("=") || true];
      })
  );
}

function isIgnorableConsoleMessage(message: string) {
  return (
    message.includes("WebSocket connection to") ||
    message.includes("[vite] failed to connect to websocket") ||
    message.includes("WebSocket closed without opened") ||
    message.includes("favicon.ico")
  );
}

test.describe.serial("production readiness regression checks", () => {
  test("session cookies are HTTP-only, same-site, and invalidated on logout", async () => {
    const context = await apiContext();
    const login = await context.post("/api/auth/login", {
      data: { email: OWNER_EMAIL, password: OWNER_PASSWORD, remember: true },
    });
    expect(login.status(), await login.text()).toBeLessThan(400);
    const setCookie = login.headers()["set-cookie"] || "";
    const attrs = cookieAttributes(setCookie);
    expect(setCookie).toContain("logisticplus_session=");
    expect(attrs.httponly).toBe(true);
    expect(String(attrs.samesite).toLowerCase()).toBe("lax");
    expect(attrs.expires).toBeTruthy();
    if (BASE_URL.startsWith("https://")) expect(attrs.secure).toBe(true);

    await readOk(await context.get("/api/auth/me"));
    await readOk(await context.post("/api/auth/logout"));
    const afterLogout = await context.get("/api/auth/me");
    expect(afterLogout.status(), await afterLogout.text()).toBe(401);
    await disposeContexts(context);
  });

  test("representative protected APIs reject anonymous requests", async () => {
    const context = await apiContext();
    for (const route of protectedApiRoutes) {
      const response = await context.get(route);
      expect([401, 403], `${route} should reject anonymous access`).toContain(response.status());
    }
    await disposeContexts(context);
  });

  test("dashboard restores from the session cookie when local user storage is missing", async ({ browser }) => {
    const context = await browser.newContext({ baseURL: BASE_URL });
    const page = await context.newPage();
    await page.goto("/login");
    await page.evaluate(() => localStorage.removeItem("logisticplus.currentUser"));

    const login = await context.request.post("/api/auth/login", {
      data: { email: OWNER_EMAIL, password: OWNER_PASSWORD, remember: true },
    });
    expect(login.status(), await login.text()).toBeLessThan(400);

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.locator(".app-shell")).toBeVisible();
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
    await context.close();
  });

  test("dashboard and core workspaces render cleanly on desktop and mobile", async ({ browser }) => {
    const viewports = [
      { name: "desktop", width: 1280, height: 720 },
      { name: "mobile", width: 390, height: 844 },
    ];
    const routes = ["/dashboard", "/customers", "/shipments", "/tasks", "/documents", "/login"];

    for (const viewport of viewports) {
      const context = await browser.newContext({
        baseURL: BASE_URL,
        viewport: { width: viewport.width, height: viewport.height },
      });
      const page = await context.newPage();
      const consoleErrors: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error" && !isIgnorableConsoleMessage(message.text())) {
          consoleErrors.push(`${viewport.name}: ${message.text()}`);
        }
      });
      page.on("pageerror", (error) => {
        if (!isIgnorableConsoleMessage(error.message)) consoleErrors.push(`${viewport.name}: ${error.message}`);
      });

      await loginViaUi(page);
      for (const route of routes) {
        await page.goto(route);
        await expect(page.locator("body")).toBeVisible();
        await expect(page).not.toHaveURL(/\/login$/);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
        expect(overflow, `${viewport.name} ${route} should not horizontally overflow`).toBe(false);
      }
      expect(consoleErrors).toEqual([]);
      await context.close();
    }
  });

  test("dashboard read APIs stay responsive with seeded data", async () => {
    const context = await loginApi();
    for (const route of [
      "/api/dashboard/summary",
      "/api/dashboard/latest-shipments",
      "/api/dashboard/priority-shipments",
      "/api/dashboard/my-tasks",
      "/api/customers",
      "/api/shipments",
    ]) {
      const started = performance.now();
      await readOk(await context.get(route));
      expect(performance.now() - started, `${route} should stay below 2s locally`).toBeLessThan(2000);
    }
    await disposeContexts(context);
  });
});
