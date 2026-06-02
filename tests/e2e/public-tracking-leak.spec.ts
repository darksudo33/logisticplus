import { expect, test } from "@playwright/test";
import {
  apiContext,
  disposeContexts,
  expectPublicTrackingPayloadIsSafe,
  loginApi,
  readOk,
} from "./helpers";

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

test.describe.serial("public tracking leak hardening", () => {
  test("workflow, blocker, task, and private document internals stay out of public payloads", async () => {
    const owner = await loginApi();
    const publicContext = await apiContext();
    const secret = `PRIVATE-WORKFLOW-${Date.now()}`;

    try {
      const progress = await readOk<any>(await owner.post("/api/shipments/s1/progress/start"));
      await readOk(
        await owner.patch("/api/shipments/s1/progress/current", {
          data: {
            stepCode: "001",
            status: "completed",
            internalNote: `${secret} internal step note`,
            publicNote: "Customer-safe workflow progress update.",
            publicVisible: true,
          },
        })
      );
      const blocker = await readOk<any>(
        await owner.post("/api/shipments/s1/progress/blockers", {
          data: {
            stepCode: "002",
            blockerCode: "B17",
            internalNote: `${secret} customs valuation dispute`,
            publicNote: "Customer-safe blocker follow-up.",
          },
        })
      );

      const task = await readOk<any>(
        await owner.post("/api/tasks", {
          data: {
            title: `${secret} private workflow task`,
            description: `${secret} task detail`,
            shipmentId: "s1",
            workflowInstanceId: progress.workflow.id,
            workflowStepCode: "002",
            workflowBlockerId: blocker.blocker.id,
            blockerCode: "B17",
            assignedToUserId: "u1",
            priority: "HIGH",
          },
        })
      );

      const privateDocument = await readOk<any>(
        await uploadDocument(
          owner,
          {
            name: "private-tracking-leak.txt",
            mimeType: "text/plain",
            buffer: Buffer.from(`${secret} private document`),
          },
          {
            title: `${secret} private document`,
            shipmentId: "s1",
            visibility: "internal",
          }
        )
      );
      const visibleDocument = await readOk<any>(
        await uploadDocument(
          owner,
          {
            name: "visible-tracking-safe.txt",
            mimeType: "text/plain",
            buffer: Buffer.from("customer safe document"),
          },
          {
            title: "Customer-safe tracking document",
            shipmentId: "s1",
            visibility: "customer_visible",
          }
        )
      );

      const access = await readOk<{ token: string }>(
        await owner.post("/api/shipments/s1/customer-access/generate")
      );
      const byToken = await readOk<any>(
        await publicContext.get(`/api/public/track/${encodeURIComponent(access.token)}`)
      );
      const bySearch = await readOk<any>(
        await publicContext.post("/api/public/track/search", {
          data: { shipmentCode: "LS-9801", verification: "info@arian.com" },
        })
      );

      for (const payload of [byToken, bySearch]) {
        expectPublicTrackingPayloadIsSafe(payload);
        expect(payload.documents.some((document: any) => document.id === visibleDocument.id)).toBe(true);
        expect(payload.documents.some((document: any) => document.id === privateDocument.id)).toBe(false);

        const serialized = JSON.stringify(payload);
        expect(serialized).not.toContain(secret);
        expect(serialized).not.toContain(task.id);
        expect(serialized).not.toContain(progress.workflow.id);
        expect(serialized).not.toContain(blocker.blocker.id);
        expect(serialized).not.toContain("B17");
        expect(serialized.toLowerCase()).not.toContain("workflowinstance");
        expect(serialized.toLowerCase()).not.toContain("workflowblocker");
        expect(serialized.toLowerCase()).not.toContain("actoruserid");
      }

      const privatePublicDownload = await publicContext.get(
        `/api/public/track/${encodeURIComponent(access.token)}/documents/${encodeURIComponent(privateDocument.id)}`
      );
      expect([403, 404]).toContain(privatePublicDownload.status());
    } finally {
      await owner.post("/api/shipments/s1/customer-access/disable").catch(() => null);
      await disposeContexts(owner, publicContext);
    }
  });
});
