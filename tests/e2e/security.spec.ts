import { expect, request as requestFactory, test } from "@playwright/test";
import crypto from "node:crypto";
import pg from "pg";
import {
  BASE_URL,
  OWNER_EMAIL,
  OWNER_PASSWORD,
  USER_PASSWORD,
  apiContext,
  disposeContexts,
  expectForbidden,
  expectPublicTrackingPayloadIsSafe,
  expectUnavailable,
  loginApi,
  loginViaUi,
  readOk,
  uniqueEmail,
} from "./helpers";
import { NORMAL_APP_ROUTE_FAMILIES, RBAC_TENANT_POLICY } from "./rbac-policy";

const { Client } = pg;
const testDatabaseUrl = process.env.TEST_DATABASE_URL || "postgres://postgres@localhost:5432/logisticplus_test";

async function resetRateLimitBuckets() {
  const client = new Client({ connectionString: testDatabaseUrl });
  await client.connect();
  try {
    await client.query("DELETE FROM rate_limit_buckets");
  } finally {
    await client.end();
  }
}

async function dbQuery(sql: string, params: any[] = []) {
  const client = new Client({ connectionString: testDatabaseUrl });
  await client.connect();
  try {
    return await client.query(sql, params);
  } finally {
    await client.end();
  }
}

async function grantPlatformAdminPermission(userId: string, grantedById = "u1") {
  await dbQuery(
    `INSERT INTO user_permissions (user_id, permission_id, granted_by_id, reason)
     SELECT $1, id, $2, 'Playwright explicit platform.admin grant'
     FROM permissions
     WHERE key = 'platform.admin'
     ON CONFLICT (user_id, permission_id) DO NOTHING`,
    [userId, grantedById]
  );
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

async function createTenantOwner(owner: Awaited<ReturnType<typeof loginApi>>) {
  const tenantEmail = uniqueEmail("e2e-owner");
  const companyName = `E2E Tenant ${Date.now()}`;

  const data = await readOk<any>(
    await owner.post("/api/admin/organizations/manual-signup", {
      data: {
        companyName,
        ownerName: "E2E Tenant Owner",
        ownerEmail: tenantEmail,
        password: USER_PASSWORD,
        planId: "starter",
        billingCycle: "monthly",
        contactPhone: "09120000000",
      },
    })
  );

  return { tenantEmail, companyName, organizationId: data.organizationId, ownerUserId: data.ownerUserId };
}

async function createCompanyUser(owner: Awaited<ReturnType<typeof loginApi>>, role: string, prefix: string) {
  const email = uniqueEmail(prefix);
  await readOk(
    await owner.post("/api/users", {
      data: {
        name: `E2E ${role} User`,
        email,
        password: USER_PASSWORD,
        role,
      },
    })
  );
  return email;
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

async function createPublicSignup(context: Awaited<ReturnType<typeof apiContext>>, prefix: string) {
  const ownerEmail = uniqueEmail(prefix);
  const data = await readOk<any>(
    await context.post("/api/signup", {
      data: {
        companyName: `E2E Billing ${Date.now()} ${Math.random().toString(36).slice(2)}`,
        ownerName: "E2E Billing Owner",
        ownerEmail,
        password: USER_PASSWORD,
        planId: "starter",
        billingCycle: "monthly",
        contactPhone: "09120000000",
      },
    })
  );
  return { ...data, ownerEmail };
}

test.describe.serial("security regression harness", () => {
  test("documents the protected API RBAC and tenant-scope policy map", async () => {
    expect(RBAC_TENANT_POLICY.length).toBeGreaterThan(0);
    for (const family of NORMAL_APP_ROUTE_FAMILIES) {
      expect(RBAC_TENANT_POLICY.some((policy) => policy.family === family)).toBe(true);
    }
    expect(RBAC_TENANT_POLICY.some((policy) => policy.family === "rates")).toBe(true);
    expect(
      RBAC_TENANT_POLICY.filter((policy) => policy.auth === "required" && NORMAL_APP_ROUTE_FAMILIES.includes(policy.family))
        .every((policy) => policy.tenantScope === "own-organization")
    ).toBe(true);
    expect(
      RBAC_TENANT_POLICY.filter((policy) => policy.family === "rates" && policy.method === "GET")
        .every((policy) => policy.tenantScope === "global-reference")
    ).toBe(true);
    expect(RBAC_TENANT_POLICY.find((policy) => policy.path === "/api/admin/overview")?.tenantScope).toBe("platform-global");
    expect(RBAC_TENANT_POLICY.filter((policy) => policy.auth === "public").every((policy) => policy.tenantScope === "public-safe")).toBe(true);
  });

  test("redirects protected pages and logs in the seed owner through the UI", async ({ page }) => {
    await page.goto("/customers");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.locator('input[type="email"]')).toBeVisible();

    await loginViaUi(page);

    const auth = await page.evaluate(async () => {
      const response = await fetch("/api/auth/me");
      return {
        status: response.status,
        payload: await response.json(),
      };
    });
    expect(auth.status).toBe(200);
    expect(auth.payload.ok).toBe(true);
    expect(auth.payload.data.user.email).toBe(OWNER_EMAIL);
    expect(auth.payload.data.permissions).toContain("platform.admin");
    const ownerHash = await dbQuery("SELECT password_hash FROM app_users WHERE id = 'u1'");
    expect(ownerHash.rows[0]?.password_hash).toMatch(/^\$2[aby]\$/);
  });

  test("blocks non-admin company users from company management and platform admin APIs", async () => {
    const owner = await loginApi();
    const employeeEmail = await createCompanyUser(owner, "FINANCE", "e2e-finance");

    const adminOverview = await owner.get("/api/admin/overview");
    await readOk(adminOverview);

    const employee = await loginApi(employeeEmail, USER_PASSWORD);
    await expectForbidden(await employee.get("/api/users"));
    await expectForbidden(await employee.get("/api/admin/overview"));
    await expectForbidden(await employee.get("/api/admin/payments"));
    await expectForbidden(await employee.get("/api/admin/billing/invoices"));
    await expectForbidden(await employee.get("/api/admin/sms-deliveries"));
    await expectForbidden(await employee.get("/api/admin/sms-analytics"));
    await expectForbidden(await employee.get("/api/admin/sms-templates"));
    await readOk(await employee.get("/api/shipments"));
    await readOk(await employee.get("/api/documents"));
    await readOk(await employee.get("/api/quotations"));
    await readOk(await employee.get("/api/archive"));

    await disposeContexts(owner, employee);
  });

  test("requires explicit platform.admin grants for platform admin APIs", async () => {
    const publicContext = await apiContext();
    await expectForbidden(await publicContext.get("/api/admin/overview"));

    const owner = await loginApi();
    const ownerAuth = await readOk<any>(await owner.get("/api/auth/me"));
    expect(ownerAuth.permissions).toContain("platform.admin");
    const ownerGrant = await dbQuery(
      `SELECT COUNT(*)::int AS count
       FROM user_permissions up
       JOIN permissions p ON p.id = up.permission_id
       WHERE up.user_id = 'u1'
         AND p.key = 'platform.admin'`
    );
    expect(Number(ownerGrant.rows[0]?.count || 0)).toBeGreaterThan(0);
    await readOk(await owner.get("/api/admin/overview"));

    const tenantInfo = await createTenantOwner(owner);
    const tenant = await loginApi(tenantInfo.tenantEmail, USER_PASSWORD);
    await expectForbidden(await tenant.get("/api/admin/overview"));

    await grantPlatformAdminPermission(tenantInfo.ownerUserId);
    const tenantAuth = await readOk<any>(await tenant.get("/api/auth/me"));
    expect(tenantAuth.permissions).toContain("platform.admin");
    await readOk(await tenant.get("/api/admin/overview"));

    await disposeContexts(publicContext, owner, tenant);
  });

  test("keeps manually created companies isolated from the seed organization", async () => {
    const owner = await loginApi();
    const { tenantEmail } = await createTenantOwner(owner);

    const tenant = await loginApi(tenantEmail, USER_PASSWORD);
    await expectForbidden(await tenant.get("/api/admin/overview"));

    const customers = await readOk<any[]>(await tenant.get("/api/customers"));
    expect(customers).toEqual([]);

    const shipments = await readOk<any[]>(await tenant.get("/api/shipments"));
    expect(shipments).toEqual([]);

    const users = await readOk<any[]>(await tenant.get("/api/users"));
    expect(users.some((user) => user.id === "u1" || user.email === OWNER_EMAIL)).toBe(false);
    expect(users.some((user) => user.email === tenantEmail)).toBe(true);

    await expectUnavailable(await tenant.get("/api/customers/c1"));
    await expectUnavailable(await tenant.post("/api/shipments/s1/customer-access/generate"));

    await disposeContexts(owner, tenant);
  });

  test("scopes direct normal-app record access to the authenticated organization", async () => {
    const owner = await loginApi();
    const { tenantEmail } = await createTenantOwner(owner);
    const tenant = await loginApi(tenantEmail, USER_PASSWORD);

    await readOk(await owner.get("/api/admin/overview"));
    await readOk(await owner.get("/api/customers/c1"));
    await readOk(await owner.get("/api/tasks/t1"));
    await readOk(await owner.get("/api/documents/doc1"));
    await readOk(await owner.get("/api/cheques/chq1"));
    await readOk(await owner.get("/api/compliance-meetings/ap1"));
    await readOk(await owner.get("/api/quotations/q1"));

    await expectUnavailable(await tenant.get("/api/customers/c1"));
    await expectUnavailable(await tenant.patch("/api/customers/c1", { data: { phone: "09129999999" } }));
    await expectUnavailable(await tenant.post("/api/customers/c1/archive"));
    const invalidCustomerCreate = await owner.post("/api/customers", { data: { email: "missing-name@example.test" } });
    expect(invalidCustomerCreate.status(), await invalidCustomerCreate.text()).toBe(400);
    expect((await invalidCustomerCreate.json()).error.code).toBe("VALIDATION_ERROR");
    await expectUnavailable(await tenant.get("/api/tasks/t1"));
    await expectUnavailable(await tenant.patch("/api/tasks/t1", { data: { title: "Cross tenant edit" } }));
    await expectUnavailable(await tenant.post("/api/tasks/t1/complete"));
    await expectUnavailable(await tenant.patch("/api/shipments/s1/steps/step-s1-0", { data: { status: "COMPLETED" } }));
    await expectUnavailable(await tenant.post("/api/shipments/s1/tasks", { data: { title: "Cross tenant task" } }));
    await expectUnavailable(await tenant.patch("/api/shipments/s1/public-status", { data: { publicLabel: "Cross tenant status" } }));
    const invalidPublicStatus = await owner.patch("/api/shipments/s1/public-status", { data: { publicLabel: "" } });
    expect(invalidPublicStatus.status(), await invalidPublicStatus.text()).toBe(400);
    expect((await invalidPublicStatus.json()).error.code).toBe("VALIDATION_ERROR");
    await expectUnavailable(await tenant.get("/api/documents/doc1"));
    await expectUnavailable(await tenant.get("/api/documents/doc1/download"));
    await expectUnavailable(await tenant.patch("/api/documents/doc1", { data: { title: "Cross tenant document" } }));
    await expectUnavailable(await tenant.post("/api/documents/doc1/archive"));
    await expectUnavailable(await tenant.patch("/api/documents/doc1/visibility", { data: { visibility: "customer_visible" } }));
    await expectUnavailable(await tenant.get("/api/cheques/chq1"));
    await expectUnavailable(await tenant.patch("/api/cheques/chq1", { data: { location: "Cross tenant location" } }));
    await expectUnavailable(await tenant.post("/api/cheques/chq1/status", { data: { status: "RETURNED" } }));
    await expectUnavailable(await tenant.post("/api/cheques/chq1/archive"));
    await expectUnavailable(await tenant.get("/api/compliance-meetings/ap1"));
    await expectUnavailable(await tenant.patch("/api/compliance-meetings/ap1", { data: { location: "Cross tenant room" } }));
    await expectUnavailable(await tenant.post("/api/compliance-meetings/ap1/outcome", { data: { outcome: "Cross tenant" } }));
    await expectUnavailable(await tenant.post("/api/compliance-meetings/ap1/cancel"));
    await expectUnavailable(await tenant.post("/api/compliance-meetings/ap1/archive"));
    await expectUnavailable(await tenant.get("/api/quotations/q1"));
    await expectUnavailable(await tenant.patch("/api/quotations/q1", { data: { notes: "Cross tenant quotation" } }));
    await expectUnavailable(await tenant.post("/api/quotations/q1/archive"));
    await expectUnavailable(await tenant.post("/api/quotations/q1/convert-to-shipment"));

    const invalidArchive = await owner.post("/api/archive/not-a-real-entity/q1");
    expect(invalidArchive.status(), await invalidArchive.text()).toBe(400);
    expect((await invalidArchive.json()).error.code).toBe("VALIDATION_ERROR");

    await readOk(await owner.post("/api/archive/quotation/q1"));
    await expectUnavailable(await tenant.get("/api/archive/quotation:q1"));
    await expectUnavailable(await tenant.post("/api/archive/quotation/q1"));
    await expectUnavailable(await tenant.post("/api/archive/quotation/q1/restore"));
    await expectUnavailable(await tenant.delete("/api/archive/quotation/q1"));

    const changes = await readOk<any[]>(await owner.get("/api/changes"));
    expect(changes.length).toBeGreaterThan(0);
    await expectUnavailable(await tenant.get(`/api/changes/${encodeURIComponent(changes[0].id)}`));

    await disposeContexts(owner, tenant);
  });

  test("keeps seeded roles within their granted normal-app permissions", async () => {
    const owner = await loginApi();
    const financeEmail = await createCompanyUser(owner, "FINANCE", "e2e-finance-role");
    const operationsEmail = await createCompanyUser(owner, "OPERATIONS", "e2e-operations-role");

    const finance = await loginApi(financeEmail, USER_PASSWORD);
    await readOk(await finance.get("/api/cheques"));
    await readOk(await finance.get("/api/tasks/my"));
    await readOk(await finance.get("/api/shipments"));
    await readOk(await finance.get("/api/documents"));
    await readOk(await finance.get("/api/quotations"));
    await readOk(await finance.get("/api/compliance-meetings"));
    await expectForbidden(await finance.get("/api/admin/overview"));

    const operations = await loginApi(operationsEmail, USER_PASSWORD);
    await readOk(await operations.get("/api/tasks/my"));
    await readOk(await operations.get("/api/shipments"));
    await readOk(await operations.get("/api/documents"));
    await readOk(await operations.get("/api/quotations"));
    await readOk(await operations.get("/api/compliance-meetings"));
    await expectForbidden(await operations.get("/api/cheques"));
    await expectForbidden(await operations.get("/api/admin/overview"));

    await disposeContexts(owner, finance, operations);
  });

  test("hardens document upload, download, and public document access", async () => {
    const owner = await loginApi();
    await readOk(await owner.post("/api/shipments/s1/customer-access/disable"));
    const tenantInfo = await createTenantOwner(owner);
    const tenant = await loginApi(tenantInfo.tenantEmail, USER_PASSWORD);
    const publicContext = await apiContext();

    const pdfFile = {
      name: "safe-document.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4\n% logisticplus e2e\n"),
    };
    const uploaded = await readOk<any>(
      await uploadDocument(owner, pdfFile, {
        shipmentId: "s1",
        visibility: "customer_visible",
      })
    );
    expect(uploaded.id).toBeTruthy();

    const protectedDownload = await owner.get(`/api/documents/${encodeURIComponent(uploaded.id)}/download`);
    expect(protectedDownload.status(), await protectedDownload.text()).toBeLessThan(400);
    expect(protectedDownload.headers()["x-content-type-options"]).toBe("nosniff");

    await expectUnavailable(await tenant.get(`/api/documents/${encodeURIComponent(uploaded.id)}/download`));
    await expectUnavailable(await publicContext.get(`/api/public/documents/${encodeURIComponent(uploaded.id)}`));

    const blockedExtension = await uploadDocument(owner, {
      name: "not-safe.exe",
      mimeType: "application/pdf",
      buffer: Buffer.from("not really a program"),
    });
    expect(blockedExtension.status(), await blockedExtension.text()).toBe(415);

    const mismatch = await uploadDocument(owner, {
      name: "mismatch.pdf",
      mimeType: "text/plain",
      buffer: Buffer.from("plain text"),
    });
    expect(mismatch.status(), await mismatch.text()).toBe(415);

    const empty = await uploadDocument(owner, {
      name: "empty.txt",
      mimeType: "text/plain",
      buffer: Buffer.alloc(0),
    });
    expect(empty.status(), await empty.text()).toBe(400);

    const invalidMetadata = await uploadDocument(owner, pdfFile, {
      shipmentId: "s1",
      visibility: "public",
    });
    expect(invalidMetadata.status(), await invalidMetadata.text()).toBe(400);
    expect((await invalidMetadata.json()).error.code).toBe("VALIDATION_ERROR");

    const invalidVisibility = await owner.patch(`/api/documents/${encodeURIComponent(uploaded.id)}/visibility`, {
      data: { visibility: "public" },
    });
    expect(invalidVisibility.status(), await invalidVisibility.text()).toBe(400);
    expect((await invalidVisibility.json()).error.code).toBe("VALIDATION_ERROR");

    const crossTenantParent = await uploadDocument(tenant, pdfFile, { shipmentId: "s1" });
    await expectUnavailable(crossTenantParent);

    await disposeContexts(owner, tenant, publicContext);
  });

  test("invalidates sessions on logout and throttles repeated bad logins", async () => {
    const owner = await loginApi();
    await readOk(await owner.get("/api/auth/me"));
    await readOk(await owner.post("/api/auth/logout"));
    const afterLogout = await owner.get("/api/auth/me");
    expect(afterLogout.status(), await afterLogout.text()).toBe(401);

    const expiredContext = await contextWithSessionToken(
      await createRawSession("u1", { expiresAt: new Date(Date.now() - 60_000) })
    );
    const expiredRestore = await expiredContext.get("/api/auth/me");
    expect(expiredRestore.status(), await expiredRestore.text()).toBe(401);

    const revokedContext = await contextWithSessionToken(
      await createRawSession("u1", {
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        revokedAt: new Date(),
      })
    );
    const revokedRestore = await revokedContext.get("/api/auth/me");
    expect(revokedRestore.status(), await revokedRestore.text()).toBe(401);

    const publicContext = await apiContext();
    const badEmail = uniqueEmail("bad-login");
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await publicContext.post("/api/auth/login", {
        data: { email: badEmail, password: "wrong-password" },
      });
      expect(response.status(), await response.text()).toBe(401);
      const payload = await response.json();
      expect(payload.error.code).toBe("INVALID_CREDENTIALS");
      expect(payload.error.message).toBe("Invalid email or password.");
    }
    const limited = await publicContext.post("/api/auth/login", {
      data: { email: badEmail, password: "wrong-password" },
    });
    expect(limited.status(), await limited.text()).toBe(429);
    const payload = await limited.json();
    expect(payload.error.code).toBe("RATE_LIMITED");
    expect(limited.headers()["retry-after"]).toBeTruthy();

    await disposeContexts(owner, expiredContext, revokedContext, publicContext);
  });

  test("supports remember-me cookies and phone SMS login", async () => {
    const rememberedContext = await apiContext();
    const rememberedLogin = await rememberedContext.post("/api/auth/login", {
      data: { email: OWNER_EMAIL, password: OWNER_PASSWORD, remember: true },
    });
    expect(rememberedLogin.status(), await rememberedLogin.text()).toBeLessThan(400);
    const rememberedCookie = rememberedLogin.headers()["set-cookie"] || "";
    expect(rememberedCookie).toContain("HttpOnly");
    expect(rememberedCookie).toContain("SameSite=Lax");
    expect(rememberedCookie).toContain("Path=/");
    expect(rememberedCookie).toContain("Max-Age=");
    expect(rememberedCookie).toContain("Expires=");

    const sessionOnlyContext = await apiContext();
    const sessionOnlyLogin = await sessionOnlyContext.post("/api/auth/login", {
      data: { email: OWNER_EMAIL, password: OWNER_PASSWORD, remember: false },
    });
    expect(sessionOnlyLogin.status(), await sessionOnlyLogin.text()).toBeLessThan(400);
    const sessionOnlyCookie = sessionOnlyLogin.headers()["set-cookie"] || "";
    expect(sessionOnlyCookie).toContain("HttpOnly");
    expect(sessionOnlyCookie).toContain("SameSite=Lax");
    expect(sessionOnlyCookie).toContain("Path=/");
    expect(sessionOnlyCookie).toContain("Max-Age=");
    expect(sessionOnlyCookie).not.toContain("Expires=");

    const phoneContext = await apiContext();
    const requested = await readOk<any>(
      await phoneContext.post("/api/auth/phone/request-code", {
        data: { phone: "۰۹۳۶۵۶۸۳۶۹۴" },
      })
    );
    expect(requested.codeSent).toBe(true);
    expect(requested.debugCode).toMatch(/^\d{6}$/);

    const verified = await phoneContext.post("/api/auth/phone/verify", {
      data: { phone: "09365683694", code: requested.debugCode, remember: true },
    });
    expect(verified.status(), await verified.text()).toBeLessThan(400);
    const payload = await verified.json();
    expect(payload.user.email).toBe(OWNER_EMAIL);
    await readOk(await phoneContext.get("/api/auth/me"));

    await disposeContexts(rememberedContext, sessionOnlyContext, phoneContext);
  });

  test("keeps sandbox billing and Zarinpal payment state deterministic", async () => {
    const owner = await loginApi();
    const publicContext = await apiContext();

    const paidSignup = await createPublicSignup(publicContext, "paid-billing");
    const started = await readOk<any>(
      await publicContext.post(`/api/billing/payments/${encodeURIComponent(paidSignup.paymentId)}/start`)
    );
    expect(started.authority).toContain(`SANDBOX-${paidSignup.paymentId}`);
    expect(started.gatewayUrl).toContain("/api/billing/zarinpal/callback");

    const paidCallback = await publicContext.get(
      `/api/billing/zarinpal/callback?Authority=${encodeURIComponent(started.authority)}&Status=OK`,
      { maxRedirects: 0 }
    );
    expect(paidCallback.status()).toBe(302);
    expect(paidCallback.headers().location).toContain("payment=paid");

    const paidInvoice = await readOk<any>(
      await owner.get(`/api/admin/billing/invoices/${encodeURIComponent(paidSignup.invoiceId)}`)
    );
    expect(paidInvoice.status).toBe("paid");
    expect(paidInvoice.receipt?.paymentId).toBe(paidSignup.paymentId);

    const replayPaidCallback = await publicContext.get(
      `/api/billing/zarinpal/callback?Authority=${encodeURIComponent(started.authority)}&Status=OK`,
      { maxRedirects: 0 }
    );
    expect(replayPaidCallback.status()).toBe(302);
    expect(replayPaidCallback.headers().location).toContain("payment=paid");
    const replayPaidInvoice = await readOk<any>(
      await owner.get(`/api/admin/billing/invoices/${encodeURIComponent(paidSignup.invoiceId)}`)
    );
    expect(replayPaidInvoice.status).toBe("paid");
    expect(replayPaidInvoice.receipt?.id).toBe(paidInvoice.receipt?.id);

    const paidPayments = await readOk<any[]>(await owner.get("/api/admin/payments"));
    const paidPayment = paidPayments.find((payment) => payment.id === paidSignup.paymentId);
    expect(paidPayment?.status).toBe("paid");
    expect(paidPayment?.receiptId).toBeTruthy();

    const paidRequests = await readOk<any[]>(await owner.get("/api/admin/signup-requests"));
    const paidRequest = paidRequests.find((request) => request.id === paidSignup.signupRequestId);
    expect(paidRequest?.status).toBe("pending_review");
    expect(paidRequest?.paymentStatus).toBe("paid");
    expect(paidRequest?.organizationStatus).toBe("pending_review");
    expect(paidRequest?.abandonedCleanupEligible).toBe(false);

    const blockedPaidCleanup = await owner.delete(`/api/admin/signup-requests/${encodeURIComponent(paidSignup.signupRequestId)}/abandoned`);
    expect(blockedPaidCleanup.status(), await blockedPaidCleanup.text()).toBe(409);

    const duplicatePaidSignup = await publicContext.post("/api/signup", {
      data: {
        companyName: "E2E Duplicate Paid",
        ownerName: "E2E Billing Owner",
        ownerEmail: paidSignup.ownerEmail,
        password: USER_PASSWORD,
        planId: "starter",
        billingCycle: "monthly",
        contactPhone: "09120000000",
      },
    });
    expect(duplicatePaidSignup.status(), await duplicatePaidSignup.text()).toBe(409);

    const paidOrg = await readOk<any>(
      await owner.get(`/api/admin/organizations/${encodeURIComponent(paidSignup.organizationId)}`)
    );
    expect(paidOrg.status).toBe("pending_review");
    expect(paidOrg.subscription.status).toBe("pending_review");

    const restartPaid = await publicContext.post(`/api/billing/payments/${encodeURIComponent(paidSignup.paymentId)}/start`);
    expect(restartPaid.status(), await restartPaid.text()).toBe(409);

    const noStartSignup = await createPublicSignup(publicContext, "nostart-billing");
    const noStartRetry = await readOk<any>(
      await publicContext.post("/api/signup", {
        data: {
          companyName: "E2E No Start Retry",
          ownerName: "E2E No Start Retry Owner",
          ownerEmail: noStartSignup.ownerEmail,
          password: USER_PASSWORD,
          planId: "starter",
          billingCycle: "monthly",
          contactPhone: "09120000000",
        },
      })
    );
    expect(noStartRetry.signupRequestId).toBe(noStartSignup.signupRequestId);
    expect(noStartRetry.paymentId).not.toBe(noStartSignup.paymentId);

    const cleanupRequests = await readOk<any[]>(await owner.get("/api/admin/signup-requests"));
    const cleanupRequest = cleanupRequests.find((request) => request.id === noStartSignup.signupRequestId);
    expect(cleanupRequest?.abandonedCleanupEligible).toBe(true);
    const cleaned = await readOk<any>(
      await owner.delete(`/api/admin/signup-requests/${encodeURIComponent(noStartSignup.signupRequestId)}/abandoned`)
    );
    expect(cleaned.deleted).toBe(true);
    expect(cleaned.releasedEmail).toBe(noStartSignup.ownerEmail);
    const afterCleanupSignup = await readOk<any>(
      await publicContext.post("/api/signup", {
        data: {
          companyName: "E2E Cleanup Reuse",
          ownerName: "E2E Cleanup Reuse Owner",
          ownerEmail: noStartSignup.ownerEmail,
          password: USER_PASSWORD,
          planId: "starter",
          billingCycle: "monthly",
          contactPhone: "09120000000",
        },
      })
    );
    expect(afterCleanupSignup.signupRequestId).not.toBe(noStartSignup.signupRequestId);

    const startedNoCallbackSignup = await createPublicSignup(publicContext, "started-nocallback");
    await readOk<any>(
      await publicContext.post(`/api/billing/payments/${encodeURIComponent(startedNoCallbackSignup.paymentId)}/start`)
    );
    const startedNoCallbackRetry = await readOk<any>(
      await publicContext.post("/api/signup", {
        data: {
          companyName: "E2E Started No Callback Retry",
          ownerName: "E2E Started Retry Owner",
          ownerEmail: startedNoCallbackSignup.ownerEmail,
          password: USER_PASSWORD,
          planId: "starter",
          billingCycle: "monthly",
          contactPhone: "09120000000",
        },
      })
    );
    expect(startedNoCallbackRetry.signupRequestId).toBe(startedNoCallbackSignup.signupRequestId);
    expect(startedNoCallbackRetry.paymentId).not.toBe(startedNoCallbackSignup.paymentId);

    const failedSignup = await createPublicSignup(publicContext, "failed-billing");
    const failedStart = await readOk<any>(
      await publicContext.post(`/api/billing/payments/${encodeURIComponent(failedSignup.paymentId)}/start`)
    );
    const failedCallback = await publicContext.get(
      `/api/billing/zarinpal/callback?Authority=${encodeURIComponent(failedStart.authority)}&Status=NOK`,
      { maxRedirects: 0 }
    );
    expect(failedCallback.status()).toBe(302);
    expect(failedCallback.headers().location).toContain("payment=failed");

    const failedInvoice = await readOk<any>(
      await owner.get(`/api/admin/billing/invoices/${encodeURIComponent(failedSignup.invoiceId)}`)
    );
    expect(failedInvoice.status).toBe("issued");
    expect(failedInvoice.receipt).toBeNull();

    const failedPayments = await readOk<any[]>(await owner.get("/api/admin/payments"));
    const failedPayment = failedPayments.find((payment) => payment.id === failedSignup.paymentId);
    expect(failedPayment?.status).toBe("failed");
    expect(failedPayment?.receiptId).toBeFalsy();

    const failedRequests = await readOk<any[]>(await owner.get("/api/admin/signup-requests"));
    const failedRequest = failedRequests.find((request) => request.id === failedSignup.signupRequestId);
    expect(failedRequest?.status).toBe("payment_failed");
    expect(failedRequest?.paymentStatus).toBe("failed");
    expect(failedRequest?.organizationStatus).toBe("payment_failed");

    const retrySignup = await readOk<any>(
      await publicContext.post("/api/signup", {
        data: {
          companyName: "E2E Billing Retry",
          ownerName: "E2E Billing Retry Owner",
          ownerEmail: failedSignup.ownerEmail,
          password: USER_PASSWORD,
          planId: "starter",
          billingCycle: "monthly",
          contactPhone: "09120000000",
        },
      })
    );
    expect(retrySignup.signupRequestId).toBe(failedSignup.signupRequestId);
    expect(retrySignup.paymentId).not.toBe(failedSignup.paymentId);

    const retryPayments = await readOk<any[]>(await owner.get("/api/admin/payments"));
    expect(retryPayments.find((payment) => payment.id === failedSignup.paymentId)?.status).toBe("superseded");
    expect(retryPayments.find((payment) => payment.id === retrySignup.paymentId)?.status).toBe("pending");

    await disposeContexts(owner, publicContext);
  });

  test("guards company and platform user management actions by tenant and deletion blockers", async () => {
    const owner = await loginApi();
    const tenantInfo = await createTenantOwner(owner);
    const otherTenantInfo = await createTenantOwner(owner);
    const tenant = await loginApi(tenantInfo.tenantEmail, USER_PASSWORD);

    const employeeEmail = uniqueEmail("managed-user");
    const created = await readOk<any>(
      await tenant.post("/api/users", {
        data: {
          name: "Managed User",
          email: employeeEmail,
          password: USER_PASSWORD,
          role: "OPERATIONS",
        },
      })
    );

    await readOk(await tenant.post(`/api/users/${created.id}/password`, { data: { password: "ChangedPass123!" } }));
    const suspended = await readOk<any>(await tenant.post(`/api/users/${created.id}/suspend`));
    expect(suspended.status).toBe("suspended");

    const preview = await readOk<any>(await tenant.get(`/api/users/${created.id}/delete-preview`));
    expect(preview.canDelete).toBe(true);
    await readOk(await tenant.delete(`/api/users/${created.id}`));
    const usersAfterDelete = await readOk<any[]>(await tenant.get("/api/users"));
    expect(usersAfterDelete.some((user) => user.id === created.id)).toBe(false);

    const otherOwner = await loginApi(otherTenantInfo.tenantEmail, USER_PASSWORD);
    const otherUsers = await readOk<any[]>(await otherOwner.get("/api/users"));
    await expectUnavailable(await tenant.get(`/api/users/${otherUsers[0].id}`));

    const platformUser = await readOk<any>(
      await otherOwner.post("/api/users", {
        data: {
          name: "Platform Managed User",
          email: uniqueEmail("platform-managed-user"),
          password: USER_PASSWORD,
          role: "FINANCE",
        },
      })
    );
    const adminUsers = await readOk<any[]>(
      await owner.get(`/api/admin/organizations/${otherTenantInfo.organizationId}/users`)
    );
    expect(adminUsers.some((user) => user.id === platformUser.id)).toBe(true);
    const updatedByAdmin = await readOk<any>(
      await owner.patch(`/api/admin/organizations/${otherTenantInfo.organizationId}/users/${platformUser.id}`, {
        data: { role: "MANAGER" },
      })
    );
    expect(updatedByAdmin.role).toBe("MANAGER");
    await readOk(await owner.post(`/api/admin/organizations/${otherTenantInfo.organizationId}/users/${platformUser.id}/password`, { data: { password: "AdminPass123!" } }));
    await readOk(await owner.post(`/api/admin/organizations/${otherTenantInfo.organizationId}/users/${platformUser.id}/suspend`));
    const adminPreview = await readOk<any>(
      await owner.get(`/api/admin/organizations/${otherTenantInfo.organizationId}/users/${platformUser.id}/delete-preview`)
    );
    expect(adminPreview.canDelete).toBe(true);
    await readOk(await owner.delete(`/api/admin/organizations/${otherTenantInfo.organizationId}/users/${platformUser.id}`));

    const selfPreview = await readOk<any>(await otherOwner.get(`/api/users/${otherUsers[0].id}/delete-preview`));
    expect(selfPreview.canDelete).toBe(false);
    expect(selfPreview.blockers.some((blocker: any) => blocker.code === "SELF_DELETE_BLOCKED")).toBe(true);

    await disposeContexts(owner, tenant, otherOwner);
  });

  test("scopes company billing views to the authenticated organization", async () => {
    const owner = await loginApi();
    const tenantInfo = await createTenantOwner(owner);
    const invoice = await readOk<any>(
      await owner.post("/api/admin/billing/invoices", {
        data: {
          organizationId: tenantInfo.organizationId,
          amountIrr: 123456,
          description: "E2E tenant invoice",
        },
      })
    );

    const tenant = await loginApi(tenantInfo.tenantEmail, USER_PASSWORD);
    const invoices = await readOk<any[]>(await tenant.get("/api/billing/my-invoices"));
    expect(invoices.some((item) => item.id === invoice.id)).toBe(true);
    expect(invoices.every((item) => item.organizationId === tenantInfo.organizationId)).toBe(true);

    const payments = await readOk<any[]>(await tenant.get("/api/billing/my-payments"));
    expect(payments.every((item) => item.organizationId === tenantInfo.organizationId)).toBe(true);
    await expectForbidden(await tenant.get("/api/admin/billing/invoices"));

    await disposeContexts(owner, tenant);
  });

  test("serves public tracking through a customer-safe payload only", async ({ page }) => {
    await resetRateLimitBuckets();
    await page.goto("/track/not-a-real-token-for-playwright-tests");
    await expect(page.locator('a[href="/track/search"]')).toHaveCount(0);

    const owner = await loginApi();
    const publicContext = await apiContext();
    const visibleDocument = await readOk<any>(
      await uploadDocument(owner, {
        name: "tracking-visible.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("customer visible tracking document"),
      }, {
        shipmentId: "s1",
        visibility: "customer_visible",
      })
    );
    const internalDocument = await readOk<any>(
      await uploadDocument(owner, {
        name: "tracking-internal.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("internal tracking document"),
      }, {
        shipmentId: "s1",
        visibility: "internal",
      })
    );

    const access = await readOk<{ token: string }>(
      await owner.post("/api/shipments/s1/customer-access/generate")
    );
    expect(access.token).toMatch(/^[A-Za-z0-9_-]{32,}$/);

    const persistedAccess = await readOk<{ token: string; url: string }>(
      await owner.get("/api/shipments/s1/customer-access")
    );
    expect(persistedAccess.token).toBe(access.token);
    expect(persistedAccess.url).toContain(encodeURIComponent(access.token));

    const byToken = await readOk<any>(
      await publicContext.get(`/api/public/track/${encodeURIComponent(access.token)}`)
    );
    expect(byToken.shipment.code).toBe("LS-9801");
    const visiblePublicDocument = byToken.documents.find((document: any) => document.id === visibleDocument.id);
    expect(visiblePublicDocument).toBeTruthy();
    expect(byToken.documents.some((document: any) => document.id === internalDocument.id)).toBe(false);
    expectPublicTrackingPayloadIsSafe(byToken);

    const publicDocument = await publicContext.get(visiblePublicDocument.downloadUrl);
    expect(publicDocument.status(), await publicDocument.text()).toBeLessThan(400);
    expect(publicDocument.headers()["x-content-type-options"]).toBe("nosniff");
    await expectUnavailable(await publicContext.get(`/api/public/documents/${encodeURIComponent(visibleDocument.id)}`));
    await expectUnavailable(
      await publicContext.get(`/api/public/track/${encodeURIComponent(access.token)}/documents/${encodeURIComponent(internalDocument.id)}`)
    );

    const tokenDocument = await publicContext.get(
      `/api/public/track/${encodeURIComponent(access.token)}/documents/${encodeURIComponent(visibleDocument.id)}`
    );
    expect(tokenDocument.status(), await tokenDocument.text()).toBeLessThan(400);

    const tenantInfo = await createTenantOwner(owner);
    const tenantShipmentId = crypto.randomUUID();
    const tenantDocumentId = crypto.randomUUID();
    await dbQuery(
      `INSERT INTO shipments (id, organization_id, owner_user_id, shipment_code, customer_name, status, origin, destination)
       VALUES ($1, $2, $3, $4, 'Tenant customer', 'IN_TRANSIT', 'Tehran', 'Dubai')`,
      [tenantShipmentId, tenantInfo.organizationId, tenantInfo.ownerUserId, `TENANT-${Date.now()}`]
    );
    await dbQuery(
      `INSERT INTO documents (
         id, organization_id, owner_user_id, title, file_name, mime_type, file_size, shipment_id, visibility
       )
       VALUES ($1, $2, $3, 'Tenant public document', 'tenant-public.txt', 'text/plain', '1 B', $4, 'customer_visible')`,
      [tenantDocumentId, tenantInfo.organizationId, tenantInfo.ownerUserId, tenantShipmentId]
    );
    await expectUnavailable(
      await publicContext.get(`/api/public/track/${encodeURIComponent(access.token)}/documents/${encodeURIComponent(tenantDocumentId)}`)
    );

    const resetAccess = await readOk<{ token: string }>(
      await owner.post("/api/shipments/s1/customer-access/reset")
    );
    expect(resetAccess.token).toMatch(/^[A-Za-z0-9_-]{32,}$/);
    expect(resetAccess.token).not.toBe(access.token);
    await expectUnavailable(await publicContext.get(`/api/public/track/${encodeURIComponent(access.token)}`));
    const byResetToken = await readOk<any>(
      await publicContext.get(`/api/public/track/${encodeURIComponent(resetAccess.token)}`)
    );
    expect(byResetToken.shipment.code).toBe("LS-9801");

    const removedSearch = await publicContext.post("/api/public/track/search", {
      data: {
        shipmentCode: "LS-9801",
        verification: "info@arian.com",
      },
    });
    expect(removedSearch.status()).toBe(404);

    await expectUnavailable(await publicContext.get("/api/public/documents/doc1"));

    await disposeContexts(owner, publicContext);
  });

  test("uses the shared PostgreSQL limiter for production-sensitive throttles", async () => {
    await resetRateLimitBuckets();
    const owner = await loginApi();
    const publicContext = await apiContext();

    const rateLimitedPayment = await createPublicSignup(publicContext, "rate-payment");
    let limitedPaymentStart = null;
    for (let attempt = 0; attempt < 13; attempt += 1) {
      const response = await publicContext.post(
        `/api/billing/payments/${encodeURIComponent(rateLimitedPayment.paymentId)}/start`
      );
      if (response.status() === 429) {
        limitedPaymentStart = response;
        break;
      }
      await readOk(response);
    }
    expect(limitedPaymentStart, "payment start should be throttled").not.toBeNull();
    expect(limitedPaymentStart!.headers()["retry-after"]).toBeTruthy();

    let limitedDocumentUpload = null;
    for (let attempt = 0; attempt < 21; attempt += 1) {
      const response = await uploadDocument(owner, {
        name: `rate-document-${attempt}.txt`,
        mimeType: "text/plain",
        buffer: Buffer.from(`rate limit document ${attempt}`),
      });
      if (response.status() === 429) {
        limitedDocumentUpload = response;
        break;
      }
      await readOk(response);
    }
    expect(limitedDocumentUpload, "document upload should be throttled").not.toBeNull();
    expect(limitedDocumentUpload!.headers()["retry-after"]).toBeTruthy();

    let limitedSignup = null;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const response = await publicContext.post("/api/signup", {
        data: {
          companyName: `E2E Limited Signup ${Date.now()} ${attempt}`,
          ownerName: "E2E Limited Owner",
          ownerEmail: uniqueEmail(`limited-signup-${attempt}`),
          password: USER_PASSWORD,
          planId: "starter",
          billingCycle: "monthly",
          contactPhone: "09120000000",
        },
      });
      if (response.status() === 429) {
        limitedSignup = response;
        break;
      }
      await readOk(response);
    }
    expect(limitedSignup, "public signup should be throttled").not.toBeNull();
    expect(limitedSignup!.headers()["retry-after"]).toBeTruthy();

    await resetRateLimitBuckets();
    await disposeContexts(owner, publicContext);
  });
});
