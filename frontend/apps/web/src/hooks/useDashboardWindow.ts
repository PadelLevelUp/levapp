import { useMemo } from "react";
import { format } from "date-fns";

/**
 * The dashboard payload's 30-day window. The window starts at the local midnight of the calendar
 * day, so the query key is byte-identical across mounts within a day and a return inside the stale
 * window renders from cache (client.query-cache rule 2); a `new Date()` here would mint a new key
 * per mount. Shared by the dashboard page and the setup guide (PAD-839), so both read one cache
 * entry: the guide's ring in the layout costs no second dashboard request.
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
