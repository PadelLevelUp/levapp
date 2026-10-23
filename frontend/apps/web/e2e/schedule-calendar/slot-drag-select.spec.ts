import { test, expect, type APIRequestContext, type Locator, type Page } from "@playwright/test";
import { loginAsCoach, COACH_USERNAME, COACH_PASSWORD } from "../helpers/auth";
import { openCalendar } from "../helpers/navigation";
import { classTimes } from "../helpers/class-time";
import { API_APP, API_AUTH } from "../helpers/api";

/**
 * PAD-106 — click-and-drag slot selection on the desktop weekly calendar.
 *
 * Spec: calendar.slot-click (rules 4-12).
 *
 * Playwright's `dragTo()` is deliberately NOT used: it dispatches a single
 * mousemove, and the selection needs the intermediate move stream to extend
 * across slots. Everything here drives `page.mouse` by hand.
 */

/** Centre point of an element, for `page.mouse.move`. */
async function centre(locator: Locator): Promise<{ x: number; y: number }> {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error("slot has no bounding box");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/**
 * Presses on `from`, walks the mouse to `to` in several steps (so the grid sees
 * a real move stream), and releases — unless `release` is false, which leaves
 * the button held for cancel-path assertions.
 */
async function dragSlots(
  page: Page,
  from: Locator,
  to: Locator,
  { release = true }: { release?: boolean } = {}
) {
  const start = await centre(from);
  const end = await centre(to);

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  for (let step = 1; step <= 6; step++) {
    await page.mouse.move(
      start.x + ((end.x - start.x) * step) / 6,
      start.y + ((end.y - start.y) * step) / 6
    );
  }
  if (release) await page.mouse.up();
}

/** The Tuesday column's slot for `time` on the currently displayed week. */
function slotForTuesday(page: Page, time: string): Locator {
  // Columns render Sun..Sat since PAD-682, so index 2 is Tuesday. It keeps
  // the drag clear of the seeded "E2E Academy Class" (next Monday 10:00).
  return page.locator(`[data-slot$="T${time}"]`).nth(2);
}

const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/**
 * PAD-747: the end a single click suggests, by classes.create rule 8c (PAD-559). It is the start
 * plus the median length of the classes in the displayed week, rounded to the quarter hour, or
 * 60 min when there are none. It used to be a fixed 90 min. Recomputed here from the week's own
 * classes, because other specs add classes to the same week (e2e specs do not import
 * @levelup/config, so this mirrors `usualClassMinutes`).
 */
async function suggestedEnd(request: APIRequestContext, day: string, start: string): Promise<string> {
  const login = await request.post(`${API_AUTH}/login`, { data: { username: COACH_USERNAME, password: COACH_PASSWORD } });
  expect(login.ok(), `login failed: ${login.status()}`).toBeTruthy();
  const json = await login.json();
  const auth = { Authorization: `Bearer ${json.accessToken ?? json.access_token}` };
  // The sheet reads the week on screen, Sunday to Saturday (calendar.view rule 5a): the class's own week.
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  const from = d.toISOString().slice(0, 10);
  d.setUTCDate(d.getUTCDate() + 6);
  const to = d.toISOString().slice(0, 10);
  const res = await request.get(`${API_APP}/calendar?from=${from}T00:00:00&to=${to}T23:59:59`, { headers: auth });
  expect(res.ok(), `calendar failed: ${res.status()}`).toBeTruthy();
  const body = await res.json();
  const events = (Array.isArray(body) ? body : body.events ?? []) as Array<{ type?: string | null; startTime?: string | null; endTime?: string | null }>;
  const lengths = events
    .filter((e) => (e.type ?? "class") === "class" && /^\d{2}:\d{2}$/.test(e.startTime ?? "") && /^\d{2}:\d{2}$/.test(e.endTime ?? ""))
    .map((e) => toMinutes(e.endTime!) - toMinutes(e.startTime!))
    .filter((d) => d > 0)
    .sort((a, b) => a - b);
  const mid = Math.floor(lengths.length / 2);
  const median = lengths.length === 0 ? 60 : lengths.length % 2 ? lengths[mid] : (lengths[mid - 1] + lengths[mid]) / 2;
  const minutes = Math.max(15, Math.round(median / 15) * 15);
  const total = Math.min(toMinutes(start) + minutes, 23 * 60 + 59);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

test.describe("PAD-106: click-and-drag slot selection to create a class", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsCoach(page);
    await openCalendar(page);
    // Next week keeps the grid free of "today" styling ambiguity.
    await page.getByRole("button", { name: /next week/i }).first().click();
    await page.waitForTimeout(400);
  });

  test("dragging down across slots prefills start and end time", async ({
    page,
  }) => {
    const first = slotForTuesday(page, "08:00");
    const last = slotForTuesday(page, "09:30");
    await expect(first).toHaveCount(1);

    const expectedDate = (await first.getAttribute("data-slot"))!.split("T")[0];

    await dragSlots(page, first, last);

    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible({ timeout: 5000 });

    await expect(sheet.locator('input[type="date"]').first()).toHaveValue(
      expectedDate
    );
    const times = classTimes(sheet);
    await expect(times.start).toHaveValue("08:00");
    // End is the LAST covered slot's start + 30 min, so 09:30 → 10:00.
    await expect(times.end).toHaveValue("10:00");
  });

  test("dragging upward normalises to the same range", async ({ page }) => {
    const lower = slotForTuesday(page, "09:30");
    const upper = slotForTuesday(page, "08:00");

    await dragSlots(page, lower, upper);

    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible({ timeout: 5000 });

    const times = classTimes(sheet);
    await expect(times.start).toHaveValue("08:00");
    await expect(times.end).toHaveValue("10:00");
  });

  test("a single click still opens the sheet with the suggested length", async ({
    page,
    request,
  }) => {
    const slot = slotForTuesday(page, "08:00");
    const expectedDate = (await slot.getAttribute("data-slot"))!.split("T")[0];

    await slot.click();

    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible({ timeout: 5000 });

    await expect(sheet.locator('input[type="date"]').first()).toHaveValue(
      expectedDate
    );
    const times = classTimes(sheet);
    await expect(times.start).toHaveValue("08:00");
    // A single click is not a drag: the end is the suggested class length (rule 8c), not +30.
    await expect(times.end).toHaveValue(await suggestedEnd(request, expectedDate, "08:00"));
  });

  test("Escape mid-drag cancels the selection", async ({ page }) => {
    const first = slotForTuesday(page, "08:00");
    const last = slotForTuesday(page, "09:30");

    await dragSlots(page, first, last, { release: false });

    // Highlight is showing while the button is held.
    await expect(page.locator("[data-slot-selection]")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.locator("[data-slot-selection]")).toHaveCount(0);

    await page.mouse.up();

    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("releasing outside the grid resolves the last range and leaves no highlight", async ({
    page,
  }) => {
    const first = slotForTuesday(page, "08:00");
    const last = slotForTuesday(page, "09:00");

    await dragSlots(page, first, last, { release: false });
    // Slide sideways off the grid (same height, x near the window edge) and
    // release there: the range stays locked to the origin column.
    const off = await centre(last);
    await page.mouse.move(2, off.y);
    await page.mouse.up();

    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible({ timeout: 5000 });

    const times = classTimes(sheet);
    await expect(times.start).toHaveValue("08:00");
    await expect(times.end).toHaveValue("09:30");

    await expect(page.locator("[data-slot-selection]")).toHaveCount(0);
  });
});
