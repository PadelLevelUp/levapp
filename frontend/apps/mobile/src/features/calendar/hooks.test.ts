import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import {
  calendarBlockQueryKey,
  eventMutationInvalidationKeys,
  eventMutationOnSuccess,
} from "./hooks";

/**
 * A calendar-block mutation must drop the block's own cache entry (PAD-160).
 *
 * The first attempt invalidated only the class-wide keys, so a successful save
 * left `["calendar-block", id]` cached: the mutation landed on the server, the
 * screen cleared its draft, and the read-only view re-rendered from the stale
 * block — the coach saw the edit revert.
 *
 * `eventMutationOnSuccess` is the function the hooks actually pass to
 * `useMutation`, so this exercises the real invalidation rather than a
 * restatement of the key list.
 */
describe("event mutation invalidation", () => {
  it("includes the block's own query key alongside the class-wide ones", () => {
    expect(eventMutationInvalidationKeys(42)).toEqual([
      ["calendar-events"],
      ["class-instance"],
      ["dashboard"],
      ["calendar-block", 42],
    ]);
  });

  it("invalidates the key useCalendarBlock reads", () => {
    // Ties the mutation to the query: renaming one without the other fails.
    expect(eventMutationInvalidationKeys(7)).toContainEqual(
      calendarBlockQueryKey(7)
    );
  });

  it("asks the query client to invalidate every one of them", () => {
    const queryClient = new QueryClient();
    const invalidate = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockResolvedValue(undefined);

    eventMutationOnSuccess(queryClient)(undefined, { blockId: 9 });

    expect(invalidate.mock.calls.map(([options]) => options?.queryKey)).toEqual([
      ["calendar-events"],
      ["class-instance"],
      ["dashboard"],
      ["calendar-block", 9],
    ]);
  });

  it("uses the id of the block that was mutated, not a fixed one", () => {
    const queryClient = new QueryClient();
    const invalidate = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockResolvedValue(undefined);

    eventMutationOnSuccess(queryClient)(undefined, { blockId: 123 });

    expect(invalidate.mock.calls.map(([options]) => options?.queryKey)).toContainEqual(
      ["calendar-block", 123]
    );
  });
});
