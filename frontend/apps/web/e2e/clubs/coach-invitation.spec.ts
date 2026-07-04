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

    // Fill the registration form (Label htmlFor + Input id pattern).
    await invitePage.getByLabel(/^name$/i).fill(NEW_COACH_NAME);
    await invitePage.getByLabel(/^username$/i).fill(NEW_COACH_USERNAME);
    await invitePage.getByLabel(/^password$/i).fill(NEW_COACH_PASSWORD);
    const repeat = invitePage.getByLabel(/repeat password/i);
    if (await repeat.isVisible({ timeout: 1000 }).catch(() => false)) {
      await repeat.fill(NEW_COACH_PASSWORD);
    }

    await invitePage
      .getByRole("button", { name: /join|accept|register|create account/i })
      .click();

    // Either auto-logged-in (off the invite page, into the app) or sent to
    // /auth to sign in with the new credentials.
    await invitePage.waitForURL((url) => !url.pathname.startsWith("/invite/"), {
      timeout: 10_000,
    });

    if (invitePage.url().includes("/auth")) {
      await invitePage.getByPlaceholder("your-username").fill(NEW_COACH_USERNAME);
      await invitePage.getByPlaceholder("••••••••").fill(NEW_COACH_PASSWORD);
      await invitePage.getByRole("button", { name: "Sign In" }).click();
      await invitePage.waitForURL((url) => !url.pathname.startsWith("/auth"), {
        timeout: 10_000,
      });
    }

    // The new coach sees the app shell (coach navigation).
    await expect(
      invitePage.getByRole("link", { name: /players|calendar|dashboard/i }).first()
    ).toBeVisible({ timeout: 10_000 });

    await context.close();
  });

  test("US-CI-3: invalid token shows an invalid or expired invitation message", async ({
    page,
  }) => {
    await page.goto("/invite/coach/this-token-does-not-exist");

    await expect(
      page.getByText(/invalid|expired|no longer valid/i).first()
    ).toBeVisible({ timeout: 10_000 });
  });
});
