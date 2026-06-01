import { expect, test } from "@playwright/test";
import {
  USER_PASSWORD,
  disposeContexts,
  expectUnavailable,
  loginApi,
  readOk,
  uniqueEmail,
} from "./helpers";

async function createTenantOwner(owner: Awaited<ReturnType<typeof loginApi>>) {
  const tenantEmail = uniqueEmail("phase1-tenant-owner");
  const companyName = `Phase 1 Tenant ${Date.now()}`;
  const data = await readOk<any>(
    await owner.post("/api/admin/organizations/manual-signup", {
      data: {
        companyName,
        ownerName: "Phase 1 Tenant Owner",
        ownerEmail: tenantEmail,
        password: USER_PASSWORD,
        planId: "starter",
        billingCycle: "monthly",
        contactPhone: "09120000000",
      },
    })
  );
  return { tenantEmail, companyName, organizationId: data.organizationId };
}

test.describe.serial("phase 1 tenant isolation hardening", () => {
  test("derives normal tenant scope from the session and ignores client organization ids", async () => {
    const owner = await loginApi();
    const tenantInfo = await createTenantOwner(owner);
    const tenant = await loginApi(tenantInfo.tenantEmail, USER_PASSWORD);

    const spoofedOwnerOrgId = "org-logisticplus-default";
    const createdTenantCustomer = await readOk<any>(
      await tenant.post("/api/customers", {
        data: {
          name: "Phase 1 tenant scoped customer",
          company: "Phase 1 Tenant Customer Co",
          email: uniqueEmail("phase1-tenant-customer"),
          organizationId: spoofedOwnerOrgId,
          orgId: spoofedOwnerOrgId,
          companyId: spoofedOwnerOrgId,
        },
      })
    );
    expect(createdTenantCustomer.organization_id).toBe(tenantInfo.organizationId);
    expect(createdTenantCustomer.organization_id).not.toBe(spoofedOwnerOrgId);

    const spoofedTenantCustomers = await readOk<any[]>(
      await tenant.get(`/api/customers?organizationId=${encodeURIComponent(spoofedOwnerOrgId)}`)
    );
    expect(spoofedTenantCustomers.some((customer) => customer.id === "c1")).toBe(false);
    expect(spoofedTenantCustomers.some((customer) => customer.id === createdTenantCustomer.id)).toBe(true);

    const ownerCustomers = await readOk<any[]>(await owner.get("/api/customers"));
    expect(ownerCustomers.some((customer) => customer.id === createdTenantCustomer.id)).toBe(false);

    await expectUnavailable(await tenant.get("/api/customers/c1"));
    await expectUnavailable(await tenant.get("/api/shipments/s1/customer-access"));
    await expectUnavailable(await tenant.post("/api/archive/shipment/s1"));
    await expectUnavailable(await tenant.get("/api/documents/doc1"));
    await expectUnavailable(await tenant.get("/api/tasks/t1"));

    const spoofedTasks = await readOk<any[]>(
      await tenant.get(`/api/tasks?organizationId=${encodeURIComponent(spoofedOwnerOrgId)}`)
    );
    expect(spoofedTasks.some((task) => task.id === "t1")).toBe(false);

    const spoofedDocuments = await readOk<any[]>(
      await tenant.get(`/api/documents?organizationId=${encodeURIComponent(spoofedOwnerOrgId)}`)
    );
    expect(spoofedDocuments.some((document) => document.id === "doc1")).toBe(false);

    const adminOrg = await readOk<any>(
      await owner.get(`/api/admin/organizations/${encodeURIComponent(tenantInfo.organizationId)}`)
    );
    expect(adminOrg.id).toBe(tenantInfo.organizationId);

    await disposeContexts(owner, tenant);
  });
});
