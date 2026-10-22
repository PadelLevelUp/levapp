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

const TITLE = "E2E Side Class";

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
  const day = isoDaysAhead(3);
  const requestIds: Array<string | number> = [];

  const coachesRes = await request.get(`${API_ROOT}/app/class-requests/coaches`, { headers: studentAuth });
  const coach = ((await coachesRes.json()) as Array<{ id: string; name: string }>).find((c) => c.name === "E2E Coach");
  expect(coach, "the student is rostered with the seeded coach").toBeTruthy();

  const rosterRes = await request.get(`${API_ROOT}/app/coach_players`, { headers: coachAuth });
  const roster = (await rosterRes.json()) as Array<{ playerId: number; name: string; side?: string | null }>;
  const student = roster.find((p) => p.name === "E2E Student");
  const student2 = roster.find((p) => p.name === "E2E Student Two");
  const filler = roster.find((p) => p.name.startsWith("Filler Player"));
  expect(student && student2 && filler, "the seeded students and a filler are on the roster").toBeTruthy();
  const savedSides = new Map<number, string | null>([
    [student!.playerId, student!.side ?? null],
    [student2!.playerId, student2!.side ?? null],
  ]);

  const configRes = await request.get(`${API_ROOT}/app/notify/config`, { headers: coachAuth });
  const config = await configRes.json();
  const savedVisible = Boolean(config.openSpotsVisible);
  const savedTiming = config.reminderTiming ?? null;

  try {
    await setSide(request, coachAuth, coach!.id, student!.playerId, "left");
    await setSide(request, coachAuth, coach!.id, student2!.playerId, "right");
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
        startTime: "18:00",
        endTime: "19:00",
        isRecurring: false,
        notificationsEnabled: true,
        maxPlayers: 2,
        playerIds: [student2!.playerId, filler!.playerId],
      },
    });
    expect(added.ok(), `add_class: ${added.status()} ${await added.text()}`).toBeTruthy();
    const listed = await request.get(`${API_ROOT}/app/academy-classes?coachId=${coach!.id}`, { headers: student2Auth });
    const mine = ((await listed.json()).classes ?? []) as Array<{ title: string; originalId: number }>;
    // Student 2 is IN the class, so the student-facing list does not show it to them; read the id
    // from the coach's calendar day instead.
    const dayRes = await request.get(`${API_ROOT}/app/calendar_events`, {
      headers: coachAuth,
      params: { from: `${day}T00:00:00`, to: `${day}T23:59:59` },
    });
    const event = ((await dayRes.json()) as Array<{ title: string; originalId: number }>).find((e) => e.title === TITLE);
    expect(event ?? mine.find((c) => c.title === TITLE), "the new class is found").toBeTruthy();
    const instanceId = (event ?? mine.find((c) => c.title === TITLE))!.originalId;
    const declined = await request.post(`${API_ROOT}/app/notify/cancel_attendance`, {
      headers: student2Auth,
      data: { lessonInstanceId: instanceId },
    });
    expect(declined.ok(), `cancel_attendance: ${declined.status()} ${await declined.text()}`).toBeTruthy();

    // The student: open the class, ask to join; the sheet pre-selects Esquerda (the profile side).
    await loginAsStudent(page);
    await openCalendar(page);
    expect(await findClassOnCalendar(page, TITLE), "the class is on the student's calendar").toBe(true);
    await page.getByTestId("calendar-event-card").filter({ hasText: TITLE }).first().click();
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
    await expect(page.getByTestId("class-side-full-title")).toHaveText("Não há vaga na esquerda");
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
