import { test, expect } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { openMessages, openPlayers } from "../helpers/navigation";

// PAD-205 / B-023 — a coach must be able to message a player they added
// themselves.
//
// The messageable-users endpoint used to answer from club membership
// (`player_in_club`), a table only `seed/mock_data.py` ever writes. Every
// in-app path that attaches a player to a coach writes the roster
// (`coach_in_player`) instead, so the "new conversation" picker listed nothing
// a coach had actually added — and `POST /api/app/conversation` answered 403.
//
// Two facts this spec is built around, both from e2e/scripts/seed.py:
//  * the seed creates NO `Association_PlayerClub` rows at all, so before the
//    fix this picker is empty for e2e-coach — the failure is unambiguous;
//  * NewConversationDialog hides anyone the coach already has a conversation
//    with, and the seed gives e2e-coach a conversation with E2E Student, so
//    the spec has to add its own player rather than reuse a seeded one.

test.beforeEach(async ({ page }) => {
  await loginAsCoach(page);
});

// US-205: A player the coach added in the app is messageable
test("US-205: coach can start a conversation with a player they just added", async ({
  page,
}) => {
  const playerName = `PAD205 Roster ${Date.now()}`;

  // --- The coach adds a player (roster row, no club row) -------------------
  await openPlayers(page);
  await page.getByRole("button", { name: /add player/i }).first().click();
  await page.getByPlaceholder("e.g. John Doe").fill(playerName);

  const createBtn = page.getByRole("button", { name: /create player/i });
  await expect(createBtn).toBeEnabled({ timeout: 5000 });
  await createBtn.click();

  // Confirm the player actually exists before blaming messaging for its absence.
  await page.getByPlaceholder(/search/i).first().fill(playerName);
  await expect(page.getByText(playerName)).toBeVisible({ timeout: 8000 });

  // --- They appear in the new-conversation picker --------------------------
  await openMessages(page);
  await Promise.all([
    page.waitForResponse(
      (r) => /\/api\/app\/messageable-users/.test(r.url()) && r.status() === 200,
      { timeout: 10_000 }
    ),
    page.getByRole("button", { name: /new conversation/i }).click(),
  ]);
  await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5000 });

  await page.getByPlaceholder(/search users/i).fill(playerName);
  const pickerEntry = page.getByRole("button", { name: new RegExp(playerName, "i") });
  await expect(pickerEntry).toBeVisible({ timeout: 5000 });

  // --- And the conversation is created, not rejected with 403 --------------
  const [conversationResponse] = await Promise.all([
    page.waitForResponse(
      (r) =>
        /\/api\/app\/conversation(\?|$)/.test(r.url()) &&
        r.request().method() === "POST",
      { timeout: 10_000 }
    ),
    pickerEntry.click(),
  ]);
  expect(conversationResponse.status()).toBeLessThan(400);

  // The thread opens on the new player, ready to type in.
  await expect(page.getByPlaceholder(/type a message/i)).toBeVisible({
    timeout: 8000,
  });
});
