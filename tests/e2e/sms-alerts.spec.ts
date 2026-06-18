import { expect, test } from "@playwright/test";
import crypto from "node:crypto";
import pg from "pg";
import {
  USER_PASSWORD,
  disposeContexts,
  loginApi,
  readOk,
  uniqueEmail,
} from "./helpers";
import { sendSmsMessage } from "../../src/server/sms-provider.js";

const { Client } = pg;
const testDatabaseUrl =
  process.env.TEST_DATABASE_URL || "postgres://postgres@localhost:5432/logisticplus_test";

type ApiContext = Awaited<ReturnType<typeof loginApi>>;
type SmsDelivery = {
  id: string;
  organizationId: string;
  userId?: string;
  sourceId?: string;
  sourceType?: string;
  eventKey?: string;
  recipientType?: string;
  recipientName?: string;
  recipientPhone?: string;
  message?: string;
  status: string;
  attemptCount?: number;
  skipReason?: string;
  providerResponse?: Record<string, any>;
};

async function createTenantOwner(owner: ApiContext, planId: "starter" | "business" | "enterprise" = "starter") {
  const tenantEmail = uniqueEmail(`sms-${planId}`);
  const companyName = `SMS ${planId} ${Date.now()} ${Math.random().toString(36).slice(2)}`;
  const data = await readOk<any>(
    await owner.post("/api/admin/organizations/manual-signup", {
      data: {
        companyName,
        ownerName: "SMS Tenant Owner",
        ownerEmail: tenantEmail,
        password: USER_PASSWORD,
        planId,
        billingCycle: "monthly",
        contactPhone: "09120000000",
      },
    })
  );
  return { tenantEmail, companyName, organizationId: data.organizationId, ownerUserId: data.ownerUserId };
}

async function setUserPhone(context: ApiContext, userId: string, phone: string) {
  await readOk(await context.patch(`/api/users/${encodeURIComponent(userId)}`, { data: { phone } }));
}

async function createCompanyUser(context: ApiContext, role: string, prefix: string) {
  const email = uniqueEmail(prefix);
  const data = await readOk<any>(
    await context.post("/api/users", {
      data: {
        name: `SMS ${role} User`,
        email,
        password: USER_PASSWORD,
        role,
      },
    })
  );
  return { ...data, email };
}

async function createUrgentTask(context: ApiContext, title: string, assignedToUserId: string) {
  return readOk<any>(
    await context.post("/api/tasks", {
      data: {
        title,
        priority: "URGENT",
        assignedToUserId,
      },
    })
  );
}

async function listSmsDeliveries(owner: ApiContext, organizationId: string) {
  return readOk<SmsDelivery[]>(
    await owner.get(`/api/admin/sms-deliveries?organizationId=${encodeURIComponent(organizationId)}&limit=200`)
  );
}

async function runSmsWorker(owner: ApiContext) {
  return readOk<any>(await owner.post("/api/admin/sms-deliveries/run-worker", { data: { limit: 100 } }));
}

async function insertDemurrageShipment({
  organizationId,
  ownerUserId,
  assignedManagerId,
  hoursUntilFreeTimeEnds = 23,
}: {
  organizationId: string;
  ownerUserId: string;
  assignedManagerId?: string;
  hoursUntilFreeTimeEnds?: number;
}) {
  const shipmentId = crypto.randomUUID();
  await withDb(async (client) => {
    await client.query(
      `INSERT INTO shipments (
         id, organization_id, owner_user_id, shipment_code, customer_name, status,
         origin, destination, estimated_delivery_at, free_time_ends_at, assigned_manager_id,
         legacy_data, created_by_id
       )
       VALUES ($1, $2, $3, $4, 'E2E Customer', 'KOOTAJ_DONE', 'Tehran', 'Bandar Abbas', $5, $6, $7, '{}'::jsonb, $3)`,
      [
        shipmentId,
        organizationId,
        ownerUserId,
        `SMS-DMR-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        new Date().toISOString(),
        new Date(Date.now() + hoursUntilFreeTimeEnds * 60 * 60 * 1000).toISOString(),
        assignedManagerId || ownerUserId,
      ]
    );
  });
  return shipmentId;
}

async function withDb<T>(fn: (client: any) => Promise<T>) {
  const client = new Client({ connectionString: testDatabaseUrl });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

test.describe.serial("SMS alert entitlements and worker", () => {
  test("admin SMS templates seed and edited templates drive queued messages", async () => {
    const owner = await loginApi();
    const tenantInfo = await createTenantOwner(owner, "enterprise");
    const tenant = await loginApi(tenantInfo.tenantEmail, USER_PASSWORD);
    await setUserPhone(tenant, tenantInfo.ownerUserId, "09120000010");

    const templates = await readOk<any[]>(await owner.get("/api/admin/sms-templates"));
    const highPriority = templates.find((template) => template.key === "high_priority_task");
    expect(highPriority?.body).toContain("#task#");
    expect(highPriority?.body).toContain("لاجستیک پلاس");

    const editedBody = "کار فوری #task# در #time#\nلاجستیک پلاس";
    const updated = await readOk<any>(
      await owner.patch("/api/admin/sms-templates/high_priority_task", {
        data: { body: editedBody, enabled: true },
      })
    );
    expect(updated.body).toBe(editedBody);

    const task = await createUrgentTask(tenant, `SMS template ${Date.now()}`, tenantInfo.ownerUserId);
    const deliveries = await listSmsDeliveries(owner, tenantInfo.organizationId);
    const queued = deliveries.find((delivery) => delivery.sourceId === task.id);
    expect(queued?.status).toBe("queued");
    expect(queued?.message).toContain("کار فوری");
    expect(queued?.message).toContain(task.title);

    await disposeContexts(owner, tenant);
  });

  test("enterprise queues dry-run SMS and records skipped deliveries when phone is missing", async () => {
    const owner = await loginApi();
    const tenantInfo = await createTenantOwner(owner, "enterprise");
    const tenant = await loginApi(tenantInfo.tenantEmail, USER_PASSWORD);

    const missingPhoneTask = await createUrgentTask(
      tenant,
      `SMS missing phone ${Date.now()}`,
      tenantInfo.ownerUserId
    );
    let deliveries = await listSmsDeliveries(owner, tenantInfo.organizationId);
    const skipped = deliveries.find((delivery) => delivery.sourceId === missingPhoneTask.id);
    expect(skipped?.status).toBe("skipped");
    expect(skipped?.skipReason).toBe("missing_or_invalid_phone");

    await setUserPhone(tenant, tenantInfo.ownerUserId, "09120000001");
    const task = await createUrgentTask(tenant, `SMS enterprise ${Date.now()}`, tenantInfo.ownerUserId);
    deliveries = await listSmsDeliveries(owner, tenantInfo.organizationId);
    const queued = deliveries.find((delivery) => delivery.sourceId === task.id);
    expect(queued?.status).toBe("queued");

    const workerResult = await runSmsWorker(owner);
    expect(workerResult.sent).toBeGreaterThanOrEqual(1);

    deliveries = await listSmsDeliveries(owner, tenantInfo.organizationId);
    const sent = deliveries.find((delivery) => delivery.sourceId === task.id);
    expect(sent?.status).toBe("sent");
    expect(sent?.providerResponse?.dryRun).toBe(true);

    const attemptCount = sent?.attemptCount;
    await runSmsWorker(owner);
    deliveries = await listSmsDeliveries(owner, tenantInfo.organizationId);
    const matches = deliveries.filter((delivery) => delivery.eventKey === sent?.eventKey);
    expect(matches).toHaveLength(1);
    expect(matches[0].attemptCount).toBe(attemptCount);

    await disposeContexts(owner, tenant);
  });

  test("lower plans stay off until admin enables SMS add-on and can issue a manual invoice", async () => {
    const owner = await loginApi();
    const starterInfo = await createTenantOwner(owner, "starter");
    const businessInfo = await createTenantOwner(owner, "business");
    const starter = await loginApi(starterInfo.tenantEmail, USER_PASSWORD);
    const business = await loginApi(businessInfo.tenantEmail, USER_PASSWORD);

    await setUserPhone(starter, starterInfo.ownerUserId, "09120000002");
    await setUserPhone(business, businessInfo.ownerUserId, "09120000003");

    const starterBlockedTask = await createUrgentTask(starter, `SMS starter blocked ${Date.now()}`, starterInfo.ownerUserId);
    const businessBlockedTask = await createUrgentTask(business, `SMS business blocked ${Date.now()}`, businessInfo.ownerUserId);
    expect((await listSmsDeliveries(owner, starterInfo.organizationId)).some((delivery) => delivery.sourceId === starterBlockedTask.id)).toBe(false);
    expect((await listSmsDeliveries(owner, businessInfo.organizationId)).some((delivery) => delivery.sourceId === businessBlockedTask.id)).toBe(false);

    await readOk(
      await owner.patch(`/api/admin/organizations/${encodeURIComponent(starterInfo.organizationId)}/subscription`, {
        data: { limitsOverride: { smsNotifications: true } },
      })
    );

    const enabledTask = await createUrgentTask(starter, `SMS starter enabled ${Date.now()}`, starterInfo.ownerUserId);
    let deliveries = await listSmsDeliveries(owner, starterInfo.organizationId);
    expect(deliveries.find((delivery) => delivery.sourceId === enabledTask.id)?.status).toBe("queued");

    const invoice = await readOk<any>(
      await owner.post("/api/admin/billing/invoices", {
        data: {
          organizationId: starterInfo.organizationId,
          amountIrr: 1000000,
          description: "SMS alerts add-on",
        },
      })
    );
    expect(invoice.items?.[0]?.description).toContain("SMS");

    await runSmsWorker(owner);
    deliveries = await listSmsDeliveries(owner, starterInfo.organizationId);
    expect(deliveries.find((delivery) => delivery.sourceId === enabledTask.id)?.status).toBe("sent");

    await disposeContexts(owner, starter, business);
  });

  test("demurrage alerts go to CEO only even when a manager is assigned", async () => {
    const owner = await loginApi();
    const tenantInfo = await createTenantOwner(owner, "enterprise");
    const tenant = await loginApi(tenantInfo.tenantEmail, USER_PASSWORD);
    const manager = await createCompanyUser(tenant, "MANAGER", "sms-manager");
    await setUserPhone(tenant, tenantInfo.ownerUserId, "09120000050");
    await setUserPhone(tenant, manager.id, "09120000051");

    const shipmentId = await insertDemurrageShipment({
      organizationId: tenantInfo.organizationId,
      ownerUserId: tenantInfo.ownerUserId,
      assignedManagerId: manager.id,
    });

    await runSmsWorker(owner);
    const deliveries = await listSmsDeliveries(owner, tenantInfo.organizationId);
    const delivery = deliveries.find((item) => item.sourceType === "demurrage" && item.sourceId === shipmentId);
    expect(delivery?.status).toBe("sent");
    expect(delivery?.userId).toBe(tenantInfo.ownerUserId);
    expect(delivery?.recipientPhone).toBe("989120000050");
    expect(delivery?.recipientPhone).not.toBe("989120000051");

    await disposeContexts(owner, tenant);
  });

  test("demurrage skips instead of falling back to manager when CEO has no phone", async () => {
    const owner = await loginApi();
    const tenantInfo = await createTenantOwner(owner, "enterprise");
    const tenant = await loginApi(tenantInfo.tenantEmail, USER_PASSWORD);
    const manager = await createCompanyUser(tenant, "MANAGER", "sms-manager-missing-ceo");
    await setUserPhone(tenant, manager.id, "09120000052");

    const shipmentId = await insertDemurrageShipment({
      organizationId: tenantInfo.organizationId,
      ownerUserId: tenantInfo.ownerUserId,
      assignedManagerId: manager.id,
    });

    await runSmsWorker(owner);
    const deliveries = await listSmsDeliveries(owner, tenantInfo.organizationId);
    const delivery = deliveries.find((item) => item.sourceType === "demurrage" && item.sourceId === shipmentId);
    expect(delivery?.status).toBe("skipped");
    expect(delivery?.skipReason).toBe("missing_ceo_recipient");
    expect(delivery?.recipientPhone || "").toBe("");

    await disposeContexts(owner, tenant);
  });

  test("customer-visible shipment status updates queue customer SMS and feed analytics", async () => {
    const owner = await loginApi();
    const tenantInfo = await createTenantOwner(owner, "enterprise");
    const tenant = await loginApi(tenantInfo.tenantEmail, USER_PASSWORD);

    const customer = await readOk<any>(
      await tenant.post("/api/customers", {
        data: {
          company: `SMS Customer ${Date.now()}`,
          name: "SMS Customer Contact",
          phone: "09120000070",
        },
      })
    );
    const shipmentId = crypto.randomUUID();
    await withDb(async (client) => {
      await client.query(
        `INSERT INTO shipments (
           id, organization_id, owner_user_id, shipment_code, customer_id, customer_name, status,
           origin, destination, estimated_delivery_at, legacy_data, created_by_id
         )
         VALUES ($1, $2, $3, $4, $5, 'SMS Customer', 'ARRIVED', 'Tehran', 'Bandar Abbas', $6, '{}'::jsonb, $3)`,
        [
          shipmentId,
          tenantInfo.organizationId,
          tenantInfo.ownerUserId,
          `SMS-CUST-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          customer.id,
          new Date().toISOString(),
        ]
      );
    });

    const visibleEvent = await readOk<any>(
      await tenant.patch(`/api/shipments/${encodeURIComponent(shipmentId)}/public-status`, {
        data: {
          publicLabel: "در حال ترخیص",
          publicDescription: "Customer-visible update",
          isCustomerVisible: true,
        },
      })
    );
    let deliveries = await listSmsDeliveries(owner, tenantInfo.organizationId);
    const queued = deliveries.find((delivery) => delivery.sourceId === visibleEvent.id);
    expect(queued?.status).toBe("queued");
    expect(queued?.recipientType).toBe("customer");
    expect(queued?.recipientPhone).toBe("989120000070");
    expect(queued?.message).toContain("در حال ترخیص");

    const hiddenEvent = await readOk<any>(
      await tenant.patch(`/api/shipments/${encodeURIComponent(shipmentId)}/public-status`, {
        data: {
          publicLabel: "به‌روزرسانی داخلی",
          publicDescription: "Internal-only update",
          isCustomerVisible: false,
        },
      })
    );
    deliveries = await listSmsDeliveries(owner, tenantInfo.organizationId);
    expect(deliveries.some((delivery) => delivery.sourceId === hiddenEvent.id)).toBe(false);

    await runSmsWorker(owner);
    deliveries = await listSmsDeliveries(owner, tenantInfo.organizationId);
    expect(deliveries.find((delivery) => delivery.sourceId === visibleEvent.id)?.status).toBe("sent");

    const analytics = await readOk<any>(
      await owner.get(`/api/admin/sms-analytics?organizationId=${encodeURIComponent(tenantInfo.organizationId)}`)
    );
    expect(analytics.summary.totalSent).toBeGreaterThanOrEqual(1);
    const recipient = analytics.recipients.find((item: any) => item.recipientPhone === "989120000070");
    expect(recipient?.sentCount).toBeGreaterThanOrEqual(1);
    expect(recipient?.failedCount).toBe(0);

    await disposeContexts(owner, tenant);
  });

  test("scheduled meeting and demurrage worker runs are idempotent", async () => {
    const owner = await loginApi();
    const tenantInfo = await createTenantOwner(owner, "enterprise");
    const tenant = await loginApi(tenantInfo.tenantEmail, USER_PASSWORD);
    await setUserPhone(tenant, tenantInfo.ownerUserId, "09120000004");

    const meetingId = crypto.randomUUID();
    const shipmentId = crypto.randomUUID();
    const meetingAt = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();
    const freeTimeEndsAt = new Date(Date.now() + 23 * 60 * 60 * 1000).toISOString();

    await withDb(async (client) => {
      await client.query(
        `INSERT INTO compliance_meetings (
           id, organization_id, owner_user_id, title, organization_name, meeting_at,
           status, assigned_to_id, assigned_to_name, created_by_id
         )
         VALUES ($1, $2, $3, $4, 'E2E', $5, 'SCHEDULED', $3, 'SMS Tenant Owner', $3)`,
        [meetingId, tenantInfo.organizationId, tenantInfo.ownerUserId, "E2E SMS reminder", meetingAt]
      );
      await client.query(
        `INSERT INTO shipments (
           id, organization_id, owner_user_id, shipment_code, customer_name, status,
           origin, destination, estimated_delivery_at, free_time_ends_at, assigned_manager_id,
           legacy_data, created_by_id
         )
         VALUES ($1, $2, $3, $4, 'E2E Customer', 'KOOTAJ_DONE', 'Tehran', 'Bandar Abbas', $5, $6, $3, '{}'::jsonb, $3)`,
        [
          shipmentId,
          tenantInfo.organizationId,
          tenantInfo.ownerUserId,
          `SMS-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          new Date().toISOString(),
          freeTimeEndsAt,
        ]
      );
    });

    await runSmsWorker(owner);
    let deliveries = await listSmsDeliveries(owner, tenantInfo.organizationId);
    const meetingDelivery = deliveries.find((delivery) => delivery.sourceType === "meeting" && delivery.sourceId === meetingId);
    const demurrageDelivery = deliveries.find((delivery) => delivery.sourceType === "demurrage" && delivery.sourceId === shipmentId);
    expect(meetingDelivery?.status).toBe("sent");
    expect(demurrageDelivery?.status).toBe("sent");

    await runSmsWorker(owner);
    deliveries = await listSmsDeliveries(owner, tenantInfo.organizationId);
    expect(deliveries.filter((delivery) => delivery.eventKey === meetingDelivery?.eventKey)).toHaveLength(1);
    expect(deliveries.filter((delivery) => delivery.eventKey === demurrageDelivery?.eventKey)).toHaveLength(1);

    await disposeContexts(owner, tenant);
  });

  test("SMS.ir live default-line mode omits lineNumber", async () => {
    const previousEnv = {
      SMS_ENABLED: process.env.SMS_ENABLED,
      SMS_DRY_RUN: process.env.SMS_DRY_RUN,
      SMSIR_API_KEY: process.env.SMSIR_API_KEY,
      SMSIR_LINE_NUMBER: process.env.SMSIR_LINE_NUMBER,
      SMSIR_USE_DEFAULT_LINE: process.env.SMSIR_USE_DEFAULT_LINE,
    };
    const originalFetch = globalThis.fetch;
    const requestBodies: any[] = [];

    try {
      process.env.SMS_ENABLED = "true";
      process.env.SMS_DRY_RUN = "false";
      process.env.SMSIR_API_KEY = "test-api-key";
      delete process.env.SMSIR_LINE_NUMBER;
      process.env.SMSIR_USE_DEFAULT_LINE = "true";
      globalThis.fetch = (async (_url: any, init?: any) => {
        requestBodies.push(JSON.parse(String(init?.body || "{}")));
        return new Response(JSON.stringify({ data: { messageId: "smsir-test-message" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }) as any;

      const result = await sendSmsMessage({ to: "989120000000", message: "test" });
      expect(result.ok).toBe(true);
      expect(requestBodies[0]?.lineNumber).toBeUndefined();
      expect(requestBodies[0]?.mobiles).toEqual(["989120000000"]);
    } finally {
      globalThis.fetch = originalFetch;
      for (const [key, value] of Object.entries(previousEnv)) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    }
  });
});
