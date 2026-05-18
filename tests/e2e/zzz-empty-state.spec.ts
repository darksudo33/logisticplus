// @ts-nocheck
import { expect, test } from "@playwright/test";
import pg from "pg";
import { loginViaUi } from "./helpers";

const { Client } = pg;

const testDatabaseUrl = process.env.TEST_DATABASE_URL || "postgres://postgres@localhost:5432/logisticplus_test";
const ownerUserId = process.env.SEED_USER_ID || "u1";
const defaultOrganizationId = process.env.SEED_ORGANIZATION_ID || "org-logisticplus-default";

const protectedRoutes = [
  "/dashboard",
  "/shipments",
  "/customers",
  "/tasks",
  "/documents",
  "/cheques",
  "/quotage",
  "/archive",
  "/compliance",
  "/chat",
  "/management",
  "/changelog",
];

const forbiddenVisibleText = [
  "LP-1403",
  "MSKU1234567",
  "doc1",
  "s1",
  "شرکت آریان",
  "آریان",
  "E2E Tenant",
  "safe-document.pdf",
];

function isIgnorableMessage(message: string) {
  return (
    message.includes("WebSocket connection to") ||
    message.includes("[vite] failed to connect to websocket") ||
    message.includes("WebSocket closed without opened") ||
    message.includes("favicon.ico")
  );
}

async function cleanOperationalData() {
  const databaseName = new URL(testDatabaseUrl).pathname.replace(/^\//, "");
  if (!databaseName.toLowerCase().includes("test")) {
    throw new Error(`Refusing to clean a non-test database: ${databaseName}`);
  }

  const client = new Client({ connectionString: testDatabaseUrl });
  await client.connect();
  try {
    await client.query("BEGIN");
    for (const [sql, params] of [
      ["DELETE FROM app_sessions"],
      ["DELETE FROM chat_messages"],
      ["DELETE FROM chat_thread_members"],
      ["DELETE FROM chat_threads"],
      ["DELETE FROM document_versions"],
      ["DELETE FROM meeting_required_documents"],
      ["DELETE FROM shipment_status_events"],
      ["DELETE FROM documents"],
      ["DELETE FROM archive_records"],
      ["DELETE FROM tasks"],
      ["DELETE FROM cheques"],
      ["DELETE FROM compliance_meetings"],
      ["DELETE FROM quotations"],
      ["DELETE FROM shipments"],
      ["DELETE FROM customers"],
      ["DELETE FROM notifications"],
      ["DELETE FROM change_logs"],
      ["DELETE FROM app_error_logs"],
      ["DELETE FROM contact_requests"],
      ["DELETE FROM sms_deliveries"],
      ["DELETE FROM billing_invoice_items"],
      ["DELETE FROM billing_receipts"],
      ["DELETE FROM billing_invoices"],
      ["DELETE FROM billing_payments"],
      ["DELETE FROM signup_requests"],
      ["DELETE FROM subscription_events"],
      ["DELETE FROM user_records"],
      ["DELETE FROM organization_members WHERE user_id <> $1 OR organization_id <> $2", [ownerUserId, defaultOrganizationId]],
      ["DELETE FROM app_users WHERE id <> $1", [ownerUserId]],
      ["DELETE FROM organization_subscriptions WHERE organization_id <> $1", [defaultOrganizationId]],
      ["DELETE FROM organizations WHERE id <> $1", [defaultOrganizationId]],
      ["UPDATE app_users SET organization_id = $2, status = 'active', is_online = FALSE WHERE id = $1", [ownerUserId, defaultOrganizationId]],
      [
        `INSERT INTO organization_members (organization_id, user_id, role, status)
         VALUES ($2, $1, 'owner', 'active')
         ON CONFLICT (organization_id, user_id) DO UPDATE SET role = 'owner', status = 'active'`,
        [ownerUserId, defaultOrganizationId],
      ],
    ] as [string, any[]?][]) {
      await client.query(sql, params);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

async function expectNoHorizontalOverflow(page) {
  const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  expect(hasOverflow).toBe(false);
}

test.describe.serial("guided empty-state UX on a clean database", () => {
  test.beforeAll(async () => {
    await cleanOperationalData();
  });

  test("protected routes render useful empty states without mock records", async ({ page }) => {
    test.setTimeout(120_000);
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error" && !isIgnorableMessage(message.text())) consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => {
      if (!isIgnorableMessage(error.message)) consoleErrors.push(error.message);
    });

    await loginViaUi(page);

    for (const viewport of [
      { width: 1280, height: 720 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);

      for (const route of protectedRoutes) {
        await page.goto(route);
        await expect(page.locator("h1").first()).toBeVisible();
        await expect(page.locator("[data-empty-state]").filter({ visible: true }).first()).toBeVisible();
        await expect(page.locator("body")).not.toContainText(/demo/i);
        for (const forbidden of forbiddenVisibleText) {
          await expect(page.locator("body")).not.toContainText(forbidden);
        }
        await expectNoHorizontalOverflow(page);
      }

      await page.goto("/admin");
      await expect(page.locator("h1").first()).toBeVisible();
      await expectNoHorizontalOverflow(page);
      for (const tabName of [/ثبت/, /پرداخت/, /خطا/]) {
        await page.locator("button", { hasText: tabName }).first().click();
        await expect(page.locator("[data-empty-state]").filter({ visible: true }).first()).toBeVisible();
        for (const forbidden of forbiddenVisibleText) {
          await expect(page.locator("body")).not.toContainText(forbidden);
        }
        await expectNoHorizontalOverflow(page);
      }
    }

    expect(consoleErrors).toEqual([]);
  });
});
