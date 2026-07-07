import type { Page } from "@playwright/test";

export const COACH_USERNAME = "e2e-coach";
export const COACH_PASSWORD = "E2eCoach123!";

export const STUDENT_USERNAME = "e2e-student";
export const STUDENT_PASSWORD = "E2eStudent123!";

export const STUDENT2_USERNAME = "e2e-student-2";
export const STUDENT2_PASSWORD = "E2eStudent2123!";

// Coach with no levels defined — for the empty-levels dropdown case (PAD-29).
export const COACH_NOLEVELS_USERNAME = "e2e-coach-nolevels";
export const COACH_NOLEVELS_PASSWORD = "E2eCoach123!";

/**
 * Fills in the login form and waits for a successful redirect.
 */
async function login(page: Page, username: string, password: string) {
  await page.goto("/auth");
  // Language-agnostic selectors: the login page renders in the default locale (pt)
  // before any user is authenticated, so we locate inputs by their stable id/type
  // rather than by (now-localized) placeholder or button text.
  await page.locator("#username").fill(username);
  await page.locator("#password").fill(password);
  await page.locator('button[type="submit"]').click();
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

export async function loginAsStudent2(page: Page) {
  await login(page, STUDENT2_USERNAME, STUDENT2_PASSWORD);
}

export async function loginAsCoachNoLevels(page: Page) {
  await login(page, COACH_NOLEVELS_USERNAME, COACH_NOLEVELS_PASSWORD);
}
