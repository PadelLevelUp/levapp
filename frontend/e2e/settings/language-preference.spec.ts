import { test, expect } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { openSettings } from "../helpers/navigation";

/**
 * PAD-39: Multi-language support (PT/EN) with coach-selectable language.
 * First slice: i18n infrastructure + coach language selector in Settings,
 * persisted per user. (Notification localization is verified by backend tests.)
 */

async function openPreferences(page: import("@playwright/test").Page) {
  await openSettings(page);
  // SettingsPage nav uses plain <button> elements, not role="tab".
  await page.getByRole("button", { name: /^preferences$/i }).first().click();
  await expect(
    page.getByRole("heading", { name: /^preferences$/i })
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

// US-71: Coach can change language and it persists across reload
test("US-71: coach changes language to English and it persists", async ({
  page,
}) => {
  await openPreferences(page);

  // The language Select trigger — labelled "Language".
  const languageSelect = page.getByLabel(/language|idioma/i);
  await languageSelect.click();

  // Choose English from the dropdown.
  await page.getByRole("option", { name: /english|inglês/i }).click();

  // Save the settings.
  await page.getByRole("button", { name: /save changes/i }).click();

  // A success toast confirms persistence.
  await expect(page.getByText(/settings saved|saved|guardad/i).first()).toBeVisible({
    timeout: 5000,
  });

  // Reload and re-open preferences: the selected language must still be English.
  await page.reload();
  await openPreferences(page);
  await expect(page.getByLabel(/language|idioma/i)).toContainText(
    /english|inglês/i,
    { timeout: 5000 }
  );

  // Restore default (Portuguese) so the shared seed DB isn't left mutated.
  await page.getByLabel(/language|idioma/i).click();
  await page.getByRole("option", { name: /portugu/i }).click();
  await page.getByRole("button", { name: /save changes/i }).click();
});
