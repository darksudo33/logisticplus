import { expect, test, type Page } from "@playwright/test";
import { BASE_URL, disposeContexts, loginApi, loginViaUi, readOk } from "./helpers";

const viewports = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "laptop", width: 1280, height: 800 },
  { name: "tablet", width: 820, height: 1180 },
  { name: "mobile", width: 390, height: 844 },
];

const protectedRoutes = [
  "/dashboard",
  "/shipments",
  "/shipments/s1",
  "/shipments/s1/edit",
  "/customers",
  "/customers/c1",
  "/tasks",
  "/documents",
  "/compliance-meetings",
  "/cheques",
  "/commercial-cards",
  "/archive",
  "/search",
  "/changelog",
  "/profile",
  "/settings",
  "/management",
  "/platform-admin",
  "/admin",
];

function isIgnorableConsoleMessage(message: string) {
  return (
    message.includes("WebSocket connection to") ||
    message.includes("[vite] failed to connect to websocket") ||
    message.includes("WebSocket closed without opened") ||
    message.includes("favicon.ico")
  );
}

async function expectNoHorizontalOverflow(page: Page, label: string) {
  const hasOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
  );
  expect(hasOverflow, `${label} should not horizontally overflow`).toBe(false);
}

async function expectRouteHealthy(page: Page, route: string, label: string) {
  await page.goto(route, { waitUntil: "domcontentloaded" });
  await expect(page.locator("#root")).toBeVisible();
  await expect(page.locator("body")).not.toBeEmpty();
  await expect(page.locator("text=NaN%")).toHaveCount(0);
  await expectNoHorizontalOverflow(page, `${label} ${route}`);

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("#root")).toBeVisible();
  await expect(page.locator("body")).not.toBeEmpty();
  await expectNoHorizontalOverflow(page, `${label} ${route} after refresh`);
}

async function expectBackForwardWorks(page: Page, firstRoute: string, secondRoute: string, label: string) {
  await page.goto(firstRoute, { waitUntil: "domcontentloaded" });
  await page.goto(secondRoute, { waitUntil: "domcontentloaded" });
  await page.goBack({ waitUntil: "domcontentloaded" });
  await expect(page.locator("#root")).toBeVisible();
  await expectNoHorizontalOverflow(page, `${label} back navigation`);
  await page.goForward({ waitUntil: "domcontentloaded" });
  await expect(page.locator("#root")).toBeVisible();
  await expectNoHorizontalOverflow(page, `${label} forward navigation`);
}

async function ensureLoggedIn(page: Page) {
  if (/\/login$/.test(new URL(page.url()).pathname)) {
    await loginViaUi(page);
  }
}

test.describe.serial("client-readiness route smoke", () => {
  test("public and protected route matrix renders across demo viewports", async ({ browser }) => {
    test.setTimeout(240_000);

    const owner = await loginApi();
    const access = await readOk<{ token: string }>(
      await owner.post("/api/shipments/s1/customer-access/generate")
    );

    const publicRoutes = [
      "/",
      "/login",
      "/contact",
      "/pricing",
      "/signup",
      "/signup/pending",
      "/billing/callback/zarinpal",
      `/track/${encodeURIComponent(access.token)}`,
    ];

    try {
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
          if (!isIgnorableConsoleMessage(error.message)) {
            consoleErrors.push(`${viewport.name}: ${error.message}`);
          }
        });

        for (const route of publicRoutes) {
          await expectRouteHealthy(page, route, viewport.name);
        }
        await expectBackForwardWorks(page, publicRoutes[0], publicRoutes[1], `${viewport.name} public`);

        await loginViaUi(page);
        await page.waitForLoadState("networkidle").catch(() => null);
        for (const route of protectedRoutes) {
          await expectRouteHealthy(page, route, viewport.name);
          await expect(page, `${viewport.name} ${route} should not fall back to login`).not.toHaveURL(/\/login$/);
        }
        await expectBackForwardWorks(page, protectedRoutes[0], protectedRoutes[1], `${viewport.name} protected`);
        await ensureLoggedIn(page);

        await page.goto("/compliance", { waitUntil: "domcontentloaded" });
        await expect(page).toHaveURL(/\/compliance-meetings$/);
        await page.goto("/quotage", { waitUntil: "domcontentloaded" });
        await expect(page).toHaveURL(/\/dashboard$/);
        await page.goto("/quotations", { waitUntil: "domcontentloaded" });
        await expect(page).toHaveURL(/\/dashboard$/);
        await expect(page.locator('a[href="/quotations"]')).toHaveCount(0);

        expect(consoleErrors).toEqual([]);
        await context.close();
      }
    } finally {
      await owner.post("/api/shipments/s1/customer-access/disable").catch(() => null);
      await disposeContexts(owner);
    }
  });
});
