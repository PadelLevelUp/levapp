import { test, expect, Page } from "@playwright/test";
import { loginAsCoach, loginAsStudent } from "../helpers/auth";
import { openSettings, openDashboard } from "../helpers/navigation";

/**
 * PAD-77: The Dashboard (coach and student) mixed Portuguese and English —
 * some strings (page title, KPI labels, list titles, notification-activity
 * title, notification statuses) were emitted by the backend as English
 * literals and never went through the i18n system, so they stayed English even
 * when the selected language was Portuguese.
 *
 * These specs switch the language to Portuguese, assert the whole dashboard
 * renders in Portuguese with no English leftovers, then restore English so the
 * shared seed DB and later specs keep matching English copy.
 *
 * NB (project gotcha): the language switch hangs under a mobile viewport, so we
 * force a desktop viewport, and we always restore English in-body.
 */

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
  await page
    .getByRole("button", { name: /save changes|guardar altera/i })
    .click();
  await expect(
    page.getByText(/settings saved|saved|guardad|preferências/i).first()
  ).toBeVisible({ timeout: 5000 });
}

async function waitForDashboard(page: Page) {
  await openDashboard(page);
  await page
    .waitForResponse(
      (r) => /\/api\/app\/dashboard/.test(r.url()) && r.status() === 200,
      { timeout: 10_000 }
    )
    .catch(() => null);
}

test.describe("PAD-77: dashboard i18n consistency", () => {
  test("PAD-77: coach dashboard renders in Portuguese with no English leftovers", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await loginAsCoach(page);
    await openPreferences(page);
    await selectLanguage(page, /portugu/i);

    try {
      await waitForDashboard(page);

      // In-page title must match the sidebar ("Painel"), not the English "Dashboard".
      await expect(
        page.getByRole("heading", { name: "Painel" })
      ).toBeVisible({ timeout: 10_000 });

      // The notification-activity block title is always emitted; it must be PT.
      await expect(
        page.getByText("Atividade de notificações").first()
      ).toBeVisible();

      // No English leftovers anywhere on the dashboard.
      await expect(page.getByText("Dashboard", { exact: true })).toHaveCount(0);
      await expect(page.getByText("Notification activity")).toHaveCount(0);
      await expect(page.getByText("Pending validation")).toHaveCount(0);
      await expect(page.getByText("Upcoming classes")).toHaveCount(0);
      await expect(page.getByText("Players", { exact: true })).toHaveCount(0);
    } finally {
      await openPreferences(page);
      await selectLanguage(page, /english|inglês/i);
    }
  });

  test("PAD-77: student dashboard renders in Portuguese with no English leftovers", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await loginAsStudent(page);
    await openPreferences(page);
    await selectLanguage(page, /portugu/i);

    try {
      await waitForDashboard(page);

      await expect(
        page.getByRole("heading", { name: "Painel" })
      ).toBeVisible({ timeout: 10_000 });

      await expect(page.getByText("Dashboard", { exact: true })).toHaveCount(0);
      await expect(page.getByText("Your upcoming lessons")).toHaveCount(0);
      await expect(page.getByText("Upcoming lessons")).toHaveCount(0);
      await expect(page.getByText("Invites to confirm")).toHaveCount(0);
    } finally {
      await openPreferences(page);
      await selectLanguage(page, /english|inglês/i);
    }
  });
});
