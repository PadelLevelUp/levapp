import { format } from "date-fns";
import { useMemo } from "react";

/**
 * The dashboard payload's 30-day window, the twin of web's `hooks/useDashboardWindow.ts`.
 *
 * The window starts at the local midnight of the calendar day, so the query key is identical
 * across mounts within a day. PAD-839: the dashboard screen and the setup guide (the card, the
 * step screens and the avatar ring in the tabs header) read the SAME cache entry through it; a
 * `new Date()` here would mint a new key per mount and send a second dashboard request.
 */
export function useDashboardWindow(): { from: string; to: string } {
  const today = format(new Date(), "yyyy-MM-dd");
  return useMemo(() => {
    const dayStart = new Date(`${today}T00:00:00`);
    return {
      from: dayStart.toISOString(),
      to: new Date(dayStart.getTime() + 30 * 86400000).toISOString(),
    };
  }, [today]);
}
