/**
 * E2E tests — Semi-Automatic Replacement Approval (notifications.semi-auto-approval)
 *
 * Spec: specs/notifications/spec.md — notifications.semi-auto-approval + the
 * `invitation_mode` addition in notifications.config.
 *
 * In semi-automatic mode (`invitation_mode: "semi_automatic"`), when the coach
 * marks a player absent while confirming presences, NO invitations are sent.
 * Instead the coach gets a replacement-approval prompt (inline bundled card +
 * a persisted message in the Assistant conversation) showing the declining
 * student(s) and the full ordered invite queue, with actions:
 *   "Yes, right now" / "Yes, at {window open time}" / "No"
 * ("Yes, right now" + "No" only, when the invitation window is already open).
 *
 * These tests are expected to FAIL until the feature is implemented (TDD):
 *   - US-NSA-01 fails because the "Invitation mode" control does not exist in
 *     Settings → Notifications.
 *   - US-NSA-02 fails because the backend config does not persist/return
 *     `invitationMode`.
 *
 * Run:
 *   npx playwright test e2e/notification-engine/semi-auto-approval.spec.ts
 */

import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import {
  loginAsCoach,
  STUDENT2_USERNAME,
  STUDENT2_PASSWORD,
} from "../helpers/auth";
import { openCalendar, openSettings, openMessages } from "../helpers/navigation";
import { API_APP, API_AUTH } from "../helpers/api";

// ---------------------------------------------------------------------------
// Constants / API helpers
// ---------------------------------------------------------------------------

const CLASS_TITLE = "E2E Academy Class";
// Each test uses its OWN class (created in setup): the spec mandates ONE
// prompt per vacancy (idempotent), so a test reusing a vacancy already
// decided earlier (by the other test here, or by reminder-flow specs running
// before this file in the full suite) could never see a fresh pending prompt.
const APPROVAL_CLASS_TITLE_A = "E2E Approval Class A";
const APPROVAL_CLASS_TITLE_B = "E2E Approval Class B";
const API_BASE = API_APP;
const AUTH_BASE = API_AUTH;

/** Classes created by these tests, removed again in afterEach. */
const createdClasses: Array<{ model: string; originalId: number; date: string }> = [];

// State hygiene for the rest of the suite: restore automatic mode (the seed
// default) and remove the classes these tests created, so later specs (e.g.
// schedule-calendar, attendance) don't run against semi-automatic mode or an
// unexpected extra class on the calendar.
test.afterEach(async ({ request }) => {
  const coachToken = await getToken(request, "e2e-coach", "E2eCoach123!");
  await setCoachConfig(request, coachToken, {
    autoNotifyEnabled: true,
    invitationMode: "automatic",
  });
  while (createdClasses.length > 0) {
    const event = createdClasses.pop()!;
    await request.post(`${API_BASE}/remove_class`, {
      headers: { Authorization: `Bearer ${coachToken}` },
      data: { event, scope: "single" },
    });
  }
});

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

/** Update the coach notification config via the API. */
async function setCoachConfig(
  request: APIRequestContext,
  coachToken: string,
  patch: Record<string, unknown>
): Promise<void> {
  const res = await request.post(`${API_BASE}/notify/config`, {
    headers: { Authorization: `Bearer ${coachToken}` },
    data: patch,
  });
  expect(
    res.ok(),
    `Failed to update notification config: ${res.status()} ${await res.text()}`
  ).toBeTruthy();
}

/**
 * Counts the `notification_invite` messages the given user currently has
 * across all of their conversations.
 */
async function countInviteMessages(
  request: APIRequestContext,
  token: string
): Promise<number> {
  const convsRes = await request.get(`${API_BASE}/conversations`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!convsRes.ok()) return 0;
  // GET /app/conversations returns { conversations: [...], hasMore } (paginated)
  const convsJson = await convsRes.json();
  const conversations: Array<{ id: number }> = Array.isArray(convsJson)
    ? convsJson
    : (convsJson.conversations ?? []);

  let count = 0;
  for (const conv of conversations) {
    const detailRes = await request.get(`${API_BASE}/conversation/${conv.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!detailRes.ok()) continue;
    const detail: { messages: Array<{ messageType: string }> } =
      await detailRes.json();
    count +=
      detail.messages?.filter((m) => m.messageType === "notification_invite")
        .length ?? 0;
  }
  return count;
}

/**
 * Poll until the user has MORE `notification_invite` messages than the given
 * baseline (or timeout). Count-based so invites sent by earlier specs in the
 * same suite run don't produce false positives.
 */
async function pollForNewInviteMessage(
  request: APIRequestContext,
  token: string,
  baseline: number,
  maxWaitMs: number
): Promise<boolean> {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    if ((await countInviteMessages(request, token)) > baseline) return true;
    await new Promise((r) => setTimeout(r, 2_000));
  }
  return false;
}

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------

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

/**
 * Create a dedicated single class on next Monday with E2E Student enrolled
 * (test-isolation setup — see the APPROVAL_CLASS_TITLE_A/B note). The class
 * is tracked in `createdClasses` and removed again in afterEach.
 */
async function createApprovalTestClass(
  request: APIRequestContext,
  coachToken: string,
  title: string,
  startTime: string,
  endTime: string
): Promise<void> {
  const playersRes = await request.get(`${API_BASE}/coach_players`, {
    headers: { Authorization: `Bearer ${coachToken}` },
  });
  expect(playersRes.ok()).toBeTruthy();
  const players: Array<{ playerId: number; levelId: number | null; name: string }> =
    await playersRes.json();
  const student = players.find((p) => p.name === "E2E Student");
  expect(student, "seeded E2E Student must exist").toBeTruthy();

  const date = nextMondayDate();
  const res = await request.post(`${API_BASE}/add_class`, {
    headers: { Authorization: `Bearer ${coachToken}` },
    data: {
      name: title,
      classType: "academy",
      maxPlayers: 4,
      levelId: student!.levelId,
      date,
      startTime,
      endTime,
      playerIds: [student!.playerId],
      isRecurring: false,
      notificationsEnabled: true,
    },
  });
  expect(
    res.ok(),
    `Failed to create approval test class: ${res.status()} ${await res.text()}`
  ).toBeTruthy();
  const created = await res.json();
  createdClasses.push({
    model: created.model ?? "Lesson",
    originalId: created.originalId,
    date,
  });
}

/** Navigate the calendar until the given class is visible, then click it. */
async function openClassDetail(page: Page, title: string = CLASS_TITLE) {
  await openCalendar(page);
  for (let i = 0; i < 5; i++) {
    const visible = await page
      .getByText(title)
      .isVisible()
      .catch(() => false);
    if (visible) break;
    await page.getByRole("button", { name: /next week/i }).first().click();
    await page.waitForTimeout(400);
  }
  await page.getByText(title).first().click();
  await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 5000 });
}

/**
 * In the open ClassDetailSheet, enter attendance mode, mark the (single
 * seeded) participant E2E Student absent (unjustified), and confirm presences.
 */
async function markSeededStudentAbsentAndConfirm(page: Page) {
  const dialog = page.locator('[role="dialog"]');

  await dialog
    .getByRole("button", { name: /mark attendance|edit attendance/i })
    .first()
    .click();

  // The seeded class has exactly one participant (E2E Student)
  await expect(
    dialog.getByText("E2E Student", { exact: true })
  ).toBeVisible({ timeout: 5000 });
  await dialog.getByRole("button", { name: /^absent$/i }).first().click();
  await dialog.getByRole("button", { name: /^unjustified$/i }).first().click();

  await dialog.getByRole("button", { name: /^confirm$/i }).first().click();
  await page.waitForTimeout(1000);
}

/** Enable the auto-invite engine master toggle in the open Notifications tab. */
async function enableAutoInviteEngine(page: Page) {
  const masterToggle = page.locator('[role="switch"]').first();
  await expect(masterToggle).toBeVisible({ timeout: 5000 });
  if ((await masterToggle.getAttribute("data-state")) === "unchecked") {
    await Promise.all([
      page
        .waitForResponse(
          (resp) =>
            resp.url().includes("/notify/config") &&
            resp.request().method() === "POST",
          { timeout: 8000 }
        )
        .catch(() => null),
      masterToggle.click(),
    ]);
    await page.waitForTimeout(500);
  }
}

// ---------------------------------------------------------------------------
// US-NSA-01: presence-confirmation path → approval card → "Yes, right now"
// ---------------------------------------------------------------------------

test("US-NSA-01: semi-automatic mode holds invitations behind an approval card and 'Yes, right now' sends them", async ({
  page,
  request,
}) => {
  // ── Step 1: Coach enables the engine + semi-automatic mode in Settings ────
  // Earlier specs in the suite may have left the engine off — ensure it is on
  // via API so the Invitation mode control renders (the radio interaction
  // below is the behavior under test).
  const coachToken = await getToken(request, "e2e-coach", "E2eCoach123!");
  await setCoachConfig(request, coachToken, { autoNotifyEnabled: true });

  await loginAsCoach(page);
  await openSettings(page);
  // PAD-112 added a second sidebar button whose label also matches
  // /notifications/i ("My notifications"), so the old role+name locator is
  // ambiguous for a coach. Target the stable testid instead.
  await page.getByTestId("settings-nav-notifications").click();
  await expect(page.getByText(/auto-invite engine/i)).toBeVisible({
    timeout: 5000,
  });

  await enableAutoInviteEngine(page);

  // The new invitation-mode control (this is the missing feature today)
  await expect(
    page.getByText(/invitation mode/i).first(),
    "Settings → Notifications must expose an 'Invitation mode' control (automatic | semi-automatic)"
  ).toBeVisible({ timeout: 5000 });

  await Promise.all([
    page
      .waitForResponse(
        (resp) =>
          resp.url().includes("/notify/config") &&
          resp.request().method() === "POST",
        { timeout: 8000 }
      )
      .catch(() => null),
    page
      .getByRole("radio", { name: /semi.automatic/i })
      .or(page.getByRole("button", { name: /semi.automatic/i }))
      .or(page.getByRole("option", { name: /semi.automatic/i }))
      .or(page.getByLabel(/semi.automatic/i))
      .first()
      .click(),
  ]);

  // Confirm the backend persisted the mode
  const configRes = await request.get(`${API_BASE}/notify/config`, {
    headers: { Authorization: `Bearer ${coachToken}` },
  });
  expect(configRes.ok()).toBeTruthy();
  const savedConfig = await configRes.json();
  expect(savedConfig.autoNotifyEnabled, "autoNotifyEnabled must be true").toBe(true);
  expect(
    savedConfig.invitationMode,
    "config must persist invitationMode = semi_automatic"
  ).toBe("semi_automatic");

  // ── Step 2: Coach marks E2E Student absent via presence confirmation ──────
  // Dedicated class (see APPROVAL_CLASS_TITLE_A/B note) + invite-count
  // baseline, so vacancies/invites from earlier specs can't interfere.
  await createApprovalTestClass(
    request, coachToken, APPROVAL_CLASS_TITLE_A, "12:00", "13:00"
  );
  const student2Token = await getToken(request, STUDENT2_USERNAME, STUDENT2_PASSWORD);
  const inviteBaseline = await countInviteMessages(request, student2Token);

  await openClassDetail(page, APPROVAL_CLASS_TITLE_A);
  await markSeededStudentAbsentAndConfirm(page);

  // ── Step 3: Inline bundled approval card appears, NO invitations sent ─────
  // The card must show the declining student and the ordered invite queue
  // (E2E Student Two is the first eligible candidate in the seed data).
  await expect(
    page.getByText("E2E Student", { exact: true }).first(),
    "approval card must show the declining student"
  ).toBeVisible({ timeout: 10_000 });
  await expect(
    page.getByText("E2E Student Two").first(),
    "approval card must show the full ordered invite queue"
  ).toBeVisible({ timeout: 5000 });

  const approveNowBtn = page.getByRole("button", { name: /yes, right now/i });
  await expect(
    approveNowBtn.first(),
    "approval card must offer a 'Yes, right now' action"
  ).toBeVisible({ timeout: 5000 });
  await expect(
    page.getByRole("button", { name: /^no$/i }).first(),
    "approval card must offer a 'No' action"
  ).toBeVisible();

  // No invitation may have been sent yet (no NEW invites beyond the baseline)
  expect(
    await countInviteMessages(request, student2Token),
    "no invitation may be sent before the coach approves"
  ).toBe(inviteBaseline);

  // ── Step 4: Coach approves immediately ────────────────────────────────────
  await approveNowBtn.first().click();

  // ── Step 5: e2e-student-2 receives the invitation ─────────────────────────
  const invited = await pollForNewInviteMessage(
    request, student2Token, inviteBaseline, 30_000
  );
  expect(
    invited,
    "e2e-student-2 must receive a notification_invite message after 'Yes, right now'"
  ).toBe(true);

  // UI proof: student 2 logs in and sees the invitation in Messages
  await page.goto("/auth");
  // Language-agnostic selectors: pre-auth login page renders in the default locale (pt).
  await page.locator("#username").fill(STUDENT2_USERNAME);
  await page.locator("#password").fill(STUDENT2_PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.startsWith("/auth"), {
    timeout: 10_000,
  });
  await openMessages(page);
  await expect(page.getByText(/e2e coach/i).first()).toBeVisible({
    timeout: 10_000,
  });
  await page.getByText(/e2e coach/i).first().click();
  await expect(
    page.getByRole("button", { name: /^yes$/i }).first(),
    "invitation message must offer the usual Yes action to the student"
  ).toBeVisible({ timeout: 10_000 });
});

// ---------------------------------------------------------------------------
// US-NSA-02: "No" dismisses without sending; prompt persisted in Assistant
// conversation
// ---------------------------------------------------------------------------

test("US-NSA-02: 'No' dismisses the approval prompt, sends no invitations, and the prompt is recorded in the Assistant conversation", async ({
  page,
  request,
}) => {
  // ── Step 1: enable engine + semi-automatic mode via API ───────────────────
  const coachToken = await getToken(request, "e2e-coach", "E2eCoach123!");
  await setCoachConfig(request, coachToken, {
    autoNotifyEnabled: true,
    invitationMode: "semi_automatic",
  });

  const configRes = await request.get(`${API_BASE}/notify/config`, {
    headers: { Authorization: `Bearer ${coachToken}` },
  });
  expect(configRes.ok()).toBeTruthy();
  const savedConfig = await configRes.json();
  expect(
    savedConfig.invitationMode,
    "config must persist invitationMode = semi_automatic"
  ).toBe("semi_automatic");

  // ── Step 2: coach marks the student absent via presence confirmation ──────
  // Use a dedicated class: the US-NSA-01 vacancy was already decided, and the
  // spec's "one prompt per vacancy" idempotency means it can never re-prompt.
  await createApprovalTestClass(
    request, coachToken, APPROVAL_CLASS_TITLE_B, "13:00", "14:00"
  );

  // Baseline invite count (US-NSA-01 legitimately sent one earlier in this
  // run) — "no invitations sent" below means NO NEW invites beyond this.
  const student2Token = await getToken(request, STUDENT2_USERNAME, STUDENT2_PASSWORD);
  const inviteBaseline = await countInviteMessages(request, student2Token);

  await loginAsCoach(page);
  await openClassDetail(page, APPROVAL_CLASS_TITLE_B);
  await markSeededStudentAbsentAndConfirm(page);

  // ── Step 3: approval card appears, coach dismisses with "No" ──────────────
  const noBtn = page.getByRole("button", { name: /^no$/i });
  await expect(
    noBtn.first(),
    "approval card must offer a 'No' action"
  ).toBeVisible({ timeout: 10_000 });
  await noBtn.first().click();
  await page.waitForTimeout(1000);

  // Card actions are gone after dismissal (terminal decision)
  await expect(
    page.getByRole("button", { name: /yes, right now/i })
  ).not.toBeVisible();

  // ── Step 4: no invitations were sent ──────────────────────────────────────
  // Allow a short grace period to catch any erroneous async send
  await page.waitForTimeout(5000);
  expect(
    await countInviteMessages(request, student2Token),
    "dismissing the prompt must not send any invitations"
  ).toBe(inviteBaseline);

  // ── Step 5: the prompt is persisted in the coach's Assistant conversation ─
  await openMessages(page);
  const assistantConv = page.getByText(/assistant/i).first();
  await expect(
    assistantConv,
    "coach must have an Assistant conversation containing the replacement prompt"
  ).toBeVisible({ timeout: 10_000 });
  await assistantConv.click();
  await expect(
    page.getByText("E2E Student", { exact: true }).first(),
    "the persisted prompt must reference the declining student"
  ).toBeVisible({ timeout: 5000 });
  await expect(
    page.getByText("E2E Student Two").first(),
    "the persisted prompt must include the ordered invite queue"
  ).toBeVisible();
});
