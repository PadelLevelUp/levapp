/**
 * attendance.confirm rule 32 (ATTENDANCE-CONFIRM-47): on the new engine "Afinal vou" is offered only
 * while a place the student could take is free.
 *
 * The coach is switched to the new engine through the real switch (e2e/scripts/engine_e2e.py) and back
 * after. A one-off class of two: E2E Student (right) holds one place, the left place is open.
 * e2e-student-3 is invited to it, takes it on the answer route and cancels; then E2E Student Two
 * (left) is invited, takes it and cancels. Both are students placed for that class only who cancelled.
 * E2E Student Two opens the class detail, sees "Afinal vou" and comes back: their row reads `coming`
 * and the coach's participant list has them under "Vão". e2e-student-3 then opens the class, now full
 * on that side: the spot-taken line and the waiting-list join, no "Afinal vou".
 * Asserted by test ids and data attributes only (PAD-320).
 */
import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import {
  STUDENT2_PASSWORD,
  STUDENT2_USERNAME,
  STUDENT3_PASSWORD,
  STUDENT3_USERNAME,
  loginAsCoach,
  loginAsStudent2,
  loginAsStudent3,
} from "../helpers/auth";
import { API_APP, API_AUTH } from "../helpers/api";
import { removeClassesOnDay } from "../helpers/cleanup";
import { openCalendar } from "../helpers/navigation";
import { goToNextWeek } from "../helpers/calendar-navigation";
import { engineInvite, restoreOldEngine, switchCoachToNewEngine } from "../helpers/engine";

const COACH = "e2e-coach";
const COACH_PASSWORD = "E2eCoach123!";
const CLASS_TITLE = "E2E Engine Afinal Vou";
const STUDENT_NAMES = ["E2E Student Two", "E2E Student Three"];

let created: { date: string } | null = null;

async function token(request: APIRequestContext, username: string, password: string): Promise<string> {
  const res = await request.post(`${API_AUTH}/login`, { data: { username, password } });
  expect(res.ok(), `${username} login: ${res.status()}`).toBeTruthy();
  const json = await res.json();
  return (json.accessToken ?? json.access_token) as string;
}
const bearer = (tok: string) => ({ Authorization: `Bearer ${tok}` });

function inDays(n: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function card(page: Page) {
  return page.getByTestId("calendar-event-card").filter({ hasText: CLASS_TITLE }).first();
}

async function openClassDetail(page: Page) {
  await openCalendar(page);
  let found = false;
  for (let week = 0; week < 2 && !found; week++) {
    found = await card(page).waitFor({ state: "visible", timeout: 6000 }).then(() => true, () => false);
    if (!found) await goToNextWeek(page);
  }
  expect(found, "the class card is within two weeks").toBe(true);
  await card(page).click();
  await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 5000 });
}

/** One invitation to the open place, taken on the answer route, then cancelled: placed for that class only. */
async function placeThenCancel(request: APIRequestContext, username: string, password: string) {
  const { instanceId, invitations } = engineInvite(CLASS_TITLE, username);
  const tok = await token(request, username, password);
  const placed = await request.post(`${API_APP}/notify/respond`, {
    headers: bearer(tok),
    data: { invitationId: invitations[username], action: "yes" },
  });
  expect(await placed.json(), `${username} takes the place`).toMatchObject({ action: "confirmed" });
  const cancelled = await request.post(`${API_APP}/notify/cancel_attendance`, {
    headers: bearer(tok),
    data: { lessonInstanceId: instanceId },
  });
  expect(cancelled.ok(), `${username} cancels: ${cancelled.status()} ${await cancelled.text()}`).toBeTruthy();
  return instanceId;
}

test.afterEach(async ({ request }) => {
  const auth = bearer(await token(request, COACH, COACH_PASSWORD));
  // The engine's messages in the coach's chats with both students, so no live new-engine bubble is left.
  const convs = await request.get(`${API_APP}/conversations`, { headers: auth });
  const list = ((await convs.json()).conversations ?? []) as Array<{ id: number; participantName: string }>;
  for (const conv of list.filter((c) => STUDENT_NAMES.includes(c.participantName))) {
    const detail = await request.get(`${API_APP}/conversation/${conv.id}`, { headers: auth });
    const messages = ((await detail.json()).messages ?? []) as Array<{ id: number; metadata?: { engine?: string } }>;
    for (const m of messages.filter((x) => x.metadata?.engine === "new")) {
      await request.delete(`${API_APP}/message/${m.id}`, { headers: auth }).catch(() => null);
    }
  }
  if (created) await removeClassesOnDay(request, auth, created.date, (e) => e.title === CLASS_TITLE);
  created = null;
  restoreOldEngine(COACH);
});

test("[ATTENDANCE-CONFIRM-47] a student who cancelled comes back while a place is free", async ({ browser, page, request }) => {
  test.setTimeout(180_000);
  switchCoachToNewEngine(COACH);
  const coachAuth = bearer(await token(request, COACH, COACH_PASSWORD));
  const players = await request.get(`${API_APP}/coach_players`, { headers: coachAuth });
  const body = await players.json();
  const roster = (body.items ?? body) as Array<{ playerId: number; name: string }>;
  const regular = roster.find((p) => p.name === "E2E Student");
  const rui = roster.find((p) => p.name === "E2E Student Two");
  expect(regular, "seeded E2E Student").toBeTruthy();
  expect(rui, "seeded E2E Student Two").toBeTruthy();

  const date = inDays(4);
  const add = await request.post(`${API_APP}/add_class`, {
    headers: coachAuth,
    data: {
      name: CLASS_TITLE, classType: "academy", maxPlayers: 2, date, startTime: "17:00", endTime: "18:00",
      playerIds: [regular!.playerId], isRecurring: false, notificationsEnabled: true,
    },
  });
  expect(add.ok(), `add_class: ${add.status()} ${await add.text()}`).toBeTruthy();
  created = { date };

  // Two students placed for that class only, each then cancelled; the left place is free.
  await placeThenCancel(request, STUDENT3_USERNAME, STUDENT3_PASSWORD);
  await placeThenCancel(request, STUDENT2_USERNAME, STUDENT2_PASSWORD);

  // Rui sees "Afinal vou" and comes back.
  await loginAsStudent2(page);
  await openClassDetail(page);
  await expect(page.getByTestId("attendance-state").first()).toHaveAttribute("data-state", "not_coming", { timeout: 10_000 });
  const comeBack = page.getByTestId("attendance-come-back");
  await expect(comeBack).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("attendance-come-back-spot-taken")).toHaveCount(0);
  const [answer] = await Promise.all([
    page.waitForResponse((r) => /\/api\/app\/notify\/respond_reminder(\?|$)/.test(r.url()), { timeout: 10_000 }),
    comeBack.click(),
  ]);
  expect(answer.status(), await answer.text()).toBe(200);
  expect((await answer.json()).action).toBe("confirmed");
  await expect(page.getByTestId("attendance-state").first()).toHaveAttribute("data-state", "coming", { timeout: 10_000 });
  await expect(page.getByTestId("attendance-come-back")).toHaveCount(0);

  // The coach's participant list has him under "Vão".
  const coachContext = await browser.newContext();
  try {
    const coach = await coachContext.newPage();
    await loginAsCoach(coach);
    await openClassDetail(coach);
    const going = coach.locator('[data-testid="participant-group"][data-group="going"]');
    await expect(going.getByTestId(`participant-row-${rui!.playerId}`)).toBeVisible({ timeout: 10_000 });
  } finally {
    await coachContext.close();
  }

  // The other student who cancelled: the side is full, so the place went.
  const otherContext = await browser.newContext();
  try {
    const other = await otherContext.newPage();
    await loginAsStudent3(other);
    await openClassDetail(other);
    await expect(other.getByTestId("attendance-come-back-spot-taken")).toBeVisible({ timeout: 10_000 });
    await expect(other.getByTestId("attendance-come-back-waiting-list")).toBeVisible();
    await expect(other.getByTestId("attendance-come-back")).toHaveCount(0);
  } finally {
    await otherContext.close();
  }
});
