import { test, expect, type Page } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { completeEmailVerification } from "../helpers/emailVerification";
import { openDashboard, openPlayers } from "../helpers/navigation";
import { ui } from "../helpers/i18n";

/**
 * dashboard.profile-completeness (PAD-486, PAD-490).
 *
 * The one path that makes an incomplete link today: a student joins the coach by link, so the
 * link has neither level nor side (players.join-token). The student's dashboard then explains
 * what that costs and offers a once-a-day reminder; the coach's dashboard lists the student,
 * and a tap opens them. Asserted by test id; copy only through `ui()`.
 */

const stamp = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
const PASSWORD = "Segura1234";

async function readJoinPath(page: Page): Promise<string> {
  await openPlayers(page);
  await page.getByTestId("players-add-by-qr").click();
  const url = page.getByTestId("add-by-qr-url");
  const live = page.getByTestId("add-by-qr-live");
  await expect(url.or(live)).toBeVisible({ timeout: 10_000 });
  if (await live.isVisible()) await page.getByTestId("add-by-qr-new").click();
  await expect(url).toHaveValue(/\/join\/coach\/[A-Za-z0-9_-]+$/, { timeout: 10_000 });
  const value = await url.inputValue();
  await page.keyboard.press("Escape");
  return new URL(value).pathname;
}

test("PAD-486/490: a student who joined by link is told why, reminds the coach once, and the coach sees them", async ({
  browser,
  page,
}) => {
  await loginAsCoach(page);
  const joinPath = await readJoinPath(page);

  const context = await browser.newContext();
  const student = await context.newPage();
  await student.emulateMedia({ reducedMotion: "reduce" });
  await student.goto(joinPath);
  await expect(student.getByTestId("join-coach-signed-out")).toBeVisible({ timeout: 10_000 });
  await student.getByTestId("join-coach-create-account").click();
  const username = `e2e-p486-${stamp()}`;
  const name = `E2E P486 ${username}`;
  await student.getByTestId("signup-role-student").click();
  await student.locator("#signup-name").fill(name);
  await student.locator("#signup-username").fill(username);
  await student.locator("#signup-email").fill(`${username}@example.com`);
  await student.locator("#signup-password").fill(PASSWORD);
  await student.locator("#signup-repeatPassword").fill(PASSWORD);
  await student.locator("#signup-birthDate").fill("2000-01-01");
  await student.getByTestId("signup-submit").click();
  await completeEmailVerification(student);
  await expect(student.getByTestId("join-coach-preview")).toBeVisible({ timeout: 15_000 });
  await student.getByTestId("join-coach-confirm").click();
  await expect(student.getByTestId("join-coach-success")).toBeVisible({ timeout: 10_000 });

  // ── the student (PAD-490) ──
  await openDashboard(student);
  await expect(student.getByTestId("dashboard-profile-incomplete")).toBeVisible({ timeout: 10_000 });
  const remind = student.locator('[data-testid^="profile-incomplete-remind-"]').first();
  await expect(remind).toHaveAttribute("data-reminded", "false");
  await expect(remind).toHaveText(ui("dashboard.profileCompleteness.remind"));
  await Promise.all([
    student.waitForResponse((r) => /\/api\/app\/profile-reminder$/.test(r.url()) && r.status() === 200),
    remind.click(),
  ]);
  await expect(remind).toHaveAttribute("data-reminded", "true");
  await expect(remind).toBeDisabled();
  await expect(remind).toHaveText(ui("dashboard.profileCompleteness.reminded"));

  // A reload reads `remindedToday` from the server: still sent, still disabled.
  await student.reload();
  const again = student.locator('[data-testid^="profile-incomplete-remind-"]').first();
  await expect(again).toHaveAttribute("data-reminded", "true", { timeout: 10_000 });
  await context.close();

  // ── the coach (PAD-486) ──
  await openDashboard(page);
  const block = page.getByTestId("dashboard-incomplete-players");
  await expect(block).toBeVisible({ timeout: 10_000 });
  const row = block.locator('[data-testid^="dashboard-incomplete-player-"]', { hasText: name });
  // The block lists five names; when the seed already holds five incomplete links the newest
  // student may be past them, and "See all" carries the filter instead.
  if (await row.count()) {
    await row.click();
    await expect(page).toHaveURL(/\/players\/\d+$/);
  } else {
    await block.getByTestId("dashboard-incomplete-players-see-all").click();
    await expect(page).toHaveURL(/\/players\?missing_(level|side)=true$/);
  }
});
