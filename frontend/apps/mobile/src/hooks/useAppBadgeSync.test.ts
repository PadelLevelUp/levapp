import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { setBadgeCountAsync } = vi.hoisted(() => ({
  setBadgeCountAsync: vi.fn(() => Promise.resolve(true)),
}));
vi.mock("expo-notifications", () => ({ setBadgeCountAsync }));

import { useAppBadgeSync, type BadgeSyncInput } from "./useAppBadgeSync";

/**
 * PAD-147 — the iOS icon badge must equal the server unread count at every
 * observation (messaging.push-notifications rule 6). The regression this pins:
 * the old effect only wrote when the COUNT changed, so a badge set by an APNs
 * payload while the app was closed survived any fetch that returned the same
 * number the app already held (0 after the message was read elsewhere).
 */
function renderHook(initial: BadgeSyncInput) {
  let input = initial;
  let renderer!: ReactTestRenderer;
  function Probe() {
    useAppBadgeSync(input);
    return null;
  }
  act(() => {
    renderer = create(createElement(Probe));
  });
  return {
    update(next: BadgeSyncInput) {
      input = next;
      act(() => renderer.update(createElement(Probe)));
    },
    unmount: () => act(() => renderer.unmount()),
  };
}

const loaded = (count: number, dataUpdatedAt: number): BadgeSyncInput => ({
  isAuthenticated: true,
  isSuccess: true,
  count,
  dataUpdatedAt,
});

describe("useAppBadgeSync", () => {
  let hook: ReturnType<typeof renderHook> | undefined;
  beforeEach(() => setBadgeCountAsync.mockClear());
  afterEach(() => hook?.unmount());

  it("does not write while the count is unknown or the user is signed out", () => {
    hook = renderHook({ isAuthenticated: true, isSuccess: false, count: 0, dataUpdatedAt: 0 });
    hook.update({ isAuthenticated: false, isSuccess: true, count: 2, dataUpdatedAt: 10 });
    expect(setBadgeCountAsync).not.toHaveBeenCalled();
  });

  it("writes the first fetched count on a cold launch", () => {
    hook = renderHook(loaded(3, 100));
    expect(setBadgeCountAsync).toHaveBeenCalledTimes(1);
    expect(setBadgeCountAsync).toHaveBeenLastCalledWith(3);
  });

  it("writes again on a fresh fetch even when the count did not change (the PAD-147 case)", () => {
    // Badge was left at 1 by an APNs payload; the app held 0 before and the
    // message was read on another device, so the refetch returns 0 again.
    hook = renderHook(loaded(0, 100));
    expect(setBadgeCountAsync).toHaveBeenCalledTimes(1);
    hook.update(loaded(0, 200)); // foreground refetch / mark-read invalidation
    expect(setBadgeCountAsync).toHaveBeenCalledTimes(2);
    expect(setBadgeCountAsync).toHaveBeenLastCalledWith(0);
  });

  it("does not spam the badge on re-renders without a new fetch", () => {
    hook = renderHook(loaded(2, 100));
    hook.update(loaded(2, 100));
    hook.update(loaded(2, 100));
    expect(setBadgeCountAsync).toHaveBeenCalledTimes(1);
  });

  it("tracks a changed count", () => {
    hook = renderHook(loaded(1, 100));
    hook.update(loaded(0, 150));
    expect(setBadgeCountAsync).toHaveBeenLastCalledWith(0);
    expect(setBadgeCountAsync).toHaveBeenCalledTimes(2);
  });
});
