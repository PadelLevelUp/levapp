/**
 * CALENDAR-EVENT-DETAIL-48 (rule 29): the calendar opens the class named by the url the server
 * sends in the coach's "Aula cheia" push, `/calendar?classId=lessoninstance-<id>&date=<YYYY-MM-DD>`.
 * The client reads what the server sends: the url below is the literal the backend test pins.
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
const state = vi.hoisted(() => ({ roles: ["coach"] as string[], mobile: false, events: [] as unknown[] }));
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
vi.mock("@/components/calendar/ClassDetailSheet", () => ({
  ClassDetailSheet: ({ event }: { event: { id: string } | null }) =>
    event ? <div data-testid="class-detail-open" data-id={event.id} /> : null,
}));
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

const DATE = "2026-12-05";
const occurrence = {
  model: "LessonInstance", originalId: 7, id: "lessoninstance-7", type: "class", title: "Aula", date: DATE,
  startTime: "09:00", endTime: "10:00",
} as CalendarEvent;

function renderAt(url: string) {
  // The page freezes the deep link from `window.location.search` at its first render.
  window.history.pushState({}, "", url);
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[url]}>
        <CalendarPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  state.roles = ["coach"];
  state.mobile = false;
  state.events = [occurrence];
});

describe("the 'Aula cheia' push url (CALENDAR-EVENT-DETAIL-48)", () => {
  it("[CALENDAR-EVENT-DETAIL-48] opens the class named by `classId` and `date`", async () => {
    renderAt(`/calendar?classId=lessoninstance-7&date=${DATE}`);
    const sheet = await screen.findByTestId("class-detail-open");
    expect(sheet.getAttribute("data-id")).toBe("lessoninstance-7");
  });

  it("[CALENDAR-EVENT-DETAIL-48] the old `classInstanceId` url opens nothing: the reason the push was dead", async () => {
    renderAt("/calendar?classInstanceId=7");
    await screen.findByTestId("grid");
    expect(screen.queryByTestId("class-detail-open")).toBeNull();
  });
});
