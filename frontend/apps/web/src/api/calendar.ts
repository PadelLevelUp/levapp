import "@/api/client";
import type { CalendarEvent } from "@/types";
import * as calendarApi from "@levelup/api/src/resources/calendar";
import { USE_MOCK_DATA } from "@/config";
import { mockCalendarEvents } from "@/data/mockData";

export {
  addCalendarBlock,
  getCalendarBlock,
  editCalendarBlock,
  deleteCalendarBlock,
  rescheduleCalendarBlock,
} from "@levelup/api/src/resources/calendar";

export async function getCalendarEvents(
  from: string,
  to: string
): Promise<CalendarEvent[]> {
  if (USE_MOCK_DATA) {
    return mockCalendarEvents.filter(
      (e) => e.date >= from && e.date <= to
    );
  }

  return calendarApi.getCalendarEvents(from, to);
}

export async function getCalendarEvent(
  event: CalendarEvent
): Promise<CalendarEvent> {
  if (USE_MOCK_DATA) {
    const found = mockCalendarEvents.find((e) => e.id === event.id);
    return found ?? event;
  }

  return calendarApi.getCalendarEvent(event);
}
