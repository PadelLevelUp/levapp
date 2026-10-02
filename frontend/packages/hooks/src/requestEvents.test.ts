/**
 * PAD-488 (B-264, classes.class-requests rule 19): a request change refreshes the calendar with
 * the request lists. Both shells' realtime handlers and every request action call this one
 * function, so what refreshes after a request change is decided here once.
 */
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { queryKeys } from "./queryKeys";
import { isRequestEvent, refreshAfterRequestChange } from "./requestEvents";

function seeded() {
  const qc = new QueryClient();
  const keys = [
    queryKeys.calendarEvents("2026-10-05T00:00:00", "2026-10-11T23:59:59"),
    queryKeys.classRequests,
    queryKeys.classJoinRequests,
    ["class-instance", { id: 1 }],
    queryKeys.dashboard({ from: "a", to: "b" }),
    ["unrelated"],
  ];
  for (const k of keys) qc.setQueryData(k, { v: 1 });
  return { qc, keys };
}

describe("refreshAfterRequestChange (PAD-488)", () => {
  it("marks the calendar, the request lists, the class sheet and the dashboard stale, nothing else", async () => {
    const { qc, keys } = seeded();
    await refreshAfterRequestChange(qc);
    const stale = keys.map((k) => qc.getQueryState(k)?.isInvalidated ?? false);
    expect(stale).toEqual([true, true, true, true, true, false]);
  });

  it("knows the request events, and only them", () => {
    expect(["class_request_changed", "join_request_created", "join_requests_superseded", "join_request_decided"].every(isRequestEvent)).toBe(true);
    expect(isRequestEvent("message_created")).toBe(false);
  });
});
