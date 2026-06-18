import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import {
  BASE_URL,
  apiContext,
  disposeContexts,
  expectForbidden,
  expectPublicTrackingPayloadIsSafe,
  loginApi,
  loginViaUi,
  readOk,
} from "./helpers";

const DEMO_MANAGER_EMAIL = "manager.parsrah@logisticplus.ir";
const DEMO_PASSWORD = process.env.DEMO_SEED_PASSWORD || "ParsRah!1405";
const DEMO_TRACKING_TOKEN = "parsrah-pr1405001-customer-access-2026";
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || "postgres://postgres@localhost:5432/logisticplus_test";
const TEST_DOCUMENT_STORAGE_DIR = process.env.TEST_DOCUMENT_STORAGE_DIR || "storage/test-documents";

test.describe.serial("Parsrah showcase company", () => {
  test.beforeAll(() => {
    execFileSync(process.execPath, ["--import", "tsx", "scripts/seed-demo-company.ts"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        APP_PUBLIC_URL: BASE_URL,
        DATABASE_URL: TEST_DATABASE_URL,
        DOCUMENT_STORAGE_DIR: TEST_DOCUMENT_STORAGE_DIR,
        DEMO_SEED_PASSWORD: DEMO_PASSWORD,
        NODE_ENV: "development",
      },
      stdio: "inherit",
    });
  });

  test("seeds a normal tenant with operational data and no platform admin access", async () => {
    const manager = await loginApi(DEMO_MANAGER_EMAIL, DEMO_PASSWORD);

    const auth = await readOk<any>(await manager.get("/api/auth/me"));
    expect(auth.user.email).toBe(DEMO_MANAGER_EMAIL);
    expect(auth.user.organizationId).toBe("org-parsrah-international");
    expect(auth.user.organizationName).toBe("حمل‌ونقل بین‌المللی پارس‌راه");
    expect(auth.user.role).toBe("MANAGER");
    expect(auth.permissions).toContain("shipments.view_all");
    expect(auth.permissions).toContain("customer_access.manage");
    expect(auth.permissions).not.toContain("platform.admin");

    await expectForbidden(await manager.get("/api/admin/overview"));

    const customers = await readOk<any[]>(await manager.get("/api/customers"));
    expect(customers).toHaveLength(5);
    expect(customers.map((customer) => customer.company)).toContain("شرکت تجهیزات پزشکی نیکان‌طب");

    const shipments = await readOk<any[]>(await manager.get("/api/shipments"));
    expect(shipments).toHaveLength(10);
    expect(shipments.filter((shipment) => shipment.status === "EXITED")).toHaveLength(2);
    expect(shipments.filter((shipment) => ["ARRIVED", "KOOTAJ_DONE"].includes(shipment.status)).length).toBeGreaterThanOrEqual(4);

    const documents = await readOk<any[]>(await manager.get("/api/documents"));
    expect(documents).toHaveLength(8);
    expect(documents.some((document) => document.visibility === "customer_visible")).toBe(true);
    expect(documents.some((document) => document.name.includes("قرارداد حمل صادراتی"))).toBe(true);

    const quotations = await readOk<any[]>(await manager.get("/api/quotations"));
    expect(quotations).toHaveLength(3);
    expect(quotations.map((quote) => quote.status).sort()).toEqual(["ACCEPTED", "PENDING", "PENDING"]);

    const cheques = await readOk<any[]>(await manager.get("/api/cheques"));
    expect(cheques).toHaveLength(4);
    expect(cheques.filter((cheque) => cheque.status === "ACTIVE")).toHaveLength(3);
    expect(cheques.filter((cheque) => cheque.status === "CLEARED")).toHaveLength(1);

    const meetings = await readOk<any[]>(await manager.get("/api/compliance-meetings"));
    expect(meetings).toHaveLength(3);
    expect(meetings.map((meeting) => meeting.purpose)).toContain("جلسه بررسی ریسک تأخیر محموله");

    const tasks = await readOk<any[]>(await manager.get("/api/tasks"));
    expect(tasks.length).toBeGreaterThanOrEqual(7);
    expect(tasks.some((task) => task.priority === "URGENT")).toBe(true);

    const archive = await readOk<any[]>(await manager.get("/api/archive"));
    expect(archive.length).toBeGreaterThanOrEqual(1);

    await disposeContexts(manager);
  });

  test("keeps public tracking customer-safe and scoped to visible documents", async () => {
    const publicContext = await apiContext();

    const data = await readOk<any>(
      await publicContext.get(`/api/public/track/${encodeURIComponent(DEMO_TRACKING_TOKEN)}`)
    );

    expect(data.shipment.code).toBe("PRR-1405-001");
    expect(data.company.name).toBe("حمل‌ونقل بین‌المللی پارس‌راه");
    expect(data.company.contactText).toContain("021-91094720");
    expect(data.steps).toHaveLength(7);
    expect(data.documents.every((document: any) => document.downloadUrl.includes("/api/public/documents/"))).toBe(true);
    expect(data.documents.every((document: any) => !document.downloadUrl.includes(DEMO_TRACKING_TOKEN))).toBe(true);
    expect(data.documents.some((document: any) => document.title.includes("بارنامه زمینی"))).toBe(true);
    expect(data.documents.some((document: any) => document.title.includes("قرارداد"))).toBe(false);
    expectPublicTrackingPayloadIsSafe(data);

    await disposeContexts(publicContext);
  });

  test("redirects the showcase manager away from the platform admin screen", async ({ page }) => {
    await loginViaUi(page, DEMO_MANAGER_EMAIL, DEMO_PASSWORD);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/platform-admin$/);
    await expect(page.getByTestId("admin-forbidden")).toBeVisible();
  });

  test("keeps seeded quotation API data while the quotation UI route is disabled", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await loginViaUi(page, DEMO_MANAGER_EMAIL, DEMO_PASSWORD);
    await page.goto("/quotations");

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByTestId("open-quotation-dialog")).toHaveCount(0);
    await expect(page.locator('a[href="/quotations"]')).toHaveCount(0);
    expect(pageErrors.filter((message) => message.includes("Invalid time value"))).toEqual([]);
  });
});
