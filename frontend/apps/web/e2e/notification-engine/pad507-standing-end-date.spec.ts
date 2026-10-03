/**
 * PAD-507 (notifications.waiting-list rule 2): a standing waiting-list entry runs to an end date the
 * coach picks — a preset or any date, at most 12 months ahead — and can be renewed; never "forever".
 * Owner decision 2026-10-03.
 *
 * Seeds nothing shared: one filler player, removed in `finally`. Located by test id.
 */
import { test, expect, type APIRequestContext } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { API_APP, API_AUTH } from "../helpers/api";

const PLAYER = "Filler Player 07";

async function coachHeaders(request: APIRequestContext) {
  const res = await request.post(`${API_AUTH}/login`, { data: { username: "e2e-coach", password: "E2eCoach123!" } });
  const json = await res.json();
  return { Authorization: `Bearer ${(json.accessToken ?? json.access_token) as string}` };
}

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

test("PAD-507: the coach adds a player to a custom end date, then renews to twelve months", async ({ page, request }) => {
  const headers = await coachHeaders(request);
  const players = (await (await request.get(`${API_APP}/players`, { headers })).json()) as Array<{ id: number; name: string }>;
  const player = players.find((p) => p.name === PLAYER);
  expect(player, `${PLAYER} must exist in the seed`).toBeDefined();

  const custom = new Date();
  custom.setDate(custom.getDate() + 40);
  const twelve = new Date();
  twelve.setMonth(twelve.getMonth() + 12);
  let entryId: number | null = null;
  try {
    await loginAsCoach(page);
    await page.goto(`/players/${player!.id}`);
    await page.getByTestId("player-waiting-list").click();
    const dialog = page.getByTestId("standing-wl-dialog");
    await expect(dialog).toBeVisible();

    // A date beyond 12 months is refused before anything is sent.
    const end = dialog.getByTestId("standing-wl-end-date");
    const beyond = new Date(twelve);
    beyond.setDate(beyond.getDate() + 1);
    await end.fill(iso(beyond));
    await expect(end).toHaveAttribute("aria-invalid", "true");
    await expect(dialog.getByTestId("standing-wl-confirm")).toBeDisabled();

    // A custom date inside the window is sent as the end date.
    await end.fill(iso(custom));
    const added = page.waitForRequest((r) => r.method() === "POST" && /\/notify\/standing_waiting_list$/.test(r.url()));
    await dialog.getByTestId("standing-wl-confirm").click();
    expect((await added).postDataJSON().expiresOn).toBe(iso(custom));
    const renew = page.getByTestId("player-waiting-list-renew");
    await expect(renew).toBeVisible();
    entryId = ((await (await request.get(`${API_APP}/notify/standing_waiting_list`, { headers })).json()) as Array<{
      id: number;
      playerId: number;
      expiresOn: string;
    }>).find((e) => e.playerId === player!.id)!.id;

    // Renewing moves the end date to the twelve-month preset; the credits stay.
    await renew.click();
    await expect(dialog).toBeVisible();
    await dialog.getByTestId("standing-wl-preset-12m").click();
    await expect(dialog.getByTestId("standing-wl-end-date")).toHaveValue(iso(twelve));
    const renewed = page.waitForRequest((r) => r.method() === "PATCH" && r.url().endsWith(`/notify/standing_waiting_list/${entryId}`));
    await dialog.getByTestId("standing-wl-confirm").click();
    expect((await renewed).postDataJSON()).toEqual({ expiresOn: iso(twelve) });
    const after = ((await (await request.get(`${API_APP}/notify/standing_waiting_list`, { headers })).json()) as Array<{
      id: number;
      expiresOn: string;
      creditsTotal: number;
    }>).find((e) => e.id === entryId)!;
    expect([after.expiresOn, after.creditsTotal]).toEqual([iso(twelve), 3]);
    await expect(renew).toContainText(String(twelve.getFullYear()));
  } finally {
    if (entryId !== null) {
      await request.delete(`${API_APP}/notify/standing_waiting_list/${entryId}`, { headers }).catch(() => null);
    }
  }
});
