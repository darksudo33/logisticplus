import { expect, test, type Page } from "@playwright/test";
import { BASE_URL, disposeContexts, loginApi, loginViaUi, readOk, uniqueEmail, USER_PASSWORD } from "./helpers";

async function createCompanyUser(role = "FINANCE") {
  const owner = await loginApi();
  const email = uniqueEmail(`admin-console-${role.toLowerCase()}`);
  await readOk(
    await owner.post("/api/users", {
      data: {
        name: `Admin Console ${role}`,
        email,
        password: USER_PASSWORD,
        role,
      },
    })
  );
  await disposeContexts(owner);
  return email;
}

async function expectNoHorizontalOverflow(page: Page) {
  await expect.poll(
    () => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)
  ).toBe(true);
}

function collectConsoleErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (message) => {
    const text = message.text();
    if (message.type() === "error" && !text.includes("WebSocket") && !text.includes("favicon.ico")) {
      errors.push(text);
    }
  });
  page.on("pageerror", (error) => {
    if (!error.message.includes("WebSocket closed without opened")) errors.push(error.message);
  });
  return errors;
}

test.describe.serial("separate platform admin console", () => {
  test("hides admin navigation from non-admin users and denies direct admin routes", async ({ page }) => {
    const email = await createCompanyUser("FINANCE");
    await loginViaUi(page, email, USER_PASSWORD);

    await expect(page.locator('a[href="/admin"]')).toHaveCount(0);
    await expect(page.locator('a[href="/platform-admin"]')).toHaveCount(0);
    await expect(page.getByTestId("admin-console-shortcut")).toHaveCount(0);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByTestId("mobile-nav-trigger").click();
    await expect(page.locator('[data-slot="sheet-content"] a[href="/admin"]')).toHaveCount(0);
    await expect(page.locator('[data-slot="sheet-content"] a[href="/platform-admin"]')).toHaveCount(0);

    await page.goto("/platform-admin");
    await expect(page.getByTestId("admin-forbidden")).toBeVisible();
    await expect(page).toHaveURL(/\/platform-admin$/);

    await page.goto("/admin");
    await expect(page).toHaveURL(/\/platform-admin$/);
    await expect(page.getByTestId("admin-forbidden")).toBeVisible();
  });

  test("loads the admin shell for platform admins and preserves /admin redirect", async ({ page }) => {
    await loginViaUi(page);
    await expect(page.getByTestId("admin-console-shortcut")).toBeVisible();
    await expect(page.locator('a[href="/admin"]')).toHaveCount(0);

    await page.goto("/admin");
    await expect(page).toHaveURL(/\/platform-admin$/);
    await expect(page.getByTestId("admin-shell")).toBeVisible();
    await expect(page.getByTestId("admin-sidebar")).toBeVisible();
    await expect(page.getByTestId("mobile-nav-trigger")).toHaveCount(0);
    await expect(page.getByTestId("admin-legacy-tabbar")).toHaveCount(0);
    await expect(page.getByTestId("admin-command-header")).toBeVisible();
    await expect(page.getByTestId("admin-command-hero")).toBeVisible();
    await expect(page.getByTestId("admin-kpi-grid")).toBeVisible();
    await expect(page.getByTestId("admin-section-overview")).toBeVisible();
  });

  test("renders the active admin modules in the separate console shell", async ({ page }) => {
    await loginViaUi(page);
    await page.goto("/platform-admin");
    await expect(page.getByTestId("admin-shell")).toBeVisible();
    await expect(page.getByTestId("admin-billing-panel")).toBeVisible();
    await expect(page.getByTestId("admin-organizations-panel")).toBeVisible();
    await expect(page.getByTestId("admin-errors-panel")).toBeVisible();
    await expect(page.getByTestId("admin-health-panel")).toBeVisible();

    for (const section of ["overview", "organizations", "subscriptions", "billing", "errors"]) {
      await page.getByTestId(`admin-nav-${section}`).first().click();
      await expect(page.getByTestId(`admin-section-${section}`)).toBeVisible();
      await expectNoHorizontalOverflow(page);
    }
  });

  test("does not expose retired signup request or contact modules", async ({ page }) => {
    await loginViaUi(page);
    await page.goto("/platform-admin");
    await expect(page.getByTestId("admin-nav-requests")).toHaveCount(0);
    await expect(page.getByTestId("admin-nav-contacts")).toHaveCount(0);
    await expect(page.getByTestId("admin-signups-panel")).toHaveCount(0);
    await expect(page.getByTestId("admin-contacts-panel")).toHaveCount(0);
    await expect(page.getByTestId("admin-section-requests")).toHaveCount(0);
    await expect(page.getByTestId("admin-section-contacts")).toHaveCount(0);
  });

  test("is responsive on mobile without console errors or horizontal overflow", async ({ browser }) => {
    const context = await browser.newContext({
      baseURL: BASE_URL,
      viewport: { width: 390, height: 844 },
    });
    const page = await context.newPage();
    const errors = collectConsoleErrors(page);

    await loginViaUi(page);
    await page.goto("/platform-admin", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("admin-shell")).toBeVisible();
    await expect(page.getByTestId("admin-mobile-nav")).toBeVisible();
    await page.getByTestId("admin-mobile-menu-trigger").click();
    await expect(page.locator('[data-slot="sheet-content"]')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    expect(errors).toEqual([]);

    await context.close();
  });
});
