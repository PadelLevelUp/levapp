/**
 * calendar.mobile-views rule 26e (iOS): the student's filter applies to every loaded day of Dia, not only the
 * selected one. The real screen is mounted over the real `useCalendar` / `useDayList`; the API is a mock, and the
 * parts of the screen that are not under test (strip, other modes, native chrome) are stubs.
 */
import { createElement, type ReactNode } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { format } from "date-fns";
import { afterEach, describe, expect, it, vi } from "vitest";
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
vi.mock("@/features/calendar/WeekView", () => ({ WeekView: () => null }));
vi.mock("@/features/calendar/MonthView", () => ({ MonthView: () => null }));
vi.mock("@/features/calendar/ViewModeControl", () => ({ ViewModeControl: () => null }));
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
vi.mock("@/hooks/usePullToRefresh", () => ({ usePullToRefresh: () => ({ refreshing: false, onRefresh: vi.fn() }) }));
vi.mock("react-native", async (orig) => ({ ...(await orig<object>()), RefreshControl: () => null }));
vi.mock("@/features/calendar/EventCard", async () => {
  const { createElement: h } = await import("react");
  return { EventCard: ({ event }: { event: { id: string } }) => h("View", { testID: `card-${event.id}` }) };
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

const today = format(new Date(), "yyyy-MM-dd");
const later = format(new Date(Date.now() + 3 * 86400000), "yyyy-MM-dd");
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
afterEach(() => act(() => root?.unmount()));

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
});
