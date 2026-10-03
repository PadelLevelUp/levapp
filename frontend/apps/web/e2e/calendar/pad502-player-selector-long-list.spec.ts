/**
 * PAD-502 (classes.create rule 10, B-271): in the class sheet's student picker every student of
 * the list can be reached. The list used to be a Radix ScrollArea with only a max height: it
 * showed four rows and the rest were clipped, with nothing to scroll. The coach met it as "only
 * four players for level 5-", but it was any list longer than four.
 *
 * The roster is the real one plus twenty students of one level, added to the answer of
 * GET /coach_players on its way back, so the spec writes nothing. Scrolling is by mouse wheel,
 * the way a person does it; scrollIntoView would reach a clipped row and hide the bug (B-202).
 */
import { test, expect } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { openCalendar } from "../helpers/navigation";

const EXTRA = 20;

test.setTimeout(90_000);
test("PAD-502: every student of a level can be reached in the class sheet's picker, by wheel", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "the roster is extended through a route on a cross-port request: Chromium only");
  let levelId: number | string | null = null;
  await page.route("**/api/app/coach_players", async (route) => {
    const response = await route.fetch();
    const roster = (await response.json()) as Array<Record<string, unknown>>;
    const model = roster.find((p) => p.levelId != null) ?? roster[0];
    levelId = (model.levelId as number | string | null) ?? null;
    const extra = Array.from({ length: EXTRA }, (_, n) => ({
      ...model,
      id: 950200 + n,
      playerId: 950200 + n,
      name: `PAD-502 Student ${String(n + 1).padStart(2, "0")}`,
    }));
    await route.fulfill({ response, json: [...roster, ...extra] });
  });

  await loginAsCoach(page);
  await openCalendar(page);
  await page.getByTestId("calendar-toolbar-add-class").click();
  await expect(page.getByTestId("add-class-sheet")).toBeVisible({ timeout: 10_000 });

  await page.getByTestId("player-selector-tab-all").click();
  expect(levelId, "the seeded roster has a student with a level").not.toBeNull();
  await page.getByTestId(`player-selector-level-${levelId}`).click();

  const rows = page.locator('[data-testid^="player-selector-row-"]');
  await expect.poll(() => rows.count()).toBeGreaterThanOrEqual(EXTRA);
  const last = page.getByTestId(`player-selector-row-${950200 + EXTRA - 1}`);
  await expect(last).toBeAttached();

  const list = page.getByTestId("player-selector-list");
  await list.scrollIntoViewIfNeeded(); // the sheet itself, not the list: bring the picker on screen
  await list.hover();
  for (let i = 0; i < 12; i++) await page.mouse.wheel(0, 300);
  await page.waitForTimeout(300);

  const listBox = (await list.boundingBox())!;
  const lastBox = (await last.boundingBox())!;
  expect(lastBox.y, "the last student of the level starts inside the list").toBeGreaterThanOrEqual(listBox.y - 1);
  expect(lastBox.y + lastBox.height, "and ends inside it").toBeLessThanOrEqual(listBox.y + listBox.height + 1);

  // Reachable, not only measured: the student can be ticked.
  await last.click();
  await expect(last.getByRole("checkbox")).toBeChecked();
});
