/**
 * PAD-481 — "up to N levels away" with a direction (eligibility.rules rule 6).
 *
 * The bar stores the direction as the OPERATION, not as a separate field:
 * `within_n_of_class` (both ways, unchanged since PAD-128), `within_n_above_class`
 * and `within_n_below_class`. An app that does not know the two newer ones shows a
 * blank operation and saves the rule back unchanged, rather than showing a
 * plausible wrong "both". Both editors (web, iOS) present the three as ONE
 * "within N levels" menu entry plus a direction selector; this module is the one
 * mapping between the two views.
 *
 * "Above" means a stronger level (a lower ladder index), and both one-way forms
 * include the class's own level.
 */

export type WithinNDirection = "both" | "above" | "below";

export const WITHIN_N_DIRECTIONS: readonly WithinNDirection[] = ["both", "above", "below"];

const OPERATION_BY_DIRECTION: Record<WithinNDirection, string> = {
  both: "within_n_of_class",
  above: "within_n_above_class",
  below: "within_n_below_class",
};

/** The operation the "within N levels" menu entry stands for when first picked. */
export const WITHIN_N_MENU_OPERATION = OPERATION_BY_DIRECTION.both;

/** The stored operation for a direction. */
export function withinNOperation(direction: WithinNDirection): string {
  return OPERATION_BY_DIRECTION[direction];
}

/** The direction of a `within_n_*` operation, or null for any other operation. */
export function withinNDirection(operation: string): WithinNDirection | null {
  const hit = WITHIN_N_DIRECTIONS.find((d) => OPERATION_BY_DIRECTION[d] === operation);
  return hit ?? null;
}

/** Whether an operation is one of the three `within_n_*` forms (they carry `value`). */
export function isWithinNOperation(operation: string): boolean {
  return withinNDirection(operation) !== null;
}

/** The menu entry a stored operation shows as: the three `within_n_*` forms share one. */
export function menuOperation(operation: string): string {
  return isWithinNOperation(operation) ? WITHIN_N_MENU_OPERATION : operation;
}

/**
 * The operation after the coach picks `picked` from the operation menu. Picking
 * "within N levels" on a rule that already is one keeps its direction; picking
 * it fresh starts at "both" — today's meaning.
 */
export function operationForMenuPick(current: string, picked: string): string {
  if (picked === WITHIN_N_MENU_OPERATION && isWithinNOperation(current)) return current;
  return picked;
}
