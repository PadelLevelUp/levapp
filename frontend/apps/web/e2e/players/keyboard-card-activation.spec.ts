/**
 * PAD-148 — Player cards must be reachable and activatable by keyboard.
 *
 * The weekly QA sweep (2026-08-30) measured that on `/players`, Tab walked from
 * the search box straight to the pagination buttons, past all 27 player cards:
 * they were plain `<div>`s with an onClick and `cursor-pointer` and nothing
 * else. Opening a player is the entry point to evaluations, strengths &
 * weaknesses, level/side and notes, so that whole branch was mouse-only.
 *
 * Spec: players.list rule 8 / "Player card is reachable and activatable by
 * keyboard". Generalised by compass rule R-026.
 *
 * Run a single test:
 *   npx playwright test e2e/players/keyboard-card-activation.spec.ts
 */
import { test, expect, type Locator, type Page } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { openPlayers } from "../helpers/navigation";

const PLAYER = "E2E Student";

/**
 * Walk forward with Tab from the search box until `target` holds focus.
 * This is the sweep's repro step, not a proxy for it: a `tabIndex`-less card
 * is skipped by this loop exactly as it was skipped by the human tabbing.
 */
async function tabUntilFocused(page: Page, target: Locator, maxTabs = 12) {
  for (let i = 0; i < maxTabs; i++) {
    await page.keyboard.press("Tab");
    if (await target.evaluate((el) => el === document.activeElement)) return i + 1;
  }
  return -1;
}

async function findCard(page: Page): Promise<Locator> {
  await page.getByPlaceholder("Search players...").fill(PLAYER);
  const card = page
    .getByRole("button", { name: new RegExp(`open player ${PLAYER}`, "i") })
    .first();
  await expect(card, "the player card must be exposed as a button").toBeVisible();
  return card;
}

test.describe("PAD-148: player card keyboard access", () => {
  test("PAD-148: Tab reaches the player card and Enter opens the player", async ({
    page,
  }) => {
    await loginAsCoach(page);
    await openPlayers(page);

    const card = await findCard(page);

    await page.getByPlaceholder("Search players...").focus();
    const tabs = await tabUntilFocused(page, card);
    expect(tabs, "Tab must reach the player card, not walk past it").toBeGreaterThan(0);

    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/players\/\d+/);
  });

  test("PAD-148: Space activates the focused player card without scrolling", async ({
    page,
  }) => {
    await loginAsCoach(page);
    await openPlayers(page);

    const card = await findCard(page);
    await card.focus();

    const scrollBefore = await page.evaluate(() => window.scrollY);
    await page.keyboard.press(" ");

    await expect(page).toHaveURL(/\/players\/\d+/);
    expect(
      await page.evaluate(() => window.scrollY),
      "Space must be preventDefault()ed so it activates instead of scrolling"
    ).toBe(scrollBefore);
  });
});
