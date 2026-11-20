import { expect, type APIRequestContext, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { API_APP, API_AUTH } from "./api";
import { COACH_PASSWORD, COACH_USERNAME } from "./auth";
import { completeEmailVerification } from "./emailVerification";
import { openPlayers } from "./navigation";

/**
 * PAD-839 (dashboard.student-setup-guide): helpers for the specs that need a student who has
 * never seen the guide. The E2E seed marks every seeded student's guide hidden, so a seeded
 * student never sees the sheet; these specs sign up a fresh student through a coach's join link
 * (players.join-token), which is also the path rule 3.4 describes.
 */

export const GUIDE_STUDENT_PASSWORD = "Segura1234";

const JOIN_URL = /\/join\/coach\/[A-Za-z0-9_-]+$/;

export const stamp = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

/**
 * If the setup guide's sheet is open, press "Não mostrar mais" and wait for it to go. Not wired
 * into other specs; a spec that logs in a fresh student and does not care about the guide can
 * call it before it starts.
 */
export async function dismissSetupGuide(page: Page, { timeout = 10_000 }: { timeout?: number } = {}) {
  const sheet = page.getByTestId("setup-guide-sheet");
  // The sheet opens only once the guide's sources have answered (rule 3a), so wait for it rather
  // than checking once; a student whose guide is already hidden simply never shows it.
  const opened = await sheet.waitFor({ state: "visible", timeout }).then(() => true, () => false);
  if (!opened) return;
  await page.getByTestId("setup-guide-hide").click();
  await expect(sheet).toBeHidden({ timeout: 10_000 });
}

/** Opens "Add by QR" on the coach's players page and returns the join path (copy of join-by-qr.spec.ts). */
export async function readJoinPath(coachPage: Page): Promise<string> {
  await openPlayers(coachPage);
  await coachPage.getByTestId("players-add-by-qr").click();
  const url = coachPage.getByTestId("add-by-qr-url");
  const live = coachPage.getByTestId("add-by-qr-live");
  await expect(url.or(live)).toBeVisible({ timeout: 10_000 });
  if (await live.isVisible()) await coachPage.getByTestId("add-by-qr-new").click();
  await expect(url).toHaveValue(JOIN_URL, { timeout: 10_000 });
  const value = await url.inputValue();
  await coachPage.keyboard.press("Escape");
  return new URL(value).pathname;
}

export type JoinedStudent = {
  context: BrowserContext;
  page: Page;
  username: string;
  name: string;
  token: string;
};

/**
 * A new student signs up through the coach's join link and confirms it: signed in, linked to the
 * coach (no level, no side yet), guide never seen. `coachPage` must be signed in as the coach.
 * `prepare` runs on the new context before any page loads (init scripts, permissions).
 */
export async function signUpStudentByJoinLink(
  browser: Browser,
  coachPage: Page,
  prepare?: (context: BrowserContext) => Promise<void>,
): Promise<JoinedStudent> {
  const joinPath = await readJoinPath(coachPage);

  const context = await browser.newContext();
  if (prepare) await prepare(context);
  const page = await context.newPage();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(joinPath);
  await expect(page.getByTestId("join-coach-signed-out")).toBeVisible({ timeout: 10_000 });
  await page.getByTestId("join-coach-create-account").click();
  await expect(page).toHaveURL(/\/signup$/);

  const username = `e2e-guide-${stamp()}`;
  const name = `E2E Guide ${username}`;
  await page.getByTestId("signup-role-student").click();
  await page.locator("#signup-name").fill(name);
  await page.locator("#signup-username").fill(username);
  await page.locator("#signup-email").fill(`${username}@example.com`);
  await page.locator("#signup-password").fill(GUIDE_STUDENT_PASSWORD);
  await page.locator("#signup-repeatPassword").fill(GUIDE_STUDENT_PASSWORD);
  await page.locator("#signup-birthDate").fill("2000-01-01");
  await page.getByTestId("signup-terms").click();
  await page.getByTestId("signup-submit").click();
  await completeEmailVerification(page);

  await expect(page).toHaveURL(new RegExp(`${joinPath}$`), { timeout: 15_000 });
  await expect(page.getByTestId("join-coach-preview")).toBeVisible({ timeout: 10_000 });
  await page.getByTestId("join-coach-confirm").click();
  await expect(page.getByTestId("join-coach-success")).toBeVisible({ timeout: 10_000 });

  const token = await apiLogin(page.request, username, GUIDE_STUDENT_PASSWORD);
  return { context, page, username, name, token };
}

export async function apiLogin(request: APIRequestContext, username: string, password: string): Promise<string> {
  const res = await request.post(`${API_AUTH}/login`, { data: { username, password } });
  expect(res.ok(), `login failed for ${username}: ${res.status()}`).toBeTruthy();
  const body = await res.json();
  return (body.accessToken ?? body.access_token) as string;
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

/** The same student signed in on a second device: a new context with its own session. */
export async function signInOnSecondDevice(
  browser: Browser,
  username: string,
  prepare?: (context: BrowserContext) => Promise<void>,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext();
  if (prepare) await prepare(context);
  const page = await context.newPage();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/auth");
  await page.locator("#username").fill(username);
  await page.locator("#password").fill(GUIDE_STUDENT_PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.startsWith("/auth"), { timeout: 15_000 });
  return { context, page };
}

export type GuideBlocker = {
  id: number;
  scheduleId: string | null;
  title: string | null;
  startTime: string;
  endTime: string;
  type: string;
  blocksAutoInvitations: boolean;
  recurrenceRule: { frequency?: string; daysOfWeek?: number[] } | null;
};

export async function listBlockers(request: APIRequestContext, token: string): Promise<GuideBlocker[]> {
  const res = await request.get(`${API_APP}/availability_blockers`, { headers: bearer(token) });
  expect(res.status(), "GET /availability_blockers").toBe(200);
  return (await res.json()) as GuideBlocker[];
}

export async function getMe(request: APIRequestContext, token: string) {
  const res = await request.get(`${API_AUTH}/me`, { headers: bearer(token) });
  expect(res.status(), "GET /auth/me").toBe(200);
  return (await res.json()) as { setupGuide: { hidden: boolean; readyClosed: boolean } } & Record<string, unknown>;
}

/**
 * The coach (e2e-coach) gives the student a level and a side, so step 5 ("profile") is done.
 * Same API the players page uses (POST /app/edit_player); the route pins the coach to the JWT.
 */
export async function coachSetsLevelAndSide(request: APIRequestContext, studentUsername: string) {
  const coachToken = await apiLogin(request, COACH_USERNAME, COACH_PASSWORD);
  const headers = bearer(coachToken);
  const roster = (await (await request.get(`${API_APP}/coach_players`, { headers })).json()) as Array<{
    username: string;
    playerId: number | string;
  }>;
  const player = roster.find((p) => p.username === studentUsername);
  expect(player, `${studentUsername} is on the coach's roster`).toBeTruthy();
  const levels = (await (await request.get(`${API_APP}/coach_levels`, { headers })).json()) as Array<{ id: number; code: string }>;
  expect(levels.length, "the coach has levels").toBeGreaterThan(0);
  const res = await request.post(`${API_APP}/edit_player`, {
    headers,
    data: {
      player: { playerId: player!.playerId },
      updates: { levelId: String(levels[0].id), side: "right" },
    },
  });
  expect(res.ok(), `edit_player: ${res.status()}`).toBeTruthy();
}
