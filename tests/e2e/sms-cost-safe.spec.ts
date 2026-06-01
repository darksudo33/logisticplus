import { expect, test } from "@playwright/test";
import pg from "pg";
import {
  USER_PASSWORD,
  disposeContexts,
  loginApi,
  readOk,
  uniqueEmail,
} from "./helpers";

const { Client } = pg;
const testDatabaseUrl = process.env.TEST_DATABASE_URL || "postgres://postgres@localhost:5432/logisticplus_test";

async function withDb<T>(fn: (client: any) => Promise<T>) {
  const client = new Client({ connectionString: testDatabaseUrl });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function countQueuedAuthOtpDeliveries() {
  return withDb(async (client) => {
    const result = await client.query(
      "SELECT COUNT(*)::int AS count FROM sms_deliveries WHERE source_type = 'auth_otp' AND status = 'queued'"
    );
    return result.rows[0]?.count || 0;
  });
}

function hasDryRunFlag(value: unknown) {
  return JSON.stringify(value || {}).includes('"dryRun":true');
}

test.describe.serial("SMS cost-safe verification", () => {
  test("OTP login uses dry-run delivery records and leaves no queued auth backlog", async () => {
    const owner = await loginApi();
    const phone = `091${String(Date.now()).slice(-8)}`;

    try {
      const created = await readOk<any>(
        await owner.post("/api/users", {
          data: {
            name: "E2E SMS Cost Safe User",
            email: uniqueEmail("sms-cost-safe"),
            password: USER_PASSWORD,
            role: "OPERATIONS",
          },
        })
      );
      await readOk(
        await owner.patch(`/api/users/${encodeURIComponent(created.id)}`, {
          data: { phone },
        })
      );

      const queuedBefore = await countQueuedAuthOtpDeliveries();
      const requested = await readOk<any>(
        await owner.post("/api/auth/phone/request-code", {
          data: { phone },
        })
      );
      expect(requested.codeSent).toBe(true);
      expect(requested.debugCode).toMatch(/^\d{6}$/);

      const records = await withDb(async (client) => {
        const challenge = await client.query(
          `SELECT id, user_id, phone, consumed_at
           FROM login_sms_challenges
           WHERE user_id = $1
           ORDER BY created_at DESC
           LIMIT 1`,
          [created.id]
        );
        const delivery = await client.query(
          `SELECT id, organization_id, status, source_type, source_id, provider_response, recipient_phone
           FROM sms_deliveries
           WHERE source_type = 'auth_otp'
             AND source_id = $1
           LIMIT 1`,
          [challenge.rows[0]?.id || ""]
        );
        return { challenge: challenge.rows[0], delivery: delivery.rows[0] };
      });

      expect(records.challenge?.phone).toBe(`98${phone.slice(1)}`);
      expect(records.challenge?.consumed_at).toBeNull();
      expect(records.delivery?.status).toBe("sent");
      expect(records.delivery?.recipient_phone).toBe(`98${phone.slice(1)}`);
      expect(hasDryRunFlag(records.delivery?.provider_response)).toBe(true);
      expect(await countQueuedAuthOtpDeliveries()).toBe(queuedBefore);

      const deliveries = await readOk<any[]>(
        await owner.get(
          `/api/admin/sms-deliveries?organizationId=${encodeURIComponent(records.delivery.organization_id)}&limit=50`
        )
      );
      const reportRow = deliveries.find((delivery) => delivery.id === records.delivery.id);
      expect(reportRow?.status).toBe("sent");
      expect(hasDryRunFlag(reportRow?.providerResponse)).toBe(true);
    } finally {
      await disposeContexts(owner);
    }
  });

  test("unknown-phone OTP cooldown does not create SMS deliveries", async () => {
    const owner = await loginApi();
    const phone = `092${String(Date.now()).slice(-8)}`;

    try {
      const before = await withDb(async (client) => {
        const result = await client.query("SELECT COUNT(*)::int AS count FROM sms_deliveries");
        return result.rows[0]?.count || 0;
      });
      const first = await readOk<any>(
        await owner.post("/api/auth/phone/request-code", {
          data: { phone },
        })
      );
      expect(first.codeSent).toBe(false);

      const limited = await owner.post("/api/auth/phone/request-code", {
        data: { phone },
      });
      expect(limited.status(), await limited.text()).toBe(429);
      expect(limited.headers()["retry-after"]).toBeTruthy();

      const after = await withDb(async (client) => {
        const result = await client.query("SELECT COUNT(*)::int AS count FROM sms_deliveries");
        return result.rows[0]?.count || 0;
      });
      expect(after).toBe(before);
    } finally {
      await disposeContexts(owner);
    }
  });
});
