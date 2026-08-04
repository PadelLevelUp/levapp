import { test, expect, type Page } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { openSettings } from "../helpers/navigation";

// ---------------------------------------------------------------------------
// PAD-109 — Settings > Notifications > Standing waiting list
//
// The section offers a type-ahead search so the coach can pick a student to add
// to the standing ("permanent") waiting list. It was calling
// GET /api/app/notify/player_search, a route that did not exist on the backend;
// the 404 was swallowed by `catch { setResults([]) }`, so the box looked inert.
//
// Spec: notifications.waiting-list (rules 6-9)
// ---------------------------------------------------------------------------

// Seeded roster (apps/web/e2e/scripts/seed.py): "Filler Player 01".."Filler Player 27",
// plus E2E Student / E2E Student Two / Ghost Player. Filler 22 is not referenced by
// any other spec, which makes it safe to add to (and remove from) the waiting list.
const MATCHING_PLAYER = "Filler Player 22";
const NON_MATCHING_PLAYER = "Filler Player 21";

async function openStandingWaitingListSection(page: Page) {
  await loginAsCoach(page);
  await openSettings(page);
  // Settings uses custom <button> nav, not role="tab"
  await page.getByRole("button", { name: /notifications/i }).click();
  await expect(page.getByText(/auto-invite engine/i)).toBeVisible({ timeout: 5000 });

  const trigger = page.getByRole("button", { name: /standing waiting list/i }).first();
  await trigger.scrollIntoViewIfNeeded();
  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true", { timeout: 2000 });
  // Buffer for the collapsible animation so the input is hit-testable
  await page.waitForTimeout(300);
}

function searchBox(page: Page) {
  return page.getByPlaceholder(/search player to add/i);
}

test("PAD-109: standing waiting list search filters the coach's students", async ({ page }) => {
  await openStandingWaitingListSection(page);

  await searchBox(page).fill(MATCHING_PLAYER);

  // The dropdown renders each match as a button carrying the player's name.
  await expect(page.getByRole("button", { name: MATCHING_PLAYER })).toBeVisible({ timeout: 5000 });
  // ...and only the matches — a non-matching roster member must not appear.
  await expect(page.getByRole("button", { name: NON_MATCHING_PLAYER })).toHaveCount(0);
});

test("PAD-109: a searched student can be added to the standing waiting list", async ({ page }) => {
  await openStandingWaitingListSection(page);

  await searchBox(page).fill(MATCHING_PLAYER);
  await page.getByRole("button", { name: MATCHING_PLAYER }).click();

  // Add dialog: default 3 credits / 30 days is fine.
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 5000 });
  await dialog.getByRole("button", { name: /add to waiting list/i }).click();
  await expect(dialog).toBeHidden({ timeout: 5000 });

  // The entry must appear in the list — this is what proves the search returned
  // a Player.id (what the add endpoint expects) rather than a User.id.
  const entryName = page.getByText(MATCHING_PLAYER, { exact: true });
  await expect(entryName).toBeVisible({ timeout: 5000 });
  await expect(page.getByText(/0\/3 credits/i).first()).toBeVisible();

  // Clean up so the shared seed DB is left as we found it.
  const row = entryName.locator(
    "xpath=ancestor::div[contains(@class, 'justify-between')][1]"
  );
  await row.getByRole("button").click();
  await expect(entryName).toBeHidden({ timeout: 5000 });
});
