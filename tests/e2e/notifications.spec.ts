import { expect, test } from "@playwright/test";
import crypto from "node:crypto";
import pg from "pg";
import {
  disposeContexts,
  expectUnavailable,
  loginApi,
  readOk,
} from "./helpers";

const { Client } = pg;
type DbClient = InstanceType<typeof Client>;
const testDatabaseUrl = process.env.TEST_DATABASE_URL || "postgres://postgres@localhost:5432/logisticplus_test";

const allowedNotificationKeys = ["createdAt", "id", "isRead", "link", "message", "title", "type"];

async function ownerOrganizationId(client: DbClient) {
  const result = await client.query("SELECT organization_id FROM app_users WHERE id = 'u1'");
  return result.rows[0]?.organization_id;
}

async function insertNotification(
  client: DbClient,
  {
    id,
    organizationId,
    userId = "u1",
    title = "E2E live notification",
    read = false,
  }: {
    id: string;
    organizationId: string;
    userId?: string;
    title?: string;
    read?: boolean;
  }
) {
  await client.query(
    `INSERT INTO notifications (
       id, organization_id, user_id, title, body, type, source_type, source_id, legacy_data, read_at, created_at
     )
     VALUES ($1, $2, $3, $4, 'Canonical notification body', 'INFO', 'E2E', '/tasks', $5::jsonb, $6, NOW())
     ON CONFLICT (id) DO UPDATE SET
       organization_id = EXCLUDED.organization_id,
       user_id = EXCLUDED.user_id,
       title = EXCLUDED.title,
       body = EXCLUDED.body,
       type = EXCLUDED.type,
       source_type = EXCLUDED.source_type,
       source_id = EXCLUDED.source_id,
       legacy_data = EXCLUDED.legacy_data,
       read_at = EXCLUDED.read_at,
       created_at = NOW()`,
    [
      id,
      organizationId,
      userId,
      title,
      JSON.stringify({ link: "/tasks" }),
      read ? new Date() : null,
    ]
  );
}

test.describe.serial("notifications API", () => {
  let client: DbClient;
  const insertedIds: string[] = [];
  const otherOrganizationId = `org-e2e-notifications-${Date.now()}`;
  const otherUserId = `u-e2e-notifications-${Date.now()}`;

  test.beforeAll(async () => {
    client = new Client({ connectionString: testDatabaseUrl });
    await client.connect();
  });

  test.afterAll(async () => {
    await client.query("DELETE FROM notifications WHERE id = ANY($1::text[])", [insertedIds]);
    await client.query("DELETE FROM app_users WHERE id = $1", [otherUserId]);
    await client.query("DELETE FROM organizations WHERE id = $1", [otherOrganizationId]);
    await client.end();
  });

  test("lists canonical notifications with an allowlisted payload and filters legacy demo rows", async () => {
    const organizationId = await ownerOrganizationId(client);
    const notificationId = `notif-e2e-${crypto.randomUUID()}`;
    insertedIds.push(notificationId);

    await insertNotification(client, {
      id: "n1",
      organizationId,
      title: "Legacy demo notification should stay hidden",
    });
    await insertNotification(client, { id: notificationId, organizationId });

    const owner = await loginApi();
    try {
      const data = await readOk<any[]>(
        await owner.get("/api/notifications?includeRead=true&limit=50")
      );
      expect(data.some((notification) => notification.id === "n1")).toBe(false);
      const notification = data.find((item) => item.id === notificationId);
      expect(notification).toBeTruthy();
      expect(Object.keys(notification).sort()).toEqual(allowedNotificationKeys);
      expect(notification).toMatchObject({
        id: notificationId,
        title: "E2E live notification",
        message: "Canonical notification body",
        type: "INFO",
        isRead: false,
        link: "/tasks",
      });
      expect(JSON.stringify(notification)).not.toContain("organization_id");
      expect(JSON.stringify(notification)).not.toContain("user_id");
      expect(JSON.stringify(notification)).not.toContain("legacy_data");
    } finally {
      await disposeContexts(owner);
    }
  });

  test("persists notification read state", async () => {
    const organizationId = await ownerOrganizationId(client);
    const notificationId = `notif-e2e-${crypto.randomUUID()}`;
    insertedIds.push(notificationId);
    await insertNotification(client, { id: notificationId, organizationId });

    const owner = await loginApi();
    try {
      const data = await readOk<any>(
        await owner.patch(`/api/notifications/${notificationId}/read`)
      );
      expect(data.id).toBe(notificationId);
      expect(data.isRead).toBe(true);

      const persisted = await client.query("SELECT read_at FROM notifications WHERE id = $1", [notificationId]);
      expect(persisted.rows[0]?.read_at).toBeTruthy();
    } finally {
      await disposeContexts(owner);
    }
  });

  test("does not allow another tenant notification to be marked read", async () => {
    const notificationId = `notif-e2e-${crypto.randomUUID()}`;
    insertedIds.push(notificationId);
    await client.query(
      `INSERT INTO organizations (id, name, slug, status, updated_at)
       VALUES ($1, 'E2E Notifications Tenant', $2, 'active', NOW())
       ON CONFLICT (id) DO UPDATE SET status = 'active', updated_at = NOW()`,
      [otherOrganizationId, otherOrganizationId]
    );
    await client.query(
      `INSERT INTO app_users (id, name, email, password_hash, role, status, organization_id, updated_at)
       VALUES ($1, 'Other Tenant User', $2, 'not-a-login-password', 'CEO', 'active', $3, NOW())
       ON CONFLICT (id) DO UPDATE SET organization_id = EXCLUDED.organization_id, updated_at = NOW()`,
      [otherUserId, `${otherUserId}@example.test`, otherOrganizationId]
    );
    await insertNotification(client, {
      id: notificationId,
      organizationId: otherOrganizationId,
      userId: otherUserId,
      title: "Other tenant notification",
    });

    const owner = await loginApi();
    try {
      await expectUnavailable(await owner.patch(`/api/notifications/${notificationId}/read`));
      const persisted = await client.query("SELECT read_at FROM notifications WHERE id = $1", [notificationId]);
      expect(persisted.rows[0]?.read_at).toBeFalsy();
    } finally {
      await disposeContexts(owner);
    }
  });
});
