/**
 * PAD-587: "the first screen is ready" — the index route has resolved the session and issued its
 * redirect (to the tabs, the login, or a hold screen), so the next frame shows a real screen. A
 * tiny external store, like `components/ui/toast.tsx`, because the root layout sits above the
 * auth context. One-way and sticky: nothing un-readies a launch.
 */
import { useSyncExternalStore } from "react";

let ready = false;
const listeners = new Set<() => void>();

export function markFirstScreenReady(): void {
  if (ready) return;
  ready = true;
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const snapshot = () => ready;

export function useFirstScreenReady(): boolean {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
