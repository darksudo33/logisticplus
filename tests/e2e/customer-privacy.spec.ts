// @ts-nocheck
import { expect, test } from "@playwright/test";
import pg from "pg";
import {
  USER_PASSWORD,
  disposeContexts,
  expectForbidden,
  loginApi,
  readOk,
  uniqueEmail,
} from "./helpers";

const { Client } = pg;
const testDatabaseUrl = process.env.TEST_DATABASE_URL || "postgres://postgres@localhost:5432/logisticplus_test";

async function dbQuery(sql: string, params: any[] = []) {
  const client = new Client({ connectionString: testDatabaseUrl });
  await client.connect();
  try {
    return await client.query(sql, params);
  } finally {
    await client.end();
  }
}

async function cleanupPrivacyRows(marker: string) {
  if (!testDatabaseUrl.toLowerCase().includes("test")) {
    throw new Error(`Refusing to clean records in a non-test database: ${testDatabaseUrl}`);
  }

  const customers = await dbQuery(
    "SELECT id FROM customers WHERE company_name LIKE $1 OR contact_name LIKE $1 OR email LIKE $1",
    [`%${marker}%`]
  );
  const customerIds = customers.rows.map((row) => row.id);
  if (customerIds.length) {
    await dbQuery("DELETE FROM archive_records WHERE entity_type = 'customer' AND entity_id = ANY($1::text[])", [customerIds]);
    await dbQuery("DELETE FROM quotations WHERE customer_id = ANY($1::text[]) OR customer_name LIKE $2", [customerIds, `%${marker}%`]);
    await dbQuery("DELETE FROM customers WHERE id = ANY($1::text[])", [customerIds]);
  }
  await dbQuery("DELETE FROM quotations WHERE customer_name LIKE $1", [`%${marker}%`]);

  const users = await dbQuery("SELECT id FROM app_users WHERE email LIKE $1", [`%${marker}%`]);
  const userIds = users.rows.map((row) => row.id);
  if (userIds.length) {
    await dbQuery("DELETE FROM app_sessions WHERE user_id = ANY($1::text[])", [userIds]);
    await dbQuery("DELETE FROM user_permissions WHERE user_id = ANY($1::text[])", [userIds]);
    await dbQuery(
      "DELETE FROM user_records WHERE owner_user_id = ANY($1::text[]) OR (collection = 'users' AND item_id = ANY($1::text[]))",
      [userIds]
    );
    await dbQuery(
      "UPDATE app_users SET status = 'suspended', email = CONCAT('archived-', id, '-', email) WHERE id = ANY($1::text[])",
      [userIds]
    );
  }
}

async function readSearch(context, params) {
  const response = await context.get(`/api/search?${new URLSearchParams(params).toString()}`);
  expect(response.status(), await response.text()).toBeLessThan(400);
  return response.json();
}

test.describe.serial("customer private detail visibility", () => {
  const marker = `e2e-customer-privacy-${Date.now()}`;

  test.beforeEach(async () => {
    await cleanupPrivacyRows(marker);
  });

  test.afterEach(async () => {
    await cleanupPrivacyRows(marker);
  });

  test("limits private customer fields and customer phone details to CEO users", async () => {
    const owner = await loginApi();
    const contexts = [owner];
    try {
      const employeeEmail = uniqueEmail(marker);
      const employeeUser = await readOk<any>(
        await owner.post("/api/users", {
          data: {
            name: "E2E Customer Privacy Operations",
            email: employeeEmail,
            password: USER_PASSWORD,
            role: "OPERATIONS",
          },
        })
      );
      const employee = await loginApi(employeeEmail, USER_PASSWORD);
      contexts.push(employee);

      const privatePhone = "09125550177";
      const privateEmail = `${marker}-customer@example.test`;
      const privateAddress = `${marker} private address`;
      const privateReferrer = `${marker} private referrer`;
      const privateNotes = `${marker} private notes`;
      const customer = await readOk<any>(
        await owner.post("/api/customers", {
          data: {
            name: `${marker} Customer`,
            company: `${marker} Company`,
            email: privateEmail,
            phone: privatePhone,
            address: privateAddress,
            referrer: privateReferrer,
            notes: privateNotes,
          },
        })
      );
      expect(customer.referrer).toBe(privateReferrer);
      expect(customer.canViewPrivateDetails).toBe(true);

      const employeeCustomers = await readOk<any[]>(
        await employee.get(`/api/customers?includeArchived=true&search=${encodeURIComponent(`${marker} Company`)}`)
      );
      const employeeCustomer = employeeCustomers.find((item) => item.id === customer.id);
      expect(employeeCustomer).toMatchObject({
        id: customer.id,
        name: `${marker} Customer`,
        company: `${marker} Company`,
        phone: "",
        email: "",
        address: "",
        referrer: "",
        notes: "",
        canViewPrivateDetails: false,
      });

      const employeeDetail = await readOk<any>(await employee.get(`/api/customers/${customer.id}`));
      expect(employeeDetail).toMatchObject({
        phone: "",
        email: "",
        address: "",
        referrer: "",
        notes: "",
        canViewPrivateDetails: false,
      });

      const privateFieldCustomerSearch = await readOk<any[]>(
        await employee.get(`/api/customers?search=${encodeURIComponent(privatePhone)}`)
      );
      expect(privateFieldCustomerSearch.some((item) => item.id === customer.id)).toBe(false);

      const globalSearch = await readSearch(employee, { q: privatePhone, type: "customers" });
      expect(globalSearch.results.some((result) => result.id === customer.id)).toBe(false);
      expect(JSON.stringify(globalSearch.results)).not.toContain(privatePhone);

      const bootstrap = await employee.get(`/api/users/${employeeUser.id}/bootstrap`);
      expect(bootstrap.status(), await bootstrap.text()).toBeLessThan(400);
      const bootstrapPayload = await bootstrap.json();
      const bootstrapCustomer = (bootstrapPayload.records?.customers || []).find((item: any) => item.id === customer.id);
      expect(bootstrapCustomer).toMatchObject({
        phone: "",
        email: "",
        address: "",
        referrer: "",
        notes: "",
        canViewPrivateDetails: false,
      });
      expect(JSON.stringify(bootstrapPayload.records?.customers || [])).not.toContain(privatePhone);
      expect(JSON.stringify(bootstrapPayload.records?.customers || [])).not.toContain(privateAddress);
      expect(JSON.stringify(bootstrapPayload.records?.customers || [])).not.toContain(privateReferrer);

      const saveResponse = await employee.put(`/api/users/${employeeUser.id}/records`, {
        data: { records: bootstrapPayload.records || {} },
      });
      expect(saveResponse.status(), await saveResponse.text()).toBeLessThan(400);

      const ownerDetailAfterSave = await readOk<any>(await owner.get(`/api/customers/${customer.id}`));
      expect(ownerDetailAfterSave).toMatchObject({
        phone: privatePhone,
        email: privateEmail,
        address: privateAddress,
        referrer: privateReferrer,
        notes: privateNotes,
        canViewPrivateDetails: true,
      });

      await expectForbidden(
        await employee.post("/api/customers", {
          data: { name: `${marker} Unauthorized`, company: `${marker} Unauthorized Co` },
        })
      );
      await expectForbidden(await employee.patch(`/api/customers/${customer.id}`, { data: { phone: "09129999999" } }));
      await expectForbidden(await employee.post(`/api/customers/${customer.id}/archive`));

      const quotePhone = "09124440333";
      const quotation = await readOk<any>(
        await owner.post("/api/quotations", {
          data: {
            customerId: customer.id,
            customerName: `${marker} Quote Customer`,
            customerPhone: quotePhone,
            originCity: "Tehran",
            destinationCity: "Bandar Abbas",
            cargoType: "GENERAL",
            weight: 1200,
            totalPrice: 1000000,
          },
        })
      );
      expect(quotation.customerPhone).toBe(quotePhone);

      const employeeQuotes = await readOk<any[]>(await employee.get("/api/quotations?includeArchived=true"));
      expect(employeeQuotes.find((item) => item.id === quotation.id)?.customerPhone).toBe("");
      const employeeQuotationDetail = await readOk<any>(await employee.get(`/api/quotations/${quotation.id}`));
      expect(employeeQuotationDetail.customerPhone).toBe("");

      const employeeQuotePatch = await readOk<any>(
        await employee.patch(`/api/quotations/${quotation.id}`, {
          data: { customerPhone: "09127770000", notes: `${marker} employee quote note` },
        })
      );
      expect(employeeQuotePatch.customerPhone).toBe("");

      const ownerQuotationAfterPatch = await readOk<any>(await owner.get(`/api/quotations/${quotation.id}`));
      expect(ownerQuotationAfterPatch.customerPhone).toBe(quotePhone);
      expect(ownerQuotationAfterPatch.notes).toBe(`${marker} employee quote note`);
    } finally {
      await disposeContexts(...contexts);
    }
  });
});
