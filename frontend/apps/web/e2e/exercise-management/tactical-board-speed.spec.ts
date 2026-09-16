import { test, expect, type Page } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { openExercises } from "../helpers/navigation";

// PAD-310 / training.tactical-board rule 25: AUTO plays at Lento 0.5x, Normal 1x
// or Rápido 2x. Mirrored on iOS by Maestro flow 60. Timing is asserted loosely
// (a one-path step is 800 ms at Normal): Rápido must be done well before Lento.

async function tapCourt(page: Page, xPct: number, yPct: number) {
  const court = page.getByTestId("court-surface");
  const box = await court.boundingBox();
  if (!box) throw new Error("court-surface has no bounding box");
  await court.click({ position: { x: (box.width * xPct) / 100, y: (box.height * yPct) / 100 } });
}

async function playOnceMs(page: Page): Promise<number> {
  const auto = page.getByTestId("board-auto");
  const started = Date.now();
  await auto.click();
  await expect(auto).toHaveAttribute("aria-pressed", "true");
  await expect(auto).toHaveAttribute("aria-pressed", "false", { timeout: 10_000 });
  return Date.now() - started;
}

test("PAD-310: the speed control defaults to Normal and Rápido plays faster than Lento", async ({ page }) => {
  await loginAsCoach(page);
  await openExercises(page);
  await page.getByRole("button", { name: /new exercise|novo exercício|\+/i }).first().click();
  await expect(page.getByTestId("tactical-board")).toBeVisible({ timeout: 5000 });

  await page.getByTestId("board-tool-ball").click();
  await tapCourt(page, 58, 20);
  await tapCourt(page, 40, 80);

  await expect(page.getByTestId("board-speed-normal")).toHaveAttribute("aria-checked", "true");

  await page.getByTestId("board-speed-slow").click();
  await expect(page.getByTestId("board-speed-slow")).toHaveAttribute("aria-checked", "true");
  await expect(page.getByTestId("board-speed-normal")).toHaveAttribute("aria-checked", "false");
  const slow = await playOnceMs(page);

  await page.getByTestId("board-speed-fast").click();
  const fast = await playOnceMs(page);

  expect(slow, `Lento took ${slow} ms`).toBeGreaterThanOrEqual(1500);
  expect(fast, `Rápido took ${fast} ms, Lento ${slow} ms`).toBeLessThan(slow - 600);
});
