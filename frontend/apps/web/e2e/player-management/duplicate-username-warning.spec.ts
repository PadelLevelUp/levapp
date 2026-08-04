import { test, expect } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { openPlayers } from "../helpers/navigation";

/**
 * PAD-7 — real-time unique-field validation.
 *
 * PAD-105 moved username ownership to the student: the coach's add-player form
 * no longer has a username field, so the original "username turns red in the
 * coach's form" case has nowhere left to live. The uniqueness guarantee itself
 * did NOT go away — it just moved to where the username is now chosen, the
 * student's own invite-completion form, which rejects a taken username. Both
 * halves of PAD-7 are still covered here:
 *
 *   - email uniqueness, still on the coach's add-player form (unchanged);
 *   - username uniqueness, now on the student's invite-completion form.
 */

test.describe("PAD-7: unique field validation", () => {
  test("PAD-7: email field turns red when value is already taken", async ({
    page,
  }) => {
    await loginAsCoach(page);
    await openPlayers(page);

    await page.getByRole("button", { name: /add player/i }).click();

    await page.getByPlaceholder("e.g. John Doe").fill("Email Dup Test");

    const emailInput = page.getByPlaceholder("e.g. john@email.com");
    await emailInput.fill("e2e-coach@test.com"); // taken email

    // Error should appear automatically
    const errorMsg = page.getByText("This email is already taken");
    await expect(errorMsg).toBeVisible({ timeout: 3000 });
    await expect(emailInput).toHaveClass(/border-red-500/);

    // Form data should be preserved
    await expect(page.getByPlaceholder("e.g. John Doe")).toHaveValue("Email Dup Test");

    // Create is blocked while a unique field is in error
    await expect(
      page.getByRole("button", { name: /create player/i })
    ).toBeDisabled();
  });

  test("PAD-7 / PAD-105: a taken username is rejected in the student's own signup form", async ({
    page,
    browser,
  }) => {
    // The coach creates an invited player — still without ever typing a username.
    await loginAsCoach(page);
    await openPlayers(page);

    await page.getByRole("button", { name: /add player/i }).click();
    await page
      .getByPlaceholder("e.g. John Doe")
      .fill(`Dup Username Invitee ${Date.now()}`);
    await page
      .getByRole("button", { name: /create.*invite|invite.*player/i })
      .click();

    const dialog = page.getByRole("dialog", { name: /invite/i });
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    const link = await dialog.getByRole("textbox").inputValue();
    const token = link.split("/invite/player/")[1];

    // The student opens their link and tries to claim a username that exists.
    const context = await browser.newContext();
    const invitePage = await context.newPage();
    await invitePage.goto(`/invite/player/${token}`);

    await expect(invitePage.locator("#username")).toBeVisible({ timeout: 10_000 });
    await invitePage.locator("#username").fill("e2e-student"); // taken
    await invitePage.locator("#password").fill("DupUser123!");
    await invitePage.locator("#repeatPassword").fill("DupUser123!");
    await invitePage.locator('button[type="submit"]').click();

    // Pre-auth pages render in the default locale (pt), so accept either language.
    await expect(
      invitePage.getByText(/already taken|já está em uso/i).first()
    ).toBeVisible({ timeout: 10_000 });

    // Still on the completion page — the account was not created.
    expect(invitePage.url()).toContain("/invite/player/");

    await context.close();
  });
});
