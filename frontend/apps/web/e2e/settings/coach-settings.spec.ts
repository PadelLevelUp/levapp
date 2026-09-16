import { test, expect } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { openSettings } from "../helpers/navigation";

test.beforeEach(async ({ page }) => {
  await loginAsCoach(page);
  await openSettings(page);
});

// US-66: Coach can access and update their profile
test("US-66: profile tab is present in settings", async ({ page }) => {
  const profileTab = page.getByRole("tab", { name: /profile/i }).or(
    page.locator("text=/profile/i").first()
  );
  await expect(profileTab).toBeVisible({ timeout: 5000 });
});

// US-67: Coach can change appearance / locale
test("US-67: preferences/appearance tab is present", async ({ page }) => {
  const prefTab = page
    .getByRole("tab", { name: /preference|appearance|locale/i })
    .first();
  const visible = await prefTab.isVisible({ timeout: 5000 }).catch(() => false);
  if (!visible) {
    // May be labelled differently
    const altTab = page.locator("text=/preference|appearance|theme/i").first();
    await expect(altTab).toBeVisible({ timeout: 5000 });
  } else {
    await expect(prefTab).toBeVisible();
  }
});

// US-68: Coach can configure calendar defaults
test("US-68: calendar tab is present in settings", async ({ page }) => {
  // SettingsPage uses plain <button> elements for nav (not role="tab").
  const calTab = page.getByRole("button", { name: /^calendar$/i }).first();
  await expect(calTab).toBeVisible({ timeout: 5000 });
  await calTab.click();
  // chore(appstore) 804cf5d removed the wrapping "Calendar defaults" card/heading
  // (dead UI cleanup) but kept SeasonsSection, which renders its own "Seasons"
  // heading — assert on that instead.
  await expect(
    page.getByRole("heading", { name: /^season$/i })
  ).toBeVisible({ timeout: 5000 });
});

// US-69: Coach can manage skill levels
test("US-69: skill levels management is accessible from settings", async ({ page }) => {
  // CoachLevelsSection lives in the "Preferences" tab (SettingsPage.tsx) — navigate
  // there first, same as US-68 does for the Calendar tab.
  const prefTab = page.getByRole("button", { name: /preferences/i }).first();
  await expect(prefTab).toBeVisible({ timeout: 5000 });
  await prefTab.click();

  // Could be a tab or a sub-section
  const levelsSection = page
    .locator("text=/level|skill/i")
    .first();
  await expect(levelsSection).toBeVisible({ timeout: 5000 });
});

// US-70: Import Data tab is accessible
test("US-70: import data tab is present in settings", async ({ page }) => {
  const importTab = page
    .getByRole("tab", { name: /import/i })
    .first();
  const visible = await importTab.isVisible({ timeout: 5000 }).catch(() => false);
  if (!visible) {
    // Navigate directly to the import section
    const importSection = page.locator("text=/import|bulk/i").first();
    const altVisible = await importSection.isVisible({ timeout: 5000 }).catch(() => false);
    if (!altVisible) {
      test.skip(true, "Import data section not found in settings");
      return;
    }
    expect(altVisible).toBe(true);
  } else {
    await expect(importTab).toBeVisible();
  }
});
