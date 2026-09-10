/**
 * PAD-199 (B-017): the class-detail attendance badge follows a message that
 * exists — `presence.reminderSentAt` — never `Presence.invited`.
 *
 * Spec: attendance.presence rule 1a, calendar.event-detail rule 3a. The seeded
 * "E2E Academy Class" gives e2e-student a `Presence(invited=True)` — exactly
 * what materialisation writes — and NO reminder or invitation message. Before
 * the fix that row showed the warning "Reminder sent" badge.
 *
 * Written as a contract check against the presence record so it is
 * order-independent: other specs legitimately confirm or cancel this
 * student's attendance (which earns a "Confirmed attendance" badge), but
 * nothing in the suite sends this student a reminder for this class, so the
 * "reminder-sent" badge must never appear while `reminderSentAt` is null. The
 * positive case (a reminder makes the badge appear) is pinned by
 * backend/padel_app/tests/test_presence_reminder_signal.py.
 */
import { test, expect } from "@playwright/test";
import { COACH_PASSWORD, COACH_USERNAME, loginAsCoach } from "../helpers/auth";
import { API_APP, API_AUTH } from "../helpers/api";
import { openCalendar } from "../helpers/navigation";
import { findClassOnCalendar } from "../helpers/calendar-navigation";

type PresenceRow = {
  playerId: number;
  lessonInstanceId: number;
  invited: boolean;
  confirmed: boolean;
  reminderSentAt: string | null;
};

test("PAD-199: the attendance badge follows reminderSentAt, never invited", async ({
  page,
  request,
}) => {
  await loginAsCoach(page);
  await openCalendar(page);

  const title = "E2E Academy Class";
  expect(await findClassOnCalendar(page, title)).toBe(true);

  const detail = page.waitForResponse(
    (r) => /\/api\/app\/class_instance\?/.test(r.url()) && r.status() === 200
  );
  await page.getByText(title).first().click();
  const payload = (await (await detail).json()) as { presences?: PresenceRow[] };

  const row = page.getByTestId("attendance-row").filter({ hasText: "E2E Student" }).first();
  await expect(row).toBeVisible({ timeout: 10_000 });
  const playerId = Number(await row.getAttribute("data-player-id"));
  const presence = (payload.presences ?? []).find((p) => p.playerId === playerId);
  expect(presence, "the seeded student's presence row").toBeTruthy();

  // The seed's row is invited=True — the flag that used to paint the badge.
  expect(presence!.invited).toBe(true);
  // Nothing in the suite sends this student a reminder for this class.
  expect(presence!.reminderSentAt).toBeNull();

  const reminderBadge = row.locator('[data-testid="attendance-signal"][data-signal="reminder-sent"]');
  await expect(reminderBadge).toHaveCount(0);

  // And the badge that IS allowed follows the record too.
  const confirmedBadge = row.locator('[data-testid="attendance-signal"][data-signal="confirmed"]');
  await expect(confirmedBadge).toHaveCount(presence!.confirmed ? 1 : 0);

  // The API says the same thing the sheet shows (same serializer everywhere).
  const login = await request.post(`${API_AUTH}/login`, {
    data: { username: COACH_USERNAME, password: COACH_PASSWORD },
  });
  const auth = await login.json();
  const token = auth.accessToken ?? auth.access_token;
  const rows = (await (
    await request.get(`${API_APP}/lesson_instance/${presence!.lessonInstanceId}/presences`, {
      headers: { Authorization: `Bearer ${token}` },
    })
  ).json()) as PresenceRow[];
  const same = rows.find((p) => p.playerId === playerId);
  expect(same?.reminderSentAt ?? null).toBeNull();
});
