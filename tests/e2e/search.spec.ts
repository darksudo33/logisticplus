// @ts-nocheck
import { test, expect } from "@playwright/test";
import pg from "pg";
import { apiContext, disposeContexts, loginApi, loginViaUi } from "./helpers";

const { Client } = pg;

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL || "postgres://postgres@localhost:5432/logisticplus_test";

const IDS = {
  customer: "qa-search-customer",
  persianCustomer: "qa-search-persian-customer",
  shipment: "qa-search-shipment",
  document: "qa-search-document",
  documentVersion: "qa-search-document-version",
  task: "qa-search-task",
  archive: "qa-search-archive",
  user: "qa-search-user",
  statusEvent: "qa-search-status-event",
  otherOrg: "qa-search-other-org",
  otherCustomer: "qa-search-other-customer",
  otherShipment: "qa-search-other-shipment",
};
const SEARCH_CUSTOMER_CODE = "QA-SEARCH-CUS-001";
const SEARCH_PERSIAN_CUSTOMER_CODE = "QA-SEARCH-CUS-FA";

async function readSearch(context, params) {
  const response = await context.get(`/api/search?${new URLSearchParams(params).toString()}`);
  expect(response.status(), await response.text()).toBeLessThan(400);
  return response.json();
}

async function cleanupSearchRows(client) {
  await client.query("DELETE FROM document_versions WHERE id = $1", [IDS.documentVersion]);
  await client.query("DELETE FROM documents WHERE id = $1", [IDS.document]);
  await client.query("DELETE FROM shipment_status_events WHERE id = $1", [IDS.statusEvent]);
  await client.query("DELETE FROM archive_records WHERE id = $1", [IDS.archive]);
  await client.query("DELETE FROM tasks WHERE id = $1", [IDS.task]);
  await client.query("DELETE FROM shipments WHERE id = ANY($1::text[])", [[IDS.shipment, IDS.otherShipment]]);
  await client.query("DELETE FROM customers WHERE id = ANY($1::text[])", [[IDS.customer, IDS.persianCustomer, IDS.otherCustomer]]);
  await client.query("DELETE FROM app_users WHERE id = $1", [IDS.user]);
  await client.query("DELETE FROM organizations WHERE id = $1", [IDS.otherOrg]);
}

async function seedSearchRows(client) {
  const owner = await client.query(
    "SELECT id, organization_id FROM app_users WHERE lower(email) = lower($1) LIMIT 1",
    ["darksudo22@gmail.com"]
  );
  const ownerUser = owner.rows[0];
  expect(ownerUser?.id).toBeTruthy();
  expect(ownerUser?.organization_id).toBeTruthy();

  await cleanupSearchRows(client);

  await client.query(
    `INSERT INTO app_users (id, organization_id, name, email, password_hash, role, status, phone, department)
     VALUES ($1, $2, $3, $4, 'not-used', 'OPERATIONS', 'active', $5, $6)`,
    [IDS.user, ownerUser.organization_id, "QA Search User", "qa-search-user@example.test", "09125550123", "QA Search Department"]
  );

  await client.query(
    `INSERT INTO customers (id, organization_id, owner_user_id, customer_code, company_name, contact_name, email, phone, address, notes, legacy_data)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)`,
    [
      IDS.customer,
      ownerUser.organization_id,
      ownerUser.id,
      SEARCH_CUSTOMER_CODE,
      "QA Search Customer",
      "QA Search Contact",
      "qa-search-customer@example.test",
      "09123456789",
      "QA Search Address",
      "QA Search customer note",
      JSON.stringify({ nationalId: "QA-SEARCH-NATIONAL-001" }),
    ]
  );

  await client.query(
    `INSERT INTO customers (id, organization_id, owner_user_id, customer_code, company_name, contact_name, email, phone, address)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      IDS.persianCustomer,
      ownerUser.organization_id,
      ownerUser.id,
      SEARCH_PERSIAN_CUSTOMER_CODE,
      "مشتری جستجو تست",
      "مسئول جستجو",
      "qa-search-persian@example.test",
      "۰۹۱۲۳۴۵۶۷۸۹",
      "تهران",
    ]
  );

  await client.query(
    `INSERT INTO shipments (
       id, organization_id, owner_user_id, shipment_code, customer_id, customer_name, status,
       priority, origin, destination, customer_access_enabled, legacy_data
     )
     VALUES ($1, $2, $3, 'QA-SEARCH-SHIPMENT-001', $4, 'QA Search Customer', 'IN_TRANSIT',
       'normal', 'Tehran', 'Dubai', TRUE, $5::jsonb)`,
    [
      IDS.shipment,
      ownerUser.organization_id,
      ownerUser.id,
      IDS.customer,
      JSON.stringify({
        trackingNumber: "QA-TRACK-SEARCH-001",
        referenceNumber: "REF-SEARCH-001",
        containerNumber: "CNT-SEARCH-001",
        publicStatusLabel: "QA Search Public Status",
        publicStatusDescription: "QA Search Public Tracking Description",
        notes: "QA Search shipment note",
      }),
    ]
  );

  await client.query(
    `INSERT INTO shipment_status_events (id, organization_id, shipment_id, public_label, public_description, is_customer_visible, created_by_id)
     VALUES ($1, $2, $3, $4, $5, TRUE, $6)`,
    [
      IDS.statusEvent,
      ownerUser.organization_id,
      IDS.shipment,
      "QA Search Public Event",
      "Customer-safe search event",
      ownerUser.id,
    ]
  );

  await client.query(
    `INSERT INTO documents (
       id, organization_id, owner_user_id, title, file_name, mime_type, file_size,
       version, uploaded_by_id, uploaded_by_name, shipment_id, customer_id, visibility, legacy_data
     )
     VALUES ($1, $2, $3, 'QA Search Document', 'QA-search-document.pdf', 'application/pdf', '12 KB',
       2, $3, 'QA Owner', $4, $5, 'internal', $6::jsonb)`,
    [
      IDS.document,
      ownerUser.organization_id,
      ownerUser.id,
      IDS.shipment,
      IDS.customer,
      JSON.stringify({ type: "OTHER" }),
    ]
  );

  await client.query(
    `INSERT INTO document_versions (id, document_id, version, file_name, uploaded_by_id)
     VALUES ($1, $2, 2, 'QA-search-document-v2.pdf', $3)`,
    [IDS.documentVersion, IDS.document, ownerUser.id]
  );

  await client.query(
    `INSERT INTO tasks (
       id, organization_id, owner_user_id, title, description, status, priority,
       assigned_to_id, assigned_to_name, assigned_by_id, assigned_by_name, due_at, shipment_id, customer_id
     )
     VALUES ($1, $2, $3, 'QA Search Follow-up Task', 'QA Search task description',
       'TODO', 'MEDIUM', $4, 'QA Search User', $3, 'QA Owner', '2026/06/01', $5, $6)`,
    [IDS.task, ownerUser.organization_id, ownerUser.id, IDS.user, IDS.shipment, IDS.customer]
  );

  await client.query(
    `INSERT INTO archive_records (
       id, organization_id, owner_user_id, entity_type, entity_id, title, summary, customer_name, shipment_id, archived_by_id
     )
     VALUES ($1, $2, $3, 'shipment', 'qa-search-archived-shipment', 'QA Search Archived Shipment',
       'QA Search archive reason', 'QA Search Customer', $4, $3)`,
    [IDS.archive, ownerUser.organization_id, ownerUser.id, IDS.shipment]
  );

  await client.query(
    `INSERT INTO organizations (id, name, slug, status, plan_id)
     VALUES ($1, 'QA Search Other Tenant', 'qa-search-other-tenant', 'active', 'starter')`,
    [IDS.otherOrg]
  );
  await client.query(
    `INSERT INTO customers (id, organization_id, customer_code, company_name, contact_name, email, phone)
     VALUES ($1, $2, 'QA-OTHER-TENANT-CUS', 'QA-OTHER-TENANT-SECRET Customer', 'Hidden Tenant', 'hidden@example.test', '09120000000')`,
    [IDS.otherCustomer, IDS.otherOrg]
  );
  await client.query(
    `INSERT INTO shipments (id, organization_id, shipment_code, customer_id, customer_name, status, priority)
     VALUES ($1, $2, 'QA-OTHER-TENANT-SECRET', $3, 'Hidden Tenant', 'LOADING', 'normal')`,
    [IDS.otherShipment, IDS.otherOrg, IDS.otherCustomer]
  );

  return ownerUser;
}

test.describe.serial("production-ready global search", () => {
  let client;

  test.beforeAll(async () => {
    if (!TEST_DATABASE_URL.toLowerCase().includes("test")) {
      throw new Error(`Refusing to seed search tests outside a test database: ${TEST_DATABASE_URL}`);
    }
    client = new Client({ connectionString: TEST_DATABASE_URL });
    await client.connect();
    await seedSearchRows(client);
  });

  test.afterAll(async () => {
    if (client) {
      await cleanupSearchRows(client);
      await client.end();
    }
  });

  test("requires authentication and handles empty or very short queries safely", async () => {
    const anonymous = await apiContext();
    const unauthenticated = await anonymous.get("/api/search?q=QA");
    expect(unauthenticated.status()).toBe(401);
    await anonymous.dispose();

    const owner = await loginApi();
    expect((await owner.get("/api/search?q=")).status()).toBe(400);
    expect((await owner.get("/api/search?q=Q")).status()).toBe(400);
    await disposeContexts(owner);
  });

  test("searches operational records by entity with normalization and safe result shape", async () => {
    const owner = await loginApi();

    const shipmentByCode = await readSearch(owner, { q: "qa-search-shipment-001", type: "shipments" });
    expect(shipmentByCode.results.some((result) => result.id === IDS.shipment && result.type === "shipment")).toBe(true);

    const shipmentByTracking = await readSearch(owner, { q: "QA-TRACK-SEARCH-001", type: "shipments" });
    expect(shipmentByTracking.results[0].matchedFields).toContain("trackingNumber");

    const customerByName = await readSearch(owner, { q: "qa search customer", type: "customers" });
    const customerNameMatch = customerByName.results.find((result) => result.id === IDS.customer && result.type === "customer");
    expect(customerNameMatch).toBeTruthy();
    expect(customerNameMatch.title).toBe(SEARCH_CUSTOMER_CODE);
    expect(JSON.stringify(customerNameMatch)).not.toContain("QA Search Customer");

    const customerByPhone = await readSearch(owner, { q: "09123456789", type: "customers" });
    expect(customerByPhone.results.some((result) => result.id === IDS.customer)).toBe(true);

    const persianNormalized = await readSearch(owner, { q: "مشتري جستجو تست", type: "customers" });
    expect(persianNormalized.results.some((result) => result.id === IDS.persianCustomer)).toBe(true);

    const documentByFile = await readSearch(owner, { q: "QA-search-document.pdf", type: "documents" });
    expect(documentByFile.results.some((result) => result.id === IDS.document && result.type === "document")).toBe(true);

    const taskByTitle = await readSearch(owner, { q: "QA Search Follow-up Task", type: "tasks" });
    expect(taskByTitle.results.some((result) => result.id === IDS.task && result.type === "task")).toBe(true);

    const trackingByEvent = await readSearch(owner, { q: "QA Search Public Event", type: "tracking" });
    expect(trackingByEvent.results.some((result) => result.id === IDS.shipment && result.type === "tracking")).toBe(true);

    const archiveByTitle = await readSearch(owner, { q: "QA Search Archived", type: "archive" });
    expect(archiveByTitle.results.some((result) => result.id === IDS.archive && result.type === "archive")).toBe(true);

    const usersByName = await readSearch(owner, { q: "QA Search User", type: "users" });
    expect(usersByName.results.some((result) => result.id === IDS.user && result.type === "user")).toBe(true);

    for (const payload of [shipmentByCode, documentByFile, usersByName]) {
      const serialized = JSON.stringify(payload).toLowerCase();
      expect(serialized).not.toContain("password_hash");
      expect(serialized).not.toContain("customer_access_token");
      expect(serialized).not.toContain("storage_key");
      expect(serialized).not.toContain("token_hash");
    }

    await disposeContexts(owner);
  });

  test("enforces limits, excludes archive from all search, and blocks cross-tenant leakage", async () => {
    const owner = await loginApi();

    const limited = await readSearch(owner, { q: "QA Search", type: "all", limit: "1" });
    expect(limited.limit).toBe(1);
    expect(limited.results).toHaveLength(1);

    const archiveExcluded = await readSearch(owner, { q: "QA Search Archived", type: "all" });
    expect(archiveExcluded.results.every((result) => result.type !== "archive")).toBe(true);

    const otherTenant = await readSearch(owner, { q: "QA-OTHER-TENANT-SECRET", type: "all" });
    expect(otherTenant.results).toEqual([]);

    await disposeContexts(owner);
  });

  test("navbar search supports grouped results, keyboard navigation, and result navigation", async ({ page }) => {
    await loginViaUi(page);

    const input = page.getByTestId("global-search-input");
    await input.fill("QA-TRACK-SEARCH-001");
    await expect(page.getByTestId("global-search-panel")).toBeVisible();
    await expect(page.getByTestId("search-result-item").filter({ hasText: "QA-SEARCH-SHIPMENT-001" }).first()).toBeVisible();

    await input.press("Enter");
    await expect(page).toHaveURL(new RegExp(`/shipments/${IDS.shipment}$`));
  });

  test("search page preserves URL query, filters by type, and opens results", async ({ page }) => {
    await loginViaUi(page);
    await page.goto(`/search?q=${encodeURIComponent("QA Search Customer")}&type=customers`);

    await expect(page.getByTestId("search-page-input")).toHaveValue("QA Search Customer");
    await expect(page.getByTestId("search-result-item").filter({ hasText: SEARCH_CUSTOMER_CODE }).first()).toBeVisible();
    await page.getByTestId("search-result-item").filter({ hasText: SEARCH_CUSTOMER_CODE }).first().click();
    await expect(page).toHaveURL(new RegExp(`/customers/${IDS.customer}$`));
  });

  test("stale navbar responses do not replace newer search results", async ({ page }) => {
    await loginViaUi(page);
    await page.route("**/api/search?**", async (route) => {
      const url = new URL(route.request().url());
      const query = url.searchParams.get("q") || "";
      if (query === "slow") {
        await new Promise((resolve) => setTimeout(resolve, 500));
        await route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({
            query,
            total: 1,
            limit: 20,
            offset: 0,
            results: [
              {
                id: "slow-result",
                type: "customer",
                title: "Slow Result",
                subtitle: "",
                description: "",
                url: "/customers/slow-result",
                matchedFields: ["customerName"],
                updatedAt: new Date().toISOString(),
              },
            ],
          }),
        });
        return;
      }
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          query,
          total: 1,
          limit: 20,
          offset: 0,
          results: [
            {
              id: "fast-result",
              type: "customer",
              title: "Fast Result",
              subtitle: "",
              description: "",
              url: "/customers/fast-result",
              matchedFields: ["customerName"],
              updatedAt: new Date().toISOString(),
            },
          ],
        }),
      });
    });

    const input = page.getByTestId("global-search-input");
    await input.fill("slow");
    await page.waitForTimeout(350);
    await input.fill("fast");

    await expect(page.getByTestId("search-result-item").filter({ hasText: "Fast Result" })).toBeVisible();
    await expect(page.getByText("Slow Result")).toHaveCount(0);
  });
});
