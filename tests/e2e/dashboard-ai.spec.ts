import { expect, test } from "@playwright/test";
import {
  USER_PASSWORD,
  apiContext,
  disposeContexts,
  loginApi,
  loginViaUi,
  readOk,
  uniqueEmail,
} from "./helpers";

type DashboardPayload = {
  currentUser: { id: string; name: string; role: string };
  metrics: Array<{ key: string; label: string; value: number; actionUrl?: string | null }>;
  myActiveTasks: Array<{ id: string; title: string; status: string; actionUrl: string }>;
  lastUpdatedShipments: Array<{ id: string; shipmentCode: string; actionUrl: string }>;
  aiAssistant: { name: string; status: string; subtitle: string };
};

type AiChatPayload = {
  id: string;
  assistantName: string;
  status: string;
  answer: string;
  tone: "direct" | "conversational" | "clarification";
  responseMode: "direct_answer" | "short_summary" | "report";
  activeEntity?: { type: "shipment" | "customer"; id: string; code?: string; label?: string };
  suggestions: string[];
  sources: Array<{ type: string; id?: string; label: string; url?: string }>;
  createdAt: string;
};

const AI_UNSAFE_RESPONSE_MARKERS = [
  "organization_id",
  "organizationid",
  "legacy_data",
  "storage_key",
  "storagekey",
  "object_key",
  "objectkey",
  "storage_bucket",
  "bucket",
  "password",
  "password_hash",
  "token_hash",
  "sessiontoken",
  "llm_api_key",
  "sk-",
];

async function createTenantOwner(owner: Awaited<ReturnType<typeof loginApi>>) {
  const tenantEmail = uniqueEmail("dashboard-tenant");
  const companyName = `Dashboard Tenant ${Date.now()}`;
  const data = await readOk<any>(
    await owner.post("/api/admin/organizations/manual-signup", {
      data: {
        companyName,
        ownerName: "Dashboard Tenant Owner",
        ownerEmail: tenantEmail,
        password: USER_PASSWORD,
        planId: "starter",
        billingCycle: "monthly",
        contactPhone: "09120000000",
      },
    })
  );
  return { tenantEmail, organizationId: data.organizationId, ownerUserId: data.ownerUserId };
}

async function createCompanyUser(owner: Awaited<ReturnType<typeof loginApi>>, role: string, prefix: string) {
  const email = uniqueEmail(prefix);
  const user = await readOk<any>(
    await owner.post("/api/users", {
      data: {
        name: `Dashboard ${role} User`,
        email,
        password: USER_PASSWORD,
        role,
      },
    })
  );
  return { email, user };
}

async function createAiCustomer(context: Awaited<ReturnType<typeof loginApi>>, marker: string) {
  const customerCode = `${marker}-CUS`.toUpperCase();
  return readOk<any>(
    await context.post("/api/customers", {
      data: {
        customerCode,
        name: `${marker} Contact`,
        contactName: `${marker} Contact`,
        company: `${marker} Company`,
        companyName: `${marker} Company`,
        email: `${marker.toLowerCase()}@example.test`,
        phone: "09121112233",
        phoneNumbers: [
          { phoneNumber: "09121112233", phoneLabel: "CEO", isPrimary: true },
          { phoneNumber: "09121112234", phoneLabel: "Finance", isPrimary: false },
        ],
        address: `${marker} Address`,
        notes: `${marker} CEO note`,
      },
    })
  );
}

async function createAiShipmentFixture(context: Awaited<ReturnType<typeof loginApi>>, marker: string) {
  const customer = await createAiCustomer(context, marker);
  const malvani = await readOk<any>(
    await context.post("/api/malvani-profiles", {
      data: {
        displayName: `${marker} Malvani`,
        captainName: `${marker} Captain`,
        lenjName: `${marker} Lenj`,
        lenjRegistrationNumber: `LENJ-${marker}`,
        lenjType: "باری",
        homePort: "بندر بوشهر",
        activeStatus: "ACTIVE",
        note: `${marker} private malvani note`,
      },
    })
  );
  const contact = await readOk<any>(
    await context.post("/api/business-entity-contacts", {
      data: {
        entityType: "malvani",
        entityId: malvani.id,
        contactName: `${marker} Captain Contact`,
        roleTitle: "Captain",
        phoneNumber: "09129876543",
        phoneLabel: "Primary",
        note: `${marker} contact note`,
        isPrimary: true,
        sortOrder: 1,
      },
    })
  );
  const created = await readOk<any>(
    await context.post("/api/shipments/v2", {
      data: {
        flowCode: "IMPORT_LANJ",
        customerId: customer.id,
        origin: "Jebel Ali",
        dischargePort: "Bandar Abbas",
        deliveryPort: "Tehran",
        consigneeName: `${marker} Consignee`,
        lenjType: "MALVANI",
        goodsRows: [
          {
            description: `${marker} machinery parts`,
            packagingType: "Pallet",
            quantity: 4,
            weight: 120,
            cbm: 2.5,
            pcs: 9,
          },
        ],
      },
    })
  );
  const base = created.profile.sections.base || {};
  const updated = await readOk<any>(
    await context.patch(`/api/shipments/${encodeURIComponent(created.shipment.id)}/v2-profile/sections/base`, {
      data: {
        ...base,
        trackingNumber: created.shipment.trackingNumber || created.shipment.shipmentCode,
        origin: "Jebel Ali",
        dischargePort: "Bandar Abbas",
        deliveryPort: "Tehran",
        consigneeName: `${marker} Consignee`,
        statusText: "در حال هماهنگی ناخدا",
        currentStage: "هماهنگی لنج",
        malvaniProfileId: malvani.id,
        malvaniDisplayName: malvani.displayName,
      },
    })
  );

  return {
    customer,
    malvani,
    contact,
    created,
    shipment: updated.shipment,
    shipmentCode: updated.shipment.trackingNumber || updated.shipment.shipmentCode,
  };
}

async function createAiShipmentFixtureForClue(
  context: Awaited<ReturnType<typeof loginApi>>,
  marker: string,
  clue: string,
  goodsDescription = `${marker} machinery parts`
) {
  const customerCode = `${marker}-CUS`.toUpperCase();
  const customer = await readOk<any>(
    await context.post("/api/customers", {
      data: {
        customerCode,
        name: `آقای ${clue}`,
        contactName: `آقای ${clue}`,
        company: `شرکت ${clue}`,
        companyName: `شرکت ${clue}`,
        email: `${marker.toLowerCase()}@example.test`,
        phone: "09121112233",
        phoneNumbers: [{ phoneNumber: "09121112233", phoneLabel: "CEO", isPrimary: true }],
        address: `${marker} Address`,
        notes: `${marker} CEO note`,
      },
    })
  );
  const malvani = await readOk<any>(
    await context.post("/api/malvani-profiles", {
      data: {
        displayName: `ملوانی ${clue}`,
        captainName: `ناخدا ${clue}`,
        lenjName: `لنج ${clue}`,
        lenjRegistrationNumber: `LENJ-${marker}`,
        lenjType: "باری",
        homePort: "بندر بوشهر",
        activeStatus: "ACTIVE",
        note: `${marker} private malvani note`,
      },
    })
  );
  const created = await readOk<any>(
    await context.post("/api/shipments/v2", {
      data: {
        flowCode: "IMPORT_LANJ",
        customerId: customer.id,
        origin: "Jebel Ali",
        dischargePort: "Bandar Abbas",
        deliveryPort: "Tehran",
        consigneeName: `گیرنده ${clue}`,
        lenjType: "MALVANI",
        goodsRows: [
          {
            description: goodsDescription,
            packagingType: "Pallet",
            quantity: 4,
            weight: 120,
            cbm: 2.5,
            pcs: 9,
          },
        ],
      },
    })
  );
  const base = created.profile.sections.base || {};
  const updated = await readOk<any>(
    await context.patch(`/api/shipments/${encodeURIComponent(created.shipment.id)}/v2-profile/sections/base`, {
      data: {
        ...base,
        trackingNumber: created.shipment.trackingNumber || created.shipment.shipmentCode,
        origin: "Jebel Ali",
        dischargePort: "Bandar Abbas",
        deliveryPort: "Tehran",
        consigneeName: `گیرنده ${clue}`,
        statusText: "در حال هماهنگی ناخدا",
        currentStage: "هماهنگی لنج",
        malvaniProfileId: malvani.id,
        malvaniDisplayName: malvani.displayName,
      },
    })
  );

  return {
    customer,
    malvani,
    created,
    shipment: updated.shipment,
    shipmentCode: updated.shipment.trackingNumber || updated.shipment.shipmentCode,
  };
}

async function addMalvaniAgentContact(
  context: Awaited<ReturnType<typeof loginApi>>,
  malvaniId: string,
  marker: string,
  phoneNumber = "09120009988"
) {
  return readOk<any>(
    await context.post("/api/business-entity-contacts", {
      data: {
        entityType: "malvani",
        entityId: malvaniId,
        contactName: `${marker} Agent`,
        roleTitle: "Agent",
        phoneNumber,
        phoneLabel: "Agent",
        note: `${marker} agent contact note`,
        isPrimary: false,
        sortOrder: 20,
      },
    })
  );
}

async function askAi(context: Awaited<ReturnType<typeof loginApi>>, message: string, extra: Record<string, unknown> = {}) {
  return readOk<AiChatPayload>(await context.post("/api/ai/chat", { data: { message, ...extra } }));
}

function expectAiPayloadIsSafe(data: unknown) {
  const serialized = JSON.stringify(data).toLowerCase();
  for (const marker of AI_UNSAFE_RESPONSE_MARKERS) {
    expect(serialized).not.toContain(marker);
  }
}

test.describe.serial("dashboard AI assistant and home overview", () => {
  test("requires authentication for dashboard and AI chat APIs", async () => {
    const anonymous = await apiContext();
    try {
      expect((await anonymous.get("/api/dashboard")).status()).toBe(401);
      expect((await anonymous.post("/api/ai/chat", { data: { message: "status" } })).status()).toBe(401);
    } finally {
      await disposeContexts(anonymous);
    }
  });

  test("keeps AI chat CEO-only and rejects client tenant scope input", async () => {
    const owner = await loginApi();
    const contexts = [owner];
    try {
      const { email } = await createCompanyUser(owner, "OPERATIONS", "dashboard-ai-operations");
      const employee = await loginApi(email, USER_PASSWORD);
      contexts.push(employee);

      const forbidden = await employee.post("/api/ai/chat", {
        data: { message: "وضعیت محموله 14051102036 چیه؟" },
      });
      expect(forbidden.status(), await forbidden.text()).toBe(403);
      const forbiddenPayload = await forbidden.json();
      expect(forbiddenPayload.error?.message || "").toContain("فقط برای مدیرعامل");

      const answer = await askAi(owner, "سلام");
      expect(answer.assistantName).toBe("همیار لاجستیک");
      expect(answer.answer).toContain("شماره محموله");
      expect(answer.sources.some((source) => source.type === "system")).toBe(true);
      expectAiPayloadIsSafe(answer);

      const spoofedScope = await owner.post("/api/ai/chat", {
        data: { message: "سلام", organizationId: "org-other" },
      });
      expect(spoofedScope.status(), await spoofedScope.text()).toBe(403);
    } finally {
      await disposeContexts(...contexts);
    }
  });

  test("answers CEO shipment-code questions from allowlisted tenant tools", async () => {
    const owner = await loginApi();
    try {
      const marker = `AI${Date.now()}`;
      const fixture = await createAiShipmentFixture(owner, marker);
      const answer = await askAi(
        owner,
        `شماره تماس ناخدای محموله ${fixture.shipmentCode} چیه و وضعیت محموله رو اعلام کن`
      );

      expect(answer.answer).toContain(fixture.customer.companyName || fixture.customer.company || `${marker} Company`);
      expect(answer.answer).toContain("در حال هماهنگی ناخدا");
      expect(answer.answer).toContain("هماهنگی لنج");
      expect(answer.answer).toContain(`${marker} Captain`);
      expect(answer.answer).toContain("09129876543");
      expect(answer.sources).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: "shipment", id: fixture.shipment.id, url: `/shipments/${fixture.shipment.id}` }),
          expect.objectContaining({ type: "customer", id: fixture.customer.id, url: `/customers/${fixture.customer.id}` }),
          expect.objectContaining({ type: "malvani", label: fixture.malvani.displayName }),
        ])
      );
      expect(answer.tone).toBe("direct");
      expect(answer.activeEntity).toMatchObject({ type: "shipment", id: fixture.shipment.id });
      expect(answer.suggestions).toEqual(expect.arrayContaining(["وضعیت این محموله چیه؟", "مشتری این محموله کیه؟"]));
      expect(answer.answer.split("\n").length).toBeLessThanOrEqual(4);
      expectAiPayloadIsSafe(answer);
    } finally {
      await disposeContexts(owner);
    }
  });

  test("answers expanded read-only shipment and operations tools", async () => {
    const owner = await loginApi();
    const contexts = [owner];
    try {
      const tenantInfo = await createTenantOwner(owner);
      const tenant = await loginApi(tenantInfo.tenantEmail, USER_PASSWORD);
      contexts.push(tenant);
      const marker = `AITOOLS${Date.now()}`;
      const fixture = await createAiShipmentFixture(tenant, marker);
      await readOk<any>(
        await tenant.post("/api/tasks", {
          data: {
            title: `${marker} customs follow-up`,
            description: "AI task lookup regression.",
            status: "TODO",
            priority: "HIGH",
            shipmentId: fixture.shipment.id,
            customerId: fixture.customer.id,
          },
        })
      );

      const goods = await askAi(tenant, `کالای محموله ${fixture.shipmentCode} چیه؟`);
      expect(goods.answer).toContain(`${marker} machinery parts`);
      expect(goods.sources).toEqual(expect.arrayContaining([expect.objectContaining({ type: "shipment", id: fixture.shipment.id })]));
      expect(goods.responseMode).toBe("direct_answer");
      expectAiPayloadIsSafe(goods);

      const route = await askAi(tenant, `مسیر محموله ${fixture.shipmentCode} رو بگو`);
      expect(route.answer).toContain("Jebel Ali");
      expect(route.answer).toContain("Bandar Abbas");
      expect(route.answer).toContain("Tehran");
      expectAiPayloadIsSafe(route);

      const agent = await askAi(tenant, `شماره ایجنت ملوانی محموله ${fixture.shipmentCode} چیه؟`);
      expect(agent.answer).toContain("ایجنت");
      expect(agent.answer).toContain("ثبت نشده");
      expect(agent.answer).not.toContain("09129876543");
      expectAiPayloadIsSafe(agent);

      const documents = await askAi(tenant, `اسناد محموله ${fixture.shipmentCode} کامل هست؟`);
      expect(documents.answer).toContain("اسناد ثبت‌شده");
      expect(documents.answer).toContain("متصل نشده");
      expect(documents.sources).toEqual(expect.arrayContaining([expect.objectContaining({ type: "document" })]));
      expectAiPayloadIsSafe(documents);

      const tasks = await askAi(tenant, `وظایف محموله ${fixture.shipmentCode} چیه؟`);
      expect(tasks.answer).toContain(`${marker} customs follow-up`);
      expect(tasks.sources).toEqual(expect.arrayContaining([expect.objectContaining({ type: "task" })]));
      expectAiPayloadIsSafe(tasks);

      const kootaj = await askAi(tenant, `وضعیت کوتاژ محموله ${fixture.shipmentCode} چیه؟`);
      expect(kootaj.answer).toContain("کوتاژ");
      expectAiPayloadIsSafe(kootaj);

      const tracking = await askAi(tenant, `رهگیری مشتری محموله ${fixture.shipmentCode} فعاله؟`);
      expect(tracking.answer).toContain("رهگیری مشتری");
      expect(tracking.sources).toEqual(expect.arrayContaining([expect.objectContaining({ type: "public_tracking" })]));
      expectAiPayloadIsSafe(tracking);

      const overview = await askAi(tenant, "نمای کلی عملیات امروز رو بده");
      expect(overview.answer).toContain("نمای کلی عملیات");
      expect(overview.responseMode).toBe("direct_answer");
      expectAiPayloadIsSafe(overview);
    } finally {
      await disposeContexts(...contexts);
    }
  });

  test("resolves natural shipment references by customer name and goods clue", async () => {
    const owner = await loginApi();
    try {
      const marker = `AIGOODS${Date.now()}`;
      const clue = `سنجریعمومی${Date.now()}`;
      const goods = `اتو پرس ویژه${Date.now()}`;
      const fixture = await createAiShipmentFixtureForClue(owner, marker, clue, goods);

      const answer = await askAi(owner, `بار آقای ${clue} که توش ${goods} داره`);

      expect(answer.tone).toBe("clarification");
      expect(answer.answer).toContain(`محموله ${fixture.shipmentCode} را پیدا کردم`);
      expect(answer.answer).toContain("چه اطلاعاتی");
      expect(answer.activeEntity).toMatchObject({ type: "shipment", id: fixture.shipment.id });
      expect(answer.answer).not.toContain("نتایج جستجوی محموله");
      expectAiPayloadIsSafe(answer);
    } finally {
      await disposeContexts(owner);
    }
  });

  test("answers requested shipment intent after resolving customer name and goods clue", async () => {
    const owner = await loginApi();
    try {
      const marker = `AIGOODSSTATUS${Date.now()}`;
      const clue = `رادمان${Date.now()}`;
      const goods = `پمپ صنعتی ویژه${Date.now()}`;
      await createAiShipmentFixtureForClue(owner, marker, clue, goods);

      const answer = await askAi(owner, `وضعیت بار خانم ${clue} که شامل ${goods} هست چیه؟`);

      expect(answer.answer).toContain("وضعیت محموله");
      expect(answer.answer).toContain("در حال هماهنگی ناخدا");
      expect(answer.answer).not.toContain("چه اطلاعاتی");
      expect(answer.responseMode).toBe("direct_answer");
      expectAiPayloadIsSafe(answer);
    } finally {
      await disposeContexts(owner);
    }
  });

  test("answers captain phone after resolving possessive customer name and goods clue", async () => {
    const owner = await loginApi();
    try {
      const marker = `AICAPGOODS${Date.now()}`;
      const clue = `سنجریتماس${Date.now()}`;
      const goods = `اتو پرس تماس${Date.now()}`;
      const fixture = await createAiShipmentFixtureForClue(owner, marker, clue, goods);
      await readOk<any>(
        await owner.post("/api/business-entity-contacts", {
          data: {
            entityType: "malvani",
            entityId: fixture.malvani.id,
            contactName: `${marker} Captain Phone`,
            roleTitle: "Captain",
            phoneNumber: "09125556677",
            phoneLabel: "Captain",
            note: `${marker} captain contact note`,
            isPrimary: true,
            sortOrder: 1,
          },
        })
      );

      const answer = await askAi(owner, `شماره ناخدای آقای ${clue} که توش ${goods} داره چنده؟`);

      expect(answer.answer).toContain("09125556677");
      expect(answer.answer).toContain("شماره تماس ناخدای محموله");
      expect(answer.answer).not.toContain("برای پیدا کردن محموله");
      expect(answer.answer).not.toContain("شماره محموله، نام دقیق مشتری یا شرح دقیق‌تر کالا");
      expect(answer.activeEntity).toMatchObject({ type: "shipment", id: fixture.shipment.id });
      expect(answer.responseMode).toBe("direct_answer");
      expectAiPayloadIsSafe(answer);
    } finally {
      await disposeContexts(owner);
    }
  });

  test("uses goods clue to narrow multiple matching customer-name candidates", async () => {
    const owner = await loginApi();
    try {
      const clue = `ناممشترک${Date.now()}`;
      const firstGoods = `قطعه خاص${Date.now()}`;
      const secondGoods = `اتو پرس خاص${Date.now()}`;
      await createAiShipmentFixtureForClue(owner, `AIMULTIC1${Date.now()}`, clue, firstGoods);
      const target = await createAiShipmentFixtureForClue(owner, `AIMULTIC2${Date.now()}`, clue, secondGoods);

      const answer = await askAi(owner, `وضعیت محموله آقای ${clue} که توش ${secondGoods} داره رو بده`);

      expect(answer.answer).toContain("وضعیت محموله");
      expect(answer.activeEntity).toMatchObject({ type: "shipment", id: target.shipment.id });
      expect(answer.answer).not.toContain("چند مورد مرتبط");
      expectAiPayloadIsSafe(answer);
    } finally {
      await disposeContexts(owner);
    }
  });

  test("asks for a choice when goods-only fallback matches multiple shipments", async () => {
    const owner = await loginApi();
    try {
      const goods = `کالایمشترک${Date.now()}`;
      const first = await createAiShipmentFixtureForClue(owner, `AIGOODSA${Date.now()}`, `مشتریالف${Date.now()}`, goods);
      const second = await createAiShipmentFixtureForClue(owner, `AIGOODSB${Date.now()}`, `مشتریب${Date.now()}`, goods);

      const answer = await askAi(owner, `وضعیت بار ${goods} چیه؟`);

      expect(answer.tone).toBe("clarification");
      expect(answer.answer).toContain("چند مورد مرتبط");
      expect(answer.answer).toContain(first.shipmentCode);
      expect(answer.answer).toContain(second.shipmentCode);
      expectAiPayloadIsSafe(answer);
    } finally {
      await disposeContexts(owner);
    }
  });

  test("uses cleaned Persian entity clues for natural malvani agent requests", async () => {
    const owner = await loginApi();
    try {
      const marker = `AINAT${Date.now()}`;
      const clue = `سنجری${Date.now()}`;
      const fixture = await createAiShipmentFixtureForClue(owner, marker, clue);
      await addMalvaniAgentContact(owner, fixture.malvani.id, marker, "09123334455");

      const answer = await askAi(owner, `شماره ایجنت ملوانی محموله آقای ${clue} رو بفرست`);

      expect(answer.answer).toContain("09123334455");
      expect(answer.answer).toContain("ایجنت ملوانی");
      expect(answer.answer).not.toContain("نتایج جستجوی محموله");
      expect(answer.answer).not.toContain("وضعیت محموله");
      expect(answer.answer.split("\n").length).toBeLessThanOrEqual(1);
      expect(answer.responseMode).toBe("direct_answer");
      expect(answer.activeEntity).toMatchObject({ type: "shipment", id: fixture.shipment.id });
      expectAiPayloadIsSafe(answer);
    } finally {
      await disposeContexts(owner);
    }
  });

  test("clarifies natural malvani agent requests when the cleaned clue has no match", async () => {
    const owner = await loginApi();
    const contexts = [owner];
    try {
      const tenantInfo = await createTenantOwner(owner);
      const tenant = await loginApi(tenantInfo.tenantEmail, USER_PASSWORD);
      contexts.push(tenant);

      const answer = await askAi(tenant, "شماره ایجنت ملوانی محموله آقای سنجری رو بفرست");

      expect(answer.tone).toBe("clarification");
      expect(answer.answer).toContain("برای پیدا کردن ایجنت ملوانی، «سنجری» را بررسی کردم");
      expect(answer.answer).toContain("شماره محموله یا نام کامل مشتری/ملوانی");
      expect(answer.answer).not.toContain("نتایج جستجوی محموله");
      expect(answer.answer).not.toBe("محموله‌ای با این عبارت پیدا نشد.");
      expectAiPayloadIsSafe(answer);
    } finally {
      await disposeContexts(...contexts);
    }
  });

  test("answers direct shipment-code and active follow-up malvani agent phone requests", async () => {
    const owner = await loginApi();
    try {
      const marker = `AIDIRECTAG${Date.now()}`;
      const fixture = await createAiShipmentFixture(owner, marker);
      await addMalvaniAgentContact(owner, fixture.malvani.id, marker, "09124445566");

      const direct = await askAi(owner, `شماره ایجنت ملوانی محموله ${fixture.shipmentCode} رو بده`);
      expect(direct.answer).toContain("09124445566");
      expect(direct.answer).not.toContain("خلاصه محموله");
      expect(direct.answer.split("\n").length).toBeLessThanOrEqual(1);
      expect(direct.activeEntity).toMatchObject({ type: "shipment", id: fixture.shipment.id });
      expectAiPayloadIsSafe(direct);

      const followUp = await askAi(owner, "شماره ایجنت رو بده", {
        activeEntity: direct.activeEntity,
        recentMessages: [
          { role: "user", content: `شماره ایجنت ملوانی محموله ${fixture.shipmentCode} رو بده` },
          { role: "assistant", content: direct.answer },
        ],
      });

      expect(followUp.answer).toContain("09124445566");
      expect(followUp.answer).not.toContain("شماره محموله یا نام کامل");
      expect(followUp.activeEntity).toMatchObject({ type: "shipment", id: fixture.shipment.id });
      expectAiPayloadIsSafe(followUp);
    } finally {
      await disposeContexts(owner);
    }
  });

  test("asks for a choice when a natural malvani agent clue is ambiguous", async () => {
    const owner = await loginApi();
    try {
      const clue = `سنجریابهام${Date.now()}`;
      const first = await createAiShipmentFixtureForClue(owner, `AIAMB1${Date.now()}`, clue);
      const second = await createAiShipmentFixtureForClue(owner, `AIAMB2${Date.now()}`, clue);

      const answer = await askAi(owner, `شماره ایجنت ملوانی محموله آقای ${clue} رو بفرست`);

      expect(answer.tone).toBe("clarification");
      expect(answer.answer).toContain(`چند مورد مرتبط با «${clue}» پیدا شد`);
      expect(answer.answer).toContain(first.shipmentCode);
      expect(answer.answer).toContain(second.shipmentCode);
      expect(answer.answer).not.toContain("شماره ایجنت ملوانی:");
      expectAiPayloadIsSafe(answer);
    } finally {
      await disposeContexts(owner);
    }
  });

  test("answers CEO customer-code questions with customer profile and related shipments", async () => {
    const owner = await loginApi();
    try {
      const marker = `AICUST${Date.now()}`;
      const fixture = await createAiShipmentFixture(owner, marker);
      const customerCode = fixture.customer.customerCode || fixture.customer.code;
      const answer = await askAi(owner, `پرونده مشتری ${customerCode} را خلاصه کن`);

      expect(answer.answer).toContain(fixture.customer.companyName || fixture.customer.company || `${marker} Company`);
      expect(answer.answer).toContain(fixture.customer.contactName || `${marker} Contact`);
      expect(answer.answer).toContain("09121112233");
      expect(answer.answer).toContain("09121112234");
      expect(answer.answer).toContain(fixture.shipmentCode);
      expect(answer.sources).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: "customer", id: fixture.customer.id, url: `/customers/${fixture.customer.id}` }),
          expect.objectContaining({ type: "shipment", id: fixture.shipment.id, url: `/shipments/${fixture.shipment.id}` }),
        ])
      );
      expect(answer.activeEntity).toMatchObject({ type: "customer", id: fixture.customer.id });
      expect(answer.suggestions).toEqual(expect.arrayContaining(["شماره تماس مشتری رو بده", "آخرین محموله این مشتری چیه؟"]));
      expectAiPayloadIsSafe(answer);
    } finally {
      await disposeContexts(owner);
    }
  });

  test("uses active shipment context for short shipment follow-ups", async () => {
    const owner = await loginApi();
    try {
      const marker = `AIFOLLOW${Date.now()}`;
      const fixture = await createAiShipmentFixture(owner, marker);
      const first = await askAi(owner, `شماره تماس ناخدای محموله ${fixture.shipmentCode} چیه؟`);
      expect(first.activeEntity).toMatchObject({ type: "shipment", id: fixture.shipment.id });

      const followUp = await askAi(owner, "وضعیتش چیه؟", {
        activeEntity: first.activeEntity,
        recentMessages: [
          { role: "user", content: `شماره تماس ناخدای محموله ${fixture.shipmentCode} چیه؟` },
          { role: "assistant", content: first.answer },
        ],
      });

      expect(followUp.tone).toBe("conversational");
      expect(followUp.answer).toContain("در حال هماهنگی ناخدا");
      expect(followUp.answer).toContain("هماهنگی لنج");
      expect(followUp.activeEntity).toMatchObject({ type: "shipment", id: fixture.shipment.id });
      expect(followUp.suggestions).toEqual(expect.arrayContaining(["اسنادش کامل هست؟"]));
      expect(followUp.answer.split("\n").length).toBeLessThanOrEqual(2);
      expectAiPayloadIsSafe(followUp);
    } finally {
      await disposeContexts(owner);
    }
  });

  test("clarifies short follow-ups when no active entity is available", async () => {
    const owner = await loginApi();
    try {
      const answer = await askAi(owner, "وضعیتش چیه؟");
      expect(answer.tone).toBe("clarification");
      expect(answer.answer).toContain("شماره محموله");
      expect(answer.suggestions).toEqual([]);
      expectAiPayloadIsSafe(answer);
    } finally {
      await disposeContexts(owner);
    }
  });

  test("uses active customer context for customer contact follow-ups", async () => {
    const owner = await loginApi();
    try {
      const marker = `AICUSFOLLOW${Date.now()}`;
      const fixture = await createAiShipmentFixture(owner, marker);
      const customerQuestion = `مشتری محموله ${fixture.shipmentCode} کیه؟`;
      const first = await askAi(owner, customerQuestion);
      expect(first.activeEntity).toMatchObject({ type: "customer", id: fixture.customer.id });

      const followUp = await askAi(owner, "شماره تماسش رو بده", {
        activeEntity: first.activeEntity,
        recentMessages: [
          { role: "user", content: customerQuestion },
          { role: "assistant", content: first.answer },
        ],
      });

      expect(followUp.answer).toContain("09121112233");
      expect(followUp.answer).toContain("09121112234");
      expect(followUp.activeEntity).toMatchObject({ type: "customer", id: fixture.customer.id });
      expect(followUp.suggestions).toEqual(expect.arrayContaining(["محموله‌های فعالش کدومن؟"]));
      expectAiPayloadIsSafe(followUp);
    } finally {
      await disposeContexts(owner);
    }
  });

  test("AI shipment and customer lookups stay tenant scoped in both directions", async () => {
    const owner = await loginApi();
    const contexts = [owner];
    try {
      const ownerFixture = await createAiShipmentFixture(owner, `AIXTENANT${Date.now()}`);
      const naturalClue = `سنجریمرزی${Date.now()}`;
      const ownerNaturalFixture = await createAiShipmentFixtureForClue(owner, `AIXNAT${Date.now()}`, naturalClue);
      await addMalvaniAgentContact(owner, ownerNaturalFixture.malvani.id, `AIXNAT${Date.now()}`, "09125556677");
      const goodsClue = `کالایمرزی${Date.now()}`;
      const ownerGoodsFixture = await createAiShipmentFixtureForClue(owner, `AIXGOODS${Date.now()}`, `کالامشتری${Date.now()}`, goodsClue);
      const tenantInfo = await createTenantOwner(owner);
      const tenant = await loginApi(tenantInfo.tenantEmail, USER_PASSWORD);
      contexts.push(tenant);
      const tenantFixture = await createAiShipmentFixture(tenant, `AITENANT${Date.now()}`);
      const ownerCompanyName = ownerFixture.customer.companyName || ownerFixture.customer.company;
      const tenantCompanyName = tenantFixture.customer.companyName || tenantFixture.customer.company;
      expect(ownerCompanyName).toBeTruthy();
      expect(tenantCompanyName).toBeTruthy();

      const tenantShipmentAnswer = await askAi(tenant, `وضعیت محموله ${ownerFixture.shipmentCode} چیست؟`);
      expect(tenantShipmentAnswer.answer).toContain("پیدا نشد");
      expect(tenantShipmentAnswer.answer).not.toContain(ownerCompanyName);
      expectAiPayloadIsSafe(tenantShipmentAnswer);

      const tenantNaturalAnswer = await askAi(tenant, `شماره ایجنت ملوانی محموله آقای ${naturalClue} رو بفرست`);
      expect(tenantNaturalAnswer.answer).toContain("پیدا نشد");
      expect(tenantNaturalAnswer.answer).toContain(`«${naturalClue}»`);
      expect(tenantNaturalAnswer.answer).not.toContain("09125556677");
      expect(tenantNaturalAnswer.answer).not.toContain(ownerNaturalFixture.shipmentCode);
      expectAiPayloadIsSafe(tenantNaturalAnswer);

      const tenantGoodsAnswer = await askAi(tenant, `وضعیت بار ${goodsClue} چیه؟`);
      expect(tenantGoodsAnswer.answer).toContain("پیدا نشد");
      expect(tenantGoodsAnswer.answer).not.toContain(ownerGoodsFixture.shipmentCode);
      expectAiPayloadIsSafe(tenantGoodsAnswer);

      const spoofedActiveShipment = await askAi(tenant, "وضعیتش چیه؟", {
        activeEntity: {
          type: "shipment",
          id: ownerFixture.shipment.id,
          code: ownerFixture.shipmentCode,
          label: ownerCompanyName,
        },
      });
      expect(spoofedActiveShipment.tone).toBe("clarification");
      expect(spoofedActiveShipment.answer).toContain("شماره محموله");
      expect(spoofedActiveShipment.answer).not.toContain(ownerCompanyName);
      expect(spoofedActiveShipment.sources.some((source) => source.id === ownerFixture.shipment.id)).toBe(false);
      expectAiPayloadIsSafe(spoofedActiveShipment);

      const tenantCustomerAnswer = await askAi(
        tenant,
        `اطلاعات مشتری ${ownerFixture.customer.customerCode || ownerFixture.customer.code} را بده`
      );
      expect(tenantCustomerAnswer.answer).toContain("پیدا نشد");
      expect(tenantCustomerAnswer.answer).not.toContain(ownerCompanyName);
      expectAiPayloadIsSafe(tenantCustomerAnswer);

      const platformAdminShipmentAnswer = await askAi(owner, `shipment status ${tenantFixture.shipmentCode}`);
      expect(platformAdminShipmentAnswer.answer).not.toContain(tenantCompanyName);
      expect(platformAdminShipmentAnswer.sources.some((source) => source.id === tenantFixture.shipment.id)).toBe(false);
      expectAiPayloadIsSafe(platformAdminShipmentAnswer);

      const platformAdminCustomerAnswer = await askAi(
        owner,
        `customer profile ${tenantFixture.customer.customerCode || tenantFixture.customer.code}`
      );
      expect(platformAdminCustomerAnswer.answer).toContain("\u067e\u06cc\u062f\u0627 \u0646\u0634\u062f");
      expect(platformAdminCustomerAnswer.answer).not.toContain(tenantCompanyName);
      expectAiPayloadIsSafe(platformAdminCustomerAnswer);
    } finally {
      await disposeContexts(...contexts);
    }
  });

  test("returns the new dashboard DTO with scoped tasks and max five shipments", async () => {
    const owner = await loginApi();
    const contexts = [owner];
    try {
      const auth = await readOk<any>(await owner.get("/api/auth/me"));
      const ownerUser = auth.user;
      const employeeEmail = uniqueEmail("dashboard-employee");
      const employee = await readOk<any>(
        await owner.post("/api/users", {
          data: {
            name: "Dashboard Employee",
            email: employeeEmail,
            password: USER_PASSWORD,
            role: "OPERATIONS",
          },
        })
      );

      const ownerTask = await readOk<any>(
        await owner.post("/api/tasks", {
          data: {
            title: `Dashboard owner task ${Date.now()}`,
            description: "Dashboard current-user task regression.",
            status: "TODO",
            priority: "HIGH",
            assignedToUserId: ownerUser.id,
          },
        })
      );
      const employeeTask = await readOk<any>(
        await owner.post("/api/tasks", {
          data: {
            title: `Dashboard employee task ${Date.now()}`,
            description: "Should not appear in the owner dashboard task list.",
            status: "TODO",
            priority: "HIGH",
            assignedToUserId: employee.id,
          },
        })
      );

      const dashboard = await readOk<DashboardPayload>(await owner.get("/api/dashboard"));
      expect(dashboard.currentUser.id).toBe(ownerUser.id);
      expect(dashboard.aiAssistant.name).toBe("همیار لاجستیک");
      expect(dashboard.aiAssistant.status).toBe("ready");
      expect(dashboard.metrics.map((metric) => metric.label)).toEqual([
        "محموله‌های فعال",
        "اسناد",
        "کارمندان فعال",
        "وظایف",
      ]);
      expect(dashboard.lastUpdatedShipments.length).toBeLessThanOrEqual(5);
      expect(dashboard.lastUpdatedShipments.every((shipment) => shipment.actionUrl === `/shipments/${shipment.id}`)).toBe(true);

      const dashboardTaskIds = dashboard.myActiveTasks.map((task) => task.id);
      expect(dashboardTaskIds).toContain(ownerTask.id);
      expect(dashboardTaskIds).not.toContain(employeeTask.id);

      const myTasks = await readOk<any[]>(await owner.get("/api/tasks/my"));
      const myActiveTaskIds = new Set(
        myTasks
          .filter((task) => !["DONE", "CANCELLED"].includes(String(task.status || "").toUpperCase()))
          .map((task) => task.id)
      );
      expect(dashboard.myActiveTasks.every((task) => myActiveTaskIds.has(task.id))).toBe(true);
    } finally {
      await disposeContexts(...contexts);
    }
  });

  test("dashboard data and shipment search stay tenant scoped", async () => {
    const owner = await loginApi();
    const contexts = [owner];
    try {
      const ownerDashboard = await readOk<DashboardPayload>(await owner.get("/api/dashboard"));
      const ownerShipments = await readOk<any[]>(await owner.get("/api/shipments"));
      const ownerShipment = ownerShipments.find((shipment) => shipment.trackingNumber || shipment.shipmentCode);

      const tenantInfo = await createTenantOwner(owner);
      const tenant = await loginApi(tenantInfo.tenantEmail, USER_PASSWORD);
      contexts.push(tenant);
      const tenantDashboard = await readOk<DashboardPayload>(await tenant.get("/api/dashboard"));

      const ownerDashboardShipmentIds = new Set(ownerDashboard.lastUpdatedShipments.map((shipment) => shipment.id));
      expect(tenantDashboard.lastUpdatedShipments.every((shipment) => !ownerDashboardShipmentIds.has(shipment.id))).toBe(true);

      if (ownerShipment) {
        const ownerCode = ownerShipment.trackingNumber || ownerShipment.shipmentCode;
        const search = await tenant.get(`/api/search?${new URLSearchParams({ q: ownerCode, type: "shipments" }).toString()}`);
        expect(search.status(), await search.text()).toBeLessThan(400);
        const searchPayload = await search.json();
        expect((searchPayload.results || []).some((result: any) => result.id === ownerShipment.id)).toBe(false);
      }
    } finally {
      await disposeContexts(...contexts);
    }
  });

  test.skip("redirects root by current session state", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);

    await loginViaUi(page);
    await page.goto("/");
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByTestId("dashboard-home")).toBeVisible();
  });

  test("renders the new dashboard and safe AI assistant in the browser", async ({ page }) => {
    const owner = await loginApi();
    const shipments = await readOk<any[]>(await owner.get("/api/shipments"));
    await disposeContexts(owner);
    const target = shipments.find((shipment) => shipment.trackingNumber || shipment.shipmentCode);
    const shipmentPrompt = target ? `وضعیت محموله ${target.trackingNumber || target.shipmentCode} چیه؟` : "سلام";

    await loginViaUi(page);
    await expect(page.getByTestId("dashboard-home")).toBeVisible();
    await expect(page.getByTestId("dashboard-greeting")).toContainText("سلام،");
    await expect(page.getByTestId("dashboard-metric-activeShipments")).toContainText("محموله‌های فعال");
    await expect(page.getByTestId("dashboard-metric-documents")).toContainText("اسناد");
    await expect(page.getByTestId("dashboard-metric-activeEmployees")).toContainText("کارمندان فعال");
    await expect(page.getByTestId("dashboard-metric-tasks")).toContainText("وظایف");
    await expect(page.getByTestId("dashboard-shipment-search-input")).toHaveAttribute("placeholder", "جستجوی شماره محموله...");
    await expect(page.getByTestId("dashboard-ai-assistant")).toContainText("همیار لاجستیک");
    await expect(page.getByTestId("dashboard-my-tasks")).toContainText("وظایف فعال من");
    await expect(page.getByTestId("dashboard-last-shipments")).toContainText("آخرین محموله‌های بروزرسانی‌شده");

    await page.getByTestId("dashboard-ai-input").fill(shipmentPrompt);
    await page.getByTestId("dashboard-ai-submit").click();
    await expect(page.getByTestId("dashboard-ai-user-message").last()).toContainText(shipmentPrompt);
    await expect(page.getByTestId("dashboard-ai-assistant-message").last()).toBeVisible();
    const answer = page.getByTestId("dashboard-ai-answer");
    await expect(answer).toContainText(target ? "وضعیت محموله" : "شماره محموله");
    if (target) {
      await expect(page.getByTestId("dashboard-ai-suggestion-chip").first()).toBeVisible();
      await expect(page.getByTestId("dashboard-ai-source-chip").first()).toBeVisible();
    }
    const answerText = await answer.textContent();
    expect(answerText || "").not.toContain("LLM_API_KEY");
    expect(answerText || "").not.toContain("sk-");
  });

  test("frontend assistant bundle does not expose backend LLM config", async ({ page }) => {
    await loginViaUi(page);
    const scriptText = await page.evaluate(async () => {
      const scriptUrls = Array.from(document.scripts)
        .map((script) => script.src)
        .filter((src) => src && new URL(src).origin === window.location.origin);
      const responses = await Promise.all(
        scriptUrls.map(async (src) => {
          const response = await fetch(src);
          return response.ok ? response.text() : "";
        })
      );
      return responses.join("\n").toLowerCase();
    });

    expect(scriptText).not.toContain("llm_api_key");
    expect(scriptText).not.toContain("llm_provider");
    expect(scriptText).not.toContain("llm_base_url");
    expect(scriptText).not.toContain("llm_model_fast");
    expect(scriptText).not.toContain("llm_model_strong");
    expect(scriptText).not.toContain("sk-");
  });

  test("shipment search opens canonical shipment detail routes", async ({ page }) => {
    const owner = await loginApi();
    const shipments = await readOk<any[]>(await owner.get("/api/shipments"));
    await disposeContexts(owner);
    const target = shipments.find((shipment) => shipment.trackingNumber || shipment.shipmentCode);
    expect(target).toBeTruthy();
    const shipmentCode = target.trackingNumber || target.shipmentCode;

    await loginViaUi(page);
    await page.getByTestId("dashboard-shipment-search-input").fill(shipmentCode);
    await page.getByTestId("dashboard-shipment-search-submit").click();
    await expect(page).toHaveURL(new RegExp(`/shipments/${target.id}$`));
  });
});
