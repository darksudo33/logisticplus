import { test } from "@playwright/test";
import { apiContext, disposeContexts, expectUnavailable } from "./helpers";

test.describe("retired SMS phone-login surface", () => {
  test("OTP request and verify APIs stay unavailable", async () => {
    const context = await apiContext();

    await expectUnavailable(await context.post("/api/auth/phone/request-code", {
      data: { phone: "09120000000" },
    }));
    await expectUnavailable(await context.post("/api/auth/phone/verify", {
      data: { phone: "09120000000", code: "000000", remember: true },
    }));

    await disposeContexts(context);
  });
});
