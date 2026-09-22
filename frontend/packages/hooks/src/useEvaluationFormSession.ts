import { useEffect, useMemo, useSyncExternalStore } from "react";
import { createEvaluationFormSession, type EvaluationFormSessionOptions, type EvaluationFormState } from "@levelup/config";

/**
 * One `EvaluationFormSession` for the life of a form (PAD-374): created once, rendered
 * through `useSyncExternalStore`, flushed on unmount so a quick step-then-close is never
 * lost. Options are read once — a form that must reopen on another record remounts (key).
 */
export function useEvaluationFormSession(options: EvaluationFormSessionOptions) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const session = useMemo(() => createEvaluationFormSession(options), []);
  const state: EvaluationFormState = useSyncExternalStore(session.subscribe, session.getState, session.getState);
  useEffect(() => () => session.flush(), [session]);
  return { session, state };
}
