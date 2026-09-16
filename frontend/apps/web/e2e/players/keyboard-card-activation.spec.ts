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

const CARD_NAME = new RegExp(`open player ${PLAYER}`, "i");

/**
 * Walk forward with Tab from the search box until the focused element IS the
 * card — judged by its accessible name, not by node identity, because the
 * list re-renders (new nodes) whenever a fetch lands, and a stale node
 * comparison reads as "walked past" when nothing walked anywhere.
 * This is the sweep's repro step, not a proxy for it: a `tabIndex`-less card
 * is skipped by this loop exactly as it was skipped by the human tabbing.
 */
async function tabUntilFocused(page: Page, name: RegExp, maxTabs = 12) {
  for (let i = 0; i < maxTabs; i++) {
    await page.keyboard.press("Tab");
    const label = await page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? "");
    if (name.test(label)) return i + 1;
  }
  return -1;
}

/**
 * Hardening (wave 3): the search is debounced and fetched server-side. The
 * original helper returned as soon as a matching card was visible — which the
 * UNFILTERED first page already satisfies — so under load the debounced fetch
 * landed mid-Tab-loop, re-rendered the list and dropped focus to <body>.
 * Now the helper waits for THAT fetch and for the list to settle on it.
 */
async function findCard(page: Page): Promise<Locator> {
  const searched = page.waitForResponse(
    (r) => /\/app\/coach_players/.test(r.url()) && /[?&]search=/.test(r.url()) && r.status() === 200,
  );
  await page.getByPlaceholder("Search players...").fill(PLAYER);
  await searched;
  const card = page.getByRole("button", { name: CARD_NAME }).first();
  await expect(card, "the player card must be exposed as a button").toBeVisible();
  // Every remaining card is a search hit: the filtered page has replaced the unfiltered one.
  await expect
    .poll(async () => {
      const names = await page.getByRole("button", { name: /open player/i }).evaluateAll((els) =>
        els.map((el) => el.getAttribute("aria-label") ?? ""),
      );
      return names.length > 0 && names.every((n) => CARD_NAME.test(n));
    }, { message: "the list must have settled on the search result" })
    .toBe(true);
  return card;
}

/** Put focus in the search box and prove it is there before the Tab walk starts. */
async function focusSearch(page: Page) {
  const search = page.getByPlaceholder("Search players...");
  await expect
    .poll(async () => {
      await search.focus();
      return search.evaluate((el) => el === document.activeElement);
    }, { message: "focus must be in the search box before tabbing" })
    .toBe(true);
}

test.describe("PAD-148: player card keyboard access", () => {
  test("PAD-148: Tab reaches the player card and Enter opens the player", async ({
    page,
  }) => {
    await loginAsCoach(page);
    await openPlayers(page);

    await findCard(page);

    await focusSearch(page);
    const tabs = await tabUntilFocused(page, CARD_NAME);
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
    await expect
      .poll(async () => {
        await card.focus();
        return page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? "");
      }, { message: "the card must hold focus before Space is pressed" })
      .toMatch(CARD_NAME);

    const scrollBefore = await page.evaluate(() => window.scrollY);
    await page.keyboard.press(" ");

    await expect(page).toHaveURL(/\/players\/\d+/);
    expect(
      await page.evaluate(() => window.scrollY),
      "Space must be preventDefault()ed so it activates instead of scrolling"
    ).toBe(scrollBefore);
  });
});
