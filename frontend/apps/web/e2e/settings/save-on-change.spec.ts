/**
 * PAD-506 (settings.explicit-save): scale and language are held until the page-header Save; the
 * header Save shows on Perfil and Preferências, not on Calendar or Notificações.
 *
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

test("PAD-506: choosing a scale is held until the header Save, then persists", async ({ page }) => {
  await loginAsCoach(page);
  await openSettings(page);
  await openTab(page, "settings.nav.preferences");

  const sent: string[] = [];
  page.on("request", (r) => {
    if (/\/api\/app\/evaluation_scale$/.test(r.url()) && r.method() === "PUT") sent.push(r.url());
  });
  const headerSave = page.getByTestId("settings-header-save");
  await expect(headerSave).toBeDisabled();

  await page.getByTestId("settings-evaluation-scale-option-10").click();
  await expect(headerSave).toBeEnabled();
  expect(sent).toHaveLength(0);

  const saved = page.waitForResponse((r) => /\/api\/app\/evaluation_scale$/.test(r.url()) && r.request().method() === "PUT" && r.ok());
  await headerSave.click();
  await saved;
  expect(sent).toHaveLength(1);
  await expect(headerSave).toBeDisabled();

  await page.reload();
  await openTab(page, "settings.nav.preferences");
  const scale = await (await page.request.get(`${API_APP}/evaluation_scale`, { headers: { Authorization: `Bearer ${await token(page)}` } })).json();
  expect(scale.scaleMax).toBe(10);
});

test("PAD-506 / B-244: the language is held until Save, then stored and the app switches", async ({ page }) => {
  await loginAsCoach(page);
  await openSettings(page);
  await openTab(page, "settings.nav.preferences");

  const sent: unknown[] = [];
  page.on("request", (r) => {
    if (/\/api\/auth\/me$/.test(r.url()) && r.method() === "PATCH") sent.push(r.postDataJSON());
  });
  const headerSave = page.getByTestId("settings-header-save");

  await page.getByRole("combobox", { name: ui("settings.language") }).click();
  await page.getByRole("option", { name: ui("settings.portuguese") }).click();
  await expect(headerSave).toBeEnabled();
  expect(sent).toHaveLength(0);

  const saved = page.waitForResponse((r) => /\/api\/auth\/me$/.test(r.url()) && r.request().method() === "PATCH" && r.ok());
  await headerSave.click();
  expect((await saved).request().postDataJSON()).toEqual({ language: "pt" });
  await expect(headerSave).toBeDisabled();
  // The app now speaks Portuguese.
  await expect(page.locator("#language-select")).toContainText(uiText("settings.portuguese", "pt"));

  await page.reload();
  const me = await (await page.request.get(`${API_AUTH}/me`, { headers: { Authorization: `Bearer ${await token(page)}` } })).json();
  expect(me.language).toBe("pt");
  // And the screen after the reload: the select shows Portuguese, in Portuguese.
  await openTab(page, "settings.nav.preferences");
  await expect(page.locator("#language-select")).toContainText(uiText("settings.portuguese", "pt"));
});

test("PAD-506: the page-header Save shows on Perfil and Preferências, not on Calendar or Notificações", async ({ page }) => {
  await loginAsCoach(page);
  await openSettings(page);
  const headerSave = page.getByTestId("settings-header-save");

  await openTab(page, "settings.nav.profile");
  await expect(headerSave).toBeVisible();
  await openTab(page, "settings.nav.preferences");
  await expect(headerSave).toBeVisible();
  await openTab(page, "settings.nav.calendar");
  await expect(headerSave).toHaveCount(0);
  await openTab(page, "settings.nav.notifications");
  await expect(headerSave).toHaveCount(0);
});
