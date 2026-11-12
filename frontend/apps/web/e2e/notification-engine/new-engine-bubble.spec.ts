/**
 * PAD-920 — notifications.invitations NB4 (INVITATIONS-120): one end-to-end run of the new-engine
 * bubble with the ids both shells share.
 *
 * The coach is switched to the new engine through the real switch (e2e/scripts/engine_e2e.py) and
 * back after. A one-off class of two, one spot held, gets two new-engine invitations for the open
 * spot; e2e-student-3 takes it on the answer route, then e2e-student-2 answers Yes in the browser
 * into the full session.
 * Asserted by test ids only (PAD-320).
 */
import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { loginAsCoach, loginAsStudent2, STUDENT3_PASSWORD, STUDENT3_USERNAME } from "../helpers/auth";
import { API_APP, API_AUTH } from "../helpers/api";
import { removeClassesOnDay } from "../helpers/cleanup";
import { engineInvite, restoreOldEngine, switchCoachToNewEngine } from "../helpers/engine";

const COACH = "e2e-coach";
const COACH_NAME = "E2E Coach";
const STUDENT_NAME = "E2E Student Two";
const CLASS_TITLE = "E2E New Engine Bubble";

let created: { date: string } | null = null;

async function token(request: APIRequestContext, username: string, password: string): Promise<string> {
  const res = await request.post(`${API_AUTH}/login`, { data: { username, password } });
  expect(res.ok(), `${username} login: ${res.status()}`).toBeTruthy();
  const json = await res.json();
  return (json.accessToken ?? json.access_token) as string;
}

const coachToken = (request: APIRequestContext) => token(request, COACH, "E2eCoach123!");

function inDays(n: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** The chat with `name`, open on the message list. */
async function openChat(page: Page, name: string) {
  await page.goto("/messages");
  await page.getByTestId(/^conversation-row-/).filter({ hasText: name }).first().click();
  await expect(page.getByTestId("message-scroller")).toBeVisible({ timeout: 10000 });
}

test.afterEach(async ({ request }) => {
  const tok = await coachToken(request);
  const auth = { Authorization: `Bearer ${tok}` };
  // The engine's messages in the coach's chat with the student, so no live new-engine bubble is left.
  const convs = await request.get(`${API_APP}/conversations`, { headers: auth });
  const conv = ((await convs.json()).conversations as Array<{ id: number; participantName: string }>).find(
    (c) => c.participantName === STUDENT_NAME,
  );
  if (conv) {
    const detail = await request.get(`${API_APP}/conversation/${conv.id}`, { headers: auth });
    const messages = (await detail.json()).messages as Array<{ id: number; metadata?: { engine?: string } }>;
    for (const m of messages.filter((x) => x.metadata?.engine === "new")) {
      await request.delete(`${API_APP}/message/${m.id}`, { headers: auth }).catch(() => null);
    }
  }
  if (created) await removeClassesOnDay(request, auth, created.date, (e) => e.title === CLASS_TITLE);
  created = null;
  restoreOldEngine(COACH);
});

test("[NOTIFICATIONS-INVITATIONS-120] a yes into a full session shows sorry on both copies", async ({ browser, page, request }) => {
  switchCoachToNewEngine(COACH);
  const tok = await coachToken(request);
  // E2E Student (a right-side player) holds one of the two spots, so one left spot is open.
  const players = await request.get(`${API_APP}/coach_players`, { headers: { Authorization: `Bearer ${tok}` } });
  const roster = (await players.json()) as { items?: Array<{ playerId: number; name: string }> };
  const regular = (roster.items ?? (roster as unknown as Array<{ playerId: number; name: string }>)).find(
    (p) => p.name === "E2E Student",
  )!;
  expect(regular, "seeded E2E Student").toBeTruthy();
  const date = inDays(3);
  const add = await request.post(`${API_APP}/add_class`, {
    headers: { Authorization: `Bearer ${tok}` },
    data: {
      name: CLASS_TITLE, classType: "academy", maxPlayers: 2, date, startTime: "17:00", endTime: "18:00",
      playerIds: [regular.playerId], isRecurring: false, notificationsEnabled: true,
    },
  });
  expect(add.ok(), `add_class: ${add.status()} ${await add.text()}`).toBeTruthy();
  created = { date };

  const { invitations } = engineInvite(CLASS_TITLE, STUDENT3_USERNAME, "e2e-student-2");
  const mine = invitations["e2e-student-2"];

  // e2e-student-3 takes the one spot on the answer route.
  const other = await token(request, STUDENT3_USERNAME, STUDENT3_PASSWORD);
  const placed = await request.post(`${API_APP}/notify/respond`, {
    headers: { Authorization: `Bearer ${other}` },
    data: { invitationId: invitations[STUDENT3_USERNAME], action: "yes" },
  });
  expect(await placed.json()).toMatchObject({ action: "confirmed" });

  // The student's Yes into the full session: sorry, and the buttons are gone.
  await loginAsStudent2(page);
  await openChat(page, COACH_NAME);
  const yes = page.getByTestId(`invite-respond-yes-${mine}`);
  await yes.scrollIntoViewIfNeeded();
  await expect(yes).toBeVisible({ timeout: 10000 });
  await yes.click();
  await expect(page.getByTestId(`invite-state-${mine}-sorry`)).toBeVisible({ timeout: 10000 });
  await expect(page.getByTestId(`invite-respond-yes-${mine}`)).toHaveCount(0);

  // The coach's copy of the same bubble shows the same state.
  const coachContext = await browser.newContext();
  try {
    const coach = await coachContext.newPage();
    await loginAsCoach(coach);
    await openChat(coach, STUDENT_NAME);
    await expect(coach.getByTestId(`invite-state-${mine}-sorry`)).toBeVisible({ timeout: 10000 });
  } finally {
    await coachContext.close();
  }
});
