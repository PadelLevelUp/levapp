/**
 * PAD-587: "the first screen is ready" — the index route has resolved the session and issued its
 * redirect (to the tabs, the login, or a hold screen), so the next frame shows a real screen. A
 * tiny external store, because the root layout sits above the auth context.
 */
import { useSyncExternalStore } from "react";

let ready = false;
const listeners = new Set<() => void>();

export function markFirstScreenReady(): void {
  if (ready) return;
  ready = true;
  listeners.forEach((l) => l());
}

export function isFirstScreenReady(): boolean {
  return ready;
}

/** Test seam. */
export function resetFirstScreenReady(): void {
  ready = false;
}

export function useFirstScreenReady(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => ready,
    () => ready,
  );
}
