import { test, expect } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { openCalendar } from "../helpers/navigation";

/**
 * PAD-90: "Recurs until season end" with no matching season must fail closed.
 *
 * Before the fix the backend silently left `recurrence_end` NULL when no season
 * covered the class's start date, and a NULL end means "recurs forever" to every
 * downstream reader — the coach got an unbounded class with no signal at all.
 *
 * The create is now rejected with a 400, and AddClassSheet stays open and shows
 * the reason inline so the coach can set a season or pick an end date.
 *
 * The seeded coach's seasons are shared mutable state across specs (other specs
 * create an "Autumn 2026" season starting today), so this spec deliberately
 * picks a start date two years out that no plausible season covers.
 */

// A date far enough out that no season any other spec creates can cover it.
function uncoveredDate() {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 2);
  return d.toISOString().slice(0, 10);
}

test("PAD-90: recurring until season end with no covering season is rejected inline", async ({
  page,
}) => {
  await loginAsCoach(page);
  await openCalendar(page);

  await page
    .getByRole("button", { name: /new class|add class/i })
    .first()
    .click();

  await expect(
    page
      .getByRole("heading", { name: /new class/i })
      .or(page.getByText(/new class/i).first())
  ).toBeVisible({ timeout: 5000 });

  await page.getByPlaceholder(/e\.g\./i).first().fill("PAD-90 Unbounded Class");
  await page.locator('input[type="date"]').first().fill(uncoveredDate());

  await page.getByRole("switch", { name: /^recurring$/i }).click();

  const seasonEndSwitch = page.getByRole("switch", {
    name: /recurs until season end/i,
  });
  await expect(seasonEndSwitch).toBeVisible({ timeout: 5000 });
  await seasonEndSwitch.click();
  await expect(seasonEndSwitch).toHaveAttribute("aria-checked", "true");

  await page.getByRole("button", { name: /create class/i }).click();

  // The sheet stays open and explains why, rather than closing on a class that
  // would have recurred forever.
  await expect(page.getByRole("alert")).toContainText(/no season covers|season does not cover/i, {
    timeout: 10_000,
  });
  await expect(seasonEndSwitch).toBeVisible();
  await expect(page.getByPlaceholder(/e\.g\./i).first()).toHaveValue(
    "PAD-90 Unbounded Class"
  );

  // Picking an explicit end date instead clears the blocker and the class saves.
  await seasonEndSwitch.click();
  await expect(seasonEndSwitch).toHaveAttribute("aria-checked", "false");
  await expect(page.getByRole("alert")).toHaveCount(0);

  const end = new Date();
  end.setFullYear(end.getFullYear() + 2);
  end.setMonth(end.getMonth() + 1);
  await page
    .locator('input[type="date"]')
    .last()
    .fill(end.toISOString().slice(0, 10));

  await page.getByRole("button", { name: /create class/i }).click();

  // Sheet closed => the create went through.
  await expect(
    page.getByRole("button", { name: /create class/i })
  ).toHaveCount(0, { timeout: 10_000 });
});
