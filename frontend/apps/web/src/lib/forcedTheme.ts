import { useSyncExternalStore } from "react";

/**
 * A theme a page forces while it is mounted (PAD-656). The public site is light-only by design
 * (its layout paints white), but the app follows the system theme, and a dark system turned the
 * site's token-styled pieces — the cookie banner, the contact dialog, the form — dark on a white
 * page. The site sets "light" while mounted; App hands it to next-themes as `forcedTheme`, which
 * overrides the theme without touching the visitor's stored preference.
 */
type Forced = "light" | "dark" | undefined;

let forced: Forced;
const listeners = new Set<() => void>();

export function forceTheme(next: Forced) {
  if (forced === next) return;
  forced = next;
  for (const l of listeners) l();
}

export function useForcedTheme(): Forced {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => forced,
    () => forced,
  );
}
