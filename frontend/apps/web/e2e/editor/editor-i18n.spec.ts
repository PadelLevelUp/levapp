import { test, expect, Page } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { openSettings } from "../helpers/navigation";

/**
 * PAD-55: i18n coverage for the super-admin Editor tool and the vendored
 * shadcn/ui primitives' a11y text, plus removal of the dead Index scaffold.
 *
 * The E2E coach is seeded as a super-admin (see e2e/scripts/seed.py) so /editor
 * is reachable. Language switching happens through Settings at the desktop
 * viewport and is always restored to English so later specs keep matching
 * English copy in the shared seed DB.
 */

// Copied from settings/language-preference.spec.ts (helpers not exported there).
async function openPreferences(page: Page) {
  await openSettings(page);
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

test.beforeEach(async ({ page }) => {
  await loginAsCoach(page);
});

test("PAD-55: root path resolves to the app (no dead Index scaffold)", async ({
  page,
}) => {
  await page.goto("/");
  // The old scaffold rendered this exact copy — it must be gone everywhere.
  await expect(page.getByText(/welcome to your blank app/i)).toHaveCount(0);
  // "/" resolves to a real authenticated page, not a 404/blank scaffold.
  await expect(page.getByRole("link", { name: "Calendar" })).toBeVisible({
    timeout: 5000,
  });
});

test("PAD-55: Editor tool + a shadcn primitive a11y label render localized in EN and PT", async ({
  page,
}) => {
  // ── English (default) ──────────────────────────────────────────────────────
  await page.goto("/editor");

  // Editor chrome is now translated — English values render (no longer hardcoded).
  await expect(page.getByText("Models", { exact: true })).toBeVisible({
    timeout: 5000,
  });
  await expect(page.getByText(/select a model from the sidebar/i)).toBeVisible();

  // Select the first model, open the record sheet, and check the vendored Sheet
  // primitive's close-button a11y text is the localized "Close".
  await page.locator("aside ul li button").first().click();
  await page.getByRole("button", { name: "New" }).first().click();
  await expect(
    page.getByRole("button", { name: "Close", exact: true })
  ).toBeVisible({ timeout: 5000 });

  // ── Switch to Portuguese ───────────────────────────────────────────────────
  await openPreferences(page);
  await selectLanguage(page, /portugu/i);

  await page.goto("/editor");
  // Editor sidebar header is now Portuguese — proves the tool is wired to i18n.
  await expect(page.getByText("Modelos", { exact: true })).toBeVisible({
    timeout: 5000,
  });
  await expect(page.getByText(/selecione um modelo/i)).toBeVisible();

  // The vendored Sheet primitive's close label localizes too ("Fechar").
  await page.locator("aside ul li button").first().click();
  await page.getByRole("button", { name: "Novo" }).first().click();
  await expect(
    page.getByRole("button", { name: "Fechar", exact: true })
  ).toBeVisible({ timeout: 5000 });

  // ── Restore English so the shared seed DB stays English for later specs ─────
  await openPreferences(page);
  await selectLanguage(page, /english|inglês/i);
  await expect(page.getByRole("link", { name: "Calendar" })).toBeVisible({
    timeout: 5000,
  });
});
