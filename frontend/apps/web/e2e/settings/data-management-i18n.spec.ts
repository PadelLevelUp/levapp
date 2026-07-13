import { test, expect } from "@playwright/test";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";
import { loginAsCoach, COACH_USERNAME, COACH_PASSWORD } from "../helpers/auth";
import { openSettings } from "../helpers/navigation";

/**
 * PAD-54: i18n localize Settings data-management labels & misc stragglers.
 *
 * Covers:
 *  - DataImportSection: SELECTABLE_TABLES labels (e.g. "Players", "Classes") render
 *    localized instead of raw i18n keys once a file is picked (table-selection step).
 *  - ImportHistorySection: the raw API status ("active"/"reverted") renders as a
 *    localized label ("Active"/"Reverted"), not the raw lowercase status string.
 *
 * The E2E coach is seeded with language="en" (see i18n-e2e-default-locale-gotcha),
 * so this spec asserts default English rendering and does not switch language.
 */

async function getAuthToken(request: import("@playwright/test").APIRequestContext): Promise<string> {
  const res = await request.post("/api/auth/login", {
    data: { username: COACH_USERNAME, password: COACH_PASSWORD },
  });
  const body = await res.json();
  return body.accessToken;
}

async function openImportTab(page: import("@playwright/test").Page) {
  await loginAsCoach(page);
  await openSettings(page);
  await page.getByRole("button", { name: /import data/i }).click();
  await expect(page.getByText(/import data/i).first()).toBeVisible({ timeout: 5000 });
}

// Raw i18n keys that would leak into the DOM if the localization in this ticket
// regressed. Matched against the page's full body text.
const RAW_KEY_PATTERN = /settings\.(import\.tables\.|importHistory\.status\.|notificationGroups\.labels\.)[a-zA-Z]+/;

test.describe("PAD-54: Settings data-management i18n", () => {
  test("PAD-54: data import table-selection labels render localized, not raw keys", async ({ page }) => {
    await openImportTab(page);

    // Picking a file moves DataImportSection into the "selecting" phase, which
    // renders the SELECTABLE_TABLES labels — no backend/AI call happens at this step.
    const csvPath = path.join(os.tmpdir(), `pad-54-e2e-${Date.now()}.csv`);
    fs.writeFileSync(csvPath, "name,email\nTest Player,test@example.com\n");

    try {
      await page.locator('input[type="file"]').setInputFiles(csvPath);

      // Table selection step should be showing — assert the localized English
      // labels for every selectable table (from SELECTABLE_TABLES labelKey).
      const grid = page.locator("div.grid").filter({ hasText: "Players" });
      await expect(grid.getByText("Players", { exact: true })).toBeVisible({ timeout: 5000 });
      await expect(grid.getByText("Classes", { exact: true })).toBeVisible();
      await expect(grid.getByText("Players in Classes", { exact: true })).toBeVisible();
      await expect(grid.getByText("Presences", { exact: true })).toBeVisible();
      await expect(grid.getByText("Evaluations", { exact: true })).toBeVisible();
      await expect(grid.getByText("Strengths", { exact: true })).toBeVisible();
      await expect(grid.getByText("Weaknesses", { exact: true })).toBeVisible();

      // No raw i18n keys should have leaked into the DOM.
      const bodyText = await page.locator("body").innerText();
      expect(bodyText).not.toMatch(RAW_KEY_PATTERN);

      // Cancel back out without triggering the AI analysis call.
      await page.getByRole("button", { name: /^cancel$/i }).first().click();
    } finally {
      fs.rmSync(csvPath, { force: true });
    }
  });

  test("PAD-54: import history status badge is localized, not the raw API status", async ({ page, request }) => {
    const token = await getAuthToken(request);
    const ts = Date.now();
    const payload = {
      Players: [
        { name: `PAD-54 Import Player ${ts}`, email: `pad-54-${ts}@e2e.com` },
      ],
    };
    const importRes = await request.post("/api/app/import/confirm", {
      headers: { Authorization: `Bearer ${token}` },
      data: payload,
    });
    expect(importRes.ok()).toBeTruthy();

    await openImportTab(page);
    await expect(page.getByText(/import history/i)).toBeVisible({ timeout: 5000 });

    const entry = page.locator("[data-testid='import-history-entry']").first();
    await expect(entry).toBeVisible({ timeout: 5000 });

    // The API's raw status is lowercase "active" — the localized label is "Active".
    // Asserting the exact, capitalized text proves it went through i18n and not
    // straight from the API response.
    await expect(entry.getByText("Active", { exact: true })).toBeVisible();

    // No raw i18n keys should have leaked into the DOM.
    const bodyText = await page.locator("body").innerText();
    expect(bodyText).not.toMatch(RAW_KEY_PATTERN);

    // Revert the import so the status flips to "reverted" -> localized "Reverted".
    await entry.getByRole("button", { name: /revert/i }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible({ timeout: 3000 });
    await dialog.getByRole("button", { name: /confirm/i }).click();
    await expect(page.getByText(/successfully reverted/i)).toBeVisible({ timeout: 5000 });

    await expect(entry.getByText("Reverted", { exact: true })).toBeVisible({ timeout: 5000 });
  });
});
