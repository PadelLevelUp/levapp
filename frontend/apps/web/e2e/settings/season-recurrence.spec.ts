import { test, expect, type Page } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { openSettings, openCalendar } from "../helpers/navigation";

/**
 * PAD-8: Season-based recurrence to classes with coach-specific end dates.
 *
 * A coach manages named "seasons" (name, start, end) in Settings > Calendar.
 * When creating a recurring class the coach can pick "recurs until season end"
 * instead of typing an explicit end date; instance generation then stops at the
 * owning coach's season end_date.
 */

async function openCalendarSettings(page: Page) {
  await openSettings(page);
  // SettingsPage nav uses plain <button> elements, not role="tab".
  await page.getByRole("button", { name: /^calendar$/i }).first().click();
  // chore(appstore) 804cf5d removed the wrapping "Calendar defaults" card/heading
  // (dead UI cleanup) but kept SeasonsSection, which renders its own "Seasons"
  // heading — assert on that instead.
  await expect(
    page.getByRole("heading", { name: /^seasons$/i })
  ).toBeVisible({ timeout: 5000 });
}

// Build two dates: a season starting ~today and ending ~3 months out.
function seasonDates() {
  const start = new Date();
  const end = new Date();
  end.setMonth(end.getMonth() + 3);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { start: fmt(start), end: fmt(end) };
}

test("PAD-8: coach can create a season in Settings", async ({ page }) => {
  await loginAsCoach(page);
  await openCalendarSettings(page);

  // The Seasons management section should be present in the Calendar tab.
  const seasonsHeading = page.getByRole("heading", { name: /seasons/i });
  await expect(seasonsHeading).toBeVisible({ timeout: 5000 });

  const { start, end } = seasonDates();

  // Add a season.
  await page.getByRole("button", { name: /add season/i }).click();

  await page.getByPlaceholder(/season name/i).last().fill("Autumn 2026");
  // Two date inputs appear for the new row: start then end.
  const startInput = page.getByLabel(/season start/i).last();
  const endInput = page.getByLabel(/season end/i).last();
  await startInput.fill(start);
  await endInput.fill(end);

  await page.getByRole("button", { name: /save seasons/i }).click();

  // Persisted: reload and the season name is still there.
  await page.reload();
  await openCalendarSettings(page);
  await expect(page.getByPlaceholder(/season name/i).first()).toHaveValue(
    "Autumn 2026",
    { timeout: 5000 }
  );
});

// Returns true if a season name input already holds the given value.
async function hasSeasonNamed(page: Page, name: string) {
  const inputs = page.getByPlaceholder(/season name/i);
  const count = await inputs.count();
  for (let i = 0; i < count; i++) {
    if ((await inputs.nth(i).inputValue()) === name) return true;
  }
  return false;
}

test("PAD-8: class can recur until season end", async ({ page }) => {
  await loginAsCoach(page);

  // Ensure a season exists (idempotent: create if missing).
  await openCalendarSettings(page);
  const { start, end } = seasonDates();
  const hasSeason = await hasSeasonNamed(page, "Autumn 2026");
  if (!hasSeason) {
    await page.getByRole("button", { name: /add season/i }).click();
    await page.getByPlaceholder(/season name/i).last().fill("Autumn 2026");
    await page.getByLabel(/season start/i).last().fill(start);
    await page.getByLabel(/season end/i).last().fill(end);
    await page.getByRole("button", { name: /save seasons/i }).click();
    await expect(page.getByPlaceholder(/season name/i).first()).toHaveValue(
      "Autumn 2026",
      { timeout: 5000 }
    );
  }

  // Create a recurring class that recurs until season end.
  await openCalendar(page);

  // Open the "add class" sheet. Calendar exposes a "New class"/add affordance.
  const addButton = page
    .getByRole("button", { name: /new class|add class/i })
    .first();
  await addButton.click();

  await expect(
    page.getByRole("heading", { name: /new class/i }).or(
      page.getByText(/new class/i).first()
    )
  ).toBeVisible({ timeout: 5000 });

  await page.getByPlaceholder(/e\.g\./i).first().fill("PAD-8 Season Class");

  // Pick a start date = today.
  const today = new Date().toISOString().slice(0, 10);
  await page.locator('input[type="date"]').first().fill(today);

  // Turn on recurring (the weekday auto-selects from the chosen start date).
  await page.getByRole("switch", { name: /^recurring$/i }).click();

  // The "recurs until season end" switch appears once recurring is on.
  const seasonEndSwitch = page.getByRole("switch", {
    name: /recurs until season end/i,
  });
  await expect(seasonEndSwitch).toBeVisible({ timeout: 5000 });
  await seasonEndSwitch.click();
  await expect(seasonEndSwitch).toHaveAttribute("aria-checked", "true");

  // With it active, the manual End date field is replaced by season-end helper text.
  await expect(page.getByText(/ends at your season'?s end date/i)).toBeVisible();

  // Save the class.
  await page.getByRole("button", { name: /create class/i }).click();

  // The class should now show on the calendar.
  await expect(
    page.getByText("PAD-8 Season Class").first()
  ).toBeVisible({ timeout: 10_000 });
});
