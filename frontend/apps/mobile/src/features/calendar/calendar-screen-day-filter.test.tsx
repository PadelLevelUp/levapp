/**
 * calendar.mobile-views rule 26e (iOS): the student's filter applies to every loaded day of Dia, not only the
 * selected one. The real screen is mounted over the real `useCalendar` / `useDayList`; the API is a mock, and the
 * parts of the screen that are not under test (strip, other modes, native chrome) are stubs.
 */
import { createElement, type ReactNode } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { format } from "date-fns";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { queryClientDefaultOptions } from "@levelup/hooks";
import type { CalendarEvent } from "@levelup/types";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k: string) => k, i18n: { language: "en" } }) }));
vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
vi.mock("expo-secure-store", () => ({ getItemAsync: vi.fn(async () => null), setItemAsync: vi.fn() }));
vi.mock("expo-router", () => ({ router: { push: vi.fn() } }));
vi.mock("@/lib/date-locale", () => ({ useDateLocale: () => undefined }));
// A student (no "coach" role): the filter is theirs.
vi.mock("@/auth/AuthContext", () => ({ useAuth: () => ({ user: { id: 7, roles: ["player"] } }) }));
vi.mock("@/lib/view-mode-store", () => ({ readViewMode: async () => "day", writeViewMode: vi.fn() }));
vi.mock("@/components/screen", () => ({ Screen: (p: { children?: ReactNode }) => createElement("Screen", null, p.children) }));
vi.mock("@/features/calendar/DayStrip", () => ({ DayStrip: () => null }));
// Semana's grid: the ids it was handed are what it would draw.
vi.mock("@/features/calendar/WeekView", () => ({
  WeekView: ({ events }: { events: { id: string }[] }) =>
    createElement("View", null, events.map((e) => createElement("View", { key: e.id, testID: `week-card-${e.id}` }))),
}));
vi.mock("@/features/calendar/MonthView", () => ({ MonthView: () => null }));
vi.mock("@/features/calendar/ViewModeControl", () => ({
  ViewModeControl: ({ onChange }: { onChange: (m: "day" | "week") => void }) =>
    createElement(
      "View",
      null,
      createElement("View", { testID: "mode-day", onPress: () => onChange("day") }),
      createElement("View", { testID: "mode-week", onPress: () => onChange("week") })
    ),
}));
vi.mock("@/features/calendar/student-calendar-header", async (orig) => {
  const real = await orig<typeof import("@/features/calendar/student-calendar-header")>();
  return {
    ...real,
    // The control itself is tested in student-calendar-header.test.tsx; here it is two plain buttons.
    StudentCalendarHeader: ({ onChange }: { onChange: (f: "eligible" | "mine") => void }) =>
      createElement("View", { testID: "filter-mine", onPress: () => onChange("mine") }),
  };
});
vi.mock("@/features/calendar/student-filter-store", () => ({
  readStudentFilter: async () => "eligible",
  writeStudentFilter: vi.fn(async () => undefined),
}));
// The pull: the screen's own refresh function is what the test calls.
const pull = vi.hoisted(() => ({ refresh: null as null | (() => Promise<unknown>) }));
vi.mock("@/hooks/usePullToRefresh", () => ({
  usePullToRefresh: (refresh: () => Promise<unknown>) => {
    pull.refresh = refresh;
    return { refreshing: false, onRefresh: vi.fn() };
  },
}));
vi.mock("react-native", async (orig) => ({ ...(await orig<object>()), RefreshControl: () => null }));
vi.mock("@/features/calendar/EventCard", async () => {
  const { createElement: h } = await import("react");
  return {
    EventCard: ({ event, isNext }: { event: { id: string }; isNext?: boolean }) =>
      h("View", { testID: `card-${event.id}`, isNext }),
  };
});
const getCalendarEvents = vi.hoisted(() => vi.fn());
vi.mock("@levelup/api/src/resources/calendar", () => ({
  getCalendarEvents: (from: string, to: string) => getCalendarEvents(from, to),
}));
vi.mock("@levelup/hooks", async (orig) => ({
  ...(await orig<typeof import("@levelup/hooks")>()),
  useCoachLevels: () => ({ data: [] }),
}));

import CalendarScreen from "../../../app/(tabs)/calendar";

// Pinned: Wednesday 25 Nov 2026, midday (only Date is faked, timers stay real).
const PINNED_NOW = new Date(2026, 10, 25, 12, 0, 0);
const today = "2026-11-25";
const later = "2026-11-28";
const ev = (id: string, date: string, extra: Partial<CalendarEvent> = {}) =>
  ({ id, type: "class", date, startTime: "18:00", endTime: "19:00", title: id, model: "Lesson", originalId: 1, ...extra }) as CalendarEvent;
// Two days, each with a class of the student's and an open offer.
const EVENTS = [
  ev("mine-today", today, { studentRelation: "enrolled" }),
  ev("offer-today", today, { studentRelation: "open_spot" }),
  ev("mine-later", later, { studentRelation: "enrolled" }),
  ev("offer-later", later, { studentRelation: "full" }),
];

let root: ReactTestRenderer;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(PINNED_NOW);
});
afterEach(() => {
  act(() => root?.unmount());
  vi.useRealTimers();
});

const inRange = (events: CalendarEvent[]) => (from: string, to: string) =>
  events.filter((e) => e.date >= from.slice(0, 10) && e.date <= to.slice(0, 10));
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
async function mountScreen(events: CalendarEvent[]) {
  getCalendarEvents.mockReset();
  getCalendarEvents.mockImplementation(async (from: string, to: string) => inRange(events)(from, to));
  const client = new QueryClient({
    defaultOptions: { queries: { ...queryClientDefaultOptions.queries, retry: false } },
  });
  await act(async () => {
    root = create(createElement(QueryClientProvider, { client }, createElement(CalendarScreen)), {
      createNodeMock: () => ({ scrollTo: vi.fn() }),
    });
  });
  await flush();
  await flush();
}
const byId = (re: RegExp) => root.root.findAll((n) => typeof n.type === "string" && re.test(String(n.props.testID ?? "")));
const press = (id: string) => act(async () => { byId(new RegExp(`^${id}$`))[0].props.onPress(); });

describe("Dia on iOS: the student's filter", () => {
  it("[CALENDAR-MOBILE-VIEWS-42] applies to every loaded day, not only the selected one", async () => {
    getCalendarEvents.mockReset();
    getCalendarEvents.mockResolvedValue(EVENTS);
    const client = new QueryClient({
      defaultOptions: { queries: { ...queryClientDefaultOptions.queries, retry: false } },
    });
    await act(async () => {
      root = create(createElement(QueryClientProvider, { client }, createElement(CalendarScreen)), {
        createNodeMock: () => ({ scrollTo: vi.fn() }),
      });
    });
    const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    await flush();
    await flush();
    const cards = () =>
      root.root.findAll((n) => typeof n.type === "string" && String(n.props.testID ?? "").startsWith("card-"))
        .map((n) => String(n.props.testID).slice(5)).sort();

    // "all I'm eligible for": both days show their offer.
    expect(cards()).toEqual(["mine-later", "mine-today", "offer-later", "offer-today"]);

    // "only mine": the offers go from both days, the student's own classes stay, and no read was made for it.
    const reads = getCalendarEvents.mock.calls.length;
    await act(async () => {
      root.root.findAll((n) => n.props?.testID === "filter-mine" && typeof n.type === "string")[0].props.onPress();
    });
    expect(cards()).toEqual(["mine-later", "mine-today"]);
    expect(getCalendarEvents).toHaveBeenCalledTimes(reads);
  });

  it("[CALENDAR-MOBILE-VIEWS-44] the next class is searched in today's week only: none left this week names none, one left names that one", async () => {
    const past = ev("past-this-week", "2026-11-23", { startTime: "10:00", endTime: "11:00", status: "scheduled" });
    const nextWeek = ev("next-week", "2026-12-01", { status: "scheduled" });
    await mountScreen([past, nextWeek]);
    expect(byId(/^card-/).map((n) => n.props.isNext)).toEqual([undefined, undefined].map(() => false));
    act(() => root.unmount());

    const thisWeek = ev("left-this-week", "2026-11-26", { status: "scheduled" });
    await mountScreen([past, thisWeek, nextWeek]);
    const next = byId(/^card-/).filter((n) => n.props.isNext).map((n) => String(n.props.testID));
    expect(next).toEqual(["card-left-this-week"]);
  });

  it("[CALENDAR-MOBILE-VIEWS-47] modes keep their own ranges: Semana gets only its week, Dia comes back to its own without a read", async () => {
    const inWeek = ev("in-week", "2026-11-25");
    const outsideWeek = ev("outside-week", "2026-12-10");
    await mountScreen([inWeek, outsideWeek]);
    const diaReads = getCalendarEvents.mock.calls.length;
    expect(diaReads).toBe(1);
    expect(byId(/^card-/)).toHaveLength(2);

    await press("mode-week");
    await flush();
    await flush();
    // Semana read its own week, and drew nothing of Dia's seven weeks.
    expect(getCalendarEvents).toHaveBeenCalledTimes(2);
    expect(byId(/^week-card-/).map((n) => n.props.testID)).toEqual(["week-card-in-week"]);

    await press("mode-day");
    await flush();
    // Dia is back on the range it had, inside the cache's fresh window: no new read.
    expect(getCalendarEvents).toHaveBeenCalledTimes(2);
    expect(byId(/^card-/)).toHaveLength(2);
  });

  it("[CALENDAR-MOBILE-VIEWS-42] the pull refetches Dia's own reads, and fails when one fails", async () => {
    await mountScreen([ev("a", today)]);
    getCalendarEvents.mockClear();
    await act(async () => { await pull.refresh!(); });
    expect(getCalendarEvents).toHaveBeenCalledTimes(1);
    expect(getCalendarEvents.mock.calls[0][0]).toBe("2026-11-08T00:00:00");

    getCalendarEvents.mockImplementation(async () => {
      throw new Error("offline");
    });
    let failed = false;
    await act(async () => {
      await pull.refresh!().catch(() => {
        failed = true;
      });
    });
    expect(failed).toBe(true);
  });
});
