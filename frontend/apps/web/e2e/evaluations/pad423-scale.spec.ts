/**
 * PAD-423 — evaluations.scale on web: the coach picks 1-10 in Settings → Preferences
 * ("Escala de avaliações", rule 8), a competency on the coach's scale is then rated with a
 * slider (rule 7), and a drag across the slider is ONE input: exactly one PUT, sent on release,
 * holding the value the slider shows. The history card then shows it on its own scale.
 *
 * e2e-coach holds legacy categories (Forehand, 1-5, stars), so the starting set is never
 * created for it; the spec makes its own CUSTOM competency through the API. `afterEach` (R-040)
 * deletes the record and the competency and puts the coach back on 1-5: the coach and its
 * `notification_configs` row are shared by the whole run.
 *
 * Test ids and data attributes only; `ui()` only for the "Preferences" nav button, which has none.
 */
import { test, expect, type Page } from "@playwright/test";
import { loginAsCoach, STUDENT_USERNAME } from "../helpers/auth";
import { openSettings } from "../helpers/navigation";
import { clickPlayerCard } from "../helpers/players";
import { API_APP } from "../helpers/api";
import { ui } from "../helpers/i18n";

const COMPETENCY_NAME = "PAD-423 Garra";

let competencyId: number | null = null;
let recordId: number | null = null;

async function token(page: Page): Promise<string> {
  const accessToken = await page.evaluate(() => localStorage.getItem("accessToken"));
  expect(accessToken, "logged in").toBeTruthy();
  return accessToken!;
}

async function openPreferences(page: Page) {
  await openSettings(page);
  await page.getByRole("button", { name: ui("settings.nav.preferences") }).first().click();
  await expect(page.getByTestId("settings-evaluation-scale")).toBeVisible({ timeout: 8000 });
}

test.afterEach(async ({ page }) => {
  const accessToken = await page.evaluate(() => localStorage.getItem("accessToken")).catch(() => null);
  if (!accessToken) return;
  const headers = { Authorization: `Bearer ${accessToken}` };
  if (recordId !== null) await page.request.delete(`${API_APP}/evaluation_record/${recordId}`, { headers }).catch(() => undefined);
  if (competencyId !== null) await page.request.delete(`${API_APP}/evaluation_competency/${competencyId}`, { headers }).catch(() => undefined);
  await page.request.put(`${API_APP}/evaluation_scale`, { headers, data: { scaleMax: 5 } }).catch(() => undefined);
  recordId = null;
  competencyId = null;
});

test("PAD-423: on 1-10 a competency is rated with a slider, and one drag saves once", async ({ page }) => {
  await loginAsCoach(page);
  const headers = { Authorization: `Bearer ${await token(page)}` };

  // Rule 8: the setting, beside the frequency; choosing 1-10 saves {scaleMax: 10} at once.
  await openPreferences(page);
  await expect(page.getByTestId("settings-evaluation-scale-option-5")).toHaveAttribute("data-state", "checked");
  const scaleSaved = page.waitForResponse(
    (r) => /\/api\/app\/evaluation_scale$/.test(r.url()) && r.request().method() === "PUT" && r.status() === 200,
  );
  await page.getByTestId("settings-evaluation-scale-option-10").click();
  expect((await scaleSaved).request().postDataJSON()).toEqual({ scaleMax: 10 });

  // A competency created now is on the coach's scale (rule 2).
  const created = await page.request.post(`${API_APP}/evaluation_competency`, { headers, data: { name: COMPETENCY_NAME } });
  expect(created.ok(), await created.text()).toBeTruthy();
  const competency = await created.json();
  competencyId = competency.id;
  expect([competency.scaleMin, competency.scaleMax]).toEqual([1, 10]);

  // The form: the new competency's row holds a slider, not stars.
  await page.goto("/players");
  await page.getByPlaceholder(/search/i).first().fill("E2E Student");
  await clickPlayerCard(page, STUDENT_USERNAME);
  await expect(page).toHaveURL(/\/players\/\d+/);
  await page.getByTestId("player-evaluations-open").click();
  await expect(page.getByTestId("player-evaluations-drawer")).toBeVisible({ timeout: 8000 });
  await page.getByTestId("evaluation-new").click();

  const row = page.getByTestId(`evaluation-row-${competencyId}`);
  await expect(row).toBeVisible({ timeout: 8000 });
  await expect(row.getByTestId(/^evaluation-star-/)).toHaveCount(0);
  const slider = row.getByTestId(`evaluation-slider-${competencyId}-input`);
  const value = row.getByTestId(`evaluation-slider-${competencyId}-value`);
  await expect(slider).toHaveAttribute("data-unrated", "true");
  await expect(value).toHaveAttribute("data-score", "");

  // Rule 7: one drag, several values under the finger, ONE save on release.
  const puts: string[] = [];
  page.on("request", (r) => {
    if (/\/api\/app\/evaluation_record$/.test(r.url()) && r.method() === "PUT") puts.push(r.postData() ?? "");
  });
  const saved = page.waitForResponse(
    (r) => /\/api\/app\/evaluation_record$/.test(r.url()) && r.request().method() === "PUT" && r.ok(),
  );
  const box = (await slider.boundingBox())!;
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width * 0.1, y);
  await page.mouse.down();
  for (const f of [0.3, 0.5, 0.7]) await page.mouse.move(box.x + box.width * f, y, { steps: 4 });
  await page.mouse.up();
  const response = await saved;

  const shown = Number(await value.getAttribute("data-score"));
  expect(shown).toBeGreaterThan(1);
  expect(shown).toBeLessThan(10);
  const body = response.request().postDataJSON();
  expect(body.ratings[String(competencyId)]).toBe(shown);
  recordId = (await response.json()).id;
  await page.waitForTimeout(1000); // a second PUT, if the drag had sent one per value, would land here
  expect(puts).toHaveLength(1);

  // The history card shows the rating on its own scale, as a number (rule 6).
  await page.getByTestId("evaluation-finish").click();
  const card = page.getByTestId(`evaluation-history-card-${recordId}`);
  await expect(card).toBeVisible({ timeout: 8000 });
  await expect(card.getByTestId(`evaluation-stepper-${competencyId}-value`)).toHaveAttribute("data-score", String(shown));
});
