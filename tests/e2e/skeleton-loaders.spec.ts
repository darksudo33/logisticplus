import { expect, test } from "@playwright/test";
import { OWNER_EMAIL, OWNER_PASSWORD } from "./helpers";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test("protected app shows skeleton content while bootstrap hydrates", async ({ page }) => {
  const response = await page.request.post("/api/auth/login", {
    data: { email: OWNER_EMAIL, password: OWNER_PASSWORD },
  });
  expect(response.status(), await response.text()).toBeLessThan(400);
  const payload = await response.json();

  await page.addInitScript((user) => {
    window.localStorage.setItem("logisticplus.currentUser", JSON.stringify(user));
  }, payload.user);

  await page.route("**/api/users/*/bootstrap", async (route) => {
    await delay(700);
    await route.continue();
  });

  await page.goto("/dashboard");
  const protectedSkeleton = page.getByTestId("protected-content-skeleton");
  await expect(protectedSkeleton.first()).toBeVisible();
  await expect(protectedSkeleton).toHaveCount(0, { timeout: 15_000 });
  await expect(page.locator("main")).toBeVisible();
});

test("public async surfaces use skeleton placeholders", async ({ page }) => {
  await page.route("**/api/plans", async (route) => {
    await delay(700);
    await route.continue();
  });

  await page.goto("/pricing");
  await expect(page.getByTestId("plans-sync-skeleton")).toBeVisible();
  await expect(page.getByTestId("plans-sync-skeleton")).toBeHidden({ timeout: 15_000 });

  await page.route("**/api/public/track/skeleton-token", async (route) => {
    await delay(700);
    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ ok: false, error: { message: "Tracking unavailable" } }),
    });
  });

  await page.goto("/track/skeleton-token");
  await expect(page.getByTestId("public-tracking-skeleton")).toBeVisible();
  await expect(page.getByTestId("public-tracking-skeleton")).toBeHidden({ timeout: 15_000 });
});

test("login submit action uses button skeleton while pending", async ({ page }) => {
  await page.route("**/api/auth/login", async (route) => {
    await delay(700);
    await route.continue();
  });

  await page.goto("/login");
  await page.locator('input[type="email"]').fill(OWNER_EMAIL);
  await page.locator('input[type="password"]').fill(OWNER_PASSWORD);

  const submitButton = page.locator("main section").last().locator("button").last();
  await submitButton.click();
  await expect(submitButton.getByTestId("action-skeleton")).toBeVisible();
});
