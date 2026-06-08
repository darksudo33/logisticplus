// @ts-nocheck
import { expect, test } from "@playwright/test";
import pg from "pg";
import { disposeContexts, loginApi, loginViaUi, readOk } from "./helpers";

const { Client } = pg;

const testDatabaseUrl = process.env.TEST_DATABASE_URL || "postgres://postgres@localhost:5432/logisticplus_test";
const testCustomer = {
  customerCode: "E2E-CUSTOMER-CLEANUP",
  customerName: "مشتری آزمون پاکسازی",
  companyName: "شرکت پاکسازی لجستیک",
  editedCompanyName: "شرکت پاکسازی لجستیک ویرایش شده",
  phoneNumber: "09120001122",
  secondPhoneNumber: "09120001123",
  email: "customer-cleanup@example.test",
  address: "تهران، خیابان ولیعصر، پلاک ۱۰",
  referrer: "معرف آزمونی",
  notes: "شماره تماس و آدرس باید بعد از ثبت قابل مشاهده باشد.",
};

const sortTestCustomers = [
  { customerCode: "E2E-SORT-10", customerName: "Sort customer 10", companyName: "Sort company 10", email: "customer-sort-10@example.test" },
  { customerCode: "E2E-SORT-2", customerName: "Sort customer 2", companyName: "Sort company 2", email: "customer-sort-2@example.test" },
  { customerCode: "E2E-SORT-001", customerName: "Sort customer 1", companyName: "Sort company 1", email: "customer-sort-001@example.test" },
];

async function cleanupTestCustomer({
  email,
  companyName,
  editedCompanyName,
  customerName,
  customerCode,
}: {
  email: string;
  companyName: string;
  editedCompanyName: string;
  customerName: string;
  customerCode: string;
}) {
  const databaseName = new URL(testDatabaseUrl).pathname.replace(/^\//, "");
  if (!databaseName.toLowerCase().includes("test")) {
    throw new Error(`Refusing to clean records in a non-test database: ${databaseName}`);
  }

  const client = new Client({ connectionString: testDatabaseUrl });
  await client.connect();
  try {
    await client.query("BEGIN");
    const target = await client.query(
      "SELECT id FROM customers WHERE lower(email) = lower($1) OR company_name = $2 OR company_name = $3 OR contact_name = $4 OR customer_code = $5",
      [email, companyName, editedCompanyName, customerName, customerCode]
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
           OR data->>'company' = $3
           OR data->>'name' = $4
           OR data->>'customerCode' = $5
         )`,
      [email, companyName, editedCompanyName, customerName, customerCode]
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

    const { customerCode, customerName, companyName, editedCompanyName, phoneNumber, secondPhoneNumber, email, address, referrer, notes } = testCustomer;

    await loginViaUi(page);
    await page.goto("/customers");
    await expect(page.locator("h1").first()).toBeVisible();

    await page.getByRole("button", { name: "مشتری جدید", exact: true }).click();
    await page.locator("#customerCode").fill(customerCode);
    await page.locator("#name").fill(customerName);
    await page.locator("#company").fill(companyName);
    await page.locator("#email").fill(email);
    await page.locator("#customerPhone-0").fill(phoneNumber);
    await page.locator("#customerPhoneLabel-0").fill("مدیرعامل");
    await page.getByRole("button", { name: "شماره جدید" }).click();
    await page.locator("#customerPhone-1").fill(secondPhoneNumber);
    await page.locator("#customerPhoneLabel-1").fill("مالی");
    await page.locator("#referrer").fill(referrer);
    await page.locator("#address").fill(address);
    await page.locator("#notes").fill(notes);
    await page.getByRole("button", { name: "ذخیره مشتری" }).click();

    const customerRow = page.locator("tbody tr", { hasText: customerCode });
    await expect(customerRow).toBeVisible();
    await expect(customerRow).toContainText(customerName);
    await expect(customerRow).toContainText(companyName);
    await expect(customerRow).toContainText(phoneNumber);
    await expect(customerRow).toContainText(secondPhoneNumber);
    await expect(customerRow).toContainText(email);
    await expect(customerRow).toContainText(referrer);

    await customerRow.getByRole("button", { name: `عملیات ${customerName}` }).click();
    await page.getByRole("menuitem", { name: "ویرایش مشتری" }).click();
    await page.locator("#company").fill(editedCompanyName);
    await page.locator("#customerPhoneNote-1").fill("تماس برای پرداخت");
    await page.getByRole("button", { name: "ذخیره تغییرات مشتری" }).click();
    await expect(customerRow).toContainText(editedCompanyName);

    await customerRow.getByRole("button", { name: `عملیات ${customerName}` }).click();
    await page.getByRole("menuitem", { name: "حذف مشتری" }).click();
    await expect(page.getByText(`مورد: ${customerCode} - ${customerName}`)).toBeVisible();
    await page.getByRole("button", { name: "تایید و انتقال به سطل زباله" }).click();

    await expect(page.locator("tbody tr", { hasText: customerCode })).toHaveCount(0);

    await page.goto("/archive");
    await expect(page.getByText(editedCompanyName).first()).toBeVisible();
    expect(consoleErrors).toEqual([]);
  });
});

test.describe.serial("customer code sorting", () => {
  test.beforeEach(async () => {
    for (const customer of sortTestCustomers) {
      await cleanupTestCustomer({
        ...customer,
        editedCompanyName: customer.companyName,
      });
    }
  });

  test.afterEach(async () => {
    for (const customer of sortTestCustomers) {
      await cleanupTestCustomer({
        ...customer,
        editedCompanyName: customer.companyName,
      });
    }
  });

  test("orders customer codes by their numeric value", async () => {
    const owner = await loginApi();
    try {
      for (const customer of sortTestCustomers) {
        await readOk(
          await owner.post("/api/customers", {
            data: {
              customerCode: customer.customerCode,
              name: customer.customerName,
              company: customer.companyName,
              email: customer.email,
              phone: "09125550000",
            },
          })
        );
      }

      const customers = await readOk<any[]>(await owner.get("/api/customers?includeArchived=true"));
      const sortedCodes = customers
        .map((customer) => customer.customerCode)
        .filter((code) => sortTestCustomers.some((customer) => customer.customerCode === code));

      expect(sortedCodes).toEqual(["E2E-SORT-001", "E2E-SORT-2", "E2E-SORT-10"]);
    } finally {
      await disposeContexts(owner);
    }
  });
});
