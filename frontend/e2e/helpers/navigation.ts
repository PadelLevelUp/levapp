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
