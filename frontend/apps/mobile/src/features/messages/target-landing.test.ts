/**
 * PAD-475 (messaging.push-notifications rule 12a) — the landing's two guards.
 *
 * B-237: a push target is newer than the cached thread. Stepping the walk on the cached copy
 * while this open's GET is in flight loads OLDER pages for it, or gives the target up.
 * B-238: a retry of a failed scroll reused the index it was given; a refetch that replaced a
 * multi-page cache with the first page left that index out of range and the retry threw.
 */
import { describe, expect, it } from "vitest";
import { retryScrollIndex, shouldStepTarget } from "./target-landing";

describe("the target walk waits for this open's GET (B-237)", () => {
  it("does not step while the open's GET is in flight", () => {
    expect(shouldStepTarget("in-flight")).toBe(false);
  });

  it("steps once the GET has settled, or when none is coming", () => {
    expect(shouldStepTarget("settled")).toBe(true);
    expect(shouldStepTarget("none")).toBe(true);
  });
});

describe("a retried landing scroll finds its row by message id (B-238)", () => {
  const firstPage = Array.from({ length: 30 }, (_, i) => ({ id: 23 + i })); // ids 23..52

  it("resolves the row's index in the list as it is NOW, not as it was", () => {
    // The scroll was asked for index 50 of a 51-row list; the refetch left 30 rows.
    expect(retryScrollIndex(firstPage, 52)).toBe(29);
  });

  it("matches ids across string and number, as the route's param is a string", () => {
    expect(retryScrollIndex(firstPage, "23")).toBe(0);
  });

  it("drops the retry when the row is gone, or when nothing is being landed on", () => {
    expect(retryScrollIndex(firstPage, 7)).toBeNull();
    expect(retryScrollIndex(firstPage, null)).toBeNull();
    expect(retryScrollIndex([], 52)).toBeNull();
  });
});
