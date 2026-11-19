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

// US-37: Coach can edit player details. PAD-834: through Block 1, Informação, which sends only the
// keys that changed (players.profile rule 8).
test("[PLAYERS-PROFILE-12] edits a registered student's phone through the Informação block", async ({ page }) => {
  // E2E Student is on page 2 (id-desc with 30 players) — use search to find them
  await page.getByPlaceholder(/search/i).first().fill("E2E Student");
  await clickPlayerCard(page, STUDENT_USERNAME);
  await page.waitForURL(/\/players\/\d+/, { timeout: 5000 });

  await page.getByTestId("player-info-edit").click({ timeout: 5000 });
  // The header's own edit waits while Block 1 edits.
  await expect(page.getByTestId("player-edit")).toBeDisabled();
  const phoneBox = page.getByTestId("player-info-phone-input");
  const before = await phoneBox.inputValue();
  const next = before === "912000834" ? "913000834" : "912000834";

  // Cancel sends nothing.
  let posted = 0;
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().endsWith("/edit_player")) posted += 1;
  });
  await phoneBox.fill(next);
  await page.getByTestId("player-info-cancel").click();
  await expect(page.getByTestId("player-info-edit")).toBeVisible();
  expect(posted).toBe(0);

  // Save sends the phone and no other changed key.
  await page.getByTestId("player-info-edit").click();
  await page.getByTestId("player-info-phone-input").fill(next);
  const sent = page.waitForRequest((r) => r.method() === "POST" && r.url().endsWith("/edit_player"));
  await page.getByTestId("player-info-save").click();
  const { userId: _userId, ...changed } = (await sent).postDataJSON().updates;
  expect(changed).toEqual({ phone: next });
  await expect(page.getByTestId("player-info-phone")).toHaveText(next);

  // Should succeed without error. The inline-edit save path's only failure
  // toast is players.saveChangesFailed (PlayerDetailPage.tsx).
  const errorVisible = await page
    .getByText(ui("players.saveChangesFailed", { exact: false }))
    .first()
    .isVisible({ timeout: 3000 })
    .catch(() => false);
  expect(errorVisible).toBe(false);
});

// US-31: Coach can see the invite link for a player who never registered. PAD-834: the pending
// alert (players.profile rule 11) replaces the old "no account" panel.
test("US-31: coach sees invite link for inactive player", async ({ page }) => {
  // Ghost Player is a placeholder (inactive, no password).
  await page.getByPlaceholder(/search/i).first().fill("Ghost Player");
  await page.getByText("Ghost Player").click({ timeout: 5000 });

  const alert = page.getByTestId("player-pending-alert");
  await expect(alert).toBeVisible({ timeout: 5000 });
  await expect(alert.getByTestId("player-copy-invite-link")).toBeVisible();
});
