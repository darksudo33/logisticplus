import { expect, test, type Page } from "@playwright/test";
import { loginViaUi } from "./helpers";

async function selectLastVisibleShamsiDate(page: Page, triggerIndex: number) {
  await page.getByTestId("shamsi-date-time-trigger").nth(triggerIndex).click();
  await page.getByTestId("shamsi-date-day").last().click();
}

function statusFilterTestId(statusText: string) {
  if (statusText.includes("منقضی")) return "commercial-card-filter-EXPIRED";
  if (statusText.includes("نزدیک")) return "commercial-card-filter-EXPIRING_SOON";
  return "commercial-card-filter-VALID";
}

test("commercial cards page supports Persian CRUD, status filters, search, and documents", async ({ page }) => {
  const suffix = Date.now();
  const holderName = `شرکت کارت بازرگانی ${suffix}`;
  const editedHolderName = `${holderName} ویرایش`;
  const responsibleName = `مسئول کارت ${suffix}`;
  const cardNumber = `CC-${suffix}`;
  const nationalId = `140${String(suffix).slice(-7)}`;

  await loginViaUi(page);
  await page.goto("/commercial-cards");
  await expect(page.getByRole("heading", { name: "کارت‌های بازرگانی" }).first()).toBeVisible();

  await page.getByTestId("commercial-card-add-button").click();
  await page.getByTestId("commercial-card-submit").click();
  await expect(page.locator('[role="dialog"]').getByText("وارد کردن نام شرکت / دارنده کارت الزامی است.")).toBeVisible();

  await page.getByLabel("نام شرکت / دارنده کارت").fill(holderName);
  await page.getByLabel("شماره کارت بازرگانی").fill(cardNumber);
  await selectLastVisibleShamsiDate(page, 0);
  await selectLastVisibleShamsiDate(page, 1);
  await page.locator("#commercial-holder-name").click();
  await page.getByLabel("کد ملی / شناسه ملی").fill(nationalId);
  await page.getByLabel("نام شخص مسئول").fill(responsibleName);
  await page.getByLabel("شماره تماس مسئول").fill("09120001122");
  await page.getByLabel("توضیحات", { exact: true }).fill("برای پیگیری تاریخ تمدید کارت بازرگانی.");

  await page.getByLabel("عنوان سند").fill("تصویر کارت بازرگانی");
  await page.locator("#commercial-document-file").setInputFiles({
    name: "commercial-card.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("commercial card test document"),
  });
  await page.getByLabel("توضیحات اختیاری").fill("مدرک آزمایشی کارت");
  await page.getByRole("button", { name: "افزودن سند" }).click();
  await expect(page.getByText("تصویر کارت بازرگانی")).toBeVisible();

  await page.getByTestId("commercial-card-submit").click();
  const row = page.locator("tbody tr", { hasText: holderName });
  await expect(row).toBeVisible();
  await expect(row).toContainText(cardNumber);
  await expect(row).toContainText("۱");

  await page.getByPlaceholder("جستجو در نام شرکت، شماره کارت، مسئول یا شناسه ملی...").fill(responsibleName);
  await expect(row).toBeVisible();

  const statusText = await row.locator("td").nth(4).innerText();
  await page.getByTestId(statusFilterTestId(statusText)).click();
  await expect(row).toBeVisible();
  await page.getByTestId("commercial-card-filter-ALL").click();

  await row.getByRole("button", { name: "مشاهده" }).click();
  await expect(page.getByText("جزئیات کارت بازرگانی و اسناد مرتبط")).toBeVisible();
  await expect(page.getByText(nationalId)).toBeVisible();
  await page.getByRole("button", { name: "انصراف" }).click();

  await row.getByRole("button", { name: "ویرایش" }).click();
  await page.getByLabel("نام شرکت / دارنده کارت").fill(editedHolderName);
  await page.getByTestId("commercial-card-submit").click();
  await expect(page.locator("tbody tr", { hasText: editedHolderName })).toBeVisible();

  const editedRow = page.locator("tbody tr", { hasText: editedHolderName });
  await editedRow.getByRole("button", { name: "حذف" }).click();
  await expect(page.getByText("آیا از حذف این کارت بازرگانی مطمئن هستید؟")).toBeVisible();
  await page.locator('[role="dialog"]').getByRole("button", { name: "حذف" }).click();
  await expect(page.locator("tbody tr", { hasText: editedHolderName })).toHaveCount(0);
});
