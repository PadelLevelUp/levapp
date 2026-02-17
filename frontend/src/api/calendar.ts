import type { CalendarEvent } from "@/types";
import { api } from "@/api/client";
import { USE_MOCK_DATA } from "@/config";
import { mockCalendarEvents } from "@/data/mockData";

export async function getCalendarEvents(
  from: string,
  to: string
): Promise<CalendarEvent[]> {
  if (USE_MOCK_DATA) {
    return mockCalendarEvents.filter(
      (e) => e.date >= from && e.date <= to
    );
  }

  const res = await api.get("/app/calendar", {
    params: { from, to },
  });
  return res.data;
}

export async function getCalendarEvent(
  event: CalendarEvent
): Promise<CalendarEvent> {
  if (USE_MOCK_DATA) {
    const found = mockCalendarEvents.find((e) => e.id === event.id);
    return found ?? event;
  }

  const res = await api.get("/app/calendar_event", {
    params: {
      model: event.model,
      original_id: event.originalId,
    },
  });
  return res.data;
}
