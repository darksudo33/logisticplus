import { expect, test } from "@playwright/test";
import { USER_PASSWORD, apiContext, disposeContexts, expectUnavailable, loginApi, readOk, uniqueEmail } from "./helpers";
import { pricingPlans } from "../../src/lib/pricing";

const expectedPlans = Object.fromEntries(pricingPlans.map((plan) => [plan.id, plan])) as Record<string, (typeof pricingPlans)[number]>;

test("retired pricing and public signup pages render login instead of self-serve checkout", async ({ page }) => {
  for (const route of ["/pricing", "/signup", "/signup?plan=business", "/signup/pending"]) {
    await page.goto(route);
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('a[href*="/signup?plan="]')).toHaveCount(0);

    const body = await page.locator("body").innerText();
    for (const plan of pricingPlans) {
      expect(body).not.toContain(plan.name);
    }
  }
});

test("/api/plans returns current plan prices, limits, and feature flags for admin signup", async () => {
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

test("public signup and public payment handoff APIs stay unavailable", async () => {
  const context = await apiContext();

  await expectUnavailable(await context.post("/api/signup", {
    data: {
      companyName: `Disabled Signup ${Date.now()}`,
      ownerName: "Disabled Signup Owner",
      ownerEmail: uniqueEmail("disabled-public-signup"),
      password: USER_PASSWORD,
      planId: "business",
      billingCycle: "monthly",
      contactPhone: "09120000000",
    },
  }));
  await expectUnavailable(await context.post("/api/billing/payments/disabled-payment/start"));
  await expectUnavailable(await context.get("/api/billing/zarinpal/callback?Authority=disabled-public-release&Status=OK"));

  await disposeContexts(context);
});

test("platform admin can create the only allowed company signup with the selected plan", async () => {
  const admin = await loginApi();
  const ownerEmail = uniqueEmail("admin-manual-signup");

  const created = await readOk<any>(
    await admin.post("/api/admin/organizations/manual-signup", {
      data: {
        companyName: `Admin Manual Signup ${Date.now()}`,
        ownerName: "Admin Manual Signup Owner",
        ownerEmail,
        password: USER_PASSWORD,
        planId: "business",
        billingCycle: "monthly",
        contactPhone: "09120000000",
      },
    })
  );

  expect(created.organizationId).toBeTruthy();
  expect(created.plan.id).toBe("business");
  expect(created.plan.monthlyPriceIrr).toBe(expectedPlans.business.monthlyPriceIrr);
  expect(created.organization.status).toBe("active");
  expect(created.organization.planId).toBe("business");
  expect(created.organization.contactEmail).toBe(ownerEmail);
  expect(created.organization.subscription.planId).toBe("business");
  expect(created.organization.subscription.status).toBe("active");
  expect(created.organization.subscription.billingCycle).toBe("monthly");

  await disposeContexts(admin);
});
