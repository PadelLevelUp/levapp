/**
 * PAD-473 — settings.save-on-change on web: a control that saves on change signs its save beside
 * itself ("Guardado"), the language is stored the moment it is chosen (B-244) and its sign shows in
 * the chosen language, and the page-header "Guardar alterações" appears on Perfil only.
 *
 * Located by test id; the one rendered-copy check is the sign's text in Portuguese, resolved from
 * the locale file (uiText), which is what rule 5 is about. Each test puts what it changed back
 * through the API (R-040).
 */
import { test, expect, type Page } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { openSettings } from "../helpers/navigation";
import { API_APP, API_AUTH } from "../helpers/api";
import { ui, uiText } from "../helpers/i18n";

async function token(page: Page) {
  return page.evaluate(() => localStorage.getItem("accessToken"));
}

async function openTab(page: Page, navKey: string) {
  await page.getByRole("button", { name: ui(navKey) }).first().click();
}

test.afterEach(async ({ page }) => {
  const tok = await token(page).catch(() => null);
  if (!tok) return;
  const headers = { Authorization: `Bearer ${tok}` };
  await page.request.put(`${API_APP}/evaluation_scale`, { headers, data: { scaleMax: 5 } }).catch(() => undefined);
  await page.request.patch(`${API_AUTH}/me`, { headers, data: { language: "en" } }).catch(() => undefined);
});

test("PAD-473: choosing a scale signs the save beside it", async ({ page }) => {
  await loginAsCoach(page);
  await openSettings(page);
  await openTab(page, "settings.nav.preferences");

  const saved = page.waitForResponse((r) => /\/api\/app\/evaluation_scale$/.test(r.url()) && r.request().method() === "PUT" && r.ok());
  await page.getByTestId("settings-evaluation-scale-option-10").click();
  await saved;

  const sign = page.getByTestId("settings-evaluation-scale-sign");
  await expect(sign).toHaveAttribute("data-state", "saved");
  await expect(sign).toHaveAttribute("aria-live", "polite");
  // It goes after about two seconds.
  await expect(sign).toHaveAttribute("data-state", "idle", { timeout: 5000 });
});

test("PAD-473 / B-244: the language is stored when chosen and its sign speaks the new language", async ({ page }) => {
  await loginAsCoach(page);
  await openSettings(page);
  await openTab(page, "settings.nav.preferences");

  const saved = page.waitForResponse((r) => /\/api\/auth\/me$/.test(r.url()) && r.request().method() === "PATCH" && r.ok());
  await page.getByRole("combobox", { name: ui("settings.language") }).click();
  await page.getByRole("option", { name: ui("settings.portuguese") }).click();
  expect((await saved).request().postDataJSON()).toEqual({ language: "pt" });

  await expect(page.getByTestId("settings-language-sign")).toContainText(uiText("settings.saveSign.saved", "pt"));

  await page.reload();
  const me = await (await page.request.get(`${API_AUTH}/me`, { headers: { Authorization: `Bearer ${await token(page)}` } })).json();
  expect(me.language).toBe("pt");
  // And the screen after the reload: the select shows Portuguese, in Portuguese.
  await openTab(page, "settings.nav.preferences");
  await expect(page.locator("#language-select")).toContainText(uiText("settings.portuguese", "pt"));
});

test("PAD-473: the page-header Save shows on Perfil only", async ({ page }) => {
  await loginAsCoach(page);
  await openSettings(page);
  const headerSave = page.getByRole("button", { name: ui("settings.saveChanges") });

  await openTab(page, "settings.nav.profile");
  await expect(headerSave).toBeVisible();
  await openTab(page, "settings.nav.preferences");
  await expect(headerSave).toHaveCount(0);
  await openTab(page, "settings.nav.notifications");
  await expect(headerSave).toHaveCount(0);
});
