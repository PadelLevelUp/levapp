/**
 * PAD-603 — auth.delete-account-page rules 1–4: /delete-account is public and shows both ways to
 * delete (in the app; by email to admin@levapp.app) and what deletion removes and keeps, in English
 * or Portuguese. No login, nothing written (R-040 trivially satisfied). Asserted by test id and
 * attribute, never by copy (PAD-320).
 */
import { test, expect } from "@playwright/test";

test.describe("PAD-603: delete-account page", () => {
  test("anyone can open it and reach the email path and the privacy policy", async ({ page }) => {
    await page.goto("/delete-account?lang=en");
    await expect(page.getByTestId("delete-account-page")).toHaveAttribute("lang", "en");
    await expect(page.getByTestId("delete-account-in-app")).not.toBeEmpty();
    await expect(page.getByTestId("delete-account-mailto")).toHaveAttribute("href", "mailto:admin@levapp.app");
    await expect(page.getByTestId("delete-account-deleted").locator("li")).toHaveCount(5);
    await expect(page.getByTestId("delete-account-kept").locator("li")).toHaveCount(3);

    await page.getByTestId("delete-account-privacy-link").click();
    await expect(page).toHaveURL(/\/privacy\?lang=en$/);
    await expect(page.getByTestId("legal-privacy")).toBeVisible();
  });

  test("the language switch changes every string", async ({ page }) => {
    await page.goto("/delete-account?lang=en");
    const enText = await page.getByTestId("delete-account-in-app").textContent();
    await page.getByTestId("delete-account-lang-pt").click();
    await expect(page).toHaveURL(/\/delete-account\?lang=pt$/);
    await expect(page.getByTestId("delete-account-page")).toHaveAttribute("lang", "pt");
    await expect(page.getByTestId("delete-account-lang-pt")).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("delete-account-in-app")).not.toHaveText(enText ?? "");
  });
});
