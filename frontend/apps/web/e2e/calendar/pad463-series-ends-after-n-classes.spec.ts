/**
 * PAD-463 — classes.create rule 9: a coach's recurring series can end "after N classes", and then
 * it has exactly N. The count is turned into the end date the wire already carries (the Nth
 * class's date, shared `seriesEndAfterClasses`), and the series expands with no skipped dates up to
 * an inclusive end — so the server holds N occurrences, the last on that date.
 *
 * Sunday + Wednesday on purpose: the calendar's `daysOfWeek` is 0 = Sunday, the helper counts on
 * ISO days, and Sunday is the one day the two disagree on. The start is two years out so no
 * season or other spec's class is in the way. Test ids only (B-103).
 */
import { test, expect } from "@playwright/test";
import { loginAsCoach, COACH_USERNAME, COACH_PASSWORD } from "../helpers/auth";
import { openCalendar } from "../helpers/navigation";
import { API_AUTH, API_ROOT } from "../helpers/api";
import { ui } from "../helpers/i18n";

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** A Sunday about two years out, as a UTC calendar date. */
function sundayTwoYearsOut(): Date {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() + 2);
  d.setUTCDate(d.getUTCDate() + ((7 - d.getUTCDay()) % 7));
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

test("PAD-463: a series that ends after 5 classes has exactly 5, Sunday included", async ({ page, request }) => {
  const start = sundayTwoYearsOut();
  const plus = (n: number) => iso(new Date(start.getTime() + n * 86_400_000));
  // Sun, Wed, Sun, Wed, Sun
  const expected = [plus(0), plus(3), plus(7), plus(10), plus(14)];
  const name = `PAD-463 Series ${Date.now().toString().slice(-6)}`;

  const login = await request.post(`${API_AUTH}/login`, { data: { username: COACH_USERNAME, password: COACH_PASSWORD } });
  const body = await login.json();
  const coach = { Authorization: `Bearer ${body.accessToken ?? body.access_token}` };

  try {
    await loginAsCoach(page);
    await openCalendar(page);
    await page.getByRole("button", { name: ui("calendar.toolbar.addClass") }).first().click();
    await expect(page.getByTestId("add-class-end-mode").or(page.getByRole("heading", { name: ui("calendar.addClass.title") })).first()).toBeVisible({ timeout: 5000 });

    await page.getByPlaceholder(/e\.g\./i).first().fill(name);
    await page.locator('input[type="date"]').first().fill(plus(0));
    await page.getByRole("switch", { name: ui("calendar.addClass.recurring") }).click();
    // The chosen date's weekday (Sunday) is preselected; add Wednesday.
    await expect(page.getByTestId("add-class-day-0")).toHaveAttribute("aria-pressed", "true");
    await page.getByTestId("add-class-day-3").click();

    await page.getByTestId("add-class-end-mode-count").click();
    await page.getByTestId("add-class-end-count").fill("5");
    await expect(page.getByTestId("add-class-end-count-last")).toHaveAttribute("data-date", expected[4]);

    // The create's RESPONSE, not its request: the sheet closes without waiting for the server, so
    // reading the calendar before the answer races the create.
    const created = page.waitForResponse((r) => r.request().method() === "POST" && /\/add_class$/.test(r.url()));
    await page.getByRole("button", { name: ui("calendar.addClass.createClass") }).click();
    const response = await created;
    expect(response.ok(), `add_class answered ${response.status()}`).toBeTruthy();
    const payload = response.request().postDataJSON() as { endDate: string | null; recursUntilSeasonEnd: boolean };
    expect(payload).toMatchObject({ endDate: expected[4], recursUntilSeasonEnd: false });
    await expect(page.getByRole("button", { name: ui("calendar.addClass.createClass") })).toHaveCount(0, { timeout: 10_000 });

    // The server's own expansion: exactly these 5 dates, nothing after.
    const res = await request.get(`${API_ROOT}/app/calendar?from=${plus(0)}T00:00:00&to=${plus(28)}T23:59:59`, { headers: coach });
    const events = ((await res.json()) as Array<{ type: string; title: string; date: string }>).filter(
      (e) => e.type === "class" && e.title === name,
    );
    expect(events.map((e) => e.date).sort()).toEqual(expected);
  } finally {
    const res = await request.get(`${API_ROOT}/app/calendar?from=${plus(0)}T00:00:00&to=${plus(28)}T23:59:59`, { headers: coach });
    // `future` from the first occurrence removes the whole series (scopes: single | future).
    const events = res.ok()
      ? ((await res.json()) as Array<{ type: string; title: string; date: string }>)
          .filter((e) => e.type === "class" && e.title === name)
          .sort((a, b) => a.date.localeCompare(b.date))
      : [];
    if (events[0]) {
      const removed = await request.post(`${API_ROOT}/app/remove_class`, { headers: coach, data: { event: events[0], scope: "future" } });
      expect.soft(removed.ok(), "series removed").toBeTruthy();
    }
  }
});
