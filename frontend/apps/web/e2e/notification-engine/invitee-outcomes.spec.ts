/**
 * PAD-548 — calendar.event-detail rules 16–18, notifications.invitations rule 19.
 *
 * The class detail's invitee list shows each invitee's outcome, the coach can record an answer
 * for them, and the coach can withdraw a live invitation after a warning. Seeded through the API
 * (manual invitations to two roster students); asserted by test ids and the payload's `outcome`,
 * never by rendered English (PAD-320).
 */
import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { openCalendar } from "../helpers/navigation";
import { findClassOnCalendar } from "../helpers/calendar-navigation";
import { API_APP, API_AUTH } from "../helpers/api";

const CLASS_TITLE = "E2E Invitee Outcomes Class";
const ENROLLED = "E2E Student";
const TO_ACCEPT = "E2E Student Two";
const TO_WITHDRAW = "Filler Player 01";

type ClassRef = { model: string; originalId: number; date: string };
type Invitation = { id: number; playerId: string; outcome: string; answeredBy: string | null };
const created: ClassRef[] = [];

async function token(request: APIRequestContext): Promise<string> {
  const res = await request.post(`${API_AUTH}/login`, { data: { username: "e2e-coach", password: "E2eCoach123!" } });
  expect(res.ok(), `coach login: ${res.status()}`).toBeTruthy();
  const json = await res.json();
  return (json.accessToken ?? json.access_token) as string;
}

function inDays(n: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function roster(request: APIRequestContext, tok: string) {
  const res = await request.get(`${API_APP}/coach_players`, { headers: { Authorization: `Bearer ${tok}` } });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  return (body.items ?? body) as Array<{ playerId: number; levelId: number | null; name: string }>;
}

async function invitations(request: APIRequestContext, tok: string, ref: ClassRef): Promise<Invitation[]> {
  const res = await request.post(
    `${API_APP}/class_instance?model=${ref.model}&id=${ref.originalId}&date=${ref.date}`,
    { headers: { Authorization: `Bearer ${tok}` } },
  );
  expect(res.ok(), `class_instance: ${res.status()}`).toBeTruthy();
  return ((await res.json()).invitations ?? []) as Invitation[];
}

async function openClass(page: Page) {
  await openCalendar(page);
  expect(await findClassOnCalendar(page, CLASS_TITLE), "the seeded class is on the calendar").toBe(true);
  await page.getByText(CLASS_TITLE).first().click();
  await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 5000 });
  await page.getByTestId("class-invited-toggle").click();
}

test.afterEach(async ({ request }) => {
  const tok = await token(request);
  while (created.length) {
    const event = created.pop()!;
    await request
      .post(`${API_APP}/remove_class`, { headers: { Authorization: `Bearer ${tok}` }, data: { event, scope: "single" } })
      .catch(() => null);
  }
});

test("PAD-548: invitees show their outcome; the coach records a yes and withdraws an invitation", async ({ page, request }) => {
  const tok = await token(request);
  const players = await roster(request, tok);
  const byName = (name: string) => {
    const p = players.find((x) => x.name === name);
    expect(p, `seeded "${name}" must exist`).toBeTruthy();
    return p!;
  };
  const enrolled = byName(ENROLLED);
  const accepter = byName(TO_ACCEPT);
  const withdrawn = byName(TO_WITHDRAW);

  const date = inDays(3);
  const add = await request.post(`${API_APP}/add_class`, {
    headers: { Authorization: `Bearer ${tok}` },
    data: {
      name: CLASS_TITLE, classType: "academy", maxPlayers: 4, levelId: enrolled.levelId, date,
      startTime: "17:00", endTime: "18:00", playerIds: [enrolled.playerId], isRecurring: false,
      notificationsEnabled: true,
    },
  });
  expect(add.ok(), `add_class: ${add.status()} ${await add.text()}`).toBeTruthy();
  const made = await add.json();
  const ref: ClassRef = { model: made.model ?? "Lesson", originalId: made.originalId, date };
  created.push(ref);

  const notify = await request.post(`${API_APP}/notify/manual`, {
    headers: { Authorization: `Bearer ${tok}` },
    data: { model: ref.model, originalId: ref.originalId, date, playerIds: [accepter.playerId, withdrawn.playerId] },
  });
  expect(notify.ok(), `manual notify: ${notify.status()}`).toBeTruthy();
  expect((await notify.json()).sent).toBe(2);

  await loginAsCoach(page);
  await openClass(page);

  const row = (pid: number) => page.getByTestId(`invitee-row-${pid}`);
  await expect(row(accepter.playerId)).toHaveAttribute("data-outcome", "pending");
  await expect(row(withdrawn.playerId)).toHaveAttribute("data-outcome", "pending");

  // Rule 17: the coach records the accepter's yes.
  await page.getByTestId(`invitee-actions-${accepter.playerId}`).click();
  await page.getByTestId("invitee-mark-accepted").click();
  await expect(row(accepter.playerId)).toHaveAttribute("data-outcome", "accepted", { timeout: 10000 });
  await expect(page.getByTestId(`invitee-recorded-by-coach-${accepter.playerId}`)).toBeVisible();
  await expect(page.getByTestId(`invitee-actions-${accepter.playerId}`)).toHaveCount(0);

  // Rule 18: the warning, then the withdrawal. Cancelling first changes nothing.
  await expect(page.getByTestId("invitee-mark-accepted")).toHaveCount(0); // the first menu closed
  await page.getByTestId(`invitee-actions-${withdrawn.playerId}`).click();
  await page.getByTestId("invitee-delete").click();
  await expect(page.getByTestId("invitee-delete-dialog")).toBeVisible();
  await page.getByTestId("invitee-delete-cancel").click();
  await expect(row(withdrawn.playerId)).toHaveAttribute("data-outcome", "pending");

  await page.getByTestId(`invitee-actions-${withdrawn.playerId}`).click();
  await page.getByTestId("invitee-delete").click();
  await page.getByTestId("invitee-delete-confirm").click();
  await expect(row(withdrawn.playerId)).toHaveAttribute("data-outcome", "withdrawn", { timeout: 10000 });
  await expect(page.getByTestId(`invitee-actions-${withdrawn.playerId}`)).toHaveCount(0);

  // The payload both shells read says the same.
  const rows = await invitations(request, tok, ref);
  const outcomeOf = (pid: number) => rows.find((r) => String(r.playerId) === String(pid));
  expect(outcomeOf(accepter.playerId)).toMatchObject({ outcome: "accepted", answeredBy: "coach" });
  expect(outcomeOf(withdrawn.playerId)).toMatchObject({ outcome: "withdrawn", answeredBy: null });
});
