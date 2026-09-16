import { test, expect, type Page } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { openExercises } from "../helpers/navigation";

// PAD-311 / training.tactical-board rule 26: actions play in the order they were
// drawn. Ball → A1 moves → ball: the court numbers them 1, 2, 3, and AUTO plays
// the ball before A1 leaves. Played at Lento (rule 25) so each 800 ms moment
// lasts 1600 ms and the checks have wide windows.

async function tapCourt(page: Page, xPct: number, yPct: number) {
  const court = page.getByTestId("court-surface");
  const box = await court.boundingBox();
  if (!box) throw new Error("court-surface has no bounding box");
  await court.click({ position: { x: (box.width * xPct) / 100, y: (box.height * yPct) / 100 } });
}

test("PAD-311: the ball plays before the player moves, and the court numbers the actions in order", async ({ page }) => {
  await loginAsCoach(page);
  await openExercises(page);
  await page.getByRole("button", { name: /new exercise|novo exercício|\+/i }).first().click();
  await expect(page.getByTestId("tactical-board")).toBeVisible({ timeout: 5000 });

  await page.getByTestId("board-tool-ball").click();
  await tapCourt(page, 58, 20);
  await tapCourt(page, 50, 50);
  await page.getByTestId("board-tool-movement").click();
  await page.getByTestId("piece-a1").click();
  await tapCourt(page, 50, 50);
  await page.getByTestId("board-tool-ball").click();
  await tapCourt(page, 50, 50);
  await tapCourt(page, 40, 80);

  await expect(page.getByTestId("ball-number-0")).toHaveText("1");
  await expect(page.getByTestId("movement-order-a1")).toHaveText("2");
  await expect(page.getByTestId("ball-number-1")).toHaveText("3");

  const a1 = page.getByTestId("piece-a1");
  const start = await a1.getAttribute("transform");
  await page.getByTestId("board-speed-slow").click();
  await page.getByTestId("board-auto").click();
  const started = Date.now();

  // Moment 1 (0–1600 ms at Lento): the ball travels, A1 waits.
  await page.waitForTimeout(700);
  await expect(page.getByTestId("playback-ball")).toBeVisible();
  expect(Date.now() - started, "still inside moment 1").toBeLessThan(1500);
  expect(await a1.getAttribute("transform")).toBe(start);

  // Moment 2 (1600–3200 ms): A1 has left its start.
  await expect.poll(async () => a1.getAttribute("transform"), { timeout: 4000 }).not.toBe(start);
  expect(Date.now() - started, "A1 moved only after the first ball path").toBeGreaterThanOrEqual(1500);
});
