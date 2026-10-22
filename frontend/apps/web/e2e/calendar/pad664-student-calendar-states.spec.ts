/**
 * PAD-664 (calendar.view rule 23): a student's calendar shows their own classes, the eligible
 * classes with a spot and the eligible FULL classes, each told apart by a second signal (the ✓, a
 * chip); a filter narrows it to "Só as minhas aulas" — which never hides an invitation waiting for
 * an answer — and is remembered; opening a full class offers its waiting list.
 *
 * Setup is the spec's own (R-040), on the PAD-358 pattern: the coach's open-spots toggle is turned
 * on, four classes are made on one day through the API (enrolled, open, full, invited), and all of
 * it is put back in `finally`. Assertions address test ids and data attributes, never copy (R-013).
 */
import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { COACH_PASSWORD, COACH_USERNAME, STUDENT_PASSWORD, STUDENT_USERNAME, loginAsStudent } from "../helpers/auth";
import { openCalendar } from "../helpers/navigation";
import { goToNextWeek } from "../helpers/calendar-navigation";
import { API_ROOT } from "../helpers/api";
import { removeClassesOnDay } from "../helpers/cleanup";

const ENROLLED = "E2E 664 Enrolled";
const OPEN = "E2E 664 Open";
const FULL = "E2E 664 Full";
const INVITED = "E2E 664 Invited";
const ALL_TITLES = [ENROLLED, OPEN, FULL, INVITED];

function isoDaysAhead(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function bearer(request: APIRequestContext, username: string, password: string) {
  const res = await request.post(`${API_ROOT}/auth/login`, { data: { username, password } });
  expect(res.ok()).toBeTruthy();
  const json = await res.json();
  return { Authorization: `Bearer ${json.accessToken ?? json.access_token}` };
}

async function addClass(
  request: APIRequestContext,
  coachAuth: Record<string, string>,
  body: { name: string; date: string; startTime: string; endTime: string; maxPlayers: number; playerIds: number[] },
) {
  const res = await request.post(`${API_ROOT}/app/add_class`, {
    headers: coachAuth,
    data: { ...body, classType: "academy", isRecurring: false, notificationsEnabled: false },
  });
  expect(res.ok(), `add_class ${body.name}: ${res.status()} ${await res.text()}`).toBeTruthy();
}

function card(page: Page, title: string) {
  return page.getByTestId("calendar-event-card").filter({ hasText: title }).first();
}

/** Walk forward until the enrolled class (always shown) is on screen. */
async function showDay(page: Page) {
  let found = false;
  for (let week = 0; week < 3 && !found; week++) {
    found = await card(page, ENROLLED).waitFor({ state: "visible", timeout: 6000 }).then(() => true, () => false);
    if (!found) await goToNextWeek(page);
  }
  expect(found, "the test day is within three weeks").toBe(true);
}

test("US-PAD-664: three states with a second signal, a remembered filter that keeps invitations, and a full class's waiting list", async ({
  page,
  request,
}) => {
  test.setTimeout(240_000);
  const coachAuth = await bearer(request, COACH_USERNAME, COACH_PASSWORD);
  const studentAuth = await bearer(request, STUDENT_USERNAME, STUDENT_PASSWORD);
  const day = isoDaysAhead(2);

  const configRes = await request.get(`${API_ROOT}/app/notify/config`, { headers: coachAuth });
  expect(configRes.ok()).toBeTruthy();
  const savedVisible = Boolean((await configRes.json()).openSpotsVisible);

  const rosterRes = await request.get(`${API_ROOT}/app/coach_players`, { headers: coachAuth });
  expect(rosterRes.ok()).toBeTruthy();
  const roster = (await rosterRes.json()) as Array<{ playerId: number; name: string }>;
  const student = roster.find((p) => p.name === "E2E Student");
  const filler = roster.find((p) => p.name.startsWith("Filler Player"));
  expect(student, "the seeded student is on the roster").toBeTruthy();
  expect(filler, "a filler player to take the full class's only spot").toBeTruthy();

  try {
    expect(
      (await request.post(`${API_ROOT}/app/notify/config`, { headers: coachAuth, data: { openSpotsVisible: true } })).ok(),
    ).toBeTruthy();
    await addClass(request, coachAuth, { name: ENROLLED, date: day, startTime: "08:00", endTime: "09:00", maxPlayers: 4, playerIds: [student!.playerId] });
    await addClass(request, coachAuth, { name: OPEN, date: day, startTime: "10:00", endTime: "11:00", maxPlayers: 4, playerIds: [] });
    await addClass(request, coachAuth, { name: FULL, date: day, startTime: "12:00", endTime: "13:00", maxPlayers: 1, playerIds: [filler!.playerId] });
    await addClass(request, coachAuth, { name: INVITED, date: day, startTime: "14:00", endTime: "15:00", maxPlayers: 4, playerIds: [] });

    // The invitation: the coach invites the student to INVITED through the manual-notify path.
    const coachDay = await request.get(`${API_ROOT}/app/calendar`, {
      headers: coachAuth,
      params: { from: `${day}T00:00:00Z`, to: `${day}T23:59:59Z` },
    });
    const invitedEvent = ((await coachDay.json()) as Array<{ title: string; model: string; originalId: number; date: string }>).find(
      (e) => e.title === INVITED,
    );
    expect(invitedEvent).toBeTruthy();
    const invite = await request.post(`${API_ROOT}/app/notify/manual`, {
      headers: coachAuth,
      data: { model: invitedEvent!.model, originalId: invitedEvent!.originalId, date: invitedEvent!.date, playerIds: [student!.playerId] },
    });
    expect(invite.ok(), `manual invite: ${invite.status()} ${await invite.text()}`).toBeTruthy();

    await loginAsStudent(page);
    await page.evaluate(() => {
      for (const k of Object.keys(localStorage)) if (k.startsWith("levapp.calendar.studentFilter.")) localStorage.removeItem(k);
    });
    await openCalendar(page);
    await showDay(page);

    // 1. The default shows every class the student is eligible for, each with its second signal.
    const filter = page.getByTestId("calendar-student-filter");
    await expect(filter.getByTestId("calendar-student-filter-eligible")).toHaveAttribute("aria-pressed", "true");
    await expect(card(page, ENROLLED).getByTestId("calendar-enrolled-mark")).toBeVisible();
    await expect(card(page, OPEN).getByTestId("calendar-open-spot-chip")).toBeVisible();
    await expect(card(page, FULL).getByTestId("calendar-relation-chip")).toHaveAttribute("data-relation", "full");
    await expect(card(page, INVITED).getByTestId("calendar-relation-chip")).toHaveAttribute("data-relation", "invited");
    const legend = page.getByTestId("calendar-legend");
    await expect(legend.locator('[data-testid="calendar-legend-item"][data-variant="full"]')).toBeVisible();
    await expect(legend.locator('[data-testid="calendar-legend-item"][data-variant="open-spot"]')).toBeVisible();

    // 2. "Só as minhas aulas" hides the offers but never the invitation, and survives a reload.
    await filter.getByTestId("calendar-student-filter-mine").click();
    await expect(card(page, OPEN)).toHaveCount(0);
    await expect(card(page, FULL)).toHaveCount(0);
    await expect(card(page, INVITED)).toBeVisible();
    await expect(card(page, ENROLLED)).toBeVisible();
    await expect(legend.locator('[data-testid="calendar-legend-item"][data-variant="full"]')).toHaveCount(0);
    await page.reload();
    await showDay(page);
    await expect(page.getByTestId("calendar-student-filter-mine")).toHaveAttribute("aria-pressed", "true");
    await expect(card(page, INVITED)).toBeVisible();
    await expect(card(page, FULL)).toHaveCount(0);

    // 3. Back to all; the full class offers its waiting list, and afterwards reads as waiting.
    await page.getByTestId("calendar-student-filter-eligible").click();
    await card(page, FULL).click();
    const joinBlock = page.getByTestId("class-waiting-list-student");
    await expect(joinBlock).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("class-join-request-button")).toHaveCount(0);
    // PAD-672: the join asks for the side first (the sheet is a nested dialog: located by test id).
    await page.getByTestId("class-waiting-list-join").click();
    await page.getByTestId("class-side-left").click();
    const [joined] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith("/api/app/class-waiting-list") && r.request().method() === "POST"),
      page.getByTestId("class-side-send").click(),
    ]);
    expect(joined.status(), await joined.text()).toBe(201);
    await expect(page.getByTestId("class-waiting-list-on")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(card(page, FULL).getByTestId("calendar-relation-chip")).toHaveAttribute("data-relation", "waiting", {
      timeout: 10_000,
    });

    // The server agrees after a fresh read.
    const places = await request.get(`${API_ROOT}/app/class-waiting-list`, { headers: studentAuth });
    expect(((await places.json()) as Array<{ classTitle: string }>).some((p) => p.classTitle === FULL)).toBe(true);
  } finally {
    await removeClassesOnDay(request, coachAuth, day, (e) => ALL_TITLES.includes(e.title));
    await request.post(`${API_ROOT}/app/notify/config`, { headers: coachAuth, data: { openSpotsVisible: savedVisible } });
  }
});
