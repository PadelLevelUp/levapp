import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { loginAsCoach, COACH_USERNAME, COACH_PASSWORD } from "../helpers/auth";
import { openExercises } from "../helpers/navigation";
import { API_APP, API_AUTH } from "../helpers/api";

// PAD-309 / training.tactical-board rules 10 and 20: a player can follow several
// trajectories in one step. Mirrored on iOS by Maestro flow 59.

async function getToken(request: APIRequestContext) {
  const res = await request.post(`${API_AUTH}/login`, { data: { username: COACH_USERNAME, password: COACH_PASSWORD } });
  expect(res.ok()).toBeTruthy();
  const json = await res.json();
  return (json.accessToken ?? json.access_token) as string;
}

/** Tap the court at a percent position of the playing surface. */
async function tapCourt(page: Page, xPct: number, yPct: number) {
  const court = page.getByTestId("court-surface");
  const box = await court.boundingBox();
  if (!box) throw new Error("court-surface has no bounding box");
  await court.click({ position: { x: (box.width * xPct) / 100, y: (box.height * yPct) / 100 } });
}

/** A piece's rendered position, in view units, to within half a unit. */
async function expectPieceAt(page: Page, pieceId: string, x: number, y: number) {
  await expect
    .poll(async () => {
      const tr = await page.getByTestId(`piece-${pieceId}`).getAttribute("transform");
      const m = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(tr ?? "");
      return !!m && Math.abs(Number(m[1]) - x) < 0.5 && Math.abs(Number(m[2]) - y) < 0.5;
    }, { message: `piece ${pieceId} near (${x}, ${y})` })
    .toBe(true);
}

test("PAD-309: one player draws two trajectories in a step, and they survive save", async ({ page, request }) => {
  const name = `Two Legs ${Date.now().toString().slice(-6)}`;
  await loginAsCoach(page);
  await openExercises(page);
  await page.getByRole("button", { name: /new exercise|novo exercício|\+/i }).first().click();
  await expect(page.getByTestId("tactical-board")).toBeVisible({ timeout: 5000 });
  await page.getByRole("textbox").first().fill(name);

  await page.getByTestId("board-tool-movement").click();
  await page.getByTestId("piece-a1").click();
  await tapCourt(page, 20, 40);
  await tapCourt(page, 10, 60);
  await expect(page.getByTestId("movement-a1")).toBeVisible();
  await expect(page.getByTestId("movement-a1-1")).toBeVisible();
  // The second leg is drawn from where the first ends (20 %, 40 % → 68, 240 in view units).
  await expect(page.getByTestId("movement-a1-1")).toHaveAttribute("d", /^M6[78](\.\d+)?,2(39|40|41)(\.\d+)? L/);

  // Passo ends the step with A1 at its last leg's end (10 %, 60 % → 34, 360).
  await page.getByTestId("board-passo").click();
  await expectPieceAt(page, "a1", 34, 360);

  await page.getByRole("button", { name: /create exercise|criar exercício|save|guardar/i }).last().click();
  await expect(page.getByTestId("tactical-board")).toHaveCount(0, { timeout: 10_000 });
  const token = await getToken(request);
  const res = await request.get(`${API_APP}/exercises`, { headers: { Authorization: `Bearer ${token}` } });
  const list = (await res.json()) as Array<{ name: string; diagram?: { steps: Array<{ movements: Array<{ pieceId: string; to: { x: number; y: number } }> }> } }>;
  const saved = list.find((e) => e.name === name);
  const legs = saved?.diagram?.steps[0].movements ?? [];
  expect(legs.map((m) => m.pieceId)).toEqual(["a1", "a1"]);
  expect(legs[1].to.x).toBeCloseTo(10, 0);
  expect(legs[1].to.y).toBeCloseTo(60, 0);
});
