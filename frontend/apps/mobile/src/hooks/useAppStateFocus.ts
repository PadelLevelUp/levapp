import { focusManager } from "@tanstack/react-query";
import { useEffect } from "react";
import { AppState, type AppStateStatus, Platform } from "react-native";
import { isBackgrounded, isForegroundReturn, settleAppState } from "@/lib/app-state-focus";

/**
 * Bridges React Native's AppState into React Query's focus tracking.
 *
 * React Query's `refetchOnWindowFocus` is driven by `focusManager`, which
 * only knows how to observe the DOM's `visibilitychange`/`focus` events. In
 * React Native there is no window to focus, so without this bridge the
 * manager stays permanently "focused" and a foreground return never triggers
 * a refetch — queries serve whatever was cached before iOS suspended the JS
 * runtime, and the UI only shows fresh data after a cold relaunch remounts
 * everything.
 *
 * Pairs with the AppState-driven reconnect in `useAppEvents` (src/lib/sse.ts):
 * that one revives the event stream, this one refreshes data that went stale
 * while the stream was dead. Both are needed — reviving the socket alone
 * leaves already-cached screens stale, and refetching alone leaves the app
 * blind to subsequent live events.
 */

/**
 * PAD-592: only a real return (`background → active`, possibly through a transient
 * `inactive`) is a focus event. `inactive → active` on its own (Control Centre, Face ID, the
 * app switcher) used to refocus every mounted query at once. Pure subscription so the
 * sequence is unit-tested (`useAppStateFocus.test.ts`); the hook only mounts it.
 */
export function subscribeAppStateFocus(setFocused: (focused: boolean) => void): () => void {
  let previous: AppStateStatus | null = settleAppState(null, AppState.currentState ?? "unknown");
  const subscription = AppState.addEventListener("change", (status) => {
    if (isForegroundReturn(previous, status)) setFocused(true);
    else if (isBackgrounded(status)) setFocused(false);
    previous = settleAppState(previous, status);
  });
  return () => subscription.remove();
}

export function useAppStateFocus(): void {
  useEffect(() => {
    // No-op on web, where focusManager's own DOM listeners already apply.
    if (Platform.OS === "web") return undefined;
    return subscribeAppStateFocus((focused) => focusManager.setFocused(focused));
  }, []);
}
