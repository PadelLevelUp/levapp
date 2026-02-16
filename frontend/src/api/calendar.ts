import type { CalendarEvent } from "@/types";
import { api } from "@/api/client";

export async function getCalendarEvents(
  from: string,
  to: string
): Promise<CalendarEvent[]> {
  const res = await api.get("/api/app/calendar", {
    params: {
      from,
      to,
    },
  });

  return res.data;
}

export async function getCalendarEvent(
  event: CalendarEvent
): Promise<CalendarEvent> {
  const res = await api.get("/api/app/calendar_event", {
    params: {
      model: event.model,
      original_id: event.originalId,
    },
  });

  return res.data;
}