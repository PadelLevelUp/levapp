import { test, expect } from "@playwright/test";
import { loginAsCoach, loginAsStudent, COACH_USERNAME, COACH_PASSWORD } from "../helpers/auth";

// US-33: Coach can log in with valid credentials
test("US-33: coach logs in successfully", async ({ page }) => {
  await loginAsCoach(page);
  // After login, should be on a page other than /auth
  await expect(page).not.toHaveURL(/.*\/auth/);
  // The app shell should be visible
  await expect(page.locator("nav, [data-testid='sidebar'], aside").first()).toBeVisible();
});

// US-33: Invalid credentials show an error
test("US-33: wrong password shows error", async ({ page }) => {
  await page.goto("/auth");
  // The login page renders in the default locale (pt) before auth, so use stable
  // id/type selectors rather than localized placeholder / button text.
  await page.locator("#username").fill(COACH_USERNAME);
  await page.locator("#password").fill("WrongPassword!");
  await page.locator('button[type="submit"]').click();
  // Should stay on auth page and show an error — wait for the request to resolve
  await expect(page).toHaveURL(/.*\/auth/);
  // Error toast: EN "Invalid username or password." / PT "Nome de utilizador ou
  // palavra-passe inválidos." — match either language.
  await expect(
    page.locator("text=/invalid|incorrect|error|inválid|palavra-passe/i").first()
  ).toBeVisible({ timeout: 5000 });
});

// US-34: Student can log in with valid credentials
test("US-34: student logs in successfully", async ({ page }) => {
  await loginAsStudent(page);
  await expect(page).not.toHaveURL(/.*\/auth/);
});

// US-34: Unauthenticated access redirects to auth
test("US-34: unauthenticated access to protected route redirects to auth", async ({ page }) => {
  await page.goto("/players");
  await page.waitForURL(/.*\/auth/, { timeout: 5000 });
  await expect(page).toHaveURL(/.*\/auth/);
});
