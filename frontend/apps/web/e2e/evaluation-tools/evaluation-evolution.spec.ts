import { test, expect, type APIRequestContext } from "@playwright/test";
import { loginAsCoach, COACH_USERNAME, COACH_PASSWORD } from "../helpers/auth";
import { API_APP, API_AUTH } from "../helpers/api";

// PAD-375 / evaluations.evolution. The server computes every figure (R-048); the arithmetic is
// tested in the backend on fixed datasets. Here: the page RENDERS what the server sent — the spec
// reads the same endpoint and compares, so it holds on any day the seed runs (the seeded history
// hangs off the seed's own "today", and the rolling windows move with it).
// Seed: "E2E Student Two" has five past-dated Forehand (legacy 1-10) evaluations, filed in records.
// Test ids and state attributes only — never rendered copy (B-103).

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

async function coachToken(request: APIRequestContext): Promise<string> {
  const login = await request.post(`${API_AUTH}/login`, { data: { username: COACH_USERNAME, password: COACH_PASSWORD } });
  expect(login.ok()).toBeTruthy();
  const body = await login.json();
  return body.accessToken ?? body.access_token;
}

const oneDecimal = (value: number | null) => (value === null ? "—" : value.toFixed(1));

test("PAD-375: 'Evolução' shows the seeded competency on its own scale, with the server's figures", async ({ page, request }) => {
  const token = await coachToken(request);
  const roster = await (await request.get(`${API_APP}/coach_players`, { headers: bearer(token) })).json();
  const players: { playerId: number | string; name: string }[] = Array.isArray(roster) ? roster : roster.items;
  const student = players.find((p) => p.name === "E2E Student Two");
  expect(student, "E2E Student Two is on the coach's roster").toBeTruthy();
  const playerId = String(student!.playerId);

  const history = await (await request.get(`${API_APP}/player/${playerId}/evaluations`, { headers: bearer(token) })).json();
  expect(history.competenciesWithData.length, "the seed filed past-dated evaluations in records").toBeGreaterThan(0);
  const categoryId: number = history.competenciesWithData[0];
  const evolution = await (
    await request.get(`${API_APP}/player/${playerId}/evaluations/evolution?categoryId=${categoryId}`, { headers: bearer(token) })
  ).json();
  expect(evolution.series.length).toBeGreaterThan(1);

  await loginAsCoach(page);
  await page.goto(`/players/${playerId}`);
  await expect(page.getByTestId("evaluation-card-last")).toBeVisible({ timeout: 10_000 });
  await page.getByTestId("player-evaluations-open").click();
  await expect(page.getByTestId("player-evaluations-drawer")).toBeVisible({ timeout: 10_000 });

  // The first competency with data opens selected — never a hard-coded one.
  await expect(page.getByTestId(`evolution-pill-${categoryId}`)).toHaveAttribute("aria-pressed", "true");

  // The chart is on the competency's OWN scale and holds one point per month the server sent.
  const chart = page.getByTestId("evolution-chart");
  await expect(chart).toBeVisible();
  await expect(chart).toHaveAttribute("data-scale", `${evolution.scaleMin}-${evolution.scaleMax}`);
  await expect(chart).toHaveAttribute("data-points", String(evolution.series.length));

  // The three means and the delta are exactly the server's.
  for (const key of ["m1", "m6", "m12"] as const) {
    await expect(page.getByTestId(`evolution-mean-${key}`)).toHaveAttribute("data-value", oneDecimal(evolution.means[key]));
  }
  const trend = evolution.delta.value > 0 ? "up" : evolution.delta.value < 0 ? "down" : "flat";
  await expect(page.getByTestId("evolution-delta")).toHaveAttribute("data-trend", trend);

  // Every value is reachable without hover: the table of the series is in the page.
  await expect(page.getByTestId("evolution-table").locator("tbody tr")).toHaveCount(evolution.series.length);

  // The history lists what the server lists, and offers "edit" exactly where the server says `editable`
  // (the seeded evaluations are all past-dated). Compared with the read, not with a fixed number, so a
  // spec that rates this player earlier in the same shard cannot turn this one red (R-040).
  await expect(page.getByTestId(/^evaluation-history-card-\d+$/)).toHaveCount(history.records.length);
  const editable = history.records.filter((r: { editable: boolean }) => r.editable).length;
  await expect(page.getByTestId(/^evaluation-history-edit-\d+$/)).toHaveCount(editable);
});
