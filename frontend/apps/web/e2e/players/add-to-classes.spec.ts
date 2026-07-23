import { test, expect } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { openPlayers } from "../helpers/navigation";

// PAD-80: "Add to Classes" on the player profile showed no classes at all, even
// with a compatible class with free spots in the week.
//
// Root cause: the shared API client POSTed to `/api/app/lesson_instances`, which
// is registered GET-only. The request 405'd, the dialog's loader swallowed the
// rejection (try/finally with no catch) and rendered its "no classes" empty state.
//
// The picker is deliberately NOT level-filtered — a coach may add any player to
// any class — so this exercises the plain "class exists this week" path.
test("PAD-80: add-to-classes dialog lists the coach's classes for the week", async ({ page }) => {
  await loginAsCoach(page);
  await openPlayers(page);

  // E2E Student is on page 2 (id-desc with 30 players) — search to find them.
  await page.getByPlaceholder(/search/i).first().fill("E2E Student");
  // Exact match to avoid "E2E Student Two".
  await page.getByText("E2E Student", { exact: true }).click();
  await page.waitForURL(/\/players\/\d+/, { timeout: 5000 });

  await page.getByRole("button", { name: /add to classes/i }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 5000 });

  // The seeded "E2E Academy Class" always lands on the Monday of the FOLLOWING
  // week (seed.py derives `next_monday` strictly in the future), so step the
  // picker forward one week before asserting.
  await dialog.getByRole("button", { name: /next week/i }).click();

  await expect(dialog.getByText("E2E Academy Class").first()).toBeVisible({
    timeout: 10_000,
  });
  // The empty state must be gone — that was the reported symptom.
  await expect(dialog.getByText(/no classes this week/i)).toHaveCount(0);
});
