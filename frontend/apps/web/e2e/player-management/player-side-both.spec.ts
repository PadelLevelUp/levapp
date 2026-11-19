import { test, expect } from "@playwright/test";
import { loginAsCoach, STUDENT_USERNAME } from "../helpers/auth";
import { openPlayers } from "../helpers/navigation";
import { clickPlayerCard } from "../helpers/players";

test.beforeEach(async ({ page }) => {
  await loginAsCoach(page);
  await openPlayers(page);
});

// PAD-15: Coach can set a player's preferred side to "Both" (Left/Right/Both)
test("PAD-15: coach sets player side to Both and it persists", async ({ page }) => {
  // Open the E2E Student profile
  await page.getByPlaceholder(/search/i).first().fill("E2E Student");
  await clickPlayerCard(page, STUDENT_USERNAME);
  await page.waitForURL(/\/players\/\d+/, { timeout: 5000 });

  // PAD-834 (players.profile rule 8): the side is edited in Block 1, Informação.
  await page.getByTestId("player-info-edit").click({ timeout: 5000 });
  const sideSelect = page.getByTestId("player-side-select");
  await sideSelect.click();
  await page.getByRole("option", { name: "Both", exact: true }).click();

  // Save
  await page.getByTestId("player-info-save").click();

  // No error, and the side badge reflects "both" after save — asserted via
  // data-state (the same value that picks the rendered label), never the
  // rendered label itself (the page renders pt in E2E).
  const errorVisible = await page
    .getByText(/error|failed/i)
    .first()
    .isVisible({ timeout: 3000 })
    .catch(() => false);
  expect(errorVisible).toBe(false);

  const sideBadge = page.getByTestId("player-side-badge").first();
  await expect(sideBadge).toHaveAttribute("data-state", "both", {
    timeout: 5000,
  });

  // Reload to confirm the value was persisted to the backend
  await page.reload();
  await expect(page.getByTestId("player-side-badge").first()).toHaveAttribute(
    "data-state",
    "both",
    { timeout: 5000 },
  );
});
