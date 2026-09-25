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
  // Short enough that next week's seeded classes (seed.py: the Monday academy class, the
  // recurring ones, the full upcoming class) overflow the dialog on any browser. Real data, not a
  // mock: WebKit does not route this cross-port request, and Safari is where the owner saw it.
  await page.setViewportSize({ width: 1280, height: 520 });
  await openPicker(page);
  await page.getByTestId("add-to-classes-next-week").click();
  const rows = page.locator('[data-testid^="add-to-classes-class-"]');
  await expect(rows.nth(2)).toBeAttached({ timeout: 10_000 });
  const last = rows.last();

  // Scroll the way a person does: wheel over the list. (scrollIntoViewIfNeeded scrolls
  // programmatically and would bypass the dialog's scroll lock, which is what a wheel meets.)
  const listEl = page.getByTestId("add-to-classes-list");
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
