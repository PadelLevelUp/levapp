// @vitest-environment jsdom
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, keepPreviousData } from "@tanstack/react-query";
import { addDays, format, parseISO } from "date-fns";
import type { CalendarEvent } from "@levelup/types";

/**
 * calendar.mobile-views rule 26 (the continuous Dia): the list's state, shared by web and iOS. Every count in
 * here is a count of calls to the calendar API mock (the one place the screens' requests go through), never a
 * count of renders. The page around the hook is the shells' own: `useCalendar` owns the selected day, the
 * page's week read is on in Semana and off while Dia shows.
 */
const getCalendarEvents = vi.fn();
vi.mock("@levelup/api/src/resources/calendar", () => ({
  getCalendarEvents: (from: string, to: string) => getCalendarEvents(from, to),
}));

import { queryClientDefaultOptions } from "./queryDefaults";
import { useCalendar } from "./useCalendar";
import { useCalendarEvents } from "./queries";
import { useDayList } from "./useDayList";

const day = (y: number, m: number, d: number) => new Date(y, m - 1, d);
const iso = (d: Date) => format(d, "yyyy-MM-dd");

/** One class on every day of the range asked for: the date says which read an event came from. */
function eventsBetween(from: string, to: string): CalendarEvent[] {
  const out: CalendarEvent[] = [];
  for (let d = parseISO(from.slice(0, 10)); iso(d) <= to.slice(0, 10); d = addDays(d, 1)) {
    out.push({
      id: `e-${iso(d)}`,
      type: "class",
      date: iso(d),
      startTime: "18:00",
      endTime: "19:00",
      title: `Class ${iso(d)}`,
      model: "Lesson",
      originalId: 1,
      isRecurring: false,
    } as CalendarEvent);
  }
  return out;
}

/** A read that stays open until the test settles it. */
function gate() {
  let resolve!: (v: CalendarEvent[]) => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<CalendarEvent[]>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function makeWrapper() {
  // The app's own cache policy (a minute fresh), with retries off so a failure shows at once.
  const client = new QueryClient({
    defaultOptions: { queries: { ...queryClientDefaultOptions.queries, retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

/** The page the shells build around the hook: Semana's week read, Dia's list, one selected day. */
function usePage(props: { mode: "day" | "week"; initialDate: Date }) {
  const calendar = useCalendar([], { initialDate: props.initialDate, initialViewMode: props.mode });
  const fetchFrom = format(calendar.weekStart, "yyyy-MM-dd'T'00:00:00");
  const fetchTo = format(addDays(calendar.weekStart, 6), "yyyy-MM-dd'T'23:59:59");
  // client.query-cache rule 5, as both shells do it; and calendar.mobile-views rule 26c: off while Dia shows.
  const page = useCalendarEvents(fetchFrom, fetchTo, {
    placeholderData: keepPreviousData,
    enabled: props.mode !== "day",
  });
  const list = useDayList({
    active: props.mode === "day",
    selectedDay: calendar.selectedDay,
    selectDay: calendar.selectDay,
  });
  return { calendar, page, list };
}

/** The positions a screen would report: every loaded day, 100px apart. */
const positions = (days: Date[]) => days.map((d, i) => ({ date: iso(d), top: i * 100 }));

beforeEach(() => {
  getCalendarEvents.mockReset();
  getCalendarEvents.mockImplementation(async (from: string, to: string) => eventsBetween(from, to));
});
afterEach(() => vi.useRealTimers());

const WEDNESDAY = day(2026, 11, 25);

describe("the continuous Dia's list state", () => {
  it("[CALENDAR-MOBILE-VIEWS-37] at most two reads however far the user scrolls", async () => {
    const { result } = renderHook(() => usePage({ mode: "day", initialDate: WEDNESDAY }), { wrapper: makeWrapper() });

    // Opening Dia: ONE read of whole weeks, 2 before the selected day's week to 4 after it.
    await waitFor(() => expect(result.current.list.status).toBe("ready"));
    expect(getCalendarEvents).toHaveBeenCalledTimes(1);
    expect(getCalendarEvents).toHaveBeenCalledWith("2026-11-08T00:00:00", "2026-12-26T23:59:59");
    expect(result.current.list.days).toHaveLength(49);
    expect(iso(result.current.list.days[0])).toBe("2026-11-08");

    // Scroll through every loaded day, down and back up; the second read comes once, within a week of the end.
    for (let pass = 0; pass < 2; pass++) {
      const down = pass === 0;
      const order = [...result.current.list.days];
      if (!down) order.reverse();
      for (const target of order) {
        const loaded = result.current.list.days;
        await act(async () => {
          result.current.list.scrolledTo({ days: positions(loaded), offset: loaded.findIndex((d) => iso(d) === iso(target)) * 100 });
        });
        expect(iso(result.current.calendar.selectedDay)).toBe(iso(target));
      }
      await waitFor(() => expect(result.current.list.tail).toBe("ready"));
    }
    expect(getCalendarEvents).toHaveBeenCalledTimes(2);
    expect(getCalendarEvents).toHaveBeenLastCalledWith("2026-12-27T00:00:00", "2027-01-23T23:59:59");
    expect(result.current.list.days).toHaveLength(77);

    // Select days inside the range, and reach the end twice: still two.
    for (const d of [day(2026, 12, 1), day(2027, 1, 23), day(2026, 11, 9), day(2027, 1, 23)]) {
      await act(async () => result.current.calendar.selectDay(d));
    }
    expect(getCalendarEvents).toHaveBeenCalledTimes(2);

    // A day outside the range starts over with ONE read.
    await act(async () => result.current.list.goTo(day(2027, 6, 2)));
    await waitFor(() => expect(result.current.list.status).toBe("ready"));
    expect(getCalendarEvents).toHaveBeenCalledTimes(3);
    expect(getCalendarEvents).toHaveBeenLastCalledWith("2027-05-16T00:00:00", "2027-07-03T23:59:59");
    expect(result.current.list.tail).toBe("idle");
  });

  it("[CALENDAR-MOBILE-VIEWS-37] makes no read while Dia is not showing", async () => {
    const { result } = renderHook(() => usePage({ mode: "week", initialDate: WEDNESDAY }), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.page.isSuccess).toBe(true));
    expect(getCalendarEvents).toHaveBeenCalledTimes(1);
    expect(getCalendarEvents).toHaveBeenCalledWith("2026-11-22T00:00:00", "2026-11-28T23:59:59");
    expect(result.current.list.status).toBe("idle");
  });

  it("[CALENDAR-MOBILE-VIEWS-46] a jump outside the range holds its target", async () => {
    const { result } = renderHook(() => usePage({ mode: "day", initialDate: WEDNESDAY }), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.list.status).toBe("ready"));
    const oldDays = result.current.list.days;

    // A slow read for a day outside the range.
    const slow = gate();
    getCalendarEvents.mockImplementationOnce(() => slow.promise);
    const far = day(2027, 3, 10);
    await act(async () => result.current.list.goTo(far));
    // The target is the selected day BEFORE the list moves; the earlier days stay until the read answers.
    expect(iso(result.current.calendar.selectedDay)).toBe("2027-03-10");
    expect(result.current.list.jumping).toBe(true);
    expect(result.current.list.days).toEqual(oldDays);

    // The old days scroll while it waits: nothing is selected by them, a touch included.
    await act(async () => {
      result.current.list.scrolledTo({ days: positions(oldDays), offset: 400, touched: true });
    });
    expect(iso(result.current.calendar.selectedDay)).toBe("2027-03-10");

    // The answer: the target's section is in the list and the list can stand at it.
    await act(async () => slow.resolve(eventsBetween("2027-02-21T00:00:00", "2027-04-10T23:59:59")));
    await waitFor(() => expect(result.current.list.jumping).toBe(false));
    expect(result.current.list.days.map(iso)).toContain("2027-03-10");
    expect(result.current.list.target && iso(result.current.list.target)).toBe("2027-03-10");
    await act(async () => result.current.list.settled());
    expect(result.current.list.target).toBeNull();

    // A failing read for another day: the target stays selected and the error, with its retry, shows.
    const failing = gate();
    getCalendarEvents.mockImplementationOnce(() => failing.promise);
    await act(async () => result.current.list.goTo(day(2027, 9, 1)));
    await act(async () => failing.reject(new Error("offline")));
    await waitFor(() => expect(result.current.list.status).toBe("error"));
    expect(iso(result.current.calendar.selectedDay)).toBe("2027-09-01");
    expect(result.current.list.jumping).toBe(true);
    const before = getCalendarEvents.mock.calls.length;
    await act(async () => result.current.list.retry());
    await waitFor(() => expect(result.current.list.status).toBe("ready"));
    expect(getCalendarEvents.mock.calls.length).toBe(before + 1);
    expect(result.current.list.days.map(iso)).toContain("2027-09-01");
  });

  it("[CALENDAR-MOBILE-VIEWS-47] modes keep their own ranges", async () => {
    const { result, rerender } = renderHook((p: { mode: "day" | "week" }) => usePage({ ...p, initialDate: WEDNESDAY }), {
      wrapper: makeWrapper(),
      initialProps: { mode: "week" },
    });
    const inWeek = (d: string) => d >= "2026-11-22" && d <= "2026-11-28";

    // Semana: its own week read, supplied to the page, and nothing else.
    await waitFor(() => expect(result.current.page.isSuccess).toBe(true));
    expect(getCalendarEvents).toHaveBeenCalledTimes(1);
    expect(result.current.page.data?.every((e) => inWeek(e.date))).toBe(true);

    // Entering Dia: its read is slow; Semana's week is never shown as Dia's range.
    const slow = gate();
    getCalendarEvents.mockImplementationOnce(() => slow.promise);
    rerender({ mode: "day" });
    await waitFor(() => expect(getCalendarEvents).toHaveBeenCalledTimes(2));
    expect(result.current.list.status).toBe("loading");
    expect(result.current.list.days).toEqual([]);
    expect(result.current.list.events).toEqual([]);
    await act(async () => slow.resolve(eventsBetween("2026-11-08T00:00:00", "2026-12-26T23:59:59")));
    await waitFor(() => expect(result.current.list.status).toBe("ready"));
    expect(result.current.list.days).toHaveLength(49);

    // Back to Semana: its grid gets only its week, though Dia's seven weeks are cached; no new read.
    rerender({ mode: "week" });
    await waitFor(() => expect(result.current.page.data).toBeDefined());
    expect(result.current.page.data?.every((e) => inWeek(e.date))).toBe(true);
    expect(result.current.page.data).toHaveLength(7);
    expect(getCalendarEvents).toHaveBeenCalledTimes(2);

    // Dia again, inside the fresh window: its days at once, no new read.
    rerender({ mode: "day" });
    expect(result.current.list.status).toBe("ready");
    expect(result.current.list.days).toHaveLength(49);
    expect(getCalendarEvents).toHaveBeenCalledTimes(2);
  });
});
