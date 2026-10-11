// @vitest-environment jsdom
import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { lisbonNowMs } from "@levelup/config";

import { joinRefusalMessageKey, useInviteWaitingList, type InviteWaitingListApi } from "./useInviteWaitingList";

/**
 * PAD-577 (notifications.invitations rule 15a): the shared waiting-list offer behind both bubbles.
 * The offer rule itself is `offersWaitingListJoin` (config); this pins the hook's states around it.
 */
const tomorrow = new Date(lisbonNowMs() + 86_400_000).toISOString().slice(0, 19);
const lost = { responded: true, response: "spot_filled", lessonInstanceId: 7, startsAt: tomorrow };

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function fakeApi(rows: Array<{ lessonInstanceId: number; status: string }> = []): InviteWaitingListApi & { join: ReturnType<typeof vi.fn>; leave: ReturnType<typeof vi.fn>; list: ReturnType<typeof vi.fn> } {
  return {
    list: vi.fn(async () => rows as never),
    join: vi.fn(async () => ({ lessonInstanceId: 7, onWaitingList: true }) as never),
    leave: vi.fn(async () => ({ lessonInstanceId: 7, onWaitingList: false }) as never),
  };
}

describe("useInviteWaitingList", () => {
  it("offers the join once the student's lists are known, and a join flips to the on-list state", async () => {
    const api = fakeApi();
    const notify = vi.fn();
    const { result } = renderHook(() => useInviteWaitingList({ metadata: lost, received: true, api, notify }), { wrapper });
    expect(result.current.offersJoin).toBe(false); // lists not loaded yet: no flash of a button
    await waitFor(() => expect(result.current.offersJoin).toBe(true));
    await act(() => result.current.join());
    expect(api.join).toHaveBeenCalledWith({ model: "LessonInstance", originalId: 7 });
    expect(result.current.onWaitingList).toBe(true);
    expect(result.current.offersJoin).toBe(false);
    await act(() => result.current.leave());
    expect(api.leave).toHaveBeenCalledWith(7);
    expect(result.current.onWaitingList).toBe(false);
    expect(notify).not.toHaveBeenCalled();
  });

  it("reads an active place on this class's list as already on it", async () => {
    const api = fakeApi([{ lessonInstanceId: 7, status: "active" }, { lessonInstanceId: 8, status: "active" }]);
    const { result } = renderHook(() => useInviteWaitingList({ metadata: lost, received: true, api, notify: vi.fn() }), { wrapper });
    await waitFor(() => expect(result.current.onWaitingList).toBe(true));
    expect(result.current.offersJoin).toBe(false);
  });

  it("fetches nothing and offers nothing for the sender's own bubble or an invitation not lost to another", async () => {
    for (const [metadata, received] of [[lost, false], [{ ...lost, response: "expired" }, true], [{ ...lost, response: "withdrawn" }, true]] as const) {
      const api = fakeApi();
      const { result } = renderHook(() => useInviteWaitingList({ metadata, received, api, notify: vi.fn() }), { wrapper });
      await new Promise((r) => setTimeout(r, 20));
      expect(api.list).not.toHaveBeenCalled();
      expect(result.current.lostToAnother).toBe(false);
      expect(result.current.offersJoin).toBe(false);
    }
  });

  it("a refused join tells the student with the refusal's own line and withdraws the offer", async () => {
    const api = fakeApi();
    api.join.mockImplementationOnce(async () => { throw { response: { data: { code: "class_closed" } } }; });
    const notify = vi.fn();
    const { result } = renderHook(() => useInviteWaitingList({ metadata: lost, received: true, api, notify }), { wrapper });
    await waitFor(() => expect(result.current.offersJoin).toBe(true));
    await act(() => result.current.join());
    expect(notify).toHaveBeenCalledWith("calendar.joinRequest.refusal.class_closed");
    expect(result.current.offersJoin).toBe(false);
    expect(result.current.onWaitingList).toBe(false);
  });

  it("maps the known refusal codes to their copy and anything else to the generic failure", () => {
    expect(joinRefusalMessageKey({ response: { data: { code: "has_spots" } } })).toBe("calendar.joinRequest.refusal.has_spots");
    expect(joinRefusalMessageKey({ response: { data: { code: "something_new" } } })).toBe("messages.joinWaitingListFailed");
    expect(joinRefusalMessageKey(new Error("network"))).toBe("messages.joinWaitingListFailed");
    expect(joinRefusalMessageKey(undefined)).toBe("messages.joinWaitingListFailed");
  });
});
