/**
 * E2E test for PAD-110 — expired standing waiting list entries are visually distinguished.
 *
 * Spec: notifications.waiting-list, rule 11 + "Expired standing entry is visually distinguished".
 *
 * Background: GET /api/app/notify/standing_waiting_list filters on `is_active` only, and expiry is
 * only enforced lazily by the invitation path. An entry can therefore be listed while already past
 * its `expires_at`, with nothing in the UI saying so.
 *
 * The test seeds its own data through the API rather than the shared seed script: the POST endpoint
 * derives `expires_at` from `durationDays` without validating the sign, so a negative value yields a
 * genuinely-expired row. Both entries are deleted in a `finally` block, which also deactivates the
 * per-class WaitingListEntry rows the add fanned out.
 *
 * Run just this file:
 *   npx playwright test e2e/notification-engine/standing-waitlist-expired.spec.ts
 */

import { test, expect, type Page } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { openSettings } from "../helpers/navigation";

const API_BASE = "http://localhost:5001/api/app";
const AUTH_BASE = "http://localhost:5001/api/auth";

/** A player who will hold the already-expired entry. */
const EXPIRED_PLAYER = "Filler Player 01";
/** A player who will hold a still-valid entry, as the contrast case. */
const ACTIVE_PLAYER = "Filler Player 02";

/** Open Settings > Notifications and expand the standing waiting list section. */
async function openStandingWaitingList(page: Page) {
  await openSettings(page);
  // PAD-112 added a second sidebar button whose label also matches
  // /notifications/i ("My notifications"), so the old role+name locator is
  // ambiguous for a coach. Target the stable testid instead.
  await page.getByTestId("settings-nav-notifications").click();
  await expect(page.getByText(/auto-invite engine/i)).toBeVisible({ timeout: 5000 });
  await page.getByRole("button", { name: /standing waiting list/i }).first().click();
  await expect(page.locator("[data-testid='standing-wl-entry']").first()).toBeVisible({
    timeout: 10000,
  });
}

/** The row whose player name is exactly `name`. */
function entryRow(page: Page, name: string) {
  return page
    .locator("[data-testid='standing-wl-entry']")
    .filter({ has: page.getByText(name, { exact: true }) })
    .first();
}

test.describe("PAD-110: expired standing waiting list entries", () => {
  test("expired entry is greyed out and labelled, valid entry is not", async ({ page, request }) => {
    const loginRes = await request.post(`${AUTH_BASE}/login`, {
      data: { username: "e2e-coach", password: "E2eCoach123!" },
    });
    const loginJson = await loginRes.json();
    const token = (loginJson.accessToken ?? loginJson.access_token) as string;
    const headers = { Authorization: `Bearer ${token}` };

    const playersRes = await request.get(`${API_BASE}/players`, { headers });
    const players = (await playersRes.json()) as Array<{ id: number; name: string }>;
    const expiredPlayer = players.find((p) => p.name === EXPIRED_PLAYER);
    const activePlayer = players.find((p) => p.name === ACTIVE_PLAYER);
    expect(expiredPlayer, `${EXPIRED_PLAYER} must exist in the seed`).toBeDefined();
    expect(activePlayer, `${ACTIVE_PLAYER} must exist in the seed`).toBeDefined();

    const createdIds: number[] = [];

    try {
      // A negative durationDays backdates expires_at, producing a genuinely expired entry.
      for (const [player, durationDays] of [
        [expiredPlayer!, -2],
        [activePlayer!, 30],
      ] as const) {
        const res = await request.post(`${API_BASE}/notify/standing_waiting_list`, {
          headers,
          data: { playerId: player.id, credits: 3, durationDays },
        });
        expect(res.ok(), `adding ${player.name} to the standing waiting list`).toBe(true);
        createdIds.push(((await res.json()) as { id: number }).id);
      }

      await loginAsCoach(page);
      await openStandingWaitingList(page);

      const expiredRow = entryRow(page, EXPIRED_PLAYER);
      const activeRow = entryRow(page, ACTIVE_PLAYER);
      await expect(expiredRow).toBeVisible();
      await expect(activeRow).toBeVisible();

      // 1. The expired row says so; the valid row does not.
      await expect(expiredRow.getByText(/expired|expirado/i)).toBeVisible();
      await expect(activeRow.getByText(/expired|expirado/i)).toHaveCount(0);

      // 2. The expired row is de-emphasised using the app's existing muted token, and the valid
      //    row keeps full emphasis.
      await expect(expiredRow.locator("[data-testid='standing-wl-name']")).toHaveClass(
        /text-muted-foreground/
      );
      await expect(activeRow.locator("[data-testid='standing-wl-name']")).not.toHaveClass(
        /text-muted-foreground/
      );

      // 3. Removing an expired entry is exactly what a coach wants to do next, so the delete
      //    control must stay fully visible, enabled and undimmed.
      const removeBtn = expiredRow.getByRole("button", { name: /remove|delete/i }).first();
      await expect(removeBtn).toBeVisible();
      await expect(removeBtn).toBeEnabled();
      const removeOpacity = await removeBtn.evaluate((el) => getComputedStyle(el).opacity);
      expect(Number(removeOpacity)).toBe(1);
    } finally {
      for (const id of createdIds) {
        await request
          .delete(`${API_BASE}/notify/standing_waiting_list/${id}`, { headers })
          .catch(() => null);
      }
    }
  });
});
