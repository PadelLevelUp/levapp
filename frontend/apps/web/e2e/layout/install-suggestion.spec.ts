import { test, expect } from "@playwright/test";
import { loginAsCoach, loginAsStudent } from "../helpers/auth";
import { openDashboard } from "../helpers/navigation";
import { ui } from "../helpers/i18n";

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
 * strip. At 320 px it used to grow to 306 px tall (one word per line beside a button that would
 * not shrink) and at 375 px to 218 px, about a third of the screen. Pinned at both widths, on the
 * page QA reported (calendar) and on a page with a real first heading (settings).
 */
// Strip arithmetic: 8 px padding top and bottom, two 20 px title lines, a 1 px border each side ≈ 58 px;
// the bound leaves room for font metrics, and staging's card was 306 / 218 px.
const STRIP_MAX_HEIGHT = 72;
// The title may take two 20 px lines, never the one-word-per-line column of the bug.
const TITLE_MAX_HEIGHT = 2 * 20 + 4;
const PHONES = [
  [320, 568],
  [375, 667],
] as const;

async function noSidewaysScroll(page: import("@playwright/test").Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, "page scrolls sideways").toBeLessThanOrEqual(0);
}

for (const [width, height] of PHONES) {
  test.describe(`student on a ${width} px iPhone`, () => {
    test.use({ userAgent: IPHONE_UA, viewport: { width, height } });

    test(`PAD-628: the card is a slim strip before the page's first heading (${width} px)`, async ({ page }) => {
      await loginAsStudent(page);
      await page.goto("/settings");
      const banner = page.getByTestId("install-app-banner");
      await expect(banner).toBeVisible({ timeout: 10000 });
      // R-032: the heading is the settings page's own title, not whatever h1 renders first.
      const heading = page.getByRole("main").getByRole("heading", { level: 1 }).first();
      await expect(heading).toHaveText(ui("settings.title"));

      const b = (await banner.boundingBox())!;
      const h = (await heading.boundingBox())!;
      expect(b.height, `banner height at ${width} px`).toBeLessThanOrEqual(STRIP_MAX_HEIGHT);
      const title = (await page.getByTestId("install-app-title").boundingBox())!;
      expect(title.height, `title height at ${width} px`).toBeLessThanOrEqual(TITLE_MAX_HEIGHT);
      // Layout order (rule 4: in flow, above the content): the card ends before the heading starts.
      expect(b.y + b.height, "banner bottom vs first heading top").toBeLessThanOrEqual(h.y);
      await noSidewaysScroll(page);
      // The open link's accessible name contains its visible label (WCAG 2.5.3).
      await expect(page.getByTestId("install-app-open")).toHaveAccessibleName(ui("installApp.openShort", { exact: false }));
      // Still dismissible: the close control is wholly on screen and works.
      const dismiss = page.getByTestId("install-app-dismiss");
      await expect(dismiss).toBeInViewport({ ratio: 1 });
      await dismiss.click();
      await expect(banner).toHaveCount(0);
    });

    test(`PAD-628: on the calendar the strip stays slim and the page starts below it (${width} px)`, async ({ page }) => {
      await loginAsStudent(page);
      await page.goto("/calendar");
      const banner = page.getByTestId("install-app-banner");
      await expect(banner).toBeVisible({ timeout: 10000 });
      const main = page.getByRole("main");
      await expect(main).toBeVisible();
      const b = (await banner.boundingBox())!;
      const m = (await main.boundingBox())!;
      expect(b.height, `banner height at ${width} px`).toBeLessThanOrEqual(STRIP_MAX_HEIGHT);
      expect(b.y + b.height, "banner bottom vs page top").toBeLessThanOrEqual(m.y);
      await noSidewaysScroll(page);
      await expect(page.getByTestId("install-app-open")).toBeInViewport({ ratio: 1 });
      await expect(page.getByTestId("install-app-dismiss")).toBeInViewport({ ratio: 1 });
    });
  });
}
