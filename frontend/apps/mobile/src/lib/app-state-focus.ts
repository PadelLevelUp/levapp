/**
 * PAD-592: which AppState transitions count as "the app came back". `inactive → active` is
 * Control Centre, Face ID, the app switcher peek, an incoming call banner — the app never left;
 * refetching every mounted query on each of those was the "foreground refetch storm". Only a
 * return from `background` (or from the unknown first state) is a focus event.
 *
 * `previous` is the last SETTLED state (`active` or `background`), never `inactive`: iOS may
 * deliver `background → inactive → active` on a resume, and that is still a return.
 */
import type { AppStateStatus } from "react-native";

export function isForegroundReturn(previous: AppStateStatus | null, next: AppStateStatus): boolean {
  if (next !== "active") return false;
  return previous === null || previous === "background" || previous === "unknown";
}

/** True when the app left for real (focus manager → unfocused). */
export function isBackgrounded(next: AppStateStatus): boolean {
  return next === "background";
}

/** The state to remember after `next`: `inactive` is transient and keeps the previous one. */
export function settleAppState(previous: AppStateStatus | null, next: AppStateStatus): AppStateStatus | null {
  return next === "inactive" ? previous : next;
}
