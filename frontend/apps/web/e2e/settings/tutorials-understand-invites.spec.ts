/**
 * PAD-196 — Settings › Tutorials › "Understand invites" (settings.tutorials,
 * fed by notifications.invite-simulation).
 *
 * The tutorial is a REHEARSAL of the invitation engine: pick a class, pick
 * the student who cancels, read who would be invited right now and why, and
 * look up any single student who is missing. Nothing is sent or placed.
 *
 * Seeded world (e2e/scripts/seed.py): coach `e2e-coach` with levels I1
 * (strongest) and B1; "E2E Academy Class" next Monday 10:00 at level B1 with
 * `E2E Student` (B1, right) enrolled; `E2E Student Two` (B1, left) on the
 * roster but not enrolled; 27 "Filler Player NN" at I1/right; default engine
 * config (auto on, default invitation groups, maxSimultaneous 3).
 *
 * Run:
 *   npx playwright test e2e/settings/tutorials-understand-invites.spec.ts
 */
import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import {
  loginAsCoach,
  loginAsStudent,
  COACH_USERNAME,
  COACH_PASSWORD,
} from "../helpers/auth";
import { openSettings } from "../helpers/navigation";
import { API_ROOT } from "../helpers/api";

const CLASS_TITLE = "E2E Academy Class";
const ENROLLED_STUDENT = "E2E Student";
const FILLER_ABOVE_BAR = "Filler Player 01";

async function getToken(request: APIRequestContext): Promise<string> {
  const res = await request.post(`${API_ROOT}/auth/login`, {
    data: { username: COACH_USERNAME, password: COACH_PASSWORD },
  });
  expect(res.ok(), `login failed: ${res.status()}`).toBeTruthy();
  const json = await res.json();
  return (json.accessToken ?? json.access_token) as string;
}

async function setEligibility(request: APIRequestContext, rules: unknown[] | null) {
  const token = await getToken(request);
  const res = await request.post(`${API_ROOT}/app/notify/config`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { eligibilityRules: rules },
  });
  expect(res.ok(), `config save failed: ${res.status()}`).toBeTruthy();
}

async function openTutorial(page: Page) {
  await openSettings(page);
  await page.getByTestId("settings-nav-tutorials").click();
  await page.getByTestId("tutorial-understand-invites").click();
  await expect(page.getByTestId("tutorial-understand-invites-screen")).toBeVisible();
}

async function pickClassAndPlayer(page: Page) {
  await page.getByRole("button", { name: CLASS_TITLE }).first().click();
  await page.getByRole("button", { name: ENROLLED_STUDENT, exact: true }).click();
  await expect(page.getByTestId("tutorial-results")).toBeVisible({ timeout: 15_000 });
}

test.describe("PAD-196: Settings › Tutorials › Understand invites", () => {
  test("US-196-01: coach sees Tutorials right after Notifications; a student does not", async ({
    page,
  }) => {
    await loginAsCoach(page);
    await openSettings(page);
    const nav = page.getByTestId("settings-nav-tutorials");
    await expect(nav).toBeVisible();
    // Directly after Notifications, on the desktop sidebar.
    const ids = await page
      .locator('[data-testid^="settings-nav-"]')
      .evaluateAll((nodes) => nodes.map((n) => n.getAttribute("data-testid")));
    const notificationsIndex = ids.indexOf("settings-nav-notifications");
    expect(ids[notificationsIndex + 1]).toBe("settings-nav-tutorials");

    await page.context().clearCookies();
    await page.evaluate(() => localStorage.clear());
    await loginAsStudent(page);
    await openSettings(page);
    await expect(page.getByTestId("settings-nav-profile")).toBeVisible();
    await expect(page.getByTestId("settings-nav-tutorials")).toHaveCount(0);
  });

  test("US-196-02: picking a class then a player shows ordered rounds with first-batch badges", async ({
    page,
  }) => {
    await loginAsCoach(page);
    await openTutorial(page);
    await pickClassAndPlayer(page);

    const results = page.getByTestId("tutorial-results");
    await expect(results.getByTestId("tutorial-spot")).toBeVisible();
    await expect(results.getByTestId("tutorial-round-1")).toBeVisible();

    // Round 1 = same level + same side as the spot (B1 / right): only students
    // at B1 playing right or both — the enrolled student is never listed.
    const candidates = results.locator('[data-testid^="tutorial-candidate-"]');
    expect(await candidates.count()).toBeGreaterThan(0);
    await expect(results.getByText(ENROLLED_STUDENT, { exact: true })).toHaveCount(0);

    // The FIRST NON-EMPTY round's first maxSimultaneous (3) candidates are the
    // first batch (what `_send_invitation_batch` sends now); every other
    // candidate, in that round or a later one, waits.
    const rounds = results.locator('[data-testid^="tutorial-round-"]');
    let firstNonEmptySeen = false;
    for (let i = 0; i < (await rounds.count()); i += 1) {
      const round = rounds.nth(i);
      const inRound = await round.locator('[data-testid^="tutorial-candidate-"]').count();
      const firstBatch = await round.getByTestId("tutorial-send-status-first_batch").count();
      const queued = await round.getByTestId("tutorial-send-status-queued").count();
      if (inRound === 0) {
        await expect(round).toContainText(/Nobody matches|Nenhum aluno cumpre/);
        continue;
      }
      if (!firstNonEmptySeen) {
        firstNonEmptySeen = true;
        expect(firstBatch).toBe(Math.min(3, inRound));
        expect(queued).toBe(inRound - firstBatch);
        // Ranks count from 1 within the round.
        await expect(round.locator('[data-testid^="tutorial-candidate-"]').first()).toContainText("#1");
      } else {
        expect(firstBatch).toBe(0);
        expect(queued).toBe(inRound);
      }
    }
    expect(firstNonEmptySeen).toBe(true);
  });

  test("US-196-03: the lookup explains a student below the bar with the failed rule", async ({
    page,
    request,
  }) => {
    await setEligibility(request, [{ attribute: "level", operation: "same_as_class" }]);
    try {
      await loginAsCoach(page);
      await openTutorial(page);
      await pickClassAndPlayer(page);

      await page.getByTestId("tutorial-lookup-input").fill(FILLER_ABOVE_BAR);
      // Scoped to the lookup: a same-named button can exist in the player
      // picker when an earlier spec enrolled that student.
      await page
        .getByTestId("tutorial-lookup")
        .getByRole("button", { name: FILLER_ABOVE_BAR, exact: true })
        .click();

      const verdict = page.getByTestId("tutorial-verdict");
      await expect(verdict).toBeVisible();
      await expect(verdict.getByTestId("tutorial-verdict-stage-eligibility")).toBeVisible();
      // I1 is one ladder step above B1: the failed rule names the distance.
      await expect(verdict).toContainText(/1 level above this class|1 nível acima desta aula/);
    } finally {
      await setEligibility(request, null);
    }
  });

  test("US-196-04: the lookup explains an invited student's position", async ({ page }) => {
    await loginAsCoach(page);
    await openTutorial(page);
    await pickClassAndPlayer(page);

    // Self-consistent in any suite order: whoever the simulation lists first in
    // the first non-empty round must be explained as "invited, position 1" in
    // that same round. (A hard-coded student can be enrolled, blocked or
    // excluded by an earlier spec; the seed's `E2E Student Two` usually is
    // the one, but the tutorial's own answer is the oracle here.)
    const results = page.getByTestId("tutorial-results");
    const firstRoundWithCandidates = results
      .locator('[data-testid^="tutorial-round-"]')
      .filter({ has: page.locator('[data-testid^="tutorial-candidate-"]') })
      .first();
    const roundNumber = (await firstRoundWithCandidates.getAttribute("data-testid"))!.replace(
      "tutorial-round-",
      "",
    );
    const firstCandidate = firstRoundWithCandidates
      .locator('[data-testid^="tutorial-candidate-"]')
      .first();
    const candidateName = (await firstCandidate.getByTestId("tutorial-name").textContent())!.trim();
    expect(candidateName.length).toBeGreaterThan(0);

    await page.getByTestId("tutorial-lookup-input").fill(candidateName);
    await page
      .getByTestId("tutorial-lookup")
      .getByRole("button", { name: candidateName, exact: true })
      .click();

    const verdict = page.getByTestId("tutorial-verdict");
    await expect(verdict).toBeVisible();
    await expect(verdict.getByTestId("tutorial-verdict-stage-invited")).toBeVisible();
    await expect(verdict).toContainText(
      new RegExp(`(round|ronda) ${roundNumber}, (position|posição) 1`),
    );

  });

  test("US-196-05: switching class resets the player step and clears the results", async ({
    page,
  }) => {
    await loginAsCoach(page);
    await openTutorial(page);
    await pickClassAndPlayer(page);

    const classButtons = page.locator('[data-testid^="tutorial-class-"]');
    const count = await classButtons.count();
    // The seed carries several upcoming classes with enrolled players; pick a
    // different one than the first.
    test.skip(count < 2, "seed offers a single pickable class");
    const first = await classButtons.first().getAttribute("aria-pressed");
    const target = first === "true" ? classButtons.nth(1) : classButtons.first();
    await target.click();

    await expect(page.getByTestId("tutorial-results")).toHaveCount(0);
    await expect(page.getByTestId("tutorial-verdict")).toHaveCount(0);
    await expect(
      page.locator('[data-testid^="tutorial-player-"][aria-pressed="true"]'),
    ).toHaveCount(0);
  });
});
