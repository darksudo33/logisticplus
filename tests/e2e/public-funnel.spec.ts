import { expect, test } from "@playwright/test";
import { apiContext, disposeContexts, loginApi, readOk } from "./helpers";

const CONTACT_HREF = "/contact";
const publicRoutes = ["/", "/pricing", "/signup", "/signup/pending", "/login", "/contact"];
const viewports = [
  { name: "desktop", width: 1280, height: 720 },
  { name: "mobile", width: 390, height: 844 },
];
const landingImagePaths = [
  "/landing/logisticplus-hero-port.webp",
  "/landing/logisticplus-documents-control.webp",
  "/landing/logisticplus-dashboard-operations.webp",
  "/landing/logisticplus-tracking-mobile.webp",
];

function isIgnorableDevServerMessage(message: string) {
  return (
    message.includes("WebSocket connection to") ||
    message.includes("[vite] failed to connect to websocket") ||
    message.includes("WebSocket closed without opened") ||
    message.includes("favicon.ico")
  );
}

for (const viewport of viewports) {
  test.describe(`public launch funnel (${viewport.name})`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    for (const route of publicRoutes) {
      test(`${route} renders without blank shell and exposes contact action`, async ({ page }) => {
        const consoleErrors: string[] = [];
        page.on("console", (message) => {
          if (message.type() === "error" && !isIgnorableDevServerMessage(message.text())) {
            consoleErrors.push(message.text());
          }
        });
        page.on("pageerror", (error) => {
          if (!isIgnorableDevServerMessage(error.message)) consoleErrors.push(error.message);
        });

        await page.goto(route);
        await expect(page.locator("h1").first()).toBeVisible();
        const visibleContactLinks = page.locator(`a[href="${CONTACT_HREF}"]`).filter({ visible: true });
        await expect(visibleContactLinks.first()).toBeVisible();

        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
        expect(overflow).toBe(false);
        expect(consoleErrors).toEqual([]);
      });
    }

    test("/pricing keeps direct signup links for plan selection", async ({ page }) => {
      await page.goto("/pricing");
      await expect(page.locator("h1").first()).toBeVisible();
      const planLinks = page.locator('a[href*="/signup?plan="]');
      await expect(planLinks).toHaveCount(3);
      await expect(planLinks.filter({ hasText: "ثبت‌نام" }).first()).toBeVisible();
      await expect(page.locator("body")).toContainText("SMS");
      await expect(page.locator("body")).toContainText("افزونه");
    });

    test("/ landing advertises SMS alert capability", async ({ page }) => {
      await page.goto("/");
      await expect(page.locator("body")).toContainText("SMS");
      await expect(page.locator("body")).toContainText("دمیوراژ");
      await expect(page.locator("body")).toContainText("وضعیت");
    });

    test("/ landing uses local Liara-served images and keeps hero CTA accessible", async ({ page }) => {
      await page.goto("/");
      await expect(page.locator("h1").first()).toBeVisible();

      const localImages = page.locator('img[data-testid="landing-local-image"]');
      await expect(localImages).toHaveCount(landingImagePaths.length);

      const srcs = await localImages.evaluateAll((images) =>
        images.map((image) => image.getAttribute("src") || "").sort()
      );
      expect(srcs).toEqual([...landingImagePaths].sort());
      expect((await page.content()).includes("images.unsplash.com")).toBe(false);
      expect(srcs.some((src) => /^https?:\/\//.test(src))).toBe(false);

      const heroCta = page.locator('[data-testid="landing-hero-cta"] a').first();
      await heroCta.scrollIntoViewIfNeeded();
      await expect(heroCta).toBeVisible();
      await expect(heroCta).toBeInViewport();
      const heroCtaReceivesPointer = await heroCta.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const topElement = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        return !!topElement && (topElement === element || element.contains(topElement));
      });
      expect(heroCtaReceivesPointer).toBe(true);

      for (const imagePath of landingImagePaths) {
        const image = page.locator(`img[data-testid="landing-local-image"][src="${imagePath}"]`);
        await expect(image).toHaveCount(1);
        await image.scrollIntoViewIfNeeded();
        await expect(image).toBeVisible();
        await expect.poll(async () => image.evaluate((node) => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
        await expect.poll(async () => image.evaluate((node) => (node as HTMLImageElement).naturalHeight)).toBeGreaterThan(0);
      }

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
      expect(overflow).toBe(false);
    });

    test("/login does not prefill internal admin email", async ({ page }) => {
      await page.goto("/login");
      await expect(page.locator('input[type="email"]')).toHaveValue("");
      await expect(page.locator("body")).not.toContainText("darksudo22@gmail.com");
    });

    test("contact requests validate, submit, and resolve through admin", async () => {
      const publicContext = await apiContext();
      const admin = await loginApi();

      const invalid = await publicContext.post("/api/contact-requests", {
        data: {
          companyName: "E2E Contact Company",
          contactName: "E2E Contact Person",
        },
      });
      expect(invalid.status()).toBe(400);

      const created = await readOk<any>(
        await publicContext.post("/api/contact-requests", {
          data: {
            companyName: `E2E Contact ${Date.now()}`,
            contactName: "E2E Contact Person",
            contactPhone: "09120000000",
            preferredContactMethod: "phone",
            message: "Please call for a short product consultation.",
          },
        })
      );

      const requests = await readOk<any[]>(await admin.get("/api/admin/contact-requests"));
      expect(requests.some((request) => request.id === created.id && request.status === "new")).toBe(true);

      const resolved = await readOk<any>(await admin.post(`/api/admin/contact-requests/${created.id}/resolve`));
      expect(resolved.status).toBe("resolved");

      await disposeContexts(publicContext, admin);
    });
  });
}
