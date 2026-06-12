import { expect, test, type Page } from "@playwright/test";
import { loginViaUi } from "./helpers";

async function selectLastVisibleShamsiDate(page: Page, triggerIndex: number) {
  await page.getByTestId("shamsi-date-time-trigger").nth(triggerIndex).click();
  await page.getByTestId("shamsi-date-day").last().click();
}

test("commercial cards page supports tabs, extra contacts, documents, and Malvani profile CRUD", async ({ page }) => {
  const suffix = Date.now();
  const holderName = `شرکت کارت بازرگانی ${suffix}`;
  const editedHolderName = `${holderName} ویرایش`;
  const responsibleName = `مسئول کارت ${suffix}`;
  const cardNumber = `CC-${suffix}`;
  const nationalId = `140${String(suffix).slice(-7)}`;
  const contactName = `علی رضایی ${suffix}`;
  const malvaniName = `ملوانی خلیج ${suffix}`;
  const editedMalvaniName = `${malvaniName} ویرایش`;

  await loginViaUi(page);
  await page.goto("/commercial-cards");
  await expect(page.getByRole("heading", { name: "کارت‌های بازرگانی و ملوانی" })).toBeVisible();
  await expect(page.getByTestId("malvani-tab")).toBeVisible();

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

  await page.getByTestId("commercial-card-contact-name").fill(contactName);
  await page.getByTestId("commercial-card-contact-role").fill("ناخدا");
  await page.getByTestId("commercial-card-contact-phone").fill("۰۹۱۲۱۲۳۴۵۶۷");
  await page.getByTestId("commercial-card-contact-label").fill("واتساپ");
  await page.getByTestId("commercial-card-contact-note").fill("شماره واتساپ");
  await page.getByTestId("commercial-card-contact-primary").click();
  await page.getByTestId("commercial-card-contact-save").click();
  await expect(page.locator('[role="dialog"]').getByText(contactName)).toBeVisible();

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
  const cardItem = page.getByTestId("commercial-card-item").filter({ hasText: holderName });
  await expect(cardItem).toBeVisible();
  await expect(cardItem).toContainText(cardNumber);
  await expect(cardItem).toContainText("۱");

  await page.getByPlaceholder("جستجو در نام شرکت، شماره کارت، مسئول یا مخاطبین...").fill(responsibleName);
  await expect(cardItem).toBeVisible();
  await page.getByTestId("commercial-card-filter-ALL").click();

  await cardItem.getByRole("button", { name: "مشاهده" }).click();
  await expect(page.getByText("جزئیات کارت بازرگانی")).toBeVisible();
  await expect(page.getByText(contactName)).toBeVisible();
  await expect(page.getByText(nationalId)).toBeVisible();
  await page.getByRole("button", { name: "انصراف" }).click();

  await cardItem.getByRole("button", { name: "ویرایش" }).click();
  await page.getByLabel("نام شرکت / دارنده کارت").fill(editedHolderName);
  await page.getByTestId("commercial-card-submit").click();
  const editedCardItem = page.getByTestId("commercial-card-item").filter({ hasText: editedHolderName });
  await expect(editedCardItem).toBeVisible();

  await editedCardItem.getByRole("button", { name: "غیرفعال‌سازی" }).click();
  await expect(page.getByText("غیرفعال‌سازی کارت بازرگانی")).toBeVisible();
  await page.locator('[role="dialog"]').getByRole("button", { name: "غیرفعال‌سازی" }).click();
  await expect(page.getByTestId("commercial-card-item").filter({ hasText: editedHolderName })).toHaveCount(0);

  await page.getByTestId("malvani-tab").click();
  await page.getByTestId("malvani-add-button").click();
  await page.getByTestId("malvani-display-name").fill(malvaniName);
  await page.getByTestId("malvani-captain-name").fill(`ناخدا ${suffix}`);
  await page.getByTestId("malvani-lenj-name").fill(`لنج ${suffix}`);
  await page.getByTestId("malvani-lenj-registration").fill(`LENJ-${suffix}`);
  await page.getByTestId("malvani-lenj-type").fill("لنج باری");
  await page.getByTestId("malvani-home-port").fill("بندر دیلم");
  await page.getByTestId("malvani-contact-name").fill(`مخاطب ملوانی ${suffix}`);
  await page.getByTestId("malvani-contact-role").fill("ناخدا");
  await page.getByTestId("malvani-contact-phone").fill("09129876543");
  await page.getByTestId("malvani-contact-label").fill("اضطراری");
  await page.getByTestId("malvani-contact-primary").click();
  await page.getByTestId("malvani-contact-save").click();
  await page.getByTestId("malvani-submit").click();

  const profileItem = page.getByTestId("malvani-profile-item").filter({ hasText: malvaniName });
  await expect(profileItem).toBeVisible();
  await expect(profileItem).toContainText("۱");

  await profileItem.getByRole("button", { name: "مشاهده" }).click();
  await expect(page.getByText("پروفایل ملوانی", { exact: true })).toBeVisible();
  await expect(page.getByText("09129876543")).toBeVisible();
  await page.getByRole("button", { name: "ویرایش" }).click();
  await page.getByTestId("malvani-display-name").fill(editedMalvaniName);
  await page.getByTestId("malvani-submit").click();

  const editedProfileItem = page.getByTestId("malvani-profile-item").filter({ hasText: editedMalvaniName });
  await expect(editedProfileItem).toBeVisible();
  await editedProfileItem.getByRole("button", { name: "غیرفعال‌سازی" }).click();
  await expect(page.getByText("غیرفعال‌سازی ملوانی")).toBeVisible();
  await page.locator('[role="dialog"]').getByRole("button", { name: "غیرفعال‌سازی" }).click();
  await expect(page.getByTestId("malvani-profile-item").filter({ hasText: editedMalvaniName })).toHaveCount(0);
});
