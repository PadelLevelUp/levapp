import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useDashboardWindow } from "./useDashboardWindow";

afterEach(() => vi.useRealTimers());

describe("useDashboardWindow (dashboard.student-setup-guide rule 1)", () => {
  it("[DASHBOARD-STUDENT-SETUP-GUIDE-29] one window per local day, from midnight to 30 days on", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 19, 9, 0));
    const morning = renderHook(() => useDashboardWindow()).result.current;
    vi.setSystemTime(new Date(2026, 10, 19, 21, 30));
    const evening = renderHook(() => useDashboardWindow()).result.current;
    vi.setSystemTime(new Date(2026, 10, 20, 0, 10));
    const next = renderHook(() => useDashboardWindow()).result.current;

    const midnight = new Date(2026, 10, 19, 0, 0);
    expect(morning).toEqual({ from: midnight.toISOString(), to: new Date(midnight.getTime() + 30 * 86400000).toISOString() });
    expect(evening).toEqual(morning);
    expect(next.from).toBe(new Date(2026, 10, 20, 0, 0).toISOString());
  });
});
