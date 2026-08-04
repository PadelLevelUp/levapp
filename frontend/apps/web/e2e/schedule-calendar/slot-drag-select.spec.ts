import { test, expect, type Locator, type Page } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { openCalendar } from "../helpers/navigation";

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

/** The Wednesday column's slot for `time` on the currently displayed week. */
function slotForWednesday(page: Page, time: string): Locator {
  // Columns render Mon..Sun, so index 2 is Wednesday. Wednesday keeps the drag
  // clear of the seeded "E2E Academy Class" (next Monday 10:00).
  return page.locator(`[data-slot$="T${time}"]`).nth(2);
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
    const first = slotForWednesday(page, "08:00");
    const last = slotForWednesday(page, "09:30");
    await expect(first).toHaveCount(1);

    const expectedDate = (await first.getAttribute("data-slot"))!.split("T")[0];

    await dragSlots(page, first, last);

    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible({ timeout: 5000 });

    await expect(sheet.locator('input[type="date"]').first()).toHaveValue(
      expectedDate
    );
    const times = sheet.locator('input[type="time"]');
    await expect(times.nth(0)).toHaveValue("08:00");
    // End is the LAST covered slot's start + 30 min, so 09:30 → 10:00.
    await expect(times.nth(1)).toHaveValue("10:00");
  });

  test("dragging upward normalises to the same range", async ({ page }) => {
    const lower = slotForWednesday(page, "09:30");
    const upper = slotForWednesday(page, "08:00");

    await dragSlots(page, lower, upper);

    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible({ timeout: 5000 });

    const times = sheet.locator('input[type="time"]');
    await expect(times.nth(0)).toHaveValue("08:00");
    await expect(times.nth(1)).toHaveValue("10:00");
  });

  test("a single click still opens the sheet with the old defaults", async ({
    page,
  }) => {
    const slot = slotForWednesday(page, "08:00");
    const expectedDate = (await slot.getAttribute("data-slot"))!.split("T")[0];

    await slot.click();

    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible({ timeout: 5000 });

    await expect(sheet.locator('input[type="date"]').first()).toHaveValue(
      expectedDate
    );
    const times = sheet.locator('input[type="time"]');
    await expect(times.nth(0)).toHaveValue("08:00");
    // Unchanged single-click behaviour: end time is start + 90 min, NOT +30.
    await expect(times.nth(1)).toHaveValue("09:30");
  });

  test("Escape mid-drag cancels the selection", async ({ page }) => {
    const first = slotForWednesday(page, "08:00");
    const last = slotForWednesday(page, "09:30");

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
    const first = slotForWednesday(page, "08:00");
    const last = slotForWednesday(page, "09:00");

    await dragSlots(page, first, last, { release: false });
    // Slide sideways off the grid (same height, x near the window edge) and
    // release there: the range stays locked to the origin column.
    const off = await centre(last);
    await page.mouse.move(2, off.y);
    await page.mouse.up();

    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible({ timeout: 5000 });

    const times = sheet.locator('input[type="time"]');
    await expect(times.nth(0)).toHaveValue("08:00");
    await expect(times.nth(1)).toHaveValue("09:30");

    await expect(page.locator("[data-slot-selection]")).toHaveCount(0);
  });
});
