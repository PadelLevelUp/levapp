import { test, expect, type Page } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { openSettings, openCalendar } from "../helpers/navigation";

/**
 * PAD-51: i18n coverage for the Seasons management UI (Settings > Calendar)
 * and the class-recurrence controls in AddClassSheet — both shipped with
 * PAD-8 as hardcoded English strings.
 *
 * The seeded E2E coach defaults to language="en" (see e2e/scripts/seed.py), so
 * this spec asserts the default English rendering resolves through i18n keys
 * rather than switching languages in-test (language switching is flaky under
 * non-desktop viewports and mutates the shared seed DB — see
 * e2e/settings/language-preference.spec.ts for that pattern).
 */

async function openCalendarSettings(page: Page) {
  await openSettings(page);
  // SettingsPage nav uses plain <button> elements, not role="tab".
  await page.getByRole("button", { name: /^calendar$/i }).first().click();
  await expect(
    page.getByRole("heading", { name: /calendar defaults/i })
  ).toBeVisible({ timeout: 5000 });
}

test("PAD-51: Seasons section and class-recurrence controls render fully localized (EN)", async ({
  page,
}) => {
  await loginAsCoach(page);

  // --- Seasons section (Settings > Calendar) ---
  await openCalendarSettings(page);

  await expect(page.getByRole("heading", { name: /^seasons$/i })).toBeVisible({
    timeout: 5000,
  });
  await expect(
    page.getByText(/define named seasons so classes can recur/i)
  ).toBeVisible();

  const addSeasonButton = page.getByRole("button", { name: /add season/i });
  await expect(addSeasonButton).toBeVisible();
  await expect(page.getByRole("button", { name: /save seasons/i })).toBeVisible();

  await addSeasonButton.click();
  await expect(page.getByPlaceholder(/season name/i).last()).toBeVisible();
  await expect(page.getByLabel(/^season start$/i).last()).toBeVisible();
  await expect(page.getByLabel(/^season end$/i).last()).toBeVisible();

  // --- AddClassSheet recurrence controls ---
  await openCalendar(page);
  const addButton = page
    .getByRole("button", { name: /new class|add class/i })
    .first();
  await addButton.click();

  await expect(
    page.getByRole("heading", { name: /new class/i }).or(
      page.getByText(/new class/i).first()
    )
  ).toBeVisible({ timeout: 5000 });

  const recurringSwitch = page.getByRole("switch", { name: /^recurring$/i });
  await expect(recurringSwitch).toBeVisible();
  await recurringSwitch.click();

  // Locale-aware weekday initials — English render should be the classic M T W T F S S.
  const dayButtons = page.locator("button", { hasText: /^[A-Z]$/ });
  await expect(dayButtons.first()).toBeVisible({ timeout: 5000 });

  // Manual end-date field shows before enabling "recurs until season end".
  await expect(page.getByText(/^end date$/i)).toBeVisible();

  const seasonEndSwitch = page.getByRole("switch", {
    name: /recurs until season end/i,
  });
  await expect(seasonEndSwitch).toBeVisible();
  await seasonEndSwitch.click();
  await expect(seasonEndSwitch).toHaveAttribute("aria-checked", "true");

  // Manual end-date field is replaced by the localized season-end helper text.
  await expect(
    page.getByText(/ends at your season'?s end date/i)
  ).toBeVisible();
  await expect(page.getByText(/^end date$/i)).not.toBeVisible();

  // No leftover raw i18n keys or Portuguese-only strings should surface.
  await expect(page.getByText(/calendar\.addClass\./)).toHaveCount(0);
  await expect(page.getByText(/settings\.seasons\./)).toHaveCount(0);

  // Close without saving — this test only verifies localized copy renders.
  await page.getByRole("button", { name: /^cancel$/i }).click();
});
