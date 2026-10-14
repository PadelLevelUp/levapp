import { expect, type Page, type Response } from "@playwright/test";

/** Wait for the calendar week fetch that a toolbar navigation triggers. */
function waitForWeekFetch(page: Page): Promise<Response> {
  return page.waitForResponse(
    (r: Response) =>
      /\/api\/app\/calendar\?from=/.test(r.url()) && r.status() === 200,
    { timeout: 10_000 }
  );
}

/**
 * Click "Next week" on the calendar toolbar and wait for the new week's
 * calendar API response before returning. This is deterministic — unlike
 * `page.waitForTimeout(N)`, it returns exactly when the new week's data
 * is loaded, regardless of how slow the backend is under cumulative load.
 */
export async function goToNextWeek(page: Page): Promise<void> {
  const nextBtn = page.getByRole("button", { name: /next week|semana seguinte/i }).first();
  await Promise.all([waitForWeekFetch(page), nextBtn.click()]);
}

/**
 * Step back one week and wait until the toolbar shows it.
 *
 * B-530: this used to wait for the week's API response, like `goToNextWeek`. But the slow-render
 * rescan below walks back over weeks the forward pass has just loaded, and react-query serves those
 * from its cache with no request — so the wait timed out after 10 s and every caller that expects
 * the class to be ABSENT (open-spot-visibility, pad335) failed on the base. The week label changes
 * whether or not a request is made; the card wait that follows (`titleVisible`) covers the render.
 */
export async function goToPreviousWeek(page: Page): Promise<void> {
  const prevBtn = page.getByRole("button", { name: /previous week|semana anterior/i }).first();
  // Desktop toolbar only (the phone WeekNav carries no label id); every caller runs at desktop width.
  const label = page.getByTestId("calendar-week-label");
  await expect(label).toHaveText(/\S/); // a real label, so the change below is a real wait
  const before = (await label.textContent()) ?? "";
  await prevBtn.click();
  await expect(label).not.toHaveText(before, { timeout: 10_000 });
}

async function titleVisible(
  page: Page,
  title: string,
  timeout: number
): Promise<boolean> {
  try {
    // PAD-308: match the title on a calendar EVENT CARD only. A bare
    // `getByText` matched it anywhere on the page — on the student side the
    // sidebar chip "E2E Student" made every week read as "found" and the walk
    // never left the current week. Both the desktop and the phone card carry
    // `calendar-event-card`; every caller runs at desktop width.
    await page
      .getByTestId("calendar-event-card")
      .filter({ hasText: title })
      .first()
      .waitFor({ state: "visible", timeout });
    return true;
  } catch {
    return false;
  }
}

/**
 * Navigate the calendar looking for an event with the given title. Returns true
 * if the title became visible at any week within `maxWeeks` forward.
 *
 * Two passes, on purpose. `goToNextWeek` waits for the week's API response, but
 * nothing awaits the React render that turns that payload into event cards —
 * and under cumulative suite load that render can outlast the fast pass's
 * per-week budget. When it did, the scan advanced *past* the correct week and
 * reported the class missing. That is how
 * `participant-count-effective.spec.ts` failed intermittently in full runs
 * (~1 in 3) while passing every time in isolation and in every single-directory
 * subset — the classic signature of a race, not of cross-spec pollution.
 *
 * So: pass one scans forward cheaply, which is the common case since the class
 * normally paints in well under a second. Only when that finds nothing do we
 * walk back over the same weeks with a generous budget before concluding the
 * class really is absent. A genuine miss costs roughly twice as long; a slow
 * render no longer reads as a missing class. A caller that asserts the class
 * IS found pays the extra cost only on a real failure; the two that assert it
 * is ABSENT (open-spot-visibility, pad335) always pay it, and rely on
 * `goToPreviousWeek` not waiting for a request a cached week never makes (B-530).
 */
export async function findClassOnCalendar(
  page: Page,
  title: string,
  maxWeeks = 5
): Promise<boolean> {
  const FAST_MS = 1_500;
  const PATIENT_MS = 8_000;

  for (let i = 0; i < maxWeeks; i++) {
    if (await titleVisible(page, title, FAST_MS)) return true;
    await goToNextWeek(page);
  }
  if (await titleVisible(page, title, FAST_MS)) return true;

  // Slow-render rescan: walk back over the same weeks, giving each one time to
  // finish painting before ruling it out.
  for (let i = 0; i < maxWeeks; i++) {
    await goToPreviousWeek(page);
    if (await titleVisible(page, title, PATIENT_MS)) return true;
  }
  return false;
}
