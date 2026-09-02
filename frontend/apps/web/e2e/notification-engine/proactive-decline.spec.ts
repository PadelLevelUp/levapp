/**
 * E2E for PAD-73 — Students proactively decline a future class.
 *
 * Spec: attendance.confirm rules 10–16
 *   10. The proactive-decline window closes at the instant the attendance
 *       reminder for that instance would fire — derived from the coach's
 *       `reminder_timing.firstReminder` with the SAME helper the scheduler uses
 *       to arm the reminder job. Never a hardcoded interval.
 *   11. Same endpoint (`POST /api/app/notify/cancel_attendance`); the SERVER
 *       classifies and answers `{action, proactive}`.
 *   12. A proactive decline is never a late cancellation.
 *   13. Auto-justified absence + vacancy opened immediately + invitation timing
 *       unchanged + coach notified.
 *   14. Authorized on ENROLMENT — a non-enrolled student gets 403.
 *   16. The affordance lives on the student's own row in the participants
 *       section, gated on `canDeclineProactively` from the class payload.
 *
 * Timing determinism: the seeded "E2E Academy Class" is "next Monday", i.e.
 * 1–7 days out depending on the day the suite runs, so the DEFAULT 48h reminder
 * would make these assertions flip with the calendar. Every test therefore pins
 * the coach's `reminderTiming.firstReminder` explicitly and restores the
 * original config afterwards — the seed DB is shared with every other spec.
 */

import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { loginAsStudent } from "../helpers/auth";
import { openCalendar } from "../helpers/navigation";
import { findClassOnCalendar } from "../helpers/calendar-navigation";
import { API_APP, API_AUTH } from "../helpers/api";

const CLASS_TITLE = "E2E Academy Class";
const API_BASE = API_APP;
const AUTH_BASE = API_AUTH;
const INSTANCE_ID = 1;
/** The seeded "E2E Declined Count Class" — filler players only, never e2e-student. */
const FOREIGN_INSTANCE_ID = 2;

/**
 * A window wide enough to always contain the seeded class ("next Monday",
 * 1–7 days out), computed rather than hardcoded so it never goes stale.
 */
const CAL_FROM = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10) + "T00:00:00";
const CAL_TO = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10) + "T23:59:59";

async function token(
  request: APIRequestContext,
  username: string,
  password: string,
): Promise<string> {
  const res = await request.post(`${AUTH_BASE}/login`, { data: { username, password } });
  const json = await res.json();
  return (json.accessToken ?? json.access_token) as string;
}

const studentToken = (request: APIRequestContext) =>
  token(request, "e2e-student", "E2eStudent123!");
const student2Token = (request: APIRequestContext) =>
  token(request, "e2e-student-2", "E2eStudent2123!");
const coachToken = (request: APIRequestContext) =>
  token(request, "e2e-coach", "E2eCoach123!");

async function getConfig(request: APIRequestContext, coachT: string) {
  const res = await request.get(`${API_BASE}/notify/config`, {
    headers: { Authorization: `Bearer ${coachT}` },
  });
  expect(res.ok(), "config GET should succeed").toBe(true);
  return res.json();
}

/**
 * Pin the coach's first-reminder timing so the proactive window is
 * deterministically OPEN or CLOSED regardless of when the suite runs.
 *
 * `hoursBefore: 1`     → reminder instant is 1h before start, still in the
 *                        future for the seeded class → window OPEN.
 * `hoursBefore: 10000` → reminder instant is ~14 months in the past → CLOSED.
 *
 * Returns the previous `reminderTiming` so the caller can restore it.
 */
async function setReminderHoursBefore(
  request: APIRequestContext,
  coachT: string,
  hoursBefore: number,
): Promise<unknown> {
  const cfg = await getConfig(request, coachT);
  const previous = cfg.reminderTiming ?? null;
  const next = {
    ...(previous && typeof previous === "object" ? previous : {}),
    firstReminder: { type: "hours_before", value: hoursBefore },
  };
  const res = await request.post(`${API_BASE}/notify/config`, {
    headers: { Authorization: `Bearer ${coachT}` },
    data: { reminderTiming: next },
  });
  expect(res.ok(), "config POST should succeed").toBe(true);
  return previous;
}

async function restoreReminderTiming(
  request: APIRequestContext,
  coachT: string,
  previous: unknown,
) {
  await request.post(`${API_BASE}/notify/config`, {
    headers: { Authorization: `Bearer ${coachT}` },
    data: { reminderTiming: previous },
  });
}

/** Re-enrol e2e-student on the seeded class and reset their presence to pending. */
async function resetStudentPresence(request: APIRequestContext, coachT: string) {
  const res = await request.post(`${API_BASE}/notify/debug/reset_presence`, {
    headers: { Authorization: `Bearer ${coachT}` },
    data: { lessonInstanceId: INSTANCE_ID, username: "e2e-student" },
  });
  expect(res.ok(), "debug reset_presence should succeed").toBe(true);
}

async function presenceForStudent(request: APIRequestContext, coachT: string) {
  const playersRes = await request.get(`${API_BASE}/players`, {
    headers: { Authorization: `Bearer ${coachT}` },
  });
  const players = await playersRes.json();
  const student = players.find(
    (p: any) => p.email === "e2e-student@test.com" || p.name === "E2E Student",
  );
  expect(student, "seeded student should exist").toBeDefined();

  const presRes = await request.get(`${API_BASE}/lesson_instance/${INSTANCE_ID}/presences`, {
    headers: { Authorization: `Bearer ${coachT}` },
  });
  expect(presRes.ok()).toBe(true);
  const presences = await presRes.json();
  return presences.find((p: any) => p.playerId === student.id);
}

/** The student's own view of the class-instance payload. */
async function studentClassPayload(request: APIRequestContext, studentT: string) {
  const res = await request.post(
    `${API_BASE}/class_instance?model=LessonInstance&id=${INSTANCE_ID}`,
    { headers: { Authorization: `Bearer ${studentT}` }, data: {} },
  );
  expect(res.ok(), "class_instance should load for the student").toBe(true);
  return res.json();
}

// ---------------------------------------------------------------------------
// US-73-01: Proactive decline before the reminder instant
// ---------------------------------------------------------------------------

test("US-73-01: declining before the reminder instant is classified proactive and auto-justified", async ({
  request,
}) => {
  const coachT = await coachToken(request);
  const studentT = await studentToken(request);
  const previous = await setReminderHoursBefore(request, coachT, 1);

  try {
    await resetStudentPresence(request, coachT);

    const res = await request.post(`${API_BASE}/notify/cancel_attendance`, {
      headers: { Authorization: `Bearer ${studentT}` },
      data: { lessonInstanceId: INSTANCE_ID },
    });
    expect(res.ok(), "proactive decline should succeed").toBe(true);
    const json = await res.json();

    // Rule 11 — the server classifies, and says so.
    expect(json.action).toBe("declined");
    expect(json.proactive).toBe(true);

    // Rule 13 — auto-justified absence, the exact state a reminder decline writes.
    // Rule 12 — proactive is never late.
    const presence = await presenceForStudent(request, coachT);
    expect(presence).toBeDefined();
    expect(presence.status).toBe("absent");
    expect(presence.justification).toBe("justified");
    expect(presence.lateCancellation).toBe(false);
  } finally {
    await restoreReminderTiming(request, coachT, previous);
    await resetStudentPresence(request, coachT);
  }
});

// ---------------------------------------------------------------------------
// US-73-02: The window closes at the reminder instant, not a fixed interval
// ---------------------------------------------------------------------------

test("US-73-02: the same class is non-proactive once the reminder instant has passed", async ({
  request,
}) => {
  const coachT = await coachToken(request);
  const studentT = await studentToken(request);
  // 10000h before start is comfortably in the past for a class next week, so the
  // reminder "would already have fired" and the window is closed.
  const previous = await setReminderHoursBefore(request, coachT, 10000);

  try {
    await resetStudentPresence(request, coachT);

    const res = await request.post(`${API_BASE}/notify/cancel_attendance`, {
      headers: { Authorization: `Bearer ${studentT}` },
      data: { lessonInstanceId: INSTANCE_ID },
    });
    // Still allowed — it is just no longer a PROACTIVE decline.
    expect(res.ok(), "cancelling after the window should still succeed").toBe(true);
    const json = await res.json();
    expect(json.action).toBe("declined");
    expect(json.proactive).toBe(false);
  } finally {
    await restoreReminderTiming(request, coachT, previous);
    await resetStudentPresence(request, coachT);
  }
});

// ---------------------------------------------------------------------------
// US-73-03: The class payload exposes the derived window
// ---------------------------------------------------------------------------

test("US-73-03: class payload exposes proactiveDeclineDeadline and canDeclineProactively", async ({
  request,
}) => {
  const coachT = await coachToken(request);
  const studentT = await studentToken(request);
  const previous = await setReminderHoursBefore(request, coachT, 1);

  try {
    await resetStudentPresence(request, coachT);

    const open = await studentClassPayload(request, studentT);
    expect(open.proactiveDeclineDeadline, "deadline should be an ISO instant").toBeTruthy();
    expect(open.canDeclineProactively).toBe(true);

    // The deadline must track the coach's reminder config, not a constant: at
    // 1h before start it is later than at 5h before start.
    const deadlineAt1h = new Date(open.proactiveDeclineDeadline as string).getTime();
    await setReminderHoursBefore(request, coachT, 5);
    const shifted = await studentClassPayload(request, studentT);
    const deadlineAt5h = new Date(shifted.proactiveDeclineDeadline as string).getTime();
    expect(deadlineAt5h).toBeLessThan(deadlineAt1h);
    expect(deadlineAt1h - deadlineAt5h).toBe(4 * 60 * 60 * 1000);

    // Push the reminder instant into the past → the window is reported closed.
    await setReminderHoursBefore(request, coachT, 10000);
    const closed = await studentClassPayload(request, studentT);
    expect(closed.canDeclineProactively).toBe(false);
  } finally {
    await restoreReminderTiming(request, coachT, previous);
    await resetStudentPresence(request, coachT);
  }
});

// ---------------------------------------------------------------------------
// US-73-04: Vacancy opens immediately, invitations still wait for their window
// ---------------------------------------------------------------------------

test("US-73-04: a proactive decline frees the spot immediately without inviting anyone yet", async ({
  request,
}) => {
  const coachT = await coachToken(request);
  const studentT = await studentToken(request);
  const previous = await setReminderHoursBefore(request, coachT, 1);

  // The invitation engine must actually be ARMED for the "no invites yet"
  // assertion to mean anything: with auto-notify off, `trigger_invitations`
  // returns before it ever consults the invitation-start window, so the test
  // would pass even if the engine fanned out instantly.
  const cfgBefore = await getConfig(request, coachT);
  const autoBefore = cfgBefore.autoNotifyEnabled ?? false;
  await request.post(`${API_BASE}/notify/config`, {
    headers: { Authorization: `Bearer ${coachT}` },
    data: { autoNotifyEnabled: true },
  });

  try {
    await resetStudentPresence(request, coachT);

    const weekOf = async (t: string) => {
      const res = await request.get(`${API_BASE}/calendar?from=${CAL_FROM}&to=${CAL_TO}`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      expect(res.ok(), "calendar should load").toBe(true);
      const events = await res.json();
      return events.find(
        (e: any) => e.title === CLASS_TITLE || e.name === CLASS_TITLE,
      );
    };

    const eventBefore = await weekOf(coachT);
    expect(eventBefore, "seeded class must be on the coach's calendar").toBeDefined();
    const filledBefore = eventBefore.participantCount ?? 0;
    expect(filledBefore, "the student occupies a spot before declining").toBeGreaterThan(0);

    const before = await request.post(
      `${API_BASE}/class_instance?model=LessonInstance&id=${INSTANCE_ID}`,
      { headers: { Authorization: `Bearer ${coachT}` }, data: {} },
    );
    const beforeJson = await before.json();
    const invitesBefore = (beforeJson.invitations ?? []).length;

    const declineRes = await request.post(`${API_BASE}/notify/cancel_attendance`, {
      headers: { Authorization: `Bearer ${studentT}` },
      data: { lessonInstanceId: INSTANCE_ID },
    });
    expect(declineRes.ok()).toBe(true);
    expect((await declineRes.json()).proactive).toBe(true);

    const presence = await presenceForStudent(request, coachT);
    expect(presence.status).toBe("absent");

    // "A vaga é aberta imediatamente": the freed spot is visible through the very
    // API the calendar renders from, on the next read — no batch tick in between.
    const eventAfter = await weekOf(coachT);
    expect(eventAfter.participantCount).toBe(filledBefore - 1);

    // ...but invitation TIMING is unchanged. The invitation-start window (24h
    // before start by default) has not been reached for a class ~a week out, so
    // nobody has been invited yet even though the vacancy is already open and
    // auto-notify is on.
    const after = await request.post(
      `${API_BASE}/class_instance?model=LessonInstance&id=${INSTANCE_ID}`,
      { headers: { Authorization: `Bearer ${coachT}` }, data: {} },
    );
    const afterJson = await after.json();
    expect((afterJson.invitations ?? []).length).toBe(invitesBefore);

    // Even an explicit engine tick must not jump the gun.
    await request.post(`${API_BASE}/notify/process_rounds`, {
      headers: { Authorization: `Bearer ${coachT}` },
      data: {},
    });
    const afterTick = await request.post(
      `${API_BASE}/class_instance?model=LessonInstance&id=${INSTANCE_ID}`,
      { headers: { Authorization: `Bearer ${coachT}` }, data: {} },
    );
    expect(((await afterTick.json()).invitations ?? []).length).toBe(invitesBefore);
  } finally {
    await request.post(`${API_BASE}/notify/config`, {
      headers: { Authorization: `Bearer ${coachT}` },
      data: { autoNotifyEnabled: autoBefore },
    });
    await restoreReminderTiming(request, coachT, previous);
    await resetStudentPresence(request, coachT);
  }
});

// ---------------------------------------------------------------------------
// US-73-05: Authorization — enrolment, not just "is a student" (PAD-88/PAD-115)
// ---------------------------------------------------------------------------

test("US-73-05: a student not enrolled in the class cannot decline it", async ({ request }) => {
  const foreignT = await student2Token(request);

  // e2e-student-2 is NOT enrolled in the seeded academy class.
  const res = await request.post(`${API_BASE}/notify/cancel_attendance`, {
    headers: { Authorization: `Bearer ${foreignT}` },
    data: { lessonInstanceId: INSTANCE_ID },
  });
  expect(res.status(), "declining someone else's class must be forbidden").toBe(403);

  // ...and neither can e2e-student decline a class they are not part of.
  const studentT2 = await studentToken(request);
  const res2 = await request.post(`${API_BASE}/notify/cancel_attendance`, {
    headers: { Authorization: `Bearer ${studentT2}` },
    data: { lessonInstanceId: FOREIGN_INSTANCE_ID },
  });
  expect(res2.status()).toBe(403);
});

// ---------------------------------------------------------------------------
// US-73-06: The affordance lives in the participants section (UI)
// ---------------------------------------------------------------------------

test("US-73-06: student proactively declines from the participants section and it survives a reload", async ({
  page,
  request,
}) => {
  const coachT = await coachToken(request);
  const previous = await setReminderHoursBefore(request, coachT, 1);

  try {
    await resetStudentPresence(request, coachT);

    await loginAsStudent(page);
    await openCalendar(page);
    const found = await findClassOnCalendar(page, CLASS_TITLE);
    expect(found, "seeded class must be visible on the student's calendar").toBe(true);
    await page.getByText(CLASS_TITLE).first().click();
    await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 5000 });

    // The proactive action sits on the student's own participant row.
    const declineBtn = page.getByRole("button", { name: /can'?t attend|não vou poder ir/i }).first();
    await expect(declineBtn).toBeVisible({ timeout: 5000 });

    await declineBtn.click();
    const confirmDialog = page.locator('[role="alertdialog"]');
    await expect(confirmDialog).toBeVisible({ timeout: 5000 });
    await Promise.all([
      page.waitForResponse(
        (r) =>
          /\/api\/app\/notify\/cancel_attendance(\?|$)/.test(r.url()) && r.status() === 200,
        { timeout: 10_000 },
      ),
      confirmDialog.getByRole("button", { name: /can'?t attend|não vou poder ir/i }).click(),
    ]);

    // Rule 16 — the declined state is derived from the serialized presence, so
    // it is still there after a full reload.
    await page.reload();
    await openCalendar(page);
    await findClassOnCalendar(page, CLASS_TITLE);
    await page.getByText(CLASS_TITLE).first().click();
    await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 5000 });
    await expect(
      page.getByText(/not attending|não vais|não vou comparecer/i).first(),
    ).toBeVisible({ timeout: 5000 });
  } finally {
    await restoreReminderTiming(request, coachT, previous);
    await resetStudentPresence(request, coachT);
  }
});
