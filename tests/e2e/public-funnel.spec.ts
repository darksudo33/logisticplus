import { expect, test, type Page } from "@playwright/test";
import { apiContext, disposeContexts, expectUnavailable } from "./helpers";

const retiredPublicRoutes = ["/pricing", "/signup", "/signup/pending", "/contact", "/billing/callback/zarinpal"];
const loginEntryRoutes = ["/", "/login", ...retiredPublicRoutes];
const viewports = [
  { name: "desktop", width: 1280, height: 720 },
  { name: "mobile", width: 390, height: 844 },
];

function isIgnorableDevServerMessage(message: string) {
  return (
    message.includes("WebSocket connection to") ||
    message.includes("[vite] failed to connect to websocket") ||
    message.includes("WebSocket closed without opened") ||
    message.includes("favicon.ico")
  );
}

async function expectNoRetiredPublicLinks(page: Page) {
  await expect(page.locator('a[href="/contact"]')).toHaveCount(0);
  await expect(page.locator('a[href="/pricing"]')).toHaveCount(0);
  await expect(page.locator('a[href^="/signup"]')).toHaveCount(0);
  await expect(page.locator('a[href*="/billing/callback/zarinpal"]')).toHaveCount(0);
}

for (const viewport of viewports) {
  test.describe(`public release login entry (${viewport.name})`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    for (const route of loginEntryRoutes) {
      test(`${route} renders the login entry without retired funnel links`, async ({ page }) => {
        const consoleErrors: string[] = [];
        page.on("console", (message) => {
          if (message.type() === "error" && !isIgnorableDevServerMessage(message.text())) {
            consoleErrors.push(message.text());
          }
        });
        page.on("pageerror", (error) => {
          if (!isIgnorableDevServerMessage(error.message)) consoleErrors.push(error.message);
        });

        await page.goto(route);
        if (retiredPublicRoutes.includes(route)) {
          await expect(page).toHaveURL(/\/login$/);
        }
        await expect(page.locator('input[type="email"]')).toBeVisible();
        await expect(page.locator('input[type="password"]')).toBeVisible();
        await expectNoRetiredPublicLinks(page);

        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
        expect(overflow).toBe(false);
        expect(consoleErrors).toEqual([]);
      });
    }
  });
}

test("/login does not prefill internal admin email", async ({ page }) => {
  await page.goto("/login");
  await expect(page.locator('input[type="email"]')).toHaveValue("");
  await expect(page.locator("body")).not.toContainText("darksudo22@gmail.com");
});

test("retired public signup, contact, payment, and phone-login APIs stay unavailable", async () => {
  const context = await apiContext();

  await expectUnavailable(await context.post("/api/contact-requests", { data: { companyName: "Disabled" } }));
  await expectUnavailable(await context.post("/api/signup", { data: { companyName: "Disabled" } }));
  await expectUnavailable(await context.post("/api/billing/payments/disabled-payment/start"));
  await expectUnavailable(await context.get("/api/billing/zarinpal/callback?Authority=disabled-public-release&Status=OK"));
  await expectUnavailable(await context.post("/api/auth/phone/request-code", { data: { phone: "09120000000" } }));
  await expectUnavailable(await context.post("/api/auth/phone/verify", { data: { phone: "09120000000", code: "000000" } }));

  await disposeContexts(context);
});

test("retired admin signup and contact review APIs stay unavailable", async () => {
  const context = await apiContext();

  await expectUnavailable(await context.get("/api/admin/signup-requests"));
  await expectUnavailable(await context.post("/api/admin/signup-requests/disabled/review", { data: { approved: true } }));
  await expectUnavailable(await context.delete("/api/admin/signup-requests/disabled"));
  await expectUnavailable(await context.get("/api/admin/contact-requests"));
  await expectUnavailable(await context.post("/api/admin/contact-requests/disabled/resolve"));

  await disposeContexts(context);
});
