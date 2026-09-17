/**
 * PAD-358 (classes.academy-class-booking): from the "Marcar Aula" wizard, a
 * student picks the coach, chooses "join an academy class", and sees that coach's
 * classes for the next fourteen days in two states — an open class they request
 * with a note, a full class (in the destructive token) whose waiting list they join.
 *
 * Setup is the spec's own (R-040): the coach's open-spots toggle is turned on and
 * two classes are created through the API — one with room, one full with a filler
 * player — and all of it is put back in `finally`. The seed is untouched, because a
 * seeded toggle would advertise open spots on every student calendar in the suite.
 * Assertions address test ids and state attributes, never copy (B-103).
 */
import { test, expect, type APIRequestContext } from "@playwright/test";
import { COACH_PASSWORD, COACH_USERNAME, STUDENT_PASSWORD, STUDENT_USERNAME, loginAsCoach, loginAsStudent } from "../helpers/auth";
import { openCalendar } from "../helpers/navigation";
import { goToNextWeek } from "../helpers/calendar-navigation";
import { API_ROOT } from "../helpers/api";
import { deleteClassRequests, removeClassesOnDay } from "../helpers/cleanup";

/** PAD-356's "Marcar Aula" CTA on the Pedidos de aula card (Session E). */
const WIZARD_CTA = "class-request-book";

const OPEN_CLASS = "E2E Wizard Open Class";
const FULL_CLASS = "E2E Wizard Full Class";
const NOTE = "Posso chegar 10 minutos depois?";

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
  body: { name: string; date: string; maxPlayers: number; playerIds: number[] },
) {
  const res = await request.post(`${API_ROOT}/app/add_class`, {
    headers: coachAuth,
    data: {
      ...body,
      classType: "academy",
      startTime: "18:00",
      endTime: "19:00",
      isRecurring: false,
      notificationsEnabled: false,
    },
  });
  expect(res.ok(), `add_class ${body.name}: ${res.status()} ${await res.text()}`).toBeTruthy();
}

test("US-PAD-358: the academy step lists open and full classes; a request carries a note, a full class takes a waiting-list place", async ({
  page,
  request,
}) => {
  test.setTimeout(180_000);
  const coachAuth = await bearer(request, COACH_USERNAME, COACH_PASSWORD);
  const studentAuth = await bearer(request, STUDENT_USERNAME, STUDENT_PASSWORD);
  const openDay = isoDaysAhead(2);
  const fullDay = isoDaysAhead(3);
  const requestIds: Array<string | number> = [];

  const configRes = await request.get(`${API_ROOT}/app/notify/config`, { headers: coachAuth });
  expect(configRes.ok()).toBeTruthy();
  const savedVisible = Boolean((await configRes.json()).openSpotsVisible);

  const coachesRes = await request.get(`${API_ROOT}/app/class-requests/coaches`, { headers: studentAuth });
  expect(coachesRes.ok()).toBeTruthy();
  const coach = ((await coachesRes.json()) as Array<{ id: string; name: string }>).find((c) => c.name === "E2E Coach");
  expect(coach, "the student is rostered with the seeded coach").toBeTruthy();

  const rosterRes = await request.get(`${API_ROOT}/app/coach_players`, { headers: coachAuth });
  expect(rosterRes.ok()).toBeTruthy();
  const filler = ((await rosterRes.json()) as Array<{ playerId: number; name: string }>).find((p) =>
    p.name.startsWith("Filler Player"),
  );
  expect(filler, "a filler player to take the full class's only spot").toBeTruthy();

  try {
    const toggled = await request.post(`${API_ROOT}/app/notify/config`, {
      headers: coachAuth,
      data: { openSpotsVisible: true },
    });
    expect(toggled.ok()).toBeTruthy();
    await addClass(request, coachAuth, { name: OPEN_CLASS, date: openDay, maxPlayers: 4, playerIds: [] });
    await addClass(request, coachAuth, { name: FULL_CLASS, date: fullDay, maxPlayers: 1, playerIds: [filler!.playerId] });

    // The wizard: coach, then "join an academy class".
    await loginAsStudent(page);
    await page.goto("/availability");
    await page.getByTestId(WIZARD_CTA).click();
    const wizard = page.getByTestId("class-request-wizard");
    await expect(wizard).toBeVisible({ timeout: 10_000 });
    await wizard.getByTestId(`wizard-coach-${coach!.id}`).click();
    const listed = page.waitForResponse(
      (r) => r.url().includes("/api/app/academy-classes") && r.request().method() === "GET",
    );
    await wizard.getByTestId("wizard-kind-academy").click();
    expect((await listed).status()).toBe(200);

    const list = page.getByTestId("academy-class-list");
    const openRow = list.getByTestId("academy-class-row").filter({ hasText: OPEN_CLASS });
    const fullRow = list.getByTestId("academy-class-row").filter({ hasText: FULL_CLASS });
    await expect(openRow).toHaveAttribute("data-state", "open", { timeout: 10_000 });
    await expect(fullRow).toHaveAttribute("data-state", "full");

    // Open: request with a note.
    await openRow.getByTestId("academy-class-request").click();
    await openRow.getByTestId("academy-class-note").fill(NOTE);
    const [created] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith("/api/app/class-join-requests") && r.request().method() === "POST"),
      openRow.getByTestId("academy-class-send").click(),
    ]);
    expect(created.status(), await created.text()).toBe(201);
    const createdBody = await created.json();
    requestIds.push(createdBody.id);
    expect(createdBody.note).toBe(NOTE);
    await expect(openRow.getByTestId("academy-class-status")).toHaveAttribute("data-status", "requested", {
      timeout: 10_000,
    });

    // Full: join the waiting list.
    const [joined] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith("/api/app/class-waiting-list") && r.request().method() === "POST"),
      fullRow.getByTestId("academy-class-join-waitlist").click(),
    ]);
    expect(joined.status(), await joined.text()).toBe(201);
    await expect(fullRow.getByTestId("academy-class-status")).toHaveAttribute("data-status", "on_waiting_list", {
      timeout: 10_000,
    });

    // The server agrees after a fresh read.
    const again = await request.get(`${API_ROOT}/app/academy-classes?coachId=${coach!.id}`, { headers: studentAuth });
    const rows = ((await again.json()).classes ?? []) as Array<{
      title: string;
      myJoinRequest: { status: string } | null;
      onWaitingList: boolean;
    }>;
    expect(rows.find((r) => r.title === OPEN_CLASS)?.myJoinRequest?.status).toBe("pending");
    expect(rows.find((r) => r.title === FULL_CLASS)?.onWaitingList).toBe(true);
  } finally {
    await removeClassesOnDay(request, coachAuth, openDay, (e) => e.title === OPEN_CLASS);
    await removeClassesOnDay(request, coachAuth, fullDay, (e) => e.title === FULL_CLASS);
    await deleteClassRequests(request, coachAuth, requestIds);
    await request.post(`${API_ROOT}/app/notify/config`, {
      headers: coachAuth,
      data: { openSpotsVisible: savedVisible },
    });
  }
});

/**
 * Rule 5 (cross-review F1): the coach sees the student's note on the class's pending
 * requests, not only in chat. Independent of the wizard: the request is made through
 * the API, the coach reads it on the class sheet.
 */
test("US-PAD-358: the coach's class sheet shows the note on a pending join request", async ({ page, request }) => {
  test.setTimeout(180_000);
  const coachAuth = await bearer(request, COACH_USERNAME, COACH_PASSWORD);
  const studentAuth = await bearer(request, STUDENT_USERNAME, STUDENT_PASSWORD);
  const day = isoDaysAhead(2);
  const title = "E2E Wizard Note Class";
  const requestIds: Array<string | number> = [];

  const configRes = await request.get(`${API_ROOT}/app/notify/config`, { headers: coachAuth });
  const savedVisible = Boolean((await configRes.json()).openSpotsVisible);

  try {
    expect((await request.post(`${API_ROOT}/app/notify/config`, { headers: coachAuth, data: { openSpotsVisible: true } })).ok()).toBeTruthy();
    await addClass(request, coachAuth, { name: title, date: day, maxPlayers: 4, playerIds: [] });

    const coachesRes = await request.get(`${API_ROOT}/app/class-requests/coaches`, { headers: studentAuth });
    const coach = ((await coachesRes.json()) as Array<{ id: string; name: string }>).find((c) => c.name === "E2E Coach");
    const listed = await request.get(`${API_ROOT}/app/academy-classes?coachId=${coach!.id}`, { headers: studentAuth });
    const target = ((await listed.json()).classes as Array<{ title: string; model: string; originalId: number; date: string }>).find(
      (c) => c.title === title,
    );
    expect(target, "the class is listed for the student").toBeTruthy();
    const created = await request.post(`${API_ROOT}/app/class-join-requests`, {
      headers: studentAuth,
      data: { model: target!.model, originalId: target!.originalId, date: target!.date, note: NOTE },
    });
    expect(created.status(), await created.text()).toBe(201);
    requestIds.push((await created.json()).id);

    await loginAsCoach(page);
    await openCalendar(page);
    const card = page.getByTestId("calendar-event-card").filter({ hasText: title }).first();
    let found = false;
    for (let week = 0; week < 3 && !found; week++) {
      found = await card.waitFor({ state: "visible", timeout: 6000 }).then(() => true, () => false);
      if (!found) await goToNextWeek(page);
    }
    expect(found, "the class card is within three weeks").toBe(true);
    await card.click();

    const row = page.getByTestId("class-join-request-row").first();
    await expect(row).toBeVisible({ timeout: 10_000 });
    await expect(row.getByTestId("class-join-request-note")).toHaveText(NOTE);
  } finally {
    await removeClassesOnDay(request, coachAuth, day, (e) => e.title === title);
    await deleteClassRequests(request, coachAuth, requestIds);
    await request.post(`${API_ROOT}/app/notify/config`, { headers: coachAuth, data: { openSpotsVisible: savedVisible } });
  }
});
