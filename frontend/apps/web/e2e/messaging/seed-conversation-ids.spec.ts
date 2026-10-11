/**
 * B-505 — the E2E seed's conversation ids are a contract. Thirteen Maestro flows and setup scripts
 * (09, 17, 19, 36, 47, 103, 122, 240, first-unread, thread-target, warm-push, record-layout, pad569)
 * address "conversation 1" as e2e-coach ↔ e2e-student. PAD-620's seed change created the coach ↔
 * filler chats first, and conversation 1 silently became coach ↔ filler-player-06: flow 240 went red
 * on the iOS gate, and the Android smoke flow 36 passed on the wrong thread. This spec makes the next
 * seed change fail here, in one place. It is in the PR smoke set, which runs on every seed change.
 * API only: nothing rendered, nothing written (R-040).
 */
import { test, expect, type APIRequestContext } from "@playwright/test";
import { API_APP, API_AUTH } from "../helpers/api";

async function token(request: APIRequestContext, username: string, password: string): Promise<string> {
  const res = await request.post(`${API_AUTH}/login`, { data: { username, password } });
  expect(res.ok(), `login failed for ${username}: ${res.status()}`).toBeTruthy();
  const json = await res.json();
  return (json.accessToken ?? json.access_token) as string;
}

test("B-505: seeded conversation 1 is e2e-coach ↔ e2e-student", async ({ request }) => {
  for (const [username, password] of [
    ["e2e-student", "E2eStudent123!"],
    ["e2e-coach", "E2eCoach123!"],
  ] as const) {
    const auth = { Authorization: `Bearer ${await token(request, username, password)}` };
    const res = await request.get(`${API_APP}/conversation/1?limit=1`, { headers: auth });
    expect(res.status(), `${username} must be a participant of conversation 1`).toBe(200);
  }
});
