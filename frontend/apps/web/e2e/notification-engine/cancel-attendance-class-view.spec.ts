/**
 * E2E for PAD-46 — Student cancels attendance from the calendar class-detail view.
 *
 * Spec: attendance.confirm rule 9 —
 *   A student can cancel attendance directly from an enrolled class in the
 *   calendar class-detail view (not only from a chat reminder). The action calls
 *   `POST /api/app/notify/cancel_attendance` and frees the spot, matching the
 *   reminder-bubble cancel behavior.
 *
 * Scope note: the seeded "E2E Academy Class" (instance 1) is always in the FUTURE
 * and far from the 24h deadline, so this UI-driven test only covers the NORMAL
 * (pre-deadline) cancel. The past-deadline "late cancellation" UX is covered at
 * the backend/unit level (PAD-43) and is not forced here.
 */

import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { loginAsStudent } from "../helpers/auth";
import { openCalendar } from "../helpers/navigation";
import { findClassOnCalendar } from "../helpers/calendar-navigation";

const CLASS_TITLE = "E2E Academy Class";
const API_BASE = "http://localhost:5001/api/app";
const AUTH_BASE = "http://localhost:5001/api/auth";
const INSTANCE_ID = 1;

async function token(request: APIRequestContext, username: string, password: string): Promise<string> {
  const res = await request.post(`${AUTH_BASE}/login`, { data: { username, password } });
  const json = await res.json();
  return (json.accessToken ?? json.access_token) as string;
}

/** Navigate the student's calendar to the seeded class and open its detail sheet. */
async function openClassDetail(page: Page) {
  await openCalendar(page);
  const found = await findClassOnCalendar(page, CLASS_TITLE);
  expect(found, "seeded class must be visible on the student's calendar").toBe(true);
  await page.getByText(CLASS_TITLE).first().click();
  await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 5000 });
}

// ---------------------------------------------------------------------------
// US-46-01: Student cancels attendance from the class-detail view; spot freed
// ---------------------------------------------------------------------------

test("US-46-01: student cancels attendance from the class view and the spot is freed", async ({
  page,
  request,
}) => {
  // Precondition: the student has a CONFIRMED presence on the class. Confirm via
  // the reminder API (same setup as cancel-attendance.spec.ts) so the class-view
  // cancel action is offered.
  const studentT = await token(request, "e2e-student", "E2eStudent123!");
  const confirmRes = await request.post(`${API_BASE}/notify/respond_reminder`, {
    headers: { Authorization: `Bearer ${studentT}` },
    data: { lessonInstanceId: INSTANCE_ID, action: "yes" },
  });
  expect(confirmRes.ok(), "confirm should succeed").toBe(true);

  // Student opens the enrolled class in the calendar class-detail view.
  await loginAsStudent(page);
  await openClassDetail(page);

  // A "Cancel attendance" action is visible for the enrolled student.
  const cancelBtn = page.getByRole("button", { name: /cancel attendance/i }).first();
  await expect(cancelBtn).toBeVisible({ timeout: 5000 });

  // Cancelling before the deadline: confirm and wait for the API call to settle.
  await cancelBtn.click();
  // A confirmation dialog appears — confirm it (the confirm control also reads
  // "Cancel attendance"; pick the one inside the alertdialog).
  const confirmDialog = page.locator('[role="alertdialog"]');
  await expect(confirmDialog).toBeVisible({ timeout: 5000 });
  await Promise.all([
    page.waitForResponse(
      (r) => /\/api\/app\/notify\/cancel_attendance(\?|$)/.test(r.url()) && r.status() === 200,
      { timeout: 10_000 }
    ),
    confirmDialog.getByRole("button", { name: /cancel attendance/i }).click(),
  ]);

  // The UI reflects the cancellation (success toast / no error toast).
  const errorShown = await page.getByText(/error|failed|went wrong/i).isVisible().catch(() => false);
  expect(errorShown).toBe(false);

  // Coach's presence view confirms the spot was freed (student reverted to
  // not-attending: absent + justified), exactly like a reminder decline.
  const coachT = await token(request, "e2e-coach", "E2eCoach123!");
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
  const studentPresence = presences.find((p: any) => p.playerId === student.id);
  expect(studentPresence).toBeDefined();
  expect(studentPresence.status).toBe("absent");
  expect(studentPresence.justification).toBe("justified");
});
