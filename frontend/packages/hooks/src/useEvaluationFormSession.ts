import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { createEvaluationFormSession, type EvaluationFormSessionOptions, type EvaluationFormState } from "@levelup/config";

/**
 * One `EvaluationFormSession` for the life of a form (PAD-374): created once, rendered
 * through `useSyncExternalStore`, flushed on unmount so a quick step-then-close is never
 * lost. `record` is read once — a form that must reopen on another record remounts (key).
 */
export function useEvaluationFormSession(options: EvaluationFormSessionOptions) {
  // `save` and `onFailure` are read through a ref, so a toast after a language switch
  // speaks the current language and a parent's new callback is the one called.
  const latest = useRef(options);
  latest.current = options;
  const session = useMemo(
    () =>
      createEvaluationFormSession({
        ...options,
        save: (input) => latest.current.save(input),
        onFailure: (failure) => latest.current.onFailure?.(failure),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  const state: EvaluationFormState = useSyncExternalStore(session.subscribe, session.getState, session.getState);
  useEffect(() => () => session.flush(), [session]);
  return { session, state };
}
