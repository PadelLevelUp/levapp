import type { DefaultOptions } from "@tanstack/react-query";

/**
 * One query-cache policy for both apps (`client.query-cache` rule 1, PAD-586 / PAD-592).
 *
 * Web `App.tsx` and mobile `app/_layout.tsx` build their `QueryClient` from
 * `queryClientDefaultOptions`; neither hard-codes a number. A per-query override is allowed only
 * with a comment naming the reason.
 *
 * - Data younger than `QUERY_STALE_TIME_MS` renders from cache with no request.
 * - Older data renders at once and refreshes once behind (no skeleton).
 * - Freshness is event-driven (SSE invalidation, mutations); nothing polls.
 */
export const QUERY_STALE_TIME_MS = 60_000;
export const QUERY_GC_TIME_MS = 10 * 60_000;
export const QUERY_RETRY = 1;

export const queryClientDefaultOptions: DefaultOptions = {
  queries: {
    staleTime: QUERY_STALE_TIME_MS,
    gcTime: QUERY_GC_TIME_MS,
    retry: QUERY_RETRY,
  },
};
