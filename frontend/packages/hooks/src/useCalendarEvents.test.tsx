// @vitest-environment jsdom
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * calendar.view rule 17 (PAD-348): the iOS class screen called
 * `useCalendarEvents("", "")` before the instance had a date, which sent
 * `GET /api/app/calendar?from=&to=` and got a 400 on every class open.
 * The hook now waits for both ends of the range.
 */
const getCalendarEvents = vi.fn(async () => []);
vi.mock("@levelup/api/src/resources/calendar", () => ({
  getCalendarEvents: (from: string, to: string) => getCalendarEvents(from, to),
}));

import { useCalendarEvents } from "./queries";

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

afterEach(() => getCalendarEvents.mockClear());

describe("useCalendarEvents", () => {
  it("makes no request while the range is empty, then one once it is known", async () => {
    const { rerender, result } = renderHook(
      ({ from, to }: { from: string; to: string }) => useCalendarEvents(from, to),
      { wrapper, initialProps: { from: "", to: "" } }
    );
    await new Promise((r) => setTimeout(r, 20));
    expect(getCalendarEvents).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe("idle");

    rerender({ from: "2026-09-16T00:00:00", to: "2026-09-16T23:59:59" });
    await waitFor(() => expect(getCalendarEvents).toHaveBeenCalledTimes(1));
    expect(getCalendarEvents).toHaveBeenCalledWith("2026-09-16T00:00:00", "2026-09-16T23:59:59");
  });

  it("a caller's enabled: false still wins over a known range", async () => {
    renderHook(
      () => useCalendarEvents("2026-09-16T00:00:00", "2026-09-16T23:59:59", { enabled: false }),
      { wrapper }
    );
    await new Promise((r) => setTimeout(r, 20));
    expect(getCalendarEvents).not.toHaveBeenCalled();
  });
});
