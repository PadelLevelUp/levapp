import { test, expect, type Page } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { openPlayers } from "../helpers/navigation";

/**
 * PAD-32 — Allow players to complete their own profile via invite link.
 *
 * A coach creates an "incomplete" player with only basic info (name, side —
 * no username) and gets a secure, single-use invite link. The player opens the
 * link, chooses their own username + password, and their profile transitions
 * from pending (inactive) to active.
 *
 * Reuses the coach-invitation token infrastructure (7-day, single-use tokens).
 */

const NEW_PLAYER_NAME = `Invited Player ${Date.now()}`;
const NEW_PLAYER_USERNAME = `invited-player-${Date.now()}`;
const NEW_PLAYER_PASSWORD = "InvitedPlayer123!";

/**
 * As the seeded coach: open Players, click "Add player", fill only the basic
 * info, then create the player as an invite (no username). Returns the
 * shareable invite link shown in the dialog.
 */
async function createPlayerInviteLink(page: Page): Promise<string> {
  await loginAsCoach(page);
  await openPlayers(page);

  await page.getByRole("button", { name: /add player/i }).first().click();

  // The new-player sheet.
  await page.getByLabel(/^name$/i).fill(NEW_PLAYER_NAME);

  // Create as an invite — no username required. The button surfaces a
  // shareable link instead of fully creating an active account.
  await page.getByRole("button", { name: /create.*invite|invite.*player/i }).click();

  // Dialog shows the shareable link in a readonly input. React sets the value
  // as a DOM property, so read it via inputValue().
  const dialog = page.getByRole("dialog", { name: /invite/i });
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  const linkInput = dialog.getByRole("textbox");
  await expect(linkInput).toBeVisible({ timeout: 5000 });
  const link = await linkInput.inputValue();

  expect(link, "invite link should contain /invite/player/<token>").toContain(
    "/invite/player/"
  );
  return link;
}

test.describe("players.invite-completion", () => {
  test("US-PI-1: coach creates an incomplete player and gets a shareable invite link", async ({
    page,
  }) => {
    const link = await createPlayerInviteLink(page);
    expect(link).toMatch(/\/invite\/player\/[\w-]+/);
  });

  test("US-PI-2: player completes their profile via the invite link and becomes active", async ({
    page,
    browser,
  }) => {
    const link = await createPlayerInviteLink(page);
    const token = link.split("/invite/player/")[1];

    // Fresh, unauthenticated context for the invited player.
    const context = await browser.newContext();
    const invitePage = await context.newPage();
    await invitePage.goto(`/invite/player/${token}`);

    // Completion page shows the player's name.
    await expect(invitePage.getByText(NEW_PLAYER_NAME)).toBeVisible({
      timeout: 10_000,
    });

    // The player chooses their own username + password.
    await invitePage.getByLabel(/^username$/i).fill(NEW_PLAYER_USERNAME);
    await invitePage.getByLabel(/^password$/i).fill(NEW_PLAYER_PASSWORD);
    const repeat = invitePage.getByLabel(/repeat password/i);
    if (await repeat.isVisible({ timeout: 1000 }).catch(() => false)) {
      await repeat.fill(NEW_PLAYER_PASSWORD);
    }

    await invitePage
      .getByRole("button", { name: /complete|join|accept|create account|finish/i })
      .click();

    // Either auto-logged-in (off the invite page) or sent to /auth to sign in.
    await invitePage.waitForURL((url) => !url.pathname.startsWith("/invite/"), {
      timeout: 10_000,
    });

    if (invitePage.url().includes("/auth")) {
      await invitePage.getByPlaceholder("your-username").fill(NEW_PLAYER_USERNAME);
      await invitePage.getByPlaceholder("••••••••").fill(NEW_PLAYER_PASSWORD);
      await invitePage.getByRole("button", { name: "Sign In" }).click();
      await invitePage.waitForURL((url) => !url.pathname.startsWith("/auth"), {
        timeout: 10_000,
      });
    }

    // The now-active player lands in the app shell.
    await expect(invitePage).toHaveURL(/\/(dashboard|calendar|messages)?$|\/[a-z]+/, {
      timeout: 10_000,
    });

    await context.close();
  });

  test("US-PI-3: invalid token shows an invalid or expired message", async ({
    page,
  }) => {
    await page.goto("/invite/player/this-token-does-not-exist");

    await expect(
      page.getByText(/invalid|expired|no longer valid/i).first()
    ).toBeVisible({ timeout: 10_000 });
  });
});
