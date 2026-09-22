import { useEffect, useRef } from "react";

/**
 * evaluations.records rule 7 (PAD-396): a form that saves on tap still holds a stepper's
 * step or the note's text inside their quiet period; when the page is hidden — the tab
 * closed (`pagehide`) or switched away (`visibilitychange` to hidden) — that pending
 * input is flushed at once. The flush only starts the pending PUT through the session's
 * own queue, which needs no beacon. `flush` is read through a ref so the listeners are
 * registered once and always call the latest one.
 */
export function useFlushOnPageHide(flush: (options: { keepalive: true }) => void): void {
  const latest = useRef(flush);
  latest.current = flush;
  useEffect(() => {
    // keepalive: a request started while the document unloads is aborted otherwise (Cmd-W fires
    // hidden and pagehide in the same task; the PUT would never leave).
    const onPageHide = () => latest.current({ keepalive: true });
    const onVisibility = () => {
      if (document.visibilityState === "hidden") latest.current({ keepalive: true });
    };
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
}
