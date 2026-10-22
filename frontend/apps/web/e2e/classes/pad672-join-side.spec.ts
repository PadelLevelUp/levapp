/**
 * PAD-672 slice 1 (classes.join-requests rule 20): a student with a profile side asks for a class
 * whose only open spot is on the OTHER side, sees "Não há vaga na …", chooses "Estou disposto a
 * jogar em ambos" and ends with a pending request whose side is `both`.
 *
 * NOT RUN by its author (written against the contract, no Playwright run in that session). Server
 * set-up this spec relies on, so a first red run points at the right place:
 *  - the web shell declares the `join-side` capability (apps/web/src/api/client.ts), otherwise the
 *    server never answers 409 `side_full` (an old client keeps today's behaviour);
 *  - the coach's open-spots toggle is on (eligibility.open-spot-visibility) and e2e-student passes
 *    the class's eligibility — otherwise the class is invisible to the student and the request is
 *    refused `not_visible` before the side is looked at;
 *  - the open vacancy gets its side from the DEPARTING player (`freed_spot_side`, rule 2c): e2e-student-2
 *    (profile side right) leaves a 2-player class through the proactive decline, so the spot is a
 *    right spot. If the server picks another side for that roster, open the spot another way —
 *    the assertions only need `sides: ["right"]` against a `left` request;
 *  - the coach's reminder timing is pinned so the decline is proactive (as proactive-decline.spec.ts).
 * Everything it changes is put back in `finally`. Assertions address test ids, never copy (B-103),
 * except the one sentence the owner's mock fixes ("Não há vaga na esquerda").
 */
import { test, expect, type APIRequestContext } from "@playwright/test";
import {
  COACH_PASSWORD,
  COACH_USERNAME,
  STUDENT2_PASSWORD,
  STUDENT2_USERNAME,
  STUDENT_PASSWORD,
  STUDENT_USERNAME,
  loginAsStudent,
} from "../helpers/auth";
import { openCalendar } from "../helpers/navigation";
import { findClassOnCalendar } from "../helpers/calendar-navigation";
import { API_ROOT } from "../helpers/api";
import { deleteClassJoinRequests, removeClassesOnDay } from "../helpers/cleanup";

const TITLE = `E2E Side Class ${Date.now().toString(36)}`; // unique per run: a timed-out run cannot clean up

/** A one-hour slot starting about `hours` from now on the machine's (club) clock, never past 22:00. */
function slotHoursAhead(hours: number): { day: string; startTime: string; endTime: string } {
  const start = new Date(Date.now() + hours * 3600_000);
  if (start.getHours() >= 22) start.setHours(21, 0, 0, 0);
  start.setMinutes(start.getMinutes() - (start.getMinutes() % 5), 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  const day = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`;
  const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return { day, startTime: hhmm(start), endTime: hhmm(new Date(start.getTime() + 3600_000)) };
}

async function bearer(request: APIRequestContext, username: string, password: string) {
  const res = await request.post(`${API_ROOT}/auth/login`, { data: { username, password } });
  expect(res.ok()).toBeTruthy();
  const json = await res.json();
  return { Authorization: `Bearer ${json.accessToken ?? json.access_token}` };
}

async function setSide(
  request: APIRequestContext,
  coachAuth: Record<string, string>,
  coachId: string,
  playerId: string | number,
  side: "left" | "right",
) {
  const res = await request.post(`${API_ROOT}/app/edit_player`, {
    headers: coachAuth,
    data: { player: { playerId, coachId }, updates: { side } },
  });
  expect(res.ok(), `edit_player side ${side}: ${res.status()} ${await res.text()}`).toBeTruthy();
}

test("US-PAD-672: a left player asking for a right-only spot is offered 'both sides', and the request is stored with side both", async ({
  page,
  request,
}) => {
  test.setTimeout(240_000);
  const coachAuth = await bearer(request, COACH_USERNAME, COACH_PASSWORD);
  const studentAuth = await bearer(request, STUDENT_USERNAME, STUDENT_PASSWORD);
  const student2Auth = await bearer(request, STUDENT2_USERNAME, STUDENT2_PASSWORD);
  // Session C (classes.join-requests rule 20): a side can only be refused once a vacancy exists, so
  // the class starts ~20 h out, inside the coach's 24 h invitation window; Student Two's decline then
  // opens the vacancy at once, on the right (rule 2c: a tie keeps the leaver's side).
  const { day, startTime, endTime } = slotHoursAhead(20);
  const requestIds: Array<string | number> = [];

  const coachesRes = await request.get(`${API_ROOT}/app/class-requests/coaches`, { headers: studentAuth });
  const coach = ((await coachesRes.json()) as Array<{ id: string; name: string }>).find((c) => c.name === "E2E Coach");
  expect(coach, "the student is rostered with the seeded coach").toBeTruthy();

  const rosterRes = await request.get(`${API_ROOT}/app/coach_players`, { headers: coachAuth });
  const roster = (await rosterRes.json()) as Array<{ playerId: number; name: string; side?: string | null }>;
  const student = roster.find((p) => p.name === "E2E Student");
  const student2 = roster.find((p) => p.name === "E2E Student Two");
  // Session C (rule 2c): the freed spot's side follows the players who stay, so the one staying must
  // be LEFT for Student Two's (right) spot to count to the right. Every seed "Filler Player" is right,
  // so the spec switches one filler to left for its run and restores it after.
  const filler = roster.find((p) => p.name.startsWith("Filler Player"));
  expect(student && student2 && filler, "the seeded students and a filler are on the roster").toBeTruthy();
  const savedSides = new Map<number, string | null>([
    [student!.playerId, student!.side ?? null],
    [student2!.playerId, student2!.side ?? null],
    [filler!.playerId, filler!.side ?? null],
  ]);

  const configRes = await request.get(`${API_ROOT}/app/notify/config`, { headers: coachAuth });
  const config = await configRes.json();
  const savedVisible = Boolean(config.openSpotsVisible);
  const savedTiming = config.reminderTiming ?? null;

  try {
    await setSide(request, coachAuth, coach!.id, student!.playerId, "left");
    await setSide(request, coachAuth, coach!.id, student2!.playerId, "right");
    await setSide(request, coachAuth, coach!.id, filler!.playerId, "left");
    const configured = await request.post(`${API_ROOT}/app/notify/config`, {
      headers: coachAuth,
      data: {
        openSpotsVisible: true,
        reminderTiming: { ...(savedTiming ?? {}), firstReminder: { type: "hours_before", value: 1 } },
      },
    });
    expect(configured.ok()).toBeTruthy();

    // A two-player class (student 2 on the right, a filler); student 2 steps out -> one right spot.
    const added = await request.post(`${API_ROOT}/app/add_class`, {
      headers: coachAuth,
      data: {
        name: TITLE,
        date: day,
        classType: "academy",
        startTime,
        endTime,
        isRecurring: false,
        // Notifications on: the right spot's round 1 asks only right players at the class's level,
        // so E2E Student (left) gets no invitation. (Off is not honoured for a one-off class's
        // materialised occurrence — Session C's engine bug, reported separately.)
        notificationsEnabled: true,
        maxPlayers: 2,
        playerIds: [student2!.playerId, filler!.playerId],
      },
    });
    expect(added.ok(), `add_class: ${added.status()} ${await added.text()}`).toBeTruthy();
    // Student 2 is IN the class, so the student-facing list does not show it to them; read the class
    // from the coach's calendar day instead.
    const dayRes = await request.get(`${API_ROOT}/app/calendar`, {
      headers: coachAuth,
      params: { from: `${day}T00:00:00`, to: `${day}T23:59:59` },
    });
    const event = ((await dayRes.json()) as Array<{ title: string; model: string; originalId: number; date: string }>).find(
      (e) => e.title === TITLE
    );
    expect(event, "the new class is on the coach's day").toBeTruthy();
    // A one-off class is a Lesson until an occurrence exists, so its `originalId` is not an instance
    // id: decline by the calendar event's ref, which the server resolves to the occurrence.
    const declined = await request.post(`${API_ROOT}/app/notify/cancel_attendance`, {
      headers: student2Auth,
      data: { model: event!.model, originalId: String(event!.originalId), date: event!.date },
    });
    expect(declined.ok(), `cancel_attendance: ${declined.status()} ${await declined.text()}`).toBeTruthy();

    // Preconditions, read as the coach so a red explains itself: the left filler still holds a
    // place, Student Two does not, and E2E Student holds no invitation (so they see "Pedir para entrar").
    const coachView = await request.post(
      `${API_ROOT}/app/class_instance?model=${event!.model}&id=${event!.originalId}&date=${event!.date}`,
      { headers: coachAuth, data: {} }
    );
    expect(coachView.ok(), await coachView.text()).toBeTruthy();
    const detail = (await coachView.json()) as {
      presences?: Array<{ playerId: string | number; status: string | null }>;
      invitations?: Array<{ playerId: string; status: string }>;
    };
    const presenceOf = (id: string | number) => (detail.presences ?? []).find((p) => String(p.playerId) === String(id));
    expect(presenceOf(filler!.playerId), `the filler holds a place: ${JSON.stringify(detail.presences)}`).toBeTruthy();
    expect(presenceOf(filler!.playerId)?.status, "the filler is not absent").not.toBe("absent");
    expect(presenceOf(student2!.playerId)?.status, "Student Two stepped out").toBe("absent");
    expect(
      (detail.invitations ?? []).filter((i) => String(i.playerId) === String(student!.playerId)),
      `E2E Student is not invited to a right spot: ${JSON.stringify(detail.invitations)}`
    ).toEqual([]);

    // The student's calendar must offer the class as an open spot (the join action needs it).
    // As the web shell asks (client-capabilities: open-spot events go only to a client that declares them).
    const studentDay = await request.get(`${API_ROOT}/app/calendar`, {
      headers: { ...studentAuth, "X-LevApp-Capabilities": "open-spots, join-side" },
      params: { from: `${day}T00:00:00`, to: `${day}T23:59:59` },
    });
    const studentEvent = ((await studentDay.json()) as Array<Record<string, unknown>>).find((e) => e.title === TITLE);
    expect(
      studentEvent?.openSpot,
      `the student's event offers an open spot: ${JSON.stringify(studentEvent)}`
    ).toBe(true);

    // The student: open the class, ask to join; the sheet pre-selects Esquerda (the profile side).
    await loginAsStudent(page);
    await openCalendar(page);
    expect(await findClassOnCalendar(page, TITLE), "the class is on the student's calendar").toBe(true);
    const sideCard = page.getByTestId("calendar-event-card").filter({ hasText: TITLE }).first();
    await sideCard.click();
    await expect(page.getByTestId("class-join-request"), "the open-spot join block").toBeVisible({ timeout: 15_000 });
    await page.getByTestId("class-join-request-button").click();
    const sheet = page.getByTestId("class-side-choice");
    await expect(sheet).toBeVisible();
    await expect(page.getByTestId("class-side-left")).toHaveAttribute("aria-checked", "true");
    await expect(page.getByTestId("class-side-usual-left")).toBeVisible();

    // The only spot is on the right: the first send is refused with 409 side_full, nothing is written.
    const [refused] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith("/api/app/class-join-requests") && r.request().method() === "POST"),
      page.getByTestId("class-side-send").click(),
    ]);
    expect(refused.status(), await refused.text()).toBe(409);
    const refusal = await refused.json();
    expect(refusal.code).toBe("side_full");
    expect(refusal.sides).toEqual(["right"]);
    expect(refusal.requestedSide).toBe("left");
    // Located by test id, never by copy (PAD-320; the account may render pt or en): the 409 body above
    // already pinned sides ["right"] and requestedSide "left".
    await expect(page.getByTestId("class-side-full-title")).toBeVisible();
    await expect(page.getByTestId("class-side-stay-waiting")).toBeVisible();

    // "Estou disposto a jogar em ambos": the same request again, with side both.
    const [created] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith("/api/app/class-join-requests") && r.request().method() === "POST"),
      page.getByTestId("class-side-play-both").click(),
    ]);
    expect(created.status(), await created.text()).toBe(201);
    const body = await created.json();
    requestIds.push(body.id);
    expect(body.side).toBe("both");
    expect(body.status).toBe("pending");
    await expect(page.getByTestId("class-join-request-sent")).toBeVisible({ timeout: 10_000 });

    // The API agrees: one pending request, side both.
    const mineRes = await request.get(`${API_ROOT}/app/class-join-requests`, { headers: studentAuth });
    const rows = (await mineRes.json()) as Array<{ id: number; status: string; side: string | null }>;
    const row = rows.find((r) => r.id === body.id);
    expect(row?.status).toBe("pending");
    expect(row?.side).toBe("both");
  } finally {
    await removeClassesOnDay(request, coachAuth, day, (e) => e.title === TITLE);
    await deleteClassJoinRequests(request, coachAuth, requestIds);
    for (const [playerId, side] of savedSides) {
      if (side === "left" || side === "right") await setSide(request, coachAuth, coach!.id, playerId, side);
    }
    await request.post(`${API_ROOT}/app/notify/config`, {
      headers: coachAuth,
      data: { openSpotsVisible: savedVisible, reminderTiming: savedTiming },
    });
  }
});
