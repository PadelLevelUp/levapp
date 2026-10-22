import { test, expect } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { ui } from "../helpers/i18n";
import { plantSentinel, sentinel } from "./public-site";
import { expectFitsViewport } from "./widths";

/**
 * The public site at `/` (PAD-656, auth.landing-page rules 1, 3, 4, 8, 9): the layout level —
 * header, audience switch, footer. Ported from the old e2e/landing/landing-page.spec.ts.
 * The audience pages' content (sections, App Store placements, the invite panel, the closing CTA's
 * rotation, the scroll the switch keeps) is covered by e2e/site/pages.spec.ts.
 *
 * Pre-auth pages render in the default locale (pt); the assertions use ids and `ui()` keys.
 * Desktop width unless a test sets another: the header's buttons are in the ☰ menu at 992px and
 * below.
 */
test.use({ viewport: { width: 1280, height: 800 } });

test.describe("public site", () => {
  test("a visitor with no session gets the site at /", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByTestId("site")).toBeVisible();
    await expect(page.getByTestId("site-audience")).toHaveAttribute("data-audience", "coaches");
    await expect(page).toHaveURL(/\/$/);
    // The public page must never leak the app shell.
    await expect(page.getByRole("link", { name: ui("nav.calendar") })).toHaveCount(0);
  });

  test("the site's Entrar button goes to the login form", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("site-login").click();

    await page.waitForURL("**/auth");
    await expect(page.locator("#username")).toBeVisible();
  });

  test("a signed-in user gets the dashboard at /, not the site", async ({ page }) => {
    await loginAsCoach(page);
    await page.goto("/");

    await expect(
      page.getByRole("navigation").getByRole("link", { name: ui("nav.calendar") }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("site")).toHaveCount(0);
  });

  test("the footer links reach the legal pages", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("site-footer-privacy").click();
    await page.waitForURL("**/privacy");

    await page.goto("/");
    await page.getByTestId("site-footer-terms").click();
    await page.waitForURL("**/terms");
  });

  // Rule 17: the footer's Contacto is the way in to the contact page.
  test("PAD-656: the footer's contact link reaches the contact page", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("site-footer-contact").click();
    await page.waitForURL("**/contacto");
    await expect(page.getByTestId("contact-page")).toBeVisible();
  });

  test("PAD-656: at phone width the header collapses into a menu that holds Entrar and the demo button", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await expect(page.getByTestId("site-burger")).toBeVisible();
    await expect(page.getByTestId("site-login")).toBeHidden();
    await expect(page.getByTestId("site-demo")).toBeHidden();
    await expect(page.getByTestId("site-menu")).toHaveCount(0);

    await page.getByTestId("site-burger").click();
    const menu = page.getByTestId("site-menu");
    await expect(menu).toBeVisible();
    await expect(menu.getByTestId("site-menu-login")).toBeVisible();
    await expect(menu.getByTestId("site-menu-demo")).toBeVisible();
    await expectFitsViewport(page, "/ at 390 with the menu open");
  });
});

test.describe("public site — the audience switch (PAD-582, PAD-656)", () => {
  test("PAD-582: the header dropdown swaps the audience in place and writes ?para=", async ({ page }) => {
    await page.goto("/");
    const select = page.getByTestId("site-audience");
    await expect(select).toHaveAttribute("data-audience", "coaches");
    // The audience is chosen in the header only: no tablist anywhere (rule 3).
    await expect(page.getByRole("tablist")).toHaveCount(0);
    // Coaches get the three section links.
    await expect(page.getByTestId("site-nav").getByRole("link")).toHaveCount(3);

    // A document-level sentinel: it survives an in-place change and dies with a reload.
    await plantSentinel(page);
    await select.click();
    await expect(page.getByTestId("site-audience-coaches")).toHaveAttribute("aria-current", "true");
    await expect(page.getByTestId("site-audience-players")).not.toHaveAttribute("aria-current", "true");
    await page.getByTestId("site-audience-players").click();
    await expect(select).toHaveAttribute("data-audience", "players");
    await expect(page).toHaveURL(/\/\?para=jogadores$/);
    await expect(page.getByTestId("site-nav").getByRole("link")).toHaveCount(3);
    expect(await sentinel(page)).toBe(true);

    await select.click();
    await expect(page.getByTestId("site-audience-players")).toHaveAttribute("aria-current", "true");
    await page.getByTestId("site-audience-others").click();
    await expect(select).toHaveAttribute("data-audience", "others");
    await expect(page).toHaveURL(/\/\?para=outros$/);
    // "Others" has no benefits / how / results sections, so the header has no such links.
    await expect(page.getByTestId("site-nav").getByRole("link")).toHaveCount(0);
    expect(await sentinel(page)).toBe(true);
  });

  test("PAD-582: choosing drops the older ?audience= and keeps unrelated parameters", async ({ page }) => {
    await page.goto("/?utm_source=campaign&audience=alunos");
    await expect(page.getByTestId("site-audience")).toHaveAttribute("data-audience", "players");
    await page.getByTestId("site-audience").click();
    await page.getByTestId("site-audience-coaches").click();
    await expect(page).toHaveURL(/\/\?utm_source=campaign&para=treinadores$/);
  });

  test("PAD-582: at phone width the audience control is in the header and on screen", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    const select = page.getByTestId("site-audience");
    await expect(select).toBeVisible();
    await expect(select).toBeInViewport();
    await expect(select).toHaveAttribute("data-audience", "coaches");
    const box = await select.boundingBox();
    expect(box && box.x + box.width).toBeLessThanOrEqual(375);
  });

  for (const [url, audience] of [
    ["/?para=jogadores", "players"],
    ["/?para=treinadores", "coaches"],
    ["/?para=outros", "others"],
    ["/?audience=alunos", "players"],
    ["/?audience=players", "players"],
    ["/?audience=outros", "others"],
    // Anything unknown falls back to coaches.
    ["/?audience=nope", "coaches"],
  ] as const) {
    test(`PAD-582: ${url} opens the ${audience} audience`, async ({ page }) => {
      await page.goto(url);
      await expect(page.getByTestId("site-audience")).toHaveAttribute("data-audience", audience);
      await page.getByTestId("site-audience").click();
      await expect(page.getByTestId(`site-audience-${audience}`)).toHaveAttribute("aria-current", "true");
    });
  }

  test("PAD-582: ?para= wins over the older ?audience=", async ({ page }) => {
    await page.goto("/?para=outros&audience=alunos");
    await expect(page.getByTestId("site-audience")).toHaveAttribute("data-audience", "others");
  });
});
