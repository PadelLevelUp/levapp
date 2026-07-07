import type { Page, Response } from "@playwright/test";

/**
 * Click "Next week" on the calendar toolbar and wait for the new week's
 * calendar API response before returning. This is deterministic — unlike
 * `page.waitForTimeout(N)`, it returns exactly when the new week's data
 * is loaded, regardless of how slow the backend is under cumulative load.
 */
export async function goToNextWeek(page: Page): Promise<void> {
  const nextBtn = page.getByRole("button", { name: /next week/i }).first();
  await Promise.all([
    page.waitForResponse(
      (r: Response) =>
        /\/api\/app\/calendar\?from=/.test(r.url()) && r.status() === 200,
      { timeout: 10_000 }
    ),
    nextBtn.click(),
  ]);
}

/**
 * Navigate the calendar forward up to `maxWeeks` looking for an event with the
 * given title. Uses event-driven waits so it's reliable even when calendar
 * fetches are slow.
 *
 * Returns true if the title became visible at any week, false otherwise.
 */
export async function findClassOnCalendar(
  page: Page,
  title: string,
  maxWeeks = 5
): Promise<boolean> {
  for (let i = 0; i < maxWeeks; i++) {
    // Auto-polling visibility check — gives the current week's render up to
    // 1.5s to settle before we navigate forward.
    try {
      await page
        .getByText(title)
        .first()
        .waitFor({ state: "visible", timeout: 1_500 });
      return true;
    } catch {
      // Not visible in this week — advance.
    }
    await goToNextWeek(page);
  }
  // Final check after the last advance.
  return await page
    .getByText(title)
    .first()
    .isVisible()
    .catch(() => false);
}
