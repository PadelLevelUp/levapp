import { expect, type Page } from "@playwright/test";
import { API_APP, API_AUTH } from "./api";
import { COACH_PASSWORD, COACH_USERNAME } from "./auth";

/**
 * Pick a player on the Players page by id, never by rendered copy (PAD-410, B-176 family).
 *
 * The roster row carries `player-card-<playerId>`. What it SHOWS changed with PAD-410's
 * master–detail page (initials, name, level and side chips; the email line is gone), so a
 * spec that clicked a row by its text went stale the day the row changed. These helpers
 * resolve the id through the coach's roster API and click the row by its test id.
 */

type Coach = { username: string; password: string };
const DEFAULT_COACH: Coach = { username: COACH_USERNAME, password: COACH_PASSWORD };

/** The seeded player's id and display name, from the coach's own roster. */
export async function lookupPlayer(
  page: Page,
  username: string,
  coach: Coach = DEFAULT_COACH,
): Promise<{ playerId: number; name: string }> {
  const login = await page.request.post(`${API_AUTH}/login`, { data: coach });
  expect(login.ok(), `login failed for ${coach.username}: ${login.status()}`).toBeTruthy();
  const body = await login.json();
  const token = (body.accessToken ?? body.access_token) as string;
  const res = await page.request.get(`${API_APP}/coach_players`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(res.ok(), `coach_players: ${res.status()}`).toBeTruthy();
  const roster = (await res.json()) as Array<{ username: string; playerId: number; name: string }>;
  const player = roster.find((p) => p.username === username);
  expect(player, `${username} is not on ${coach.username}'s roster`).toBeTruthy();
  return { playerId: player!.playerId, name: player!.name };
}

/**
 * Click the player's row on the Players page as it currently is (any search the spec typed is
 * kept). If the row is not on the current page, search by the player's name first. Resolves once
 * the route is the player's.
 */
export async function clickPlayerCard(page: Page, username: string, coach: Coach = DEFAULT_COACH) {
  const { playerId, name } = await lookupPlayer(page, username, coach);
  const card = page.getByTestId(`player-card-${playerId}`);
  try {
    await card.waitFor({ state: "visible", timeout: 5_000 });
  } catch {
    await page.getByTestId("players-search-input").fill(name);
  }
  await expect(card).toBeVisible({ timeout: 10_000 });
  await card.click();
  await page.waitForURL(new RegExp(`/players/${playerId}$`), { timeout: 10_000 });
  return playerId;
}
