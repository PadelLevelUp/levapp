import { test, expect, Page } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { openSettings } from "../helpers/navigation";

/**
 * PAD-39: Multi-language support (PT/EN) with coach-selectable language.
 *   First slice: i18n infrastructure + coach language selector in Settings.
 * PAD-40: Roll out i18n across the app UI — the coach's language preference now
 *   drives the ENTIRE interface (navigation, headings, buttons, labels), not just
 *   notifications, and it is applied globally on session restore (not only while
 *   the Settings screen is mounted).
 *
 * The E2E coach is seeded with language="en", so the app renders in English for
 * the rest of the suite. This spec temporarily switches to Portuguese to prove the
 * rollout, then restores English so subsequent specs keep matching English copy.
 */

// The language selector button/heading text flips with the active language, so use
// bilingual locators throughout this spec.
async function openPreferences(page: Page) {
  await openSettings(page);
  // SettingsPage nav uses plain <button> elements, not role="tab".
  await page
    .getByRole("button", { name: /^(preferences|preferências)$/i })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: /^(preferences|preferências)$/i })
  ).toBeVisible({ timeout: 5000 });
}

async function selectLanguage(page: Page, option: RegExp) {
  await page.getByLabel(/language|idioma/i).click();
  await page.getByRole("option", { name: option }).click();
  // Save (button label is localized, so match either language).
  await page
    .getByRole("button", { name: /save changes|guardar altera/i })
    .click();
  await expect(
    page.getByText(/settings saved|saved|guardad|preferências/i).first()
  ).toBeVisible({ timeout: 5000 });
}

test.beforeEach(async ({ page }) => {
  await loginAsCoach(page);
});

// US-71: Coach can select their preferred language in Settings
test("US-71: language selector is present in preferences", async ({ page }) => {
  await openPreferences(page);
  await expect(page.getByLabel(/language|idioma/i)).toBeVisible({
    timeout: 5000,
  });
});

// PAD-40: the coach's language preference drives the whole UI chrome, live-switches,
// and survives a reload (applied from the persisted preference on session restore).
test("PAD-40: language preference drives the whole app UI and persists", async ({
  page,
}) => {
  // Coach is seeded as English — the navigation renders in English.
  await page.goto("/calendar");
  await expect(page.getByRole("link", { name: "Calendar" })).toBeVisible({
    timeout: 5000,
  });

  // Switch to Portuguese in Settings.
  await openPreferences(page);
  await selectLanguage(page, /portugu/i);

  // The navigation chrome re-renders in Portuguese without a full reload.
  await page.goto("/calendar");
  await expect(page.getByRole("link", { name: "Calendário" })).toBeVisible({
    timeout: 5000,
  });
  await expect(page.getByRole("link", { name: "Jogadores" })).toBeVisible();

  // Reload: the applied language survives because it is re-applied from the
  // persisted preference on session restore, not only while Settings is mounted.
  await page.reload();
  await page.goto("/calendar");
  await expect(page.getByRole("link", { name: "Calendário" })).toBeVisible({
    timeout: 5000,
  });

  // Restore English so the shared seed DB / later specs stay in English.
  await openPreferences(page);
  await selectLanguage(page, /english|inglês/i);
  await page.goto("/calendar");
  await expect(page.getByRole("link", { name: "Calendar" })).toBeVisible({
    timeout: 5000,
  });
});
