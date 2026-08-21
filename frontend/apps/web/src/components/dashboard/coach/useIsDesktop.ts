import * as React from "react";

/** The dashboard's desktop breakpoint, matching Tailwind's `lg`. */
export const DESKTOP_BREAKPOINT = 1024;

/**
 * True at >= 1024px.
 *
 * The dashboard needs this in JS rather than CSS alone because the hero and
 * This-week move BETWEEN columns across the breakpoint. Rendering them twice
 * and hiding one would put every `data-testid` in the DOM twice, which breaks
 * Playwright's strict-mode locators — so the layout picks one arrangement and
 * each block is rendered exactly once.
 *
 * Initialised from `matchMedia` on first render (not in an effect) so a desktop
 * load never paints the mobile arrangement for a frame first.
 */
export function useIsDesktop(): boolean {
  const query = `(min-width: ${DESKTOP_BREAKPOINT}px)`;

  const [isDesktop, setIsDesktop] = React.useState(
    () => typeof window !== "undefined" && window.matchMedia(query).matches,
  );

  React.useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    setIsDesktop(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return isDesktop;
}
