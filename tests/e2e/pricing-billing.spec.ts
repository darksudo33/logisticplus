import { expect, test } from "@playwright/test";
import { USER_PASSWORD, apiContext, disposeContexts, loginApi, readOk, uniqueEmail } from "./helpers";

const expectedPlans = {
  starter: {
    name: "اقتصادی",
    monthlyPriceIrr: 34900000,
    annualPriceIrr: 349000000,
    users: 3,
    monthlyShipments: 5,
    storageMb: 2048,
    smsNotifications: false,
  },
  business: {
    name: "حرفه‌ای",
    monthlyPriceIrr: 59000000,
    annualPriceIrr: 590000000,
    users: 10,
    monthlyShipments: 20,
    storageMb: 5120,
    smsNotifications: true,
  },
  enterprise: {
    name: "سازمانی",
    monthlyPriceIrr: 99000000,
    annualPriceIrr: 990000000,
    users: 30,
    monthlyShipments: 0,
    storageMb: 51200,
    smsNotifications: true,
  },
} as const;

function normalizeDigits(value: string) {
  const persian = "۰۱۲۳۴۵۶۷۸۹";
  const arabic = "٠١٢٣٤٥٦٧٨٩";
  return value
    .replace(/[۰-۹]/g, (digit) => String(persian.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String(arabic.indexOf(digit)))
    .replace(/[٬,]/g, "");
}

async function normalizedBodyText(page: any) {
  return normalizeDigits(await page.locator("body").innerText());
}

test("pricing page shows updated plan names, prices, limits, and add-ons", async ({ page }) => {
  await page.goto("/pricing");
  await expect(page.locator("h1").first()).toBeVisible();

  const body = await normalizedBodyText(page);
  expect(body).toContain("اقتصادی");
  expect(body).toContain("حرفه‌ای");
  expect(body).toContain("سازمانی");
  expect(body).toContain("34900000 ریال");
  expect(body).toContain("59000000 ریال");
  expect(body).toContain("99000000 ریال");
  expect(body).toContain("تا 5 محموله در ماه");
  expect(body).toContain("تا 20 محموله در ماه");
  expect(body).toContain("محموله ماهانه نامحدود");
  expect(body).toContain("2 گیگابایت فضای اسناد");
  expect(body).toContain("5 گیگابایت فضای اسناد");
  expect(body).toContain("50 گیگابایت فضای اسناد");
  expect(body).toContain("هر کاربر اضافه: 4000000 ریال در ماه");
  expect(body).toContain("هر 10 ظرفیت محموله اضافه: 5000000 ریال در ماه");
  expect(body).toContain("هر 1 گیگابایت فضای اسناد اضافه: 1800000 ریال در ماه");
});

for (const [planId, plan] of Object.entries(expectedPlans)) {
  test(`signup payment summary shows ${plan.name} price`, async ({ page }) => {
    await page.goto(`/signup?plan=${planId}`);
    await expect(page.locator("h1").first()).toBeVisible();

    const body = await normalizedBodyText(page);
    expect(body).toContain(plan.name);
    expect(body).toContain(`${plan.monthlyPriceIrr} ریال`);
  });
}

test("/api/plans returns updated prices, limits, and SMS feature flags", async () => {
  const context = await apiContext();
  const plans = await readOk<any[]>(await context.get("/api/plans"));

  for (const [planId, expected] of Object.entries(expectedPlans)) {
    const plan = plans.find((item) => item.id === planId);
    expect(plan).toBeTruthy();
    expect(plan.name).toBe(expected.name);
    expect(plan.monthlyPriceIrr).toBe(expected.monthlyPriceIrr);
    expect(plan.annualPriceIrr).toBe(expected.annualPriceIrr);
    expect(plan.limits.users).toBe(expected.users);
    expect(plan.limits.monthlyShipments).toBe(expected.monthlyShipments);
    expect(plan.limits.storageMb).toBe(expected.storageMb);
    expect(plan.features.smsNotifications).toBe(expected.smsNotifications);
  }

  await disposeContexts(context);
});

test("public signup creates a billing payment using the selected updated plan price", async () => {
  const publicContext = await apiContext();
  const admin = await loginApi();
  const ownerEmail = uniqueEmail("pricing-payment");

  const signup = await readOk<any>(
    await publicContext.post("/api/signup", {
      data: {
        companyName: `Pricing Payment ${Date.now()}`,
        ownerName: "Pricing Payment Owner",
        ownerEmail,
        password: USER_PASSWORD,
        planId: "business",
        billingCycle: "monthly",
        contactPhone: "09120000000",
      },
    })
  );

  expect(signup.amountIrr).toBe(expectedPlans.business.monthlyPriceIrr);
  expect(signup.plan.id).toBe("business");
  expect(signup.plan.monthlyPriceIrr).toBe(expectedPlans.business.monthlyPriceIrr);

  const payments = await readOk<any[]>(await admin.get("/api/admin/payments"));
  const payment = payments.find((item) => item.id === signup.paymentId);
  expect(payment).toBeTruthy();
  expect(payment.amountIrr).toBe(expectedPlans.business.monthlyPriceIrr);

  await disposeContexts(publicContext, admin);
});
