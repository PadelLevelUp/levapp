import { test, expect, type Locator, type Page, type APIRequestContext } from "@playwright/test";
import { addDays, format, startOfWeek } from "date-fns";
import { COACH_PASSWORD, COACH_USERNAME, loginAsCoach, loginAsStudent } from "../helpers/auth";
import { API_APP, API_ROOT } from "../helpers/api";

/**
 * calendar.mobile-views rule 26 — Dia on web at phone widths is one list of days.
 *
 * Criteria: 39 (scrolling moves the day and the strip with no request), 40 (a date, a chevron, Hoje and a
 * link land on their day), 41 (headers stay, empty days are short, modes agree, the filter applies to every
 * day), 45 (an edit in a later week shows at once and the list keeps its place), 48 (reduced motion jumps; the
 * edge rows reopen the list). Located by test id; a day's header is `calendar-day-header-{yyyy-MM-dd}`.
 */
test.use({ viewport: { width: 390, height: 844 } });

const iso = (d: Date) => format(d, "yyyy-MM-dd");
const TODAY = new Date();
const SUNDAY = startOfWeek(TODAY, { weekStartsOn: 0 });

const list = (page: Page) => page.getByTestId("calendar-day-list");
const header = (page: Page, key: string) => page.getByTestId(`calendar-day-header-${key}`);
const stripDay = (page: Page, key: string) => page.getByTestId(`calendar-day-${key}`);

/** The distance between a day's header and the top of the list, in px. */
async function offsetFromTop(page: Page, key: string): Promise<number> {
  const [l, h] = await Promise.all([list(page).boundingBox(), header(page, key).boundingBox()]);
  return Math.abs((h?.y ?? 1e6) - (l?.y ?? 0));
}

async function expectAtTop(page: Page, key: string) {
  await expect.poll(() => offsetFromTop(page, key), { timeout: 8_000, message: `${key} is at the list's top` }).toBeLessThanOrEqual(2);
  await expect(stripDay(page, key)).toHaveAttribute("aria-pressed", "true");
}

/** Put a day's section at the top of the list the way a finger does: by scrolling it. */
async function scrollToDay(page: Page, key: string, extra = 0) {
  await page.getByTestId(`calendar-day-section-${key}`).evaluate((el, add) => {
    (el.parentElement as HTMLElement).scrollTop = (el as HTMLElement).offsetTop + add;
  }, extra);
}

async function openDia(page: Page) {
  await loginAsCoach(page);
  await page.goto("/calendar");
  await expect(list(page)).toBeVisible();
  await expectAtTop(page, iso(TODAY));
}

/** Scroll to the end until the second read (four more weeks: 11 in all) is in, and return the last day's key. */
async function scrollToEnd(page: Page): Promise<string> {
  const sections = page.locator("[data-testid^='calendar-day-section-']");
  await expect(async () => {
    await list(page).evaluate((el) => (el.scrollTop = el.scrollHeight));
    await expect(sections).toHaveCount(77, { timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await expect(page.getByTestId("calendar-day-edge-after")).toBeVisible();
  await list(page).evaluate((el) => (el.scrollTop = el.scrollHeight));
  return ((await sections.last().getAttribute("data-testid")) ?? "").replace("calendar-day-section-", "");
}

function calendarRequests(page: Page): string[] {
  const urls: string[] = [];
  page.on("request", (r) => {
    if (/\/api\/app\/calendar\?/.test(r.url())) urls.push(r.url());
  });
  return urls;
}

test("[CALENDAR-MOBILE-VIEWS-39] scrolling moves the selected day and the week", async ({ page }) => {
  await openDia(page);
  await page.waitForLoadState("networkidle");
  const requests = calendarRequests(page);

  // Down into the next week: the strip's date and week follow.
  const nextWeekDay = iso(addDays(SUNDAY, 9));
  await scrollToDay(page, nextWeekDay);
  await expect(stripDay(page, nextWeekDay)).toHaveAttribute("aria-pressed", "true");
  await expect(stripDay(page, iso(addDays(SUNDAY, 7)))).toBeVisible();
  await expect(stripDay(page, iso(SUNDAY))).toHaveCount(0);

  // The add-class form opens on that date.
  await page.getByTestId("calendar-add-class").click();
  await expect(page.locator('input[type="date"]').first()).toHaveValue(nextWeekDay);
  await page.keyboard.press("Escape");

  // And back.
  await scrollToDay(page, iso(TODAY));
  await expect(stripDay(page, iso(TODAY))).toHaveAttribute("aria-pressed", "true");
  await expect(stripDay(page, iso(SUNDAY))).toBeVisible();

  expect(requests, "scrolling inside what is loaded makes no calendar request").toEqual([]);
});

test("[CALENDAR-MOBILE-VIEWS-40] a date, a chevron, Hoje and a link land on their day", async ({ page }) => {
  await openDia(page);

  // A date in the strip.
  const friday = iso(addDays(SUNDAY, 5) );
  if (friday !== iso(TODAY)) {
    await stripDay(page, friday).click();
    await expectAtTop(page, friday);
  }

  // A chevron: rule 2 picks the day (a week that does not hold today: its first day).
  await page.getByTestId("calendar-next-week").click();
  await expectAtTop(page, iso(addDays(SUNDAY, 7)));

  // Hoje is there, and brings today back; with today selected it is gone.
  await page.getByTestId("calendar-day-today").click();
  await expectAtTop(page, iso(TODAY));
  await expect(page.getByTestId("calendar-day-today")).toHaveCount(0);

  // A link to another month.
  const far = iso(addDays(TODAY, 70));
  await page.goto(`/calendar?date=${far}`);
  await expect(list(page)).toBeVisible();
  await expectAtTop(page, far);

  // The last day of the second read.
  await page.goto("/calendar");
  await expect(list(page)).toBeVisible();
  await expectAtTop(page, await scrollToEnd(page));
});

const TALL_DAY = iso(addDays(TODAY, 2));
const MANY = Array.from({ length: 12 }, (_, i) => ({
  id: `class-${3000 + i}`,
  model: "LessonInstance",
  originalId: 3000 + i,
  type: "class",
  isRecurring: false,
  title: `Tall day ${String(i + 1).padStart(2, "0")}`,
  date: TALL_DAY,
  startTime: `${String(8 + i).padStart(2, "0")}:00`,
  endTime: `${String(8 + i).padStart(2, "0")}:45`,
  color: "#6366F1",
  classType: "academy",
  status: "scheduled",
  participantCount: 2,
  maxPlayers: 6,
}));

/** Every range is answered with the one tall day: the mock the other mobile specs use. */
async function mockCalendar(page: Page, events: unknown[]) {
  await page.clock.setFixedTime(new Date(`${iso(TODAY)}T12:00:00`));
  await page.route("**/app/calendar**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(events) })
  );
}

test("[CALENDAR-MOBILE-VIEWS-41] headers stay, empty days are short and the modes agree", async ({ page }) => {
  await loginAsCoach(page);
  await mockCalendar(page, MANY);
  await page.goto("/calendar");
  await expect(list(page)).toBeVisible();

  // A day taller than the screen: its header stays at the top while its cards scroll.
  const section = page.getByTestId(`calendar-day-section-${TALL_DAY}`);
  expect((await section.boundingBox())!.height).toBeGreaterThan(844 - 200);
  await scrollToDay(page, TALL_DAY, 450);
  await expect(stripDay(page, TALL_DAY)).toHaveAttribute("aria-pressed", "true");
  expect(await offsetFromTop(page, TALL_DAY)).toBeLessThanOrEqual(2);

  // An empty day is its header and its line, and short.
  const empty = page.getByTestId(`calendar-day-section-${iso(addDays(TODAY, 5))}`);
  await expect(empty.getByTestId("calendar-day-empty")).toBeVisible();
  await expect(empty.getByTestId("calendar-event-card")).toHaveCount(0);
  expect((await empty.boundingBox())!.height).toBeLessThan(140);

  // Semana and back keeps the selected day at the top.
  await page.getByTestId("calendar-view-week").click();
  await page.getByTestId("calendar-view-day").click();
  await expectAtTop(page, TALL_DAY);
  await expect(list(page).getByTestId("calendar-event-card").first()).toBeVisible();
});

test("[CALENDAR-MOBILE-VIEWS-41] the student's filter applies to every loaded day", async ({ page }) => {
  const offers = [iso(addDays(TODAY, 1)), iso(addDays(TODAY, 9))].map((date, i) => ({
    ...MANY[0],
    id: `class-${4000 + i}`,
    originalId: 4000 + i,
    title: `Open spot ${i + 1}`,
    date,
    openSpot: true,
  }));
  await loginAsStudent(page);
  await mockCalendar(page, offers);
  await page.goto("/calendar");
  await expect(list(page)).toBeVisible();
  await expect(list(page).getByTestId("calendar-event-card")).toHaveCount(2);
  await page.getByTestId("calendar-student-filter-mine").click();
  await expect(list(page).getByTestId("calendar-event-card")).toHaveCount(0);
  await page.getByTestId("calendar-student-filter-eligible").click();
  await expect(list(page).getByTestId("calendar-event-card")).toHaveCount(2);
});

const EDIT_NAME = "PAD-DAYSCROLL later week";
const EDIT_RENAMED = "PAD-DAYSCROLL renamed";

async function coachAuth(request: APIRequestContext) {
  const res = await request.post(`${API_ROOT}/auth/login`, { data: { username: COACH_USERNAME, password: COACH_PASSWORD } });
  expect(res.ok()).toBeTruthy();
  const json = await res.json();
  return { Authorization: `Bearer ${(json.accessToken ?? json.access_token) as string}` };
}

test("[CALENDAR-MOBILE-VIEWS-45] an edit in a later week shows and the list keeps its place", async ({ page, request }) => {
  test.setTimeout(180_000);
  const auth = await coachAuth(request);
  const later = iso(addDays(TODAY, 16));
  const feed = async () =>
    (await (await request.get(`${API_APP}/calendar?from=${later}T00:00:00&to=${later}T23:59:59`, { headers: auth })).json()) as Array<{ title: string; id: string }>;
  const leftovers = (await feed()).filter((e) => e.title === EDIT_NAME || e.title === EDIT_RENAMED);
  for (const e of leftovers) await request.post(`${API_APP}/remove_class`, { headers: auth, data: { event: e, scope: "single" } });
  const made = await request.post(`${API_APP}/add_class`, {
    headers: auth,
    data: { name: EDIT_NAME, classType: "academy", maxPlayers: 4, date: later, startTime: "10:00", endTime: "11:00", isRecurring: false, playerIds: [] },
  });
  expect(made.ok(), await made.text()).toBeTruthy();

  try {
    await openDia(page);
    await scrollToDay(page, later);
    await expect(stripDay(page, later)).toHaveAttribute("aria-pressed", "true");
    const card = page.getByTestId(`calendar-day-section-${later}`).getByTestId("calendar-event-card").filter({ hasText: EDIT_NAME });
    await expect(card).toBeVisible();
    const before = await offsetFromTop(page, later);
    const reloads: string[] = [];
    page.on("framenavigated", (f) => {
      if (f === page.mainFrame()) reloads.push(f.url());
    });

    await card.click();
    const sheet = page.getByRole("dialog");
    const save = sheet.getByTestId("class-edit-save");
    for (let attempt = 0; attempt < 3; attempt++) {
      await sheet.getByTestId("class-edit").click({ timeout: 10_000 });
      if (await save.isVisible({ timeout: 5_000 }).catch(() => false)) break;
    }
    await sheet.getByTestId("class-edit-name").fill(EDIT_RENAMED);
    await save.click();
    const single = page.getByTestId("class-scope-single");
    if (await single.isVisible({ timeout: 3_000 }).catch(() => false)) await single.click();

    const renamed = page.getByTestId(`calendar-day-section-${later}`).getByTestId("calendar-event-card").filter({ hasText: EDIT_RENAMED });
    await expect(renamed).toBeVisible({ timeout: 15_000 });
    expect(reloads, "no reload").toEqual([]);
    expect(Math.abs((await offsetFromTop(page, later)) - before)).toBeLessThanOrEqual(2);
  } finally {
    for (const e of (await feed()).filter((x) => x.title === EDIT_NAME || x.title === EDIT_RENAMED)) {
      await request.post(`${API_APP}/remove_class`, { headers: auth, data: { event: e, scope: "single" } });
    }
  }
});

test("[CALENDAR-MOBILE-VIEWS-48] reduced motion jumps and the edge rows reopen the list", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openDia(page);

  // A tapped date is at the top at once: no animation to wait for.
  const wednesday = iso(addDays(SUNDAY, 3));
  const day = wednesday === iso(TODAY) ? iso(addDays(SUNDAY, 4)) : wednesday;
  await stripDay(page, day).click();
  await expect.poll(() => offsetFromTop(page, day), { timeout: 1_500 }).toBeLessThanOrEqual(2);

  // The first edge row: the week just outside the range, at its first day.
  const rangeStart = addDays(SUNDAY, -14);
  const outsideBefore = iso(addDays(rangeStart, -7));
  await scrollToDay(page, iso(rangeStart));
  await page.getByTestId("calendar-day-edge-before").click();
  await expectAtTop(page, outsideBefore);

  // The last edge row, once the second read is in.
  await page.goto("/calendar");
  await expect(list(page)).toBeVisible();
  const lastKey = await scrollToEnd(page);
  await page.getByTestId("calendar-day-edge-after").click();
  await expectAtTop(page, iso(addDays(new Date(`${lastKey}T00:00:00`), 1)));
});

test("[CALENDAR-MOBILE-VIEWS-46] a failed jump outside the range says so, with the earlier days still below", async ({ page }) => {
  await openDia(page);
  await page.waitForLoadState("networkidle");
  const before = await page.locator("[data-testid^='calendar-day-section-']").count();

  // The read for the week just outside the range fails.
  let failing = true;
  await page.route(/\/api\/app\/calendar\?/, (route) =>
    failing ? route.fulfill({ status: 500, contentType: "application/json", body: "{}" }) : route.continue()
  );
  await page.getByTestId("calendar-day-edge-before").click();
  const error = page.getByTestId("calendar-day-error");
  await expect(error).toBeVisible({ timeout: 15_000 });
  // The earlier days stay under the error, and the strip names the day that was asked for.
  expect(await page.locator("[data-testid^='calendar-day-section-']").count()).toBe(before);
  const outside = iso(addDays(SUNDAY, -21));
  await expect(stripDay(page, outside)).toHaveAttribute("aria-pressed", "true");

  // The retry brings the days and puts the list on the day.
  failing = false;
  await page.getByTestId("calendar-day-retry").click();
  await expect(error).toHaveCount(0);
  await expectAtTop(page, outside);
});

test.describe("[CALENDAR-MOBILE-VIEWS-40] smooth movement in a browser", () => {
  /** Reduced motion OFF (the login helper turns it on): the movements below animate. */
  async function openSmooth(page: Page) {
    await openDia(page);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.waitForLoadState("networkidle");
  }

  /** The target is at the top, stays selected, and is still there a moment later. */
  async function endsAt(page: Page, key: string) {
    await expectAtTop(page, key);
    await page.waitForTimeout(1_500);
    expect(await offsetFromTop(page, key)).toBeLessThanOrEqual(2);
    await expect(stripDay(page, key)).toHaveAttribute("aria-pressed", "true");
  }

  test("a strip date, a chevron and Hoje animate to their day and stay", async ({ page }) => {
    await openSmooth(page);
    const friday = iso(addDays(SUNDAY, 5));
    await stripDay(page, friday).click();
    await endsAt(page, friday);

    await page.getByTestId("calendar-next-week").click();
    await endsAt(page, iso(addDays(SUNDAY, 7)));

    await page.getByTestId("calendar-day-today").click();
    await endsAt(page, iso(TODAY));
  });

  test("a wheel during the movement takes over", async ({ page }) => {
    await openSmooth(page);
    // Far down first (a long way back for Hoje), then Hoje and, at once, the wheel.
    await scrollToDay(page, iso(addDays(SUNDAY, 30)));
    await expect(stripDay(page, iso(addDays(SUNDAY, 30)))).toHaveAttribute("aria-pressed", "true");
    await page.getByTestId("calendar-day-today").click();
    // A moment later, while the list is still travelling (it has 30 days to cover), the wheel.
    await page.waitForTimeout(150);
    await page.mouse.move(195, 500);
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(2_000);

    // The list is wherever the wheel left it, and the strip follows it: the pressed day is the one at the top.
    const keys = await page.locator("[data-testid^='calendar-day-header-']").evaluateAll((els) =>
      els.map((e) => ({ key: (e.getAttribute("data-testid") ?? "").replace("calendar-day-header-", ""), y: e.getBoundingClientRect().y }))
    );
    const listTop = (await list(page).boundingBox())!.y;
    const atTop = keys.filter((k) => k.y <= listTop + 2).sort((a, b) => b.y - a.y)[0];
    expect(atTop, "a header at the top").toBeTruthy();
    await expect(stripDay(page, atTop.key)).toHaveAttribute("aria-pressed", "true");
    expect(atTop.key, "the wheel took over from the movement to Hoje").not.toBe(iso(TODAY));
  });
});
