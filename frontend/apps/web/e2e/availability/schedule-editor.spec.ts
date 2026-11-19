import { test, expect } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { listBlockers, signUpStudentByJoinLink } from "../helpers/setupGuide";

/**
 * dashboard.student-setup-guide (PAD-839) rules 9, 10: the schedule editor, opened from step 3.
 * A fresh student, because the editor is reached from the guide and the seeded students' guide
 * is hidden. Test ids and the saved rows only; no rendered copy.
 */
test("[DASHBOARD-STUDENT-SETUP-GUIDE-10] two periods every day", async ({ browser, page, request }) => {
  await loginAsCoach(page);
  const student = await signUpStudentByJoinLink(browser, page);
  const s = student.page;

  await s.goto("/setup?step=unavailability");
  await expect(s.getByTestId("setup-unavailability")).toBeVisible({ timeout: 15_000 });
  await s.getByTestId("setup-schedule-create").click();
  await expect(s.getByTestId("schedule-editor")).toBeVisible();

  // "Igual todos os dias" is the default; "Todos" picks all seven days.
  await s.getByTestId("schedule-days-all").click();
  // Two start/end pairs: 09 > 11 and 15 > 20 (the later hour is where the student is free again).
  for (const hour of ["09", "11", "15", "20"]) {
    await s.getByTestId(`schedule-hour-${hour}`).click();
  }
  await expect(s.getByTestId("schedule-summary")).toBeVisible();

  const saved = s.waitForResponse((r) => /\/api\/app\/availability_schedules\//.test(r.url()) && r.request().method() === "PUT");
  await s.getByTestId("schedule-save").click();
  expect((await saved).status()).toBe(200);

  const rows = (await listBlockers(request, student.token)).sort((a, b) => a.startTime.localeCompare(b.startTime));
  expect(rows).toHaveLength(2);
  expect(rows[0].scheduleId).toBeTruthy();
  expect(rows[1].scheduleId).toBe(rows[0].scheduleId);
  expect(rows.map((r) => [r.startTime, r.endTime])).toEqual([
    ["09:00", "11:00"],
    ["15:00", "20:00"],
  ]);
  for (const r of rows) {
    expect([...(r.recurrenceRule?.daysOfWeek ?? [])].sort()).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(r.blocksAutoInvitations).toBe(true);
    expect(r.type).toBe("unavailable");
  }
  await student.context.close();
});
