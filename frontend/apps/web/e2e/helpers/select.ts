import { expect, type Page } from "@playwright/test";

/**
 * B-231 / B-234: close an open Radix Select WITHOUT pressing Escape.
 *
 * For roughly the first 50 ms after a Select opens, an Escape is taken by the layer
 * underneath: inside a Dialog or Sheet that closes the whole dialog, not just the
 * list (measured in B-231: 0 ms lost the sheet 2/3, 50–700 ms kept it 18/18). A fast
 * machine lands the test's Escape inside that window every time. Choosing an option
 * is the Select's own close path and has no such window.
 *
 * Pass the option that is ALREADY selected so the value does not change.
 * `e2e-escape-after-select.test.ts` forbids the bare Escape this replaces.
 */
export async function closeSelectByChoosing(page: Page, currentOption: string | RegExp): Promise<void> {
  await page.getByRole("option", { name: currentOption }).click();
  await expect(page.getByRole("listbox")).toHaveCount(0);
}

