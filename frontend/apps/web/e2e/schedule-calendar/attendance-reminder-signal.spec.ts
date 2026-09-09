/**
 * PAD-199 (B-017): the class-detail attendance badge follows a message that
 * exists, never `Presence.invited`.
 *
 * Spec: attendance.presence rule 1a, calendar.event-detail rule 3a. The seeded
 * "E2E Academy Class" gives e2e-student a `Presence(invited=True,
 * confirmed=False)` — exactly what materialisation writes — and NO reminder or
 * invitation message. Before the fix every such row showed the warning
 * "Reminder sent" badge; now the row shows no signal at all. The positive case
 * (a reminder makes the badge appear) is pinned by
 * backend/padel_app/tests/test_presence_reminder_signal.py, because sending a
 * real reminder to the seeded student would pollute the messaging specs'
 * conversation fixture.
 */
import { test, expect } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { openCalendar } from "../helpers/navigation";
import { findClassOnCalendar } from "../helpers/calendar-navigation";

test("PAD-199: an enrolled-but-never-reminded student shows no 'Reminder sent' badge", async ({
  page,
}) => {
  await loginAsCoach(page);
  await openCalendar(page);

  const title = "E2E Academy Class";
  expect(await findClassOnCalendar(page, title)).toBe(true);
  await page.getByText(title).first().click();

  const row = page
    .getByTestId("attendance-row")
    .filter({ hasText: "E2E Student" })
    .first();
  await expect(row).toBeVisible({ timeout: 10_000 });
  await expect(row.getByTestId("attendance-signal")).toHaveCount(0);
});
