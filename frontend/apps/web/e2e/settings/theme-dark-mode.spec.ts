import { test, expect, Page } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { openSettings } from "../helpers/navigation";

/**
 * PAD-57: Web Settings -> Preferences "Theme = Dark" had no effect.
 *   next-themes was installed but no <ThemeProvider> wrapped the app, and the
 *   Theme <Select> only mutated local React state (applied/persisted nowhere).
 *   This spec proves that choosing Dark now toggles the `.dark` class on
 *   <html>, writes localStorage.theme, and survives a reload.
 *
 * IMPORTANT: the Settings language/theme controls hang under a mobile viewport,
 * so this spec runs at a desktop viewport.
 */

async function openPreferences(page: Page) {
  await openSettings(page);
  // SettingsPage nav uses plain <button> elements, not role="tab"; default tab
  // is "profile", so click Preferences explicitly.
  await page
    .getByRole("button", { name: /^preferences$/i })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: /^preferences$/i })
  ).toBeVisible({ timeout: 5000 });
}

async function selectTheme(page: Page, option: RegExp) {
  await page.getByLabel(/^theme$/i).click();
  await page.getByRole("option", { name: option }).click();
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await loginAsCoach(page);
});

test("PAD-57: choosing Dark applies the dark theme and persists across reload", async ({
  page,
}) => {
  await openPreferences(page);

  // Baseline: not dark.
  expect(
    await page.evaluate(() =>
      document.documentElement.classList.contains("dark")
    )
  ).toBe(false);

  // Choose Dark — should apply instantly (no Save required, like Language).
  await selectTheme(page, /^dark$/i);

  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.classList.contains("dark"))
    )
    .toBe(true);
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("theme")))
    .toBe("dark");

  // Reload: the dark class must still be present (persistence) and the select
  // must still show Dark (not reverted to System).
  await page.reload();
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.classList.contains("dark"))
    )
    .toBe(true);

  await openPreferences(page);
  await expect(page.getByLabel(/^theme$/i)).toContainText(/dark/i, {
    timeout: 5000,
  });

  // Switch back to Light so the browser context isn't left dark.
  await selectTheme(page, /^light$/i);
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.classList.contains("dark"))
    )
    .toBe(false);
});
