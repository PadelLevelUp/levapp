/**
 * Undo history for the tactical board (training.tactical-board rule 4).
 *
 * Framework-free so web (a hook) and iOS (a ref) share one implementation:
 * the stack holds the values *before* each committed mutation; `pop` hands the
 * most recent one back. Depth is capped so a long editing session cannot keep
 * hundreds of diagram snapshots alive.
 */
export const HISTORY_LIMIT = 20;

/** Push the value that a mutation is about to replace. Returns a new stack. */
export function pushHistory<T>(stack: readonly T[], previous: T, limit = HISTORY_LIMIT): T[] {
  const next = [...stack, previous];
  return next.length > limit ? next.slice(next.length - limit) : next;
}

/** Pop the most recent previous value. `value` is undefined when there is nothing to undo. */
export function popHistory<T>(stack: readonly T[]): { stack: T[]; value: T | undefined } {
  if (stack.length === 0) return { stack: [], value: undefined };
  return { stack: stack.slice(0, -1), value: stack[stack.length - 1] };
}
