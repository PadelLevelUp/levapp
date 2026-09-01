/**
 * E2E tests for PAD-35 — Allow students to cancel attendance after confirming.
 *
 * Spec: attendance.confirm
 *   - After confirming (`respond_reminder` yes), a student can cancel their
 *     attendance any time BEFORE the class start time via
 *     `POST /api/app/notify/cancel_attendance` with `{lessonInstanceId}`.
 *   - Cancelling reverts the presence to "not attending" (status=absent,
 *     justification=justified) and frees the spot using the exact same path as a
 *     reminder decline (`no`) — reusing the vacancy / invitation-engine logic.
 *   - Cancellation is rejected (409) once the class has already started.
 *
 * These are API-driven because reminders are fired by APScheduler and cannot be
 * awaited in E2E. The seeded student (e2e-student) is enrolled in the future
 * "E2E Academy Class" (instance 1) and has an invited-but-unconfirmed Presence.
 */

import { test, expect, type APIRequestContext } from "@playwright/test";
import { API_BASE, AUTH_BASE } from "../helpers/api";

const INSTANCE_ID = 1;

async function token(request: APIRequestContext, username: string, password: string): Promise<string> {
  const res = await request.post(`${AUTH_BASE}/login`, { data: { username, password } });
  const json = await res.json();
  return (json.accessToken ?? json.access_token) as string;
}

const studentToken = (request: APIRequestContext) =>
  token(request, "e2e-student", "E2eStudent123!");

// ---------------------------------------------------------------------------
// US-CANCEL-01: Student cancels attendance after confirming (before class start)
// ---------------------------------------------------------------------------

test("US-CANCEL-01: student can cancel attendance after confirming, before class start", async ({ request }) => {
  const t = await studentToken(request);
  const headers = { Authorization: `Bearer ${t}` };

  // Confirm attendance first (yes on the reminder).
  const confirmRes = await request.post(`${API_BASE}/notify/respond_reminder`, {
    headers,
    data: { lessonInstanceId: INSTANCE_ID, action: "yes" },
  });
  expect(confirmRes.ok(), "confirm should succeed").toBe(true);
  const confirmJson = await confirmRes.json();
  expect(confirmJson.action).toBe("confirmed");

  // Now cancel the confirmed attendance — the class is in the future.
  const cancelRes = await request.post(`${API_BASE}/notify/cancel_attendance`, {
    headers,
    data: { lessonInstanceId: INSTANCE_ID },
  });
  expect(cancelRes.ok(), "cancel_attendance should succeed before class start").toBe(true);
  const cancelJson = await cancelRes.json();
  // Reuses the decline path, so the resulting action mirrors a reminder decline.
  expect(cancelJson.action).toBe("declined");
});

// ---------------------------------------------------------------------------
// US-CANCEL-02: Cancelling frees the spot (presence reverted to not attending)
// ---------------------------------------------------------------------------

test("US-CANCEL-02: cancelling reverts presence to not-attending and frees the spot", async ({ request }) => {
  const studentT = await studentToken(request);
  const coachT = await token(request, "e2e-coach", "E2eCoach123!");

  // Student confirms then cancels.
  await request.post(`${API_BASE}/notify/respond_reminder`, {
    headers: { Authorization: `Bearer ${studentT}` },
    data: { lessonInstanceId: INSTANCE_ID, action: "yes" },
  });
  const cancelRes = await request.post(`${API_BASE}/notify/cancel_attendance`, {
    headers: { Authorization: `Bearer ${studentT}` },
    data: { lessonInstanceId: INSTANCE_ID },
  });
  expect(cancelRes.ok()).toBe(true);

  // Find the student's player id (coach's view of players).
  const playersRes = await request.get(`${API_BASE}/players`, {
    headers: { Authorization: `Bearer ${coachT}` },
  });
  const players = await playersRes.json();
  const student = players.find(
    (p: any) => p.email === "e2e-student@test.com" || p.name === "E2E Student",
  );
  expect(student, "seeded student should exist").toBeDefined();

  // Coach view of the instance presences should show the student as no longer
  // confirmed and marked absent/justified — the spot is freed, exactly like a
  // reminder decline.
  const presRes = await request.get(`${API_BASE}/lesson_instance/${INSTANCE_ID}/presences`, {
    headers: { Authorization: `Bearer ${coachT}` },
  });
  expect(presRes.ok(), "presences endpoint should respond").toBe(true);
  const presences = await presRes.json();
  const studentPresence = presences.find((p: any) => p.playerId === student.id);
  expect(studentPresence).toBeDefined();
  // Reverted to "not attending" exactly like a reminder decline: the coach sees
  // the student marked absent + justified (the same signal a decline produces),
  // which is what frees the spot for the invitation engine.
  expect(studentPresence.status).toBe("absent");
  expect(studentPresence.justification).toBe("justified");
});

// ---------------------------------------------------------------------------
// US-CANCEL-03: Cancelling is idempotent-safe (re-cancel does not error)
//
// The after-class-start 409 guard cannot be exercised in E2E (the seeded class
// is always in the future) — it is covered authoritatively by the backend unit
// test `TestCancelAttendance::test_cancel_after_start_rejected_409`. Here we
// verify the endpoint stays healthy when the student cancels an already-freed
// spot before class start.
// ---------------------------------------------------------------------------

test("US-CANCEL-03: cancelling an already-cancelled attendance does not error", async ({ request }) => {
  const t = await studentToken(request);
  const headers = { Authorization: `Bearer ${t}` };

  await request.post(`${API_BASE}/notify/respond_reminder`, {
    headers,
    data: { lessonInstanceId: INSTANCE_ID, action: "yes" },
  });
  const first = await request.post(`${API_BASE}/notify/cancel_attendance`, {
    headers,
    data: { lessonInstanceId: INSTANCE_ID },
  });
  expect(first.ok()).toBe(true);

  const second = await request.post(`${API_BASE}/notify/cancel_attendance`, {
    headers,
    data: { lessonInstanceId: INSTANCE_ID },
  });
  expect(second.ok(), "re-cancel before start should still succeed").toBe(true);
});
