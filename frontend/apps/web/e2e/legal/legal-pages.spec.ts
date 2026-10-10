/**
 * PAD-601 — auth.legal-pages rules 1–3: /terms and /privacy render the markdown text with a
 * version header and an EN | PT switch; the Portuguese view shows the English text under the
 * "prevalece a versão inglesa" notice while the translation is in preparation. Public pages, no
 * login, nothing written (R-040 trivially satisfied). Asserted by test id, never by copy (PAD-320).
 */
import { test, expect } from "@playwright/test";

test.describe("PAD-601: legal pages", () => {
  test("/terms and /privacy render the text with a version header", async ({ page }) => {
    await page.goto("/terms");
    await expect(page.getByTestId("legal-terms")).toBeVisible();
    await expect(page.getByTestId("legal-version")).toHaveText(/^\d{4}-\d{2}-\d{2}$/);
    await expect(page.getByTestId("legal-effective-date")).not.toBeEmpty();
    await expect(page.getByTestId("legal-body").locator("h1")).toHaveCount(1);
    await expect(page.getByTestId("legal-fallback-notice")).toHaveCount(0);

    await page.goto("/privacy");
    await expect(page.getByTestId("legal-privacy")).toBeVisible();
    await expect(page.getByTestId("legal-body").locator("h2").first()).toBeVisible();
  });

  test("the PT switch keeps the English text under the Portuguese notice and carries over the cross-link", async ({ page }) => {
    await page.goto("/terms");
    await page.getByTestId("legal-lang-pt").click();
    await expect(page).toHaveURL(/\/terms\?lang=pt$/);
    await expect(page.getByTestId("legal-fallback-notice")).toBeVisible();
    await expect(page.getByTestId("legal-terms")).toHaveAttribute("lang", "en");
    await page.getByTestId("legal-footer").locator('a[href="/privacy?lang=pt"]').click();
    await expect(page).toHaveURL(/\/privacy\?lang=pt$/);
    await expect(page.getByTestId("legal-privacy")).toBeVisible();
    await expect(page.getByTestId("legal-fallback-notice")).toBeVisible();
  });

  test("an internal link inside the text stays in the app", async ({ page }) => {
    await page.goto("/terms");
    const inBody = page.getByTestId("legal-body").locator('a[href="/privacy"]').first();
    await expect(inBody).toBeVisible();
    await inBody.click();
    await expect(page).toHaveURL(/\/privacy$/);
    await expect(page.getByTestId("legal-privacy")).toBeVisible();
  });
});
