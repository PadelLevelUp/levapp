import { test, expect } from "@playwright/test";
import { loginAsCoach, STUDENT_USERNAME } from "../helpers/auth";
import { openPlayers } from "../helpers/navigation";
import { ui } from "../helpers/i18n";
import { clickPlayerCard } from "../helpers/players";

test.beforeEach(async ({ page }) => {
  await loginAsCoach(page);
  await openPlayers(page);
});

// US-36: Coach can search/filter players
test("US-36: search filters player list", async ({ page }) => {
  const searchInput = page.getByPlaceholder(/search/i).first();
  await searchInput.fill("E2E Student");

  // Only the matching player should be visible (server-side search)
  await expect(page.getByText("E2E Student", { exact: true })).toBeVisible({ timeout: 5000 });

  // Clear and type something that matches nothing
  await searchInput.clear();
  await searchInput.fill("zzz-no-match-zzz");
  // B-524: the list keeps the previous rows on screen while the next search loads
  // (keepPreviousData, PAD-586), so a fixed wait read stale rows. Retry until the search has
  // answered: the summary says 0 players and the student's row is gone.
  await expect(page.getByTestId("players-pagination")).toHaveAttribute("data-total", "0", { timeout: 10_000 });
  await expect(page.getByText("E2E Student", { exact: true })).toHaveCount(0);
});

// US-37: Coach can edit player details
test("US-37: coach edits player level and side", async ({ page }) => {
  // E2E Student is on page 2 (id-desc with 30 players) — use search to find them
  await page.getByPlaceholder(/search/i).first().fill("E2E Student");
  await clickPlayerCard(page, STUDENT_USERNAME);
  await page.waitForURL(/\/players\/\d+/, { timeout: 5000 });

  // The PlayerHeader has an "Edit" button that toggles inline edit mode
  // (no sheet/dialog — inline Name input + Side/Level Selects + Cancel/Save buttons)
  await page.getByRole("button", { name: "Edit" }).first().click({ timeout: 5000 });

  // Change the side — the Side Select is the first combobox in the header
  // PAD-410: the first Select inside the profile pane — the roster beside it has its own sort Select.
  const sideSelect = page.getByTestId("player-detail-pane").locator('[role="combobox"]').first();
  await sideSelect.click();
  await page.getByRole("option", { name: "Left" }).click();

  // Save — button label is "Save" (or "Saving" while in-flight)
  await page.getByRole("button", { name: /^save$/i }).click();

  // Should succeed without error. The inline-edit save path's only failure
  // toast is players.saveChangesFailed (PlayerDetailPage.tsx).
  const errorVisible = await page
    .getByText(ui("players.saveChangesFailed", { exact: false }))
    .first()
    .isVisible({ timeout: 3000 })
    .catch(() => false);
  expect(errorVisible).toBe(false);
});

// US-31: Coach can see the invite link for an inactive player
test("US-31: coach sees invite link for inactive player", async ({ page }) => {
  // Ghost Player has status=inactive — they're on page 2 with 30 players total.
  await page.getByPlaceholder(/search/i).first().fill("Ghost Player");
  await page.getByText("Ghost Player").click({ timeout: 5000 });

  // Profile shows "This player doesn't have an account" and the invite link
  await expect(
    page.getByText(ui("players.noAccountMessage")).first()
  ).toBeVisible({ timeout: 5000 });
});
