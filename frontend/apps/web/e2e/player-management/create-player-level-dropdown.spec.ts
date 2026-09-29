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
  await page.getByTestId("player-level-select").click();

  // Seeded coach has levels "Beginner" (B1) and "Intermediate" (I1).
  await expect(page.getByRole("option", { name: /Beginner/i })).toBeVisible();
  await expect(page.getByRole("option", { name: /Intermediate/i })).toBeVisible();
});

test("PAD-29: level field guides coach to Settings when no levels are defined", async ({ page }) => {
  await loginAsCoachNoLevels(page);
  await openPlayers(page);

  await page.getByRole("button", { name: /add player/i }).first().click();

  // A persistent hint with a link to Settings tells the coach how to fix it. It
  // renders whenever the coach has no levels, list open or not, so it is checked
  // BEFORE the list opens: closing an empty Select is what lost the sheet (B-234:
  // an Escape lost it 3–5 times in 10, and there is no option to choose instead).
  await expect(
    page.getByRole("link", { name: /create levels in settings/i }),
  ).toBeVisible();

  // Open the Level select. Because this coach has no levels, there must be a
  // clear empty-state message rather than an empty dropdown.
  await page.getByTestId("player-level-select").click();

  // No selectable level options should exist for a coach with no levels.
  await expect(page.getByRole("option")).toHaveCount(0);

  // While the dropdown is open, it must show an explicit empty-state message
  // (not a silently empty list).
  await expect(
    page.getByText(/no levels defined yet/i).first(),
  ).toBeVisible();
});
