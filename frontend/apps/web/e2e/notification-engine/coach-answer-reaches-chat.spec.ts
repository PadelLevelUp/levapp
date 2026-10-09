/**
 * PAD-563 — notifications.invitations rule 9 and messaging.sse-realtime rule 18.
 *
 * The coach records an invitee's answer from the class detail; the student's open chat flips the
 * invitation bubble to "marked by the coach" over SSE, with no reload and the Yes/No buttons gone.
 * Two browser contexts: the student's chat is open BEFORE the coach acts, and the student's page
 * never navigates again, so the flip can only come from the live event (B-402: both shells used
 * to drop the metadata of a `message_edited`). Seeded through the API (a manual invitation to a
 * roster student who can log in); asserted by test ids, never by rendered copy (PAD-320).
 */
import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { loginAsCoach, loginAsStudent2 } from "../helpers/auth";
import { openCalendar } from "../helpers/navigation";
import { findClassOnCalendar } from "../helpers/calendar-navigation";
import { API_APP, API_AUTH } from "../helpers/api";

const CLASS_TITLE = "E2E Coach Answer Reaches Chat";
const ENROLLED = "E2E Student";
const INVITEE = "E2E Student Two"; // e2e-student-2: on the roster, can log in
const COACH_NAME = "E2E Coach";

type ClassRef = { model: string; originalId: number; date: string };
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

async function seedInvitedClass(request: APIRequestContext, tok: string, suffix: string) {
  const players = await roster(request, tok);
  const byName = (name: string) => {
    const p = players.find((x) => x.name === name);
    expect(p, `seeded "${name}" must exist`).toBeTruthy();
    return p!;
  };
  const enrolled = byName(ENROLLED);
  const invitee = byName(INVITEE);
  const date = inDays(3);
  const add = await request.post(`${API_APP}/add_class`, {
    headers: { Authorization: `Bearer ${tok}` },
    data: {
      name: `${CLASS_TITLE} ${suffix}`, classType: "academy", maxPlayers: 4, levelId: enrolled.levelId, date,
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
    data: { model: ref.model, originalId: ref.originalId, date, playerIds: [invitee.playerId] },
  });
  expect(notify.ok(), `manual notify: ${notify.status()}`).toBeTruthy();
  expect((await notify.json()).sent).toBe(1);
  return { invitee, title: `${CLASS_TITLE} ${suffix}` };
}

/** The student's chat with the coach, open on the invitation bubble with its live buttons. */
async function openStudentChat(page: Page) {
  await loginAsStudent2(page);
  await page.goto("/messages");
  await page.getByTestId(/^conversation-row-/).filter({ hasText: COACH_NAME }).first().click();
  await expect(page.getByTestId("message-scroller")).toBeVisible({ timeout: 10000 });
  await expect(page.getByTestId("invite-respond-yes").last()).toBeVisible({ timeout: 10000 });
}

async function openClass(page: Page, title: string) {
  await openCalendar(page);
  expect(await findClassOnCalendar(page, title), "the seeded class is on the calendar").toBe(true);
  await page.getByTestId("calendar-event-card").filter({ hasText: title }).first().click();
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

for (const [action, outcome] of [["accepted", "accepted"], ["declined", "declined"]] as const) {
  test(`PAD-563: the coach marks an invitation ${action}; the student's open chat flips live, buttons gone`, async ({ browser, page, request }) => {
    const tok = await token(request);
    const { invitee, title } = await seedInvitedClass(request, tok, action);

    // The student first: their chat is open and live before the coach does anything.
    const studentContext = await browser.newContext();
    const student = await studentContext.newPage();
    try {
      await openStudentChat(student);
      // Other specs may leave this student other live invitations in the same chat, so count
      // deltas, never absolutes.
      const bubblesBefore = await student.getByTestId("invite-recorded-by-coach").count();
      const yesBefore = await student.getByTestId("invite-respond-yes").count();
      const noBefore = await student.getByTestId("invite-respond-no").count();

      await loginAsCoach(page);
      await openClass(page, title);
      const row = page.getByTestId(`invitee-row-${invitee.playerId}`);
      await expect(row).toHaveAttribute("data-outcome", "pending");
      await page.getByTestId(`invitee-actions-${invitee.playerId}`).click();
      await page.getByTestId(`invitee-mark-${action}`).click();
      await expect(row).toHaveAttribute("data-outcome", outcome, { timeout: 10000 });

      // The student's page never navigated: the badge can only have come over SSE (rule 18).
      await expect(student.getByTestId("invite-recorded-by-coach")).toHaveCount(bubblesBefore + 1, { timeout: 15000 });
      await expect(student.getByTestId("invite-respond-yes")).toHaveCount(yesBefore - 1);
      await expect(student.getByTestId("invite-respond-no")).toHaveCount(noBefore - 1);
      expect(student.url()).toContain("/messages");
    } finally {
      await studentContext.close();
    }
  });
}
