import { expect, type Locator } from "@playwright/test";

/**
 * classes.class-requests rule 21: "Continuar" ignores a press in the first 400 ms of a step, so a spec waits the lock out
 * before it presses, then waits for the next step's root.
 */
export async function continueTo(wizard: Locator, step: "when" | "time") {
  await wizard.page().waitForTimeout(450);
  await wizard.getByTestId("wizard-continue").click();
  await expect(wizard.locator(`[data-private-step="${step}"]`)).toBeVisible();
}
