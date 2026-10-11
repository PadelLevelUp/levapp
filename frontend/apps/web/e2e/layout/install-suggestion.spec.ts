import { test, expect } from "@playwright/test";
import { loginAsCoach, loginAsStudent } from "../helpers/auth";
import { openDashboard } from "../helpers/navigation";

/**
 * PAD-573 — mobile.install-suggestion rules 1, 3, 4: on an iPhone-class browser a signed-in
 * student sees the "get the iOS app" card above the page with the App Store link; dismissing it
 * hides it across reloads (30 days on the device); a coach on the same phone, and a student on
 * the default desktop browser, see nothing. The user agent is the only thing that makes a
 * browser an "iPhone" here, so each case pins it with `test.use`.
 */

const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const PHONE = { width: 390, height: 844 };

test.describe("student on an iPhone", () => {
  test.use({ userAgent: IPHONE_UA, viewport: PHONE });

  test("PAD-573: sees the suggestion with the App Store link, and dismissing it hides it across reloads", async ({ page }) => {
    await loginAsStudent(page);
    await openDashboard(page);

    const banner = page.getByTestId("install-app-banner");
    await expect(banner).toBeVisible({ timeout: 10000 });
    // The literal is a deliberate pin of rule 2's URL (e2e specs do not import @levelup/config).
    await expect(page.getByTestId("install-app-open")).toHaveAttribute("href", "https://apps.apple.com/app/id6794271800");
    // Rule 4: never a hold — the page's own content is still there under it.
    await expect(page.locator("main")).toBeVisible();

    await page.getByTestId("install-app-dismiss").click();
    await expect(banner).toHaveCount(0);

    await page.reload();
    await expect(page.locator("main")).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId("install-app-banner")).toHaveCount(0);
  });
});

test.describe("coach on an iPhone", () => {
  test.use({ userAgent: IPHONE_UA, viewport: PHONE });

  test("PAD-573: a coach never sees it", async ({ page }) => {
    await loginAsCoach(page);
    await openDashboard(page);
    await expect(page.locator("main")).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId("install-app-banner")).toHaveCount(0);
  });
});

test("PAD-573: a student on the desktop browser sees nothing", async ({ page }) => {
  await loginAsStudent(page);
  await openDashboard(page);
  await expect(page.locator("main")).toBeVisible({ timeout: 10000 });
  await expect(page.getByTestId("install-app-banner")).toHaveCount(0);
});

/**
 * PAD-628 (B-565) — mobile.install-suggestion rule 4a: on the narrowest phones the card is a slim
 * strip. At 320 px it used to grow to 310 px tall (one word per line beside a button that would
 * not shrink) and at 375 px to 186 px, about a third of the screen. Pinned at both widths, on the
 * page QA reported (calendar) and on a page with a real first heading (settings).
 */
const STRIP_MAX_HEIGHT = 72;

for (const width of [320, 375] as const) {
  test.describe(`student on a ${width} px iPhone`, () => {
    test.use({ userAgent: IPHONE_UA, viewport: { width, height: width === 320 ? 568 : 667 } });

    test(`PAD-628: the card is a slim strip that never covers the page's first heading (${width} px)`, async ({ page }) => {
      await loginAsStudent(page);
      await page.goto("/settings");
      const banner = page.getByTestId("install-app-banner");
      await expect(banner).toBeVisible({ timeout: 10000 });
      const heading = page.locator("main h1").first();
      await expect(heading).toBeVisible();

      const b = (await banner.boundingBox())!;
      const h = (await heading.boundingBox())!;
      expect(b.height, `banner height at ${width} px`).toBeLessThanOrEqual(STRIP_MAX_HEIGHT);
      expect(b.y + b.height, "banner bottom vs first heading top").toBeLessThanOrEqual(h.y);
      // The layout does not break: nothing scrolls sideways.
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      // Still dismissible: the close control is on screen and works.
      const dismiss = page.getByTestId("install-app-dismiss");
      await expect(dismiss).toBeInViewport();
      await dismiss.click();
      await expect(banner).toHaveCount(0);
    });

    test(`PAD-628: on the calendar the strip stays slim and the page starts below it (${width} px)`, async ({ page }) => {
      await loginAsStudent(page);
      await page.goto("/calendar");
      const banner = page.getByTestId("install-app-banner");
      await expect(banner).toBeVisible({ timeout: 10000 });
      const main = page.locator("main");
      await expect(main).toBeVisible();
      const b = (await banner.boundingBox())!;
      const m = (await main.boundingBox())!;
      expect(b.height, `banner height at ${width} px`).toBeLessThanOrEqual(STRIP_MAX_HEIGHT);
      expect(b.y + b.height, "banner bottom vs page top").toBeLessThanOrEqual(m.y);
      await expect(page.getByTestId("install-app-open")).toBeInViewport();
    });
  });
}
