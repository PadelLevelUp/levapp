/**
 * PAD-664 (calendar.view rule 23): a student's calendar carries the filter at the top on both
 * layouts, the legend as one compact row on a phone (a coach has none there), and "mine" hides
 * only the offers before the views paint. Located by test id (R-013).
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { format } from "date-fns";
import type { CalendarEvent } from "@levelup/types";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "pt" } }),
}));
const state = vi.hoisted(() => ({ roles: ["player"] as string[], mobile: false, events: [] as unknown[] }));
vi.mock("@/auth/AuthContext", () => ({
  useAuth: () => ({ token: "t", user: { id: 5, roles: state.roles } }),
}));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => state.mobile }));
vi.mock("@/api/events", () => ({ subscribeAppEvents: () => () => undefined }));
vi.mock("@levelup/hooks", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useCalendarEvents: () => ({ data: state.events, isPending: false, isPlaceholderData: false }),
  useCoachRoster: () => ({ data: [] }),
  useCoachLevels: () => ({ data: [] }),
}));
vi.mock("@/components/layout/AppLayout", () => ({ AppLayout: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("@/components/calendar/ClassDetailSheet", () => ({ ClassDetailSheet: () => null }));
vi.mock("@/components/calendar/AddClassSheet", () => ({
  AddClassSheet: () => null,
  AddClassRejected: class extends Error {},
  NO_SEASON_COVERS_DATE: "x",
}));
vi.mock("@/components/calendar/AddEventSheet", () => ({ AddEventSheet: () => null }));
vi.mock("@/components/calendar/EventDetailSheet", () => ({ EventDetailSheet: () => null }));
vi.mock("@/components/calendar/RescheduleDialog", () => ({ RescheduleDialog: () => null }));
vi.mock("@/components/calendar/CalendarHeader", () => ({ CalendarHeader: () => null }));
vi.mock("@/components/calendar/CalendarGrid", () => ({
  CalendarGrid: ({ events }: { events: CalendarEvent[] }) => (
    <div data-testid="grid" data-ids={events.map((e) => e.id).join(",")} />
  ),
}));
vi.mock("@/components/calendar/mobile/MobileCalendar", () => ({
  ENABLED_VIEW_MODES: ["day", "week", "month"],
  MobileCalendar: ({ events }: { events: CalendarEvent[] }) => (
    <div data-testid="phone" data-ids={events.map((e) => e.id).join(",")} />
  ),
}));

import CalendarPage from "./CalendarPage";

const today = format(new Date(), "yyyy-MM-dd");
const ev = (id: string, studentRelation: CalendarEvent["studentRelation"]) =>
  ({
    model: "ClassInstance", originalId: 1, id, type: "class", title: id, date: today,
    startTime: "09:00", endTime: "10:00", studentRelation,
  }) as CalendarEvent;

function renderPage() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <CalendarPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  state.roles = ["player"];
  state.mobile = false;
  state.events = [ev("own", "enrolled"), ev("spot", "open_spot"), ev("full", "full"), ev("wait", "waiting")];
  try { window.localStorage.clear(); } catch { /* storage unavailable */ }
});

describe("the student's calendar (PAD-664)", () => {
  it("desktop: the filter is at the top, 'mine' hides only the offers, and the choice is remembered", () => {
    renderPage();
    expect(screen.getByTestId("calendar-student-filter")).toBeTruthy();
    expect(screen.getByTestId("grid").getAttribute("data-ids")).toBe("own,spot,full,wait");
    fireEvent.click(screen.getByTestId("calendar-student-filter-mine"));
    expect(screen.getByTestId("grid").getAttribute("data-ids")).toBe("own,wait");
    expect(window.localStorage.getItem("levapp.calendar.studentFilter.5")).toBe("mine");
  });

  it("phone: the filter and ONE legend row under it, narrowed by the filter", () => {
    state.mobile = true;
    renderPage();
    expect(screen.getByTestId("calendar-student-filter")).toBeTruthy();
    expect(screen.getAllByTestId("calendar-legend")).toHaveLength(1);
    expect(screen.getAllByTestId("calendar-legend-item")).toHaveLength(6);
    fireEvent.click(screen.getByTestId("calendar-student-filter-mine"));
    expect(screen.getAllByTestId("calendar-legend-item")).toHaveLength(4);
    expect(screen.getByTestId("phone").getAttribute("data-ids")).toBe("own,wait");
  });
});

describe("the coach's calendar (PAD-664 changes nothing)", () => {
  it("phone: no filter and no legend", () => {
    state.roles = ["coach"];
    state.mobile = true;
    renderPage();
    expect(screen.queryByTestId("calendar-student-filter")).toBeNull();
    expect(screen.queryByTestId("calendar-legend")).toBeNull();
    expect(screen.getByTestId("phone").getAttribute("data-ids")).toBe("own,spot,full,wait");
  });

  it("desktop: no filter, the toolbar legend stays", () => {
    state.roles = ["coach"];
    renderPage();
    expect(screen.queryByTestId("calendar-student-filter")).toBeNull();
    expect(screen.getByTestId("calendar-legend")).toBeTruthy();
  });
});
