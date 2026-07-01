import { test, expect } from "@playwright/test";
import { loginAsCoach, loginAsCoachNoLevels } from "../helpers/auth";
import { openPlayers } from "../helpers/navigation";

// PAD-29: When creating a new player, the skill-level field must be usable.
// - When the coach has levels defined, opening the field shows them as options.
// - When the coach has NO levels defined, the field must show an explicit
//   empty-state message pointing to Settings — never a silently empty dropdown.

test("PAD-29: level field shows the coach's levels as options when levels exist", async ({ page }) => {
  await loginAsCoach(page);
  await openPlayers(page);

  await page.getByRole("button", { name: /add player/i }).first().click();

  // Open the Level select.
  await page.getByText("Select level").click();

  // Seeded coach has levels "Beginner" (B1) and "Intermediate" (I1).
  await expect(page.getByRole("option", { name: /Beginner/i })).toBeVisible();
  await expect(page.getByRole("option", { name: /Intermediate/i })).toBeVisible();
});

test("PAD-29: level field guides coach to Settings when no levels are defined", async ({ page }) => {
  await loginAsCoachNoLevels(page);
  await openPlayers(page);

  await page.getByRole("button", { name: /add player/i }).first().click();

  // Open the Level select. Because this coach has no levels, there must be a
  // clear empty-state message rather than an empty dropdown.
  await page.getByText("Select level").click();

  // No selectable level options should exist for a coach with no levels.
  await expect(page.getByRole("option")).toHaveCount(0);

  // While the dropdown is open, it must show an explicit empty-state message
  // (not a silently empty list).
  await expect(
    page.getByText(/no levels defined yet/i).first(),
  ).toBeVisible();

  // Close the dropdown; a persistent hint with a link to Settings must remain
  // so the coach knows how to fix the situation.
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("link", { name: /create levels in settings/i }),
  ).toBeVisible();
});
