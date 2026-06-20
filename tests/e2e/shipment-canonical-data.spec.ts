import { expect, test } from "@playwright/test";
import {
  USER_PASSWORD,
  disposeContexts,
  expectForbidden,
  expectUnavailable,
  loginApi,
  nextValidShipmentCode,
  readOk,
  uniqueEmail,
} from "./helpers";

async function createTenantOwner(owner: Awaited<ReturnType<typeof loginApi>>) {
  const tenantEmail = uniqueEmail("shipment-canonical-owner");
  const data = await readOk<any>(
    await owner.post("/api/admin/organizations/manual-signup", {
      data: {
        companyName: `Shipment Canonical Tenant ${Date.now()}`,
        ownerName: "Shipment Canonical Owner",
        ownerEmail: tenantEmail,
        password: USER_PASSWORD,
        planId: "starter",
        billingCycle: "monthly",
        contactPhone: "09120000000",
      },
    })
  );
  return { tenantEmail, organizationId: data.organizationId };
}

test.describe("shipment canonical data foundation", () => {
  test("creates and updates shipments through canonical APIs with audit history", async () => {
    const owner = await loginApi();
    try {
      const shipment = await readOk<any>(
        await owner.post("/api/shipments", {
          data: {
            trackingNumber: await nextValidShipmentCode(),
            containerNumber: "TLLU1234567",
            origin: "Shanghai",
            destination: "Bandar Abbas",
            status: "LOADING",
            estimatedDelivery: "2026-06-20",
            freeTimeDays: 7,
          },
        })
      );

      const updated = await readOk<any>(
        await owner.patch(`/api/shipments/${encodeURIComponent(shipment.id)}/operational-fields`, {
          data: {
            status: "KOOTAJ_DONE",
            containerNumber: "TLLU7654321",
            notes: "Canonical shipment edit",
          },
        })
      );

      expect(updated.status).toBe("KOOTAJ_DONE");
      expect(updated.containerNumber).toBe("TLLU7654321");

      const loaded = await readOk<any>(await owner.get(`/api/shipments/${encodeURIComponent(shipment.id)}`));
      expect(loaded.status).toBe("KOOTAJ_DONE");
      expect(loaded.notes).toBe("Canonical shipment edit");

      const changes = await readOk<any[]>(await owner.get("/api/changes?limit=25"));
      expect(changes.some((change) => change.entity_id === shipment.id || change.entityId === shipment.id)).toBe(true);
    } finally {
      await disposeContexts(owner);
    }
  });

  test("rejects spoofed and cross-tenant shipment updates", async () => {
    const owner = await loginApi();
    const tenantSetup = await createTenantOwner(owner);
    const tenant = await loginApi(tenantSetup.tenantEmail, USER_PASSWORD);

    try {
      const ownerShipment = await readOk<any>(
        await owner.post("/api/shipments", {
          data: {
            trackingNumber: await nextValidShipmentCode(),
            origin: "Dubai",
            destination: "Tehran",
            status: "LOADING",
          },
        })
      );

      await expectUnavailable(
        await tenant.patch(`/api/shipments/${encodeURIComponent(ownerShipment.id)}/operational-fields`, {
          data: { status: "EXITED" },
        })
      );

      const spoofed = await tenant.patch(`/api/shipments/${encodeURIComponent(ownerShipment.id)}/operational-fields`, {
        data: {
          organizationId: "org-logisticplus-default",
          status: "EXITED",
        },
      });
      await expectForbidden(spoofed);
      const payload = await spoofed.json();
      expect(payload.error?.code).toBe("TENANT_SCOPE_CONFLICT");
    } finally {
      await disposeContexts(owner, tenant);
    }
  });

  test("rejects invalid shipment operational fields", async () => {
    const owner = await loginApi();
    try {
      const shipment = await readOk<any>(
        await owner.post("/api/shipments", {
          data: {
            trackingNumber: await nextValidShipmentCode(),
            origin: "Hamburg",
            destination: "Bushehr",
            status: "LOADING",
          },
        })
      );

      const invalidStatus = await owner.patch(`/api/shipments/${encodeURIComponent(shipment.id)}/operational-fields`, {
        data: { status: "NOT_A_REAL_STATUS" },
      });
      expect(invalidStatus.status()).toBe(400);

      const unknownField = await owner.patch(`/api/shipments/${encodeURIComponent(shipment.id)}/operational-fields`, {
        data: { randomShipmentField: "unsafe" },
      });
      expect(unknownField.status()).toBe(400);

      const retiredTimerField = await owner.patch(`/api/shipments/${encodeURIComponent(shipment.id)}/operational-fields`, {
        data: { timerDeadlineAt: new Date(Date.now() + 60 * 60 * 1000).toISOString() },
      });
      expect(retiredTimerField.status()).toBe(400);
    } finally {
      await disposeContexts(owner);
    }
  });
});

