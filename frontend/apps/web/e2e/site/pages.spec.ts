/**
 * PAD-656 (auth.landing-page rules 3–9, 15): the three audience pages of the new site. Every
 * assertion is by test id or attribute (no rendered copy: the English-sweep guard). Until the switch
 * commit mounts the site at `/`, each test skips itself.
 *
 * Run:
 *   npx playwright test e2e/site/pages.spec.ts
 */
import { expect, test, type Page } from "@playwright/test";

import { SITE_WIDTHS, expectFitsViewport } from "./widths";

async function openSite(page: Page, query = "") {
  await page.goto(`/${query}`);
  // The site is a lazy chunk behind the launch screen: wait for it before deciding it is absent.
  const mounted = await page
    .getByTestId("site")
    .waitFor({ state: "attached", timeout: 20_000 })
    .then(() => true, () => false);
  test.skip(!mounted, "PAD-656: the site is not mounted until the switch commit");
}

const SECTIONS = {
  coaches: ["site-coaches-hero", "site-coaches-benefits", "site-calendar", "site-coaches-how", "site-demo-two-phones", "site-coaches-results", "site-tactical-board", "site-coaches-cta"],
  players: ["site-players-hero", "site-players-benefits", "site-players-availability", "site-players-how", "site-players-results", "site-players-free", "site-players-cta"],
  others: ["site-others-hero", "site-others-ideas", "site-others-contact"],
} as const;

for (const width of [390, 1280]) {
  test.describe(`the audience pages at ${width} px`, () => {
    test.use({ viewport: { width, height: 900 } });

    test("each audience shows its own sections and none shows a price (rules 3, 5)", async ({ page }) => {
      for (const [audience, query] of [["coaches", ""], ["players", "?para=jogadores"], ["others", "?para=outros"]] as const) {
        await openSite(page, query);
        await expect(page.getByTestId(`site-page-${audience}`)).toBeVisible();
        for (const id of SECTIONS[audience]) await expect(page.getByTestId(id), `${audience}: ${id}`).toBeAttached();
        await expect(page.locator("#preco")).toHaveCount(0);
        await expectFitsViewport(page, `${audience} @${width}`);
      }
    });

    test("the App Store button sits under the hero for coaches and players, and in players' free section (rule 15)", async ({ page }) => {
      await openSite(page);
      await expect(page.locator('[data-testid="site-app-store"]')).toHaveCount(1);
      await openSite(page, "?para=jogadores");
      await expect(page.locator('[data-testid="site-app-store"][data-placement="hero"]')).toHaveCount(1);
      await expect(page.locator('[data-testid="site-app-store"][data-placement="free"]')).toHaveCount(1);
      for (const link of await page.getByTestId("site-app-store").all()) {
        await expect(link).toHaveAttribute("href", /apps\.apple\.com\/.*id6794271800/);
        await expect(link).toHaveAttribute("target", "_blank");
        await expect(link).toHaveAttribute("rel", /noopener/);
      }
      await openSite(page, "?para=outros");
      await expect(page.getByTestId("site-app-store")).toHaveCount(0);
    });
  });
}

test("Recebi um convite explains the coach's link in place, with a way to sign up anyway (rule 6)", async ({ page }) => {
  await openSite(page, "?para=jogadores");
  const toggle = page.getByTestId("site-players-invite");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByTestId("site-players-invite-panel")).toBeVisible();
  await expect(page.getByTestId("site-players-invite-signup")).toHaveAttribute("href", "/signup");
  await expect(page).toHaveURL(/\?para=jogadores$/);
});

test("the closing calls rotate the audience (rule 6)", async ({ page }) => {
  await openSite(page);
  await page.getByTestId("site-cta-switch").click();
  await expect(page.getByTestId("site-page-players")).toBeVisible();
  await expect(page).toHaveURL(/para=jogadores/);
  await page.getByTestId("site-cta-switch").click();
  await expect(page.getByTestId("site-page-coaches")).toBeVisible();
  await openSite(page, "?para=outros");
  await page.getByTestId("site-others-hero-coaches").click();
  await expect(page.getByTestId("site-page-coaches")).toBeVisible();
});

test("switching the audience from the header keeps the scroll position (rule 3)", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openSite(page);
  await page.evaluate(() => window.scrollTo(0, 900));
  await expect.poll(() => page.evaluate(() => Math.round(window.scrollY))).toBe(900);
  await page.getByTestId("site-audience").click();
  await page.getByTestId("site-audience-players").click();
  await expect(page.getByTestId("site-page-players")).toBeVisible();
  await expect(page).toHaveURL(/para=jogadores/);
  expect(await page.evaluate(() => Math.round(window.scrollY))).toBe(900);
});

test("the two-phone demo steps once it is seen and stops on a step press (rule 9)", async ({ page }) => {
  await openSite(page);
  // After the site is up (a frozen clock would hold the launch screen), before the demo is seen.
  await page.clock.install();
  const demo = page.getByTestId("site-demo-two-phones");
  await demo.scrollIntoViewIfNeeded();
  await expect(demo).toHaveAttribute("data-step", "0");
  await page.clock.runFor(5900);
  await expect(demo).toHaveAttribute("data-step", "1");
  await page.getByTestId("site-demo-step-3").click();
  await expect(demo).toHaveAttribute("data-step", "3");
  await expect(page.getByTestId("site-demo-step-3")).toHaveAttribute("aria-pressed", "true");
  await page.clock.runFor(12_000);
  await expect(demo).toHaveAttribute("data-step", "3");
});

test("with reduced motion the demo never advances by itself (rule 9)", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openSite(page);
  await page.clock.install();
  const demo = page.getByTestId("site-demo-two-phones");
  await demo.scrollIntoViewIfNeeded();
  await page.clock.runFor(20_000);
  await expect(demo).toHaveAttribute("data-step", "0");
});

test("no audience page scrolls sideways at any width (rule 8)", async ({ page }) => {
  for (const query of ["", "?para=jogadores", "?para=outros"]) {
    for (const width of SITE_WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      await openSite(page, query);
      await expectFitsViewport(page, `${query || "coaches"} @${width}`);
      if (width <= 992) {
        await page.getByTestId("site-burger").click();
        await expect(page.getByTestId("site-menu")).toBeVisible();
        await expectFitsViewport(page, `${query || "coaches"} menu @${width}`);
        await page.getByTestId("site-burger").click();
      }
    }
  }
});
