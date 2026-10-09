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
