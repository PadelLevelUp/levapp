/**
 * PAD-664 (calendar.view rule 23, mobile-views rule 9): the student's filter control and its
 * one compact legend row. The variant is in the test id because Maestro cannot read attributes.
 */
import { studentLegendItems } from "@levelup/config";
import type { CalendarEvent } from "@levelup/types";
import { describe, expect, it, vi } from "vitest";
import { renderNative } from "@/test/render-native";
import { EventCard } from "./EventCard";
import { StudentCalendarHeader } from "./student-calendar-header";
import { CalendarViewerProvider } from "./viewer-context";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
vi.mock("expo-secure-store", () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn() }));

describe("StudentCalendarHeader", () => {
  it("lists every state under 'eligible' and drops the offers under 'mine'", async () => {
    const eligible = await renderNative(<StudentCalendarHeader filter="eligible" onChange={() => undefined} />);
    for (const { variant } of studentLegendItems("eligible")) {
      expect(eligible.byTestId(`calendar-legend-item-${variant}`)).toBeTruthy();
    }
    expect(eligible.byTestId("calendar-legend-item-open-spot")).toBeTruthy();
    expect(eligible.byTestId("calendar-legend-item-full")).toBeTruthy();
    const mine = await renderNative(<StudentCalendarHeader filter="mine" onChange={() => undefined} />);
    expect(mine.queryByTestId("calendar-legend-item-open-spot")).toBeNull();
    expect(mine.queryByTestId("calendar-legend-item-full")).toBeNull();
    expect(mine.byTestId("calendar-legend-item-scheduled")).toBeTruthy();
  });

  it("marks the chosen option selected and reports a change", async () => {
    const onChange = vi.fn();
    const n = await renderNative(<StudentCalendarHeader filter="eligible" onChange={onChange} />);
    expect(n.byTestId("calendar-student-filter-eligible").props.accessibilityState).toEqual({ selected: true });
    expect(n.byTestId("calendar-student-filter-mine").props.accessibilityState).toEqual({ selected: false });
    await n.press("calendar-student-filter-mine");
    expect(onChange).toHaveBeenCalledWith("mine");
  });
});

describe("a full class card for a student", () => {
  it("carries the full chip", async () => {
    const event = {
      model: "LessonInstance",
      originalId: 1,
      id: "lessoninstance-1",
      type: "class",
      title: "Aula",
      date: "2099-10-19",
      startTime: "09:00",
      endTime: "10:00",
      studentRelation: "full",
    } as CalendarEvent;
    const n = await renderNative(
      <CalendarViewerProvider viewer="student">
        <EventCard event={event} />
      </CalendarViewerProvider>
    );
    expect(n.byTestId("calendar-relation-chip")).toBeTruthy();
  });
});
