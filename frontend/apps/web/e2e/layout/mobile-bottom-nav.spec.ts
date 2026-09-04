import { test, expect, type Page } from "@playwright/test";
import { loginAsCoach, loginAsStudent } from "../helpers/auth";

/**
 * PAD-183: the mobile bottom nav overflowed at 390px wide with Portuguese
 * labels — measured scrollWidth 428 vs clientWidth 390, clipping "Definições"
 * (Settings) past the right edge (PAD-152 audit finding §12/L3).
 *
 * Product decision (2026-09-04): Settings leaves the bottom bar on both
 * platforms; it stays reachable from the account avatar. This spec pins that
 * decision on web:
 *  - Settings is no longer one of the bottom nav's tabs (coach or student).
 *  - The remaining tabs fit the bar at 390px, in Portuguese, for both roles.
 *  - The avatar/account menu in the mobile header still opens Settings.
 *
 * The desktop sidebar is untouched — it still lists Settings — so this spec
 * only runs at the mobile viewport.
 *
 * Language is forced to pt by rewriting `GET /api/auth/me`, not through
 * Settings: the E2E users are seeded `language: "en"`, and switching via the
 * UI would leak pt into the shared seed DB for later specs (same pattern as
 * e2e/availability/mobile-layout.spec.ts).
 */

const VIEWPORT = { width: 390, height: 844 };

test.use({ viewport: VIEWPORT });

async function forcePortuguese(page: Page) {
  await page.route("**/api/auth/me", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    await route.fulfill({
      response,
      body: JSON.stringify({ ...body, language: "pt" }),
    });
  });
}

/** The bottom nav bar itself must not overflow the viewport. */
async function expectNavFitsViewport(page: Page) {
  const nav = page.getByTestId("mobile-bottom-nav");
  await expect(nav).toBeVisible();
  const { scrollWidth, clientWidth } = await nav.evaluate((el: HTMLElement) => ({
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
  }));
  expect(
    scrollWidth,
    `mobile bottom nav overflows (${scrollWidth}px of content in a ${clientWidth}px bar)`
  ).toBeLessThanOrEqual(clientWidth);
}

test.describe("PAD-183: mobile bottom nav fits at 390px and drops Settings", () => {
  test("US-PAD183: coach bottom nav has no Settings tab and fits the bar in Portuguese", async ({
    page,
  }) => {
    await forcePortuguese(page);
    await loginAsCoach(page);
    await page.waitForURL((url) =>
      url.pathname === "/" || url.pathname === "/dashboard"
    );

    const nav = page.getByTestId("mobile-bottom-nav");
    await expect(nav).toBeVisible();
    await expect(
      nav.getByRole("link", { name: /definições/i })
    ).toHaveCount(0);

    await expectNavFitsViewport(page);
  });

  test("US-PAD183: student bottom nav has no Settings tab and fits the bar in Portuguese", async ({
    page,
  }) => {
    await forcePortuguese(page);
    await loginAsStudent(page);
    await page.waitForURL((url) =>
      url.pathname === "/" || url.pathname === "/dashboard"
    );

    const nav = page.getByTestId("mobile-bottom-nav");
    await expect(nav).toBeVisible();
    await expect(
      nav.getByRole("link", { name: /definições/i })
    ).toHaveCount(0);

    await expectNavFitsViewport(page);
  });

  test("US-PAD183: avatar menu in the mobile header still opens Settings", async ({
    page,
  }) => {
    await forcePortuguese(page);
    await loginAsCoach(page);
    await page.waitForURL((url) =>
      url.pathname === "/" || url.pathname === "/dashboard"
    );

    await page.getByTestId("user-menu-trigger").click();
    const settingsItem = page.getByTestId("user-menu-settings");
    await expect(settingsItem).toBeVisible({ timeout: 5_000 });
    await settingsItem.click();
    await page.waitForURL("**/settings");

    // The settings page re-checks auth on mount, which can still be in flight
    // when the test ends; unroute so that in-flight callback doesn't throw
    // ("Test ended") after teardown starts.
    await page.unrouteAll({ behavior: "ignoreErrors" });
  });
});
