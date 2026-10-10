/**
 * PAD-559 (`classes.create` rule 8b, PAD-508's field): the class-time list must scroll with the
 * wheel / trackpad, with the scrollbar hidden as macOS hides it.
 *
 * The list is a Radix Popover portaled OUTSIDE the new-class sheet's Radix Dialog, whose
 * scroll lock (react-remove-scroll) cancels wheel and touch scrolling on anything outside the
 * dialog. On Safari the scrollbar is hidden too, so the list cannot be moved at all; on
 * Windows the visible bar could still be dragged — the ticket's exact report. Run with
 * `--project=webkit`; red on the component as it stands, green once the list scrolls inside
 * the dialog's scroll shard ([[scroll-tests-must-use-the-wheel]]: a wheel event, never
 * scrollIntoView, is what the user does).
 */
import { test, expect } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { openCalendar } from "../helpers/navigation";

test("PAD-559: the open start-time list scrolls with the wheel inside the new-class sheet", async ({ page }) => {
  await loginAsCoach(page);
  await openCalendar(page);
  await page.getByTestId("calendar-toolbar-add-class").click();
  const sheet = page.getByTestId("add-class-sheet");
  await expect(sheet).toBeVisible({ timeout: 10_000 });

  const start = page.getByTestId("add-class-start-time");
  await start.click();
  const list = page.getByTestId("add-class-start-time-list");
  await expect(list).toBeVisible({ timeout: 5000 });
  // The list is taller than its box (06:00–23:45 in 15-min steps), so it can scroll.
  const metrics = await list.evaluate((el) => ({ top: el.scrollTop, max: el.scrollHeight - el.clientHeight }));
  expect(metrics.max, "the list overflows its box").toBeGreaterThan(0);

  // The user's gesture: the wheel over the list, as a trackpad or a mouse wheel sends it.
  const box = await list.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.wheel(0, 240);
  await page.mouse.wheel(0, 240);

  await expect
    .poll(async () => list.evaluate((el) => el.scrollTop), { timeout: 3000, message: "the wheel moved the list" })
    .not.toBe(metrics.top);
});
