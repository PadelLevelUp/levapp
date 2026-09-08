// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { format } from "date-fns";
import { useCalendar } from "./useCalendar";

/**
 * calendar.mobile-views rules 1–2: one selected day and one view mode, owned
 * by the shared hook so web and iOS cannot drift on the reselect rule.
 *
 * Criteria: "Selected day is shared across modes",
 *           "Segmented control switches modes and remembers the choice".
 *
 * jsdom only because `renderHook` needs a document to mount into; the hook
 * itself stays platform-neutral (calendar.view rule 12).
 */
const day = (d: Date) => format(d, "yyyy-MM-dd");

describe("useCalendar selected day", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Wednesday 9 September 2026.
    vi.setSystemTime(new Date("2026-09-09T10:00:00"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts on today", () => {
    const { result } = renderHook(() => useCalendar([]));
    expect(day(result.current.selectedDay)).toBe("2026-09-09");
  });

  it("selectDay changes the selection", () => {
    const { result } = renderHook(() => useCalendar([]));
    act(() => result.current.selectDay(new Date("2026-09-11T00:00:00")));
    expect(day(result.current.selectedDay)).toBe("2026-09-11");
  });

  it("paging to a week without today reselects that week's Monday", () => {
    const { result } = renderHook(() => useCalendar([]));
    act(() => result.current.navigateWeek("next"));
    expect(day(result.current.selectedDay)).toBe("2026-09-14");
  });

  it("paging back into today's week reselects today, not Monday", () => {
    const { result } = renderHook(() => useCalendar([]));
    act(() => result.current.navigateWeek("next"));
    act(() => result.current.navigateWeek("prev"));
    expect(day(result.current.selectedDay)).toBe("2026-09-09");
  });

  it("goToToday reselects today", () => {
    const { result } = renderHook(() => useCalendar([]));
    act(() => result.current.navigateWeek("prev"));
    act(() => result.current.goToToday());
    expect(day(result.current.selectedDay)).toBe("2026-09-09");
  });

  it("an initialDate selects that day and its week", () => {
    const { result } = renderHook(() =>
      useCalendar([], { initialDate: new Date("2026-09-22T00:00:00") })
    );
    expect(day(result.current.selectedDay)).toBe("2026-09-22");
    expect(day(result.current.weekStart)).toBe("2026-09-21");
  });
});

describe("useCalendar view mode", () => {
  it("defaults to day", () => {
    const { result } = renderHook(() => useCalendar([]));
    expect(result.current.viewMode).toBe("day");
  });

  it("takes an initial mode and reports changes to the shell", () => {
    const onViewModeChange = vi.fn();
    const { result } = renderHook(() =>
      useCalendar([], { initialViewMode: "week", onViewModeChange })
    );
    expect(result.current.viewMode).toBe("week");
    act(() => result.current.setViewMode("month"));
    expect(result.current.viewMode).toBe("month");
    expect(onViewModeChange).toHaveBeenCalledWith("month");
  });
});
