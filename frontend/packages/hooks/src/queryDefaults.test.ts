import { describe, expect, it } from "vitest";
import {
  QUERY_GC_TIME_MS,
  QUERY_RETRY,
  QUERY_STALE_TIME_MS,
  queryClientDefaultOptions,
} from "./queryDefaults";

/** client.query-cache rule 10: the shared policy is pinned, and the options carry exactly it. */
describe("queryDefaults", () => {
  it("pins the three constants", () => {
    expect(QUERY_STALE_TIME_MS).toBe(60_000);
    expect(QUERY_GC_TIME_MS).toBe(10 * 60_000);
    expect(QUERY_RETRY).toBe(1);
  });

  it("carries exactly the constants in queryClientDefaultOptions.queries", () => {
    const queries = queryClientDefaultOptions.queries ?? {};
    expect(Object.keys(queries)).toEqual(["staleTime", "gcTime", "retry"]);
    expect(queries.staleTime).toBe(QUERY_STALE_TIME_MS);
    expect(queries.gcTime).toBe(QUERY_GC_TIME_MS);
    expect(queries.retry).toBe(QUERY_RETRY);
  });
});
