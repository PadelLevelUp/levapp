import { test, expect, type Page } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { openSettings } from "../helpers/navigation";

// Seeded in e2e/scripts/seed.py
const CLUB_NAME = "E2E Club";

const NEW_COACH_NAME = "Invited Coach";
const NEW_COACH_USERNAME = `invited-coach-${Date.now()}`;
const NEW_COACH_PASSWORD = "InvitedCoach123!";

/**
 * As the seeded coach: open Settings → Club tab, click "Invite coach"
 * and return the shareable invite link shown in the dialog.
 */
async function createInviteLink(page: Page): Promise<string> {
  await loginAsCoach(page);
  await openSettings(page);

  // SettingsPage uses plain <button> nav items (not role="tab").
  const clubTab = page.getByRole("button", { name: /^club$/i });
  await expect(clubTab, "Settings should have a Club tab").toBeVisible({
    timeout: 10_000,
  });
  await clubTab.click();

  const inviteButton = page.getByRole("button", { name: /invite coach/i });
  await expect(inviteButton, "Club tab should have an Invite coach action").toBeVisible({
    timeout: 10_000,
  });
  await inviteButton.click();

  // The dialog shows the shareable link in a readonly input.
  // NOTE: React sets the input's value as a DOM property (not an HTML
  // attribute), so CSS [value*=...] selectors never match — read the
  // value via inputValue() instead.
  const dialog = page.getByRole("dialog", { name: /invite a coach/i });
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  const linkInput = dialog.getByRole("textbox");
  await expect(linkInput).toBeVisible({ timeout: 5000 });
  const link: string | null = await linkInput.inputValue();

  expect(link, "invite link should contain /invite/coach/<token>").toContain(
    "/invite/coach/"
  );
  return link!;
}

test.describe("clubs.coach-invitation", () => {
  test("US-CI-1: coach creates a shareable coach invite link from club settings", async ({
    page,
  }) => {
    const link = await createInviteLink(page);
    expect(link).toMatch(/\/invite\/coach\/[\w-]+/);
  });

  test("US-CI-2: new coach registers via invite link and lands in the app", async ({
    page,
    browser,
  }) => {
    const link = await createInviteLink(page);
    const token = link.split("/invite/coach/")[1];

    // Fresh, unauthenticated context for the invited coach.
    const context = await browser.newContext();
    const invitePage = await context.newPage();
    await invitePage.goto(`/invite/coach/${token}`);

    // Invitation page shows the club name.
    await expect(invitePage.getByText(CLUB_NAME)).toBeVisible({
      timeout: 10_000,
    });

    // Fill the registration form (Label htmlFor + Input id pattern). The invite
    // page renders in the default locale (pt) pre-auth, so match either language.
    await invitePage.getByLabel(/^(name|nome)$/i).fill(NEW_COACH_NAME);
    await invitePage
      .getByLabel(/^(username|nome de utilizador)$/i)
      .fill(NEW_COACH_USERNAME);
    await invitePage
      .getByLabel(/^(password|palavra-passe)$/i)
      .fill(NEW_COACH_PASSWORD);
    const repeat = invitePage.getByLabel(/repeat password|repetir palavra-passe/i);
    if (await repeat.isVisible({ timeout: 1000 }).catch(() => false)) {
      await repeat.fill(NEW_COACH_PASSWORD);
    }

    await invitePage
      .getByRole("button", {
        name: /join|accept|register|create account|juntar|criar conta/i,
      })
      .click();

    // Either auto-logged-in (off the invite page, into the app) or sent to
    // /auth to sign in with the new credentials.
    await invitePage.waitForURL((url) => !url.pathname.startsWith("/invite/"), {
      timeout: 10_000,
    });

    if (invitePage.url().includes("/auth")) {
      await invitePage.locator("#username").fill(NEW_COACH_USERNAME);
      await invitePage.locator("#password").fill(NEW_COACH_PASSWORD);
      await invitePage.locator('button[type="submit"]').click();
      await invitePage.waitForURL((url) => !url.pathname.startsWith("/auth"), {
        timeout: 10_000,
      });
    }

    // The new coach sees the app shell (coach navigation). A freshly-registered
    // coach has no language set yet, so the UI defaults to pt — match either language.
    await expect(
      invitePage
        .getByRole("link", {
          name: /players|calendar|dashboard|jogadores|calendário|painel/i,
        })
        .first()
    ).toBeVisible({ timeout: 10_000 });

    await context.close();
  });

  test("US-CI-3: invalid token shows an invalid or expired invitation message", async ({
    page,
  }) => {
    await page.goto("/invite/coach/this-token-does-not-exist");

    // Pre-auth page renders in the default locale (pt): EN "invalid/expired" or
    // PT "inválido" / "já não é válido".
    await expect(
      page.getByText(/invalid|expired|no longer valid|inválid|já não é válid/i).first()
    ).toBeVisible({ timeout: 10_000 });
  });
});
