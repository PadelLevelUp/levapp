/**
 * PAD-481 (eligibility.rules rule 6): "up to N levels away" can look only above
 * the class, only below it, or both. The settings editor shows the three stored
 * operations — `within_n_of_class` (both, unchanged since PAD-128),
 * `within_n_above_class`, `within_n_below_class` — as one "within N levels" entry
 * plus a direction selector, and saves the direction AS the operation.
 */
import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { COACH_PASSWORD, COACH_USERNAME, loginAsCoach } from "../helpers/auth";
import { API_ROOT } from "../helpers/api";
import { ui } from "../helpers/i18n";
import { openCalendar } from "../helpers/navigation";
import { findClassOnCalendar } from "../helpers/calendar-navigation";

async function coachToken(request: APIRequestContext) {
  const res = await request.post(`${API_ROOT}/auth/login`, {
    data: { username: COACH_USERNAME, password: COACH_PASSWORD },
  });
  expect(res.ok()).toBeTruthy();
  const json = await res.json();
  return (json.accessToken ?? json.access_token) as string;
}

async function setConfig(request: APIRequestContext, token: string, data: Record<string, unknown>) {
  const res = await request.post(`${API_ROOT}/app/notify/config`, {
    headers: { Authorization: `Bearer ${token}` },
    data,
  });
  expect(res.ok()).toBeTruthy();
}

async function getConfig(request: APIRequestContext, token: string) {
  const res = await request.get(`${API_ROOT}/app/notify/config`, { headers: { Authorization: `Bearer ${token}` } });
  expect(res.ok()).toBeTruthy();
  return res.json();
}

async function openEligibility(page: Page) {
  await loginAsCoach(page);
  await page.goto("/settings");
  await page.getByTestId("settings-nav-notifications").click();
  await page.getByRole("button", { name: ui("settings.engine.eligibility") }).first().click();
  await expect(page.getByTestId("eligibility-section")).toBeVisible({ timeout: 10_000 });
}

test.describe("PAD-481: within N levels has a direction", () => {
  test("US-481: a one-way bar shows its direction, and switching it saves the new operation with the same N", async ({
    page,
    request,
  }) => {
    const token = await coachToken(request);
    await setConfig(request, token, {
      autoNotifyEnabled: true,
      eligibilityRules: [{ attribute: "level", operation: "within_n_above_class", value: 2 }],
    });
    try {
      await openEligibility(page);
      const row = page.getByTestId("eligibility-rule-row").first();
      // One "within N levels" entry, the direction beside it, and N kept.
      await expect(row.getByRole("combobox", { name: ui("settings.eligibility.operation") })).toContainText(
        ui("settings.eligibility.operations.withinNOfClass", { exact: false })
      );
      const direction = row.getByTestId("eligibility-direction");
      await expect(direction).toContainText(ui("settings.eligibility.directions.above", { exact: false }));
      await expect(row.getByRole("spinbutton", { name: ui("settings.eligibility.value") })).toHaveValue("2");

      const saved = page.waitForRequest(
        (r) => /\/api\/app\/notify\/config/.test(r.url()) && r.method() === "POST"
      );
      await direction.click();
      await page.getByTestId("eligibility-direction-below").click();
      const body = (await saved).postDataJSON();
      expect(body.eligibilityRules).toEqual([
        { attribute: "level", operation: "within_n_below_class", value: 2 },
      ]);
      await expect(direction).toContainText(ui("settings.eligibility.directions.below", { exact: false }));
      // And the server stored it (not only the request carried it).
      await expect
        .poll(async () => (await getConfig(request, token)).eligibilityRules, { timeout: 10_000 })
        .toEqual([{ attribute: "level", operation: "within_n_below_class", value: 2 }]);
    } finally {
      await setConfig(request, token, { eligibilityRules: null });
    }
  });

  test("US-481: a bar set before the option existed reads as above and below — its meaning is unchanged", async ({
    page,
    request,
  }) => {
    const token = await coachToken(request);
    await setConfig(request, token, {
      autoNotifyEnabled: true,
      eligibilityRules: [{ attribute: "level", operation: "within_n_of_class", value: 1 }],
    });
    try {
      await openEligibility(page);
      const row = page.getByTestId("eligibility-rule-row").first();
      await expect(row.getByTestId("eligibility-direction")).toContainText(
        ui("settings.eligibility.directions.both", { exact: false })
      );
    } finally {
      await setConfig(request, token, { eligibilityRules: null });
    }
  });

  /**
   * The class override uses the same editor (eligibility.cascade). Seed: "E2E Academy Class" is not
   * recurring, so a save has no scope dialog and writes the instance tier. Restored in `finally`.
   */
  test("US-481: the direction on one class's own bar saves the one-way operation on that class", async ({
    page,
    request,
  }) => {
    test.setTimeout(150_000);
    const CLASS = "E2E Academy Class";
    const token = await coachToken(request);
    const auth = { Authorization: `Bearer ${token}` };
    const events = await request.get(`${API_ROOT}/app/calendar?from=2026-01-01T00:00:00&to=2027-12-31T23:59:59`, {
      headers: auth,
    });
    const academy = ((await events.json()) as Array<Record<string, unknown>>).find((e) => e.title === CLASS);
    expect(academy, "seeded academy class").toBeTruthy();
    const readRules = async () => {
      const res = await request.post(
        `${API_ROOT}/app/class_instance?model=${academy!.model}&id=${academy!.originalId}&date=${academy!.date}`,
        { headers: auth }
      );
      return (await res.json()).eligibilityRules;
    };
    const set = await request.post(`${API_ROOT}/app/edit_class`, {
      headers: auth,
      data: {
        event: academy,
        scope: "single",
        updates: { eligibilityRules: [{ attribute: "level", operation: "within_n_of_class", value: 1 }] },
      },
    });
    expect(set.ok()).toBeTruthy();
    try {
      await loginAsCoach(page);
      await openCalendar(page);
      expect(await findClassOnCalendar(page, CLASS)).toBe(true);
      await page.getByText(CLASS).first().click();
      const sheet = page.getByRole("dialog");
      // The sheet finishes loading its instance around the first paint; retry Edit until Save shows.
      const saveButton = sheet.getByTestId("class-edit-save");
      for (let attempt = 0; attempt < 3; attempt++) {
        await sheet.getByTestId("class-edit").click({ timeout: 10_000 });
        if (await saveButton.isVisible({ timeout: 5_000 }).catch(() => false)) break;
      }
      await expect(saveButton).toBeVisible();

      const direction = sheet.getByTestId("eligibility-direction");
      await expect(direction).toContainText(ui("settings.eligibility.directions.both", { exact: false }));
      await direction.click();
      await page.getByTestId("eligibility-direction-above").click();
      await expect(direction).toContainText(ui("settings.eligibility.directions.above", { exact: false }));

      const saved = page.waitForResponse((r) => /\/api\/app\/edit_class/.test(r.url()) && r.status() === 200);
      await saveButton.click();
      expect((await saved).ok()).toBeTruthy();
      expect(await readRules()).toEqual([{ attribute: "level", operation: "within_n_above_class", value: 1 }]);
    } finally {
      await request.post(`${API_ROOT}/app/edit_class`, {
        headers: auth,
        data: { event: academy, scope: "single", updates: { eligibilityRules: null } },
      });
    }
  });
});
