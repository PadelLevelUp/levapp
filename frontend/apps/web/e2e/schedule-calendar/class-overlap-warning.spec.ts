import { test, expect, Page } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { openCalendar } from "../helpers/navigation";
import { goToNextWeek } from "../helpers/calendar-navigation";

/**
 * PAD-99: warn the coach (non-blocking) when a class is scheduled at a time
 * that overlaps an existing event on the same day.
 *
 * The seeded "E2E Academy Class" sits on the FIRST Monday after today, 10:00–11:00.
 * Because the calendar only loads the currently-visible week's events, the test
 * must navigate to that week (one "Next week" click) before the overlap data is
 * available client-side.
 */
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
  const nameField = page.getByPlaceholder(/beginner academy|private/i).first();
  await expect(nameField).toBeVisible({ timeout: 5000 });
}

async function fillClassForm(
  page: Page,
  name: string,
  dateISO: string,
  start: string,
  end: string
) {
  const sheet = page.locator('[role="dialog"]').first();
  // A name is required by the backend (title is NOT NULL).
  await sheet.getByPlaceholder(/beginner academy|private/i).first().fill(name);
  await sheet.locator('input[type="date"]').first().fill(dateISO);
  const times = sheet.locator('input[type="time"]');
  await times.nth(0).fill(start);
  await times.nth(1).fill(end);
}

test.beforeEach(async ({ page }) => {
  await loginAsCoach(page);
  await openCalendar(page);
  // Seeded class lives in the next calendar week — load that week's events.
  await goToNextWeek(page);
});

// US-PAD-99: overlapping creation triggers a non-blocking confirm dialog
test("US-PAD-99: creating a class overlapping an existing event warns the coach", async ({
  page,
}) => {
  const monday = firstMondayAfterTodayISO();

  await openAddClass(page);
  // 10:30–11:30 overlaps the seeded 10:00–11:00 class on the same Monday.
  await fillClassForm(page, "PAD-99 Overlap Class", monday, "10:30", "11:30");

  await page
    .getByRole("button", { name: /create class/i })
    .first()
    .click();

  // A confirmation dialog must appear (not a hard block).
  const confirm = page.getByRole("button", { name: /proceed anyway/i });
  await expect(confirm).toBeVisible({ timeout: 5000 });
  await expect(
    page.getByText(/already .*event .*this time/i).first()
  ).toBeVisible();

  // Confirming proceeds with the booking.
  await confirm.click();
  await expect(page.getByText(/class created/i).first()).toBeVisible({
    timeout: 5000,
  });
});

// US-PAD-99: a non-overlapping slot must NOT warn
test("US-PAD-99: creating a class at a free time does not warn", async ({
  page,
}) => {
  const monday = firstMondayAfterTodayISO();

  await openAddClass(page);
  // 07:00–08:00 is clear of the seeded 10:00–11:00 class.
  await fillClassForm(page, "PAD-99 Free Class", monday, "07:00", "08:00");

  await page
    .getByRole("button", { name: /create class/i })
    .first()
    .click();

  // No overlap dialog — the class is created directly.
  await expect(page.getByText(/class created/i).first()).toBeVisible({
    timeout: 5000,
  });
  await expect(
    page.getByRole("button", { name: /proceed anyway/i })
  ).toHaveCount(0);
});
