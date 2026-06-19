import { test } from "@playwright/test";
import { disposeContexts, expectUnavailable, loginApi } from "./helpers";

test.describe("retired admin SMS management surface", () => {
  test("SMS delivery, analytics, template, and worker APIs stay unavailable", async () => {
    const admin = await loginApi();

    await expectUnavailable(await admin.get("/api/admin/sms-deliveries"));
    await expectUnavailable(await admin.get("/api/admin/sms-analytics"));
    await expectUnavailable(await admin.get("/api/admin/sms-templates"));
    await expectUnavailable(await admin.patch("/api/admin/sms-templates/high_priority_task", {
      data: { enabled: false },
    }));
    await expectUnavailable(await admin.post("/api/admin/sms-deliveries/run-worker", {
      data: { limit: 10 },
    }));

    await disposeContexts(admin);
  });
});
