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

      // The rebuilt coach dashboard has no in-page "Dashboard"/"Painel"
      // heading — the greeting is the page's orientation, and it must be PT.
      await expect(page.getByTestId("coach-dashboard")).toBeVisible({
        timeout: 10_000,
      });
      await expect(
        page.getByRole("heading", { name: /^(Bom dia|Boa tarde|Boa noite),/ })
      ).toBeVisible({ timeout: 10_000 });

      // Section eyebrows are always emitted; they must be PT.
      await expect(page.getByText(/PRÓXIMOS 7 DIAS/).first()).toBeVisible();
      await expect(page.getByText(/PRECISA DE TI/).first()).toBeVisible();
      await expect(page.getByText("ESTA SEMANA").first()).toBeVisible();

      // No English leftovers anywhere on the dashboard.
      await expect(page.getByText(/NEXT 7 DAYS/)).toHaveCount(0);
      await expect(page.getByText(/NEEDS YOU/)).toHaveCount(0);
      await expect(page.getByText("THIS WEEK")).toHaveCount(0);
      await expect(
        page.getByRole("heading", { name: /^(Morning|Afternoon|Evening),/ })
      ).toHaveCount(0);
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

      // PAD-202: the student home has no "Dashboard"/"Painel" heading either —
      // the greeting is the page's orientation, and it must be PT.
      await expect(page.getByTestId("student-dashboard")).toBeVisible({
        timeout: 10_000,
      });
      await expect(
        page.getByRole("heading", { name: /^(Bom dia|Boa tarde|Boa noite),/ })
      ).toBeVisible({ timeout: 10_000 });
      await expect(page.getByRole("heading", { name: /^(Dashboard|Painel)$/ })).toHaveCount(0);

      // Section eyebrows and KPI tiles must be PT. (PAD-202 correction: the
      // student's list is the next 30 days, "PRÓXIMAS AULAS", not the week.)
      await expect(page.getByText(/PRÓXIMAS AULAS/).first()).toBeVisible();
      await expect(page.getByText(/PRECISA DE TI/).first()).toBeVisible();
      await expect(page.getByTestId("dashboard-kpi-attended")).toContainText("Presenças");
      await expect(page.getByTestId("dashboard-kpi-missed")).toContainText("Faltas");

      // No English leftovers anywhere on the dashboard.
      await expect(page.getByText(/NEXT 7 DAYS/)).toHaveCount(0);
      await expect(page.getByText(/UPCOMING ·/)).toHaveCount(0);
      await expect(page.getByText(/NEEDS YOU/)).toHaveCount(0);
      await expect(page.getByText("Dashboard", { exact: true })).toHaveCount(0);
      await expect(page.getByText("Your upcoming lessons")).toHaveCount(0);
      await expect(page.getByText("Upcoming lessons")).toHaveCount(0);
      await expect(page.getByText("Invites to confirm")).toHaveCount(0);
      await expect(page.getByText(/of \d+ lessons/)).toHaveCount(0);
    } finally {
      await openPreferences(page);
      await selectLanguage(page, /english|inglês/i);
    }
  });
});
