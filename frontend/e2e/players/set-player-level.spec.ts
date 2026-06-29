import { test, expect } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { openPlayers } from "../helpers/navigation";

// US-37: Coach can set a player's level
//
// Regression: the backend serializes the association's level as an integer
// (`levelId`), but the level <Select> options use string ids. Previously the
// dropdown never reflected/applied the saved level because `String(levelId)`
// wasn't compared. This test sets a level, saves, reloads, and asserts the
// chosen level persists (badge) AND that re-opening edit shows it selected.
test("US-37: coach can set a player's level", async ({ page }) => {
  await loginAsCoach(page);
  await openPlayers(page);

  // E2E Student is on page 2 (id-desc with 30 players) — search to find them.
  await page.getByPlaceholder(/search/i).first().fill("E2E Student");
  // Exact match to avoid "E2E Student Two".
  await page.getByText("E2E Student", { exact: true }).click();
  await page.waitForURL(/\/players\/\d+/, { timeout: 5000 });

  // Enter inline edit mode via the PlayerHeader "Edit" button.
  await page.getByRole("button", { name: "Edit" }).first().click({ timeout: 5000 });

  // The header has two Selects: [0] = Side, [1] = Level.
  const levelSelect = page.locator('[role="combobox"]').nth(1);
  await levelSelect.click();

  // Seeded levels: "B1 — Beginner" and "I1 — Intermediate". Student starts as
  // Beginner; switch to Intermediate so the change is observable.
  await page.getByRole("option", { name: /Intermediate/i }).click();

  // Save (button label "Save" / "Saving" in-flight).
  await page.getByRole("button", { name: /^save$/i }).click();

  // Badge should now reflect the chosen level (not in edit mode anymore).
  await expect(page.getByText(/I1 — Intermediate/)).toBeVisible({ timeout: 5000 });

  // Regression: reload and confirm the level persists from the backend.
  await page.reload();
  await page.waitForURL(/\/players\/\d+/, { timeout: 5000 });
  await expect(page.getByText(/I1 — Intermediate/)).toBeVisible({ timeout: 10000 });

  // Strongest regression check: re-open edit and verify the level Select itself
  // reflects the saved value (the bug was the Select couldn't show it).
  await page.getByRole("button", { name: "Edit" }).first().click({ timeout: 5000 });
  await expect(page.locator('[role="combobox"]').nth(1)).toContainText(/Intermediate/i);
});
