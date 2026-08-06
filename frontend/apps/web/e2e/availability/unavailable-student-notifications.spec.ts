import { test, expect, Page } from "@playwright/test";
import { loginAsCoach, loginAsStudent } from "../helpers/auth";
import { openCalendar } from "../helpers/navigation";
import { goToNextWeek } from "../helpers/calendar-navigation";

/**
 * PAD-107: when a student has marked themselves unavailable, the coach must be
 * warned before scheduling them into that window, and must be blocked from
 * notifying them during it.
 *
 * Spec: calendar.student-blockers rules 4, 8, 9, 10, 11, 12.
 *
 * The blocker is created on the FIRST Monday after today, 18:00-20:00 — well
 * clear of the seeded "E2E Academy Class" (same Monday, 10:00-11:00) and of the
 * "E2E Pending Confirm Class" (tomorrow, 18:00-19:00), so nothing else in the
 * shared seed DB is affected. It is deleted again by the last test in the file.
 */

const BLOCKER_TITLE = "PAD-107 Unavailable";
const STUDENT_NAME = "E2E Student";

test.describe.configure({ mode: "serial" });

function firstMondayAfterTodayISO(): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const pyWeekday = (today.getDay() + 6) % 7; // Mon=0 … Sun=6
  const daysUntilMonday = (7 - pyWeekday) % 7 || 7; // strictly in the future
  const d = new Date(today);
  d.setDate(d.getDate() + daysUntilMonday);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

async function openAddClass(page: Page) {
  const addBtn = page
    .getByRole("button", { name: /add class|new class/i })
    .first();
  await expect(addBtn).toBeVisible({ timeout: 5000 });
  await addBtn.click();
  await expect(
    page.getByPlaceholder(/beginner academy|private/i).first()
  ).toBeVisible({ timeout: 5000 });
}

async function fillClassForm(
  page: Page,
  name: string,
  dateISO: string,
  start: string,
  end: string,
  { withStudent = false }: { withStudent?: boolean } = {}
) {
  const sheet = page.locator('[role="dialog"]').first();
  await sheet.getByPlaceholder(/beginner academy|private/i).first().fill(name);
  await sheet.locator('input[type="date"]').first().fill(dateISO);
  const times = sheet.locator('input[type="time"]');
  await times.nth(0).fill(start);
  await times.nth(1).fill(end);

  if (withStudent) {
    // PlayerSelector: switch to the "All" tab and pick the seeded student.
    await sheet.getByRole("tab", { name: /^all$/i }).click();
    await sheet.getByText(STUDENT_NAME, { exact: true }).first().click();
  }
}

test("PAD-107: student marks themselves unavailable", async ({ page }) => {
  await loginAsStudent(page);
  await page.goto("/availability");
  await page.waitForURL("**/availability");

  await page.getByRole("button", { name: /add blocker/i }).click();
  await page.getByLabel(/title/i).fill(BLOCKER_TITLE);
  await page.getByLabel(/^date$/i).fill(firstMondayAfterTodayISO());
  await page.getByLabel(/start time/i).fill("18:00");
  await page.getByLabel(/end time/i).fill("20:00");
  await page.getByRole("button", { name: /^save/i }).click();

  await expect(page.getByText(BLOCKER_TITLE, { exact: false })).toBeVisible({
    timeout: 10_000,
  });
});

test("PAD-107: scheduling a class into the blocked window warns the coach", async ({
  page,
}) => {
  await loginAsCoach(page);
  await openCalendar(page);
  await goToNextWeek(page);

  const monday = firstMondayAfterTodayISO();

  await openAddClass(page);
  // 18:15-19:15 sits inside the student's 18:00-20:00 blocker.
  await fillClassForm(page, "PAD-107 Blocked Class", monday, "18:15", "19:15", {
    withStudent: true,
  });

  await page.getByRole("button", { name: /create class/i }).first().click();

  // The warning names the student and explains notifications are impossible.
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible({ timeout: 5000 });
  await expect(dialog).toContainText(STUDENT_NAME);
  await expect(dialog).toContainText(/unavailable/i);
  await expect(dialog).toContainText(/notification/i);

  // Cancelling aborts the create — the sheet stays open, no class is made.
  await dialog.getByRole("button", { name: /^cancel$/i }).click();
  await expect(dialog).toBeHidden({ timeout: 5000 });
  await expect(page.getByText(/class created/i)).toHaveCount(0);

  // Confirming goes ahead and creates the class with the student enrolled.
  await page.getByRole("button", { name: /create class/i }).first().click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: /proceed|continue|add anyway|confirm/i })
    .click();

  await expect(page.getByText(/class created/i).first()).toBeVisible({
    timeout: 10_000,
  });
});

test("PAD-107: a class outside the blocked window does not warn", async ({
  page,
}) => {
  await loginAsCoach(page);
  await openCalendar(page);
  await goToNextWeek(page);

  const monday = firstMondayAfterTodayISO();

  await openAddClass(page);
  // 15:00-16:00 is clear of the blocker (18:00-20:00), of the seeded class
  // (10:00-11:00) and of the slots the PAD-99 overlap spec books later in the
  // run (10:30 and 07:00) — this spec must not leave an event in their way.
  await fillClassForm(page, "PAD-107 Free Class", monday, "15:00", "16:00", {
    withStudent: true,
  });

  await page.getByRole("button", { name: /create class/i }).first().click();

  await expect(page.getByText(/class created/i).first()).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
});

test("PAD-107: notifying a class in the blocked window is refused", async ({
  page,
}) => {
  await loginAsCoach(page);
  await openCalendar(page);
  await goToNextWeek(page);

  await page.getByText("PAD-107 Blocked Class").first().click();

  const remind = page.getByRole("button", { name: /remind/i }).first();
  await expect(remind).toBeVisible({ timeout: 10_000 });
  await remind.click();

  // The coach is told, by name, that this student cannot be notified.
  const warning = page.getByText(
    /cannot send notifications to .*E2E Student/i
  );
  await expect(warning.first()).toBeVisible({ timeout: 10_000 });
});

test("PAD-107: cleanup — student removes the blocker", async ({ page }) => {
  await loginAsStudent(page);
  await page.goto("/availability");
  await page.waitForURL("**/availability");

  const row = page
    .locator("div")
    .filter({ hasText: BLOCKER_TITLE })
    .filter({ has: page.getByRole("button", { name: /delete blocker/i }) })
    .last();

  await row.getByRole("button", { name: /delete blocker/i }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible({ timeout: 5_000 });
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: /^delete$/i })
    .click();

  await expect(page.getByText(BLOCKER_TITLE, { exact: false })).toHaveCount(0, {
    timeout: 10_000,
  });
});
