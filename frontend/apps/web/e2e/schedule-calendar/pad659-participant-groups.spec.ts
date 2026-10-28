/**
 * PAD-659 / PAD-663 (`calendar.event-detail` rules 22–25): the coach's class detail lists its
 * participants compactly in three groups — Vão, Por responder, Não vão — ordered by side then
 * name, with the profile in a pop-up that returns the coach where they were, and a student's
 * answer moves them between groups live.
 *
 * Everything here is this spec's own: sixteen placeholder students (named with a run stamp) and a
 * one-off class two days out, both removed afterwards (R-040). The live test uses the seeded
 * E2E Student in a class of its own.
 */
import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { COACH_PASSWORD, COACH_USERNAME, STUDENT_PASSWORD, STUDENT_USERNAME, loginAsCoach } from "../helpers/auth";
import { API_APP, API_AUTH } from "../helpers/api";
import { dayEvents, removeClassesOnDay } from "../helpers/cleanup";
import { openCalendar } from "../helpers/navigation";
import { goToNextWeek } from "../helpers/calendar-navigation";

test.use({ viewport: { width: 1440, height: 900 } });

// Outside the reminder window (48 h by default): a class CREATED after its reminder time counts
// its students as coming (notifications.reminders rule 22, PAD-489), so a class two days out
// created after 20:30 had no "Por responder" group at all — CI's first run of this spec.
const DAYS_AHEAD = 5;

const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

async function token(request: APIRequestContext, username: string, password: string): Promise<string> {
  const res = await request.post(`${API_AUTH}/login`, { data: { username, password } });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  return body.accessToken ?? body.access_token;
}

function isoDaysFromToday(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type Side = "left" | "right" | "both" | null;
type Mark = "present" | "absent" | null;

async function rosterRows(request: APIRequestContext, coachTok: string) {
  const res = await request.get(`${API_APP}/coach_players`, { headers: bearer(coachTok) });
  expect(res.ok()).toBeTruthy();
  const data = await res.json();
  return (Array.isArray(data) ? data : data.items) as Array<{ playerId: string | number; coachId: string | number; name: string }>;
}

async function addPlaceholder(request: APIRequestContext, coachTok: string, name: string, side: Side): Promise<number> {
  const res = await request.post(`${API_APP}/add_player`, { headers: bearer(coachTok), data: side ? { name, side } : { name } });
  expect(res.ok(), `add_player ${name}: ${res.status()}`).toBeTruthy();
  return Number((await res.json()).playerId);
}

async function addClass(request: APIRequestContext, coachTok: string, day: string, title: string, playerIds: number[]) {
  const res = await request.post(`${API_APP}/add_class`, {
    headers: bearer(coachTok),
    data: { name: title, classType: "academy", maxPlayers: 16, date: day, startTime: "20:30", endTime: "21:30", isRecurring: false, playerIds },
  });
  expect(res.ok(), `add_class ${title}: ${res.status()} ${await res.text()}`).toBeTruthy();
}

/** The coach's own marks, through the call the "Editar presenças" save makes. */
async function mark(request: APIRequestContext, coachTok: string, day: string, title: string, marks: Array<[number, Mark]>) {
  const event = (await dayEvents(request, bearer(coachTok), day)).find((e) => e.title === title);
  expect(event, "the class is on the coach's day").toBeTruthy();
  const res = await request.post(`${API_APP}/class_instance/presences/confirm`, {
    headers: bearer(coachTok),
    data: {
      classInstance: { ...event, date: day },
      presences: marks.map(([playerId, status]) => ({ playerId, status, justification: status === "absent" ? "unjustified" : undefined })),
    },
  });
  expect(res.ok(), `confirm presences: ${res.status()} ${await res.text()}`).toBeTruthy();
}

async function openClassDetail(page: Page, title: string) {
  await openCalendar(page);
  const card = page.getByTestId("calendar-event-card").filter({ hasText: title }).first();
  let found = false;
  for (let week = 0; week < 2 && !found; week++) {
    found = await card.waitFor({ state: "visible", timeout: 8000 }).then(() => true, () => false);
    if (!found) await goToNextWeek(page);
  }
  expect(found, `the class card "${title}" is on the calendar`).toBe(true);
  await card.click();
  await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 5000 });
}

/** Scroll the class sheet with the wheel (memory: scroll tests must use the wheel) until the
 *  participants header sits near the top of the viewport. */
async function scrollToParticipants(page: Page) {
  const enrolled = page.getByTestId("participants-enrolled");
  await expect(enrolled).toBeVisible({ timeout: 10_000 });
  // Hover inside the sheet's own scroller (its header line), then wheel.
  await enrolled.hover();
  for (let i = 0; i < 30; i++) {
    const y = (await enrolled.boundingBox())!.y;
    if (y < 140) break;
    await page.mouse.wheel(0, Math.min(300, y - 100));
    await page.waitForTimeout(120);
  }
  expect((await enrolled.boundingBox())!.y, "the wheel brought Participantes to the top").toBeLessThan(140);
}

/** The scrollTop of whichever ancestor of the participants list actually scrolls. */
async function sheetScrollTop(page: Page): Promise<number> {
  return page.getByTestId("participants-enrolled").evaluate((el) => {
    let n: HTMLElement | null = el as HTMLElement;
    while (n) {
      if (n.scrollHeight > n.clientHeight && getComputedStyle(n).overflowY !== "visible") return n.scrollTop;
      n = n.parentElement;
    }
    return -1;
  });
}

const created: { coachTok: string; day: string; title: string; players: number[] }[] = [];

test.afterEach(async ({ request }) => {
  for (const c of created.splice(0)) {
    await removeClassesOnDay(request, bearer(c.coachTok), c.day, (e) => e.title === c.title);
    const roster = await rosterRows(request, c.coachTok);
    for (const id of c.players) {
      const row = roster.find((r) => Number(r.playerId) === id);
      if (row) await request.post(`${API_APP}/remove_player`, { headers: bearer(c.coachTok), data: { coachId: row.coachId, playerId: id, action: "delete" } });
    }
  }
});

test("US-PAD-659a: sixteen players fit at 1440×900, grouped Vão / Por responder / Não vão, ordered by side then name", async ({ page, request }) => {
  test.setTimeout(180_000);
  const coachTok = await token(request, COACH_USERNAME, COACH_PASSWORD);
  const stamp = Date.now().toString(36);
  const day = isoDaysFromToday(DAYS_AHEAD);
  const title = `E2E P659 ${stamp}`;
  const n = (first: string) => `${first} P659 ${stamp}`;

  // [first name, side, the coach's mark]
  const spec: Array<[string, Side, Mark]> = [
    ["Gil", "left", "present"], ["Hugo", "right", "present"], ["Ivo", "both", "present"], ["Joel", "right", "present"],
    ["Bruno", "right", null], ["Álvaro", "right", null], ["Carlos", "left", null], ["Diogo", "both", null],
    ["Eduardo", null, null], ["Filipe", "left", null], ["Abel", "right", null], ["Tiago", "both", null],
    ["Luís", "left", "absent"], ["Miguel", "right", "absent"], ["Nuno", "both", "absent"], ["Rui", null, "absent"],
  ];
  const ids: number[] = [];
  const record = { coachTok, day, title, players: ids };
  created.push(record);
  for (const [first, side] of spec) ids.push(await addPlaceholder(request, coachTok, n(first), side));
  await addClass(request, coachTok, day, title, ids);
  await mark(request, coachTok, day, title, spec.map(([, , m], i) => [ids[i], m] as [number, Mark]).filter(([, m]) => m !== null));

  await loginAsCoach(page);
  await openClassDetail(page, title);
  await scrollToParticipants(page);

  // Header (PAD-771): the filled spots over capacity, 4 not coming leave 4 open.
  await expect(page.getByTestId("participants-enrolled")).toContainText("12/16");

  // Groups, in order, with their counts; the empty-group rule is covered by US-PAD-659c.
  const groups = page.getByTestId("participant-group");
  await expect(groups).toHaveCount(3);
  expect(await groups.evaluateAll((els) => els.map((e) => e.getAttribute("data-group")))).toEqual(["going", "pending", "not_going"]);
  await expect(groups.nth(0)).toContainText("4");
  await expect(groups.nth(1)).toContainText("8");

  // The avatar initials precede the name in the button's text; strip them by testing the tail.
  const going = await groups.nth(0).locator('[data-testid^="participant-row-"]').evaluateAll((rows) => rows.map((r) => r.textContent ?? ""));
  expect(going.map((t) => t.match(/(Gil|Hugo|Ivo|Joel)/)![1])).toEqual(["Ivo", "Hugo", "Joel", "Gil"]); // Amb, Dir, Dir, Esq
  const pending = await groups.nth(1).locator('[data-testid^="participant-row-"]').evaluateAll((rows) => rows.map((r) => r.textContent ?? ""));
  const pendingNames = pending.map((t) => t.match(/(Abel|Álvaro|Bruno|Carlos|Diogo|Eduardo|Filipe|Tiago)/)![1]);
  // Amb (Diogo, Tiago), Dir (Abel, Álvaro, Bruno — Á collates with A), Esq (Carlos, Filipe), none (Eduardo).
  expect(pendingNames).toEqual(["Diogo", "Tiago", "Abel", "Álvaro", "Bruno", "Carlos", "Filipe", "Eduardo"]);

  // A coach's mark before the class is intent (PAD-663): the stored state stays attended.
  await expect(groups.nth(0).locator('[data-testid^="participant-row-"]').first()).toHaveAttribute("data-state", "attended");

  // No level, no state word on a row.
  await expect(page.getByTestId("participant-group").getByTestId("attendance-state")).toHaveCount(0);

  // All sixteen rows are inside the viewport at once, and the list has no scroll of its own.
  const rows = page.locator('[data-testid^="participant-row-"]');
  await expect(rows).toHaveCount(16);
  for (let i = 0; i < 16; i++) {
    const b = (await rows.nth(i).boundingBox())!;
    expect(b.y, `row ${i} top`).toBeGreaterThanOrEqual(0);
    expect(b.y + b.height, `row ${i} bottom`).toBeLessThanOrEqual(900);
  }
});

test("US-PAD-659b: the pop-up opens from the name, shows the profile, and every close returns the coach where they were", async ({ page, request }) => {
  test.setTimeout(150_000);
  const coachTok = await token(request, COACH_USERNAME, COACH_PASSWORD);
  const stamp = Date.now().toString(36);
  const day = isoDaysFromToday(DAYS_AHEAD);
  const title = `E2E P659b ${stamp}`;
  const name = `Ana P659 ${stamp}`;
  const ids: number[] = [];
  created.push({ coachTok, day, title, players: ids });
  ids.push(await addPlaceholder(request, coachTok, name, "right"));
  for (let i = 0; i < 9; i++) ids.push(await addPlaceholder(request, coachTok, `Fill${i} P659 ${stamp}`, "left"));
  await addClass(request, coachTok, day, title, ids);

  await loginAsCoach(page);
  await openClassDetail(page, title);
  await scrollToParticipants(page);
  const before = await sheetScrollTop(page);
  expect(before, "the class sheet scrolled to Participantes").toBeGreaterThan(0);

  const opener = page.getByTestId(`participant-open-${ids[0]}`);
  const popup = page.getByTestId("participant-popup");

  // The side chip opens nothing.
  await page.getByTestId(`participant-row-${ids[0]}`).getByTestId("participant-side").click();
  await expect(popup).toHaveCount(0);

  for (const close of ["Escape", "x", "outside"] as const) {
    await opener.click();
    await expect(popup).toBeVisible();
    await expect(popup).toContainText(name);
    await expect(page.getByTestId("participant-popup-state")).toHaveAttribute("data-group", "pending");
    if (close === "Escape") await page.keyboard.press("Escape");
    else if (close === "x") await page.getByTestId("participant-popup-close").click();
    else await page.mouse.click(8, 450); // the overlay, left of the sheet
    await expect(popup, `closed by ${close}`).toHaveCount(0);
    await expect(page.getByTestId("participants-enrolled"), `the class is still open after ${close}`).toBeVisible();
    expect(await sheetScrollTop(page), `same scroll after ${close}`).toBe(before);
    await expect(opener, `focus back on the name after ${close}`).toBeFocused();
  }
});

test("US-PAD-659c: a student's answer moves them between groups live, and an empty group is not shown", async ({ page, request }) => {
  test.setTimeout(150_000);
  const coachTok = await token(request, COACH_USERNAME, COACH_PASSWORD);
  const studentTok = await token(request, STUDENT_USERNAME, STUDENT_PASSWORD);
  const studentId = Number((await rosterRows(request, coachTok)).find((r) => r.name === "E2E Student")!.playerId);
  const day = isoDaysFromToday(DAYS_AHEAD);
  const title = `E2E P659c ${Date.now().toString(36)}`;
  created.push({ coachTok, day, title, players: [] });
  await addClass(request, coachTok, day, title, [studentId]);

  await loginAsCoach(page);
  await openClassDetail(page, title);
  const row = page.getByTestId(`participant-row-${studentId}`);
  await expect(row).toBeVisible({ timeout: 10_000 });
  const groups = page.getByTestId("participant-group");
  await expect(groups).toHaveCount(1);
  await expect(groups.first()).toHaveAttribute("data-group", "pending");

  // The student gives the spot up from their own session (a proactive decline).
  const event = (await dayEvents(request, bearer(coachTok), day)).find((e) => e.title === title)!;
  const cancel = await request.post(`${API_APP}/notify/cancel_attendance`, {
    headers: bearer(studentTok),
    data: { model: event.model, originalId: event.originalId, date: day },
  });
  expect(cancel.ok(), `cancel_attendance: ${cancel.status()} ${await cancel.text()}`).toBeTruthy();

  // No reload: the live event regroups the open class.
  await expect(groups.first()).toHaveAttribute("data-group", "not_going", { timeout: 15_000 });
  await expect(groups).toHaveCount(1);
  await expect(row).toHaveAttribute("data-state", "not_coming");
});
