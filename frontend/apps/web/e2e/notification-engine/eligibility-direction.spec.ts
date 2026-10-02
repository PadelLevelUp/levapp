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
});
