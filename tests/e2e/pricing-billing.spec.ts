import { expect, test } from "@playwright/test";
import { USER_PASSWORD, apiContext, disposeContexts, loginApi, readOk, uniqueEmail } from "./helpers";
import { extraUsagePricing, formatIrr, pricingPlans } from "../../src/lib/pricing";

const expectedPlans = Object.fromEntries(pricingPlans.map((plan) => [plan.id, plan])) as Record<string, (typeof pricingPlans)[number]>;

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
  for (const plan of pricingPlans) {
    expect(body).toContain(plan.name);
    expect(body).toContain(normalizeDigits(formatIrr(plan.monthlyPriceIrr)));
    for (const feature of plan.summaryFeatures) {
      expect(body).toContain(normalizeDigits(feature));
    }
  }
  for (const usagePrice of extraUsagePricing) {
    expect(body).toContain(normalizeDigits(usagePrice));
  }
});

for (const [planId, plan] of Object.entries(expectedPlans)) {
  test(`signup payment summary shows ${plan.name} price`, async ({ page }) => {
    await page.goto(`/signup?plan=${planId}`);
    await expect(page.locator("h1").first()).toBeVisible();

    const body = await normalizedBodyText(page);
    expect(body).toContain(plan.name);
    expect(body).toContain(normalizeDigits(formatIrr(plan.monthlyPriceIrr)));
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
    expect(plan.limits.users).toBe(expected.limits.users);
    expect(plan.limits.monthlyShipments).toBe(expected.limits.monthlyShipments);
    expect(plan.limits.storageMb).toBe(expected.limits.storageMb);
    expect(plan.features.smsNotifications).toBe(expected.backendFeatures.smsNotifications);
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
