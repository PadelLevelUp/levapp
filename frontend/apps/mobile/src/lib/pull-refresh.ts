// The client module itself: screens' tests mock "@levelup/api" wholesale.
import { REQUEST_TIMEOUT_MS } from "@levelup/api/src/client";

/**
 * PAD-786 (client.pull-to-refresh rule 3): the longest a pull-to-refresh spinner may stay up.
 *
 * A refetch ends on its own within the client timeout, one retry and its backoff
 * (2 × 20 s + about 1 s). A fetch React Query paused while offline never ends by itself, so the
 * spinner is also bounded here, a little past that: whatever happens, it comes down.
 */
export const REFRESH_SPINNER_MAX_MS = 2 * REQUEST_TIMEOUT_MS + 5_000;

export type RefreshOutcome = "ok" | "failed" | "timed-out";

/** What a React Query `refetch()` resolves with; only the error flag matters here. */
type RefetchResult = { isError?: boolean } | undefined | void;

/**
 * Refetch several queries for one pull. React Query's `refetch()` resolves even when the request
 * failed, so a failure is read off the results and thrown, for `runRefresh` to report.
 */
export async function refetchAll(
  ...refetches: Array<() => Promise<RefetchResult>>
): Promise<void> {
  const results = await Promise.all(refetches.map((refetch) => refetch()));
  if (results.some((result) => result?.isError)) {
    throw new Error("refresh failed");
  }
}

/**
 * Run one pull's refresh and say how it ended (rules 3 and 4): "ok", "failed" (a request
 * errored, the client timeout included), or "timed-out" (still pending at `maxMs`; the spinner
 * comes down anyway and the refresh is left to finish or fail behind it).
 */
export async function runRefresh(
  refresh: () => Promise<unknown>,
  maxMs: number = REFRESH_SPINNER_MAX_MS
): Promise<RefreshOutcome> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const bound = new Promise<RefreshOutcome>((resolve) => {
    timer = setTimeout(() => resolve("timed-out"), maxMs);
  });
  const run = refresh().then(
    (): RefreshOutcome => "ok",
    (): RefreshOutcome => "failed"
  );
  try {
    return await Promise.race([run, bound]);
  } finally {
    clearTimeout(timer);
  }
}
