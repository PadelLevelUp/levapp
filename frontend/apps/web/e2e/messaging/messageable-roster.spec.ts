import { test, expect, type APIRequestContext } from "@playwright/test";
import { loginAsCoach, COACH_USERNAME, COACH_PASSWORD } from "../helpers/auth";
import { API_APP, API_AUTH } from "../helpers/api";
import { openMessages } from "../helpers/navigation";

// PAD-205 / B-025 — a coach must be able to message a player they added
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

// PAD-452 (B-179): the player is chosen at run time, not fixed. Every spec that messages a filler
// or cancels a class they are in opens a conversation with them, and NewConversationDialog hides
// anyone the coach already talks to, so a fixed "Filler Player 27" was pickable only while no
// earlier spec had touched them. Any active seeded "Filler Player NN" the coach has no
// conversation with has exactly the properties below.
async function coachHeaders(request: APIRequestContext) {
  const res = await request.post(`${API_AUTH}/login`, {
    data: { username: COACH_USERNAME, password: COACH_PASSWORD },
  });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  return { Authorization: `Bearer ${body.accessToken ?? body.access_token}` };
}

/** Every participant id the coach already has a conversation with (all pages). */
async function existingParticipantIds(request: APIRequestContext, headers: Record<string, string>) {
  const ids = new Set<number>();
  for (let page = 1; page <= 50; page++) {
    const res = await request.get(`${API_APP}/conversations?page=${page}&limit=50`, { headers });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    const items: { participantId: number | null }[] = data.conversations;
    for (const c of items) if (c.participantId != null) ids.add(c.participantId);
    if (!data.hasMore || items.length === 0) break;
  }
  return ids;
}

async function untouchedFiller(request: APIRequestContext) {
  const headers = await coachHeaders(request);
  const users: { id: number; name: string; isActive: boolean }[] = await (
    await request.get(`${API_APP}/messageable-users`, { headers })
  ).json();
  const taken = await existingParticipantIds(request, headers);
  const free = users.find((u) => /^Filler Player \d+$/.test(u.name) && u.isActive && !taken.has(u.id));
  expect(free, "a seeded filler the coach has not messaged yet").toBeTruthy();
  return free!.name;
}

test.beforeEach(async ({ page }) => {
  await loginAsCoach(page);
});

// US-205: A player the coach added in the app is messageable
test("US-205: coach can start a conversation with a roster-only player", async ({
  page,
  request,
}) => {
  // A seeded "Filler Player NN" is active, on e2e-coach's roster through
  // `coach_in_player`, with no `player_in_club` row (the seed writes none); the
  // one picked here also has no conversation with the coach yet — exactly the
  // case B-025 describes. A player
  // created through "Add player" would NOT do here: that user stays
  // `inactive` until they activate their account, and the messageable list
  // has always excluded inactive users because there is no login to message.
  const playerName = await untouchedFiller(request);

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
  // Word boundaries: "Filler Player 2" must not also match "Filler Player 27".
  const pickerEntry = page.getByRole("button", { name: new RegExp(`\\b${playerName}\\b`, "i") });
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
