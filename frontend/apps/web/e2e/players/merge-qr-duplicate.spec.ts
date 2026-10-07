import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { completeEmailVerification } from "../helpers/emailVerification";
import { openPlayers } from "../helpers/navigation";
import { ui } from "../helpers/i18n";

/**
 * players.claim rules 4b, 4c, 5j (PAD-528) — the case the ticket was opened for:
 * the coach pre-creates a player, the student then scans the coach's QR and
 * signs up on their own, and the roster holds two people with one name.
 *
 *   US-528: the roster flags the placeholder as a possible duplicate; the coach
 *           merges it into the student in one tap, sees the dry run first; the
 *           student sees the same dry run on the dashboard banner and accepts;
 *           one record remains, with the coach's level.
 *
 * Timestamps keep every name and username unique across re-runs.
 */
const stamp = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
const PASSWORD = "Segura1234";
const JOIN_URL = /\/join\/coach\/[A-Za-z0-9_-]+$/;

/** players.join-token rule 7: the dialog shows the code once; a live one offers a new one. */
async function readJoinUrl(page: Page): Promise<string> {
  await openPlayers(page);
  await page.getByTestId("players-add-by-qr").click();
  const url = page.getByTestId("add-by-qr-url");
  const live = page.getByTestId("add-by-qr-live");
  await expect(url.or(live)).toBeVisible({ timeout: 10_000 });
  if (await live.isVisible()) await page.getByTestId("add-by-qr-new").click();
  await expect(url).toHaveValue(JOIN_URL, { timeout: 10_000 });
  const value = await url.inputValue();
  await page.keyboard.press("Escape");
  return value;
}

/** The coach's "Create & invite": a claimable placeholder named `name`. */
async function createPlaceholder(page: Page, name: string) {
  await openPlayers(page);
  await page.getByRole("button", { name: ui("players.addPlayer") }).first().click();
  await page.getByLabel(ui("players.name")).fill(name);
  await page.getByRole("button", { name: ui("players.createAndInvite") }).click();
  const dialog = page.getByRole("dialog", { name: ui("players.inviteDialogTitle") });
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await page.keyboard.press("Escape");
}

/** A student who scanned the QR: signs up with `displayName` and joins the roster. */
async function signUpAndJoin(student: Page, joinPath: string, displayName: string) {
  const username = `e2e-528-${stamp()}`;
  await student.emulateMedia({ reducedMotion: "reduce" });
  await student.goto(joinPath);
  await expect(student.getByTestId("join-coach-signed-out")).toBeVisible({ timeout: 10_000 });
  await student.getByTestId("join-coach-create-account").click();
  await expect(student).toHaveURL(/\/signup$/);
  await student.getByTestId("signup-role-student").click();
  await student.locator("#signup-name").fill(displayName);
  await student.locator("#signup-username").fill(username);
  await student.locator("#signup-email").fill(`${username}@example.com`);
  await student.locator("#signup-password").fill(PASSWORD);
  await student.locator("#signup-repeatPassword").fill(PASSWORD);
  await student.locator("#signup-birthDate").fill("2000-01-01");
  await student.getByTestId("signup-terms").click();
  await student.getByTestId("signup-submit").click();
  await completeEmailVerification(student);
  await expect(student).toHaveURL(new RegExp(`${joinPath}$`), { timeout: 15_000 });
  await expect(student.getByTestId("join-coach-preview")).toBeVisible({ timeout: 10_000 });
  await student.getByTestId("join-coach-confirm").click();
  await expect(student.getByTestId("join-coach-success")).toBeVisible({ timeout: 10_000 });
  return username;
}

async function searchRoster(page: Page, name: string) {
  await openPlayers(page);
  await page.getByPlaceholder(ui("players.searchPlaceholder")).first().fill(name);
}

test.describe("players.claim — merge a placeholder into the student who joined by QR", () => {
  let studentContext: BrowserContext;

  test.afterEach(async () => {
    await studentContext?.close().catch(() => undefined);
  });

  test("US-528: duplicate badge, one-tap merge with the dry run, the student accepts", async ({ page, browser }) => {
    const name = `Dup ${stamp()}`;

    // 1. The coach pre-creates the player and holds a QR for the class.
    await loginAsCoach(page);
    await createPlaceholder(page, name);
    const joinPath = new URL(await readJoinUrl(page)).pathname;

    // 2. The student scans the QR, signs up with the same name and joins the roster.
    studentContext = await browser.newContext();
    const student = await studentContext.newPage();
    await signUpAndJoin(student, joinPath, name);

    // 3. Rule 4c: the roster now shows two rows with that name; the placeholder's carries the badge.
    await searchRoster(page, name);
    const rows = page.getByText(name, { exact: true });
    await expect(rows).toHaveCount(2, { timeout: 10_000 });
    const badge = page.locator('[data-testid^="player-duplicate-"]');
    await expect(badge).toHaveCount(1);
    const placeholderId = (await badge.getAttribute("data-testid"))!.replace("player-duplicate-", "");

    // 4. Rule 4b/5j: on the placeholder's page, one tap opens the merge preselected with the dry run.
    await page.goto(`/players/${placeholderId}`);
    await expect(page.getByTestId("player-duplicate-hint")).toBeVisible({ timeout: 10_000 });
    await page.getByTestId("player-claim-merge-into").click();
    const dialog = page.getByTestId("player-claim-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('[role="radio"][aria-checked="true"]')).toHaveCount(1);
    const preview = page.getByTestId("player-claim-preview");
    await expect(preview).toBeVisible({ timeout: 10_000 });
    await expect(preview).toContainText(ui("players.claim.previewIrreversible", { exact: false }));
    await page.getByTestId("player-claim-submit").click();
    await expect(page.getByTestId("player-claim-pending")).toBeVisible({ timeout: 10_000 });

    // 5. The student sees the request with the same dry run and accepts.
    await student.goto("/dashboard");
    const banner = student.getByTestId("claim-request-banner");
    await expect(banner).toBeVisible({ timeout: 10_000 });
    await expect(banner).toContainText(name);
    await expect(banner.locator('[data-testid^="claim-preview-"]')).toContainText(
      ui("players.claim.previewIrreversible", { exact: false }),
      { timeout: 10_000 },
    );
    await student.locator('[data-testid^="claim-accept-"]').first().click();
    await expect(student.getByTestId("claim-request-banner")).toHaveCount(0, { timeout: 15_000 });

    // 6. One record remains, and it is the student's; no badge is left.
    await searchRoster(page, name);
    await expect(page.getByText(name, { exact: true })).toHaveCount(1, { timeout: 10_000 });
    await expect(page.locator('[data-testid^="player-duplicate-"]')).toHaveCount(0);
  });
});
