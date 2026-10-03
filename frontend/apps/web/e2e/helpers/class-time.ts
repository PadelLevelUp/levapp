import { expect, type Locator } from "@playwright/test";

/**
 * PAD-508 (classes.create rule 8b): the desktop class-time field is a typeable field with a list.
 * Typing is committed by Enter (or leaving the field), which also closes the list so it covers
 * nothing the test clicks next.
 */
/** The new-class sheet's start and end time fields. */
export function classTimes(scope: Locator) {
  return { start: scope.getByTestId("add-class-start-time"), end: scope.getByTestId("add-class-end-time") };
}

export async function setClassTime(field: Locator, value: string) {
  await field.fill(value);
  await field.press("Enter");
  await expect(field).toHaveValue(value);
}
