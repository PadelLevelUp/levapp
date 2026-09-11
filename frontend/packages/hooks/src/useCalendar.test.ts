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

/**
 * PAD-248 — calendar.mobile-views rules 2 and 15: month navigation, the month
 * label, the grid range the shells fetch, and a selection that can move to
 * another week without being snapped back by the reselect rule.
 */
describe("useCalendar month", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Wednesday 9 September 2026.
    vi.setSystemTime(new Date("2026-09-09T10:00:00"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("labels the month in the active language", () => {
    const en = renderHook(() => useCalendar([], { language: "en" }));
    expect(en.result.current.monthLabel).toBe("September 2026");
    const ptHook = renderHook(() => useCalendar([], { language: "pt" }));
    expect(ptHook.result.current.monthLabel).toBe("Setembro 2026");
  });

  it("exposes the grid range covering the month (Mon 31 Aug – Sun 4 Oct)", () => {
    const { result } = renderHook(() => useCalendar([]));
    expect(day(result.current.monthRange.start)).toBe("2026-08-31");
    expect(day(result.current.monthRange.end)).toBe("2026-10-04");
    expect(result.current.monthDays).toHaveLength(35);
  });

  it("paging to a month without today selects its 1st and moves the week with it", () => {
    const { result } = renderHook(() => useCalendar([], { language: "en" }));
    act(() => result.current.selectDay(new Date("2026-09-10T00:00:00")));
    act(() => result.current.navigateMonth("next"));
    expect(result.current.monthLabel).toBe("October 2026");
    expect(day(result.current.selectedDay)).toBe("2026-10-01");
    expect(day(result.current.weekStart)).toBe("2026-09-28");
  });

  it("paging back into today's month reselects today", () => {
    const { result } = renderHook(() => useCalendar([]));
    act(() => result.current.navigateMonth("next"));
    act(() => result.current.navigateMonth("prev"));
    expect(day(result.current.selectedDay)).toBe("2026-09-09");
  });

  it("selecting a day in another week keeps it selected and moves the week to it", () => {
    const { result } = renderHook(() => useCalendar([]));
    act(() => result.current.selectDay(new Date("2026-09-24T00:00:00")));
    expect(day(result.current.selectedDay)).toBe("2026-09-24");
    expect(day(result.current.weekStart)).toBe("2026-09-21");
  });

  it("monthEvents holds every event inside the grid range", () => {
    const ev = (id: string, date: string) => ({
      id,
      model: "LessonInstance",
      originalId: 1,
      type: "class" as const,
      isRecurring: false,
      title: id,
      date,
      startTime: "10:00",
      endTime: "11:00",
    });
    const { result } = renderHook(() =>
      useCalendar([ev("a", "2026-08-31"), ev("b", "2026-09-20"), ev("c", "2026-10-05")])
    );
    expect(result.current.monthEvents.map((e) => e.id)).toEqual(["a", "b"]);
  });
});

/**
 * PAD-295 / B-066 — calendar.view rule 16: the initial day and `Hoje` are the
 * club's today. At 23:30 UTC on 9 September Lisbon is already on the 10th
 * (summer, UTC+1); a device in UTC or the Americas still says the 9th.
 */
describe("useCalendar today is the club's today (PAD-295)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.UTC(2026, 8, 9, 23, 30)));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts on the club's today", () => {
    const { result } = renderHook(() => useCalendar([]));
    expect(day(result.current.selectedDay)).toBe("2026-09-10");
  });

  it("goToToday reselects the club's today", () => {
    const { result } = renderHook(() => useCalendar([]));
    act(() => result.current.selectDay(new Date(2026, 8, 3)));
    act(() => result.current.goToToday());
    expect(day(result.current.selectedDay)).toBe("2026-09-10");
  });
});
