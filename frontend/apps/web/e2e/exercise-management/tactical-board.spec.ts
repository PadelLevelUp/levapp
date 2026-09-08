import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { loginAsCoach, COACH_USERNAME, COACH_PASSWORD } from "../helpers/auth";
import { openExercises } from "../helpers/navigation";
import { API_APP, API_AUTH } from "../helpers/api";

// training.tactical-board (PAD-242, wave 1): the Quadro Tático inside the exercise form.
// Mirrored on iOS by apps/mobile/.maestro/flows/28-tactical-board.yaml.

async function getToken(request: APIRequestContext, username: string, password: string) {
  const res = await request.post(`${API_AUTH}/login`, { data: { username, password } });
  expect(res.ok(), `login failed for ${username}: ${res.status()}`).toBeTruthy();
  const json = await res.json();
  return (json.accessToken ?? json.access_token) as string;
}

/** The stored v2 shape, as far as these tests read it. */
interface StoredDiagram {
  version?: number;
  mode?: string;
  pieces: Array<{ kind: string }>;
  steps: Array<{ ball: { style: string } }>;
}

/** Tap the court at a percent position of the playing surface. */
async function tapCourt(page: Page, xPct: number, yPct: number) {
  const court = page.getByTestId("court-surface");
  const box = await court.boundingBox();
  if (!box) throw new Error("court-surface has no bounding box");
  await court.click({ position: { x: (box.width * xPct) / 100, y: (box.height * yPct) / 100 } });
}

async function openNewExercise(page: Page, name: string) {
  await page.getByRole("button", { name: /new exercise|\+/i }).first().click();
  const nameInput = page.getByRole("textbox", { name: /name/i }).first();
  await expect(nameInput).toBeVisible({ timeout: 5000 });
  await nameInput.fill(name);
}

test.beforeEach(async ({ page }) => {
  await loginAsCoach(page);
  await openExercises(page);
});

test("US-60: a new exercise opens the tactical board in game mode with the 2v2", async ({ page }) => {
  await openNewExercise(page, "Board Default");
  await expect(page.getByRole("tab", { name: /game situations/i })).toHaveAttribute("aria-selected", "true");
  for (const label of ["A1", "A2", "B1", "B2"]) {
    await expect(page.getByTestId("court-surface").getByText(label, { exact: true })).toBeVisible();
  }
  await expect(page.getByRole("radio", { name: /^select$/i })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByText(/tap a piece to select it/i)).toBeVisible();
});

test("US-61: coach draws a lob ball path and it survives save and reopen", async ({ page, request }) => {
  await openNewExercise(page, "Lob Drill");
  await page.getByRole("radio", { name: /^ball$/i }).click();
  await expect(page.getByText(/draw the ball's path/i)).toBeVisible();
  await tapCourt(page, 58, 20);
  await tapCourt(page, 40, 80);
  await expect(page.getByTestId("ball-path")).toBeVisible();
  await expect(page.getByTestId("ball-path")).not.toHaveAttribute("d", /Q/);
  await page.getByTestId("ball-style-handle").click();
  await expect(page.getByTestId("ball-path")).toHaveAttribute("d", /Q/);

  await page.getByRole("button", { name: /create exercise|save/i }).last().click();
  await expect(page.getByText("Lob Drill")).toBeVisible({ timeout: 5000 });
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // The stored diagram is v2 with one lob step.
  const token = await getToken(request, COACH_USERNAME, COACH_PASSWORD);
  const res = await request.get(`${API_APP}/exercises`, { headers: { Authorization: `Bearer ${token}` } });
  expect(res.ok()).toBeTruthy();
  const list = (await res.json()) as Array<{ name: string; diagram?: StoredDiagram }>;
  const saved = list.find((e) => e.name === "Lob Drill");
  expect(saved?.diagram?.version).toBe(2);
  expect(saved?.diagram?.mode).toBe("game");
  expect(saved?.diagram?.pieces).toHaveLength(4);
  expect(saved?.diagram?.steps).toHaveLength(1);
  expect(saved?.diagram?.steps[0].ball.style).toBe("lob");

  // Reopen: the lob is still drawn.
  await page.getByRole("heading", { name: "Lob Drill" }).click();
  await expect(page.getByTestId("ball-path")).toHaveAttribute("d", /Q/, { timeout: 5000 });
});

test("US-62: a legacy diagram is upgraded on open and saved back as v2", async ({ page, request }) => {
  const token = await getToken(request, COACH_USERNAME, COACH_PASSWORD);
  const create = await request.post(`${API_APP}/exercises`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      name: "Legacy Diagram",
      type: "attack",
      difficulty: 2,
      levelIds: [],
      diagram: {
        elements: [
          { id: "e1", type: "player_1", x: 80, y: 140 },
          { id: "e2", type: "player_3", x: 80, y: 380 },
          { id: "e3", type: "coach", x: 140, y: 260 },
          { id: "e4", type: "blocker", x: 100, y: 100 },
          { id: "e5", type: "arrow", x: 80, y: 140, endX: 80, endY: 380, curve: 30 },
        ],
      },
    },
  });
  expect(create.ok(), `create failed: ${create.status()}`).toBeTruthy();
  const created = (await create.json()) as { id: string };

  await page.reload();
  await page.getByRole("heading", { name: "Legacy Diagram" }).click();
  const court = page.getByTestId("court-surface");
  await expect(court).toBeVisible({ timeout: 5000 });
  await expect(court.getByText("A1", { exact: true })).toBeVisible();
  await expect(court.getByText("B1", { exact: true })).toBeVisible();
  await expect(page.getByTestId("piece-e3")).toBeVisible(); // the coach became the feeder
  await expect(page.getByTestId("piece-e4")).toHaveCount(0); // the blocker is gone
  await expect(page.getByTestId("ball-path")).toHaveAttribute("d", /Q/);

  await page.getByRole("button", { name: /save|update/i }).last().click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  const res = await request.get(`${API_APP}/exercises/${created.id}`, { headers: { Authorization: `Bearer ${token}` } });
  expect(res.ok()).toBeTruthy();
  const saved = (await res.json()) as { diagram?: StoredDiagram };
  expect(saved.diagram?.version).toBe(2);
  expect(saved.diagram?.mode).toBe("basket");
  expect(saved.diagram?.pieces.map((p) => p.kind).sort()).toEqual(["feeder", "player", "player"]);
  expect(saved.diagram?.steps[0].ball.style).toBe("lob");
});

test("US-63: undo removes the last placed cone", async ({ page }) => {
  await openNewExercise(page, "Undo Cone");
  await page.getByRole("radio", { name: /^cone$/i }).click();
  await tapCourt(page, 50, 40);
  await expect(page.getByTestId(/^piece-cone/)).toHaveCount(1);
  await page.getByRole("button", { name: /^undo$/i }).click();
  await expect(page.getByTestId(/^piece-cone/)).toHaveCount(0);
});

// ── Wave 2 — Exercícios de cesto (PAD-243) ───────────────────────────────────

test("US-64: basket mode feeds from the feeder and is stored as mode basket", async ({ page, request }) => {
  await openNewExercise(page, "Basket Feed");
  await page.getByRole("tab", { name: /basket drills/i }).click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(page.getByRole("tab", { name: /basket drills/i })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("piece-feeder")).toBeVisible();
  await expect(page.getByTestId("court-surface").getByText("B1", { exact: true })).toHaveCount(0);

  await page.getByRole("radio", { name: /^ball$/i }).click();
  await tapCourt(page, 30, 18);
  await expect(page.getByTestId("ball-path")).toBeVisible();

  await page.getByRole("button", { name: /create exercise|save/i }).last().click();
  await expect(page.getByText("Basket Feed")).toBeVisible({ timeout: 5000 });
  await expect(page.getByRole("dialog")).toHaveCount(0);

  const token = await getToken(request, COACH_USERNAME, COACH_PASSWORD);
  const res = await request.get(`${API_APP}/exercises`, { headers: { Authorization: `Bearer ${token}` } });
  const list = (await res.json()) as Array<{ name: string; diagram?: StoredDiagram & { steps: Array<{ ball: { from: { x: number; y: number } } }> } }>;
  const saved = list.find((e) => e.name === "Basket Feed");
  expect(saved?.diagram?.mode).toBe("basket");
  expect(saved?.diagram?.steps[0].ball.from).toEqual({ x: 46, y: 55 });
});

test("US-65: adding players in basket mode stops at four", async ({ page }) => {
  await openNewExercise(page, "Basket Four");
  await page.getByRole("tab", { name: /basket drills/i }).click();
  const add = page.getByRole("button", { name: /add players/i });
  await add.click();
  await add.click();
  const court = page.getByTestId("court-surface");
  await expect(court.getByText("A3", { exact: true })).toBeVisible();
  await expect(court.getByText("A4", { exact: true })).toBeVisible();
  await expect(add).toBeDisabled();
});

test("US-66: switching mode on a board with content asks first", async ({ page }) => {
  await openNewExercise(page, "Switch Guard");
  await page.getByRole("radio", { name: /^cone$/i }).click();
  await tapCourt(page, 50, 40);
  await page.getByRole("tab", { name: /basket drills/i }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("alertdialog").getByRole("button", { name: /^switch$/i }).click();
  await expect(page.getByTestId("piece-feeder")).toBeVisible();
  await expect(page.getByTestId(/^piece-cone/)).toHaveCount(0);
});
