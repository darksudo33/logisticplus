import { expect, test } from "@playwright/test";
import { USER_PASSWORD, apiContext, disposeContexts, expectUnavailable, loginApi, readOk, uniqueEmail } from "./helpers";
import { subscriptionPlans } from "../../src/lib/subscriptionPlans";

const expectedPlans = Object.fromEntries(subscriptionPlans.map((plan) => [plan.id, plan])) as Record<string, (typeof subscriptionPlans)[number]>;

test("retired public signup pages render login instead of self-serve checkout", async ({ page }) => {
  for (const route of ["/signup", "/signup?plan=business", "/signup/pending"]) {
    await page.goto(route);
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('a[href*="/signup?plan="]')).toHaveCount(0);

    const body = await page.locator("body").innerText();
    for (const plan of subscriptionPlans) {
      expect(body).not.toContain(plan.name);
    }
  }
});

test("/api/plans returns current subscription plans for admin signup", async () => {
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
  }

  await disposeContexts(context);
});

test("public signup API stays unavailable", async () => {
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
