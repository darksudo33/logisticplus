import { expect, test } from "@playwright/test";
import pg from "pg";
import {
  USER_PASSWORD,
  apiContext,
  currentTehranShamsiParts,
  disposeContexts,
  loginApi,
  nextValidShipmentCode,
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

async function createCustomer(context: Awaited<ReturnType<typeof loginApi>>, marker: string) {
  return readOk<any>(
    await context.post("/api/customers", {
      data: {
        name: `${marker} Customer`,
        company: `${marker} Company`,
        email: `${marker.toLowerCase()}-${Date.now()}@example.test`,
        phone: "09120000000",
        address: `${marker} Address`,
      },
    })
  );
}

function shipmentBody(customerId: string, overrides: Record<string, unknown> = {}) {
  return {
    flowCode: "IMPORT_LANJ",
    customerId,
    origin: "Dubai",
    dischargePort: "Bandar Abbas",
    deliveryPort: "Tehran",
    lenjType: "TEH_LENJI",
    ...overrides,
  };
}

test.describe.serial("strict Shamsi shipment code generation", () => {
  test("auto-generates padded yearly Shamsi codes and stores metadata", async () => {
    const owner = await loginApi();
    const marker = `ShipmentCodeAuto${Date.now()}`;
    const customer = await createCustomer(owner, marker);
    const today = currentTehranShamsiParts();

    const created = await readOk<any>(
      await owner.post("/api/shipments/v2", {
        data: shipmentBody(customer.id),
      })
    );

    const code = created.shipment.trackingNumber;
    expect(code).toMatch(/^\d{11}$/);
    expect(code.slice(0, 8)).toBe(today.compactDate);
    expect(Number(code.slice(8, 11))).toBeGreaterThanOrEqual(1);
    expect(code.slice(8, 11)).toBe(String(Number(code.slice(8, 11))).padStart(3, "0"));

    const stored = await dbQuery(
      "SELECT shipment_code, shamsi_year, shamsi_date, shamsi_sequence FROM shipments WHERE id = $1",
      [created.shipment.id]
    );
    expect(stored.rows[0]).toMatchObject({
      shipment_code: code,
      shamsi_year: Number(today.year),
      shamsi_date: today.slashDate,
      shamsi_sequence: Number(code.slice(8, 11)),
    });

    await disposeContexts(owner);
  });

  test("validates onboarding codes, rejects bad values, and advances the yearly counter", async () => {
    const owner = await loginApi();
    const marker = `ShipmentCodeExisting${Date.now()}`;
    const customer = await createCustomer(owner, marker);
    const today = currentTehranShamsiParts();
    const existingCode = await nextValidShipmentCode();

    for (const [payloadCode, expectedMessage] of [
      ["BAD-CODE", "فرمت کد محموله معتبر نیست. مثال صحیح: 14050316020"],
      [`${today.year}1301001`, "تاریخ شمسی داخل کد محموله معتبر نیست"],
      [`${today.compactDate}000`, "شماره ردیف کد محموله معتبر نیست"],
    ] as const) {
      const response = await owner.post("/api/shipments/v2", {
        data: shipmentBody(customer.id, {
          codeMode: "existing",
          trackingNumber: payloadCode,
        }),
      });
      expect(response.status()).toBe(400);
      const payload = await response.json();
      expect(payload.error?.message).toBe(expectedMessage);
    }

    const imported = await readOk<any>(
      await owner.post("/api/shipments/v2", {
        data: shipmentBody(customer.id, {
          codeMode: "existing",
          trackingNumber: existingCode,
        }),
      })
    );
    expect(imported.shipment.trackingNumber).toBe(existingCode);

    const duplicate = await owner.post("/api/shipments/v2", {
      data: shipmentBody(customer.id, {
        codeMode: "existing",
        trackingNumber: existingCode,
      }),
    });
    expect(duplicate.status()).toBe(409);
    expect((await duplicate.json()).error?.message).toBe("این کد محموله قبلاً ثبت شده است");

    const nextAuto = await readOk<any>(
      await owner.post("/api/shipments/v2", {
        data: shipmentBody(customer.id),
      })
    );
    const nextSequence = Number(existingCode.slice(8, 11)) + 1;
    expect(nextAuto.shipment.trackingNumber).toBe(`${today.compactDate}${String(nextSequence).padStart(3, "0")}`);

    await disposeContexts(owner);
  });

  test("keeps shipment-code uniqueness tenant-scoped and blocks non-CEO onboarding mode", async () => {
    const owner = await loginApi();
    const publicContext = await apiContext();
    const sharedCode = await nextValidShipmentCode();

    const ownerCustomer = await createCustomer(owner, `ShipmentCodeTenantOwner${Date.now()}`);
    await readOk<any>(
      await owner.post("/api/shipments/v2", {
        data: shipmentBody(ownerCustomer.id, {
          codeMode: "existing",
          trackingNumber: sharedCode,
        }),
      })
    );

    const tenantEmail = uniqueEmail("shipment-code-tenant");
    await readOk<any>(
      await owner.post("/api/admin/organizations/manual-signup", {
        data: {
          companyName: `Shipment Code Tenant ${Date.now()}`,
          ownerName: "Shipment Code Tenant Owner",
          ownerEmail: tenantEmail,
          password: USER_PASSWORD,
          planId: "starter",
          billingCycle: "monthly",
          contactPhone: "09120000000",
        },
      })
    );
    await publicContext.post("/api/auth/logout");
    const tenant = await loginApi(tenantEmail, USER_PASSWORD);
    const tenantCustomer = await createCustomer(tenant, `ShipmentCodeTenant${Date.now()}`);
    const crossTenant = await readOk<any>(
      await tenant.post("/api/shipments/v2", {
        data: shipmentBody(tenantCustomer.id, {
          codeMode: "existing",
          trackingNumber: sharedCode,
        }),
      })
    );
    expect(crossTenant.shipment.trackingNumber).toBe(sharedCode);

    const normalEmail = uniqueEmail("shipment-code-ops");
    await readOk<any>(
      await owner.post("/api/users", {
        data: {
          name: "Shipment Code Ops",
          email: normalEmail,
          password: USER_PASSWORD,
          role: "OPERATIONS",
        },
      })
    );
    const normalUser = await loginApi(normalEmail, USER_PASSWORD);
    const unauthorized = await normalUser.post("/api/shipments/v2", {
      data: shipmentBody(ownerCustomer.id, {
        codeMode: "existing",
        trackingNumber: await nextValidShipmentCode(),
      }),
    });
    expect([403]).toContain(unauthorized.status());

    await disposeContexts(owner, publicContext, tenant, normalUser);
  });

  test("does not generate duplicate codes under concurrent V2 creation", async () => {
    const owner = await loginApi();
    const customer = await createCustomer(owner, `ShipmentCodeConcurrent${Date.now()}`);
    const responses = await Promise.all(
      Array.from({ length: 5 }, () =>
        owner.post("/api/shipments/v2", {
          data: shipmentBody(customer.id),
        })
      )
    );
    const created = await Promise.all(responses.map((response) => readOk<any>(response)));
    const codes = created.map((item) => item.shipment.trackingNumber);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes.every((code) => /^\d{11}$/.test(code))).toBe(true);

    await disposeContexts(owner);
  });

  test("reuses the latest sequence after its shipment is archived", async () => {
    const owner = await loginApi();
    const customer = await createCustomer(owner, `ShipmentCodeReuse${Date.now()}`);
    const created = await readOk<any>(
      await owner.post("/api/shipments/v2", {
        data: shipmentBody(customer.id),
      })
    );

    await readOk(await owner.post(`/api/archive/shipment/${created.shipment.id}`));

    const replacement = await readOk<any>(
      await owner.post("/api/shipments/v2", {
        data: shipmentBody(customer.id),
      })
    );
    expect(replacement.shipment.trackingNumber).toBe(created.shipment.trackingNumber);

    const restore = await owner.post(`/api/archive/shipment/${created.shipment.id}/restore`);
    expect(restore.status()).toBe(409);

    await disposeContexts(owner);
  });
});
