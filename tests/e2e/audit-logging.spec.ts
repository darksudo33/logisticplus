import { expect, request as requestFactory, test } from "@playwright/test";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import pg from "pg";
import { sanitizeAuditPayload } from "../../src/server/db.js";
import {
  BASE_URL,
  OWNER_EMAIL,
  OWNER_PASSWORD,
  USER_PASSWORD,
  apiContext,
  disposeContexts,
  expectForbidden,
  expectUnavailable,
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

async function uploadDocument(
  context: Awaited<ReturnType<typeof loginApi>>,
  file: { name: string; mimeType: string; buffer: Buffer },
  fields: Record<string, string> = {}
) {
  return context.post("/api/documents/upload", {
    multipart: {
      title: fields.title || file.name,
      type: fields.type || "OTHER",
      ...fields,
      file,
    },
  });
}

async function createTenantOwner(owner: Awaited<ReturnType<typeof loginApi>>) {
  const tenantEmail = uniqueEmail("audit-tenant-owner");
  const data = await readOk<any>(
    await owner.post("/api/admin/organizations/manual-signup", {
      data: {
        companyName: `Audit Tenant ${Date.now()}`,
        ownerName: "Audit Tenant Owner",
        ownerEmail: tenantEmail,
        password: USER_PASSWORD,
        planId: "starter",
        billingCycle: "monthly",
        contactPhone: "09120000000",
      },
    })
  );
  return { ...data, tenantEmail };
}

function sessionTokenFromSetCookie(setCookie = "") {
  const match = /logisticplus_session=([^;]+)/.exec(setCookie);
  return match ? decodeURIComponent(match[1]) : "";
}

async function createRawSession(userId: string, { expiresAt, revokedAt = null }: { expiresAt: Date; revokedAt?: Date | null }) {
  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  await dbQuery(
    `INSERT INTO app_sessions (id, user_id, token_hash, expires_at, revoked_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [crypto.randomUUID(), userId, tokenHash, expiresAt, revokedAt]
  );
  return token;
}

async function contextWithSessionToken(token: string) {
  return requestFactory.newContext({
    baseURL: BASE_URL,
    extraHTTPHeaders: {
      Cookie: `logisticplus_session=${encodeURIComponent(token)}`,
    },
  });
}

async function auditRowsSince(startedAt: string) {
  const result = await dbQuery(
    `SELECT id, organization_id, actor_user_id, actor_type, event_type, resource_type,
            resource_id, before_json, after_json, metadata_json, created_at
     FROM audit_logs
     WHERE created_at >= $1
     ORDER BY created_at ASC`,
    [startedAt]
  );
  return result.rows;
}

test.describe.serial("append-only audit logging", () => {
  test("redacts nested sensitive audit payload keys across before, after, and metadata", () => {
    const forbiddenKeys = [
      "password",
      "passwordHash",
      "token",
      "tokenHash",
      "session",
      "cookie",
      "authorization",
      "otp",
      "smsCode",
      "secret",
      "apiKey",
      "providerResponse",
      "storageKey",
      "filePath",
      "signedUrl",
      "signature",
      "customer_access_token",
      "trackingToken",
    ];
    const forbiddenValues = forbiddenKeys.flatMap((key, sectionIndex) =>
      ["before", "after", "metadata"].map((section) => `sensitive-audit-value-${section}-${sectionIndex}`)
    );
    const makeSensitiveObject = (section: string) =>
      Object.fromEntries(forbiddenKeys.map((key, index) => [key, `sensitive-audit-value-${section}-${index}`]));
    const publicTokenUrl = "/api/public/track/abcdefghijklmnopqrstuvwxyz1234567890";

    const sanitized = sanitizeAuditPayload({
      before_json: { nested: { sensitiveObject: makeSensitiveObject("before") } },
      after_json: { items: [{ sensitiveObject: makeSensitiveObject("after") }] },
      metadata_json: { envelope: { sensitiveObject: makeSensitiveObject("metadata"), publicTokenUrl } },
    });
    const serialized = JSON.stringify(sanitized);

    for (const value of [...forbiddenValues, publicTokenUrl]) {
      expect(serialized).not.toContain(value);
    }
    for (const section of [
      sanitized.before_json.nested.sensitiveObject,
      sanitized.after_json.items[0].sensitiveObject,
      sanitized.metadata_json.envelope.sensitiveObject,
    ]) {
      for (const key of forbiddenKeys) {
        expect(section[key]).toBe("[redacted]");
      }
    }
    expect(sanitized.metadata_json.envelope.publicTokenUrl).toBe("[redacted]");
  });

  test("records sanitized audit events for high-risk mutations and auth/security flows", async () => {
    const startedAt = new Date(Date.now() - 1000).toISOString();
    const owner = await apiContext();
    const publicContext = await apiContext();
    const smsContext = await apiContext();
    let expiredContext: Awaited<ReturnType<typeof contextWithSessionToken>> | null = null;

    try {
      const loginResponse = await owner.post("/api/auth/login", {
        data: { email: OWNER_EMAIL, password: OWNER_PASSWORD },
      });
      expect(loginResponse.status(), await loginResponse.text()).toBeLessThan(400);
      const sessionToken = sessionTokenFromSetCookie(loginResponse.headers()["set-cookie"] || "");
      expect(sessionToken).toMatch(/^[A-Za-z0-9_-]{32,}$/);
      const sessionTokenHash = crypto.createHash("sha256").update(sessionToken).digest("hex");

      const shipment = await readOk<any>(
        await owner.post("/api/shipments", {
          data: {
            trackingNumber: `AUDIT-${Date.now()}`,
            origin: "Shanghai",
            destination: "Bandar Abbas",
            status: "PENDING",
          },
        })
      );
      await readOk<any>(
        await owner.patch(`/api/shipments/${encodeURIComponent(shipment.id)}/operational-fields`, {
          data: { status: "CUSTOMS", notes: "Audit status update" },
        })
      );

      const document = await readOk<any>(
        await uploadDocument(owner, {
          name: "audit-document.txt",
          mimeType: "text/plain",
          buffer: Buffer.from("audit document content"),
        }, {
          shipmentId: shipment.id,
          visibility: "internal",
        })
      );
      await readOk<any>(
        await owner.patch(`/api/documents/${encodeURIComponent(document.id)}/visibility`, {
          data: { visibility: "customer_visible" },
        })
      );
      const storage = await dbQuery("SELECT storage_key FROM documents WHERE id = $1", [document.id]);
      const storageKey = storage.rows[0]?.storage_key || "";

      const resetAccess = await readOk<{ token: string }>(
        await owner.post(`/api/shipments/${encodeURIComponent(shipment.id)}/customer-access/reset`)
      );
      const resetTokenHash = crypto.createHash("sha256").update(resetAccess.token).digest("hex");
      const publicTrack = await readOk<any>(
        await publicContext.get(`/api/public/track/${encodeURIComponent(resetAccess.token)}`)
      );
      const publicDocument = publicTrack.documents.find((item: any) => item.id === document.id);
      expect(publicDocument?.downloadUrl).toContain("/api/public/documents/");
      const signature = new URL(`http://audit.local${publicDocument.downloadUrl}`).searchParams.get("signature") || "";

      await readOk(await owner.post(`/api/shipments/${encodeURIComponent(shipment.id)}/customer-access/disable`));
      await expectUnavailable(await publicContext.get(`/api/public/track/${encodeURIComponent(resetAccess.token)}`));
      await expectUnavailable(await publicContext.get(publicDocument.downloadUrl));

      const tenantInfo = await createTenantOwner(owner);
      const smsPhone = `0936${String(Date.now()).slice(-7)}`;
      await readOk(await owner.patch(
        `/api/admin/organizations/${encodeURIComponent(tenantInfo.organizationId)}/users/${encodeURIComponent(tenantInfo.ownerUserId)}`,
        { data: { phone: smsPhone } }
      ));
      await readOk(await owner.post(`/api/admin/users/${encodeURIComponent(tenantInfo.ownerUserId)}/platform-admin/grant`));
      await readOk(await owner.post(`/api/admin/users/${encodeURIComponent(tenantInfo.ownerUserId)}/platform-admin/revoke`));

      const requested = await readOk<any>(
        await smsContext.post("/api/auth/phone/request-code", {
          data: { phone: smsPhone },
        })
      );
      expect(requested.debugCode).toMatch(/^\d{6}$/);
      const wrongSmsCode = requested.debugCode === "000000" ? "111111" : "000000";
      const failedSms = await smsContext.post("/api/auth/phone/verify", {
        data: { phone: smsPhone, code: wrongSmsCode },
      });
      expect([401, 429]).toContain(failedSms.status());
      const verifiedSms = await smsContext.post("/api/auth/phone/verify", {
        data: { phone: smsPhone, code: requested.debugCode },
      });
      expect(verifiedSms.status(), await verifiedSms.text()).toBeLessThan(400);

      await readOk(await owner.post("/api/auth/logout"));

      const expiredToken = await createRawSession("u1", { expiresAt: new Date(Date.now() - 60_000) });
      expiredContext = await contextWithSessionToken(expiredToken);
      const expiredRestore = await expiredContext.get("/api/auth/me");
      expect(expiredRestore.status(), await expiredRestore.text()).toBe(401);

      const rows = await auditRowsSince(startedAt);
      const eventTypes = rows.map((row) => row.event_type);
      expect(eventTypes).toEqual(expect.arrayContaining([
        "auth.login_success",
        "auth.logout",
        "auth.session_restore_rejected",
        "auth.sms_code_requested",
        "auth.sms_verify_failed",
        "auth.sms_verify_success",
        "shipment.create",
        "shipment.status.update",
        "document.upload",
        "document.visibility.update",
        "customer_access.reset",
        "customer_access.disable",
        "public_tracking.disabled_access_attempt",
        "public_document.download_denied",
        "permission.platform_admin.grant",
        "permission.platform_admin.revoke",
      ]));
      expect(rows.some((row) => row.actor_type === "public" && row.event_type === "public_tracking.disabled_access_attempt")).toBe(true);

      const serialized = JSON.stringify(rows);
      for (const forbidden of [
        OWNER_PASSWORD,
        requested.debugCode,
        sessionToken,
        sessionTokenHash,
        resetAccess.token,
        resetTokenHash,
        storageKey,
        signature,
      ].filter(Boolean)) {
        expect(serialized).not.toContain(forbidden);
      }

      const resetRow = rows.find((row) => row.event_type === "customer_access.reset");
      expect(JSON.stringify(resetRow)).toContain("[redacted]");

      await expect(dbQuery("UPDATE audit_logs SET event_type = 'tampered' WHERE id = $1", [rows[0].id])).rejects.toThrow();
    } finally {
      await disposeContexts(...([owner, publicContext, smsContext, expiredContext].filter(Boolean) as any));
    }
  });

  test("scopes audit read APIs to tenant admins and platform admins", async () => {
    const owner = await loginApi();
    const publicContext = await apiContext();
    let tenant: Awaited<ReturnType<typeof loginApi>> | null = null;
    let noChangesTenant: Awaited<ReturnType<typeof loginApi>> | null = null;

    try {
      const invalidToken = `invalidAuditToken${crypto.randomBytes(12).toString("hex")}`;
      await expectUnavailable(await publicContext.get(`/api/public/track/${invalidToken}`));

      const tenantInfo = await createTenantOwner(owner);
      const otherTenantInfo = await createTenantOwner(owner);
      await dbQuery(
        `INSERT INTO audit_logs (id, organization_id, actor_type, event_type, resource_type, metadata_json)
         VALUES ($1, $2, 'system', 'audit.boundary.other_tenant', 'test', $3::jsonb)`,
        [crypto.randomUUID(), otherTenantInfo.organizationId, JSON.stringify({ marker: "other tenant audit marker" })]
      );
      tenant = await loginApi(tenantInfo.tenantEmail, USER_PASSWORD);

      const noChangesRole = `NO_CHANGES_${Date.now()}`;
      const noChangesUserId = crypto.randomUUID();
      const noChangesEmail = uniqueEmail("audit-no-changes");
      const noChangesPasswordHash = await bcrypt.hash(USER_PASSWORD, 10);
      await dbQuery(
        `INSERT INTO roles (id, name, description)
         VALUES ($1, $2, 'Role without changes.view for audit boundary tests')
         ON CONFLICT (name) DO NOTHING`,
        [crypto.randomUUID(), noChangesRole]
      );
      await dbQuery(
        `INSERT INTO app_users (id, name, email, password_hash, role, organization_id, status)
         VALUES ($1, 'Audit No Changes', $2, $3, $4, $5, 'active')`,
        [noChangesUserId, noChangesEmail, noChangesPasswordHash, noChangesRole, tenantInfo.organizationId]
      );
      await dbQuery(
        `INSERT INTO organization_members (organization_id, user_id, role, status)
         VALUES ($1, $2, 'member', 'active')
         ON CONFLICT (organization_id, user_id) DO NOTHING`,
        [tenantInfo.organizationId, noChangesUserId]
      );
      noChangesTenant = await loginApi(noChangesEmail, USER_PASSWORD);
      await expectForbidden(await noChangesTenant.get("/api/audit-logs?limit=10"));

      const tenantLogs = await readOk<any[]>(await tenant.get("/api/audit-logs?limit=100"));
      expect(tenantLogs.every((row) => row.organizationId === tenantInfo.organizationId)).toBe(true);
      expect(tenantLogs.some((row) => row.organizationId === "org-logisticplus-default")).toBe(false);
      expect(tenantLogs.some((row) => row.eventType === "audit.boundary.other_tenant")).toBe(false);

      await expectForbidden(await tenant.get("/api/admin/audit-logs?limit=10"));

      const platformLogs = await readOk<any[]>(await owner.get("/api/admin/audit-logs?limit=100"));
      expect(platformLogs.some((row) => row.actorType === "public" && row.eventType === "public_tracking.invalid_token_attempt")).toBe(true);
      expect(JSON.stringify(platformLogs)).not.toContain(invalidToken);

      const ownerTenantLogs = await readOk<any[]>(await owner.get("/api/audit-logs?limit=100"));
      expect(ownerTenantLogs.every((row) => row.organizationId === "org-logisticplus-default")).toBe(true);
    } finally {
      await disposeContexts(...([owner, publicContext, tenant, noChangesTenant].filter(Boolean) as any));
    }
  });
});
