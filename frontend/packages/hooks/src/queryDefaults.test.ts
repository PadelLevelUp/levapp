import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
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

  // Rule 9: neither app hard-codes a number; both build their QueryClient from the shared options.
  it.each([
    ["apps/web/src/App.tsx", "../../../apps/web/src/App.tsx"],
    ["apps/mobile/app/_layout.tsx", "../../../apps/mobile/app/_layout.tsx"],
  ])("%s builds its QueryClient from queryClientDefaultOptions", (_name, relative) => {
    const here = fileURLToPath(new URL(".", import.meta.url));
    const source = readFileSync(resolve(here, relative), "utf8");
    expect(source).toContain("queryClientDefaultOptions");
    expect(source).not.toContain("staleTime:");
  });
});
