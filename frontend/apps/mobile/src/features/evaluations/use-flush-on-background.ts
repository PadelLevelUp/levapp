import * as React from "react";
import { AppState, type AppStateStatus } from "react-native";

/**
 * evaluations.records rule 7 (PAD-396): a form that saves on tap still holds a stepper's
 * step or the note's text inside their quiet period; when the app leaves the foreground
 * (`background`, or `inactive` — the app switcher, a call, the lock screen) that pending
 * input is flushed at once. The flush only starts the pending PUT through the session's
 * own queue. Pure part below (tested in node); the hook is the two-line React wrapper.
 */
export function subscribeFlushOnBackground(getFlush: () => () => void): () => void {
  const subscription = AppState.addEventListener("change", (status: AppStateStatus) => {
    if (status !== "active") getFlush()();
  });
  return () => subscription.remove();
}

export function useFlushOnBackground(flush: () => void): void {
  const latest = React.useRef(flush);
  latest.current = flush;
  React.useEffect(() => subscribeFlushOnBackground(() => latest.current), []);
}
