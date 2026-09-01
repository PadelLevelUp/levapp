/**
 * E2E — PAD-72: a student invited several times for the same class must appear
 * only ONCE in the class-detail guest ("Invited") list.
 *
 * Spec: specs/calendar/spec.md — calendar.event-detail rules 6-9.
 *
 * The invitation engine legitimately creates one `NotificationEvent` per invite
 * sent (multi-round matching, manual + automatic invites, re-invites). The
 * class-detail payload used to render one row per invite RECORD, so a student
 * who was invited three times showed up three times in the coach's guest list.
 * The list must be keyed by STUDENT instead.
 *
 * Run:
 *   npx playwright test e2e/schedule-calendar/guest-list-dedupe.spec.ts
 */

import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { openCalendar } from "../helpers/navigation";
import { findClassOnCalendar } from "../helpers/calendar-navigation";
import { API_BASE, AUTH_BASE } from "../helpers/api";


/** Dedicated class so the assertions don't race with other specs' invites. */
const DEDUPE_CLASS_TITLE = "E2E Guest Dedupe Class";
/** Enrolled participant (seeded). */
const ENROLLED_STUDENT = "E2E Student";
/** NOT enrolled — the one we invite several times. */
const INVITED_STUDENT = "E2E Student Two";

type ClassRef = { model: string; originalId: number; date: string };

const createdClasses: ClassRef[] = [];

type ClassInvitation = {
  id: number;
  playerId: string;
  playerName: string;
  status: string;
};

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function getToken(
  request: APIRequestContext,
  username: string,
  password: string
): Promise<string> {
  const res = await request.post(`${AUTH_BASE}/login`, {
    data: { username, password },
  });
  expect(res.ok(), `Login failed for ${username}: ${res.status()}`).toBeTruthy();
  const json = await res.json();
  return (json.accessToken ?? json.access_token) as string;
}

/** Next Monday as YYYY-MM-DD (same logic as the seed script). */
function nextMondayDate(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const daysUntilMonday = (8 - d.getDay()) % 7 || 7;
  d.setDate(d.getDate() + daysUntilMonday);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function coachPlayers(
  request: APIRequestContext,
  coachToken: string
): Promise<Array<{ playerId: number; levelId: number | null; name: string }>> {
  const res = await request.get(`${API_BASE}/coach_players`, {
    headers: { Authorization: `Bearer ${coachToken}` },
  });
  expect(res.ok(), `coach_players failed: ${res.status()}`).toBeTruthy();
  return res.json();
}

/** Create a single (non-recurring) class on next Monday with one participant. */
async function createDedupeClass(
  request: APIRequestContext,
  coachToken: string,
  enrolledPlayerId: number,
  levelId: number | null
): Promise<ClassRef> {
  const date = nextMondayDate();
  const res = await request.post(`${API_BASE}/add_class`, {
    headers: { Authorization: `Bearer ${coachToken}` },
    data: {
      name: DEDUPE_CLASS_TITLE,
      classType: "academy",
      maxPlayers: 4,
      levelId,
      date,
      startTime: "17:00",
      endTime: "18:00",
      playerIds: [enrolledPlayerId],
      isRecurring: false,
      notificationsEnabled: true,
    },
  });
  expect(
    res.ok(),
    `Failed to create dedupe test class: ${res.status()} ${await res.text()}`
  ).toBeTruthy();
  const created = await res.json();
  const ref: ClassRef = {
    model: created.model ?? "Lesson",
    originalId: created.originalId,
    date,
  };
  createdClasses.push(ref);
  return ref;
}

/** Send one manual invitation to the given player for the given class. */
async function sendManualInvite(
  request: APIRequestContext,
  coachToken: string,
  ref: ClassRef,
  playerId: number
): Promise<void> {
  const res = await request.post(`${API_BASE}/notify/manual`, {
    headers: { Authorization: `Bearer ${coachToken}` },
    data: {
      model: ref.model,
      originalId: ref.originalId,
      date: ref.date,
      playerIds: [playerId],
    },
  });
  expect(
    res.ok(),
    `Manual notify failed: ${res.status()} ${await res.text()}`
  ).toBeTruthy();
  const json = await res.json();
  expect(json.sent, "manual notify must actually create an invite").toBe(1);
}

/** Fetch the coach-facing class-detail payload. */
async function fetchClassDetail(
  request: APIRequestContext,
  coachToken: string,
  ref: ClassRef
): Promise<{ invitations?: ClassInvitation[] }> {
  const res = await request.post(
    `${API_BASE}/class_instance?model=${ref.model}&id=${ref.originalId}&date=${ref.date}`,
    { headers: { Authorization: `Bearer ${coachToken}` } }
  );
  expect(
    res.ok(),
    `class_instance failed: ${res.status()} ${await res.text()}`
  ).toBeTruthy();
  return res.json();
}

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------

async function openDedupeClassDetail(page: Page) {
  await openCalendar(page);
  const found = await findClassOnCalendar(page, DEDUPE_CLASS_TITLE);
  expect(found, "dedupe test class must be visible on the calendar").toBe(true);
  await page.getByText(DEDUPE_CLASS_TITLE).first().click();
  await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 5000 });
}

// ---------------------------------------------------------------------------
// Cleanup — remove the class this spec created so later specs see a clean
// calendar.
// ---------------------------------------------------------------------------

test.afterEach(async ({ request }) => {
  const coachToken = await getToken(request, "e2e-coach", "E2eCoach123!");
  while (createdClasses.length > 0) {
    const event = createdClasses.pop()!;
    await request
      .post(`${API_BASE}/remove_class`, {
        headers: { Authorization: `Bearer ${coachToken}` },
        data: { event, scope: "single" },
      })
      .catch(() => null);
  }
});

// ---------------------------------------------------------------------------
// PAD-72
// ---------------------------------------------------------------------------

test("PAD-72: a student invited three times appears once in the class guest list", async ({
  page,
  request,
}) => {
  const coachToken = await getToken(request, "e2e-coach", "E2eCoach123!");
  const players = await coachPlayers(request, coachToken);

  const enrolled = players.find((p) => p.name === ENROLLED_STUDENT);
  const invited = players.find((p) => p.name === INVITED_STUDENT);
  expect(enrolled, `seeded "${ENROLLED_STUDENT}" must exist`).toBeTruthy();
  expect(invited, `seeded "${INVITED_STUDENT}" must exist`).toBeTruthy();

  const ref = await createDedupeClass(
    request,
    coachToken,
    enrolled!.playerId,
    enrolled!.levelId
  );

  // Three separate invitations to the SAME student → three NotificationEvent
  // rows, exactly like the notification engine's multi-round matching produces.
  await sendManualInvite(request, coachToken, ref, invited!.playerId);
  await sendManualInvite(request, coachToken, ref, invited!.playerId);
  await sendManualInvite(request, coachToken, ref, invited!.playerId);

  // ── API level: the payload every surface consumes is already de-duplicated ──
  const detail = await fetchClassDetail(request, coachToken, ref);
  const invitations = detail.invitations ?? [];

  const playerIds = invitations.map((inv) => String(inv.playerId));
  expect(
    new Set(playerIds).size,
    `invitations must hold one entry per student, got ${JSON.stringify(invitations)}`
  ).toBe(playerIds.length);

  const forInvitedStudent = invitations.filter(
    (inv) => String(inv.playerId) === String(invited!.playerId)
  );
  expect(
    forInvitedStudent.length,
    "the thrice-invited student must appear exactly once"
  ).toBe(1);

  // ── UI level: the coach's guest list shows one row per student ─────────────
  await loginAsCoach(page);
  await openDedupeClassDetail(page);

  const dialog = page.locator('[role="dialog"]');

  // The collapsed header counts DISTINCT students.
  const invitedToggle = dialog.getByRole("button", { name: /invited \(\d+\)/i });
  await expect(invitedToggle).toBeVisible({ timeout: 5000 });
  await expect(invitedToggle).toHaveText(/invited \(1\)/i);

  await invitedToggle.click();

  await expect(dialog.getByText(INVITED_STUDENT, { exact: true })).toHaveCount(1);
});
