import { test, expect } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { openPlayers } from "../helpers/navigation";

test.beforeEach(async ({ page }) => {
  await loginAsCoach(page);
  await openPlayers(page);
});

// US-35: Coach can add a new player manually
test("US-35: coach adds a new player manually", async ({ page }) => {
  // Open the add-player dialog/sheet
  await page.getByRole("button", { name: /add player/i }).first().click();

  await page.getByPlaceholder("e.g. John Doe").fill("New E2E Player");
  // PAD-105: the coach supplies no username — the backend assigns a placeholder
  // that the player replaces when they activate their own account.

  const createBtn = page.getByRole("button", { name: /create player/i });
  await expect(createBtn).toBeEnabled({ timeout: 5000 });
  await createBtn.click();

  // Player should appear in the list. With 31 players sorted by name asc and
  // PAGE_SIZE=25, "New E2E Player" lands on page 2 — use search to find them.
  await page.getByPlaceholder(/search/i).first().fill("New E2E Player");
  await expect(page.getByText("New E2E Player")).toBeVisible({ timeout: 8000 });
});

// US-38: Player list shows all enrolled players
test("US-38: player list displays enrolled players", async ({ page }) => {
  // The seed creates 30 players (3 original + 27 filler). With PAGE_SIZE=25
  // and id-desc order, "E2E Student" is on page 2 — use search to find them.
  await page.getByPlaceholder(/search/i).first().fill("E2E Student");
  await expect(page.getByText("E2E Student", { exact: true })).toBeVisible({ timeout: 5000 });
});

// US-39: Coach can view player profile
test("US-39: coach can open player profile", async ({ page }) => {
  // Search for the seeded student (they're on page 2 due to id-desc order with 30 players)
  await page.getByPlaceholder(/search/i).first().fill("E2E Student");
  await page.getByText("E2E Student", { exact: true }).click();
  // Should navigate to the player detail page which shows the Evaluation and
  // Strengths & Weaknesses sections
  await page.waitForURL(/\/players\/\d+/, { timeout: 5000 });
  await expect(page.getByText("Evaluation").first()).toBeVisible({ timeout: 5000 });
  await expect(page.getByText(/strengths.*weaknesses/i).first()).toBeVisible();
});
