/**
 * PAD-665 slice 2 (players.search rule 10): the Players tab searches the server after the typing
 * stops (200 ms), says it is searching, and says so — with the query — when nobody matches; clearing
 * the box brings the list back. Addressed by test id (R-013).
 */
import { test, expect } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { openPlayers } from "../helpers/navigation";

test("US-PAD-665: a search that finds nobody says so with the query, and one request follows the typing", async ({ page }) => {
  await loginAsCoach(page);
  await openPlayers(page);
  const list = page.getByTestId("players-list");
  await expect(list.locator('[data-testid^="player-card-"]').first()).toBeVisible({ timeout: 15_000 });

  const searches: string[] = [];
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (u.pathname.endsWith("/api/app/coach_players_paginated") && u.searchParams.get("search")) {
      searches.push(u.searchParams.get("search")!);
    }
  });

  const box = page.getByTestId("players-search-input");
  // Typed faster than the 200 ms debounce: one request, for the whole word.
  await box.pressSequentially("  xavier ", { delay: 30 });
  const empty = page.getByTestId("player-search-empty");
  await expect(empty).toBeVisible({ timeout: 10_000 });
  await expect(empty).toContainText("xavier");
  expect(searches.map((s) => s.trim())).toEqual(["xavier"]);

  await box.fill("");
  await expect(empty).toHaveCount(0);
  await expect(list.locator('[data-testid^="player-card-"]').first()).toBeVisible({ timeout: 10_000 });
});
