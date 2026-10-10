/**
 * PAD-577 — notifications.invitations rule 15a, waiting-list rule 14.
 *
 * Two students are invited by hand to one open spot; the coach records the filler's yes, so the
 * class is full. Student Two then answers "Yes" on their own invitation: the server refuses it
 * as `spot_filled` and the bubble reads "Vaga preenchida" with "Juntar-me à lista de espera".
 * They join, read "Estás na lista de espera"; the coach's class payload then holds them on the
 * waiting list as the student's own request. Seeded and read through the API; asserted by test
 * id (PAD-320).
 *
 * Why the late yes and not the fill itself: a manual invitation has no vacancy, so a fill does
 * not retire it, and a coach-recorded yes retires vacancy invitations as `expired`, not
 * `spot_filled` (reported to the coordinator, 2026-10-10). The late yes is the one path that
 * writes `spot_filled` on the loser's own bubble deterministically.
 */
import { test, expect, type APIRequestContext } from "@playwright/test";
import { loginAsStudent2 } from "../helpers/auth";
import { openMessages } from "../helpers/navigation";
import { API_APP, API_AUTH } from "../helpers/api";

const CLASS_TITLE = "E2E Lost Spot Waiting List";
const ENROLLED = "E2E Student";
// The winner never logs in: an unused filler on the roster. The loser must be on the coach's roster
// AND able to log in — e2e-student-2, as in coach-answer-reaches-chat. ("E2E Student Three" has no
// coach by design, PAD-215, so it can never be invited.)
const WINNER = "Filler Player 15";
const LOSER = "E2E Student Two"; // logs in as e2e-student-2
const COACH_NAME = "E2E Coach";
type ClassRef = { model: string; originalId: number; date: string };
const created: ClassRef[] = [];

async function token(request: APIRequestContext): Promise<string> {
  const res = await request.post(`${API_AUTH}/login`, { data: { username: "e2e-coach", password: "E2eCoach123!" } });
  expect(res.ok()).toBeTruthy();
  const json = await res.json();
  return (json.accessToken ?? json.access_token) as string;
}
function inDays(n: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// The student's own join is gated by the coach's open-spot visibility (waiting-list rule 14,
// academy-class-booking rule 6: `not_visible`). Turned on for this spec, restored after.
let restoreVisible: boolean | null = null;

test.afterEach(async ({ request }) => {
  const tok = await token(request);
  if (restoreVisible !== null) {
    await request.post(`${API_APP}/notify/config`, { headers: { Authorization: `Bearer ${tok}` }, data: { openSpotsVisible: restoreVisible } }).catch(() => null);
    restoreVisible = null;
  }
  while (created.length) {
    const event = created.pop()!;
    await request.post(`${API_APP}/remove_class`, { headers: { Authorization: `Bearer ${tok}` }, data: { event, scope: "single" } }).catch(() => null);
  }
});

test("PAD-577: the student who lost the spot joins that class's waiting list from the invitation", async ({ page, request }) => {
  const tok = await token(request);
  const auth = { Authorization: `Bearer ${tok}` };
  const rosterRes = await request.get(`${API_APP}/coach_players`, { headers: auth });
  const rosterBody = await rosterRes.json();
  const roster = (rosterBody.items ?? rosterBody) as Array<{ playerId: number; levelId: number | null; name: string }>;
  const byName = (name: string) => { const p = roster.find((x) => x.name === name); expect(p, `seeded "${name}"`).toBeTruthy(); return p!; };
  const enrolled = byName(ENROLLED), winner = byName(WINNER), loser = byName(LOSER);

  const cfg = await request.get(`${API_APP}/notify/config`, { headers: auth });
  expect(cfg.ok(), `notify config: ${cfg.status()}`).toBeTruthy();
  restoreVisible = !!(await cfg.json()).openSpotsVisible;
  const vis = await request.post(`${API_APP}/notify/config`, { headers: auth, data: { openSpotsVisible: true } });
  expect(vis.ok() && (await vis.json()).openSpotsVisible, "open spots visible for the join").toBe(true);

  const date = inDays(3);
  const add = await request.post(`${API_APP}/add_class`, {
    headers: auth,
    data: { name: CLASS_TITLE, classType: "academy", maxPlayers: 2, levelId: enrolled.levelId, date, startTime: "17:00", endTime: "18:00",
            playerIds: [enrolled.playerId], isRecurring: false, notificationsEnabled: true },
  });
  expect(add.ok(), `add_class: ${add.status()}`).toBeTruthy();
  const made = await add.json();
  const ref: ClassRef = { model: made.model ?? "Lesson", originalId: made.originalId, date };
  created.push(ref);

  // One open spot, two invited by hand; the winner's yes is recorded by the coach (rule 9).
  const notify = await request.post(`${API_APP}/notify/manual`, { headers: auth, data: { model: ref.model, originalId: ref.originalId, date, playerIds: [winner.playerId, loser.playerId] } });
  expect(notify.ok(), `manual notify: ${notify.status()}`).toBeTruthy();
  expect((await notify.json()).sent).toBe(2);
  const detail = async () => (await (await request.post(`${API_APP}/class_instance?model=${ref.model}&id=${ref.originalId}&date=${date}`, { headers: auth })).json());
  const winnerInvite = ((await detail()).invitations as Array<{ id: number; playerId: string }>).find((i) => i.playerId === String(winner.playerId))!;
  expect(winnerInvite).toBeTruthy();
  const respond = await request.post(`${API_APP}/notify/coach_respond`, { headers: auth, data: { notificationEventId: winnerInvite.id, action: "yes" } });
  expect(respond.ok(), `coach_respond: ${respond.status()} ${await respond.text()}`).toBeTruthy();

  // The loser's own invitation bubble, by the event id its metadata carries (R-040 point 3).
  const loserInvite = ((await detail()).invitations as Array<{ id: number; playerId: string }>).find((i) => i.playerId === String(loser.playerId))!;
  expect(loserInvite).toBeTruthy();
  const convs = await request.get(`${API_APP}/conversations`, { headers: auth });
  const conv = ((await convs.json()).conversations as Array<{ id: number; participantName: string }>).find((c) => c.participantName === LOSER);
  expect(conv, "the coach's conversation with the loser").toBeTruthy();
  const thread = await (await request.get(`${API_APP}/conversation/${conv!.id}`, { headers: auth })).json();
  const loserMessage = (thread.messages as Array<{ id: number; metadata?: { notificationEventId?: number } }>)
    .find((m) => m.metadata?.notificationEventId === loserInvite.id);
  expect(loserMessage, "the loser's invitation message").toBeTruthy();
  const loserMessageId = loserMessage!.id;

  // The loser answers late: their "Yes" on a full class is refused as spot_filled, and the bubble
  // offers the waiting list (rule 15a).
  await loginAsStudent2(page);
  await openMessages(page);
  await page.getByTestId(/^conversation-row-/).filter({ hasText: COACH_NAME }).first().click();
  const bubble = page.getByTestId(`message-item-${loserMessageId}`);
  await bubble.scrollIntoViewIfNeeded();
  const lateYes = page.waitForResponse((r) => /\/notify\/respond$/.test(r.url()) && r.request().method() === "POST");
  await bubble.getByTestId("invite-respond-yes").click();
  const lateYesRes = await lateYes;
  expect(lateYesRes.ok()).toBeTruthy();
  expect((await lateYesRes.json()).action, "the late yes on a full class").toMatch(/^spot_filled/);
  const join = bubble.getByTestId("invite-join-waiting-list");
  await expect(join).toBeVisible({ timeout: 15_000 });
  await join.click();
  await expect(bubble.getByTestId("invite-on-waiting-list")).toBeVisible({ timeout: 10_000 });
  await expect(bubble.getByTestId("invite-join-waiting-list")).toHaveCount(0);

  // The coach's class payload holds them as the student's own request, for this occurrence (rule 14).
  const rows = ((await detail()).waitingList ?? []) as Array<{ playerId: number; origin: string; scope: string }>;
  expect(rows).toEqual([expect.objectContaining({ playerId: loser.playerId, origin: "student", scope: "occurrence" })]);

  // Leaving from the same bubble takes them off (rule 14's leave) and offers the join again.
  await bubble.getByTestId("invite-leave-waiting-list").click();
  await expect(bubble.getByTestId("invite-join-waiting-list")).toBeVisible({ timeout: 10_000 });
  expect(((await detail()).waitingList ?? []) as unknown[]).toEqual([]);
});
