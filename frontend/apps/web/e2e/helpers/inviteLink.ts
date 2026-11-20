import { expect, type Page } from "@playwright/test";

/**
 * PAD-834 (players.profile rule 11; assumption Q6): the activation link a pending player's profile
 * copies. The read-only link box went with the old "no account" panel; the pending alert's
 * "Copiar link de convite" puts the link on the clipboard instead, so a spec reads it there.
 */
export async function copyInviteLink(page: Page): Promise<string> {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  const button = page.getByTestId("player-pending-alert").getByTestId("player-copy-invite-link");
  await expect(button).toBeVisible({ timeout: 10_000 });
  await button.click();
  return page.evaluate(() => navigator.clipboard.readText());
}
