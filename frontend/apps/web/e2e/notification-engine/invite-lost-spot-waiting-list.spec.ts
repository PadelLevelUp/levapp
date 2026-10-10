/**
 * PAD-577 — notifications.invitations rule 15a, waiting-list rule 14.
 *
 * Two students are invited to one open spot; the coach records the first one's yes, so the
 * other's invitation is retired ("Vaga preenchida"). That student opens the chat, sees
 * "Juntar-me à lista de espera", joins, and reads "Estás na lista de espera"; the coach's class
 * payload then holds them on the waiting list as the student's own request. Seeded and read
 * through the API; asserted by test id (PAD-320).
 */
import { test, expect, type APIRequestContext } from "@playwright/test";
import { loginAsStudent3 } from "../helpers/auth";
import { openMessages } from "../helpers/navigation";
import { API_APP, API_AUTH } from "../helpers/api";

const CLASS_TITLE = "E2E Lost Spot Waiting List";
const ENROLLED = "E2E Student";
const WINNER = "E2E Student Two";
const LOSER = "E2E Student Three"; // logs in as e2e-student-3
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

test.afterEach(async ({ request }) => {
  const tok = await token(request);
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

  // The loser's chat: "Vaga preenchida" with the waiting-list offer (rule 15a).
  await loginAsStudent3(page);
  await openMessages(page);
  await page.locator('[data-testid^="conversation-row-"]').first().click();
  const join = page.getByTestId("invite-join-waiting-list");
  await expect(join).toBeVisible({ timeout: 15_000 });
  await join.click();
  await expect(page.getByTestId("invite-on-waiting-list")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("invite-join-waiting-list")).toHaveCount(0);

  // The coach's class payload holds them as the student's own request, for this occurrence (rule 14).
  const rows = ((await detail()).waitingList ?? []) as Array<{ playerId: number; origin: string; scope: string }>;
  expect(rows).toEqual([expect.objectContaining({ playerId: loser.playerId, origin: "student", scope: "occurrence" })]);

  // Leaving from the same bubble takes them off (rule 14's leave) and offers the join again.
  await page.getByTestId("invite-leave-waiting-list").click();
  await expect(page.getByTestId("invite-join-waiting-list")).toBeVisible({ timeout: 10_000 });
  expect(((await detail()).waitingList ?? []) as unknown[]).toEqual([]);
});
