import { expect, test } from "@playwright/test";
import { disposeContexts, loginApi, loginViaUi, readOk, expectForbidden, uniqueEmail } from "./helpers";
import { fetchBrsApiProCurrencyPayload, normalizeBrsApiProCurrencyPayload } from "@/server/src/modules/rates/brsapi.js";

test.describe.serial("rates and tariffs", () => {
  test("normalizes BRSAPI Pro currency payloads with free, SANA, and NIMA markets", () => {
    const payload = {
      currency: {
        free: [
          { symbol: "USD", name: "دلار آمریکا", name_en: "US Dollar", price: "859000", unit: "ریال" },
        ],
        sana: [
          { symbol: "SANA_USD", name: "دلار آمریکا", name_en: "US Dollar", price_buy: "850000", price_sell: "860000", unit: "ریال" },
        ],
        nima: [
          { symbol: "NIMA_EUR", name: "یورو", name_en: "Euro", price_buy: "910000", price_sell: "920000", unit: "ریال" },
        ],
      },
    };

    const rates = normalizeBrsApiProCurrencyPayload(payload);
    expect(rates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ currencyCode: "USD", marketType: "FREE_MARKET", price: 859000 }),
        expect.objectContaining({ currencyCode: "USD", marketType: "SANA_BUY", price: 850000, buyRate: 850000, sellRate: 860000 }),
        expect.objectContaining({ currencyCode: "USD", marketType: "SANA_SELL", price: 860000, buyRate: 850000, sellRate: 860000 }),
        expect.objectContaining({ currencyCode: "EUR", marketType: "NIMA_BUY", price: 910000, buyRate: 910000, sellRate: 920000 }),
        expect.objectContaining({ currencyCode: "EUR", marketType: "NIMA_SELL", price: 920000, buyRate: 910000, sellRate: 920000 }),
      ])
    );
  });

  test("maps BRSAPI config and HTTP 402 failures to clean Persian errors", async () => {
    const originalKey = process.env.BRSAPI_KEY;
    const originalBaseUrl = process.env.BRSAPI_BASE_URL;
    const originalFetch = globalThis.fetch;
    try {
      delete process.env.BRSAPI_KEY;
      delete process.env.BRSAPI_BASE_URL;
      await expect(fetchBrsApiProCurrencyPayload()).rejects.toMatchObject({
        code: "BRSAPI_KEY_MISSING",
        message: "کلید BRSAPI در تنظیمات سرور ثبت نشده است",
      });

      process.env.BRSAPI_KEY = "test-secret-key";
      let requestedUrl = "";
      globalThis.fetch = (async (input) => {
        requestedUrl = String(input);
        return new Response("payment required", { status: 402 });
      }) as typeof fetch;
      await expect(fetchBrsApiProCurrencyPayload()).rejects.toMatchObject({
        code: "BRSAPI_PLAN_REQUIRED",
        httpStatus: 402,
        message: "دسترسی پلن BRSAPI برای این داده کافی نیست یا اعتبار کلید تمام شده است",
      });
      const endpoint = new URL(requestedUrl);
      expect(endpoint.origin + endpoint.pathname).toBe("https://api.brsapi.ir/Market/Gold_Currency_Pro.php");
      expect(endpoint.searchParams.get("key")).toBe("test-secret-key");
      expect(endpoint.searchParams.get("section")).toBe("currency");
    } finally {
      if (originalKey === undefined) delete process.env.BRSAPI_KEY;
      else process.env.BRSAPI_KEY = originalKey;
      if (originalBaseUrl === undefined) delete process.env.BRSAPI_BASE_URL;
      else process.env.BRSAPI_BASE_URL = originalBaseUrl;
      globalThis.fetch = originalFetch;
    }
  });

  test("keeps rates and tariff APIs readable for normal users while protecting management actions", async () => {
    const owner = await loginApi();
    const tenantEmail = uniqueEmail("rates-tenant");
    await readOk<any>(
      await owner.post("/api/admin/organizations/manual-signup", {
        data: {
          companyName: `Rates Tenant ${Date.now()}`,
          ownerName: "Rates Tenant Owner",
          ownerEmail: tenantEmail,
          password: "PlaywrightPass123!",
          planId: "starter",
          billingCycle: "monthly",
          contactPhone: "09120000000",
        },
      })
    );

    const tenant = await loginApi(tenantEmail, "PlaywrightPass123!");
    await readOk(await tenant.get("/api/rates/currency"));
    await readOk(await tenant.get("/api/rates/tariffs"));
    await expectForbidden(await tenant.post("/api/rates/currency/manual", { data: { currencyCode: "USD", marketType: "FREE_MARKET", price: 1000 } }));
    await expectForbidden(await tenant.post("/api/rates/tariffs/import", { multipart: { mode: "replace", dryRun: "true", file: { name: "tariffs.csv", mimeType: "text/csv", buffer: Buffer.from("code,title\n1,Sample") } } }));

    const ownerRatesPayload = await readOk<any>(await owner.get("/api/rates/currency"));
    expect(JSON.stringify(ownerRatesPayload)).not.toContain("BRSAPI_KEY");
    expect(ownerRatesPayload.adminDiagnostics?.endpoint || "").not.toContain("key=");

    await readOk(await owner.patch("/api/rates/currency/settings", { data: { isEnabled: true } }));
    const missingKeySync = await owner.post("/api/rates/currency/sync");
    expect(missingKeySync.status()).toBe(503);
    const missingKeyPayload = await missingKeySync.json();
    expect(missingKeyPayload.error.message).toBe("کلید BRSAPI در تنظیمات سرور ثبت نشده است");
    expect(missingKeyPayload.error.message).not.toContain("HTTP");
    const tenantRatesAfterFailure = await readOk<any>(await tenant.get("/api/rates/currency"));
    expect(JSON.stringify(tenantRatesAfterFailure)).not.toContain("BRSAPI Pro request failed with HTTP");

    await readOk(
      await owner.post("/api/rates/currency/manual", {
        data: { currencyCode: "USD", marketType: "FREE_MARKET", price: 900000, note: "E2E manual rate" },
      })
    );

    const tariffCsv = Buffer.from("tariffCode,titleFa,titleEn,category,chapter,unit,dutyRate,taxRate\n8501,موتور و ژنراتور,Motors and generators,Electrical,85,Set,5%,9%");
    const preview = await readOk<any>(
      await owner.post("/api/rates/tariffs/import", {
        multipart: {
          mode: "replace",
          dryRun: "true",
          file: {
            name: "e2e-tariffs.csv",
            mimeType: "text/csv",
            buffer: tariffCsv,
          },
        },
      })
    );
    expect(preview.valid).toBe(true);
    await readOk<any>(
      await owner.post("/api/rates/tariffs/import", {
        multipart: {
          mode: "replace",
          dryRun: "false",
          file: {
            name: "e2e-tariffs.csv",
            mimeType: "text/csv",
            buffer: tariffCsv,
          },
        },
      })
    );

    const tariffs = await readOk<any[]>(await tenant.get("/api/rates/tariffs?q=8501"));
    expect(tariffs.some((item) => item.tariffCode === "8501")).toBe(true);

    const twelveMbXlsxNamedCsv = Buffer.concat([
      Buffer.from("tariffCode,titleFa,titleEn\n9901,Large tariff,Large tariff\n", "utf8"),
      Buffer.alloc(12 * 1024 * 1024, " "),
    ]);
    const largePreview = await readOk<any>(
      await owner.post("/api/rates/tariffs/import", {
        multipart: {
          mode: "append",
          dryRun: "true",
          file: {
            name: "large-tariffs.xlsx",
            mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            buffer: twelveMbXlsxNamedCsv,
          },
        },
      })
    );
    expect(largePreview.valid).toBe(true);

    const oversized = await owner.post("/api/rates/tariffs/import", {
      multipart: {
        mode: "append",
        dryRun: "true",
        file: {
          name: "oversized.csv",
          mimeType: "text/csv",
          buffer: Buffer.alloc(26 * 1024 * 1024, "x"),
        },
      },
    });
    expect(oversized.status()).toBe(413);
    expect((await oversized.json()).error.message).toBe("حجم فایل تعرفه بیش از حد مجاز است");

    const unsupported = await owner.post("/api/rates/tariffs/import", {
      multipart: {
        mode: "append",
        dryRun: "true",
        file: { name: "tariffs.txt", mimeType: "text/plain", buffer: Buffer.from("tariffCode,titleFa\n1,Invalid") },
      },
    });
    expect(unsupported.status()).toBe(415);

    await owner.post("/api/auth/logout");
    await tenant.post("/api/auth/logout");
  });

  test("renders the rates page on desktop and mobile without horizontal overflow", async ({ page }) => {
    const owner = await loginApi();
    const tenantEmail = uniqueEmail("rates-ui-tenant");
    await readOk<any>(
      await owner.post("/api/admin/organizations/manual-signup", {
        data: {
          companyName: `Rates UI Tenant ${Date.now()}`,
          ownerName: "Rates UI Tenant Owner",
          ownerEmail: tenantEmail,
          password: "PlaywrightPass123!",
          planId: "starter",
          billingCycle: "monthly",
          contactPhone: "09120000000",
        },
      })
    );
    await disposeContexts(owner);

    await page.setViewportSize({ width: 1440, height: 900 });
    await loginViaUi(page);
    await page.goto("/rates");
    await expect(page.getByTestId("rates-page")).toBeVisible();
    await expect(page.getByRole("heading", { name: "نرخ‌ها و تعرفه‌ها" })).toBeVisible();
    await expect(page.locator('nav a[href="/rates"]').first()).toBeVisible();
    for (const code of ["USD", "EUR", "AED", "CNY", "INR", "TRY", "OMR", "QAR"]) {
      const row = page.getByTestId(`currency-row-${code}`);
      await expect(row).toBeVisible();
      await expect(row.getByTestId(`currency-flag-${code}`)).toBeVisible();
      const source = row.getByTestId(`rate-source-${code}`);
      await expect(source).toBeVisible();
      const rowText = (await row.textContent()) || "";
      const sourceText = ((await source.textContent()) || "").trim();
      expect(rowText.split(sourceText).length - 1).toBe(1);
    }
    await expect(page.getByTestId("currency-row-USD")).toContainText("USD");
    await expect(page.getByTestId("currency-row-EUR")).toContainText("EUR");
    await expect(page.getByRole("columnheader", { name: "منبع" })).toBeVisible();
    await expect(page.getByTestId("rates-settings-button")).toBeVisible();
    await expect(page.getByTestId("rates-manual-button")).toBeVisible();
    await expect(page.getByTestId("rates-sync-button")).toBeVisible();
    const firstRateCellAlign = await page.getByTestId("currency-row-USD").locator("td").nth(1).evaluate((node) => getComputedStyle(node).textAlign);
    expect(firstRateCellAlign).toBe("center");
    const unavailableChip = page.getByTestId("rate-unavailable-chip").first();
    await expect(unavailableChip).toBeVisible();
    const unavailableBox = await unavailableChip.boundingBox();
    expect(unavailableBox?.height || 0).toBeLessThan(40);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)).toBe(false);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await expect(page.getByTestId("rates-page")).toBeVisible();
    await expect(page.getByTestId("currency-card-USD")).toBeVisible();
    await expect(page.getByTestId("currency-card-USD").getByTestId("currency-flag-USD")).toBeVisible();
    await expect(page.getByTestId("currency-card-USD")).toContainText("USD");
    await expect(page.getByTestId("mobile-rate-source-USD")).toBeVisible();
    const mobileUsdText = (await page.getByTestId("currency-card-USD").textContent()) || "";
    expect(mobileUsdText.split("منبع:").length - 1).toBe(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)).toBe(false);

    await page.request.post("/api/auth/logout");
    await loginViaUi(page, tenantEmail, "PlaywrightPass123!");
    await page.goto("/rates");
    await expect(page.getByTestId("rates-page")).toBeVisible();
    await expect(page.getByTestId("rates-settings-button")).toHaveCount(0);
    await expect(page.getByTestId("rates-manual-button")).toHaveCount(0);
    await expect(page.getByTestId("rates-sync-button")).toHaveCount(0);
    await expect(page.getByTestId("rates-admin-diagnostics")).toHaveCount(0);
  });
});
