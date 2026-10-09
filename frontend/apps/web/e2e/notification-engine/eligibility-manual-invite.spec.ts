/**
 * PAD-562 — eligibility.enforcement rule 6a, notifications.manual rule 8.
 *
 * Inviting a student by hand who fails the class's bar asks first, through the same dialog the
 * manual add uses (invite verb), one dialog for the whole selection: cancel sends nothing, confirm
 * sends to everyone selected. The class is created per test with a PER-CLASS eligibility override
 * (never the coach-wide bar other specs read); what the spec writes it removes by its own ids
 * (R-040). Asserted by test ids, never by copy (PAD-320).
 */
import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { openCalendar } from "../helpers/navigation";
import { findClassOnCalendar } from "../helpers/calendar-navigation";
import { API_APP, API_AUTH } from "../helpers/api";
import { removeClassesOnDay } from "../helpers/cleanup";
import { ui } from "../helpers/i18n";

const CLASS_TITLE = "E2E Invite Below Bar";
const ENROLLED = "E2E Student"; // beginner: sets the class level
const BELOW = ["Filler Player 01", "Filler Player 02"]; // intermediate fillers fail "same level as class"
const FINE = "E2E Student Two"; // beginner: passes

type Ref = { model: string; originalId: number; date: string };
/** R-040: what the spec wrote, removed by its own ids in afterEach whether the test passed or not.
 *  The invitation messages are found as the DIFF against a snapshot of each student's chat taken
 *  before anything is sent, so a neighbour's invitation to the same seeded students is never touched. */
type Created = { title: string; date: string; ref: Ref; chatBefore: Map<number, Set<number>> };
const created: Created[] = [];

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

/** A class three days out, at the beginner level, whose own bar is "same level as the class". */
async function seedClass(request: APIRequestContext, tok: string, suffix: string) {
  const players = await roster(request, tok);
  const byName = (name: string) => {
    const p = players.find((x) => x.name === name);
    expect(p, `seeded "${name}" must exist`).toBeTruthy();
    return p!;
  };
  const enrolled = byName(ENROLLED);
  const date = inDays(3);
  const title = `${CLASS_TITLE} ${suffix}`;
  const add = await request.post(`${API_APP}/add_class`, {
    headers: { Authorization: `Bearer ${tok}` },
    data: {
      name: title, classType: "academy", maxPlayers: 6, levelId: enrolled.levelId, date,
      startTime: "17:00", endTime: "18:00", playerIds: [enrolled.playerId], isRecurring: false,
      notificationsEnabled: true,
    },
  });
  expect(add.ok(), `add_class: ${add.status()} ${await add.text()}`).toBeTruthy();
  const made = await add.json();
  const ref: Ref = { model: made.model ?? "Lesson", originalId: made.originalId as number, date };
  const record: Created = { title, date, ref, chatBefore: await inviteMessagesByChat(request, tok) };
  created.push(record);
  const override = await request.post(`${API_APP}/edit_class`, {
    headers: { Authorization: `Bearer ${tok}` },
    data: { event: ref, scope: "single", updates: { eligibilityRules: [{ attribute: "level", operation: "same_as_class" }] } },
  });
  expect(override.ok(), `eligibility override: ${override.status()} ${await override.text()}`).toBeTruthy();
  return { title, ref, below: BELOW.map(byName), fine: byName(FINE) };
}

/** The invitation-message ids in the coach's chat with each of the students this spec invites. */
async function inviteMessagesByChat(request: APIRequestContext, tok: string): Promise<Map<number, Set<number>>> {
  const auth = { Authorization: `Bearer ${tok}` };
  const convs = await request.get(`${API_APP}/conversations`, { headers: auth });
  expect(convs.ok()).toBeTruthy();
  const rows = ((await convs.json()).conversations as Array<{ id: number; participantName: string }>)
    .filter((c) => [...BELOW, FINE].includes(c.participantName));
  const out = new Map<number, Set<number>>();
  for (const c of rows) {
    const detail = await request.get(`${API_APP}/conversation/${c.id}`, { headers: auth });
    expect(detail.ok()).toBeTruthy();
    const ids = ((await detail.json()).messages as Array<{ id: number; messageType?: string }>)
      .filter((m) => m.messageType === "notification_invite")
      .map((m) => m.id);
    out.set(c.id, new Set(ids));
  }
  return out;
}

async function invitationsOf(request: APIRequestContext, tok: string, ref: Created["ref"]) {
  const res = await request.post(`${API_APP}/class_instance?model=${ref.model}&id=${ref.originalId}&date=${ref.date}`, {
    headers: { Authorization: `Bearer ${tok}` },
  });
  expect(res.ok()).toBeTruthy();
  return ((await res.json()).invitations ?? []) as Array<{ playerId: string }>;
}

/** Opens the class and its "Convidar" modal, selects the named students by search. */
async function openNotifyAndSelect(page: Page, title: string, names: string[]) {
  await openCalendar(page);
  expect(await findClassOnCalendar(page, title), "the seeded class is on the calendar").toBe(true);
  await page.getByTestId("calendar-event-card").filter({ hasText: title }).first().click();
  await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 5000 });
  await page.getByRole("button", { name: ui("calendar.detail.notify") }).first().click();
  const modal = page.getByTestId("notify-students-dialog");
  await expect(modal).toBeVisible({ timeout: 10000 });
  const search = modal.getByPlaceholder(ui("calendar.notify.searchPlaceholder"));
  for (const name of names) {
    await search.fill(name);
    await modal.getByText(name, { exact: true }).first().click();
  }
  await search.fill("");
  return modal;
}

test.afterEach(async ({ request }) => {
  const tok = await token(request);
  const auth = { Authorization: `Bearer ${tok}` };
  while (created.length) {
    const { title, date, chatBefore } = created.pop()!;
    // Only the invitation messages that appeared since the snapshot are this spec's (R-040 point 3).
    const after = await inviteMessagesByChat(request, tok);
    for (const [convId, ids] of after) {
      const before = chatBefore.get(convId) ?? new Set<number>();
      for (const id of ids) {
        if (before.has(id)) continue;
        const del = await request.delete(`${API_APP}/message/${id}`, { headers: auth }).catch(() => null);
        expect(del?.ok(), `delete invitation message ${id}: ${del?.status()}`).toBeTruthy();
      }
    }
    await removeClassesOnDay(request, auth, date, (e) => e.title === title);
  }
});

test("PAD-562: inviting students below the bar asks once for all of them; cancel sends nothing, confirm sends to everyone", async ({ page, request }) => {
  test.setTimeout(150_000);
  const tok = await token(request);
  const { title, ref, below, fine } = await seedClass(request, tok, "all");

  await loginAsCoach(page);
  const modal = await openNotifyAndSelect(page, title, [...BELOW, FINE]);

  // Cancel: the dialog names the two failing students, nothing goes out, the selection stays.
  let manualPosts = 0;
  page.on("request", (r) => { if (/\/api\/app\/notify\/manual$/.test(r.url()) && r.method() === "POST") manualPosts += 1; });
  await modal.getByTestId("notify-students-send").click();
  const dialog = page.getByTestId("eligibility-confirm");
  await expect(dialog).toBeVisible({ timeout: 10000 });
  await expect(dialog.getByTestId("eligibility-confirm-student")).toHaveCount(2);
  for (const p of below) await expect(dialog).toContainText(p.name);
  await expect(dialog).not.toContainText(fine.name);
  await expect(dialog.getByTestId("eligibility-confirm-reason").first()).toBeVisible();
  await dialog.getByTestId("eligibility-confirm-cancel").click();
  await expect(dialog).toBeHidden();
  await expect(modal).toBeVisible();
  expect(manualPosts).toBe(0);
  expect(await invitationsOf(request, tok, ref)).toHaveLength(0);

  // Confirm: one POST, three invitations.
  const sent = page.waitForResponse((r) => /\/api\/app\/notify\/manual$/.test(r.url()) && r.status() === 200);
  await modal.getByTestId("notify-students-send").click();
  await expect(page.getByTestId("eligibility-confirm")).toBeVisible({ timeout: 10000 });
  await page.getByTestId("eligibility-confirm-proceed").click();
  await sent;
  await expect.poll(async () => (await invitationsOf(request, tok, ref)).length, { timeout: 10000 }).toBe(3);
  const invited = (await invitationsOf(request, tok, ref)).map((i) => String(i.playerId)).sort();
  expect(invited).toEqual([...below.map((p) => String(p.playerId)), String(fine.playerId)].sort());

  // The three invitation messages now in the students' chats are removed by afterEach, by diff.
});
