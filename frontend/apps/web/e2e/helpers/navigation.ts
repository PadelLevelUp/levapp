import type { Page } from "@playwright/test";

export async function openCalendar(page: Page) {
  await page.goto("/calendar");
  await page.waitForURL("**/calendar");
}

export async function openPlayers(page: Page) {
  await page.goto("/players");
  await page.waitForURL("**/players");
}

export async function openExercises(page: Page) {
  await page.goto("/training/exercises");
  await page.waitForURL("**/training/exercises");
}

export async function openTraining(page: Page) {
  await page.goto("/training");
  await page.waitForURL("**/training");
}

export async function openMessages(page: Page) {
  await page.goto("/messages");
  await page.waitForURL("**/messages");
}

export async function openDashboard(page: Page) {
  await page.goto("/");
  await page.waitForURL((url) => url.pathname === "/" || url.pathname === "/dashboard");
}

export async function openSettings(page: Page) {
  await page.goto("/settings");
  await page.waitForURL("**/settings");
}

export async function openAvailability(page: Page) {
  await page.goto("/availability");
  await page.waitForURL("**/availability");
}

/**
 * The conversation-list row whose participant is exactly `name`.
 *
 * `page.getByText("E2E Student").first()` also matches "E2E Student Two" and any message preview
 * containing the name, so it opened whichever of those rows was newest. In a full serial run that
 * is E2E Student Two (the evaluation-tools specs' "shared an evaluation" messages bump it to the
 * top), and the spec then asserted against the wrong thread.
 */
export function conversationRow(page: Page, name: string) {
  return page
    .getByRole("button")
    .filter({ has: page.getByText(name, { exact: true }) })
    .first();
}
