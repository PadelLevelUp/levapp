import { test, expect, type Page } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { openPlayers } from "../helpers/navigation";
import { clickPlayerCard } from "../helpers/players";

/**
 * PAD-439: the "Add to classes" picker (players.profile rules 5, 5a, 5b).
 *
 * The week's classes are served by a mock of GET /api/app/lesson_instances, built from the
 * requested week, so the spec needs no seeded classes and writes nothing.
 */

const CLUB_TZ = "Europe/Lisbon";
const clubToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: CLUB_TZ }).format(new Date());

function isoPlus(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

type Slot = { id: number; date: string; startTime: string };

/** Serve the picker's week: `slotsFor(from)` decides the classes for the requested Monday. */
async function serveWeeks(page: Page, slotsFor: (from: string) => Slot[]) {
  await page.route("**/api/app/lesson_instances?**", async (route) => {
    const from = new URL(route.request().url()).searchParams.get("from") ?? "";
    const events = slotsFor(from).map((s) => ({
      id: s.id,
      originalId: s.id,
      model: "LessonInstance",
      type: "class",
      title: `PAD-439 class ${s.id}`,
      date: s.date,
      startTime: s.startTime,
      endTime: `${String(Number(s.startTime.slice(0, 2)) + 1).padStart(2, "0")}${s.startTime.slice(2)}`,
      status: "scheduled",
      classType: "academy",
      color: "#6366f1",
      participantCount: 1,
      maxPlayers: 4,
    }));
    await route.fulfill({ json: events });
  });
}

async function openPicker(page: Page) {
  await loginAsCoach(page);
  await openPlayers(page);
  await clickPlayerCard(page, "e2e-student");
  await page.getByTestId("player-add-to-classes").click();
  await expect(page.getByTestId("add-to-classes-dialog")).toBeVisible({ timeout: 10_000 });
}

test("PAD-439: a long week scrolls inside the picker; the last class clears the footer", async ({ page }) => {
  // Real data, not a mock: WebKit does not route this cross-port request, and Safari is where the
  // owner saw it. B-193: on EVERY weekday next week holds the seed's Monday academy class and its
  // Tuesday recurring class (seed_dates.py); the "Next 7 days" class is there on six weekdays but
  // on a Monday it falls on this week's Sunday. So the test waits for those two, in a window short
  // enough that two rows overflow the list (measured: 69 px at 460), and asserts the overflow —
  // a list that fits would pass the footer check below without scrolling anything.
  await page.setViewportSize({ width: 1280, height: 460 });
  await openPicker(page);
  await page.getByTestId("add-to-classes-next-week").click();
  const rows = page.locator('[data-testid^="add-to-classes-class-"]');
  await expect(rows.nth(1)).toBeAttached({ timeout: 10_000 });
  const last = rows.last();
  const listEl = page.getByTestId("add-to-classes-list");
  await expect
    .poll(() => listEl.evaluate((el) => el.scrollHeight - el.clientHeight), {
      message: "the week's classes overflow the list",
    })
    .toBeGreaterThan(0);

  // Scroll the way a person does: wheel over the list. (scrollIntoViewIfNeeded scrolls
  // programmatically and would bypass the dialog's scroll lock, which is what a wheel meets.)
  await listEl.hover();
  for (let i = 0; i < 6; i++) await page.mouse.wheel(0, 400);
  await page.waitForTimeout(300);
  const list = (await listEl.boundingBox())!;
  const footer = (await page.getByTestId("add-to-classes-footer").boundingBox())!;
  const box = (await last.boundingBox())!;
  // Reachable: scrolled inside the list, above the footer, where a click lands on it.
  expect(box.y + box.height, "last class ends above the footer").toBeLessThanOrEqual(footer.y + 1);
  expect(list.y + list.height, "the list ends above the footer (it scrolls, it does not run under it)").toBeLessThanOrEqual(footer.y + 1);
});

test("PAD-439: the current week hides classes that have started and cannot step back", async ({ page }) => {
  const today = clubToday();
  // 00:00 today (club clock) has always started by the time the spec runs.
  await serveWeeks(page, () => [{ id: 43990, date: today, startTime: "00:00" }]);

  const served = page.waitForResponse(/\/api\/app\/lesson_instances\?/);
  await openPicker(page);
  await served;
  // The API served it; the picker must not offer it. The empty state is what "loaded, and
  // nothing to offer" renders, so this cannot pass while the list is still loading.
  await expect(page.getByTestId("add-to-classes-empty")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("add-to-classes-class-43990")).toHaveCount(0);
  await expect(page.getByTestId("add-to-classes-prev-week")).toBeDisabled();
});

test.describe("PAD-496: the picker on a phone", () => {
  // A small Android phone's browser. Touch, not wheel: a finger is how a phone scrolls.
  test.use({ viewport: { width: 360, height: 560 }, hasTouch: true, isMobile: true });

  test("the picker takes the phone's height, the list scrolls under a finger, header and footer stay", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "the week is mocked and the drag is sent through CDP: Chromium only");
    // 45 classes, some with names long enough to be cut, a quarter of them full: the shape of a busy club's week.
    const monday = (from: string) =>
      Array.from({ length: 45 }, (_, n) => ({ id: 49600 + n, date: isoPlus(from, n % 7), startTime: `${String(7 + (n % 14)).padStart(2, "0")}:00` }));
    await serveWeeks(page, (from) => (from > clubToday() ? monday(from) : []));

    await loginAsCoach(page);
    await openPlayers(page);
    await clickPlayerCard(page, "e2e-student");
    // At phone width the player's actions sit behind the "more" menu.
    await page.getByTestId("page-actions-menu").click();
    await page.locator('[data-testid="player-add-to-classes"]:visible').click();
    const dialog = page.getByTestId("add-to-classes-dialog");
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await page.getByTestId("add-to-classes-next-week").click();
    const rows = page.locator('[data-testid^="add-to-classes-class-"]');
    await expect(rows.nth(44)).toBeAttached({ timeout: 10_000 });

    // The dialog uses the phone's height (all but a small margin), so the list is not a two-row slit.
    const view = page.viewportSize()!;
    const dialogBox = (await dialog.boundingBox())!;
    expect(dialogBox.y, "the dialog starts on screen").toBeGreaterThanOrEqual(0);
    expect(dialogBox.y + dialogBox.height, "the dialog ends on screen").toBeLessThanOrEqual(view.height);
    expect(dialogBox.height, "the dialog takes the phone's height").toBeGreaterThanOrEqual(view.height - 24);

    const listEl = page.getByTestId("add-to-classes-list");
    const list = (await listEl.boundingBox())!;
    // The description line is not shown at this width and its row goes to the list. With the
    // line shown the list measures 224 px and this fails (watched, review of #515).
    expect(list.height, "the list has the description's row too").toBeGreaterThanOrEqual(270);
    const cdp = await page.context().newCDPSession(page);
    const x = list.x + list.width / 2;
    const from = list.y + list.height * 0.8;
    const to = list.y + list.height * 0.1;
    await expect(async () => {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y: from }] });
      for (let i = 1; i <= 8; i++) {
        await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: from + ((to - from) * i) / 8 }] });
      }
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await page.waitForTimeout(150);
      const left = await listEl.evaluate((el) => el.scrollHeight - el.clientHeight - el.scrollTop);
      expect(left, "dragged to the end of the list").toBeLessThanOrEqual(1);
    }).toPass({ timeout: 30_000 });

    const footer = (await page.getByTestId("add-to-classes-footer").boundingBox())!;
    const last = (await rows.last().boundingBox())!;
    expect(last.y + last.height, "the last class ends above the footer").toBeLessThanOrEqual(footer.y + 1);
    expect(footer.y + footer.height, "the footer is on screen").toBeLessThanOrEqual(view.height);
    await expect(page.getByTestId("add-to-classes-next-week")).toBeInViewport();
    // Reachable, not only measured: the last class can be chosen and the footer counts it.
    await rows.last().tap();
    await expect(rows.last().getByRole("checkbox")).toBeChecked();
  });
});

