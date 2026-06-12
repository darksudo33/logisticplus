import { expect, test, type Page } from "@playwright/test";
import { loginViaUi } from "./helpers";

async function expectNoHorizontalOverflow(page: Page, label: string) {
  const hasOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
  );
  expect(hasOverflow, `${label} should not horizontally overflow`).toBe(false);
}

async function closeDialog(page: Page) {
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

test.describe.serial("mobile layout smoke", () => {
  test("mobile shell, bottom navigation, and key dialogs fit without overflow", async ({ page }) => {
    test.setTimeout(90_000);

    await page.setViewportSize({ width: 390, height: 844 });
    await loginViaUi(page);

    await page.goto("/dashboard");
    await expect(page.getByTestId("mobile-nav-trigger")).toBeVisible();
    await expect(page.locator('nav a[href="/shipments"]').last()).toBeVisible();
    await expectNoHorizontalOverflow(page, "dashboard mobile shell");

    await page.getByTestId("mobile-nav-trigger").click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("dialog").locator('a[href="/shipments"]')).toBeVisible();
    await expectNoHorizontalOverflow(page, "mobile navigation sheet");
    await page.getByRole("dialog").locator('a[href="/shipments"]').click();
    await expect(page).toHaveURL(/\/shipments$/);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expectNoHorizontalOverflow(page, "shipments after mobile nav");

    await expect(page.getByTestId("open-shipment-dialog")).toHaveCount(0);
    await page.getByTestId("open-shipment-v2-create").click();
    await expect(page).toHaveURL(/\/shipments\/new-v2$/);
    await expect(page.getByTestId("shipment-v2-create-page")).toBeVisible();
    await expect(page.getByTestId("shamsi-date-time-trigger")).toHaveCount(0);
    await expectNoHorizontalOverflow(page, "shipment V2 create page");

    await page.goto("/tasks");
    await expect(page.getByTestId("open-task-dialog")).toBeVisible();
    await page.getByTestId("open-task-dialog").click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expectNoHorizontalOverflow(page, "task create dialog");
    await closeDialog(page);

    await page.goto("/shipments/s1");
    await expect(page.getByTestId("shipment-v2-detail-page")).toBeVisible();
    await expectNoHorizontalOverflow(page, "shipment V2 detail mobile dashboard");
  });
});
