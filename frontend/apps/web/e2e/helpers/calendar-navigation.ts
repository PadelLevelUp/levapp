import { expect, type Page, type Request, type Response } from "@playwright/test";

/** Wait for the calendar week fetch that a toolbar navigation triggers. */
function waitForWeekFetch(page: Page): Promise<Response> {
  return page.waitForResponse(
    (r: Response) =>
      /\/api\/app\/calendar\?from=/.test(r.url()) && r.status() === 200,
    { timeout: 10_000 }
  );
}

/** `yyyy-MM-dd` plus `days`, on calendar dates (no time zone involved). */
function addDaysIso(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The phone layout (use-mobile's 768px breakpoint) has no day columns. */
const PHONE_MAX_WIDTH = 767;

/**
 * Click "Next week" and return once week N+1 is on the desktop grid and stable (PAD-755).
 *
 * The promise:
 * - the grid's seven `data-day-column`s are exactly N+1's dates, where N is read from the grid
 *   itself before the click;
 * - the `/calendar` request for N+1, if the click issued one, has its response. A week already
 *   cached issues none (B-530), so its absence is not waited for.
 *
 * Why it is no longer "the first `/calendar?from=` response":
 * - `openCalendar` returns on the URL, before the grid mounts, so that response could be the
 *   initial load of week N.
 * - client.query-cache rule 5 keeps N's columns and cards on screen until N+1 lands. A caller
 *   could therefore read N's slots or click N's card: pad371 deleted the wrong Monday (B-686).
 * - A click while N was still loading moved the grid to N+1 with no data, and the next call
 *   then went to N+2.
 *
 * Phone widths keep the response wait: they have no day columns.
 */
export async function goToNextWeek(page: Page): Promise<void> {
  const nextBtn = page.getByRole("button", { name: /next week|semana seguinte/i }).first();
  if ((page.viewportSize()?.width ?? 1280) <= PHONE_MAX_WIDTH) {
    await Promise.all([waitForWeekFetch(page), nextBtn.click()]);
    return;
  }

  const columns = page.locator("[data-day-column]");
  const daysOnScreen = () => columns.evaluateAll((els) => els.map((el) => el.getAttribute("data-day-column")));
  await expect(columns).toHaveCount(7, { timeout: 15_000 });
  const weekN = (await columns.first().getAttribute("data-day-column")) ?? "";
  const weekN1 = Array.from({ length: 7 }, (_, i) => addDaysIso(weekN, 7 + i));

  let request: Request | undefined;
  const onRequest = (r: Request) => {
    if (/\/api\/app\/calendar\?/.test(r.url()) && decodeURIComponent(r.url()).includes(`from=${weekN1[0]}T`)) {
      request ??= r;
    }
  };
  page.on("request", onRequest);
  try {
    await nextBtn.click();
    await expect.poll(daysOnScreen, { timeout: 15_000 }).toEqual(weekN1);
    if (request) {
      const response = await request.response();
      expect(response?.status(), `the week ${weekN1[0]} calendar request`).toBe(200);
    }
    // Still N+1 once its data is in: nothing moved the grid on.
    expect(await daysOnScreen()).toEqual(weekN1);
  } finally {
    page.off("request", onRequest);
  }
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
 * Two passes, on purpose. `goToNextWeek` waits until the grid shows the next week and its
 * request has landed (PAD-755), but nothing awaits the React render that turns that payload
 * into event cards —
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
