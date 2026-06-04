import { expect, test } from "@playwright/test";
import pg from "pg";
import {
  USER_PASSWORD,
  apiContext,
  disposeContexts,
  expectPublicTrackingPayloadIsSafe,
  expectUnavailable,
  loginApi,
  readOk,
  uniqueEmail,
} from "./helpers";

const { Client } = pg;
const testDatabaseUrl = process.env.TEST_DATABASE_URL || "postgres://postgres@localhost:5432/logisticplus_test";
const ownerOrganizationId = "org-logisticplus-default";
const ownerUserId = "u1";

async function dbQuery(sql: string, params: any[] = []) {
  const client = new Client({ connectionString: testDatabaseUrl });
  await client.connect();
  try {
    return await client.query(sql, params);
  } finally {
    await client.end();
  }
}

async function createTenantOwner(owner: Awaited<ReturnType<typeof loginApi>>) {
  const tenantEmail = uniqueEmail("business-entities-tenant-owner");
  const data = await readOk<any>(
    await owner.post("/api/admin/organizations/manual-signup", {
      data: {
        companyName: `Business Entity Tenant ${Date.now()}`,
        ownerName: "Business Entity Tenant Owner",
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

async function insertCommercialCard({ id, holderName }: { id: string; holderName: string }) {
  await dbQuery(
    `INSERT INTO user_records (owner_user_id, organization_id, collection, item_id, data, updated_at)
     VALUES ($1, $2, 'commercialCards', $3, $4::jsonb, NOW())
     ON CONFLICT (owner_user_id, collection, item_id)
     DO UPDATE SET organization_id = EXCLUDED.organization_id, data = EXCLUDED.data, updated_at = NOW()`,
    [
      ownerUserId,
      ownerOrganizationId,
      id,
      JSON.stringify({
        id,
        holderName,
        cardNumber: `CARD-${id.slice(-8)}`,
        issueDate: "2026-01-01",
        expirationDate: "2027-01-01",
        documents: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
    ]
  );
}

test("business entity APIs validate contacts, preserve tenant isolation, audit safely, and avoid public tracking leaks", async () => {
  const suffix = Date.now();
  const owner = await loginApi();
  const tenantInfo = await createTenantOwner(owner);
  const tenant = await loginApi(tenantInfo.tenantEmail, USER_PASSWORD);
  const publicContext = await apiContext();

  const malvani = await readOk<any>(
    await owner.post("/api/malvani-profiles", {
      data: {
        displayName: `ملوانی API ${suffix}`,
        captainName: `ناخدا API ${suffix}`,
        lenjName: `لنج API ${suffix}`,
        lenjRegistrationNumber: `LENJ-API-${suffix}`,
        lenjType: "باری",
        homePort: "بندر بوشهر",
        activeStatus: "ACTIVE",
        note: "یادداشت خصوصی API",
      },
    })
  );
  expect(malvani.id).toBeTruthy();

  const invalidPhone = await owner.post("/api/business-entity-contacts", {
    data: {
      entityType: "malvani",
      entityId: malvani.id,
      contactName: "شماره نامعتبر",
      roleTitle: "ناخدا",
      phoneNumber: "abc",
    },
  });
  expect(invalidPhone.status(), await invalidPhone.text()).toBe(400);
  expect((await invalidPhone.json()).error.field).toBe("phoneNumber");

  const malvaniContact = await readOk<any>(
    await owner.post("/api/business-entity-contacts", {
      data: {
        entityType: "malvani",
        entityId: malvani.id,
        contactName: `مخاطب API ${suffix}`,
        roleTitle: "ناخدا",
        phoneNumber: "۰۹۱۲۳۴۵۶۷۸۹",
        phoneLabel: "واتساپ",
        note: "شماره خصوصی واتساپ",
        isPrimary: true,
      },
    })
  );
  expect(malvaniContact.phoneNumber).toBe("09123456789");
  expect(malvaniContact.isPrimary).toBe(true);

  const updatedContact = await readOk<any>(
    await owner.patch(`/api/business-entity-contacts/${encodeURIComponent(malvaniContact.id)}`, {
      data: {
        phoneLabel: "اضطراری",
        isPrimary: false,
      },
    })
  );
  expect(updatedContact.phoneLabel).toBe("اضطراری");
  expect(updatedContact.isPrimary).toBe(false);

  const cardId = `api-card-${suffix}`;
  await insertCommercialCard({ id: cardId, holderName: `کارت API ${suffix}` });
  const commercialContact = await readOk<any>(
    await owner.post("/api/business-entity-contacts", {
      data: {
        entityType: "commercial_card",
        entityId: cardId,
        contactName: `مخاطب کارت ${suffix}`,
        roleTitle: "مسئول",
        phoneNumber: "09129998877",
        phoneLabel: "دفتر",
      },
    })
  );
  expect(commercialContact.entityType).toBe("commercial_card");

  await expectUnavailable(await tenant.get(`/api/malvani-profiles/${encodeURIComponent(malvani.id)}`));
  await expectUnavailable(
    await tenant.get(`/api/business-entity-contacts?entityType=malvani&entityId=${encodeURIComponent(malvani.id)}`)
  );
  await expectUnavailable(await tenant.patch(`/api/business-entity-contacts/${encodeURIComponent(malvaniContact.id)}`, {
    data: { phoneLabel: "tenant attack" },
  }));

  const spoofedTenant = await owner.post("/api/malvani-profiles", {
    data: {
      organizationId: tenantInfo.organizationId,
      displayName: "Spoofed tenant",
      captainName: "Spoofed",
      lenjName: "Spoofed",
      lenjRegistrationNumber: "SPOOFED",
    },
  });
  expect([400, 403]).toContain(spoofedTenant.status());

  await readOk(await owner.delete(`/api/business-entity-contacts/${encodeURIComponent(malvaniContact.id)}`));
  const contactsAfterArchive = await readOk<any[]>(
    await owner.get(`/api/business-entity-contacts?entityType=malvani&entityId=${encodeURIComponent(malvani.id)}`)
  );
  expect(contactsAfterArchive.some((contact) => contact.id === malvaniContact.id)).toBe(false);

  await readOk(await owner.delete(`/api/malvani-profiles/${encodeURIComponent(malvani.id)}`));
  await expectUnavailable(await owner.get(`/api/malvani-profiles/${encodeURIComponent(malvani.id)}`));

  const auditRows = await dbQuery(
    `SELECT event_type, before_json::text AS before_json, after_json::text AS after_json, metadata_json::text AS metadata_json
     FROM audit_logs
     WHERE event_type IN (
       'malvani_profile.create',
       'malvani_profile.update',
       'malvani_profile.archive',
       'business_entity_contact.create',
       'business_entity_contact.update',
       'business_entity_contact.archive'
     )
       AND organization_id = $1
     ORDER BY created_at DESC
     LIMIT 30`,
    [ownerOrganizationId]
  );
  expect(auditRows.rows.length).toBeGreaterThanOrEqual(4);
  const auditSerialized = JSON.stringify(auditRows.rows);
  expect(auditSerialized).not.toContain("09123456789");
  expect(auditSerialized).not.toContain("شماره خصوصی واتساپ");

  const access = await readOk<{ token: string }>(await owner.post("/api/shipments/s1/customer-access/generate"));
  const publicPayload = await readOk<any>(await publicContext.get(`/api/public/track/${encodeURIComponent(access.token)}`));
  expectPublicTrackingPayloadIsSafe(publicPayload);
  const publicSerialized = JSON.stringify(publicPayload);
  expect(publicSerialized).not.toContain(`ملوانی API ${suffix}`);
  expect(publicSerialized).not.toContain("09123456789");
  expect(publicSerialized).not.toContain(`مخاطب API ${suffix}`);

  await owner.post("/api/shipments/s1/customer-access/disable").catch(() => null);
  await disposeContexts(owner, tenant, publicContext);
});
