import { test, expect, type Page } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { openCalendar } from "../helpers/navigation";
import { goToNextWeek } from "../helpers/calendar-navigation";

/**
 * PAD-65: deleting a single occurrence of a recurring class must keep it gone.
 *
 * The bug: removing one occurrence split the parent recurrence but left the
 * occurrence's date INCLUDED (recurrence_end is inclusive — a bare date is
 * coerced to end-of-day), so the series re-projected the occurrence on reload
 * ("I deleted it and it came back"). The pre-existing class-deletion PAD-10
 * test only asserted the success toast, which is why the resurrection shipped
 * uncaught.
 *
 * Weekly recurrence ⇒ exactly one occurrence per week, so after deleting the
 * occurrence on its week, a per-week count of 0 (on reload) is a clean signal
 * that it stayed gone; other weeks must keep their occurrence.
 *
 * The edit→delete (materialized LessonInstance) variant of this bug is covered
 * deterministically by the backend test `test_recurring_delete_exclusion.py`.
 */

const RECURRING = "E2E Recurring Class";

/** Advance week-by-week until `title` shows; return the number of hops. */
async function weekIndexOf(page: Page, title: string, maxWeeks = 6): Promise<number> {
  for (let i = 0; i < maxWeeks; i++) {
    try {
      await page.getByText(title).first().waitFor({ state: "visible", timeout: 1_500 });
      return i;
    } catch {
      /* not this week */
    }
    if (i < maxWeeks - 1) await goToNextWeek(page);
  }
  return -1;
}

async function advanceWeeks(page: Page, n: number): Promise<void> {
  for (let i = 0; i < n; i++) await goToNextWeek(page);
}

test.describe("PAD-65: deleted recurring occurrence stays gone", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await loginAsCoach(page);
    await openCalendar(page);
  });

  test("PAD-65: deleting a single recurring occurrence does not resurrect it on reload", async ({
    page,
  }) => {
    // Locate the first occurrence's week.
    const weekIdx = await weekIndexOf(page, RECURRING);
    expect(weekIdx, `expected to find "${RECURRING}" within 6 weeks`).toBeGreaterThanOrEqual(0);

    // Open the occurrence and delete just this one.
    await page.getByText(RECURRING).first().click();
    await page.locator("text=/participants|attendance|edit/i").first().waitFor({ timeout: 5000 });
    await page.getByRole("dialog").getByRole("button", { name: /delete class/i }).first().click();

    const single = page.getByText("Only this class").first();
    await expect(single).toBeVisible({ timeout: 5000 });
    await Promise.all([
      page.waitForResponse(
        (r) =>
          /\/api\/app\/remove_class$/.test(r.url()) &&
          r.request().method() === "POST" &&
          r.status() === 200,
        { timeout: 10_000 }
      ),
      single.click(),
    ]);
    await expect(page.getByText("Class deleted").first()).toBeVisible({ timeout: 5000 });

    // Reload and return to the same week: the occurrence must NOT reappear,
    // while the following week's occurrence must remain (single-scope delete).
    await page.reload();
    await openCalendar(page);
    await advanceWeeks(page, weekIdx);
    await expect(
      page.getByText(RECURRING),
      "deleted occurrence must not resurrect on reload"
    ).toHaveCount(0);

    await goToNextWeek(page);
    await expect(
      page.getByText(RECURRING).first(),
      "the next week's occurrence should be unaffected by a single-scope delete"
    ).toBeVisible({ timeout: 5000 });
  });
});
