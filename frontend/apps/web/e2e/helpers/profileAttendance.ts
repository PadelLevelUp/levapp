import { expect, type Page } from "@playwright/test";

/**
 * PAD-834 (players.profile rule 12): open the player card's Presenças or Faltas list in place, on the
 * first period that has data. The seed's history (seed_dates.py) is 8–250 days old, so the month is
 * empty early in a month and the calendar year early in January; the month is tried first, then the
 * year. A card whose period is empty keeps its toggle disabled, which is why a period with data is
 * needed before the list (and its "Ver página completa") can open.
 */
export async function openProfileList(page: Page, kind: "attendance" | "absences") {
  const toggle = page.getByTestId(`profile-${kind}-toggle`);
  for (const period of ["1m", "1y"]) {
    await page.getByTestId(`profile-period-${period}`).click();
    await expect(page.getByTestId(`profile-${kind}-card`)).toHaveAttribute("data-total", /\d+/, { timeout: 15_000 });
    const total = Number(await page.getByTestId(`profile-${kind}-card`).getAttribute("data-total"));
    if (total > 0) {
      await expect(toggle).toBeEnabled();
      await toggle.click();
      await expect(page.getByTestId(`profile-${kind}-list`)).toBeVisible();
      return { period, total };
    }
  }
  throw new Error(`no seeded ${kind} in this month or this calendar year (seed_dates.py: 8–250 days back)`);
}
