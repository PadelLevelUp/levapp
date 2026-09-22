/**
 * PAD-372 (classes.class-requests rule 3): the server refuses a single-occurrence or
 * this-and-following change to the live hold of an open class request with
 * `409 {"error": "HOLD_OCCURRENCE_LOCKED"}` — the blueprint's abort() shape, the one
 * `NO_CLUB` travels in. Both shells map that answer to a message pointing at
 * "propose a new time on the request" instead of the generic failure toast.
 *
 * The shells do not offer the gesture on a block whose `requestHoldOf` is set; this
 * predicate is the backstop for a feed that was loaded before the request was made.
 */
export const HOLD_OCCURRENCE_LOCKED = "HOLD_OCCURRENCE_LOCKED";

export function isHoldOccurrenceLocked(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const response = (err as { response?: { status?: unknown; data?: unknown } }).response;
  if (!response || response.status !== 409) return false;
  const data = response.data;
  if (typeof data !== "object" || data === null) return false;
  const { error, code } = data as { error?: unknown; code?: unknown };
  return error === HOLD_OCCURRENCE_LOCKED || code === HOLD_OCCURRENCE_LOCKED;
}
