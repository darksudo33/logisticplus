// @ts-nocheck
import { expect, test } from "@playwright/test";
import pg from "pg";
import { loginViaUi } from "./helpers";

const { Client } = pg;

const testDatabaseUrl = process.env.TEST_DATABASE_URL || "postgres://postgres@localhost:5432/logisticplus_test";
const testCustomer = {
  customerName: "مشتری آزمون پاکسازی",
  companyName: "شرکت پاکسازی لجستیک",
  phoneNumber: "09120001122",
  email: "customer-cleanup@example.test",
  address: "تهران، خیابان ولیعصر، پلاک ۱۰",
  notes: "شماره تماس و آدرس باید بعد از ثبت قابل مشاهده باشد.",
};

async function cleanupTestCustomer({ email, companyName, customerName }: { email: string; companyName: string; customerName: string }) {
  const databaseName = new URL(testDatabaseUrl).pathname.replace(/^\//, "");
  if (!databaseName.toLowerCase().includes("test")) {
    throw new Error(`Refusing to clean records in a non-test database: ${databaseName}`);
  }

  const client = new Client({ connectionString: testDatabaseUrl });
  await client.connect();
  try {
    await client.query("BEGIN");
    const target = await client.query(
      "SELECT id FROM customers WHERE lower(email) = lower($1) OR company_name = $2 OR contact_name = $3",
      [email, companyName, customerName]
    );
    const targetIds = target.rows.map((row) => row.id);
    if (targetIds.length) {
      await client.query("DELETE FROM archive_records WHERE entity_type = 'customer' AND entity_id = ANY($1::text[])", [targetIds]);
      await client.query("DELETE FROM customers WHERE id = ANY($1::text[])", [targetIds]);
    }
    await client.query(
      `DELETE FROM user_records
       WHERE collection = 'customers'
         AND (
           data->>'email' = $1
           OR data->>'company' = $2
           OR data->>'name' = $3
         )`,
      [email, companyName, customerName]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

function isIgnorableMessage(message: string) {
  return (
    message.includes("WebSocket connection to") ||
    message.includes("[vite] failed to connect to websocket") ||
    message.includes("WebSocket closed without opened") ||
    message.includes("favicon.ico")
  );
}

test.describe.serial("customer create and archive flow", () => {
  test.beforeEach(async () => {
    await cleanupTestCustomer(testCustomer);
  });

  test.afterEach(async () => {
    await cleanupTestCustomer(testCustomer);
  });

  test("captures contact fields and removes archived customers from the active list", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error" && !isIgnorableMessage(message.text())) consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => {
      if (!isIgnorableMessage(error.message)) consoleErrors.push(error.message);
    });

    const { customerName, companyName, phoneNumber, email, address, notes } = testCustomer;

    await loginViaUi(page);
    await page.goto("/customers");
    await expect(page.locator("h1").first()).toBeVisible();

    await page.getByRole("button", { name: "مشتری جدید", exact: true }).click();
    await page.getByLabel("نام و نام خانوادگی").fill(customerName);
    await page.getByLabel("نام شرکت").fill(companyName);
    await page.getByLabel("ایمیل").fill(email);
    await page.getByLabel("شماره تماس").fill(phoneNumber);
    await page.getByLabel("آدرس").fill(address);
    await page.getByLabel("یادداشت داخلی").fill(notes);
    await page.getByRole("button", { name: "ذخیره مشتری" }).click();

    const customerRow = page.locator("tbody tr", { hasText: customerName });
    await expect(customerRow).toBeVisible();
    await expect(customerRow).toContainText(companyName);
    await expect(customerRow).toContainText(phoneNumber);
    await expect(customerRow).toContainText(email);

    await customerRow.getByRole("button", { name: `عملیات ${customerName}` }).click();
    await page.getByRole("menuitem", { name: "حذف مشتری" }).click();
    await expect(page.getByText(`مورد: ${customerName}`)).toBeVisible();
    await page.getByRole("button", { name: "تایید و انتقال به سطل زباله" }).click();

    await expect(page.locator("tbody tr", { hasText: customerName })).toHaveCount(0);

    await page.goto("/archive");
    await expect(page.getByText(companyName).first()).toBeVisible();
    expect(consoleErrors).toEqual([]);
  });
});
