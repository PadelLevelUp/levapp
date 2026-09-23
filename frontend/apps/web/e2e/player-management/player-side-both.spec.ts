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

  // Enter inline edit mode via the PlayerHeader "Edit" button
  await page.getByRole("button", { name: "Edit" }).first().click({ timeout: 5000 });

  // The Side Select is the first combobox in the header — pick the new "Both" option
  // PAD-410: the first Select inside the profile pane — the roster beside it has its own sort Select.
  const sideSelect = page.getByTestId("player-detail-pane").locator('[role="combobox"]').first();
  await sideSelect.click();
  await page.getByRole("option", { name: "Both", exact: true }).click();

  // Save
  await page.getByRole("button", { name: /^save$/i }).click();

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
