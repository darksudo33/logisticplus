import { expect, test, type Page } from "@playwright/test";
import { loginViaUi } from "./helpers";

const workflows = [
  { route: "/tasks", opener: "open-task-dialog" },
  { route: "/shipments", opener: "open-shipment-dialog" },
  { route: "/cheques", opener: "open-cheque-dialog" },
  { route: "/compliance-meetings", opener: "open-compliance-dialog" },
];

async function expectNoHorizontalOverflow(page: Page) {
  const noHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
  expect(noHorizontalOverflow).toBe(true);
}

async function selectDateAndTehranTime(page: Page) {
  const trigger = page.getByTestId("shamsi-date-time-trigger").first();
  await expect(trigger).toBeVisible();
  await expect(trigger).toContainText("تهران");

  await trigger.click();
  const panel = page.getByTestId("shamsi-date-time-panel");
  await expect(panel).toBeVisible();
  await expect(panel.locator("select")).toHaveCount(2);

  await panel.getByTestId("shamsi-date-day").first().click();
  await panel.getByTestId("shamsi-time-hour-select").selectOption("10");
  await panel.getByTestId("shamsi-time-minute-select").selectOption("30");

  await expect(trigger).toContainText("تهران");
  await expect(trigger).not.toContainText("انتخاب تاریخ");
  await expectNoHorizontalOverflow(page);
}

test("dashboard date workflows use the Shamsi date and Tehran time picker", async ({ page }) => {
  await loginViaUi(page);

  for (const workflow of workflows) {
    await page.goto(workflow.route);
    await page.getByTestId(workflow.opener).click();
    await selectDateAndTehranTime(page);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/tasks");
  await page.getByTestId("open-task-dialog").click();
  await selectDateAndTehranTime(page);
});
