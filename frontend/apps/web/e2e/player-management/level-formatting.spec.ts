import { test, expect } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { openPlayers } from "../helpers/navigation";

// PAD-14: Level selection UI shows the level code and label as visually distinct
// elements — the code is emphasised (bold) and separated from the label by "|",
// instead of the old "CODE – Label" run-together formatting.
test("PAD-14: level dropdown renders code bold and separated from label", async ({ page }) => {
  await loginAsCoach(page);
  await openPlayers(page);

  // Open the add-player sheet, then the Level select.
  await page.getByRole("button", { name: /add player/i }).first().click();
  await page.getByText("Select level").click();

  // Seeded level "B1" / "Beginner": the option must contain the code in a bold
  // element, visually separated from the label by a "|".
  const option = page.getByRole("option", { name: /Beginner/i });
  await expect(option).toBeVisible();
  await expect(option).toContainText("|");
  await expect(option.locator(".font-semibold", { hasText: "B1" })).toBeVisible();
});
