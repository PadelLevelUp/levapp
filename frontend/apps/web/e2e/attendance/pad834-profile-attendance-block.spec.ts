import { test, expect, type APIRequestContext } from "@playwright/test";
import { loginAsCoach, COACH_USERNAME, COACH_PASSWORD, STUDENT_USERNAME } from "../helpers/auth";
import { API_APP, API_AUTH } from "../helpers/api";
import { clickPlayerCard } from "../helpers/players";
import { openProfileList } from "../helpers/profileAttendance";

// players.profile rule 12 (PAD-834): Block 3, Assiduidade — one period for both cards, totals equal to
// the server's for that period, the list in place with no navigation, and empty cards with disabled
// toggles. By test id and data attributes, never copy.

async function coachToken(request: APIRequestContext): Promise<string> {
  const login = await request.post(`${API_AUTH}/login`, { data: { username: COACH_USERNAME, password: COACH_PASSWORD } });
  expect(login.ok()).toBeTruthy();
  const body = await login.json();
  return body.accessToken ?? body.access_token;
}
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

test("[PLAYERS-PROFILE-18] one period for both cards, the list opens in place, empty disables", async ({ page, request }) => {
  const token = await coachToken(request);
  await loginAsCoach(page);
  await page.goto("/players");
  await page.getByPlaceholder(/search/i).first().fill("E2E Student");
  await clickPlayerCard(page, STUDENT_USERNAME);
  await page.waitForURL(/\/players\/\d+$/, { timeout: 15_000 });
  const url = page.url();
  const playerId = new URL(url).pathname.split("/").pop();

  // The default period is the month, pressed on both cards' shared chips.
  await expect(page.getByTestId("profile-period-1m")).toHaveAttribute("aria-pressed", "true", { timeout: 15_000 });
  // Let the initial reads land before arming any waiter (data-total appears with the first
  // answer): the block fetches only when the period CHANGES, so a click on the chip that is
  // already pressed sends nothing, and a waiter armed over the initial reads would otherwise
  // catch those instead (PR #996's subset timed out 180 s on the already-pressed month).
  await expect(page.getByTestId("profile-attendance-card")).toHaveAttribute("data-total", /^\d+$/, { timeout: 15_000 });
  await expect(page.getByTestId("profile-absences-card")).toHaveAttribute("data-total", /^\d+$/, { timeout: 15_000 });

  // Each card's total is the server's for the same period: away from the default, then back.
  for (const period of ["1y", "1m"] as const) {
    const answers = Promise.all([
      page.waitForResponse((r) => /\/attendance_history/.test(r.url()) && r.status() === 200),
      page.waitForResponse((r) => /\/absence_history/.test(r.url()) && r.status() === 200),
    ]);
    await page.getByTestId(`profile-period-${period}`).click();
    const [att, abs] = await answers;
    const presences = (await att.json()).total;
    const absences = (await abs.json()).total;
    await expect(page.getByTestId("profile-attendance-card")).toHaveAttribute("data-total", String(presences));
    await expect(page.getByTestId("profile-absences-card")).toHaveAttribute("data-total", String(absences));
    // Both requests asked for the same range.
    expect(new URL(att.url()).searchParams.get("from")).toBe(new URL(abs.url()).searchParams.get("from"));
  }

  // The list opens inside the card: as many rows as the total, and the URL has not changed.
  const { total } = await openProfileList(page, "attendance");
  await expect(page.getByTestId("profile-attendance-history-item")).toHaveCount(total);
  expect(page.url()).toBe(url);

  // A player with no presence and no absence: both cards are empty and both toggles disabled.
  const created = await request.post(`${API_APP}/add_player`, { headers: bearer(token), data: { name: `E2E Empty ${Date.now()}` } });
  expect(created.ok()).toBeTruthy();
  const emptyId = String((await created.json()).playerId);
  try {
    await page.goto(`/players/${emptyId}`);
    await expect(page.getByTestId("profile-attendance-card")).toHaveAttribute("data-total", "0", { timeout: 15_000 });
    await expect(page.getByTestId("profile-absences-card")).toHaveAttribute("data-total", "0");
    await expect(page.getByTestId("profile-attendance-toggle")).toBeDisabled();
    await expect(page.getByTestId("profile-absences-toggle")).toBeDisabled();
  } finally {
    await request.post(`${API_APP}/remove_player`, { headers: bearer(token), data: { playerId: emptyId, action: "delete" } });
  }
  expect(playerId).toBeTruthy();
});
