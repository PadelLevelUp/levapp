import type { Page } from "@playwright/test";

export const COACH_USERNAME = "e2e-coach";
export const COACH_PASSWORD = "E2eCoach123!";

export const STUDENT_USERNAME = "e2e-student";
export const STUDENT_PASSWORD = "E2eStudent123!";

export const STUDENT2_USERNAME = "e2e-student-2";
export const STUDENT2_PASSWORD = "E2eStudent2123!";

/**
 * Fills in the login form and waits for a successful redirect.
 */
async function login(page: Page, username: string, password: string) {
  await page.goto("/auth");
  await page.getByPlaceholder("your-username").fill(username);
  await page.getByPlaceholder("••••••••").fill(password);
  await page.getByRole("button", { name: "Sign In" }).click();
  // Wait until we've left the auth page
  await page.waitForURL((url) => !url.pathname.startsWith("/auth"), {
    timeout: 10_000,
  });
}

export async function loginAsCoach(page: Page) {
  await login(page, COACH_USERNAME, COACH_PASSWORD);
}

export async function loginAsStudent(page: Page) {
  await login(page, STUDENT_USERNAME, STUDENT_PASSWORD);
}
